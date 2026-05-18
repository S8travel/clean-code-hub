import { useEffect, useState } from "react";
import { externalSupabase } from "@/lib/supabase-external";
import { getLastChiPhiLocalSave } from "@/lib/chi-phi-sync-bus";

// Cửa sổ bỏ qua echo của chính client (sau khi tự lưu chi phí).
// > thời gian round-trip insert/update + realtime fan-out.
const SUPPRESS_MS = 6000;

/**
 * Lắng nghe thay đổi doan_chi_phi của 1 đoàn từ máy KHÁC.
 * Trả về `stale=true` khi có thay đổi không phải do client này vừa lưu
 * (so với mốc markChiPhiSavedLocally). KHÔNG tự refetch — caller hiện
 * banner để user chủ động "Tải lại" (tránh reset người đang nhập dở).
 */
export function useChiPhiChangeSignal(doanId: number | null | undefined) {
  const [stale, setStale] = useState(false);

  useEffect(() => {
    if (!doanId) return;
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
          // Echo của chính mình (vừa blur-save) → bỏ qua.
          if (Date.now() - getLastChiPhiLocalSave(doanId) > SUPPRESS_MS) {
            setStale(true);
          }
        },
      )
      .subscribe();
    return () => {
      externalSupabase.removeChannel(channel);
    };
  }, [doanId]);

  return { stale, reset: () => setStale(false) };
}
