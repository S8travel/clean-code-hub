-- ROLLBACK cho 20260610_cong_no_roi_visible_all.sql
-- Khôi phục policy cong_no về đúng trạng thái sau 20260609_van_phong_hard_scope:
-- công nợ doan_id=NULL chỉ cross-VP + kế toán thấy.

DROP POLICY IF EXISTS van_phong_scope ON public.cong_no;
CREATE POLICY van_phong_scope ON public.cong_no
  FOR ALL TO public
  USING (
    auth.uid() IS NOT NULL AND (
      public.current_user_cross_vp()
      OR (cong_no.doan_id IS NULL AND public.current_user_is_accounting())
      OR EXISTS (SELECT 1 FROM public.doan d
                 WHERE d.id = cong_no.doan_id
                   AND public.can_access_van_phong(d.van_phong_id))
    )
  )
  WITH CHECK (
    auth.uid() IS NOT NULL AND (
      public.current_user_cross_vp()
      OR (cong_no.doan_id IS NULL AND public.current_user_is_accounting())
      OR EXISTS (SELECT 1 FROM public.doan d
                 WHERE d.id = cong_no.doan_id
                   AND public.can_access_van_phong(d.van_phong_id))
    )
  );
