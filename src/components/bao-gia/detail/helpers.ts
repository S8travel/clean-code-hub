// Helpers cho trang chi tiết Báo giá. Wrap logic format / status / mã BG /
// cost breakdown để các sub-components share consistent output.

import type { BaoGiaCase, BaoGiaItem, BaoGiaKetQua, BaoGiaRow } from "@/hooks/use-bao-gia";
import { calcBaoGia, type ManualItem } from "@/lib/bao-gia-calc";

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

/** 4 slot mặc định mỗi ngày: cảnh điểm, ăn trưa, ăn tối, khách sạn.
 *  Empty rows (don_gia=0) — calcBaoGia bỏ qua items không có giá nên an toàn. */
export function defaultDayItems(dayIdx: number): BaoGiaItem[] {
  return [
    { loai: "ticket", mo_ta: "", don_gia: 0, ghi_chu: "", ngay_so: dayIdx },
    { loai: "meal", bua_an: "trua", mo_ta: "", don_gia: 0, ghi_chu: "", ngay_so: dayIdx },
    { loai: "meal", bua_an: "toi",  mo_ta: "", don_gia: 0, ghi_chu: "", ngay_so: dayIdx },
    { loai: "hotel", mo_ta: "", don_gia: 0, ghi_chu: "", ngay_so: dayIdx },
  ];
}

/** Case trống (giá 0) — báo giá vừa tạo, user điền ở detail page. */
export function emptyBaoGiaCase(guests: number): BaoGiaCase {
  return {
    guests, pax: 0, rooms: 0,
    hotel: 0, meal: 0, ticket: 0, transport: 0,
    insurance: 0, guide: 0, tips: 0,
    total_cost: 0, profit_vnd: 0,
    final_price_vnd: 0, final_price_usd: 0,
  };
}

/** Skeleton ket_qua trống cho báo giá mới (N ngày, 4 slot/ngày). Dùng chung
 *  cho "Tạo báo giá" ở trang Báo giá lẫn tab Báo giá trong Lead. */
export function emptyBaoGiaKetQua(soNgay = 1, tenChuongTrinh = ""): BaoGiaKetQua {
  const days = Math.max(1, soNgay);
  const items = Array.from({ length: days }, (_, i) => defaultDayItems(i + 1)).flat();
  return {
    ten_chuong_trinh: tenChuongTrinh,
    so_ngay: days,
    items,
    case_16: emptyBaoGiaCase(16),
    case_20: emptyBaoGiaCase(20),
    gia_trung_binh_vnd: 0,
    gia_trung_binh_usd: 0,
  };
}

/** Live-recompute case_16 + case_20 + giá trung bình từ items[] + xe_gia +
 *  draft fields. Trả về BaoGiaKetQua "tươi" để các tổng hợp (panel UI, Word
 *  export) dùng chung — KHÔNG đọc case frozen từ AI extract.
 *  Giữ nguyên `items[]` gốc (full metadata: ghi_chu, bua_an, ngay_so) +
 *  giữ `guests` user đã nhập (calcBaoGia hardcode 16/20 trong CASES). */
export function liveKetQua(draft: BaoGiaRow): BaoGiaKetQua | null {
  const ket = draft.ket_qua;
  if (!ket) return null;

  const manualItems: ManualItem[] = (ket.items ?? []).map((it, i) => ({
    id: `${i}`,
    ngay: it.ngay_so ?? 1,
    loai: it.loai,
    mo_ta: it.mo_ta,
    bang_gia_ten: it.mo_ta,
    gia: it.don_gia,
    foc: it.foc ?? 0,
  }));

  const phuThu = draft.phu_thu ?? 0;
  const live = calcBaoGia(
    manualItems,
    ket.ten_chuong_trinh,
    ket.so_ngay ?? 1,
    draft.exchange_rate ?? 26000,
    draft.profit_usd ?? 0,
    draft.xe_gia ?? 0,
    phuThu, // lump-sum vào transport
  );

  return {
    ...ket,
    items: ket.items, // KEEP original items (bao gồm bua_an, ghi_chu, ngay_so)
    case_16: { ...live.case_16, guests: ket.case_16?.guests ?? live.case_16.guests },
    case_20: { ...live.case_20, guests: ket.case_20?.guests ?? live.case_20.guests },
    gia_trung_binh_vnd: live.gia_trung_binh_vnd,
    gia_trung_binh_usd: live.gia_trung_binh_usd,
  };
}

export interface CaseLine {
  khach_san: number;
  an_uong: number;
  xe: number;
  phu_thu_xe: number;
  ve_tham_quan: number;
  hdv: number;
  khac: number;
  tong_von: number;
  profit_vnd: number;
  chenh_lech_xr: number; // chênh lệch tỷ giá VCB vs báo giá rate
  gia_ban: number;
  gia_ban_per_pax: number;
  bien_loi_nhuan_pct: number; // = (profit + chenh_lech) / gia_ban × 100
}

function buildCase(c: BaoGiaCase, guests: number, phuThu: number, profitUsd: number, xr: number, vcbRate: number | null): CaseLine {
  const tongVon = c.total_cost + phuThu;
  const profitVnd = Math.round(profitUsd * guests * xr);
  const giaBan = tongVon + profitVnd;
  // Chênh lệch tỷ giá: customer trả USD = gia_ban / xr; agency thực thu
  // VND = USD × vcb_rate → chênh lệch = USD × (vcb − xr) = gia_ban × (vcb − xr) / xr.
  // Dương khi vcb > xr (agency lời), âm khi vcb < xr (agency lỗ).
  const chenhLech = vcbRate && xr > 0 ? Math.round(giaBan * (vcbRate - xr) / xr) : 0;
  return {
    khach_san:   c.hotel,
    an_uong:     c.meal,
    xe:          c.transport,
    phu_thu_xe:  phuThu,
    ve_tham_quan:c.ticket,
    hdv:         c.guide,
    khac:        c.tips + c.insurance,
    tong_von:    tongVon,
    profit_vnd:  profitVnd,
    chenh_lech_xr: chenhLech,
    gia_ban:     giaBan,
    gia_ban_per_pax: guests > 0 ? Math.round(giaBan / guests) : 0,
    bien_loi_nhuan_pct: giaBan > 0 ? ((profitVnd + chenhLech) / giaBan) * 100 : 0,
  };
}

/** Cost breakdown — 2 phương án 16/20 khách (hardcoded multipliers từ calcBaoGia).
 *  GIÁ BÁN TOUR final = trung bình per-pax của 2 phương án. */
export function costBreakdown(args: {
  ket: BaoGiaKetQua | null;
  exchangeRate: number;
  profitUsd: number;
  xeGia: number | null;
  phuThu: number | null;
  vcbRate: number | null;
}) {
  const { ket, exchangeRate, profitUsd, xeGia, vcbRate } = args;
  if (!ket) return null;

  const manualItems: ManualItem[] = (ket.items ?? []).map((it, i) => ({
    id: `${i}`, ngay: it.ngay_so ?? 1, loai: it.loai,
    mo_ta: it.mo_ta, bang_gia_ten: it.mo_ta, gia: it.don_gia,
    foc: it.foc ?? 0,
  }));
  // Truyền 0 cho phuThu trong calc — phụ thu hiển thị dòng riêng (KHÔNG gộp
  // vào "Xe vận chuyển"). Cộng vào tổng cost vốn ngoài calc.
  const live = calcBaoGia(
    manualItems, ket.ten_chuong_trinh, ket.so_ngay ?? 1,
    exchangeRate, profitUsd, xeGia ?? 0, 0,
  );
  const phuThuVal = args.phuThu ?? 0;
  const case16 = buildCase(live.case_16, 16, phuThuVal, profitUsd, exchangeRate, vcbRate);
  const case20 = buildCase(live.case_20, 20, phuThuVal, profitUsd, exchangeRate, vcbRate);
  const giaBanTbPerPax = Math.round((case16.gia_ban_per_pax + case20.gia_ban_per_pax) / 2);
  const bienTb = (case16.bien_loi_nhuan_pct + case20.bien_loi_nhuan_pct) / 2;
  return {
    case16,
    case20,
    profit_target_usd: profitUsd,
    gia_ban_tb_per_pax: giaBanTbPerPax,
    gia_ban_tb_per_pax_usd: exchangeRate > 0 ? giaBanTbPerPax / exchangeRate : 0,
    bien_loi_nhuan_tb_pct: bienTb,
    exchange_rate: exchangeRate,
    vcb_rate: vcbRate,
  };
}
