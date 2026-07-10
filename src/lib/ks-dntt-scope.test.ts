import { describe, it, expect } from "vitest";
import {
  isKsBookingActive, isOwnKsDntt, findForeignKsDntt, formatForeignKsDntt,
  type KsDnttLite,
} from "./ks-dntt-scope";

describe("isKsBookingActive", () => {
  it("đã gửi đặt trước, KS chưa trả lời → còn sống", () => {
    expect(isKsBookingActive({ ks_dat_truoc_status: "cho_ks_xac_nhan", ks_final_status: "chua_gui" })).toBe(true);
  });
  it("KS đã xác nhận đặt trước → còn sống", () => {
    expect(isKsBookingActive({ ks_dat_truoc_status: "ks_xac_nhan", ks_final_status: "chua_gui" })).toBe(true);
  });
  it("chưa gửi gì → không sống", () => {
    expect(isKsBookingActive({ ks_dat_truoc_status: "chua_gui", ks_final_status: "chua_gui" })).toBe(false);
  });

  // Đúng ca làm nút "Hủy booking" hiện lại sau khi đã bấm hủy → gửi mail hủy lần hai.
  it("vừa bấm Hủy booking (chờ KS xác nhận hủy) → KHÔNG còn sống", () => {
    expect(isKsBookingActive({ ks_dat_truoc_status: "ks_xac_nhan", ks_final_status: "cho_ks_xac_nhan_huy" })).toBe(false);
  });
  it("KS đã xác nhận hủy → không sống", () => {
    expect(isKsBookingActive({ ks_dat_truoc_status: "ks_xac_nhan", ks_final_status: "ks_xac_nhan_huy" })).toBe(false);
  });
  it("trang_thai='da_huy' thắng mọi status khác", () => {
    expect(isKsBookingActive({
      ks_dat_truoc_status: "ks_xac_nhan", ks_final_status: "cho_ks_xac_nhan", trang_thai: "da_huy",
    })).toBe(false);
  });
});

const dntt = (o: Partial<KsDnttLite>): KsDnttLite => ({
  id: 1, doan_id: 10, loai: "khach_san", ref_loai: "khach_san", ref_id: 33, ...o,
});

describe("isOwnKsDntt / findForeignKsDntt", () => {
  it("ĐNTT khách sạn của đúng đoàn + đúng KS → của mình", () => {
    expect(isOwnKsDntt(dntt({}), 10, 33)).toBe(true);
  });

  // ĐÂY LÀ BẤT BIẾN GIỮ TIỀN: ĐNTT thanh toán định kỳ gom nhiều đoàn (doan_id = NULL).
  // Coi nó là "của mình" → luồng phí hủy sẽ chia theo paid_amount của CẢ LÔ, và hủy nó
  // sẽ giết phần của đoàn khác. Trước 07/2026 gate dò theo ref nên hoàn toàn không thấy nó.
  it("ĐNTT ĐỊNH KỲ (doan_id=NULL) → KHÔNG phải của mình", () => {
    const dk = dntt({ id: 99, doan_id: null, loai: "dinh_ky", ref_loai: "dinh_ky", ref_id: null });
    expect(isOwnKsDntt(dk, 10, 33)).toBe(false);
    expect(findForeignKsDntt([dntt({}), dk], 10, 33)).toEqual([dk]);
  });

  it("ĐNTT của đoàn KHÁC → không phải của mình", () => {
    expect(isOwnKsDntt(dntt({ doan_id: 11 }), 10, 33)).toBe(false);
  });
  it("ĐNTT của khách sạn KHÁC → không phải của mình", () => {
    expect(isOwnKsDntt(dntt({ ref_id: 34 }), 10, 33)).toBe(false);
  });
  it("ĐNTT đã chuyển sang ngoài tour → không phải của mình (đã tách trước đó)", () => {
    expect(isOwnKsDntt(dntt({ ref_loai: "ngoai_tour_ks" }), 10, 33)).toBe(false);
  });

  it("toàn ĐNTT của mình → không có ĐNTT lạ, không chặn", () => {
    expect(findForeignKsDntt([dntt({ id: 1 }), dntt({ id: 2 })], 10, 33)).toEqual([]);
  });
});

describe("formatForeignKsDntt", () => {
  it("gắn nhãn (định kỳ) để OP biết phải xử lý ở đâu", () => {
    const s = formatForeignKsDntt([
      dntt({ id: 99, doan_id: null, loai: "dinh_ky", ref_loai: "dinh_ky" }),
      dntt({ id: 100, doan_id: 11 }),
    ]);
    expect(s).toBe("#99 (định kỳ), #100");
  });
});
