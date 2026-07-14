// Gom MỌI booking còn sống của 1 đoàn thành danh sách mail hủy để gửi hàng loạt
// (Đợt C). Nguồn duy nhất cho HuyDoanBatchModal.
//
// Vị ngữ "còn sống" PHẢI mirror buildCancelBlockers — tái dùng CHÍNH predicate đã
// export ở doan-cancel-check (isKsCancelled/isKsSent/isTauCancelled/isTauSent),
// KHÔNG viết lại. Lệch = sau khi gửi mail hủy, blocker không về 0 → nút "Hủy
// đoàn" kẹt.
//
// Xe/Visa KHÔNG nằm trong cổng chặn hủy đoàn (isBlocker=false) — mail cho chúng
// là thông báo lịch sự, không ảnh hưởng việc mở khoá nút Hủy.

import { normalizeEmails } from "@/lib/utils";
import { isKsCancelled, isKsSent, isTauCancelled, isTauSent, type KsStatusRow, type NhStatusRow } from "@/lib/doan-cancel-check";
import {
  buildKsHuySubject, buildKsHuyEmailHtml, buildKsHuyMailtoBody, type KsHuyMailInput,
} from "@/lib/booking-mail/ks-huy-mail";
import {
  buildNhHuySubject, buildNhHuyEmailHtml, buildNhHuyMailtoBody, type NhHuyMailInput,
} from "@/lib/booking-mail/nh-huy-mail";
import {
  buildDvHuySubject, buildDvHuyEmailHtml, buildDvHuyMailtoBody, type DvHuyMailInput, type DvHuyDichVu,
} from "@/lib/booking-mail/dv-huy-mail";
import {
  buildTauHuySubject, buildTauHuyEmailHtml, buildTauHuyMailtoBody, type TauHuyMailInput,
} from "@/lib/booking-mail/tau-huy-mail";
import {
  buildXeHuySubject, buildXeHuyEmailHtml, buildXeHuyMailtoBody, type XeHuyMailInput,
} from "@/lib/booking-mail/xe-huy-mail";
import {
  buildVisaHuySubject, buildVisaHuyEmailHtml, buildVisaHuyMailtoBody, type VisaHuyMailInput,
} from "@/lib/booking-mail/visa-huy-mail";

export type HuyKind = "ks" | "nh" | "tau" | "dv" | "xe" | "visa";

// Người gửi resolve muộn (query profile) → tách khỏi input lúc gom, thêm khi dựng nháp.
type WithoutSender<T> = Omit<T, "senderName" | "senderPhone">;

/** Discriminated union: mỗi kind giữ đúng input cho builder của nó. */
export type HuyDraftInput =
  | { kind: "ks"; input: WithoutSender<KsHuyMailInput> }
  | { kind: "nh"; input: WithoutSender<NhHuyMailInput> }
  | { kind: "tau"; input: WithoutSender<TauHuyMailInput> }
  | { kind: "dv"; input: WithoutSender<DvHuyMailInput> }
  | { kind: "xe"; input: WithoutSender<XeHuyMailInput> }
  | { kind: "visa"; input: WithoutSender<VisaHuyMailInput> };

export interface HuyItem {
  /** Ổn định qua các lần rebuild để giữ tick/email OP đã sửa. */
  key: string;
  kind: HuyKind;
  /** DV gom nhiều sibling cùng email → nhiều id; còn lại 1 id. */
  bookingIds: number[];
  nccTen: string;
  email: string;
  /** ks/nh/dv/tau lấy subject gốc để `Re:`; xe/visa = null (không lưu subject). */
  originalSubject: string | null;
  draft: HuyDraftInput;
  /** true = còn chặn cổng hủy đoàn (ks/nh/tau/dv). Xe/visa = false (thông báo). */
  isBlocker: boolean;
  /** Có giá trị = không gửi được (thiếu email) → hiện dòng, không cho tick. */
  skipReason?: string;
}

export interface HuyCollectCtx {
  tenDoan: string;
  /** cho tàu (TauHuyMailInput.soKhach — KHÔNG có trên row). */
  soKhach?: number | null;
  /** cho xe/visa (ngày đi đoàn). */
  ngayDi?: string | null;
  lyDo?: string | null;
}

// ── Lean input rows (đủ field cần, để test không phải dựng nguyên hook type) ──

export interface KsCollectRow {
  id: number;
  ks_dat_truoc_status: string;
  ks_final_status: string;
  khach_san_ten: string;
  khach_san_email: string | null;
  email_subject: string | null;
  ngay_dates: string[];
}

export interface NhBookingLite {
  id: number;
  booking_status: string;
  email_subject: string | null;
}
export interface NhCollectDay {
  doan_ngay_id: number;
  ngay_date: string | null;
  booking_trua: NhBookingLite | null;
  booking_toi: NhBookingLite | null;
  an_trua_nha_hang_ten: string | null;
  an_trua_nha_hang_email: string | null;
  an_trua_nha_hang_loai: string | null;
  an_toi_nha_hang_ten: string | null;
  an_toi_nha_hang_email: string | null;
  an_toi_nha_hang_loai: string | null;
  orphan_trua: { booking: NhBookingLite; nha_hang_ten: string | null; nha_hang_email: string | null } | null;
  orphan_toi: { booking: NhBookingLite; nha_hang_ten: string | null; nha_hang_email: string | null } | null;
}

export interface DvCollectRow {
  id: number;
  ten_nha_cung_cap: string;
  email_nha_cung_cap: string | null;
  dich_vu_list: DvHuyDichVu[];
  booking_status: string;
  email_subject: string | null;
}

export interface TauCollectRow {
  booking_id: number | null;
  ngay_date: string | null;
  ngay_so: number;
  bua_an: "trua" | "toi";
  nha_hang_ten: string;
  nha_hang_email: string | null;
  email_subject: string | null;
  dat_truoc_status: string;
  final_status: string;
}

export interface XeCollectRow {
  id: number;
  booking_status: string;
  tenNhaXe: string;
  email: string | null;
  tenXe: string | null;
  soCho: number | null;
}

export interface VisaCollectRow {
  id: number;
  booking_status: string;
  tenDonVi: string;
  email: string | null;
}

export interface HuyCollectInput {
  ks: KsCollectRow[];
  nhDays: NhCollectDay[];
  dv: DvCollectRow[];
  tau: TauCollectRow[];
  xe: XeCollectRow[];
  visa: VisaCollectRow[];
}

const SKIP_NO_EMAIL = "Thiếu email NCC";
const nz = (e: string | null | undefined) => normalizeEmails(e ?? "");

function mkItem(base: Omit<HuyItem, "skipReason">): HuyItem {
  return base.email ? base : { ...base, skipReason: SKIP_NO_EMAIL };
}

export function collectHuyItems(data: HuyCollectInput, ctx: HuyCollectCtx): HuyItem[] {
  const out: HuyItem[] = [];
  const lyDo = ctx.lyDo ?? null;

  // ── KS ── còn sống = đã gửi & chưa hủy (mirror buildCancelBlockers)
  for (const r of data.ks) {
    const st: KsStatusRow = { ks_dat_truoc_status: r.ks_dat_truoc_status, ks_final_status: r.ks_final_status };
    if (!isKsSent(st) || isKsCancelled(st)) continue;
    out.push(mkItem({
      key: `ks_${r.id}`, kind: "ks", bookingIds: [r.id],
      nccTen: r.khach_san_ten, email: nz(r.khach_san_email), originalSubject: r.email_subject,
      isBlocker: true,
      draft: { kind: "ks", input: { tenDoan: ctx.tenDoan, khachSanTen: r.khach_san_ten, roomDates: r.ngay_dates, lyDo } },
    }));
  }

  // ── NH ── mỗi slot trua/toi + orphan. Loại tàu (xử riêng ở nhánh tau).
  const pushNh = (
    booking: NhBookingLite | null, nhTen: string | null, nhEmail: string | null,
    nhLoai: string | null, buaAn: "trua" | "toi", day: NhCollectDay,
  ) => {
    if (!booking) return;
    const nh: NhStatusRow = { booking_status: booking.booking_status, dat_truoc_status: null, final_status: null, nha_hang: { loai: nhLoai } };
    // isTau lọc ở nhánh tàu; ở đây chỉ NH thường. Còn sống = da_gui/nh_xac_nhan.
    if (nh.nha_hang && (nhLoai === "tau_ngay" || nhLoai === "tau_dem")) return;
    if (booking.booking_status !== "da_gui" && booking.booking_status !== "nh_xac_nhan") return;
    out.push(mkItem({
      key: `nh_${day.doan_ngay_id}_${buaAn}_${booking.id}`, kind: "nh", bookingIds: [booking.id],
      nccTen: nhTen ?? "—", email: nz(nhEmail), originalSubject: booking.email_subject,
      isBlocker: true,
      draft: { kind: "nh", input: { tenDoan: ctx.tenDoan, nhaHangTen: nhTen ?? "", buaAn, ngayDate: day.ngay_date, lyDo } },
    }));
  };
  for (const day of data.nhDays) {
    pushNh(day.booking_trua, day.an_trua_nha_hang_ten, day.an_trua_nha_hang_email, day.an_trua_nha_hang_loai, "trua", day);
    pushNh(day.booking_toi, day.an_toi_nha_hang_ten, day.an_toi_nha_hang_email, day.an_toi_nha_hang_loai, "toi", day);
    // Orphan (NH đã rời điều tour nhưng booking đã gửi) — vẫn là blocker.
    if (day.orphan_trua) pushNh(day.orphan_trua.booking, day.orphan_trua.nha_hang_ten, day.orphan_trua.nha_hang_email, null, "trua", day);
    if (day.orphan_toi) pushNh(day.orphan_toi.booking, day.orphan_toi.nha_hang_ten, day.orphan_toi.nha_hang_email, null, "toi", day);
  }

  // ── Tàu ── còn sống = đã gửi & chưa hủy (dat_truoc/final)
  for (const r of data.tau) {
    if (r.booking_id == null) continue;
    const st: NhStatusRow = { booking_status: "", dat_truoc_status: r.dat_truoc_status, final_status: r.final_status, nha_hang: { loai: "tau_ngay" } };
    if (!isTauSent(st) || isTauCancelled(st)) continue;
    out.push(mkItem({
      key: `tau_${r.booking_id}`, kind: "tau", bookingIds: [r.booking_id],
      nccTen: r.nha_hang_ten, email: nz(r.nha_hang_email), originalSubject: r.email_subject,
      isBlocker: true,
      draft: { kind: "tau", input: { tenDoan: ctx.tenDoan, nhaHangTen: r.nha_hang_ten, ngayDate: r.ngay_date, ngaySo: r.ngay_so, buaAn: r.bua_an, soKhach: ctx.soKhach ?? null, lyDo } },
    }));
  }

  // ── DV ── gom theo email chuẩn hoá (mirror BookingDVTab); dòng thiếu email đứng riêng.
  const dvActive = data.dv.filter((r) => r.booking_status === "cho_xac_nhan" || r.booking_status === "da_xac_nhan");
  const dvGroups = new Map<string, DvCollectRow[]>();
  const dvNoEmail: DvCollectRow[] = [];
  for (const r of dvActive) {
    const k = (r.email_nha_cung_cap ?? "").trim().toLowerCase();
    if (!k) { dvNoEmail.push(r); continue; }
    const g = dvGroups.get(k);
    if (g) g.push(r); else dvGroups.set(k, [r]);
  }
  const pushDv = (rows: DvCollectRow[]) => {
    const primary = rows[0];
    const dichVuList = rows.flatMap((r) => r.dich_vu_list ?? []);
    out.push(mkItem({
      key: `dv_${primary.id}`, kind: "dv", bookingIds: rows.map((r) => r.id),
      nccTen: primary.ten_nha_cung_cap, email: nz(primary.email_nha_cung_cap), originalSubject: primary.email_subject,
      isBlocker: true,
      draft: { kind: "dv", input: { tenDoan: ctx.tenDoan, tenNhaCungCap: primary.ten_nha_cung_cap, dichVuList, lyDo } },
    }));
  };
  for (const rows of dvGroups.values()) pushDv(rows);
  for (const r of dvNoEmail) pushDv([r]); // thiếu email → skipReason tự gắn

  // ── Xe ── thông báo (không chặn). Còn sống = đã gửi & chưa hủy.
  for (const r of data.xe) {
    if (r.booking_status !== "cho_xac_nhan" && r.booking_status !== "da_xac_nhan") continue;
    out.push(mkItem({
      key: `xe_${r.id}`, kind: "xe", bookingIds: [r.id],
      nccTen: r.tenNhaXe, email: nz(r.email), originalSubject: null,
      isBlocker: false,
      draft: { kind: "xe", input: { tenDoan: ctx.tenDoan, tenNhaXe: r.tenNhaXe, tenXe: r.tenXe, soCho: r.soCho, ngayDi: ctx.ngayDi ?? null, lyDo } },
    }));
  }

  // ── Visa ── thông báo (không chặn).
  for (const r of data.visa) {
    if (r.booking_status !== "cho_xac_nhan" && r.booking_status !== "da_xac_nhan") continue;
    out.push(mkItem({
      key: `visa_${r.id}`, kind: "visa", bookingIds: [r.id],
      nccTen: r.tenDonVi, email: nz(r.email), originalSubject: null,
      isBlocker: false,
      draft: { kind: "visa", input: { tenDoan: ctx.tenDoan, tenDonVi: r.tenDonVi, ngayDi: ctx.ngayDi ?? null, lyDo } },
    }));
  }

  return out;
}

export interface HuyDraft {
  subject: string;
  html: string;
  mailtoBody: string;
}

/** Dựng nội dung mail từ item + người gửi (resolve muộn). Thuần. */
export function buildHuyDraft(
  item: HuyItem,
  sender: { name: string; phone: string | null },
): HuyDraft {
  const s = { senderName: sender.name, senderPhone: sender.phone };
  switch (item.draft.kind) {
    case "ks": {
      const i: KsHuyMailInput = { ...item.draft.input, ...s };
      return { subject: buildKsHuySubject(i, item.originalSubject), html: buildKsHuyEmailHtml(i), mailtoBody: buildKsHuyMailtoBody(i) };
    }
    case "nh": {
      const i: NhHuyMailInput = { ...item.draft.input, ...s };
      return { subject: buildNhHuySubject(i, item.originalSubject), html: buildNhHuyEmailHtml(i), mailtoBody: buildNhHuyMailtoBody(i) };
    }
    case "tau": {
      const i: TauHuyMailInput = { ...item.draft.input, ...s };
      return { subject: buildTauHuySubject(i, item.originalSubject), html: buildTauHuyEmailHtml(i), mailtoBody: buildTauHuyMailtoBody(i) };
    }
    case "dv": {
      const i: DvHuyMailInput = { ...item.draft.input, ...s };
      return { subject: buildDvHuySubject(i, item.originalSubject), html: buildDvHuyEmailHtml(i), mailtoBody: buildDvHuyMailtoBody(i) };
    }
    case "xe": {
      const i: XeHuyMailInput = { ...item.draft.input, ...s };
      return { subject: buildXeHuySubject(i), html: buildXeHuyEmailHtml(i), mailtoBody: buildXeHuyMailtoBody(i) };
    }
    case "visa": {
      const i: VisaHuyMailInput = { ...item.draft.input, ...s };
      return { subject: buildVisaHuySubject(i), html: buildVisaHuyEmailHtml(i), mailtoBody: buildVisaHuyMailtoBody(i) };
    }
  }
}
