-- Mark deadline as done per booking (KS/NH/DV).
-- NULL = chưa done; timestamptz = đánh dấu xong tại thời điểm đó.
-- useMyDeadlines filter is("deadline_done_at", null) để ẩn các deadline đã xong khỏi list.
ALTER TABLE public.doan_booking_ks
  ADD COLUMN IF NOT EXISTS deadline_done_at timestamptz;
ALTER TABLE public.doan_booking_nh
  ADD COLUMN IF NOT EXISTS deadline_done_at timestamptz;
ALTER TABLE public.doan_booking_dv
  ADD COLUMN IF NOT EXISTS deadline_done_at timestamptz;
