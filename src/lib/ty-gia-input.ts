// Quy tắc đọc/ghi cho các ô nhập TỶ GIÁ ở mục "Phải thu".
//
// BUG GỐC (OP báo: "hôm qua sửa tỷ giá rồi, hôm nay vào lại quay về 800"):
//
//   Ô là <Input type="number"> với onChange `Number(e.target.value) || 0`, còn onBlur
//   lưu `tip_ty_gia: v || null`. Muốn sửa tỷ giá thì OP phải XÓA TRẮNG ô để gõ số mới
//   — và ô trống đi qua giá trị 0. Nếu lúc đó ô mất focus (bấm ra ngoài, chuyển tab,
//   ô khác lấy focus), onBlur chạy với v = 0 → `0 || null` = **NULL** → GHI ĐÈ tỷ giá
//   đúng trong DB thành "chưa chốt". Mở lại hôm sau: `null ?? (…|| 800)` → về 800.
//
//   Nặng hơn: onChange còn seed localStorage bằng `String(0)` = "0". Từ đó
//   `Number("0") || 800` = 800 → mọi đoàn CHƯA chốt tỷ giá trên máy đó cũng tụt về
//   800. Một lần xóa trắng ô làm hỏng giá trị mặc định của cả máy.
//
// Nguyên tắc sửa: **ô trống nghĩa là "đang gõ dở", KHÔNG phải "xóa tỷ giá"**. Chỉ ghi
// DB khi có số dương thật. Muốn bỏ tỷ giá thì phải có hành động riêng, không được suy
// ra từ một ô rỗng.
//
// Vì sao tách khỏi component: đây là logic tiền (tỷ giá sai → tip sai → quyết toán HDV
// sai), phải test được mà không cần render.

import { TY_GIA_NDT_DEFAULT } from "./phai-thu-calc";

/** Tỷ giá nhỏ nhất coi là hợp lệ. Dưới mức này = ô trống / gõ dở / rác. */
export const TY_GIA_MIN = 1;

/** Số này có đáng để LƯU không? Ô trống, 0, âm, NaN → không. */
export function isTyGiaHopLe(v: unknown): boolean {
  const n = Number(v);
  return Number.isFinite(n) && n >= TY_GIA_MIN;
}

export interface KeHoachLuuTyGia {
  /** Có gọi mutation không. */
  luu: boolean;
  /** Số sẽ ghi (chỉ dùng khi luu = true). */
  giaTri: number;
}

/**
 * Quyết định có ghi DB không, và ghi số nào.
 *
 *  - Không hợp lệ (trống/0/rác) → KHÔNG ghi. Đây là điểm mấu chốt: tuyệt đối không
 *    bao giờ biến ô trống thành NULL trong DB.
 *  - Trùng giá trị đang có → KHÔNG ghi (khỏi UPDATE thừa + invalidate làm nháy UI).
 *
 * `dbValue` nhận cả number lẫn string vì cột là `numeric` — tùy tầng mà về dạng nào.
 */
export function planSaveTyGia(
  v: unknown,
  dbValue: number | string | null | undefined,
): KeHoachLuuTyGia {
  if (!isTyGiaHopLe(v)) return { luu: false, giaTri: 0 };
  const next = Number(v);
  const hienTai = dbValue == null ? null : Number(dbValue);
  return next === hienTai ? { luu: false, giaTri: next } : { luu: true, giaTri: next };
}

/**
 * Tỷ giá để HIỂN THỊ: ưu tiên số đã chốt trên đoàn → mặc định của máy (localStorage)
 * → hằng số 800.
 *
 * localStorage rác ("0", "", "abc") bị BỎ QUA thay vì kéo tụt về 800 — chính chỗ này
 * là nơi con "0" độc hại từng lọt qua.
 */
export function resolveTyGia(
  dbValue: number | string | null | undefined,
  localRaw: string | null | undefined,
  macDinh: number = TY_GIA_NDT_DEFAULT,
): number {
  const tuDoan = dbValue == null ? NaN : Number(dbValue);
  if (isTyGiaHopLe(tuDoan)) return tuDoan;

  const tuMay = Number(localRaw);
  if (isTyGiaHopLe(tuMay)) return tuMay;

  return macDinh;
}

/**
 * Có nên ghi số này xuống localStorage làm mặc định cho đoàn mới không?
 * Chỉ khi hợp lệ — nếu không, một lần xóa trắng ô sẽ đầu độc mặc định của cả máy.
 */
export function nenSeedLocal(v: unknown): boolean {
  return isTyGiaHopLe(v);
}
