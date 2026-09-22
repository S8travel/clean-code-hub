-- Tên tiếng Trung cho cảnh điểm — cùng kiểu khach_san.ten_zh / nha_hang.ten_zh.
-- ALTER TABLE: bảng giữ grants + RLS cũ, không cần GRANT lại.
-- Bản dịch ban đầu (phồn thể) ghi thẳng lên prod, KHÔNG để trong file này
-- (khoá theo id — môi trường khác không trùng id).
ALTER TABLE public.canh_diem
  ADD COLUMN IF NOT EXISTS ten_zh text;
