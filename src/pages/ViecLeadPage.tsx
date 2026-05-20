import { useMemo, useState } from "react";
import { format, formatDistanceToNow, isToday } from "date-fns";
import { vi } from "date-fns/locale";
import { Target, Phone, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth";
import { useMyNextActions, type MyNextActionRow } from "@/hooks/use-lead-next-action";
import { CHANNEL_ICON, CHANNEL_LABEL, PRIORITY_LABEL } from "@/lib/lead-next-action";
import { LeadDrawer } from "@/components/leads/LeadDrawer";
import { t, useTranslate } from "@/lib/i18n";

type Bucket = "qua_han" | "hom_nay" | "sap_toi";

const BUCKET_META: Record<Bucket, { label: string; cls: string }> = {
  qua_han: { label: "🔴 Quá hạn", cls: "text-destructive" },
  hom_nay: { label: "🟠 Hôm nay", cls: "text-foreground" },
  sap_toi: { label: "⚪ Sắp tới", cls: "text-muted-foreground" },
};

function bucketOf(dueAt: string, now: Date): Bucket {
  const due = new Date(dueAt);
  if (due.getTime() < now.getTime()) return "qua_han";
  if (isToday(due)) return "hom_nay";
  return "sap_toi";
}

const PRI_CLS: Record<string, string> = {
  gap: "bg-destructive/10 text-destructive border-destructive/30",
  binh_thuong: "bg-warning/10 text-foreground border-warning/40",
  khong_gap: "bg-muted text-muted-foreground border-border",
};

export default function ViecLeadPage() {
  useTranslate();
  const { user } = useAuth();
  const { data: rows = [], isLoading } = useMyNextActions(user?.user_id ?? null);

  const [selectedLeadId, setSelectedLeadId] = useState<number | null>(null);
  const [open, setOpen] = useState(false);

  const now = new Date();
  const grouped = useMemo(() => {
    const g: Record<Bucket, MyNextActionRow[]> = { qua_han: [], hom_nay: [], sap_toi: [] };
    for (const r of rows) g[bucketOf(r.due_at, now)].push(r);
    return g;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows]);

  const openLead = (leadId: number) => { setSelectedLeadId(leadId); setOpen(true); };

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="shrink-0 flex items-center justify-between px-6 py-4 border-b bg-background">
        <div className="flex items-center gap-2">
          <Target className="h-5 w-5 text-primary" />
          <h1 className="text-xl font-bold">{t("Lead cần xử lý")}</h1>
          {!isLoading && (
            <span className="text-sm text-muted-foreground ml-1">({rows.length})</span>
          )}
        </div>
        <div className="hidden sm:flex items-center gap-3 text-xs text-muted-foreground">
          <span className="text-destructive font-medium">{grouped.qua_han.length} {t("quá hạn")}</span>
          <span>·</span>
          <span>{grouped.hom_nay.length} {t("hôm nay")}</span>
          <span>·</span>
          <span>{grouped.sap_toi.length} {t("sắp tới")}</span>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-5 space-y-6 max-w-[1000px] mx-auto w-full">
        {isLoading ? (
          <div className="py-20 text-center text-sm text-muted-foreground">{t("Đang tải...")}</div>
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-muted-foreground">
            <CheckCircle2 className="h-10 w-10 text-emerald-400 mb-3" />
            <p className="text-sm">{t("Không có việc nào — bạn đã xử lý hết lead 🎉")}</p>
          </div>
        ) : (
          (["qua_han", "hom_nay", "sap_toi"] as Bucket[]).map((b) =>
            grouped[b].length === 0 ? null : (
              <div key={b}>
                <p className={cn("text-xs font-semibold uppercase tracking-wide mb-2", BUCKET_META[b].cls)}>
                  {t(BUCKET_META[b].label)} ({grouped[b].length})
                </p>
                <div className="rounded-xl border border-border bg-card overflow-hidden divide-y divide-border">
                  {grouped[b].map((r) => {
                    const due = new Date(r.due_at);
                    return (
                      <button
                        key={r.id}
                        onClick={() => openLead(r.lead.id)}
                        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-muted/40 transition-colors text-left"
                      >
                        <span className="text-lg leading-none shrink-0">
                          {CHANNEL_ICON[r.channel] ?? "📌"}
                        </span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-medium truncate">{r.lead.ho_ten}</p>
                            {r.lead.so_dien_thoai && (
                              <span className="text-xs text-muted-foreground flex items-center gap-0.5 shrink-0">
                                <Phone className="h-3 w-3" /> {r.lead.so_dien_thoai}
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground truncate">
                            {t(CHANNEL_LABEL[r.channel] ?? r.channel)}
                            {r.reason ? ` · ${r.reason}` : ""}
                          </p>
                        </div>
                        <div className="flex flex-col items-end gap-1 shrink-0">
                          <span className={cn(
                            "text-[10px] font-semibold px-2 py-0.5 rounded-full border",
                            PRI_CLS[r.priority] ?? PRI_CLS.binh_thuong,
                          )}>
                            {t(PRIORITY_LABEL[r.priority] ?? r.priority)}
                          </span>
                          <span className={cn("text-[11px]",
                            b === "qua_han" ? "text-destructive font-medium" : "text-muted-foreground")}>
                            {format(due, "HH:mm dd/MM", { locale: vi })} ·{" "}
                            {formatDistanceToNow(due, { addSuffix: true, locale: vi })}
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )
          )
        )}
      </div>

      <LeadDrawer
        leadId={selectedLeadId}
        open={open}
        onClose={() => setOpen(false)}
      />
    </div>
  );
}
