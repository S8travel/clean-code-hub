-- Lưu snapshot giá trị các key fields tại lần gửi mail gần nhất (booking NH).
-- Trước đây chỉ lưu mail_content_hash (djb2, 1 chiều) → biết "có thay đổi"
-- nhưng không khôi phục được giá trị cũ để diff. Cột này lưu nguyên payload
-- buildMailFields() lúc gửi → mail "Gửi cập nhật" tự diff A→B (Set menu /
-- Số khách / Món…) điền sẵn callout "Thay đổi:".
-- ALTER TABLE thêm cột → bảng giữ nguyên grants cũ, KHÔNG cần GRANT thêm.
ALTER TABLE public.doan_booking_nh
  ADD COLUMN IF NOT EXISTS mail_sent_snapshot jsonb;
