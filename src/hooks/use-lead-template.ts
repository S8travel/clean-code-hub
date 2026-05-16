import { externalSupabase } from "@/lib/supabase-external";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { htmlFromText } from "@/lib/lead-template";

const SUPABASE_EDGE_URL = "https://lflsbwoqzmbknzdpaequ.supabase.co/functions/v1";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxmbHNid29xem1ia256ZHBhZXF1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM3MDAzNzcsImV4cCI6MjA4OTI3NjM3N30.RLsKYfH6XZw3Mcmk2fm1R6rKKzrtm0MLrYhtjIT--T0";

export interface LeadTemplate {
  id: number;
  ten: string;
  channel: string;       // email | zalo | call_script
  stage: string | null;
  scenario: string | null;
  subject: string | null;
  body: string;
  used_count: number;
  conversion_rate: number | null;
  active: boolean;
}

// Lọc theo channel template; ưu tiên đúng stage rồi tới template chung (stage null)
export function useTemplates(templateChannel: string | null, stage?: string | null) {
  return useQuery({
    queryKey: ["lead_template", templateChannel, stage ?? null],
    enabled: !!templateChannel,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await externalSupabase
        .from("lead_template")
        .select("*")
        .eq("active", true)
        .eq("channel", templateChannel!)
        .order("used_count", { ascending: false });
      if (error) throw error;
      const rows = (data ?? []) as LeadTemplate[];
      // stage khớp lên đầu, template chung (null) kế tiếp, còn lại sau
      return rows.sort((a, b) => {
        const sa = a.stage === stage ? 0 : a.stage == null ? 1 : 2;
        const sb = b.stage === stage ? 0 : b.stage == null ? 1 : 2;
        return sa - sb;
      });
    },
  });
}

// Thống kê dùng template (Phase E increment)
export function useTemplateStats() {
  return useQuery({
    queryKey: ["lead_template_stats"],
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await externalSupabase
        .from("lead_template")
        .select("id, ten, channel, used_count, conversion_rate, active")
        .order("used_count", { ascending: false });
      if (error) throw error;
      return (data ?? []) as LeadTemplate[];
    },
  });
}

// Gửi email lead qua edge function send-booking-email (generic). Reply-To = email
// user đang đăng nhập → khách Reply về thẳng sale phụ trách.
export function useSendLeadEmail() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (p: {
      to: string; subject: string; bodyText: string;
      templateId?: number | null;
    }) => {
      const replyTo =
        (await externalSupabase.auth.getSession()).data.session?.user?.email || undefined;
      const res = await fetch(`${SUPABASE_EDGE_URL}/send-booking-email`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({
          to: p.to,
          subject: p.subject,
          html: htmlFromText(p.bodyText),
          text: p.bodyText,
          replyTo,
        }),
      });
      if (!res.ok) throw new Error((await res.text()) || "Lỗi gửi email");
      const data = await res.json();
      if (data?.error) throw new Error(data.error);

      if (p.templateId) {
        const { data: t } = await externalSupabase
          .from("lead_template").select("used_count").eq("id", p.templateId).maybeSingle();
        await externalSupabase.from("lead_template")
          .update({ used_count: ((t as any)?.used_count ?? 0) + 1 })
          .eq("id", p.templateId);
      }
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["lead_template"] });
      qc.invalidateQueries({ queryKey: ["lead_template_stats"] });
    },
  });
}

// Tăng used_count khi copy template zalo/call (không gửi qua hệ thống)
export function useBumpTemplateUse() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (templateId: number) => {
      const { data: t } = await externalSupabase
        .from("lead_template").select("used_count").eq("id", templateId).maybeSingle();
      await externalSupabase.from("lead_template")
        .update({ used_count: ((t as any)?.used_count ?? 0) + 1 })
        .eq("id", templateId);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["lead_template"] });
      qc.invalidateQueries({ queryKey: ["lead_template_stats"] });
    },
  });
}
