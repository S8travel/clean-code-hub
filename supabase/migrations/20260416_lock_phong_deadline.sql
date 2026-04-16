-- Add deadline column to lock_phong
-- Default = ngay_xuat_phat - 45 days (computed at application level)
ALTER TABLE public.lock_phong
  ADD COLUMN IF NOT EXISTS deadline date;
