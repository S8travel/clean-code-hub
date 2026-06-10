-- ============================================================================
-- CÔNG NỢ RỜI (doan_id NULL) — cho MỌI user đăng nhập xem (2026-06-10)
-- ----------------------------------------------------------------------------
-- Bối cảnh: 20260609_van_phong_hard_scope đặt RLS cong_no sao cho công nợ
-- doan_id=NULL CHỈ cross-VP (admin/giam_doc) + kế toán (bo_phan='ke_toan') thấy.
-- Nhưng công nợ PHÁT SINH theo NCC (không gắn đoàn) lại do điều hành dùng để
-- CẤN TRỪ → bị ẩn với nhân viên điều hành (bo_phan='dieu_hanh') → không cấn trừ
-- được. Bảng cong_no KHÔNG có cột văn phòng nên không scope theo VP được.
--
-- Quyết định: nới điều kiện — công nợ doan_id=NULL hiển thị cho MỌI user đã đăng
-- nhập (khôi phục hành vi trước hard-scope cho loại bản ghi này). Công nợ CÓ
-- gắn đoàn vẫn scope theo VP của đoàn như cũ.
--
-- Chỉ đụng policy bảng `cong_no`. de_nghi_thanh_toan / payments giữ nguyên.
-- Rollback: docs/db-rollback/20260610_cong_no_roi_visible_all_DOWN.sql
-- ============================================================================

DROP POLICY IF EXISTS van_phong_scope ON public.cong_no;
CREATE POLICY van_phong_scope ON public.cong_no
  FOR ALL TO public
  USING (
    auth.uid() IS NOT NULL AND (
      public.current_user_cross_vp()
      OR cong_no.doan_id IS NULL                         -- công nợ rời: mọi user thấy
      OR EXISTS (SELECT 1 FROM public.doan d
                 WHERE d.id = cong_no.doan_id
                   AND public.can_access_van_phong(d.van_phong_id))
    )
  )
  WITH CHECK (
    auth.uid() IS NOT NULL AND (
      public.current_user_cross_vp()
      OR cong_no.doan_id IS NULL
      OR EXISTS (SELECT 1 FROM public.doan d
                 WHERE d.id = cong_no.doan_id
                   AND public.can_access_van_phong(d.van_phong_id))
    )
  );
