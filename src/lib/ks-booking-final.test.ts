import { describe, it, expect } from "vitest";
import { isKsBookingHuy, ksBookingCanFinal, ksFinalProgress, ksAllFinal } from "./ks-booking-final";

const r = (s: string) => ({ ks_final_status: s });

describe("isKsBookingHuy", () => {
  it("chờ KS xác nhận hủy / đã hủy → đang hủy", () => {
    expect(isKsBookingHuy(r("cho_ks_xac_nhan_huy"))).toBe(true);
    expect(isKsBookingHuy(r("ks_xac_nhan_huy"))).toBe(true);
  });
  it("các trạng thái làm việc bình thường → không phải đang hủy", () => {
    expect(isKsBookingHuy(r("chua_gui"))).toBe(false);
    expect(isKsBookingHuy(r("cho_ks_xac_nhan"))).toBe(false);
    expect(isKsBookingHuy(r("ks_xac_nhan_final"))).toBe(false);
    expect(isKsBookingHuy({})).toBe(false);
  });
});

describe("ksFinalProgress — booking đã hủy KHÔNG nằm ở mẫu số", () => {
  // Đúng ca 29 dòng prod: badge hiện "0/1 Final" cam mãi dù KS đã hủy xong.
  it("chỉ có 1 booking, đã hủy → không còn việc gì (0/0)", () => {
    expect(ksFinalProgress([r("cho_ks_xac_nhan_huy")])).toEqual({ done: 0, total: 0 });
    expect(ksAllFinal([r("ks_xac_nhan_huy")])).toBe(true);
  });

  it("2 booking: 1 đã final, 1 đã hủy → 1/1 (không phải 1/2)", () => {
    expect(ksFinalProgress([r("ks_xac_nhan_final"), r("ks_xac_nhan_huy")])).toEqual({ done: 1, total: 1 });
    expect(ksAllFinal([r("ks_xac_nhan_final"), r("ks_xac_nhan_huy")])).toBe(true);
  });

  it("2 booking: 1 final, 1 chưa gửi → 1/2, chưa xong", () => {
    expect(ksFinalProgress([r("ks_xac_nhan_final"), r("chua_gui")])).toEqual({ done: 1, total: 2 });
    expect(ksAllFinal([r("ks_xac_nhan_final"), r("chua_gui")])).toBe(false);
  });

  it("đoàn không có booking KS nào → coi như xong", () => {
    expect(ksFinalProgress([])).toEqual({ done: 0, total: 0 });
    expect(ksAllFinal([])).toBe(true);
  });

  it("ksBookingCanFinal giữ nguyên thứ tự, chỉ bỏ dòng hủy", () => {
    const rows = [r("chua_gui"), r("cho_ks_xac_nhan_huy"), r("ks_xac_nhan_final")];
    expect(ksBookingCanFinal(rows).map((x) => x.ks_final_status)).toEqual(["chua_gui", "ks_xac_nhan_final"]);
  });
});
