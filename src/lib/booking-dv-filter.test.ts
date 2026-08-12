import { describe, it, expect } from "vitest";
import {
  canGuiBookingDV,
  lyDoKhongBookingDV,
  type BookingDVCanhDiem,
} from "./booking-dv-filter";

const cd = (o: Partial<BookingDVCanhDiem> = {}): BookingDVCanhDiem => ({
  loai: "dich_vu",
  co_phi: true,
  khach_san_id: null,
  khong_can_booking: false,
  ...o,
});

describe("canGuiBookingDV", () => {
  it("dịch vụ có phí, không gắn KS, không tắt cờ → vẫn gửi booking như cũ", () => {
    expect(canGuiBookingDV(cd())).toBe(true);
    expect(lyDoKhongBookingDV(cd())).toBeNull();
  });

  it("cảnh điểm thường (loai='canh_diem') → không booking", () => {
    expect(canGuiBookingDV(cd({ loai: "canh_diem" }))).toBe(false);
    expect(lyDoKhongBookingDV(cd({ loai: "canh_diem" }))).toBe("khong_co_phi");
  });

  it("dịch vụ không có phí → không booking", () => {
    expect(canGuiBookingDV(cd({ co_phi: false }))).toBe(false);
    expect(canGuiBookingDV(cd({ co_phi: null }))).toBe(false);
  });

  it("tàu/day-use (khach_san_id) → booking bên tab KS, KHÔNG hiện ở Booking DV", () => {
    const tau = cd({ khach_san_id: 12 });
    expect(canGuiBookingDV(tau)).toBe(false);
    expect(lyDoKhongBookingDV(tau)).toBe("day_use");
  });

  it("khach_san_id = 0 vẫn tính là có liên kết (dùng != null, không dùng falsy)", () => {
    expect(canGuiBookingDV(cd({ khach_san_id: 0 }))).toBe(false);
  });

  it("dịch vụ đặt qua Zalo (khong_can_booking) → không hiện ở Booking DV", () => {
    const zalo = cd({ khong_can_booking: true });
    expect(canGuiBookingDV(zalo)).toBe(false);
    expect(lyDoKhongBookingDV(zalo)).toBe("dat_ngoai_he_thong");
  });

  it("day-use được ưu tiên báo lý do trước cờ đặt ngoài hệ thống", () => {
    expect(lyDoKhongBookingDV(cd({ khach_san_id: 12, khong_can_booking: true }))).toBe("day_use");
  });

  it("cột cờ chưa có (đoàn/danh mục cũ, undefined) → giữ hành vi cũ là có booking", () => {
    const cu: BookingDVCanhDiem = { loai: "dich_vu", co_phi: true, khach_san_id: null };
    expect(canGuiBookingDV(cu)).toBe(true);
    expect(canGuiBookingDV({ ...cu, khong_can_booking: null })).toBe(true);
  });
});
