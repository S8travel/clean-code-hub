-- RPC tổng hợp chi phí mỗi đoàn theo khoảng ngày khởi hành.
-- Dùng bởi edge function sync-chi-phi-to-sheet (báo cáo Google Sheet thứ 6 hàng tuần).
--
-- tong_chi_phi = SUM(COALESCE(thanh_tien_thuc_te, thanh_tien)) loại dòng is_excluded
--   → khớp định nghĩa bản thủ công (file mẫu Chi_phi_doan_21-28.5.2026.xlsx).
-- so_dong_chi_phi = số dòng doan_chi_phi (loại is_excluded) — phục vụ cảnh báo nghi thiếu.
-- so_dem = ngay_ve - ngay_di.
--
-- ALTER-free (chỉ tạo function) → theo migration rules chỉ cần GRANT EXECUTE.

CREATE OR REPLACE FUNCTION public.get_chi_phi_doan_summary(p_from date, p_to date)
RETURNS TABLE (
  doan_id          bigint,
  ten_doan         text,
  agent_ten        text,
  loai_tour        text,
  ngay_di          date,
  ngay_ve          date,
  so_khach         integer,
  tong_chi_phi     numeric,
  so_dong_chi_phi  integer,
  so_dem           integer
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    d.id::bigint,
    d.ten_doan::text,
    COALESCE(a.ten, 'Other')::text,
    d.loai_tour::text,
    d.ngay_di,
    d.ngay_ve,
    COALESCE(d.so_khach, 0)::integer,
    COALESCE(
      SUM(COALESCE(cp.thanh_tien_thuc_te, cp.thanh_tien))
        FILTER (WHERE cp.is_excluded IS NOT TRUE),
      0
    )::numeric,
    (COUNT(cp.id) FILTER (WHERE cp.is_excluded IS NOT TRUE))::integer,
    GREATEST(COALESCE(d.ngay_ve - d.ngay_di, 0), 0)::integer
  FROM public.doan d
  LEFT JOIN public.agents a ON a.id = d.agent_id
  LEFT JOIN public.doan_chi_phi cp ON cp.doan_id = d.id
  WHERE d.trang_thai = 'dang_chay'
    AND d.ngay_di BETWEEN p_from AND p_to
  GROUP BY d.id, d.ten_doan, a.ten, d.loai_tour, d.ngay_di, d.ngay_ve, d.so_khach
  ORDER BY d.ngay_di, d.id;
$$;

COMMENT ON FUNCTION public.get_chi_phi_doan_summary(date, date) IS
  'Tổng hợp chi phí mỗi đoàn (ngay_di trong [p_from, p_to], trang_thai = dang_chay). '
  'tong_chi_phi = SUM(COALESCE(thanh_tien_thuc_te, thanh_tien)) loại is_excluded. '
  'Dùng bởi edge function sync-chi-phi-to-sheet.';

GRANT EXECUTE ON FUNCTION public.get_chi_phi_doan_summary(date, date)
  TO authenticated, service_role;
