-- Override số khách cho "Thu tiền đầu khách" (giống tip_so_khach_override).
-- NULL = auto (UI hiện tại default 0 thay vì autoSoKhach skip T/L).
ALTER TABLE public.doan
  ADD COLUMN IF NOT EXISTS dau_khach_so_khach_override numeric;
