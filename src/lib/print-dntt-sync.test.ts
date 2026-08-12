import { describe, it, expect } from "vitest";
import {
  isSamePrintLine,
  diffPrintLine,
  isDnttLechBoQua,
  calcPrintDnttLech,
} from "./print-dntt-sync";
import { calcNHEntryTotal } from "./export-dntt-nh-word";

describe("isSamePrintLine", () => {
  it("khớp khi cả 3 giá trị bằng nhau", () => {
    expect(
      isSamePrintLine(
        { so_luong: 2, don_gia: 300_000, chiet_khau_phan_tram: 0 },
        { so_luong: 2, don_gia: 300_000, chiet_khau_phan_tram: 0 },
      ),
    ).toBe(true);
  });

  it("CK null và 0 coi như bằng nhau", () => {
    expect(
      isSamePrintLine(
        { so_luong: 10, don_gia: 500_000, chiet_khau_phan_tram: null },
        { so_luong: 10, don_gia: 500_000 },
      ),
    ).toBe(true);
  });

  it("lệch đơn giá → khác", () => {
    expect(
      isSamePrintLine(
        { so_luong: 2, don_gia: 600_000 },
        { so_luong: 2, don_gia: 300_000 },
      ),
    ).toBe(false);
  });

  it("lệch CK → khác (cùng SL + đơn giá)", () => {
    expect(
      isSamePrintLine(
        { so_luong: 10, don_gia: 500_000, chiet_khau_phan_tram: 10 },
        { so_luong: 10, don_gia: 500_000, chiet_khau_phan_tram: 0 },
      ),
    ).toBe(false);
  });
});

describe("diffPrintLine", () => {
  it("không có bản DB → không diff (dòng chưa lưu)", () => {
    expect(diffPrintLine("Phát sinh", { so_luong: 2, don_gia: 300_000 }, null)).toBeNull();
    expect(diffPrintLine("Phát sinh", { so_luong: 2, don_gia: 300_000 }, undefined)).toBeNull();
  });

  it("khớp DB → không diff", () => {
    expect(
      diffPrintLine("Nhà hàng A", { so_luong: 10, don_gia: 500_000 }, { so_luong: 10, don_gia: 500_000 }),
    ).toBeNull();
  });

  it("màn hình giữ giá cũ → trả diff cũ/mới", () => {
    const d = diffPrintLine(
      "Phát sinh",
      { so_luong: 2, don_gia: 600_000 },
      { so_luong: 2, don_gia: 300_000 },
    );
    expect(d).toEqual({
      ten: "Phát sinh",
      truoc: { so_luong: 2, don_gia: 600_000 },
      sau: { so_luong: 2, don_gia: 300_000 },
    });
  });
});

describe("isDnttLechBoQua", () => {
  it("ĐNTT cọc → bỏ qua", () => {
    expect(isDnttLechBoQua({ la_coc: true, mo_ta: "Nhà hàng A (tối)" })).toBe(true);
  });

  it("ĐNTT bổ sung → bỏ qua", () => {
    expect(isDnttLechBoQua({ la_coc: false, mo_ta: "[Bổ sung] Nhà hàng A (tối)" })).toBe(true);
  });

  it("ĐNTT thường → so lệch", () => {
    expect(isDnttLechBoQua({ la_coc: false, mo_ta: "Nhà hàng A (tối) - Ngày 4" })).toBe(false);
  });

  it("không có ĐNTT → false", () => {
    expect(isDnttLechBoQua(null)).toBe(false);
    expect(isDnttLechBoQua(undefined)).toBe(false);
  });
});

describe("calcPrintDnttLech", () => {
  it("khớp → không cảnh báo", () => {
    expect(calcPrintDnttLech({ itemsTotal: 5_600_000, dnttSoTien: 5_600_000 })).toEqual({
      lech: 0,
      canhBao: false,
    });
  });

  it("bản in giữ giá cũ trong khi ĐNTT theo giá mới → lệch dương, cảnh báo", () => {
    const r = calcPrintDnttLech({ itemsTotal: 6_200_000, dnttSoTien: 5_600_000 });
    expect(r.lech).toBe(600_000);
    expect(r.canhBao).toBe(true);
  });

  it("bản in ít hơn ĐNTT → lệch âm, vẫn cảnh báo", () => {
    const r = calcPrintDnttLech({ itemsTotal: 5_000_000, dnttSoTien: 5_600_000 });
    expect(r.lech).toBe(-600_000);
    expect(r.canhBao).toBe(true);
  });

  it("trừ phần đã trả trước (cọc ĐNTT khác) trước khi so", () => {
    const r = calcPrintDnttLech({
      itemsTotal: 10_000_000,
      dnttSoTien: 7_000_000,
      soTienCoc: 3_000_000,
    });
    expect(r).toEqual({ lech: 0, canhBao: false });
  });

  it("voucher TẶNG đã trừ khỏi ĐNTT nhưng dòng chính in gross → không cảnh báo", () => {
    const r = calcPrintDnttLech({
      itemsTotal: 5_000_000,
      dnttSoTien: 4_500_000,
      ngoaiDntt: 500_000,
    });
    expect(r).toEqual({ lech: 0, canhBao: false });
  });

  it("phát sinh HDV trả: in trong tổng nhưng ĐNTT công ty loại ra → không cảnh báo", () => {
    // Suất chính 5.000.000 + nước HDV trả 500.000: dòng vẫn in cho NCC thấy đủ
    // suất, nhưng calcNHDnttAmount loại nguoi_tt='hdv' khỏi ĐNTT công ty.
    const r = calcPrintDnttLech({
      itemsTotal: 5_500_000,
      dnttSoTien: 5_000_000,
      ngoaiDntt: 500_000,
    });
    expect(r).toEqual({ lech: 0, canhBao: false });
  });

  it("phát sinh HDV trả + dòng công ty in số cũ → vẫn bắt được phần lệch thật", () => {
    const r = calcPrintDnttLech({
      itemsTotal: 6_100_000, // 5.500.000 đúng + 600.000 in theo giá cũ
      dnttSoTien: 5_000_000,
      ngoaiDntt: 500_000,
    });
    expect(r.lech).toBe(600_000);
    expect(r.canhBao).toBe(true);
  });

  it("ĐNTT cọc → tính lệch nhưng KHÔNG cảnh báo", () => {
    const r = calcPrintDnttLech({
      itemsTotal: 5_600_000,
      dnttSoTien: 2_000_000,
      boQua: true,
    });
    expect(r.lech).toBe(3_600_000);
    expect(r.canhBao).toBe(false);
  });

  it("chưa có ĐNTT sống → không so, không cảnh báo", () => {
    expect(calcPrintDnttLech({ itemsTotal: 5_600_000, dnttSoTien: null })).toEqual({
      lech: 0,
      canhBao: false,
    });
  });

  it("lệch 1đ do làm tròn CK → bỏ qua", () => {
    const r = calcPrintDnttLech({ itemsTotal: 4_500_001, dnttSoTien: 4_500_000 });
    expect(r.lech).toBe(1);
    expect(r.canhBao).toBe(false);
  });

  it("lệch 2đ → đã cảnh báo", () => {
    expect(calcPrintDnttLech({ itemsTotal: 4_500_002, dnttSoTien: 4_500_000 }).canhBao).toBe(true);
  });
});

describe("kịch bản: dòng phát sinh bị sửa đơn giá SAU khi đã tạo ĐNTT", () => {
  // Bữa ăn gồm suất chính + 1 dòng phát sinh 2 suất. OP nhập nhầm đơn giá phát
  // sinh gấp đôi, tạo ĐNTT, rồi hạ đơn giá về đúng và tạo lại ĐNTT. Tab đang mở
  // vẫn giữ giá cũ (localRows/extrasMap chỉ seed 1 lần/đoàn) → bản in ra "Tổng
  // tiền" theo giá cũ trong khi "Số tiền còn thanh toán" theo ĐNTT mới.
  const line = (so_luong: number, don_gia: number) => ({ so_luong, don_gia });
  const DNTT_MOI = 5_600_000;

  it("màn hình giữ giá cũ → tổng in cao hơn, lệch đúng phần chênh → cảnh báo", () => {
    const itemsCu = [line(10, 500_000), line(2, 600_000)];
    expect(calcNHEntryTotal(itemsCu)).toBe(6_200_000);
    const r = calcPrintDnttLech({ itemsTotal: calcNHEntryTotal(itemsCu), dnttSoTien: DNTT_MOI });
    expect(r.lech).toBe(600_000);
    expect(r.canhBao).toBe(true);
  });

  it("in theo số mới nhất trong DB → tổng khớp ĐNTT, hết lệch", () => {
    const itemsMoi = [line(10, 500_000), line(2, 300_000)];
    expect(calcNHEntryTotal(itemsMoi)).toBe(DNTT_MOI);
    expect(calcPrintDnttLech({ itemsTotal: calcNHEntryTotal(itemsMoi), dnttSoTien: DNTT_MOI })).toEqual({
      lech: 0,
      canhBao: false,
    });
  });

  it("dòng phát sinh: so số màn hình với số DB ra đúng chênh lệch cần báo", () => {
    expect(diffPrintLine("Phát sinh", line(2, 600_000), line(2, 300_000))).toEqual({
      ten: "Phát sinh",
      truoc: { so_luong: 2, don_gia: 600_000 },
      sau: { so_luong: 2, don_gia: 300_000 },
    });
  });
});
