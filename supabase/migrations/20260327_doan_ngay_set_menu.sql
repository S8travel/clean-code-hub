-- Thêm cột set menu cho bảng điều tour
-- Chạy trong Supabase SQL Editor: project lflsbwoqzmbknzdpaequ

ALTER TABLE doan_ngay
  ADD COLUMN IF NOT EXISTS an_trua_set_menu_id bigint,
  ADD COLUMN IF NOT EXISTS an_toi_set_menu_id bigint;
