-- Thêm các trường mới cho bảng huong_dan_vien
-- Chạy file này trong Supabase SQL Editor của project: lflsbwoqzmbknzdpaequ

ALTER TABLE huong_dan_vien
  ADD COLUMN IF NOT EXISTS gioi_tinh   text,
  ADD COLUMN IF NOT EXISTS nam_sinh    integer,
  ADD COLUMN IF NOT EXISTS kinh_nghiem text,
  ADD COLUMN IF NOT EXISTS chuyen_mon  text,
  ADD COLUMN IF NOT EXISTS agent_ids   integer[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS ghi_chu     text;
