-- Cảnh điểm/dịch vụ ĐẶT NGOÀI HỆ THỐNG → không sinh dòng ở tab Booking DV.
--
-- Bối cảnh: dịch vụ luôn đặt qua Zalo/điện thoại vẫn được sync sang
-- doan_booking_dv rồi nằm mãi ở trạng thái "chưa gửi" → MyJob/Theo dõi coi là
-- việc chưa hoàn thành, đoàn nào cũng bị nhắc. Cờ này tắt hẳn phần booking cho
-- dịch vụ đó; chi phí vẫn tính bình thường.
--
-- Tàu/du thuyền KHÔNG cần cờ này: đã có canh_diem.khach_san_id (day-use) →
-- booking + chi phí do tab Booking KS quản, code lọc theo cột đó.
--
-- ALTER TABLE: bảng canh_diem giữ nguyên grants/RLS cũ, không cần cấp lại.
ALTER TABLE public.canh_diem
  ADD COLUMN IF NOT EXISTS khong_can_booking boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.canh_diem.khong_can_booking IS
  'true = đặt ngoài hệ thống (Zalo/điện thoại/quan hệ) → KHÔNG sync sang doan_booking_dv, không nhắc gửi booking. Chi phí vẫn tính như thường.';
