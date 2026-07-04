import { describe, it, expect } from "vitest";
import { computeInitialDinhKyKsIds } from "./ks-dinh-ky";

// ngayKsMap: doan_ngay.id → khach_san_id
const ngayKsMap = {
  10: 66,   // ngày trỏ tới KS 66 (Rosamia)
  11: 66,
  20: 92,   // ngày trỏ tới KS 92 (Rosemary)
  30: 500,  // KS thường
};

describe("computeInitialDinhKyKsIds", () => {
  it("seed từ dòng chi phí đã đánh dấu định kỳ trong DB", () => {
    const rows = [
      { thanh_toan_dinh_ky: true, ref_doan_ngay_id: 10 },
      { thanh_toan_dinh_ky: false, ref_doan_ngay_id: 30 },
    ];
    const r = computeInitialDinhKyKsIds(rows, ngayKsMap, []);
    expect([...r]).toEqual([66]);
  });

  it("KS có cờ mặc định + CHƯA có dòng nào → seed (đoàn mới)", () => {
    const r = computeInitialDinhKyKsIds(
      [],
      ngayKsMap,
      [
        { id: 66, thanh_toan_dinh_ky_mac_dinh: true },
        { id: 500, thanh_toan_dinh_ky_mac_dinh: false },
      ],
    );
    expect(r.has(66)).toBe(true);
    expect(r.has(500)).toBe(false);
  });

  it("KS có cờ mặc định NHƯNG đã có dòng (OP tắt định kỳ) → KHÔNG hồi sinh", () => {
    const rows = [
      // OP đã tắt định kỳ cho KS 66 trong đoàn này
      { thanh_toan_dinh_ky: false, ref_doan_ngay_id: 10 },
      { thanh_toan_dinh_ky: false, ref_doan_ngay_id: 11 },
    ];
    const r = computeInitialDinhKyKsIds(rows, ngayKsMap, [
      { id: 66, thanh_toan_dinh_ky_mac_dinh: true },
    ]);
    expect(r.has(66)).toBe(false);
  });

  it("KS có cờ mặc định + đã có dòng ĐÃ định kỳ → vẫn định kỳ (từ nguồn DB)", () => {
    const rows = [{ thanh_toan_dinh_ky: true, ref_doan_ngay_id: 10 }];
    const r = computeInitialDinhKyKsIds(rows, ngayKsMap, [
      { id: 66, thanh_toan_dinh_ky_mac_dinh: true },
    ]);
    expect(r.has(66)).toBe(true);
  });

  it("gộp cả 2 nguồn: DB định kỳ (KS 66) + master mặc định chưa có dòng (KS 92)", () => {
    const rows = [{ thanh_toan_dinh_ky: true, ref_doan_ngay_id: 10 }];
    const r = computeInitialDinhKyKsIds(rows, ngayKsMap, [
      { id: 66, thanh_toan_dinh_ky_mac_dinh: true },
      { id: 92, thanh_toan_dinh_ky_mac_dinh: true },
    ]);
    expect([...r].sort((a, b) => a - b)).toEqual([66, 92]);
  });

  it("bỏ qua dòng ref_doan_ngay_id null hoặc ngày không map được KS", () => {
    const rows = [
      { thanh_toan_dinh_ky: true, ref_doan_ngay_id: null },
      { thanh_toan_dinh_ky: true, ref_doan_ngay_id: 999 }, // không có trong map
    ];
    const r = computeInitialDinhKyKsIds(rows, ngayKsMap, []);
    expect(r.size).toBe(0);
  });
});
