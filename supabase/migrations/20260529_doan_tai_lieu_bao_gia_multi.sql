-- Báo giá: cho phép NHIỀU file/đoàn (giống loại 'khac').
-- Trước đây 3 loại fixed (bao_gia/hop_dong/danh_sach_khach) đều 1-file-per-loại
-- qua partial unique index. Nay loại 'bao_gia' KHỎI index để up nhiều báo giá.
-- Giữ hop_dong + danh_sach_khach 1 file/đoàn.

DROP INDEX IF EXISTS public.doan_tai_lieu_doan_loai_fixed_unique;

CREATE UNIQUE INDEX doan_tai_lieu_doan_loai_fixed_unique
  ON public.doan_tai_lieu (doan_id, loai)
  WHERE loai IN ('hop_dong', 'danh_sach_khach');
