// Guard "Đổi khách sạn có phí hủy" — Điều tour. (Tầng 2: booking KS có vòng đời.)
//
// Vấn đề gốc: dòng chi phí KS in-tour KHÔNG lưu khach_san_id — danh tính KS suy từ
// ref_doan_ngay_id → doan_ngay.khach_san_id. OP đổi KS của ngày → cùng dòng chi phí
// (và TIỀN đã trả cho KS cũ) tự "nhảy" sang KS mới → rối tiền (ca Wyndham/Crowne 07/2026).
//
// Guard: TRƯỚC khi autosave flip doan_ngay.khach_san_id, phát hiện KS cũ biến mất hẳn
// khỏi tour mà còn ĐNTT sống → tách sạch (detach) rồi mới lưu:
//   - ĐNTT ĐÃ TRẢ  → chuyển sang cụm "đã hủy" (dòng [Phí hủy], giữ payment) +
//     công nợ con_du = (đã trả − phí hủy).
//   - ĐNTT CHƯA trả → tự hủy kèm log (đã chốt với user 07/07/2026).
//   - Dòng chi phí ngày: hết allocation sống → xóa; còn (định kỳ/voucher edge) →
//     convert giữ dấu tiền (KHÔNG xóa — tránh CASCADE mất allocation).
//
// Tầng 2 (08/07/2026): booking KS mang vòng đời — doan_booking_ks.trang_thai='da_huy'
// + phi_huy + ly_do_huy + huy_luc/huy_boi + cong_no_id; các dòng cụm hủy đánh dấu
// doan_chi_phi.ks_huy=true. Dải "Đã hủy" ở tab Chi phí đọc từ đây (gập mặc định);
// panel KS ngoài tour LOẠI dòng ks_huy. Mode 'resolve' = hoàn tất phí hủy cho booking
// đã "Để sau" (phi_huy còn NULL).
//
// KS cũ vẫn còn ngày khác trong tour (giảm bớt đêm) → KHÔNG kích hoạt guard; ca đó
// dùng ô "Phí hủy" ở modal "Xử lý chênh lệch thừa" (KSAggCommitModal).

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { externalSupabase } from "@/lib/supabase-external";
import { planDoiKsPhiHuy, type DoiKsPaidDntt } from "@/lib/doi-ks-phi-huy";
import { buildKsNgoaiTourPayload } from "@/lib/ks-ngoai-tour";
import { REF_LOAI_NGOAI_TOUR } from "@/lib/ks-ngoai-tour-print";
import { useCancelDNTT, recalcChiPhiStatus } from "@/hooks/use-dntt";
import { useAuth } from "@/hooks/use-auth";
import { findForeignKsDntt, formatForeignKsDntt, isKsBookingActive } from "@/lib/ks-dntt-scope";
import type { DayLocal, DoanNgayRow } from "@/hooks/use-dieu-tour";

/** Booking KS cũ đang "sống" (đã gửi mail, chưa vào luồng hủy) — đủ dữ liệu dựng mail hủy. */
export interface KsBookingHuyInfo {
  bookingId: number;
  /** Email KS (master). Rỗng → modal ẩn tuỳ chọn gửi mail, chỉ đổi trạng thái. */
  email: string | null;
  emailThreadId: string | null;
  /** Subject mail đặt-trước đã gửi — mail hủy dùng `Re: <subject>` để cùng thread Gmail. */
  emailSubject: string | null;
  datTruocStatus: string;
  finalStatus: string;
  /** Các đêm KS cũ đang giữ (YYYY-MM-DD, sort) — dựng dòng "Ngày đã đặt" trong mail. */
  roomDates: string[];
}

export interface KsPhiHuyPending {
  oldKsId: number;
  oldKsName: string;
  oldKsNccId: number | null;
  oldKsNccTen: string | null;
  /** doan_ngay.id các ngày đang gắn KS cũ (toàn đoàn, mọi nhóm). Rỗng với mode resolve. */
  dayIds: number[];
  paidTotal: number;
  paidByDntt: DoiKsPaidDntt[];
  /** ĐNTT sống chưa trả đồng nào (cho_duyet/da_duyet) — sẽ tự hủy kèm log. */
  unpaidDnttIds: number[];
  /** Có ĐNTT sống (đã trả hoặc chưa) → cần tách tiền. false = chỉ dính booking. */
  hasMoney: boolean;
  /** Booking đã gửi mail & chưa hủy → cần báo KS cũ. null = không cần (chưa gửi / đã hủy). */
  booking: KsBookingHuyInfo | null;
}

// isKsBookingActive / isOwnKsDntt: xem lib/ks-dntt-scope.ts (thuần, có test).
// Re-export để các importer cũ (BookingKSTab) không phải đổi đường dẫn.
export { isKsBookingActive };

/** Tên + NCC + email khách sạn (khachSanList của Điều tour không có nha_cung_cap_id). */
async function fetchKsInfo(ksId: number): Promise<{
  ten: string; nccId: number | null; nccTen: string | null; email: string | null;
}> {
  const { data: ks } = await externalSupabase
    .from("khach_san")
    .select("id, ten, email, nha_cung_cap_id, nha_cung_cap:nha_cung_cap_id(ten)")
    .eq("id", ksId)
    .maybeSingle();
  const nccJoined = ks?.nha_cung_cap as { ten: string | null } | null;
  return {
    ten: ks?.ten ?? `KS #${ksId}`,
    nccId: ks?.nha_cung_cap_id ?? null,
    nccTen: nccJoined?.ten ?? null,
    email: ks?.email ?? null,
  };
}

/**
 * KS cũ dính ĐNTT không thuộc riêng đoàn này (điển hình: thanh toán định kỳ gom nhiều
 * đoàn) → không đoán mò được cách tách tiền, phải chặn.
 *
 * Mang theo `oldKsId` + `dayIds` để caller HOÀN TÁC đúng những ngày đó rồi lưu tiếp
 * phần còn lại. Nếu chỉ ném lỗi trần, autosave sẽ chết cả tour: mọi sửa đổi khác
 * (cảnh điểm, số khách…) cũng không lưu được và toast nổ lại mỗi lần gõ.
 */
export class KsDnttNgoaiPhamViError extends Error {
  constructor(message: string, readonly oldKsId: number, readonly dayIds: number[]) {
    super(message);
    this.name = "KsDnttNgoaiPhamViError";
  }
}

/** ĐNTT sống, đủ trường để phân loại "của riêng KS/đoàn này" hay không. */
interface LiveDnttLite {
  id: number;
  doan_id: number | null;
  loai: string | null;
  ref_loai: string | null;
  ref_id: number | null;
  paid_amount: number;
  trang_thai_duyet: string | null;
}

/**
 * Mọi ĐNTT còn sống đang dính tới tiền của KS cũ trong các ngày `dayIds`.
 *
 * Gộp HAI đường, vì thiếu một trong hai đều mất dấu tiền:
 *  (a) dòng chi phí KS in-tour của các ngày đó → dntt_allocations → ĐNTT.
 *      Bắt được ĐNTT ĐỊNH KỲ (doan_id = NULL, ref_loai='dinh_ky') mà cách dò theo
 *      ref hoàn toàn không thấy.
 *  (b) ĐNTT trỏ thẳng (doan_id, ref_loai='khach_san', ref_id=ksId).
 *      Bắt được ĐNTT KS tạo KHÔNG kèm allocation nào (nhánh `allocations: allocs.length
 *      > 0 ? allocs : undefined` ở use-ks-section) — đường (a) sẽ bỏ sót.
 */
async function fetchLiveDnttForKsDays(
  doanId: number, ksId: number, dayIds: number[],
): Promise<LiveDnttLite[]> {
  const ids = new Set<number>();

  if (dayIds.length > 0) {
    // Dòng chi phí KS in-tour của các ngày (bỏ dòng day-use wrapper + ngoài tour).
    const { data: cps, error: cpErr } = await externalSupabase
      .from("doan_chi_phi")
      .select("id")
      .eq("doan_id", doanId)
      .eq("danh_muc", "khach_san")
      .eq("ngoai_tour", false)
      .is("ref_doan_ngay_item_id", null)
      .in("ref_doan_ngay_id", dayIds);
    if (cpErr) throw cpErr;
    const cpIds = (cps ?? []).map((r) => r.id as number);
    if (cpIds.length > 0) {
      const { data: allocs, error: aErr } = await externalSupabase
        .from("dntt_allocations")
        .select("dntt_id")
        .in("chi_phi_id", cpIds);
      if (aErr) throw aErr;
      (allocs ?? []).forEach((a) => ids.add(a.dntt_id as number));
    }
  }

  const { data: byRef, error: refErr } = await externalSupabase
    .from("dntt_with_payment_status")
    .select("id")
    .eq("doan_id", doanId)
    .eq("ref_loai", "khach_san")
    .eq("ref_id", ksId)
    .not("trang_thai_duyet", "in", "(da_huy,tu_choi)");
  if (refErr) throw refErr;
  (byRef ?? []).forEach((d) => { if (d.id != null) ids.add(d.id as number); });

  if (ids.size === 0) return [];

  const { data: dntts, error: dErr } = await externalSupabase
    .from("dntt_with_payment_status")
    .select("id, doan_id, loai, ref_loai, ref_id, paid_amount, trang_thai_duyet")
    .in("id", [...ids])
    .not("trang_thai_duyet", "in", "(da_huy,tu_choi)");
  if (dErr) throw dErr;

  return (dntts ?? [])
    .filter((d): d is typeof d & { id: number } => d.id != null)
    .map((d) => ({
      id: d.id,
      doan_id: d.doan_id ?? null,
      loai: d.loai ?? null,
      ref_loai: d.ref_loai ?? null,
      ref_id: d.ref_id ?? null,
      paid_amount: Number(d.paid_amount ?? 0),
      trang_thai_duyet: d.trang_thai_duyet ?? null,
    }));
}

/** Booking KS cũ + các đêm nó đang giữ. null khi không có booking sống cần báo hủy. */
async function fetchKsBookingHuyInfo(
  doanId: number, ksId: number, dayIds: number[], email: string | null,
): Promise<KsBookingHuyInfo | null> {
  const { data: bkRaw, error } = await externalSupabase
    .from("doan_booking_ks")
    .select("id, ks_dat_truoc_status, ks_final_status, email_thread_id, trang_thai")
    .eq("doan_id", doanId)
    .eq("khach_san_id", ksId)
    .maybeSingle();
  if (error) throw error;
  if (!bkRaw || !isKsBookingActive(bkRaw)) return null;

  // email_subject có trong DB nhưng chưa vào generated types → query riêng, ép kiểu hẹp.
  const { data: subjRow } = await externalSupabase
    .from("doan_booking_ks")
    .select("email_subject")
    .eq("id", bkRaw.id)
    .maybeSingle();
  const emailSubject = (subjRow as { email_subject?: string | null } | null)?.email_subject ?? null;

  const { data: ngayRows } = await externalSupabase
    .from("doan_ngay")
    .select("ngay_date")
    .in("id", dayIds.length > 0 ? dayIds : [-1]);
  const roomDates = [...new Set((ngayRows ?? []).map((r) => r.ngay_date).filter(Boolean) as string[])].sort();

  return {
    bookingId: bkRaw.id as number,
    email,
    emailThreadId: bkRaw.email_thread_id ?? null,
    emailSubject,
    datTruocStatus: bkRaw.ks_dat_truoc_status ?? "chua_gui",
    finalStatus: bkRaw.ks_final_status ?? "chua_gui",
    roomDates,
  };
}

/**
 * Phát hiện đổi/gỡ KS cần quyết định, TRƯỚC khi save. Read-only.
 * Trả [] khi không có gì cần hỏi (save tiếp như bình thường).
 *
 * Bắt HAI ca (trước 07/2026 chỉ bắt ca đầu):
 *   1. KS cũ còn ĐNTT sống  → tách tiền (phí hủy / tự hủy ĐNTT chưa trả).
 *   2. KS cũ có booking đã gửi mail, chưa hủy → phải báo hủy cho KS cũ.
 * Bỏ sót ca 2 chính là chỗ booking cũ thành mồ côi im lặng, KS không hề biết
 * mình bị hủy — OP phải mở Gmail báo tay, rồi bỏ luôn hệ thống.
 */
export async function checkKsPhiHuyOnChange(opts: {
  doanId: number;
  days: DayLocal[];
  dbNgayRows: DoanNgayRow[];
}): Promise<KsPhiHuyPending[]> {
  const { doanId, days, dbNgayRows } = opts;

  // 1. Diff KS theo ngày (điều kiện y hệt diff-log trong useSaveDieuTour)
  const changedDayIdsByKs = new Map<number, Set<number>>();
  for (const day of days) {
    if (!day.id) continue;
    const dbRow = dbNgayRows.find((r) => r.id === day.id);
    if (!dbRow?.khach_san_id) continue;
    if ((day.khach_san_id ?? null) !== dbRow.khach_san_id) {
      const set = changedDayIdsByKs.get(dbRow.khach_san_id) ?? new Set<number>();
      set.add(dbRow.id);
      changedDayIdsByKs.set(dbRow.khach_san_id, set);
    }
  }
  if (changedDayIdsByKs.size === 0) return [];

  const out: KsPhiHuyPending[] = [];
  for (const [oldKsId, changedDayIds] of changedDayIdsByKs) {
    // 2. KS cũ còn được dùng chỗ khác? (ngày khác local, hoặc nhóm khác trong DB)
    const stillUsedLocal = days.some(
      (d) => d.khach_san_id === oldKsId && !(d.id && changedDayIds.has(d.id)),
    );
    if (stillUsedLocal) continue;
    const { data: dbDays, error: dayErr } = await externalSupabase
      .from("doan_ngay")
      .select("id")
      .eq("doan_id", doanId)
      .eq("khach_san_id", oldKsId);
    if (dayErr) throw dayErr;
    const allDayIds = (dbDays ?? []).map((r) => r.id as number);
    const remaining = allDayIds.filter((id) => !changedDayIds.has(id));
    // Còn ngày khác giữ KS → giảm bớt đêm, không phải hủy hẳn. Ca đó xử bằng ô "Phí hủy"
    // trong modal "Xử lý chênh lệch thừa" (KSAggCommitModal).
    //
    // LỖ HỔNG ĐÃ BIẾT (review 10/07/2026, chưa vá — hiện 0 ca trên prod, KHÔNG mất tiền
    // vì allocation giữ nguyên): KS trả bằng ĐNTT ĐỊNH KỲ thì `KSCard.showAggBtn` luôn
    // false (ttByKs chỉ cộng ĐNTT ref_loai='khach_san'), nên giảm bớt đêm của KS định kỳ
    // KHÔNG kích được cả gate này lẫn modal chênh lệch → không ai nhắc phí hủy.
    // Vá đúng: ở nhánh này vẫn gọi fetchLiveDnttForKsDays(doanId, oldKsId, [...changedDayIds])
    // và chặn/hỏi nếu dòng chi phí của các ngày bị gỡ còn allocation sống.
    if (remaining.length > 0) continue;

    const info = await fetchKsInfo(oldKsId);
    const dayIds = allDayIds.length > 0 ? allDayIds : [...changedDayIds];

    // 3. Tiền gắn với KS cũ.
    //
    // KHÔNG dò bằng (doan_id, ref_loai='khach_san', ref_id=oldKsId) — cách đó MÙ với
    // ĐNTT thanh toán ĐỊNH KỲ (doan_id = NULL, ref_loai='dinh_ky'), vốn là cách
    // ROSAMIA/ROSEMARY đang được trả. Bỏ sót → gate im lặng → save flip
    // doan_ngay.khach_san_id → dòng chi phí (và tiền đã trả) bị quy sang KS MỚI.
    // Đúng bug Wyndham/Crowne, chỉ khác kênh.
    //
    // Dò từ DÒNG CHI PHÍ của các ngày đó → allocation → ĐNTT. Bắt mọi kênh.
    const liveRows = await fetchLiveDnttForKsDays(doanId, oldKsId, dayIds);

    const booking = await fetchKsBookingHuyInfo(doanId, oldKsId, dayIds, info.email);

    // Không dính tiền VÀ không có booking sống → lưu như cũ, không hỏi gì.
    if (liveRows.length === 0 && !booking) continue;

    // ĐNTT "của riêng KS này trong đoàn này" mới xử được bằng luồng phí hủy:
    // planDoiKsPhiHuy chia phí hủy theo paid_amount của TỪNG ĐNTT, và bước tách
    // sẽ đổi ref_loai + (nếu chưa trả) tự hủy cả ĐNTT. Với ĐNTT định kỳ gom nhiều
    // đoàn, paid_amount là của CẢ LÔ và hủy nó sẽ giết luôn ĐNTT của đoàn khác.
    // → Không đoán mò: chặn, chỉ đúng ĐNTT cho OP xử lý trước.
    const foreign = findForeignKsDntt(liveRows, doanId, oldKsId);
    if (foreign.length > 0) {
      throw new KsDnttNgoaiPhamViError(
        `Không đổi được khách sạn "${info.ten}": nó đang nằm trong đề nghị thanh toán ` +
        `${formatForeignKsDntt(foreign)} không thuộc riêng đoàn này (thanh toán định kỳ gom nhiều đoàn). ` +
        `Xử lý đề nghị đó trước, nếu không tiền đã trả sẽ bị quy nhầm sang khách sạn mới. ` +
        `Lịch trình đã được giữ nguyên khách sạn cũ.`,
        oldKsId,
        dayIds,
      );
    }

    const paidByDntt: DoiKsPaidDntt[] = liveRows
      .filter((d) => Number(d.paid_amount) > 0)
      .map((d) => ({ dnttId: d.id, paidAmount: Number(d.paid_amount) }));
    const unpaidDnttIds = liveRows
      .filter((d) => Number(d.paid_amount) === 0)
      .map((d) => d.id);

    out.push({
      oldKsId,
      oldKsName: info.ten,
      oldKsNccId: info.nccId,
      oldKsNccTen: info.nccTen,
      dayIds,
      paidTotal: paidByDntt.reduce((s, d) => s + d.paidAmount, 0),
      paidByDntt,
      unpaidDnttIds,
      hasMoney: liveRows.length > 0,
      booking,
    });
  }
  return out;
}

/**
 * Pending cho mode 'resolve' — hoàn tất phí hủy của booking đã "Để sau".
 * Nguồn: ĐNTT sống gắn vào các dòng ks_huy của KS (KHÔNG dò theo ref_id đơn thuần
 * để không dính ĐNTT của KS ngoài tour thật cùng khách sạn).
 */
export async function fetchKsHuyResolvePending(opts: {
  doanId: number;
  ksId: number;
}): Promise<KsPhiHuyPending | null> {
  const { doanId, ksId } = opts;
  const { data: rows } = await externalSupabase
    .from("doan_chi_phi")
    .select("id")
    .eq("doan_id", doanId)
    .eq("danh_muc", "khach_san")
    .eq("ks_huy", true)
    .eq("khach_san_id", ksId);
  const rowIds = (rows ?? []).map((r) => r.id as number);
  if (rowIds.length === 0) return null;

  const { data: allocs } = await externalSupabase
    .from("dntt_allocations")
    .select("dntt_id")
    .in("chi_phi_id", rowIds);
  const dnttIds = [...new Set((allocs ?? []).map((a) => a.dntt_id as number))];
  if (dnttIds.length === 0) return null;

  const { data: dntts } = await externalSupabase
    .from("dntt_with_payment_status")
    .select("id, doan_id, loai, paid_amount, trang_thai_duyet")
    .in("id", dnttIds)
    .not("trang_thai_duyet", "in", "(da_huy,tu_choi)");

  // Chặn ĐNTT không thuộc riêng đoàn này (định kỳ gom nhiều đoàn): paid_amount là của
  // CẢ LÔ, chia phí hủy theo nó sẽ hoàn công nợ sai cho đoàn khác.
  //
  // KHÔNG dùng `findForeignKsDntt` ở đây: tới bước resolve, ĐNTT hợp lệ của đoàn đã bị
  // đổi `ref_loai` sang 'ngoai_tour_ks' (bước "Để sau"), mà `isOwnKsDntt` đòi
  // `ref_loai==='khach_san'` → sẽ chặn nhầm chính ca hợp lệ. Lọc theo chủ sở hữu thay vì ref.
  const laDinhKy = (dntts ?? []).filter((d) => d.loai === "dinh_ky" || d.doan_id !== doanId);
  if (laDinhKy.length > 0) {
    const info0 = await fetchKsInfo(ksId);
    throw new KsDnttNgoaiPhamViError(
      `Không chốt được phí hủy cho "${info0.ten}": khoản này nằm trong đề nghị thanh toán ` +
      `${laDinhKy.map((d) => `#${d.id}`).join(", ")} gom nhiều đoàn. Xử lý đề nghị đó trước.`,
      ksId,
      [],
    );
  }

  const paidByDntt: DoiKsPaidDntt[] = (dntts ?? [])
    .filter((d): d is typeof d & { id: number } => d.id != null && Number(d.paid_amount) > 0)
    .map((d) => ({ dnttId: d.id, paidAmount: Number(d.paid_amount) }));
  if (paidByDntt.length === 0) return null;

  const info = await fetchKsInfo(ksId);
  return {
    oldKsId: ksId,
    oldKsName: info.ten,
    oldKsNccId: info.nccId,
    oldKsNccTen: info.nccTen,
    dayIds: [],
    paidTotal: paidByDntt.reduce((s, d) => s + d.paidAmount, 0),
    paidByDntt,
    unpaidDnttIds: [],
    hasMoney: true,
    // Booking đã 'da_huy' từ lúc "Để sau" — mail hủy (nếu cần) gửi ở tab Booking KS.
    booking: null,
  };
}

export interface DoiKsDetachArgs {
  doanId: number;
  pending: KsPhiHuyPending;
  /** Phí hủy NCC giữ lại (mode 'phi_huy'/'resolve'). Kẹp [0, paidTotal] trong plan. */
  phiHuyInput: number;
  /** Lý do hủy (ghi vào booking.ly_do_huy + cong_no.ly_do). */
  lyDo?: string | null;
  /** phi_huy = tách trọn; de_sau = convert giữ nguyên (phi_huy NULL, xử sau);
   *  resolve = hoàn tất phí hủy cho booking đã de_sau (rows nguồn = ks_huy);
   *  booking_only = KS cũ KHÔNG dính đồng nào, chỉ đánh dấu booking "chờ XN hủy"
   *  (không đụng doan_chi_phi / ĐNTT / cong_no). */
  mode: "phi_huy" | "de_sau" | "resolve" | "booking_only";
}

export function useDoiKsPhiHuy() {
  const qc = useQueryClient();
  const cancelMut = useCancelDNTT();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({ doanId, pending, phiHuyInput, lyDo, mode }: DoiKsDetachArgs) => {
      // booking_only: KS cũ chưa dính ĐNTT nào → KHÔNG đụng doan_chi_phi/allocation/cong_no.
      // Chỉ đánh dấu booking "chờ KS xác nhận hủy" + ghi lý do.
      // CỐ Ý không set trang_thai='da_huy': dải "Đã hủy" (tab Chi phí) chỉ hiện cụm
      // ks_huy, mà ca này không có dòng chi phí nào → booking sẽ biến mất khỏi cả hai
      // chỗ. Giữ nguyên 'active' để card còn ở tab Booking KS (kèm banner "đã bị xóa
      // khỏi điều tour") cho OP gửi / gửi lại mail hủy.
      if (mode === "booking_only") {
        if (!pending.booking) throw new Error("Thiếu thông tin booking để đánh dấu hủy");
        const { error } = await externalSupabase
          .from("doan_booking_ks")
          .update({
            ks_final_status: "cho_ks_xac_nhan_huy",
            ...(lyDo ? { ly_do_huy: lyDo } : {}),
          })
          .eq("id", pending.booking.bookingId);
        if (error) throw error;
        return { phiHuy: 0, refund: 0, cancelled: 0 };
      }

      const isResolve = mode === "resolve";
      const plan = planDoiKsPhiHuy({ paidByDntt: pending.paidByDntt, phiHuyInput });
      // Công nợ bắt buộc NCC (useCongNoByNCC lọc theo nha_cung_cap_id — thiếu là mồ côi,
      // không bao giờ cấn trừ được). Chặn sớm trước khi ghi bất kỳ thứ gì.
      if (mode !== "de_sau" && plan.refund > 0 && !pending.oldKsNccId) {
        throw new Error(
          `Khách sạn "${pending.oldKsName}" chưa gắn nhà cung cấp — công nợ hoàn tiền sẽ không cấn trừ được. ` +
          `Gắn NCC cho khách sạn (Quản lý → Khách sạn) rồi thử lại` +
          (isResolve ? "." : `, hoặc chọn "Để sau".`),
        );
      }

      // 0. Dòng chi phí nguồn: đổi-KS = dòng in-tour của các ngày; resolve = dòng ks_huy.
      let rowQuery = externalSupabase
        .from("doan_chi_phi")
        .select("id, mo_ta, ref_doan_ngay_item_id")
        .eq("doan_id", doanId)
        .eq("danh_muc", "khach_san");
      rowQuery = isResolve
        ? rowQuery.eq("ks_huy", true).eq("khach_san_id", pending.oldKsId)
        : rowQuery.eq("ngoai_tour", false).in("ref_doan_ngay_id", pending.dayIds);
      const { data: rowsRaw, error: rowErr } = await rowQuery;
      if (rowErr) throw rowErr;
      // Bỏ dòng day-use wrapper (flow khác) — chỉ áp cho nhánh đổi-KS.
      const oldRows = (rowsRaw ?? []).filter(
        (r) => isResolve || r.ref_doan_ngay_item_id == null,
      );
      const oldRowIds = oldRows.map((r) => r.id as number);

      // 1. Tự hủy ĐNTT chưa trả (đã chốt: kèm log) — useCancelDNTT lo can_tru/recalc.
      for (const id of pending.unpaidDnttIds) {
        await cancelMut.mutateAsync({ id, mode: undefined });
        await externalSupabase
          .from("de_nghi_thanh_toan")
          .update({ ghi_chu: `[Hủy] Đổi khách sạn ${pending.oldKsName} — hệ thống tự hủy ĐNTT chưa thanh toán` })
          .eq("id", id);
      }

      // LỖ HỔNG ĐÃ BIẾT (pre-existing, review 10/07/2026): bước 2 dưới đây INSERT dòng
      // "[Phí hủy]" không idempotent (khác bước 4 cong_no có guard `existingCn`). Mutation
      // không có transaction → nếu lỗi giữa chừng rồi OP thử lại, dòng [Phí hủy] + allocation
      // bị nhân đôi. Vá đúng: lookup dòng cùng nguồn (doan_id + khach_san_id + ks_huy=true)
      // → UPDATE gia_phong thay vì insert, và dedupe allocation theo (dntt_id, chi_phi_id).
      let fRowId: number | null = null;
      let congNoId: number | null = null;
      if (mode !== "de_sau") {
        // 2. Dòng "[Phí hủy]" (chỉ khi NCC thật sự giữ tiền)
        if (plan.phiHuy > 0) {
          const payload = buildKsNgoaiTourPayload({
            doanId,
            khachSanId: pending.oldKsId,
            nccId: pending.oldKsNccId,
            loaiRow: "dich_vu_khac",
            loaiPhong: `[Phí hủy] ${pending.oldKsName}`,
            soPhong: 1,
            focCount: 0,
            ci: null,
            co: null,
            giaPhong: plan.phiHuy,
            dinhKy: false,
          });
          // Partial<ChiPhiRow> làm `loai` optional — insert yêu cầu NOT NULL, pin lại.
          const { data: fRow, error: fErr } = await externalSupabase
            .from("doan_chi_phi")
            .insert({ ...payload, loai: "chi", ks_huy: true })
            .select("id")
            .single();
          if (fErr) throw fErr;
          fRowId = fRow.id as number;
        }

        // 3. Chuyển từng ĐNTT đã trả: INSERT alloc mới TRƯỚC, DELETE alloc cũ SAU
        //    (thứ tự này nếu fail giữa chừng chỉ dư allocation — thấy được, sửa được;
        //    ngược lại sẽ MẤT dấu tiền đã trả).
        for (let i = 0; i < pending.paidByDntt.length; i++) {
          const d = pending.paidByDntt[i];
          const share = plan.allocByDntt[i]?.soTien ?? 0;
          if (share > 0 && fRowId != null) {
            const { error: aErr } = await externalSupabase
              .from("dntt_allocations")
              .insert({ dntt_id: d.dnttId, chi_phi_id: fRowId, so_tien: share });
            if (aErr) throw aErr;
          }
          if (oldRowIds.length > 0) {
            const { error: delErr } = await externalSupabase
              .from("dntt_allocations")
              .delete()
              .eq("dntt_id", d.dnttId)
              .in("chi_phi_id", oldRowIds);
            if (delErr) throw delErr;
          }
          const { error: refErr } = await externalSupabase
            .from("de_nghi_thanh_toan")
            .update({ ref_loai: REF_LOAI_NGOAI_TOUR })
            .eq("id", d.dnttId);
          if (refErr) throw refErr;
        }

        // 4. Công nợ phần trả dư (dntt_goc_id = ĐNTT trả nhiều nhất — chỉ trỏ được 1)
        if (plan.refund > 0) {
          const goc = [...pending.paidByDntt].sort((a, b) => b.paidAmount - a.paidAmount)[0];
          const lyDoText =
            `Hủy khách sạn ${pending.oldKsName} — phí hủy NCC giữ ` +
            `${plan.phiHuy.toLocaleString("vi-VN")}đ, hoàn lại ${plan.refund.toLocaleString("vi-VN")}đ` +
            (lyDo ? `. Lý do: ${lyDo}` : "");
          // IDEMPOTENT: mutation không có transaction — retry sau lỗi giữa chừng (hoặc
          // resolve lại) KHÔNG được nhân đôi công nợ. Tìm cong_no con_du cùng nguồn
          // (đoàn + NCC + dntt_goc ∈ ĐNTT đã trả của KS này) → UPDATE về số mới thay vì
          // insert. Khóa theo dntt_goc thay vì ly_do để bắt được cả công nợ do LUỒNG KHÁC
          // tạo trước đó (vd "Điều chỉnh giảm KS" ở tab Chi phí) — tránh ghi công nợ trùng
          // cho cùng một khoản trả dư của KS. (goc = ĐNTT trả nhiều nhất, luôn ∈ danh sách.)
          const paidDnttIds = pending.paidByDntt.map((d) => d.dnttId);
          const { data: existingCn } = await externalSupabase
            .from("cong_no")
            .select("id")
            .eq("doan_id", doanId)
            .eq("nha_cung_cap_id", pending.oldKsNccId!)
            .eq("trang_thai", "con_du")
            .in("dntt_goc_id", paidDnttIds.length > 0 ? paidDnttIds : [goc?.dnttId ?? -1])
            .order("id")
            .limit(1)
            .maybeSingle();
          if (existingCn) {
            const { error: cnErr } = await externalSupabase
              .from("cong_no")
              .update({ so_tien_goc: plan.refund, ly_do: lyDoText })
              .eq("id", existingCn.id);
            if (cnErr) throw cnErr;
            congNoId = existingCn.id as number;
          } else {
            const { data: cnRow, error: cnErr } = await externalSupabase
              .from("cong_no")
              .insert({
                doan_id: doanId,
                dntt_goc_id: goc?.dnttId ?? null,
                nha_cung_cap_id: pending.oldKsNccId,
                ten_nha_cung_cap: pending.oldKsNccTen,
                so_tien_goc: plan.refund,
                trang_thai: "con_du",
                loai: "phat_sinh",
                ly_do: lyDoText,
              })
              .select("id")
              .single();
            if (cnErr) throw cnErr;
            congNoId = cnRow.id as number;
          }
        }
      }

      // 5. Dọn dòng nguồn: hết allocation sống → xóa; còn (định kỳ/voucher…) hoặc
      //    mode de_sau → convert giữ dấu tiền + đánh dấu ks_huy (dải "Đã hủy" hiển thị).
      if (oldRowIds.length > 0) {
        // PHẢI throw khi query lỗi: allocsLeft=null → activeIds rỗng → xóa nhầm dòng
        // còn allocation của ĐNTT sống (CASCADE mất dấu tiền — rule CLAUDE.md).
        const { data: allocsLeft, error: allocErr } = await externalSupabase
          .from("dntt_allocations")
          .select("chi_phi_id, de_nghi_thanh_toan:dntt_id!inner(trang_thai_duyet)")
          .in("chi_phi_id", oldRowIds);
        if (allocErr) throw allocErr;
        const activeIds = new Set(
          (allocsLeft ?? [])
            .filter((a) => {
              const dn = a.de_nghi_thanh_toan as unknown as { trang_thai_duyet: string };
              return dn.trang_thai_duyet !== "da_huy" && dn.trang_thai_duyet !== "tu_choi";
            })
            .map((a) => a.chi_phi_id as number),
        );
        const prefix = mode === "de_sau" ? "[Chờ xử lý phí hủy] " : "[Chờ xử lý] ";
        for (const row of oldRows) {
          const mustKeep = mode === "de_sau" || activeIds.has(row.id as number);
          if (mustKeep) {
            // resolve: dòng đã ngoai_tour+ks_huy sẵn — không đổi mo_ta lần nữa.
            if (isResolve) continue;
            const { error: cvErr } = await externalSupabase
              .from("doan_chi_phi")
              .update({
                ngoai_tour: true,
                ks_huy: true,
                ref_doan_ngay_id: null,
                ref_doan_ngay_item_id: null,
                khach_san_id: pending.oldKsId, // dải "Đã hủy" group theo cột này
                mo_ta: `${prefix}${row.mo_ta ?? ""}`.trim(),
                // KS đã hủy không được lọt vào queue thanh toán định kỳ (payable ma).
                thanh_toan_dinh_ky: false,
              })
              .eq("id", row.id);
            if (cvErr) throw cvErr;
          } else {
            const { error: delErr } = await externalSupabase
              .from("doan_chi_phi")
              .delete()
              .eq("id", row.id);
            if (delErr) throw delErr;
          }
        }
      }

      // de_sau: ĐNTT đã trả cũng chuyển ref sang ngoài tour để cách ly aggregation in-tour
      if (mode === "de_sau") {
        for (const d of pending.paidByDntt) {
          await externalSupabase
            .from("de_nghi_thanh_toan")
            .update({ ref_loai: REF_LOAI_NGOAI_TOUR })
            .eq("id", d.dnttId);
        }
      }

      // 6. Booking KS lifecycle (Tầng 2): trang_thai='da_huy' + phi_huy + ly_do + cong_no.
      //    de_sau → phi_huy NULL = "chưa xử lý" (dải Đã hủy hiện nút Xử lý ngay).
      //    resolve → giữ huy_luc/huy_boi gốc, chỉ bổ sung phi_huy/cong_no/ly_do.
      {
        const phiHuyValue = mode === "de_sau" ? null : plan.phiHuy;
        const { data: existingBk } = await externalSupabase
          .from("doan_booking_ks")
          .select("id")
          .eq("doan_id", doanId)
          .eq("khach_san_id", pending.oldKsId)
          .maybeSingle();
        const lifecycleFields = {
          // resolve KHÔNG đụng trang_thai: booking có thể đã reactivate (KS quay lại
          // tour) — lật lại 'da_huy' sẽ làm KS biến mất khỏi tab Booking KS.
          ...(isResolve ? {} : { trang_thai: "da_huy" }),
          phi_huy: phiHuyValue,
          ...(lyDo ? { ly_do_huy: lyDo } : {}),
          ...(congNoId != null ? { cong_no_id: congNoId } : {}),
          ...(isResolve ? {} : { huy_luc: new Date().toISOString(), huy_boi: user?.user_id ?? null }),
        };
        if (existingBk) {
          const { error: bkErr } = await externalSupabase
            .from("doan_booking_ks")
            .update(lifecycleFields)
            .eq("id", existingBk.id);
          if (bkErr) throw bkErr;
        } else {
          const { error: bkErr } = await externalSupabase
            .from("doan_booking_ks")
            .insert({
              doan_id: doanId,
              khach_san_id: pending.oldKsId,
              ...lifecycleFields,
              huy_luc: new Date().toISOString(),
              huy_boi: user?.user_id ?? null,
            });
          if (bkErr) throw bkErr;
        }
      }

      // 7. Recalc trạng thái các chi phí đụng tới
      const recalcIds = [...oldRowIds, ...(fRowId != null ? [fRowId] : [])];
      if (recalcIds.length > 0) await recalcChiPhiStatus(recalcIds);

      return { phiHuy: plan.phiHuy, refund: plan.refund, cancelled: pending.unpaidDnttIds.length };
    },
    onSuccess: (_r, { doanId }) => {
      qc.invalidateQueries({ queryKey: ["doan_chi_phi", doanId] });
      qc.invalidateQueries({ queryKey: ["de_nghi_thanh_toan", doanId] });
      qc.invalidateQueries({ queryKey: ["chi_phi_ks_data", doanId] });
      qc.invalidateQueries({ queryKey: ["dntt-list"] });
      qc.invalidateQueries({ queryKey: ["cong-no"] });
      qc.invalidateQueries({ queryKey: ["cong-no-by-ncc"] });
      qc.invalidateQueries({ queryKey: ["payments-by-chi-phi", doanId] });
      qc.invalidateQueries({ queryKey: ["doan_booking_ks", doanId] });
      qc.invalidateQueries({ queryKey: ["ks_da_huy", doanId] });
    },
  });
}
