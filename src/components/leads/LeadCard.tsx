import { memo } from "react";
import { format, isBefore, isToday, startOfDay } from "date-fns";
import { Phone, Calendar } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  LEAD_TRANG_THAI_OPTS,
  LEAD_NGUON_OPTS,
  type Lead,
} from "@/hooks/use-leads";

interface Props {
  lead: Lead;
  onClick?: () => void;
  dragging?: boolean;
}

function initials(name: string) {
  return name.trim().split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase();
}

function nguonLabel(v: string) {
  return LEAD_NGUON_OPTS.find((o) => o.value === v)?.label ?? v;
}

const NGUON_COLOR: Record<string, string> = {
  facebook_ads: "bg-blue-50 text-blue-600 border-blue-100",
  zalo_oa: "bg-teal-50 text-teal-600 border-teal-100",
  website: "bg-purple-50 text-purple-600 border-purple-100",
  hotline: "bg-orange-50 text-orange-600 border-orange-100",
  walk_in: "bg-green-50 text-green-600 border-green-100",
  referral: "bg-pink-50 text-pink-600 border-pink-100",
  doi_tac: "bg-indigo-50 text-indigo-600 border-indigo-100",
};

const UU_TIEN_COLOR: Record<string, string> = {
  cao: "bg-red-100 text-red-700",
  trung_binh: "bg-yellow-100 text-yellow-700",
  thap: "bg-gray-100 text-gray-600",
};

export const LeadCard = memo(function LeadCard({ lead, onClick, dragging }: Props) {
  const today = startOfDay(new Date());
  const overdue =
    lead.ngay_follow_up_tiep &&
    isBefore(startOfDay(new Date(lead.ngay_follow_up_tiep)), today);
  const followToday =
    lead.ngay_follow_up_tiep && isToday(new Date(lead.ngay_follow_up_tiep));

  const diemDenList = lead.diem_den ?? [];
  const statusLabel = LEAD_TRANG_THAI_OPTS.find((o) => o.value === lead.trang_thai)?.label;

  return (
    <div
      onClick={onClick}
      className={cn(
        "bg-background rounded-lg border p-3 space-y-2 cursor-pointer hover:shadow-md transition-shadow select-none",
        overdue && "border-red-300",
        dragging && "shadow-xl rotate-1 opacity-90"
      )}
    >
      {/* Name + priority */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold truncate">{lead.ho_ten}</p>
          {lead.ten_to_chuc && (
            <p className="text-xs text-muted-foreground truncate">{lead.ten_to_chuc}</p>
          )}
          {lead.so_dien_thoai && (
            <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
              <Phone className="h-3 w-3" /> {lead.so_dien_thoai}
            </p>
          )}
        </div>
        {lead.uu_tien && lead.uu_tien !== "trung_binh" && (
          <span className={cn("text-[10px] px-1.5 py-0.5 rounded-full shrink-0", UU_TIEN_COLOR[lead.uu_tien])}>
            {lead.uu_tien === "cao" ? "Cao" : "Thấp"}
          </span>
        )}
      </div>

      {/* Nguồn badge */}
      <span className={cn("inline-block text-[10px] px-1.5 py-0.5 rounded border", NGUON_COLOR[lead.nguon] ?? "bg-gray-50 text-gray-600 border-gray-100")}>
        {nguonLabel(lead.nguon)}
      </span>

      {/* Điểm đến */}
      {diemDenList.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {diemDenList.slice(0, 2).map((d) => (
            <span key={d.id} className="text-[10px] bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded-full">
              {d.diem_den}
            </span>
          ))}
          {diemDenList.length > 2 && (
            <span className="text-[10px] text-muted-foreground">+{diemDenList.length - 2}</span>
          )}
        </div>
      )}

      {/* Footer: sales + follow-up */}
      <div className="flex items-center justify-between pt-1 border-t border-border/40">
        {lead.assigned_to ? (
          <div className="h-5 w-5 rounded-full bg-primary/10 text-primary text-[9px] font-bold flex items-center justify-center">
            {initials(lead.assigned_to.slice(0, 4))}
          </div>
        ) : (
          <div className="h-5 w-5 rounded-full bg-muted" />
        )}
        {lead.ngay_follow_up_tiep && (
          <span className={cn("text-[10px] flex items-center gap-0.5",
            overdue ? "text-red-500 font-medium" : followToday ? "text-amber-500 font-medium" : "text-muted-foreground"
          )}>
            <Calendar className="h-3 w-3" />
            {format(new Date(lead.ngay_follow_up_tiep), "dd/MM")}
          </span>
        )}
      </div>
    </div>
  );
});
