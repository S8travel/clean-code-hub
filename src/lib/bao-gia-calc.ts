import type { BaoGiaKetQua, BaoGiaCase, BaoGiaItem } from "@/hooks/use-bao-gia";

export interface ManualItem {
  id: string;
  ngay: number;
  loai: "hotel" | "meal" | "ticket" | "transport" | "extra";
  mo_ta: string;
  bang_gia_ten: string;
  gia: number | null;
  // FOC trừ khỏi multiplier (rooms cho hotel, pax cho meal/ticket).
  // Default 0 nếu không khai báo.
  foc?: number;
}

interface CaseConfig {
  guests: number;
  pax: number;
  rooms: number;
}

/** Cấu hình 1 bậc giá từ số khách: pax = khách + 1 HDV, phòng = ceil(khách/2) + 1
 *  (phòng twin + 1 phòng HDV). Khớp 2 mức cũ: 16→17pax/9phòng, 20→21pax/11phòng. */
export function tierConfig(guests: number): CaseConfig {
  const g = Math.max(1, Math.round(guests));
  return { guests: g, pax: g + 1, rooms: Math.ceil(g / 2) + 1 };
}

export function calcCase(
  items: ManualItem[],
  soNgay: number,
  exchangeRate: number,
  profitUsd: number,
  cfg: CaseConfig,
  tienXe: number,
  tienPhuThu: number,
): BaoGiaCase {
  const { guests, pax, rooms } = cfg;

  // FOC trừ khỏi multiplier per item. clamp 0 để không lỗ ngược.
  const hotel = items
    .filter((i) => i.loai === "hotel" && i.gia)
    .reduce((s, i) => s + Math.max(0, rooms - (i.foc ?? 0)) * i.gia!, 0);

  const meal = items
    .filter((i) => i.loai === "meal" && i.gia)
    .reduce((s, i) => s + Math.max(0, pax - (i.foc ?? 0)) * i.gia!, 0);

  const ticket = items
    .filter((i) => i.loai === "ticket" && i.gia)
    .reduce((s, i) => s + Math.max(0, pax - (i.foc ?? 0)) * i.gia!, 0);

  // transport: lump-sum, KHÔNG áp FOC (catalog xe luôn foc=0).
  const transport = tienXe + tienPhuThu + items
    .filter((i) => (i.loai === "transport" || i.loai === "extra") && i.gia)
    .reduce((s, i) => s + i.gia!, 0);

  const insurance = 100_000 * pax;
  const guide = 200_000 * soNgay;
  const tips = 500_000;

  const total_cost = hotel + meal + ticket + transport + insurance + guide + tips;
  const profit_vnd = profitUsd * exchangeRate * guests;
  const final_price_vnd = Math.round((total_cost + profit_vnd) / guests);
  const final_price_usd = final_price_vnd / exchangeRate;

  return { guests, pax, rooms, hotel, meal, ticket, transport, insurance, guide, tips, total_cost, profit_vnd, final_price_vnd, final_price_usd };
}

/** Tính 1 BaoGiaCase cho 1 số khách bất kỳ (1 bậc). */
export function calcTier(
  items: ManualItem[],
  soNgay: number,
  exchangeRate: number,
  profitUsd: number,
  guests: number,
  tienXe = 0,
  tienPhuThu = 0,
): BaoGiaCase {
  return calcCase(items, soNgay, exchangeRate, profitUsd, tierConfig(guests), tienXe, tienPhuThu);
}

/** Ma trận giá: 1 BaoGiaCase cho MỖI số khách trong danh sách (bậc tuỳ ý). */
export function calcTiers(
  items: ManualItem[],
  soNgay: number,
  exchangeRate: number,
  profitUsd: number,
  guestsList: number[],
  tienXe = 0,
  tienPhuThu = 0,
): BaoGiaCase[] {
  return guestsList.map((g) => calcTier(items, soNgay, exchangeRate, profitUsd, g, tienXe, tienPhuThu));
}

export function calcBaoGia(
  items: ManualItem[],
  tenChuongTrinh: string,
  soNgay: number,
  exchangeRate: number,
  profitUsd: number,
  tienXe = 0,
  tienPhuThu = 0,
): BaoGiaKetQua {
  // 2 mức 16/20 (back-compat) — tái dùng engine bậc.
  const [case_16, case_20] = calcTiers(items, soNgay, exchangeRate, profitUsd, [16, 20], tienXe, tienPhuThu);

  const gia_trung_binh_vnd = Math.round((case_16.final_price_vnd + case_20.final_price_vnd) / 2);
  const gia_trung_binh_usd = (case_16.final_price_usd + case_20.final_price_usd) / 2;

  // Map ManualItem → BaoGiaItem format (giữ foc snapshot)
  const baoGiaItems = items
    .filter((i) => i.gia)
    .map((i) => ({
      loai: (i.loai === "extra" ? "transport" : i.loai) satisfies BaoGiaItem["loai"],
      mo_ta: i.bang_gia_ten || i.mo_ta,
      don_gia: i.gia!,
      ghi_chu: "",
      foc: i.foc ?? 0,
    }));

  return {
    ten_chuong_trinh: tenChuongTrinh,
    so_ngay: soNgay,
    items: baoGiaItems,
    case_16,
    case_20,
    gia_trung_binh_vnd,
    gia_trung_binh_usd,
  };
}
