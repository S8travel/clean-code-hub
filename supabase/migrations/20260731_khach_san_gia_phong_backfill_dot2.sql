-- Backfill đợt 2 giá phòng tham khảo cho KS chưa có dòng giá (bảng khach_san_gia_phong).
-- Cùng logic median đợt 1 (20260627_khach_san_gia_phong_mac_dinh): lấy chi phí KS thực
-- tế mo_ta chứa twin/dbl, loại day-use/extra/golf/villa/suite/ăn/trẻ em, MEDIAN chống
-- outlier. CHỈ chèn KS chưa có dòng nào (không đè 104 KS đợt 1 — có thể đã sửa tay).
-- Chạy 2026-07-31: 24 KS mới có chi phí từ sau đợt 1 (Radisson Blu PQ, The Shells...).

WITH elig AS (
  SELECT dn.khach_san_id AS ks_id, cp.don_gia
  FROM public.doan_chi_phi cp
  JOIN public.doan_ngay dn ON dn.id = cp.ref_doan_ngay_id
  WHERE cp.danh_muc = 'khach_san' AND cp.don_gia > 0 AND dn.khach_san_id IS NOT NULL
    AND lower(cp.mo_ta) ~ 'tw|dbl|double'
    AND lower(cp.mo_ta) !~ 'extra|day ?use|golf|bed|villa|suite|connecting|ăn|an sang|trẻ em|tre em'
),
med AS (
  SELECT ks_id, round(percentile_cont(0.5) WITHIN GROUP (ORDER BY don_gia)) AS gia,
         count(*) AS so_dong
  FROM elig GROUP BY ks_id
)
INSERT INTO public.khach_san_gia_phong (khach_san_id, ten_giai_doan, loai_phong, gia, ghi_chu)
SELECT m.ks_id, 'Mặc định', 'TWN/DBL', m.gia,
       'Tự động từ chi phí KS thực tế (median TWN/DBL, ' || m.so_dong || ' dòng, backfill 31/07)'
FROM med m
WHERE NOT EXISTS (
  SELECT 1 FROM public.khach_san_gia_phong g WHERE g.khach_san_id = m.ks_id
);
