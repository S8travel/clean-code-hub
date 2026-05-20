import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { externalSupabase } from "@/lib/supabase-external";
import { getLastChiPhiLocalSave } from "@/lib/chi-phi-sync-bus";

// Cửa sổ bỏ qua echo của chính client (sau khi tự lưu chi phí).
// > thời gian round-trip insert/update + realtime fan-out.
const SUPPRESS_MS = 6000;

/**
 * Lắng nghe thay đổi doan_chi_phi của 1 đoàn từ máy/tab KHÁC → invalidate
 * query chi phí để các section reconcile lại từ DB (snapshot CỦA TOUR).
 * Bỏ qua echo của chính client (markChiPhiSavedLocally, suppress 6s) để
 * không tự refetch ngay sau khi mình vừa lưu. Reconcile trong section có
 * dirty-guard nên tab passive tự tươi mà KHÔNG reset người đang gõ.
 */
export function useChiPhiChangeSignal(doanId: number | null | undefined) {
  const qc = useQueryClient();
  useEffect(() => {
    if (!doanId || Number.isNaN(doanId)) return;
    const channel = externalSupabase
      .channel(`doan_chi_phi_${doanId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "doan_chi_phi",
          filter: `doan_id=eq.${doanId}`,
        },
        () => {
          // Echo của chính mình (vừa blur-save) → bỏ qua, tránh refetch thừa.
          if (Date.now() - getLastChiPhiLocalSave(doanId) <= SUPPRESS_MS) return;
          // Bao gồm cả ĐNTT + payments-by-chi-phi để badge "đã TT"/cấn trừ
          // trên tab Chi phí máy passive tự tươi khi máy khác thanh toán.
          for (const k of [
            "doan_chi_phi", "chi_phi_ks_data", "chi_phi_nh_data",
            "chi_phi_nh_section", "chi_phi_hdv_section",
            "de_nghi_thanh_toan", "payments-by-chi-phi",
          ]) {
            qc.invalidateQueries({ queryKey: [k, doanId] });
          }
        },
      )
      .subscribe();
    return () => {
      externalSupabase.removeChannel(channel);
    };
  }, [doanId, qc]);
}
