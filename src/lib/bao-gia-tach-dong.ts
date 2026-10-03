// TÁCH DÒNG — dịch vụ phải tính tiền riêng mà đối tác viết lẫn trong MỘT dòng
// lịch trình: "雲頂纜車+攻頂小火車" (cáp treo nằm trong combo, tàu leo đỉnh thì
// không), "胡志明陵寢、胡志明故居、胡志明博物館" (vé cụm Ba Đình không gồm bảo tàng).
//
// Luật thêm MỘT dòng mới cho dịch vụ đó, đặt ở CUỐI mảng: chỉ số các dòng cũ giữ
// nguyên — lựa chọn phương án khách sạn của bản nháp lưu theo chỉ số dòng.
// Dòng gốc ghi lại là đã tách (`da_tach`): mở lại bản nháp không thêm lần nữa, và
// người nhập xoá dòng mới thì nó không tự mọc lại.

import { boDau } from "./bang-gia-sua-tay";
import type { KhoaTach, ResolveMaps, ResolvedItem } from "./bao-gia-ai-resolve";

/** Một dòng danh mục cảnh điểm dùng làm nguồn giá. */
export interface VeDanhMuc {
  id: number;
  ten: string;
  gia: number;
}

/** Tên đã bỏ dấu, chỉ còn chữ-số cách nhau một dấu cách, hai đầu có đệm — so theo TỪ. */
export const tenTheoTu = (s: string | null | undefined) =>
  ` ${boDau((s ?? "").normalize("NFKC")).replace(/[^a-z0-9]+/g, " ").trim()} `;

/**
 * Dòng cảnh điểm CÓ GIÁ mà tên (đã qua `tenTheoTu`) thoả điều kiện. Danh mục hay
 * có bản trùng cũ ("Cáp treo FSP…" và "FANSIPAN COMBO…" cùng một vé) → lấy bản
 * ghi mới nhất. Không có → null: không bịa giá, để người nhập gõ.
 */
export function timVe(maps: ResolveMaps, hop: (ten: string) => boolean): VeDanhMuc | null {
  let tot: VeDanhMuc | null = null;
  for (const [id, c] of maps.canhDiem) {
    if (!c.gia || c.gia <= 0 || !hop(tenTheoTu(c.ten))) continue;
    if (!tot || id > tot.id) tot = { id, ten: c.ten, gia: c.gia };
  }
  return tot;
}

export const daTach = (r: ResolvedItem, khoa: KhoaTach) => !!r.da_tach?.includes(khoa);

/** Ghi lên dòng gốc là dịch vụ `khoa` đã được tính ở dòng khác. */
export const ghiDaTach = (r: ResolvedItem, khoa: KhoaTach): ResolvedItem =>
  daTach(r, khoa) ? r : { ...r, da_tach: [...(r.da_tach ?? []), khoa] };

/** Dòng mới cho dịch vụ tách ra. Giá lấy từ danh mục; không có thì để người nhập gõ. */
export function dongTach(
  goc: ResolvedItem,
  khoa: KhoaTach,
  dv: { ten_zh: string; mo_ta: string },
  ve: VeDanhMuc | null,
): ResolvedItem {
  return {
    ngay_so: goc.ngay_so,
    loai: "ticket",
    mo_ta: dv.mo_ta,
    ten_zh: dv.ten_zh,
    ten_vi: dv.mo_ta,
    don_gia: ve?.gia ?? 0,
    ghi_chu: "",
    // Luật tách, không phải máy đoán — không đưa vào danh sách "cần xác nhận".
    confidence: 1,
    status: ve ? "matched" : "no_price",
    match_label: ve?.ten ?? "Chưa có trong danh mục",
    match_table: ve ? "canh_diem" : null,
    match_id: ve?.id ?? null,
    match_set_menu_id: null,
    tach_tu: { khoa, dong_goc: (goc.ten_zh || goc.mo_ta).trim() },
  };
}
