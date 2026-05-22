import type { BaoGiaKetQua, BaoGiaCase, BaoGiaItem } from "@/hooks/use-bao-gia";

export interface ManualItem {
  id: string;
  ngay: number;
  loai: "hotel" | "meal" | "ticket" | "transport" | "extra";
  mo_ta: string;
  bang_gia_ten: string;
  gia: number | null;
}

interface CaseConfig {
  guests: number;
  pax: number;
  rooms: number;
}

const CASES: CaseConfig[] = [
  { guests: 16, pax: 17, rooms: 9 },
  { guests: 20, pax: 21, rooms: 11 },
];

function calcCase(
  items: ManualItem[],
  soNgay: number,
  exchangeRate: number,
  profitUsd: number,
  cfg: CaseConfig,
  tienXe: number,
  tienPhuThu: number,
): BaoGiaCase {
  const { guests, pax, rooms } = cfg;

  const hotel = items
    .filter((i) => i.loai === "hotel" && i.gia)
    .reduce((s, i) => s + i.gia! * rooms, 0);

  const meal = items
    .filter((i) => i.loai === "meal" && i.gia)
    .reduce((s, i) => s + i.gia! * pax, 0);

  const ticket = items
    .filter((i) => i.loai === "ticket" && i.gia)
    .reduce((s, i) => s + i.gia! * pax, 0);

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

export function calcBaoGia(
  items: ManualItem[],
  tenChuongTrinh: string,
  soNgay: number,
  exchangeRate: number,
  profitUsd: number,
  tienXe = 0,
  tienPhuThu = 0,
): BaoGiaKetQua {
  const [case_16, case_20] = CASES.map((cfg) =>
    calcCase(items, soNgay, exchangeRate, profitUsd, cfg, tienXe, tienPhuThu)
  );

  const gia_trung_binh_vnd = Math.round((case_16.final_price_vnd + case_20.final_price_vnd) / 2);
  const gia_trung_binh_usd = (case_16.final_price_usd + case_20.final_price_usd) / 2;

  // Map ManualItem → BaoGiaItem format
  const baoGiaItems = items
    .filter((i) => i.gia)
    .map((i) => ({
      loai: (i.loai === "extra" ? "transport" : i.loai) satisfies BaoGiaItem["loai"],
      mo_ta: i.bang_gia_ten || i.mo_ta,
      don_gia: i.gia!,
      ghi_chu: "",
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
