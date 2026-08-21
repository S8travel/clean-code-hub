-- Dọn 342 dòng chết trong `user_permissions`. ĐÃ CHẠY TRÊN PROD 21/08/2026.
-- Project lflsbwoqzmbknzdpaequ.
--
-- Bảng này chỉ có tác dụng với vai trò 'specialist' (xem luật ở src/lib/quyen.ts):
-- code không đọc nó cho vai trò nào khác. Nhưng nó lại chứa 342 dòng của 19 người
-- vai trò thường + 1 tài khoản không còn trong `user_roles`, **tất cả bật đủ
-- xem/tạo/sửa/xoá trên 18 mục** gồm Người dùng, ĐNTT, HĐ&UNC, Công nợ.
--
-- Hôm nay chúng vô hại, nhưng là bom hẹn giờ: chỉ cần một người sau này cho code
-- đọc bảng này với vai trò thường (một thay đổi nghe rất hợp lý) là 20 tài khoản
-- lên gần bằng admin trong một lần deploy. Dọn đi thì cái bẫy đó không còn.
--
-- Đã kiểm trước khi xoá: không bảng nào có khoá ngoại trỏ tới `user_permissions`,
-- không edge function nào đọc/ghi nó, và trong app chỉ hai chỗ đụng tới — cả hai
-- đều chỉ chạy với vai trò 'specialist' (usePermission và khối quyền trong trang
-- Người dùng). Nên xoá KHÔNG đổi hành vi hiện tại: không ai mất quyền.
--
-- Hệ quả duy nhất nằm ở tương lai: đổi vai trò một trong 19 người đó sang
-- 'specialist' thì họ bắt đầu từ con số không thay vì thừa hưởng 18 mục quyền
-- đầy đủ mà không ai nhớ vì sao có. Đó là điều đúng.

-- 1) Sao lưu trước. Giữ ~1 tháng rồi DROP nếu không phải hồi phục gì.
--    CREATE TABLE AS không kèm RLS và Supabase cấp quyền mặc định cho anon/
--    authenticated → phải tự khoá, không thì bản sao hớ hênh hơn bản gốc.
CREATE TABLE IF NOT EXISTS public.user_permissions_backup_20260821 AS
SELECT * FROM public.user_permissions;

REVOKE ALL ON public.user_permissions_backup_20260821 FROM anon, authenticated;
ALTER TABLE public.user_permissions_backup_20260821 ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.user_permissions_backup_20260821 IS
  'Bản sao user_permissions trước khi dọn 342 dòng chết (21/08/2026). Xoá bảng này sau ~1 tháng nếu không phải hồi phục gì.';

-- 2) Xoá mọi dòng KHÔNG thuộc một tài khoản 'specialist'.
--    Điều kiện viết theo VAI TRÒ chứ không liệt kê user_id: liệt kê tay thì sót
--    một người là sót cả 18 dòng, mà sót thì không ai biết.
DELETE FROM public.user_permissions up
WHERE NOT EXISTS (
  SELECT 1 FROM public.user_roles ur
  WHERE ur.user_id = up.user_id AND ur.role = 'specialist'
);

-- 3) Kiểm sau khi chạy — kỳ vọng đúng 25 dòng của 3 người:
--    Mr.Zheng 20, Ms.Cayla 4, Test 1.
-- SELECT ur.ho_ten, ur.role, count(*)
-- FROM public.user_permissions up
-- LEFT JOIN public.user_roles ur ON ur.user_id = up.user_id
-- GROUP BY ur.ho_ten, ur.role ORDER BY 3 DESC;
