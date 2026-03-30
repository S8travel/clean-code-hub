-- ================================================================
-- Migration: thanh_tien_thuc_te
-- Mục đích: Thêm cột lưu chi phí thực tế sau điều chỉnh (tăng/giảm)
--           so với giá dự toán ban đầu (thanh_tien).
-- ================================================================

ALTER TABLE public.doan_chi_phi
  ADD COLUMN IF NOT EXISTS thanh_tien_thuc_te NUMERIC DEFAULT NULL;

COMMENT ON COLUMN public.doan_chi_phi.thanh_tien_thuc_te IS
  'Chi phí thực tế sau điều chỉnh. NULL = dùng thanh_tien (chưa điều chỉnh).';

-- ================================================================
-- Cập nhật RPC recalc_chi_phi_payment_status để dùng
-- COALESCE(thanh_tien_thuc_te, thanh_tien) khi so sánh đã thanh toán đủ chưa
-- ================================================================

CREATE OR REPLACE FUNCTION public.recalc_chi_phi_payment_status(
  p_chi_phi_ids bigint[]
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_thuc_tien NUMERIC;
BEGIN
  UPDATE public.doan_chi_phi cp
  SET
    so_tien_da_dntt       = COALESCE(s.so_tien_da_dntt, 0),
    so_tien_da_tt         = COALESCE(s.so_tien_da_tt, 0),
    trang_thai_thanh_toan = CASE
      WHEN COALESCE(s.so_tien_da_tt, 0) = 0
        THEN 'unpaid'
      WHEN COALESCE(s.so_tien_da_tt, 0) >= COALESCE(cp.thanh_tien_thuc_te, cp.thanh_tien)
        THEN 'paid'
      ELSE 'partial_paid'
    END,
    trang_thai_dntt       = CASE
      WHEN COALESCE(s.has_cho_duyet, false)
        THEN 'cho_duyet'
      WHEN COALESCE(s.has_da_duyet_chua_tt, false)
        THEN 'da_duyet'
      WHEN COALESCE(s.so_tien_da_tt, 0) >= COALESCE(cp.thanh_tien_thuc_te, cp.thanh_tien)
        THEN 'da_thanh_toan'
      WHEN COALESCE(s.so_tien_da_tt, 0) > 0
        THEN 'thanh_toan_mot_phan'
      ELSE 'chua_de_nghi'
    END
  FROM (
    SELECT
      a.chi_phi_id,
      SUM(
        CASE WHEN d.trang_thai_duyet != 'da_huy'
             THEN a.so_tien ELSE 0 END
      )                                                         AS so_tien_da_dntt,
      SUM(
        CASE WHEN d.trang_thai_thanh_toan = 'da_tt'
             THEN a.so_tien ELSE 0 END
      )                                                         AS so_tien_da_tt,
      BOOL_OR(d.trang_thai_duyet = 'cho_duyet')                AS has_cho_duyet,
      BOOL_OR(
        d.trang_thai_duyet = 'da_duyet'
        AND d.trang_thai_thanh_toan != 'da_tt'
      )                                                         AS has_da_duyet_chua_tt
    FROM public.dntt_allocations a
    JOIN public.de_nghi_thanh_toan d ON d.id = a.dntt_id
    WHERE a.chi_phi_id = ANY(p_chi_phi_ids)
    GROUP BY a.chi_phi_id
  ) s
  WHERE cp.id = ANY(p_chi_phi_ids)
    AND cp.id = s.chi_phi_id;

  -- Reset chi_phi không có allocation nào
  UPDATE public.doan_chi_phi cp
  SET
    so_tien_da_dntt       = 0,
    so_tien_da_tt         = 0,
    trang_thai_thanh_toan = 'unpaid',
    trang_thai_dntt       = 'chua_de_nghi'
  WHERE cp.id = ANY(p_chi_phi_ids)
    AND NOT EXISTS (
      SELECT 1 FROM public.dntt_allocations a WHERE a.chi_phi_id = cp.id
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.recalc_chi_phi_payment_status(bigint[])
  TO anon, authenticated;
