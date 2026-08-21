-- ĐÃ APPLY LÊN PRODUCTION 21/08/2026 (chủ hệ thống duyệt).
--
-- Tách riêng khỏi migration 'c' vì đây KHÔNG phải phần việc "mở Báo Giá cho một
-- người", mà là bịt một lỗ phát hiện lúc làm việc đó. Nó đổi ai được sửa phân
-- quyền của cả công ty, nên phải là quyết định có chủ đích chứ không đi kèm âm thầm.
--
-- Đã nghiệm thu bằng cách đóng vai người dùng thật (JWT giả + transaction tự huỷ):
--   · nhân viên thường tự chèn dòng quyền cho mình  → BỊ CHẶN (cả 2 bảng)
--   · nhân viên thường đọc ma trận quyền            → vẫn được (không phá màn hình)
--   · admin sửa ma trận / cấp quyền riêng           → vẫn được
--
-- LƯU Ý: hiện chỉ có MỘT tài khoản admin. Mất tài khoản đó thì không ai sửa được
-- phân quyền qua giao diện nữa — đường còn lại là SQL Editor trên Dashboard.
--
-- LỖ: `role_permissions` và `user_permissions` chỉ có policy 'auth_required'
-- FOR ALL — nghĩa là BẤT KỲ nhân viên nào có tài khoản (trừ tài khoản chỉ xem)
-- đều tự chèn dòng quyền cho chính mình, hoặc sửa ma trận quyền của cả công ty,
-- ngay từ API mà không cần mở màn Người dùng. Phân quyền hiện chỉ là thoả thuận
-- danh dự.
--
-- Đã kiểm trước khi viết: không edge function nào ghi hai bảng này (grep
-- supabase/functions), và service_role vẫn bypass RLS nên luồng nền không đụng.
-- Sau khi apply: chỉ tài khoản `admin` sửa được quyền — đúng như màn Người dùng
-- (đã bọc AdminGuard) vẫn làm.

-- Đo 21/08: `role_permissions` và `user_permissions` chỉ có policy 'auth_required'
-- FOR ALL — tức BẤT KỲ nhân viên nào có tài khoản đều tự chèn dòng quyền cho
-- chính mình, hoặc sửa ma trận quyền của cả công ty, ngay từ API mà không cần
-- vào màn Người dùng. Phân quyền chỉ còn là thoả thuận danh dự.
-- Không edge function nào ghi hai bảng này (đã grep), service_role vẫn bypass RLS.
DO $pol$
BEGIN
  DROP POLICY IF EXISTS auth_required ON public.user_permissions;
  CREATE POLICY up_doc ON public.user_permissions
    FOR SELECT TO authenticated USING (true);
  CREATE POLICY up_ghi_admin ON public.user_permissions
    FOR ALL TO authenticated
    USING ((SELECT public.is_admin())) WITH CHECK ((SELECT public.is_admin()));
EXCEPTION WHEN duplicate_object THEN NULL;
END $pol$;

DO $pol$
BEGIN
  DROP POLICY IF EXISTS auth_required ON public.role_permissions;
  CREATE POLICY rp_doc ON public.role_permissions
    FOR SELECT TO authenticated USING (true);
  CREATE POLICY rp_ghi_admin ON public.role_permissions
    FOR ALL TO authenticated
    USING ((SELECT public.is_admin())) WITH CHECK ((SELECT public.is_admin()));
EXCEPTION WHEN duplicate_object THEN NULL;
END $pol$;

