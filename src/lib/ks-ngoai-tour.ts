import type { ChiPhiRow } from "@/hooks/use-chi-phi";

export type KsNgoaiTourLoaiRow = "phong" | "dich_vu_khac";

export interface KsNgoaiTourInput {
  id?: number;               // có id → UPDATE, không có → INSERT
  doanId: number;
  khachSanId: number | null; // khách sạn chọn từ danh mục (group key)
  nccId: number | null;      // nha_cung_cap_id suy từ khách sạn (gộp định kỳ)
  loaiRow: KsNgoaiTourLoaiRow;
  loaiPhong: string;         // text "Loại phòng" / tên dịch vụ → mo_ta
  soPhong: number;           // số phòng → so_luong
  focCount: number;          // FOC (số phòng miễn) → foc_count
  ci: string | null;         // check-in YYYY-MM-DD
  co: string | null;         // check-out YYYY-MM-DD
  giaPhong: number;          // giá/phòng (1 đêm) → don_gia
  dinhKy: boolean;           // thanh toán định kỳ
}

/** Số đêm = co − ci (ngày). Thiếu ngày hoặc ≤ 0 → 1 đêm. */
export function nightsBetween(ci?: string | null, co?: string | null): number {
  if (!ci || !co) return 1;
  const a = Date.parse(ci + "T00:00:00");
  const b = Date.parse(co + "T00:00:00");
  if (Number.isNaN(a) || Number.isNaN(b)) return 1;
  const nights = Math.round((b - a) / 86_400_000);
  return nights > 0 ? nights : 1;
}

/** Thành tiền KS ngoài tour = (số phòng − FOC) × giá/phòng × số đêm. Service: đêm = 1. */
export function calcKsNgoaiTourThanhTien(
  soPhong: number, focCount: number, giaPhong: number, soDem: number,
): number {
  const billed = Math.max(0, (Number(soPhong) || 0) - (Number(focCount) || 0));
  return Math.round(billed * (Number(giaPhong) || 0) * (Number(soDem) || 1));
}

/**
 * Dựng payload cho 1 dòng "khách sạn ngoài tour" — mô phỏng dòng KS trong tour
 * nhưng KHÔNG gắn lịch trình (ref = null, ngoai_tour=true). Thành tiền theo công
 * thức FOC (Option A): (số phòng − FOC) × giá × số đêm.
 *
 * thanh_tien (generated = don_gia × so_luong) = giá × số phòng (GROSS 1 đêm, chưa
 * trừ FOC) → KHÔNG đúng số thực. Vì RPC tổng hợp + trang định kỳ đọc
 * COALESCE(thanh_tien_thuc_te, thanh_tien), ta set thanh_tien_thuc_te = net để
 * mọi nơi dùng đúng số thực. tien_cong_ty = net (ChiPhiTab đọc field này).
 */
export function buildKsNgoaiTourPayload(
  input: KsNgoaiTourInput,
): Partial<ChiPhiRow> & { doan_id: number } {
  const giaPhong = Math.max(0, Math.round(input.giaPhong || 0));
  const soPhong = Math.max(0, Number(input.soPhong) || 0);
  const focCount = Math.max(0, Number(input.focCount) || 0);
  const soDem = input.loaiRow === "phong" ? nightsBetween(input.ci, input.co) : 1;
  const net = calcKsNgoaiTourThanhTien(soPhong, focCount, giaPhong, soDem);
  return {
    ...(input.id ? { id: input.id } : {}),
    doan_id: input.doanId,
    loai: "chi",
    danh_muc: "khach_san",
    ngoai_tour: true,
    ref_doan_ngay_id: null,
    ref_doan_ngay_item_id: null,
    khach_san_id: input.khachSanId,
    loai_row: input.loaiRow,
    ngoai_tour_ci: input.ci || null,
    ngoai_tour_co: input.co || null,
    mo_ta: input.loaiPhong.trim() || (input.loaiRow === "phong" ? "Phòng" : "Dịch vụ"),
    don_gia: giaPhong,
    so_luong: soPhong,
    foc_count: focCount,
    tien_cong_ty: net,        // công ty trả; ChiPhiTab đọc field này
    tien_hdv: 0,
    thanh_tien_thuc_te: net,  // số thực (định kỳ + RPC đọc COALESCE(thuc_te, thanh_tien))
    nha_cung_cap_id: input.nccId,
    thanh_toan_dinh_ky: input.dinhKy,
  };
}
