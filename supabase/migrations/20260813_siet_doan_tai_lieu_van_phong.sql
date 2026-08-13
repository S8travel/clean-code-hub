-- Siết RLS bảng doan_tai_lieu về scope văn phòng.
--
-- TRƯỚC: policy `doan_tai_lieu_auth_all` PERMISSIVE / FOR ALL / TO authenticated
--        với qual = true và with_check = true. Nghĩa là BẤT KỲ tài khoản đăng nhập
--        nào — kể cả tài khoản mới chưa gán role, chưa gán văn phòng — đều liệt kê,
--        sửa và XOÁ được tài liệu của mọi đoàn (gồm cả file loai='bao_gia').
--        Không có tầng nào khác chặn: bảng chỉ còn 3 policy RESTRICTIVE chi_xem_*,
--        mà chúng chỉ chặn GHI, không chặn ĐỌC.
--
-- SAU:   dùng đúng khuôn `van_phong_scope` đã chạy trên doan / doan_ngay /
--        doan_chi_phi (xem 20260609_van_phong_hard_scope.sql): phải đăng nhập VÀ
--        (có quyền cross-VP HOẶC đoàn thuộc văn phòng trong scope của mình).
--
-- Giữ nguyên 3 policy chi_xem_block_* (RESTRICTIVE) — chúng ghép AND nên vẫn có tác dụng.
--
-- LƯU Ý VẬN HÀNH: sau migration này, tài khoản KHÔNG có dòng user_roles active sẽ
-- đọc ra 0 dòng (current_user_vp_scope() trả NULL). Đó là hành vi ĐÚNG và đã đúng
-- như vậy với doan/doan_chi_phi từ 06/2026 — nhưng hãy kiểm tra danh sách tài khoản
-- thiếu user_roles TRƯỚC khi chạy, kẻo có người đang dùng được tab Tài liệu nhờ lỗ này.

DROP POLICY IF EXISTS doan_tai_lieu_auth_all ON public.doan_tai_lieu;

CREATE POLICY van_phong_scope ON public.doan_tai_lieu
  FOR ALL
  TO public
  USING (
    (SELECT auth.uid()) IS NOT NULL
    AND (
      (SELECT public.current_user_cross_vp())
      OR EXISTS (
        SELECT 1 FROM public.doan d
        WHERE d.id = doan_tai_lieu.doan_id
          AND d.van_phong_id IN (SELECT unnest(public.current_user_vp_scope()))
      )
    )
  )
  WITH CHECK (
    (SELECT auth.uid()) IS NOT NULL
    AND (
      (SELECT public.current_user_cross_vp())
      OR EXISTS (
        SELECT 1 FROM public.doan d
        WHERE d.id = doan_tai_lieu.doan_id
          AND d.van_phong_id IN (SELECT unnest(public.current_user_vp_scope()))
      )
    )
  );
