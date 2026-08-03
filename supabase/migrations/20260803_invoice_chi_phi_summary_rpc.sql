-- RPC tổng hợp "Chi phí TT" per đoàn cho trang Đối soát chi phí (InvoicePage).
--
-- Lý do: useChiPhiSummaryMap cũ kéo toàn bộ dòng doan_chi_phi của mọi đoàn đã
-- kết thúc trong 1 request rồi tự cộng ở client → đụng trần max-rows 1000 của
-- PostgREST → đoàn nào không lọt 1000 dòng đầu hiển thị 0 đ.
-- Aggregate trên DB: trả về 1 dòng / đoàn, không còn đụng trần.
--
-- Công thức GIỮ NGUYÊN parity với client cũ (use-doan-invoice.ts):
--   bỏ dòng trang_thai_dntt IN ('cong_no', 'hoan_tien')
--   contrib = COALESCE(tien_cong_ty, 0) + COALESCE(tien_hdv, 0)
--   total   = SUM(contrib)
--   thuc_te = SUM(COALESCE(thanh_tien_thuc_te, contrib))
--   KHÔNG lọc is_excluded (client cũ không lọc — khác get_chi_phi_doan_summary
--   của sync Google Sheet).
--
-- SECURITY INVOKER (mặc định) → tôn trọng RLS (VP hard scope) như query cũ.
-- Chỉ tạo function → theo migration rules chỉ cần GRANT EXECUTE.

CREATE OR REPLACE FUNCTION public.get_chi_phi_summary_by_doan(p_doan_ids bigint[])
RETURNS TABLE (
  doan_id bigint,
  total   numeric,
  thuc_te numeric
)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT
    cp.doan_id,
    COALESCE(SUM(COALESCE(cp.tien_cong_ty, 0) + COALESCE(cp.tien_hdv, 0)), 0)::numeric,
    COALESCE(SUM(COALESCE(cp.thanh_tien_thuc_te,
                          COALESCE(cp.tien_cong_ty, 0) + COALESCE(cp.tien_hdv, 0))), 0)::numeric
  FROM public.doan_chi_phi cp
  WHERE cp.doan_id = ANY (p_doan_ids)
    AND (cp.trang_thai_dntt IS NULL
         OR cp.trang_thai_dntt NOT IN ('cong_no', 'hoan_tien'))
  GROUP BY cp.doan_id;
$$;

COMMENT ON FUNCTION public.get_chi_phi_summary_by_doan(bigint[]) IS
  'Tổng hợp Chi phí TT per đoàn cho trang Đối soát chi phí (InvoicePage). '
  'total = SUM(tien_cong_ty + tien_hdv); thuc_te = SUM(COALESCE(thanh_tien_thuc_te, contrib)); '
  'bỏ dòng trang_thai_dntt IN (cong_no, hoan_tien). SECURITY INVOKER — tôn trọng RLS.';

GRANT EXECUTE ON FUNCTION public.get_chi_phi_summary_by_doan(bigint[])
  TO authenticated, service_role;
