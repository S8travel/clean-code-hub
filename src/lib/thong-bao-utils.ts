// Helper dùng chung cho thông báo: NotificationBell (chuông) + ThongBaoPage (trang
// tất cả thông báo). Tách khỏi component để 2 nơi không lệch logic.
import { format, formatDistanceToNow, isToday, isYesterday, isThisWeek } from "date-fns";
import { vi } from "date-fns/locale";
import { t } from "@/lib/i18n";
import type { ThongBaoRow } from "@/hooks/use-thong-bao";

export const ICON_BY_LOAI: Record<string, string> = {
  // Deadline
  deadline:                  "🔥",
  deadline_lock_phong:       "🔥",
  deadline_booking:          "🔥",
  // Công việc
  giao_viec:                 "💼",
  thong_tin_doan:            "🔄",
  dntt_can_duyet:            "✅",
  // Tiền / Invoice
  gia:                       "💰",
  // Sự cố
  su_co:                     "⚠️",
  // Lead
  lead_moi:                  "🆕",
  lead_chuyen_giao:          "👥",
  lead_qua_han:              "🔥",
  lead_follow_up_today:      "⏰",
  lead_lanh:                 "🥶",
};

export function iconFor(loai: string) {
  return ICON_BY_LOAI[loai] ?? "🔔";
}

export const TAB_FILTER: Record<string, (loai: string) => boolean> = {
  all:       () => true,
  deadline:  (l) => l.startsWith("deadline") || l === "lead_qua_han" || l === "lead_follow_up_today",
  cong_viec: (l) => l === "giao_viec" || l === "dntt_can_duyet" || l === "thong_tin_doan",
  khac:      (l) => !l.startsWith("deadline") && l !== "giao_viec" && l !== "dntt_can_duyet" && l !== "thong_tin_doan" && l !== "lead_qua_han" && l !== "lead_follow_up_today",
};

export function groupByTime(items: ThongBaoRow[]) {
  const groups: { label: string; items: ThongBaoRow[] }[] = [
    { label: t("Hôm nay"),   items: [] },
    { label: t("Hôm qua"),   items: [] },
    { label: t("Tuần này"),  items: [] },
    { label: t("Cũ hơn"),    items: [] },
  ];
  for (const it of items) {
    const d = new Date(it.created_at);
    if (isToday(d))           groups[0].items.push(it);
    else if (isYesterday(d))  groups[1].items.push(it);
    else if (isThisWeek(d))   groups[2].items.push(it);
    else                      groups[3].items.push(it);
  }
  return groups.filter((g) => g.items.length > 0);
}

// Bản sao logic này nằm trong edge fn supabase/functions/send-push/index.ts
// (không import được code src/) — sửa bên đây thì sửa cả bên đó.
export function targetUrl(tb: ThongBaoRow): string | null {
  const { loai, doan_id, cong_viec_id } = tb;
  if (loai.startsWith("deadline") && doan_id) return `/doan/${doan_id}`;
  if (loai === "giao_viec" && cong_viec_id)   return `/my-job?cong_viec=${cong_viec_id}`;
  // Hủy đoàn: trigger tạo thong_bao loai='giao_viec' KHÔNG kèm cong_viec_id
  // (task tạo riêng) → fallback về trang đoàn để OP thấy & đi hủy dịch vụ.
  if (loai === "giao_viec" && doan_id)        return `/doan/${doan_id}`;
  if (loai === "dntt_can_duyet")              return `/de-nghi-thanh-toan`;
  if (loai === "su_co" && doan_id)            return `/doan/${doan_id}?tab=log`;
  if (loai.startsWith("lead_"))               return `/leads`;
  if (loai === "gia" && doan_id)              return `/doan/${doan_id}`;
  // Đổi số khách/ngày/địa điểm (trigger fn_doan_phanviec_events)
  if (loai === "thong_tin_doan" && doan_id)   return `/doan/${doan_id}`;
  return null;
}

/** Giờ cụ thể của thông báo, vd "08:52 12/06/2026". */
export function fmtThongBaoTime(iso: string): string {
  return format(new Date(iso), "HH:mm dd/MM/yyyy");
}

/** Thời gian tương đối, vd "1 phút trước". */
export function fmtThongBaoRelative(iso: string): string {
  return formatDistanceToNow(new Date(iso), { addSuffix: true, locale: vi });
}
