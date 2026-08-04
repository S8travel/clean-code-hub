import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { externalSupabase } from "@/lib/supabase-external";

/**
 * Lắng nghe lead / lead_activity được ghi từ NGOÀI client (webhook FB Messenger
 * chạy service_role) → invalidate query để danh sách lead + timeline hoạt động
 * tự tươi, không phải F5. Mutation nội bộ đã tự invalidate nên ở đây chỉ nghe
 * INSERT (lead mới + tin nhắn mới) — KHÔNG nghe UPDATE lead để tránh reset
 * form đang gõ dở trong LeadDrawer (bài học suppress-echo của use-chi-phi-realtime).
 *
 * Yêu cầu DB: lead + lead_activity đã ADD vào publication supabase_realtime
 * (migration 20260804_lead_realtime). Realtime tôn trọng RLS.
 */
export function useLeadRealtime() {
  const qc = useQueryClient();
  useEffect(() => {
    const channel = externalSupabase
      .channel("lead_realtime")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "lead" },
        () => {
          qc.invalidateQueries({ queryKey: ["leads"] });
        },
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "lead_activity" },
        (payload) => {
          const leadId = (payload.new as { lead_id?: number } | null)?.lead_id;
          if (leadId) {
            qc.invalidateQueries({ queryKey: ["lead_activities", leadId] });
            qc.invalidateQueries({ queryKey: ["lead", leadId] });
          }
          // ngay_lien_he_cuoi/last_touched đổi theo trigger → list cũng tươi
          qc.invalidateQueries({ queryKey: ["leads"] });
        },
      )
      .subscribe();
    return () => {
      externalSupabase.removeChannel(channel);
    };
  }, [qc]);
}
