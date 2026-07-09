import { describe, it, expect } from "vitest";
import { collectNhBatchItems, countNhBatchSendable, type NhBatchContext } from "./nh-batch-items";
import { buildNhMailFields } from "@/lib/booking-mail/nh-mail";
import { hashMailContent } from "@/lib/mail-content-hash";
import type { MenuDayData, BookingNHRow } from "@/hooks/use-booking-nh";

const ctx: NhBatchContext = {
  tenDoan: "DOAN-X", soKhach: 20, soKhachLon: 20,
  hdvText: "HDV A", senderName: "OP B",
};

const booking = (p: Partial<BookingNHRow>): BookingNHRow => ({
  id: 1, doan_id: 1, doan_ngay_id: 10, bua_an: "trua", nha_hang_id: 5,
  set_menu_id: 2, ten_set_snapshot: "Set A", gia_snapshot: 200_000, don_vi_snapshot: "khách",
  mon_an_snapshot: ["Món 1"], ghi_chu: null, booking_status: "chua_gui",
  sent_at: null, sent_by: null, email_thread_id: null, deadline: null,
  mail_content_hash: null, mail_sent_snapshot: null,
  ...p,
} as BookingNHRow);

const day = (p: Partial<MenuDayData>): MenuDayData => ({
  doan_ngay_id: 10, ngay_so: 1, ngay_date: "2026-08-02", thu: null,
  an_trua_nha_hang_id: 5, an_trua_nha_hang_ten: "NH X", an_trua_nha_hang_email: "x@nh.vn",
  an_trua_nha_hang_loai: null, an_trua_set_menu_id: 2,
  an_toi_nha_hang_id: null, an_toi_nha_hang_ten: null, an_toi_nha_hang_email: null,
  an_toi_nha_hang_loai: null, an_toi_set_menu_id: null,
  booking_trua: booking({}), booking_toi: null,
  trua_con_trong_tour: true, toi_con_trong_tour: true,
  orphan_trua: null, orphan_toi: null,
  ...p,
} as MenuDayData);

describe("collectNhBatchItems", () => {
  it("chua_gui → mode first, gửi được", () => {
    const items = collectNhBatchItems([day({})], ctx);
    expect(items).toHaveLength(1);
    expect(items[0].mode).toBe("first");
    expect(items[0].skipReason).toBeUndefined();
    expect(countNhBatchSendable([day({})], ctx)).toBe(1);
  });

  it("da_gui + nội dung đổi (hash lệch) → mode update; hash khớp → loại khỏi batch", () => {
    // Hash tính từ chính input mà collect dựng → khớp = không dirty
    const items0 = collectNhBatchItems([day({})], ctx);
    const matchingHash = hashMailContent(buildNhMailFields(items0[0].input));
    const clean = day({ booking_trua: booking({ booking_status: "da_gui", sent_at: "2026-08-01T00:00:00Z", mail_content_hash: matchingHash }) });
    expect(collectNhBatchItems([clean], ctx)).toHaveLength(0);

    const dirty = day({ booking_trua: booking({ booking_status: "da_gui", sent_at: "2026-08-01T00:00:00Z", mail_content_hash: "khac-hash" }) });
    const items = collectNhBatchItems([dirty], ctx);
    expect(items).toHaveLength(1);
    expect(items[0].mode).toBe("update");
    expect(items[0].subject.startsWith("Re: ")).toBe(true);
  });

  it("thiếu email → skipReason; slot chưa có booking row → skipReason", () => {
    const noEmail = day({ an_trua_nha_hang_email: null });
    expect(collectNhBatchItems([noEmail], ctx)[0].skipReason).toContain("email");
    const noBooking = day({ booking_trua: null });
    expect(collectNhBatchItems([noBooking], ctx)[0].skipReason).toContain("booking");
    expect(countNhBatchSendable([noEmail, noBooking], ctx)).toBe(0);
  });

  it("chưa có món → warning (tick tay được, mặc định không tick, KHÔNG đếm vào N trên nút)", () => {
    const empty = day({ booking_trua: booking({ mon_an_snapshot: [] }) });
    const items = collectNhBatchItems([empty], ctx);
    expect(items[0].warning).toContain("món");
    expect(items[0].skipReason).toBeUndefined();
    expect(countNhBatchSendable([empty], ctx)).toBe(0); // khớp số modal pre-tick
  });

  it("da_huy / khong_dat / tàu ngày → không vào batch", () => {
    expect(collectNhBatchItems([day({ booking_trua: booking({ booking_status: "da_huy" }) })], ctx)).toHaveLength(0);
    expect(collectNhBatchItems([day({ booking_trua: booking({ booking_status: "khong_dat" }) })], ctx)).toHaveLength(0);
    expect(collectNhBatchItems([day({ an_trua_nha_hang_loai: "tau_ngay" })], ctx)).toHaveLength(0);
  });
});
