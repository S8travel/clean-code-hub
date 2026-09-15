-- Lưu nguyên nội dung (thông tin xe + lịch trình từng ngày) tại lần gửi mail
-- booking XE gần nhất. Trước đây chỉ có mail_content_hash (djb2, 1 chiều) → biết
-- "có thay đổi" nhưng không biết đổi GÌ. Cột này cho mail "Gửi cập nhật" tự liệt
-- kê thay đổi trước → nay và tô vàng ô đã đổi (lib/booking-mail/xe-mail.ts).
-- Giống doan_booking_nh.mail_sent_snapshot (20260519).
-- NULL = booking gửi trước khi có cột → mail cập nhật vẫn gửi đủ lịch trình, chỉ
-- không tự liệt kê được thay đổi.
-- ALTER TABLE thêm cột → bảng giữ nguyên grants/RLS cũ, KHÔNG cần GRANT thêm.
ALTER TABLE public.doan_booking_xe
  ADD COLUMN IF NOT EXISTS mail_sent_snapshot jsonb;
