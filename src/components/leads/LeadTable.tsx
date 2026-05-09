import { format, isBefore, isToday, startOfDay } from "date-fns";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  LEAD_TRANG_THAI_OPTS,
  LEAD_NGUON_OPTS,
  type Lead,
} from "@/hooks/use-leads";
import { useUserRoles } from "@/hooks/use-doan";

interface Props {
  leads: Lead[];
  onRowClick: (lead: Lead) => void;
}

const STATUS_COLOR: Record<string, string> = {
  moi:          "bg-blue-100 text-blue-700",
  da_lien_he:   "bg-cyan-100 text-cyan-700",
  dang_tu_van:  "bg-amber-100 text-amber-700",
  da_bao_gia:   "bg-violet-100 text-violet-700",
  cho_chot:     "bg-orange-100 text-orange-700",
  chot_deal:    "bg-green-100 text-green-700",
  mat_khach:    "bg-gray-100 text-gray-600",
};

const NGUON_COLOR: Record<string, string> = {
  facebook_ads: "bg-blue-50 text-blue-600",
  zalo_oa:      "bg-teal-50 text-teal-600",
  website:      "bg-purple-50 text-purple-600",
  hotline:      "bg-orange-50 text-orange-600",
  walk_in:      "bg-green-50 text-green-600",
  referral:     "bg-pink-50 text-pink-600",
  doi_tac:      "bg-indigo-50 text-indigo-600",
};

const UU_TIEN_COLOR: Record<string, string> = {
  cao:       "bg-red-100 text-red-700",
  trung_binh:"bg-yellow-100 text-yellow-700",
  thap:      "bg-gray-100 text-gray-500",
};

const B2B_TYPES = ["cong_ty", "truong_hoc", "agent_doi_tac"];

function initials(name: string) {
  return name.trim().split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase();
}

export function LeadTable({ leads, onRowClick }: Props) {
  const { data: userRoles = [] } = useUserRoles();
  const today = startOfDay(new Date());

  const getUserName = (userId: string | null) => {
    if (!userId) return null;
    return userRoles.find((u) => u.user_id === userId)?.ho_ten ?? null;
  };

  const hasB2B = leads.some((l) => B2B_TYPES.includes(l.loai_khach ?? ""));

  if (leads.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
        <p className="text-sm">Không có lead nào</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="bg-[#E6F1FB] text-left">
            <th className="py-1.5 px-2 font-medium whitespace-nowrap">Tên / SĐT</th>
            {hasB2B && <th className="py-1.5 px-2 font-medium whitespace-nowrap">Tổ chức</th>}
            <th className="py-1.5 px-2 font-medium whitespace-nowrap">Nguồn</th>
            <th className="py-1.5 px-2 font-medium whitespace-nowrap">Điểm đến</th>
            <th className="py-1.5 px-2 font-medium whitespace-nowrap">Sales</th>
            <th className="py-1.5 px-2 font-medium whitespace-nowrap">Trạng thái</th>
            <th className="py-1.5 px-2 font-medium whitespace-nowrap">Follow-up</th>
            <th className="py-1.5 px-2 font-medium whitespace-nowrap">Ưu tiên</th>
            <th className="py-1.5 px-2 w-8" />
          </tr>
        </thead>
        <tbody>
          {leads.map((lead) => {
            const overdue =
              lead.ngay_follow_up_tiep &&
              isBefore(startOfDay(new Date(lead.ngay_follow_up_tiep)), today);
            const followToday =
              lead.ngay_follow_up_tiep && isToday(new Date(lead.ngay_follow_up_tiep));
            const isB2B = B2B_TYPES.includes(lead.loai_khach ?? "");
            const diemDen = lead.diem_den ?? [];
            const salesName = getUserName(lead.assigned_to);
            const statusLabel = LEAD_TRANG_THAI_OPTS.find((o) => o.value === lead.trang_thai)?.label;
            const nguonLabel = LEAD_NGUON_OPTS.find((o) => o.value === lead.nguon)?.label ?? lead.nguon;

            return (
              <tr
                key={lead.id}
                onClick={() => onRowClick(lead)}
                className="border-b border-border/40 hover:bg-muted/40 cursor-pointer transition-colors"
              >
                {/* Tên + SĐT */}
                <td className="py-1.5 px-2">
                  <p className="font-medium truncate max-w-[160px]">{lead.ho_ten}</p>
                  {lead.so_dien_thoai && (
                    <p className="text-muted-foreground">{lead.so_dien_thoai}</p>
                  )}
                </td>

                {/* Tổ chức (chỉ khi B2B có trong danh sách) */}
                {hasB2B && (
                  <td className="py-1.5 px-2">
                    {isB2B && lead.ten_to_chuc ? (
                      <span className="truncate max-w-[120px] block">{lead.ten_to_chuc}</span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                )}

                {/* Nguồn */}
                <td className="py-1.5 px-2">
                  <span className={cn("px-1.5 py-0.5 rounded text-[10px] font-medium", NGUON_COLOR[lead.nguon] ?? "bg-gray-50 text-gray-600")}>
                    {nguonLabel}
                  </span>
                </td>

                {/* Điểm đến */}
                <td className="py-1.5 px-2">
                  <div className="flex flex-wrap gap-1">
                    {diemDen.slice(0, 3).map((d) => (
                      <span key={d.id} className="bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded-full text-[10px]">
                        {d.diem_den}
                      </span>
                    ))}
                    {diemDen.length > 3 && (
                      <span className="text-muted-foreground text-[10px]">+{diemDen.length - 3}</span>
                    )}
                    {diemDen.length === 0 && <span className="text-muted-foreground">—</span>}
                  </div>
                </td>

                {/* Sales */}
                <td className="py-1.5 px-2">
                  {salesName ? (
                    <div className="flex items-center gap-1.5">
                      <div className="h-5 w-5 rounded-full bg-primary/10 text-primary text-[9px] font-bold flex items-center justify-center shrink-0">
                        {initials(salesName)}
                      </div>
                      <span className="truncate max-w-[80px]">{salesName}</span>
                    </div>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </td>

                {/* Trạng thái */}
                <td className="py-1.5 px-2">
                  <span className={cn("px-2 py-0.5 rounded-full text-[10px] font-medium", STATUS_COLOR[lead.trang_thai] ?? "bg-gray-100 text-gray-600")}>
                    {statusLabel}
                  </span>
                </td>

                {/* Follow-up */}
                <td className="py-1.5 px-2 whitespace-nowrap">
                  {lead.ngay_follow_up_tiep ? (
                    <span className={cn(
                      overdue ? "text-red-500 font-medium" :
                      followToday ? "text-amber-500 font-medium" : ""
                    )}>
                      {format(new Date(lead.ngay_follow_up_tiep), "dd/MM/yyyy")}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </td>

                {/* Ưu tiên */}
                <td className="py-1.5 px-2">
                  {lead.uu_tien ? (
                    <span className={cn("px-1.5 py-0.5 rounded text-[10px] font-medium",
                      UU_TIEN_COLOR[lead.uu_tien] ?? "bg-gray-100 text-gray-600"
                    )}>
                      {lead.uu_tien === "cao" ? "Cao" : lead.uu_tien === "trung_binh" ? "TB" : "Thấp"}
                    </span>
                  ) : "—"}
                </td>

                {/* Action */}
                <td className="py-1.5 px-2">
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
