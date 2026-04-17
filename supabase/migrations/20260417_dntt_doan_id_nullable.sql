-- ĐNTT định kỳ (batch) không thuộc về 1 đoàn cụ thể → cho phép doan_id = NULL
ALTER TABLE public.de_nghi_thanh_toan
  ALTER COLUMN doan_id DROP NOT NULL;
