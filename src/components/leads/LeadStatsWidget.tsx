import { Sparkles, CalendarClock, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLeadStats } from "@/hooks/use-lead-stats";

export type LeadStatsPreset = "moi" | "today" | "overdue";

interface Props {
  userId: string | null | undefined;
  onSelect: (preset: LeadStatsPreset) => void;
}

export function LeadStatsWidget({ userId, onSelect }: Props) {
  const { data: stats } = useLeadStats(userId);

  if (!userId) return null;

  const cards = [
    {
      label:  "Lead mới hôm nay",
      count:  stats?.lead_moi_today ?? 0,
      icon:   Sparkles,
      tone:   "neutral" as const,
      preset: "moi" as const,
    },
    {
      label:  "Cần follow-up hôm nay",
      count:  stats?.follow_up_today ?? 0,
      icon:   CalendarClock,
      tone:   "warn" as const,
      preset: "today" as const,
    },
    {
      label:  "Quá hạn follow-up",
      count:  stats?.follow_up_overdue ?? 0,
      icon:   AlertCircle,
      tone:   "danger" as const,
      preset: "overdue" as const,
    },
  ];

  return (
    <div className="grid grid-cols-3 gap-3">
      {cards.map((c) => {
        const Icon = c.icon;
        const active = c.count > 0;
        const toneCls =
          c.tone === "danger" && active ? "bg-red-50 border-red-200 hover:bg-red-100" :
          c.tone === "warn"   && active ? "bg-amber-50 border-amber-200 hover:bg-amber-100" :
                                          "bg-card hover:bg-muted/40";
        const numCls =
          c.tone === "danger" && active ? "text-red-600" :
          c.tone === "warn"   && active ? "text-amber-600" :
                                          "text-foreground";
        const iconCls =
          c.tone === "danger" && active ? "text-red-500" :
          c.tone === "warn"   && active ? "text-amber-500" :
                                          "text-muted-foreground";
        return (
          <button
            key={c.preset}
            onClick={() => onSelect(c.preset)}
            className={cn("flex items-center gap-3 rounded-xl border px-4 py-3 transition-colors text-left", toneCls)}
          >
            <Icon className={cn("h-5 w-5 shrink-0", iconCls)} />
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground truncate">{c.label}</p>
              <p className={cn("text-xl font-bold tabular-nums leading-tight", numCls)}>{c.count}</p>
            </div>
          </button>
        );
      })}
    </div>
  );
}
