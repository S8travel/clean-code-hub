-- Điều hành tạo được ĐNTT quỹ trả trước (loai='tra_truoc', doan_id NULL).
--
-- Trước đây: policy van_phong_scope chỉ cho dòng doan_id NULL với admin/GĐ
-- (current_user_cross_vp) hoặc kế toán (current_user_is_accounting) → điều hành
-- bấm "Tạo quỹ trả trước" ở trang Công nợ bị 42501 "new row violates row-level
-- security policy". User chốt 21/09/2026 mở cho điều hành.
--
-- Chỉ MỞ THÊM (policy permissive mới), không sửa van_phong_scope:
--   - INSERT: chỉ phiếu tra_truoc, chờ duyệt, cấp KTT + duyệt cuối trống, tao_boi = chính mình.
--   - SELECT: phiếu tra_truoc (cần cho RETURNING id sau insert + xem trạng thái).
--   - payments SELECT: lần chi của phiếu tra_truoc (view dntt_with_payment_status
--     là security_invoker → thiếu dòng này thì paid_amount luôn 0 với điều hành).
-- KHÔNG mở UPDATE/DELETE: duyệt / chi / hủy vẫn là việc của kế toán + cấp duyệt.
-- cong_no KHÔNG đổi: cấn trừ quỹ đã đi qua RPC definer (20260629_cong_no_can_tru_rpc).
-- Policy chi_xem_* (RESTRICTIVE) vẫn chặn tài khoản chỉ xem.
-- ĐÃ APPLY PROD 21/09/2026 (bản đầu + ALTER POLICY 20260921c); nghiệm thu đóng vai
-- điều hành 10/10: tạo hợp lệ được; đã duyệt / tự KTT / giả TP / loại khác /
-- mạo danh / chỉ xem đều bị chặn; UPDATE + DELETE 0 dòng.

CREATE OR REPLACE FUNCTION public.current_user_is_dieu_hanh()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid() AND ur.active
      AND ur.bo_phan = 'dieu_hanh'
  );
$$;

REVOKE EXECUTE ON FUNCTION public.current_user_is_dieu_hanh() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.current_user_is_dieu_hanh() TO authenticated, service_role;

CREATE POLICY tra_truoc_dieu_hanh_insert ON public.de_nghi_thanh_toan
  FOR INSERT TO authenticated
  WITH CHECK (
    doan_id IS NULL
    AND loai = 'tra_truoc'
    AND trang_thai_duyet = 'cho_duyet'
    AND duyet_boi IS NULL AND duyet_luc IS NULL
    AND ktt_duyet_boi IS NULL AND ktt_duyet_luc IS NULL
    -- Trigger BEFORE INSERT auto_pass_dntt_level_1 tự điền cấp TP điều hành + KT
    -- thanh toán = tao_boi cho MỌI phiếu mới (chạy TRƯỚC khi kiểm WITH CHECK) →
    -- đòi NULL là chặn luôn phiếu hợp lệ. Chỉ cho NULL hoặc chính người tạo.
    AND (tp_dh_duyet_boi IS NULL OR tp_dh_duyet_boi = tao_boi)
    AND (kttt_duyet_boi IS NULL OR kttt_duyet_boi = tao_boi)
    AND tu_choi_cap IS NULL
    AND tao_boi = (SELECT auth.uid())
    AND (SELECT public.current_user_is_dieu_hanh())
  );

CREATE POLICY tra_truoc_dieu_hanh_select ON public.de_nghi_thanh_toan
  FOR SELECT TO authenticated
  USING (
    doan_id IS NULL
    AND loai = 'tra_truoc'
    AND (SELECT public.current_user_is_dieu_hanh())
  );

CREATE POLICY tra_truoc_dieu_hanh_select ON public.payments
  FOR SELECT TO authenticated
  USING (
    (SELECT public.current_user_is_dieu_hanh())
    AND EXISTS (
      SELECT 1 FROM public.de_nghi_thanh_toan dn
      WHERE dn.id = payments.dntt_id
        AND dn.doan_id IS NULL
        AND dn.loai = 'tra_truoc'
    )
  );
