/**
 * Chuẩn hóa số điện thoại về chuỗi CHỈ gồm chữ số — KHỚP 100% với cột
 * `khach_hang.sdt_norm` trong DB:
 *   regexp_replace(coalesce(so_dien_thoai, ''), '[^0-9]', '', 'g')
 * Dùng để dedup khách hàng theo SĐT (tra `sdt_norm`).
 */
export function normalizePhone(raw: string | null | undefined): string {
  return (raw ?? "").replace(/[^0-9]/g, "");
}

/**
 * 2 SĐT coi là CÙNG một khách khi normalize trùng nhau VÀ không rỗng.
 * Chuỗi rỗng (SĐT thiếu / toàn ký tự lạ) KHÔNG bao giờ match — tránh gộp nhầm
 * mọi khách thiếu SĐT vào làm một.
 */
export function phonesMatch(
  a: string | null | undefined,
  b: string | null | undefined,
): boolean {
  const na = normalizePhone(a);
  const nb = normalizePhone(b);
  return na !== "" && na === nb;
}
