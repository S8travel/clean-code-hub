-- Giá phòng TWN/DBL THAM KHẢO để báo giá (mode tự tính, khớp master KS).
-- master KS không có giá phòng → thêm cột + backfill từ chi phí KS thực tế.
--
-- Backfill = MEDIAN giá/phòng các dòng chi phí KS (doan_chi_phi danh_muc='khach_san')
-- có mo_ta chứa twin/dbl, loại bỏ day-use / extra bed / golf / villa / suite / ăn sáng / trẻ em.
-- median chống outlier (ghi chú thanh toán, giá trẻ/phụ thu). Đã APPLY PROD 2026-06-27.
-- Giá vận hành thực vẫn nhập per-tour; cột này chỉ là giá mặc định để báo giá (chỉnh tay được).

ALTER TABLE public.khach_san ADD COLUMN IF NOT EXISTS gia_phong_mac_dinh numeric;

COMMENT ON COLUMN public.khach_san.gia_phong_mac_dinh IS
  'Giá phòng TWN/DBL THAM KHẢO để báo giá (median chi phí KS thực tế từ doan_chi_phi). Giá vận hành thực vẫn nhập per-tour (doan_ks_dem/doan_chi_phi). Có thể chỉnh tay.';

WITH elig AS (
  SELECT dn.khach_san_id AS ks_id, cp.don_gia
  FROM public.doan_chi_phi cp
  JOIN public.doan_ngay dn ON dn.id = cp.ref_doan_ngay_id
  WHERE cp.danh_muc = 'khach_san' AND cp.don_gia > 0 AND dn.khach_san_id IS NOT NULL
    AND lower(cp.mo_ta) ~ 'tw|dbl|double'
    AND lower(cp.mo_ta) !~ 'extra|day ?use|golf|bed|villa|suite|connecting|ăn|an sang|trẻ em|tre em'
),
med AS (
  SELECT ks_id, round(percentile_cont(0.5) WITHIN GROUP (ORDER BY don_gia)) AS gia
  FROM elig GROUP BY ks_id
)
UPDATE public.khach_san ks
SET gia_phong_mac_dinh = med.gia
FROM med
WHERE med.ks_id = ks.id;
