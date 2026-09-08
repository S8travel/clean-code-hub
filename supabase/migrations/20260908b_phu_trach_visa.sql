-- Người phụ trách visa được sửa chi phí visa kể cả khi đoàn ĐÃ QUYẾT TOÁN.
--
-- Cùng lý do với bảo hiểm (xem 20260908_phu_trach_bao_hiem.sql): visa nằm trong
-- nhóm thanh toán định kỳ nên số về muộn, thường sau khi đoàn đã quyết toán.
-- Đo trên DB 08/09/2026: 220/220 dòng danh_muc='visa' đều do công ty trả
-- (tien_hdv = 0) → mở riêng mục này không làm lệch số quyết toán HDV.
--
-- Khóa quyết toán enforce ở TẦNG APP (lockGuard trong các hook chi phí) nên
-- migration chỉ cần thêm cột đánh dấu. ALTER TABLE trên bảng đang có → giữ
-- nguyên grants. Cột chỉ admin sửa được (user_roles chỉ có policy admin_update).

ALTER TABLE public.user_roles
  ADD COLUMN IF NOT EXISTS phu_trach_visa boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.user_roles.phu_trach_visa IS
  'true = người phụ trách visa: được sửa chi phí danh_muc=visa kể cả khi đoàn đã quyết toán (các mục chi phí khác vẫn khóa như cũ).';
