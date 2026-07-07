// Guard "Đổi khách sạn có phí hủy" — Điều tour.
//
// Vấn đề gốc: dòng chi phí KS in-tour KHÔNG lưu khach_san_id — danh tính KS suy từ
// ref_doan_ngay_id → doan_ngay.khach_san_id. OP đổi KS của ngày → cùng dòng chi phí
// (và TIỀN đã trả cho KS cũ) tự "nhảy" sang KS mới → rối tiền (ca Wyndham/Crowne 07/2026).
//
// Guard: TRƯỚC khi autosave flip doan_ngay.khach_san_id, phát hiện KS cũ biến mất hẳn
// khỏi tour mà còn ĐNTT sống → tách sạch (detach) rồi mới lưu:
//   - ĐNTT ĐÃ TRẢ  → chuyển sang mục "KS ngoài tour [Phí hủy]" (giữ payment) +
//     công nợ con_du = (đã trả − phí hủy).
//   - ĐNTT CHƯA trả → tự hủy kèm log (đã chốt với user 07/07/2026).
//   - Dòng chi phí ngày: hết allocation sống → xóa; còn (định kỳ/voucher edge) →
//     convert sang ngoài tour "[Chờ xử lý]" (KHÔNG xóa — tránh CASCADE mất dấu tiền).
//
// KS cũ vẫn còn ngày khác trong tour (giảm bớt đêm) → KHÔNG kích hoạt guard; ca đó
// dùng ô "Phí hủy" ở modal "Xử lý chênh lệch thừa" (KSAggCommitModal).

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { externalSupabase } from "@/lib/supabase-external";
import { planDoiKsPhiHuy, type DoiKsPaidDntt } from "@/lib/doi-ks-phi-huy";
import { buildKsNgoaiTourPayload } from "@/lib/ks-ngoai-tour";
import { REF_LOAI_NGOAI_TOUR } from "@/lib/ks-ngoai-tour-print";
import { useCancelDNTT, recalcChiPhiStatus } from "@/hooks/use-dntt";
import type { DayLocal, DoanNgayRow } from "@/hooks/use-dieu-tour";

export interface KsPhiHuyPending {
  oldKsId: number;
  oldKsName: string;
  oldKsNccId: number | null;
  oldKsNccTen: string | null;
  /** doan_ngay.id các ngày đang gắn KS cũ (toàn đoàn, mọi nhóm). */
  dayIds: number[];
  paidTotal: number;
  paidByDntt: DoiKsPaidDntt[];
  /** ĐNTT sống chưa trả đồng nào (cho_duyet/da_duyet) — sẽ tự hủy kèm log. */
  unpaidDnttIds: number[];
}

/**
 * Phát hiện đổi-KS-có-tiền TRƯỚC khi save. Read-only.
 * Trả [] khi không có gì cần chặn (save tiếp như bình thường).
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
    if (remaining.length > 0) continue; // còn ngày khác giữ KS → không phải hủy hẳn

    // 3. ĐNTT sống của KS cũ (payment_status chỉ có trên VIEW, không phải bảng gốc)
    const { data: dntts, error: dnttErr } = await externalSupabase
      .from("dntt_with_payment_status")
      .select("id, so_tien, paid_amount, trang_thai_duyet")
      .eq("doan_id", doanId)
      .eq("ref_loai", "khach_san")
      .eq("ref_id", oldKsId)
      .not("trang_thai_duyet", "in", "(da_huy,tu_choi)");
    if (dnttErr) throw dnttErr;
    const live = dntts ?? [];
    if (live.length === 0) continue; // không dính tiền → lưu như cũ (orphan card tự xử)

    // View trả cột nullable theo generated types — id thực tế luôn có.
    const liveRows = live.filter((d): d is typeof d & { id: number } => d.id != null);
    const paidByDntt: DoiKsPaidDntt[] = liveRows
      .filter((d) => Number(d.paid_amount) > 0)
      .map((d) => ({ dnttId: d.id, paidAmount: Number(d.paid_amount) }));
    const unpaidDnttIds = liveRows
      .filter((d) => Number(d.paid_amount) === 0)
      .map((d) => d.id);

    // 4. Tên + NCC KS cũ (khachSanList của Điều tour không có nha_cung_cap_id)
    const { data: ks } = await externalSupabase
      .from("khach_san")
      .select("id, ten, nha_cung_cap_id, nha_cung_cap:nha_cung_cap_id(ten)")
      .eq("id", oldKsId)
      .maybeSingle();
    const nccJoined = ks?.nha_cung_cap as { ten: string | null } | null;

    out.push({
      oldKsId,
      oldKsName: ks?.ten ?? `KS #${oldKsId}`,
      oldKsNccId: ks?.nha_cung_cap_id ?? null,
      oldKsNccTen: nccJoined?.ten ?? null,
      dayIds: allDayIds.length > 0 ? allDayIds : [...changedDayIds],
      paidTotal: paidByDntt.reduce((s, d) => s + d.paidAmount, 0),
      paidByDntt,
      unpaidDnttIds,
    });
  }
  return out;
}

export interface DoiKsDetachArgs {
  doanId: number;
  pending: KsPhiHuyPending;
  /** Phí hủy NCC giữ lại (mode 'phi_huy'). Kẹp [0, paidTotal] trong plan. */
  phiHuyInput: number;
  /** phi_huy = tách trọn (phí hủy + công nợ); de_sau = convert giữ nguyên, xử ở tab Chi phí. */
  mode: "phi_huy" | "de_sau";
}

export function useDoiKsPhiHuy() {
  const qc = useQueryClient();
  const cancelMut = useCancelDNTT();

  return useMutation({
    mutationFn: async ({ doanId, pending, phiHuyInput, mode }: DoiKsDetachArgs) => {
      const plan = planDoiKsPhiHuy({ paidByDntt: pending.paidByDntt, phiHuyInput });
      // Công nợ bắt buộc NCC (useCongNoByNCC lọc theo nha_cung_cap_id — thiếu là mồ côi,
      // không bao giờ cấn trừ được). Chặn sớm trước khi ghi bất kỳ thứ gì.
      if (mode === "phi_huy" && plan.refund > 0 && !pending.oldKsNccId) {
        throw new Error(
          `Khách sạn "${pending.oldKsName}" chưa gắn nhà cung cấp — công nợ hoàn tiền sẽ không cấn trừ được. ` +
          `Gắn NCC cho khách sạn (Quản lý → Khách sạn) rồi thử lại, hoặc chọn "Để sau".`,
        );
      }

      // 0. Dòng chi phí KS cũ của các ngày (bỏ dòng day-use wrapper — flow khác)
      const { data: rowsRaw, error: rowErr } = await externalSupabase
        .from("doan_chi_phi")
        .select("id, mo_ta, ref_doan_ngay_item_id")
        .eq("doan_id", doanId)
        .eq("danh_muc", "khach_san")
        .eq("ngoai_tour", false)
        .in("ref_doan_ngay_id", pending.dayIds);
      if (rowErr) throw rowErr;
      const oldRows = (rowsRaw ?? []).filter((r) => r.ref_doan_ngay_item_id == null);
      const oldRowIds = oldRows.map((r) => r.id as number);

      // 1. Tự hủy ĐNTT chưa trả (đã chốt: kèm log) — useCancelDNTT lo can_tru/recalc.
      for (const id of pending.unpaidDnttIds) {
        await cancelMut.mutateAsync({ id, mode: undefined });
        await externalSupabase
          .from("de_nghi_thanh_toan")
          .update({ ghi_chu: `[Hủy] Đổi khách sạn ${pending.oldKsName} — hệ thống tự hủy ĐNTT chưa thanh toán` })
          .eq("id", id);
      }

      let fRowId: number | null = null;
      if (mode === "phi_huy") {
        // 2. Dòng "[Phí hủy]" ngoài tour (chỉ khi NCC thật sự giữ tiền)
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
            .insert({ ...payload, loai: "chi" })
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
          const { error: cnErr } = await externalSupabase.from("cong_no").insert({
            doan_id: doanId,
            dntt_goc_id: goc?.dnttId ?? null,
            nha_cung_cap_id: pending.oldKsNccId,
            ten_nha_cung_cap: pending.oldKsNccTen,
            so_tien_goc: plan.refund,
            trang_thai: "con_du",
            loai: "phat_sinh",
            ly_do:
              `Đổi khách sạn ${pending.oldKsName} — phí hủy NCC giữ ` +
              `${plan.phiHuy.toLocaleString("vi-VN")}đ, hoàn lại ${plan.refund.toLocaleString("vi-VN")}đ`,
          });
          if (cnErr) throw cnErr;
        }
      }

      // 5. Dọn dòng ngày: hết allocation sống → xóa; còn (định kỳ/voucher…) hoặc
      //    mode de_sau → convert ngoài tour (giữ dấu tiền, panel ngoài tour xử tiếp).
      if (oldRowIds.length > 0) {
        const { data: allocsLeft } = await externalSupabase
          .from("dntt_allocations")
          .select("chi_phi_id, de_nghi_thanh_toan:dntt_id!inner(trang_thai_duyet)")
          .in("chi_phi_id", oldRowIds);
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
            const { error: cvErr } = await externalSupabase
              .from("doan_chi_phi")
              .update({
                ngoai_tour: true,
                ref_doan_ngay_id: null,
                ref_doan_ngay_item_id: null,
                khach_san_id: pending.oldKsId, // panel ngoài tour group theo cột này
                mo_ta: `${prefix}${row.mo_ta ?? ""}`.trim(),
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

      // de_sau: ĐNTT đã trả cũng chuyển ref sang ngoài tour để panel gom đúng thẻ
      if (mode === "de_sau") {
        for (const d of pending.paidByDntt) {
          await externalSupabase
            .from("de_nghi_thanh_toan")
            .update({ ref_loai: REF_LOAI_NGOAI_TOUR })
            .eq("id", d.dnttId);
        }
      }

      // 6. Recalc trạng thái các chi phí đụng tới
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
    },
  });
}
