// Helpers cho trang chi tiết Báo giá (P1 shell — read-only display, chưa
// đụng schema). Wrap logic format / status / mã BG để các sub-components
// share consistent output.

import type { BaoGiaCase, BaoGiaItem, BaoGiaKetQua, BaoGiaRow } from "@/hooks/use-bao-gia";

export const fmtVnd = (n: number | null | undefined) =>
  Math.round(Number(n) || 0).toLocaleString("vi-VN");

export const fmtUsd = (n: number | null | undefined) =>
  (Number(n) || 0).toFixed(2);

/** Mã báo giá hiển thị: BG{id padded 5}. Schema chưa có ma_bg → derive từ id.
 *  P2 sẽ chuyển sang field ma_bg thực để search & link. */
export const baoGiaCode = (id: number) => `BG${id.toString().padStart(5, "0")}`;

export const STATUS_INFO: Record<string, { label: string; dotCls: string; textCls: string }> = {
  draft: { label: "Draft",     dotCls: "bg-emerald-500", textCls: "text-emerald-700" },
  final: { label: "Chính thức", dotCls: "bg-blue-500",    textCls: "text-blue-700" },
  sent:  { label: "Đã gửi",     dotCls: "bg-violet-500",  textCls: "text-violet-700" },
};

/** Lấy "primary" case từ ket_qua — ưu tiên case_16 (đa số tour mẫu), fallback case_20. */
export function primaryCase(ket: BaoGiaKetQua | null): BaoGiaCase | null {
  if (!ket) return null;
  return ket.case_16 ?? ket.case_20 ?? null;
}

/** Số pax hiển thị — lấy từ case primary. P2 schema sẽ có pax_tiers riêng. */
export function paxOf(ket: BaoGiaKetQua | null): number {
  return primaryCase(ket)?.guests ?? 0;
}

/** Group items theo loai. Schema hiện KHÔNG có day-grouping → mọi item gom
 *  về Day 1 cho mục đích preview. P2 sẽ split items[].ngay_so. */
export function groupItemsByLoai(items: BaoGiaItem[] | undefined): Record<BaoGiaItem["loai"], BaoGiaItem[]> {
  const out: Record<BaoGiaItem["loai"], BaoGiaItem[]> = {
    hotel: [], meal: [], ticket: [], transport: [],
  };
  (items || []).forEach((it) => { (out[it.loai] ||= []).push(it); });
  return out;
}

/** Cost breakdown cho TỔNG HỢP CHI PHÍ panel — đọc từ primary case.
 *  Trả về null nếu chưa có data. */
export function costBreakdown(row: BaoGiaRow | undefined) {
  const ket = row?.ket_qua;
  const c = primaryCase(ket ?? null);
  if (!ket || !c) return null;
  const exchangeRate = row?.exchange_rate ?? 26000;
  const profitUsd = row?.profit_usd ?? 0;
  return {
    khach_san:   c.hotel,
    an_uong:     c.meal,
    xe:          c.transport,
    ve_tham_quan:c.ticket,
    hdv:         c.guide,
    khac:        c.tips + c.insurance,
    tong_von:    c.total_cost,
    profit_target_usd: profitUsd,
    profit_vnd:  c.profit_vnd,
    phu_thu:     0,
    gia_ban:     c.final_price_vnd,
    gia_ban_per_pax: c.guests > 0 ? Math.round(c.final_price_vnd / c.guests) : 0,
    bien_loi_nhuan_pct: c.final_price_vnd > 0
      ? (c.profit_vnd / c.final_price_vnd) * 100
      : 0,
    exchange_rate: exchangeRate,
  };
}
