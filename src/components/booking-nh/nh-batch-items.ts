// Thu thập booking NH đủ tư cách GỬI HÀNG LOẠT từ dữ liệu ĐÃ LƯU DB.
// Nguồn duy nhất cho: đếm N trên nút (BookingNHTab) + danh sách modal review.
//
// Rule: chỉ email; dựa booking row đã lưu (KHÔNG lấy state đang gõ dở trên card —
// auto-save-on-blur là pattern toàn app, modal review là chốt soát cuối).
// - mode 'first'  : booking_status='chua_gui' → gửi mới (sau gửi → da_gui).
// - mode 'update' : da_gui/nh_xac_nhan + nội dung đổi so với mail đã gửi
//   (isMailDirty qua mail_content_hash) → gửi cập nhật "Re:" cùng thread.
// - Orphan (NH đã rời điều tour) + tàu ngày + đã hủy/không đặt: KHÔNG vào batch.
// - Thiếu email NCC / slot chưa có booking row: vào danh sách với skipReason
//   (hiện lý do, không tick được) — không chặn cả batch.

import { normalizeEmails } from "@/lib/utils";
import { isMailDirty } from "@/lib/mail-content-hash";
import { buildNhMailFields, buildNhSubject, type NhMailInput } from "@/lib/booking-mail/nh-mail";
import type { MenuDayData, BookingNHRow } from "@/hooks/use-booking-nh";

export interface NhBatchContext {
  tenDoan?: string;
  soKhach?: number;
  soKhachLon?: number;
  soKhachEm1?: number;
  soKhachEm2?: number;
  soNoidBo?: number;
  chuThichKhach?: string | null;
  hdvText: string;
  senderName: string;
  senderPhone?: string | null;
}

export interface NhBatchItem {
  key: string;
  bookingId: number | null;
  emailThreadId: string | null;
  ngaySo: number;
  ngayDate: string | null;
  buaAn: "trua" | "toi";
  nhaHangTen: string;
  email: string;
  subject: string;
  mode: "first" | "update";
  input: NhMailInput;
  /** Không gửi được — lý do (thiếu email, chưa có booking row…). */
  skipReason?: string;
  /** Gửi được nhưng nên soát (chưa có món) — mặc định KHÔNG tick. */
  warning?: string;
}

function slotItem(
  day: MenuDayData,
  buaAn: "trua" | "toi",
  ctx: NhBatchContext,
): NhBatchItem | null {
  const nhaHangId = buaAn === "trua" ? day.an_trua_nha_hang_id : day.an_toi_nha_hang_id;
  const nhaHangLoai = buaAn === "trua" ? day.an_trua_nha_hang_loai : day.an_toi_nha_hang_loai;
  if (!nhaHangId || nhaHangLoai === "tau_ngay") return null; // giống guard MealCard

  const booking: BookingNHRow | null = buaAn === "trua" ? day.booking_trua : day.booking_toi;
  const nhaHangTen = (buaAn === "trua" ? day.an_trua_nha_hang_ten : day.an_toi_nha_hang_ten) ?? "—";
  const nhaHangEmail = buaAn === "trua" ? day.an_trua_nha_hang_email : day.an_toi_nha_hang_email;

  // Trạng thái ngoài phạm vi batch → không hiện luôn (flow lẻ vẫn xử được)
  if (booking && ["da_huy", "cho_xac_nhan_huy", "khong_dat"].includes(booking.booking_status)) return null;

  const input: NhMailInput = {
    tenDoan: ctx.tenDoan,
    ngayDate: day.ngay_date,
    buaAn,
    nhaHangId,
    nhaHangTen,
    setMenuId: booking?.set_menu_id ?? null,
    tenSet: booking?.ten_set_snapshot ?? null,
    gia: booking?.gia_snapshot ?? null,
    donVi: booking?.don_vi_snapshot ?? null,
    monList: booking?.mon_an_snapshot ?? [],
    ghiChu: booking?.ghi_chu ?? null,
    prevSnapshot: booking?.mail_sent_snapshot ?? null,
    soKhach: ctx.soKhach,
    soKhachLon: ctx.soKhachLon,
    soKhachEm1: ctx.soKhachEm1,
    soKhachEm2: ctx.soKhachEm2,
    soNoidBo: ctx.soNoidBo,
    chuThichKhach: ctx.chuThichKhach,
    hdvText: ctx.hdvText,
    senderName: ctx.senderName,
    senderPhone: ctx.senderPhone,
  };

  const isFirst = !booking || booking.booking_status === "chua_gui";
  const isDirtyUpdate =
    !!booking &&
    ["da_gui", "nh_xac_nhan"].includes(booking.booking_status) &&
    isMailDirty(booking.sent_at, booking.mail_content_hash, buildNhMailFields(input));
  if (!isFirst && !isDirtyUpdate) return null; // đã gửi + không đổi gì → không cần

  const mode: "first" | "update" = isFirst ? "first" : "update";
  const email = normalizeEmails(nhaHangEmail);

  const base: NhBatchItem = {
    key: `${day.doan_ngay_id}_${buaAn}`,
    bookingId: booking?.id ?? null,
    emailThreadId: booking?.email_thread_id ?? null,
    ngaySo: day.ngay_so,
    ngayDate: day.ngay_date,
    buaAn,
    nhaHangTen,
    email,
    subject: buildNhSubject(input, mode),
    mode,
    input,
  };
  if (!booking?.id) return { ...base, skipReason: "Chưa có booking — mở card để tạo trước" };
  if (!email) return { ...base, skipReason: "Nhà hàng chưa có email" };
  if ((booking.mon_an_snapshot?.length ?? 0) === 0) return { ...base, warning: "Chưa có món/set menu" };
  return base;
}

export function collectNhBatchItems(days: MenuDayData[], ctx: NhBatchContext): NhBatchItem[] {
  const out: NhBatchItem[] = [];
  for (const day of days) {
    for (const bua of ["trua", "toi"] as const) {
      const item = slotItem(day, bua, ctx);
      if (item) out.push(item);
    }
  }
  return out;
}

/**
 * Số item modal sẽ PRE-TICK sẵn — hiện trên nút "Gửi email hàng loạt (N)".
 * Loại cả warning (chưa có món) để N trên nút KHỚP số modal mặc định gửi.
 */
export function countNhBatchSendable(days: MenuDayData[], ctx: NhBatchContext): number {
  return collectNhBatchItems(days, ctx).filter((i) => !i.skipReason && !i.warning).length;
}
