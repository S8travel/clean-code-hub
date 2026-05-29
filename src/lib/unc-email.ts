// Helpers cho việc gửi mail UNC (Uỷ Nhiệm Chi) đến NCC. Tách từ
// UncEmailModal để share giữa single-send (modal preview) và batch-send
// (BatchUncDialog step 2 — bulk send sau khi gắn UNC hàng loạt).

import { format } from "date-fns";
import { vi } from "date-fns/locale";
import { externalSupabase } from "@/lib/supabase-external";
import { BOOKING_CC, type BookingCcType } from "@/lib/booking-cc";
import type { HoaDonUNCRow } from "@/hooks/use-hoa-don-unc";

export interface EmailTarget {
  email: string;
  threadId: string | null;
  /** Subject của email booking gốc — dùng để mail UNC vào cùng thread Gmail. */
  bookingSubject: string | null;
  source: "booking" | "ncc" | "none";
}

export interface UserProfileLite {
  ho_ten?: string | null;
  email?: string | null;
  so_dien_thoai?: string | null;
}

export function fmtVnd(n: number): string {
  return (n ?? 0).toLocaleString("vi-VN") + " VND";
}

// Supabase joined relation có thể trả object hoặc array — lấy phần tử đầu.
function firstRel<T>(v: T | T[] | null | undefined): T | null {
  return Array.isArray(v) ? (v[0] ?? null) : (v ?? null);
}

// 1 phần tử email thô → email sạch:
//  - "Tên người <a@x.com>" → lấy phần trong <> (RFC display-name, OCR/clipboard hay dính)
//  - bỏ dấu nháy " ' thừa
//  - trim
function extractEmail(raw: string): string {
  let t = raw.trim().replace(/["']/g, "");
  const lt = t.indexOf("<");
  if (lt >= 0) {
    t = t.slice(lt + 1);
    const gt = t.indexOf(">");
    if (gt >= 0) t = t.slice(0, gt);
  }
  return t.trim();
}

// DB email field có thể có nhiều email cách nhau bằng newline, tab, dấu chấm
// phẩy, fullwidth comma, hoặc kèm tên người "Tên <email>" / dấu nháy — Resend
// reject. Normalize về dạng "a@x.com, b@y.com" (chỉ giữ phần tử có '@').
export function normalizeEmailList(s: string | null | undefined): string {
  if (!s) return "";
  return s
    .replace(/[\n\r\t;，；]+/g, ",")
    .split(",")
    .map(extractEmail)
    .filter((e) => e.includes("@"))
    .join(", ");
}

// Chọn email từ danh mục khi NCC có nhiều record (nhiều NH/KS cùng 1 NCC):
// ưu tiên record có tên xuất hiện trong mô tả chi phí, không thì lấy record
// đầu tiên có email.
function pickCatalogEmail(
  rows: Array<{ ten: string | null; email: string | null }> | null | undefined,
  moTa: string | null | undefined,
): string | null {
  const list = (rows || []).filter((r) => r?.email);
  if (list.length === 0) return null;
  if (list.length === 1) return list[0].email!;
  const m = (moTa || "").toLowerCase();
  const byName = list.find((r) => r.ten && m.includes(r.ten.toLowerCase()));
  return (byName ?? list[0]).email!;
}

function fmtDate(s: string | null | undefined): string {
  if (!s) return "—";
  try {
    return format(new Date(s + "T00:00:00"), "dd/MM/yyyy", { locale: vi });
  } catch {
    return s;
  }
}

export function ccForLoai(loai: string): readonly string[] {
  const k: BookingCcType | null =
    loai === "khach_san" ? "ks" :
    loai === "nha_hang"  ? "nh" :
    loai === "dich_vu"   ? "dv" :
    loai === "xe"        ? "xe" :
    loai === "visa"      ? "visa" : null;
  return k ? BOOKING_CC[k] : ["s8travel.hddt@gmail.com"];
}

export async function resolveBookingEmail(row: HoaDonUNCRow): Promise<EmailTarget> {
  const { doan_id, nha_cung_cap_id, loai, ten_nha_cung_cap, ref_id } = row;

  try {
    if (loai === "dich_vu" && doan_id && ten_nha_cung_cap) {
      const { data } = await externalSupabase
        .from("doan_booking_dv")
        .select("email_nha_cung_cap, email_thread_id, email_subject, sent_at")
        .eq("doan_id", doan_id)
        .eq("ten_nha_cung_cap", ten_nha_cung_cap)
        .not("sent_at", "is", null)
        .order("sent_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (data?.email_nha_cung_cap)
        return { email: normalizeEmailList(data.email_nha_cung_cap), threadId: data.email_thread_id ?? null, bookingSubject: data.email_subject ?? null, source: "booking" };
    }

    if (loai === "khach_san" && doan_id) {
      const ksId = ref_id ?? null;
      let q = externalSupabase
        .from("doan_booking_ks")
        .select("khach_san_id, email_thread_id, email_subject, ks_final_sent_at, khach_san:khach_san_id(email, nha_cung_cap_id)")
        .eq("doan_id", doan_id)
        .order("ks_final_sent_at", { ascending: false, nullsFirst: false });
      if (ksId != null) q = q.eq("khach_san_id", ksId);
      const { data } = await q;
      type KsJoin = { email: string | null; nha_cung_cap_id: number | null };
      type KsBooking = {
        email_thread_id: string | null;
        email_subject: string | null;
        khach_san: KsJoin | KsJoin[] | null;
      };
      const match = ((data || []) as unknown as KsBooking[]).find((bk) => {
        const ks = firstRel(bk.khach_san);
        if (!ks?.email) return false;
        if (ksId != null) return true;
        if (nha_cung_cap_id != null) return ks.nha_cung_cap_id === nha_cung_cap_id;
        return false;
      });
      const matchKs = match ? firstRel(match.khach_san) : null;
      if (matchKs?.email)
        return { email: normalizeEmailList(matchKs.email), threadId: match!.email_thread_id ?? null, bookingSubject: match!.email_subject ?? null, source: "booking" };
    }

    if (loai === "nha_hang" && doan_id) {
      const { data } = await externalSupabase
        .from("doan_booking_nh")
        .select("email_thread_id, email_subject, final_sent_at, sent_at, nha_hang:nha_hang_id(ten, email, nha_cung_cap_id)")
        .eq("doan_id", doan_id);
      type NhJoin = { ten: string | null; email: string | null; nha_cung_cap_id: number | null };
      type NhBooking = {
        email_thread_id: string | null;
        email_subject: string | null;
        final_sent_at: string | null;
        sent_at: string | null;
        nha_hang: NhJoin | NhJoin[] | null;
      };
      const sent = ((data || []) as unknown as NhBooking[]).filter(
        (bk) => bk.email_subject && firstRel(bk.nha_hang)?.email,
      );
      const ts = (bk: NhBooking) =>
        new Date(bk.final_sent_at || bk.sent_at || 0).getTime();
      sent.sort((a, b) => ts(b) - ts(a));
      const moTaLow = (row.mo_ta || "").toLowerCase();
      const match: NhBooking | undefined =
        (nha_cung_cap_id != null
          ? sent.find((bk) => firstRel(bk.nha_hang)?.nha_cung_cap_id === nha_cung_cap_id)
          : undefined) ||
        sent.find((bk) => {
          const ten = firstRel(bk.nha_hang)?.ten;
          return !!ten && moTaLow.includes(ten.toLowerCase());
        });
      const matchNh = match ? firstRel(match.nha_hang) : null;
      if (match && matchNh?.email)
        return { email: normalizeEmailList(matchNh.email), threadId: match.email_thread_id ?? null, bookingSubject: match.email_subject ?? null, source: "booking" };
    }
  } catch {
    // Fallthrough sang fallback NCC
  }

  // Fallback 1: email từ danh mục NH/KS theo nha_cung_cap_id
  try {
    if (loai === "nha_hang" && nha_cung_cap_id) {
      const { data } = await externalSupabase
        .from("nha_hang")
        .select("ten, email")
        .eq("nha_cung_cap_id", nha_cung_cap_id)
        .not("email", "is", null);
      const email = pickCatalogEmail(data, row.mo_ta);
      if (email) return { email: normalizeEmailList(email), threadId: null, bookingSubject: null, source: "ncc" };
    }
    if (loai === "khach_san" && nha_cung_cap_id) {
      const { data } = await externalSupabase
        .from("khach_san")
        .select("ten, email")
        .eq("nha_cung_cap_id", nha_cung_cap_id)
        .not("email", "is", null);
      const email = pickCatalogEmail(data, row.mo_ta);
      if (email) return { email: normalizeEmailList(email), threadId: null, bookingSubject: null, source: "ncc" };
    }
  } catch {
    // bỏ qua, xuống fallback NCC
  }

  // Fallback 2: nha_cung_cap.email
  if (nha_cung_cap_id) {
    const { data: ncc } = await externalSupabase
      .from("nha_cung_cap")
      .select("email")
      .eq("id", nha_cung_cap_id)
      .maybeSingle();
    if (ncc?.email) return { email: normalizeEmailList(ncc.email), threadId: null, bookingSubject: null, source: "ncc" };
  }
  return { email: "", threadId: null, bookingSubject: null, source: "none" };
}

// Lấy số tiền cấn trừ công nợ của 1 DNTT (= sum payments method='can_tru').
export async function getCanTruAmount(dnttId: number): Promise<number> {
  const { data } = await externalSupabase
    .from("payments")
    .select("so_tien")
    .eq("dntt_id", dnttId)
    .eq("method", "can_tru");
  return (data || []).reduce((s, p) => s + Number(p.so_tien ?? 0), 0);
}

export function buildUncEmailBody(
  row: HoaDonUNCRow,
  canTruAmount: number,
  userProfile: UserProfileLite | null | undefined,
): string {
  const ncc = row.ten_nha_cung_cap || "Quý đối tác";
  // KS: kèm code khách sạn ngay cạnh code đoàn. Bỏ qua nếu trống / sentinel.
  const codeKsRaw = (row.loai === "khach_san" ? row.code_ncc : null)?.trim() || "";
  const codeKsLow = codeKsRaw.toLowerCase();
  const showCodeKs =
    !!codeKsRaw &&
    codeKsLow !== "code doan" &&
    codeKsLow !== "doan" &&
    codeKsLow !== (row.ten_doan || "").toLowerCase();
  const codeKs = showCodeKs ? ` · Code KS: <strong>${codeKsRaw}</strong>` : "";
  const doan = row.ten_doan
    ? `<br>• Đoàn: <strong>${row.ten_doan}</strong>${codeKs}`
    : (showCodeKs ? `<br>• Code KS: <strong>${codeKsRaw}</strong>` : "");
  const ngayTT = fmtDate(row.ngay_can_thanh_toan);
  const hasCanTru = canTruAmount > 0;
  const thucChuyen = Math.max(0, (row.so_tien ?? 0) - canTruAmount);
  const amountLines = hasCanTru
    ? `• Tổng tiền cần thanh toán: <strong>${fmtVnd(row.so_tien)}</strong><br>
  • Cấn trừ công nợ: <strong style="color:#0a3d7c">− ${fmtVnd(canTruAmount)}</strong><br>
  • Số tiền chuyển khoản (theo UNC đính kèm): <strong style="color:#dc2626">${fmtVnd(thucChuyen)}</strong><br>`
    : `• Số tiền: <strong style="color:#dc2626">${fmtVnd(row.so_tien)}</strong><br>`;
  const canTruNote = hasCanTru
    ? `<p>Lưu ý: trong tổng tiền trên, <strong>${fmtVnd(canTruAmount)}</strong> đã được cấn trừ vào công nợ giữa hai bên. Số tiền S8 thực chuyển khoản theo ủy nhiệm chi đính kèm là <strong>${fmtVnd(thucChuyen)}</strong>.</p>`
    : "";
  const heading = row.ten_doan
    ? `S8 Travel xin gửi ủy nhiệm chi cho đoàn <strong>${row.ten_doan}</strong>:`
    : `S8 Travel xin gửi ủy nhiệm chi cho khoản thanh toán sau:`;
  return `<html><body style="font-family:Arial,sans-serif;font-size:14px;color:#1f2937;line-height:1.6">
<p>Kính gửi ${ncc},</p>
<p>${heading}</p>
<div style="background:#f8fafc;border-left:3px solid #0a3d7c;padding:12px 16px;margin:12px 0">
  • Nội dung: <strong>${row.mo_ta ?? ""}</strong><br>
  ${amountLines}
  • Ngày thanh toán: <strong>${ngayTT}</strong>${doan}
</div>
${canTruNote}
<p>File ủy nhiệm chi được đính kèm trong email này. Nếu cần đối chiếu hoặc làm rõ vui lòng phản hồi email giúp S8.</p>
<p>Trân trọng,<br><strong>${userProfile?.ho_ten || "S8 Travel"}</strong>${userProfile?.so_dien_thoai ? `<br>${userProfile.so_dien_thoai}` : ""}</p>
<div style="margin-top:20px;padding:12px 16px;border-top:1px solid #e2e8f0;font-size:13px;color:#374151;line-height:1.6">
  <p style="margin:0 0 6px 0"><strong>THÔNG TIN XUẤT HÓA ĐƠN</strong></p>
  CÔNG TY TNHH DU LỊCH S8 &nbsp;&nbsp;&nbsp; MST: 0402021137<br>
  Đ/C: Tầng 2, Tòa nhà Kim Sơn, Số 18 Phan Thành Tài, Phường Hòa Cường, Thành Phố Đà Nẵng, Việt Nam<br>
  Email: s8travel.hddt@gmail.com
</div>
</body></html>`;
}

export function buildUncEmailSubject(row: HoaDonUNCRow, bookingSubject: string | null): string {
  if (bookingSubject) {
    const stripped = bookingSubject.replace(/^\s*(re:|fwd:)\s*/i, "").trim();
    return `Re: ${stripped}`;
  }
  return `[S8 Travel] Ủy nhiệm chi – ${row.ten_doan || row.mo_ta || ""} – ${row.ten_nha_cung_cap || ""}`.replace(/\s+/g, " ").trim();
}

function bytesToBase64(bytes: Uint8Array): string {
  let bin = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + CHUNK)));
  }
  return btoa(bin);
}

function uncFilename(ncc: string | null, id: number, ext: string): string {
  const safe = (ncc ?? "NCC").replace(/[^\p{L}\p{N}_-]+/gu, "_");
  return `UNC_${safe}_${id}.${ext}`;
}

export async function fetchUncAsBase64(url: string, ncc: string | null, id: number) {
  const res = await fetch(url);
  if (!res.ok) throw new Error("Không tải được file UNC đã upload");
  const blob = await res.blob();
  const buf = await blob.arrayBuffer();
  const cleanUrl = url.split("?")[0];
  const ext = cleanUrl.split(".").pop() || "pdf";
  return { filename: uncFilename(ncc, id, ext), content: bytesToBase64(new Uint8Array(buf)) };
}

/** Convert File → base64 attachment (cho batch send — file còn trong memory,
 *  khỏi re-fetch từ URL). */
export async function fileUncAsBase64(file: File, ncc: string | null, id: number) {
  const buf = await file.arrayBuffer();
  const ext = file.name.split(".").pop() || "pdf";
  return { filename: uncFilename(ncc, id, ext), content: bytesToBase64(new Uint8Array(buf)) };
}
