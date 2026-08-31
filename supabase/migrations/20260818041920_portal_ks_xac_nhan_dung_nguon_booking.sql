-- ⚠️ FILE BÙ SỔ — chép NGUYÊN VĂN từ bản đã chạy trên prod, không phải viết mới.
--    Phiên bản trên prod: 20260818041920   (8/9 trong chuỗi migration cổng đối tác)
--    Bù vào repo 31/08/2026: thư mục migrations thiếu file này, nên người sau
--    lấy nhầm bản cũ trong repo làm nền cho CREATE OR REPLACE và xoá mất việc
--    của người trước. Xem PR mô tả sự cố.
--
--    ĐẶC BIỆT LƯU Ý: file 20260818_portal_tai_lieu_ks_trao_doi.sql trong repo
--    chứa bản CŨ của chính hàm này (đọc doan_ks_dem — bảng rỗng). Bản đúng là
--    bản dưới đây. Đừng lấy file kia làm nền.
-- ─── nguyên văn ───
-- Sửa nguồn dữ liệu 飯店確認單.
-- Bản đầu đọc doan_ks_dem — bảng đó RỖNG toàn bộ DB (đo 18/08/2026), nên hàm trả
-- rỗng cho mọi đoàn. Nguồn thật là ô ks_final (chưa có thì ks_dat_truoc) của
-- doan_booking_ks: TEXT NHIỀU DÒNG, mỗi dòng một đêm — đúng thứ bản Word
-- 訂房確認單 đang dùng (getPreferredRoomInfoForDate / expandRoomValues).
CREATE OR REPLACE FUNCTION public.build_portal_ks_xac_nhan(p_doan_ids bigint[])
RETURNS TABLE (doan_id bigint, noi_dung jsonb)
LANGUAGE sql STABLE
SET search_path TO 'public'
AS $$
  WITH da_final AS (
    SELECT b.id AS booking_id,
           b.doan_id,
           b.khach_san_id,
           portal_lam_sach_ten(coalesce(NULLIF(k.ten_zh, ''), k.ten)) AS ten,
           coalesce(NULLIF(k.dia_diem_zh, ''), k.dia_diem) AS dia_diem,
           k.dia_chi,
           k.so_dien_thoai,
           replace(coalesce(NULLIF(b.ks_final, ''), b.ks_dat_truoc, ''), chr(13), '') AS phong_text
    FROM doan_booking_ks b
    JOIN khach_san k ON k.id = b.khach_san_id
    WHERE b.doan_id = ANY(p_doan_ids)
      AND b.ks_final_status = 'ks_xac_nhan_final'
      AND coalesce(b.trang_thai, '') <> 'ks_huy'
  ),
  dem AS (
    SELECT booking_id, ngay_date,
           row_number() OVER (PARTITION BY booking_id ORDER BY ngay_date) AS thu_tu
    FROM (
      SELECT DISTINCT f.booking_id, dn.ngay_date
      FROM da_final f
      JOIN doan_ngay dn
        ON dn.doan_id = f.doan_id AND dn.khach_san_id = f.khach_san_id
      WHERE dn.ngay_date IS NOT NULL
    ) x
  ),
  dong AS (
    SELECT f.booking_id,
           (SELECT array_agg(btrim(u.l) ORDER BY u.i)
            FROM unnest(string_to_array(f.phong_text, chr(10))) WITH ORDINALITY AS u(l, i)) AS cac_dong
    FROM da_final f
  ),
  gom AS (
    SELECT f.doan_id,
           min(d.ngay_date) AS tu,
           f.ten,
           jsonb_build_object(
             'ten',        f.ten,
             'dia_diem',   f.dia_diem,
             'dia_chi',    f.dia_chi,
             'dien_thoai', f.so_dien_thoai,
             'ma_code',    m.ma_code,
             'nhan_phong', min(d.ngay_date),
             'tra_phong',  max(d.ngay_date) + 1,
             'dem', jsonb_agg(
                      jsonb_build_object(
                        'ngay',  d.ngay_date,
                        'phong', CASE
                                   WHEN coalesce(cardinality(g.cac_dong), 0) <= 1
                                     THEN coalesce(g.cac_dong[1], '')
                                   ELSE coalesce(g.cac_dong[d.thu_tu], '')
                                 END
                      ) ORDER BY d.ngay_date
                    )
           ) AS ks
    FROM da_final f
    JOIN dem d ON d.booking_id = f.booking_id
    LEFT JOIN dong g ON g.booking_id = f.booking_id
    LEFT JOIN LATERAL (
      SELECT string_agg(DISTINCT NULLIF(btrim(dn.ks_ma_code), ''), ', ') AS ma_code
      FROM doan_ngay dn
      WHERE dn.doan_id = f.doan_id AND dn.khach_san_id = f.khach_san_id
    ) m ON true
    GROUP BY f.doan_id, f.ten, f.dia_diem, f.dia_chi, f.so_dien_thoai, m.ma_code, g.cac_dong
  )
  SELECT d.id,
         jsonb_build_object(
           'version', 1,
           'khach_san', coalesce(
             (SELECT jsonb_agg(g.ks ORDER BY g.tu, g.ten) FROM gom g WHERE g.doan_id = d.id),
             '[]'::jsonb
           )
         )
  FROM doan d
  WHERE d.id = ANY(p_doan_ids);
$$;

GRANT EXECUTE ON FUNCTION public.build_portal_ks_xac_nhan(bigint[]) TO authenticated, service_role;
