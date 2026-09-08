-- Người phụ trách bảo hiểm được sửa chi phí bảo hiểm kể cả khi đoàn ĐÃ QUYẾT TOÁN.
--
-- Bối cảnh: bảo hiểm nằm trong nhóm thanh toán định kỳ nên số liệu về rất muộn,
-- thường sau khi đoàn đi xong và đã quyết toán HDV. Khóa quyết toán (xem
-- src/lib/chi-phi-lock.ts) đang chặn hết mọi mục chi phí → người phụ trách không
-- vào được số bảo hiểm nữa, phải nhờ admin.
--
-- Mở ngoại lệ CHỈ cho dòng danh_muc='bao_hiem' là an toàn: bảo hiểm do công ty
-- trả (tien_hdv = 0) nên không làm lệch số quyết toán HDV. Mọi mục khác vẫn khóa.
--
-- Khóa quyết toán được enforce ở TẦNG APP (lockGuard trong các hook chi phí),
-- không có policy DB tương ứng → migration này chỉ cần thêm cột đánh dấu.
-- ALTER TABLE trên bảng đang có → giữ nguyên grants, không cần GRANT lại.
-- Cột chỉ admin sửa được: user_roles chỉ có policy admin_update; RPC
-- update_my_profile (tự sửa hồ sơ) chỉ đụng ho_ten + so_dien_thoai.

ALTER TABLE public.user_roles
  ADD COLUMN IF NOT EXISTS phu_trach_bao_hiem boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.user_roles.phu_trach_bao_hiem IS
  'true = người phụ trách bảo hiểm: được sửa chi phí danh_muc=bao_hiem kể cả khi đoàn đã quyết toán (các mục chi phí khác vẫn khóa như cũ).';
