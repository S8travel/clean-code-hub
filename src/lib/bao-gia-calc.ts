import type { BaoGiaKetQua, BaoGiaCase, BaoGiaItem, GiaCuoiTier } from "@/hooks/use-bao-gia";

export interface ManualItem {
  id: string;
  ngay: number;
  loai: "hotel" | "meal" | "ticket" | "transport" | "extra";
  mo_ta: string;
  bang_gia_ten: string;
  gia: number | null;
  // FOC trừ khỏi multiplier (rooms cho hotel, pax cho meal/ticket).
  // = SỐ MIỄN nhập tay (override). null/undefined → auto theo chính sách bên dưới.
  foc?: number;
  // Chính sách FOC nhà hàng (snapshot master): foc_khach miễn foc_mien.
  // Khi foc (override) vắng → tự tính số miễn = floor(count / foc_khach) × foc_mien.
  foc_khach?: number;
  foc_mien?: number;
  // N (次/N数): số đêm (KS) / số lần (ăn, vé) / số chuyến (xe). Nhân thêm vào
  // thành tiền. Default 1 nếu không khai báo (back-compat item cũ).
  so_luong?: number;
}

/** Số suất/phòng MIỄN của 1 item ở quy mô `count` (pax cho ăn/vé, rooms cho KS):
 *  - foc (override nhập tay) có giá trị → dùng luôn (cố định mọi cỡ đoàn);
 *  - else có chính sách foc_khach → tự tính floor(count / foc_khach) × foc_mien;
 *  - else 0. */
export function effItemFoc(
  i: { foc?: number; foc_khach?: number; foc_mien?: number }, count: number,
): number {
  if (i.foc != null) return i.foc;
  if (i.foc_khach && i.foc_khach > 0) return Math.floor(count / i.foc_khach) * (i.foc_mien ?? 0);
  return 0;
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

  // FOC (số miễn) trừ khỏi multiplier per item — auto theo chính sách hoặc
  // override nhập tay (effItemFoc), rồi nhân N (so_luong). clamp 0.
  const hotel = items
    .filter((i) => i.loai === "hotel" && i.gia)
    .reduce((s, i) => s + Math.max(0, rooms - effItemFoc(i, rooms)) * i.gia! * (i.so_luong ?? 1), 0);

  const meal = items
    .filter((i) => i.loai === "meal" && i.gia)
    .reduce((s, i) => s + Math.max(0, pax - effItemFoc(i, pax)) * i.gia! * (i.so_luong ?? 1), 0);

  const ticket = items
    .filter((i) => i.loai === "ticket" && i.gia)
    .reduce((s, i) => s + Math.max(0, pax - effItemFoc(i, pax)) * i.gia! * (i.so_luong ?? 1), 0);

  // transport: lump-sum × N, KHÔNG áp FOC (catalog xe luôn foc=0).
  const transport = tienXe + tienPhuThu + items
    .filter((i) => (i.loai === "transport" || i.loai === "extra") && i.gia)
    .reduce((s, i) => s + i.gia! * (i.so_luong ?? 1), 0);

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
      foc: i.foc,
      foc_khach: i.foc_khach,
      foc_mien: i.foc_mien,
      so_luong: i.so_luong ?? 1,
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

// ── Giá cuối (land tour — giá chốt sẵn, nhập tay theo bậc) ───────────────────

/** 1 dòng bảng giá cuối đã chuẩn hoá. Khớp shape TierPrice của Word export. */
export interface GiaCuoiTierLine {
  guests: number;
  gia_ban_vnd: number;
  gia_ban_usd: number;
}

/** Chuẩn hoá bảng giá cuối nhập tay → dòng hiển thị / xuất:
 *  - làm tròn VND, tính USD = VND / tỷ giá (rate ≤ 0 → USD = 0, tránh chia 0),
 *  - lọc bậc không hợp lệ (guests ≤ 0),
 *  - sắp xếp tăng dần theo số khách.
 *  KHÔNG tính từ dịch vụ — giá là giá chốt, chỉ quy đổi USD. */
export function giaCuoiTierLines(
  tiers: GiaCuoiTier[] | undefined,
  exchangeRate: number,
): GiaCuoiTierLine[] {
  return (tiers ?? [])
    .filter((t) => t.guests > 0)
    .slice()
    .sort((a, b) => a.guests - b.guests)
    .map((t) => {
      const vnd = Math.round(t.gia_ban_vnd || 0);
      return {
        guests: Math.round(t.guests),
        gia_ban_vnd: vnd,
        gia_ban_usd: exchangeRate > 0 ? vnd / exchangeRate : 0,
      };
    });
}

/** 1 bậc giá đã suy ra KHOẢNG khách. Mô hình "ngưỡng": mỗi bậc lưu 1 số = số
 *  khách TỐI THIỂU áp dụng; cận trên = (ngưỡng bậc kế − 1), bậc cuối để mở. */
export interface GiaCuoiBracket {
  guests_from: number;
  guests_to: number | null; // null = mở (bậc cuối, "từ X khách")
  gia_ban_vnd: number;
  gia_ban_usd: number;
  label: string; // "10–15 khách" | "từ 26 khách" | "10 khách"
}

/** Suy KHOẢNG khách cho mỗi bậc từ các ngưỡng "từ X". Khoảng tự nối liền theo
 *  ngưỡng kế tiếp → không thể hở/chồng. Bậc cuối mở ("từ X khách"). */
export function giaCuoiBrackets(
  tiers: GiaCuoiTier[] | undefined,
  exchangeRate: number,
): GiaCuoiBracket[] {
  const lines = giaCuoiTierLines(tiers, exchangeRate);
  return lines.map((l, i) => {
    const next = lines[i + 1];
    const to = next ? next.guests - 1 : null;
    let label: string;
    if (to == null) label = `từ ${l.guests} khách`;
    else if (to <= l.guests) label = `${l.guests} khách`;
    else label = `${l.guests}–${to} khách`;
    return {
      guests_from: l.guests,
      guests_to: to,
      gia_ban_vnd: l.gia_ban_vnd,
      gia_ban_usd: l.gia_ban_usd,
      label,
    };
  });
}

/** Index bậc áp dụng cho số khách `pax` (ngưỡng cao nhất ≤ pax). Trả -1 khi
 *  pax ≤ 0 hoặc nhỏ hơn bậc thấp nhất (không bậc nào phủ). */
export function findBracketIndexForPax(brackets: GiaCuoiBracket[], pax: number): number {
  if (!pax || pax <= 0) return -1;
  let idx = -1;
  for (let i = 0; i < brackets.length; i++) {
    if (pax >= brackets[i].guests_from) idx = i;
    else break;
  }
  return idx;
}
