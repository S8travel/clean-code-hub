-- Add active flag and dia_diem_ids array to huong_dan_vien
ALTER TABLE huong_dan_vien
  ADD COLUMN IF NOT EXISTS active boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS dia_diem_ids integer[] NOT NULL DEFAULT '{}';
