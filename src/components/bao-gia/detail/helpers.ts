// Helpers cho trang chi tiết Báo giá. Wrap logic format / status / mã BG /
// cost breakdown để các sub-components share consistent output.

import type { BaoGiaCase, BaoGiaItem, BaoGiaKetQua, BaoGiaRow } from "@/hooks/use-bao-gia";

export const fmtVnd = (n: number | null | undefined) =>
  Math.round(Number(n) || 0).toLocaleString("vi-VN");

export const fmtUsd = (n: number | null | undefined) =>
  (Number(n) || 0).toFixed(2);

/** Mã báo giá hiển thị. Ưu tiên field thực ma_bg (generated col), fallback
 *  derive từ id cho trường hợp gọi sớm trước khi row load đủ. */
export const baoGiaCode = (row: { id: number; ma_bg?: string | null }): string =>
  row.ma_bg ?? `BG${row.id.toString().padStart(5, "0")}`;

export const STATUS_INFO: Record<string, { label: string; dotCls: string; textCls: string }> = {
  draft: { label: "Draft",     dotCls: "bg-emerald-500", textCls: "text-emerald-700" },
  final: { label: "Chính thức", dotCls: "bg-blue-500",    textCls: "text-blue-700" },
  sent:  { label: "Đã gửi",     dotCls: "bg-violet-500",  textCls: "text-violet-700" },
};

/** Lấy "primary" case từ ket_qua — ưu tiên case_16, fallback case_20. */
export function primaryCase(ket: BaoGiaKetQua | null): BaoGiaCase | null {
  if (!ket) return null;
  return ket.case_16 ?? ket.case_20 ?? null;
}

/** Số pax hiển thị — lấy từ case primary. */
export function paxOf(ket: BaoGiaKetQua | null): number {
  return primaryCase(ket)?.guests ?? 0;
}

/** Group items theo loai. */
export function groupItemsByLoai(items: BaoGiaItem[] | undefined): Record<BaoGiaItem["loai"], BaoGiaItem[]> {
  const out: Record<BaoGiaItem["loai"], BaoGiaItem[]> = {
    hotel: [], meal: [], ticket: [], transport: [],
  };
  (items || []).forEach((it) => { (out[it.loai] ||= []).push(it); });
  return out;
}

/** Filter items thuộc 1 ngày cụ thể (1-based). Item KHÔNG có ngay_so → coi
 *  như Day 1 (back-compat cho data AI cũ).
 *  Trả về object grouped theo loai để DayPanel render từng category. */
export function itemsOfDay(items: BaoGiaItem[] | undefined, day: number): Record<BaoGiaItem["loai"], BaoGiaItem[]> {
  const filtered = (items || []).filter((it) => (it.ngay_so ?? 1) === day);
  return groupItemsByLoai(filtered);
}

/** Cost breakdown — recompute theo live values. KHI user edit Pax / profit /
 *  xr, panel sẽ refresh ngay vì props đổi.
 *  - Cost vốn (hotel/meal/ticket/transport/guide/tips/insurance): vẫn lấy từ
 *    primary case (đã AI tính). Khi pax thay đổi sẽ stale tới P4.
 *  - Profit + price + biên: live recompute theo profit_usd * pax * xr. */
export function costBreakdown(args: {
  ket: BaoGiaKetQua | null;
  exchangeRate: number;
  profitUsd: number;
  pax: number;
}) {
  const { ket, exchangeRate, profitUsd, pax } = args;
  const c = primaryCase(ket);
  if (!ket || !c) return null;
  const tongVon = c.total_cost;
  const profitVnd = Math.round(profitUsd * pax * exchangeRate);
  const giaBan = tongVon + profitVnd;
  return {
    khach_san:   c.hotel,
    an_uong:     c.meal,
    xe:          c.transport,
    ve_tham_quan:c.ticket,
    hdv:         c.guide,
    khac:        c.tips + c.insurance,
    tong_von:    tongVon,
    profit_target_usd: profitUsd,
    profit_vnd:  profitVnd,
    phu_thu:     0,
    gia_ban:     giaBan,
    gia_ban_per_pax: pax > 0 ? Math.round(giaBan / pax) : 0,
    bien_loi_nhuan_pct: giaBan > 0 ? (profitVnd / giaBan) * 100 : 0,
    exchange_rate: exchangeRate,
  };
}
