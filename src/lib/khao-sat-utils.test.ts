import { describe, it, expect } from "vitest";
import { computeKhaoSatAverages, isLowScore, responseAverage } from "./khao-sat-utils";
import type { KhaoSatRow } from "@/hooks/use-khao-sat";

// Base response với 7 tiêu chí = null; override từng key trong test.
function makeRow(scores: Partial<KhaoSatRow>): KhaoSatRow {
  return {
    id: Math.floor(Math.random() * 1e9),
    doan_id: 1,
    ma_doan_snapshot: "TEST",
    ten_khach: "Khách",
    gioi_tinh: null,
    tuoi_range: null,
    nghe_nghiep: null,
    so_dien_thoai: null,
    email: null,
    ngon_ngu: null,
    dg_khach_hang: null,
    dg_lich_trinh: null,
    dg_am_thuc: null,
    dg_luu_tru: null,
    dg_xe: null,
    dg_truong_doan: null,
    dg_huong_dan_vien: null,
    next_trip: null,
    y_kien_khac: null,
    diem_ban: null,
    nguon_thong_tin: null,
    yeu_to_mua: null,
    hdv_ten_snapshot: null,
    truong_doan_ten_snapshot: null,
    created_at: "2026-07-06T00:00:00Z",
    ...scores,
  };
}

describe("computeKhaoSatAverages", () => {
  it("rỗng → soResponse 0, tbChung null, perTieuChi toàn null, soThapDiem 0", () => {
    const r = computeKhaoSatAverages([]);
    expect(r.soResponse).toBe(0);
    expect(r.tbChung).toBeNull();
    expect(r.soThapDiem).toBe(0);
    expect(r.perTieuChi.dg_khach_hang).toBeNull();
    expect(r.perTieuChi.dg_huong_dan_vien).toBeNull();
  });

  it("2 rows điểm cụ thể → TB tiêu chí và TB chung đúng", () => {
    const rows = [
      makeRow({ dg_lich_trinh: 5, dg_huong_dan_vien: 4 }),
      makeRow({ dg_lich_trinh: 4, dg_huong_dan_vien: 3 }),
    ];
    const r = computeKhaoSatAverages(rows);
    expect(r.soResponse).toBe(2);
    // dg_lich_trinh: (5+4)/2 = 4.5
    expect(r.perTieuChi.dg_lich_trinh).toBe(4.5);
    // dg_huong_dan_vien: (4+3)/2 = 3.5
    expect(r.perTieuChi.dg_huong_dan_vien).toBe(3.5);
    // Tiêu chí không được chấm → null
    expect(r.perTieuChi.dg_luu_tru).toBeNull();
    // tbChung = TB điểm-TB-mỗi-phản-hồi: row1=(5+4)/2=4.5, row2=(4+3)/2=3.5 → 4.0
    expect(r.tbChung).toBe(4);
    // Không có điểm <= 2
    expect(r.soThapDiem).toBe(0);
  });

  it("làm tròn 1 chữ số: 3 điểm 5,5,4 → 4.7", () => {
    const rows = [
      makeRow({ dg_lich_trinh: 5 }),
      makeRow({ dg_lich_trinh: 5 }),
      makeRow({ dg_lich_trinh: 4 }),
    ];
    const r = computeKhaoSatAverages(rows);
    // (5+5+4)/3 = 4.6666... → 4.7
    expect(r.perTieuChi.dg_lich_trinh).toBe(4.7);
    expect(r.tbChung).toBe(4.7);
  });

  it("tbChung = TB điểm-TB-mỗi-phản-hồi (khớp 平均分數 phiếu thật), độc lập perTieuChi", () => {
    const rows = [
      makeRow({ dg_khach_hang: 5, dg_lich_trinh: 3 }), // TB phản hồi = 4.0
      makeRow({ dg_khach_hang: 4 }),                    // TB phản hồi = 4.0
      makeRow({ dg_huong_dan_vien: 1 }),                // TB phản hồi = 1.0
    ];
    const r = computeKhaoSatAverages(rows);
    expect(r.perTieuChi.dg_khach_hang).toBe(4.5); // (5+4)/2
    // tbChung = mean(4.0, 4.0, 1.0) = 3.0 (KHÁC macro-per-tiêu-chí = (4.5+3+1)/3=2.83)
    expect(r.tbChung).toBe(3);
  });

  it("tiêu chí toàn null giữ null, tiêu chí có điểm vẫn tính", () => {
    const rows = [
      makeRow({ dg_luu_tru: 3 }),
      makeRow({ dg_luu_tru: 5 }),
    ];
    const r = computeKhaoSatAverages(rows);
    expect(r.perTieuChi.dg_luu_tru).toBe(4);
    expect(r.perTieuChi.dg_lich_trinh).toBeNull();
    expect(r.perTieuChi.dg_huong_dan_vien).toBeNull();
  });

  it("đếm soThapDiem đúng khi có điểm <= 2", () => {
    const rows = [
      makeRow({ dg_lich_trinh: 5, dg_huong_dan_vien: 5 }), // ổn
      makeRow({ dg_lich_trinh: 2 }),                       // thấp (=2)
      makeRow({ dg_luu_tru: 1, dg_am_thuc: 4 }),           // thấp (=1)
      makeRow({ dg_xe: 3 }),                               // ổn
    ];
    const r = computeKhaoSatAverages(rows);
    expect(r.soResponse).toBe(4);
    expect(r.soThapDiem).toBe(2);
  });
});

describe("isLowScore", () => {
  it("true khi có tiêu chí <= 2", () => {
    expect(isLowScore(makeRow({ dg_lich_trinh: 2 }))).toBe(true);
    expect(isLowScore(makeRow({ dg_huong_dan_vien: 1, dg_lich_trinh: 5 }))).toBe(true);
  });
  it("false khi mọi tiêu chí >= 3 hoặc null", () => {
    expect(isLowScore(makeRow({ dg_lich_trinh: 3, dg_huong_dan_vien: 5 }))).toBe(false);
    expect(isLowScore(makeRow({}))).toBe(false);
  });
});

describe("responseAverage", () => {
  it("null khi chưa chấm tiêu chí nào", () => {
    expect(responseAverage(makeRow({}))).toBeNull();
  });
  it("TB 7 điểm non-null của 1 response, làm tròn 1 chữ số", () => {
    // (5 + 4 + 3) / 3 = 4.0
    expect(responseAverage(makeRow({ dg_khach_hang: 5, dg_lich_trinh: 4, dg_am_thuc: 3 }))).toBe(4);
    // (5 + 4) / 2 = 4.5
    expect(responseAverage(makeRow({ dg_xe: 5, dg_truong_doan: 4 }))).toBe(4.5);
    // (2 + 2 + 5) / 3 = 3.0
    expect(responseAverage(makeRow({ dg_khach_hang: 2, dg_lich_trinh: 2, dg_luu_tru: 5 }))).toBe(3);
  });
});
