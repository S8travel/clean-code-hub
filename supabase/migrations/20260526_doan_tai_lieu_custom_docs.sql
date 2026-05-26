-- Cho phép thêm tài liệu tùy chỉnh ngoài 3 loại cố định (bao_gia/hop_dong/danh_sach_khach).
-- 1) Drop CHECK + UNIQUE cũ
-- 2) UNIQUE partial: chỉ áp 1-row-per-loại cho 3 loại fixed; loại 'khac' tự do nhiều rows
-- 3) Thêm cột `ten` + `mo_ta` cho tài liệu custom

ALTER TABLE public.doan_tai_lieu
  DROP CONSTRAINT IF EXISTS doan_tai_lieu_loai_check;

ALTER TABLE public.doan_tai_lieu
  DROP CONSTRAINT IF EXISTS doan_tai_lieu_doan_loai_unique;

-- CHECK mới: 3 loại fixed + 'khac'
ALTER TABLE public.doan_tai_lieu
  ADD CONSTRAINT doan_tai_lieu_loai_check
  CHECK (loai IN ('bao_gia', 'hop_dong', 'danh_sach_khach', 'khac'));

-- Partial UNIQUE: chỉ áp cho 3 loại fixed (loai != 'khac')
CREATE UNIQUE INDEX doan_tai_lieu_doan_loai_fixed_unique
  ON public.doan_tai_lieu (doan_id, loai)
  WHERE loai <> 'khac';

-- Cột mới
ALTER TABLE public.doan_tai_lieu
  ADD COLUMN ten TEXT NULL,
  ADD COLUMN mo_ta TEXT NULL;

-- Note: ten/mo_ta chỉ dùng cho loai='khac'; loai fixed dùng label cứng ở UI
