-- doan_chi_phi.so_luong: integer -> numeric để hỗ trợ nửa suất NH (vd 21.5 phần ăn khi có 1 trẻ em ăn nửa).
-- Cảnh điểm / DV vẫn lưu giá trị nguyên trong cột numeric — không breaking.
-- thanh_tien là GENERATED column, phải drop + recreate khi đổi type của cột nguồn.

ALTER TABLE public.doan_chi_phi DROP COLUMN thanh_tien;

ALTER TABLE public.doan_chi_phi
  ALTER COLUMN so_luong TYPE numeric USING so_luong::numeric;

ALTER TABLE public.doan_chi_phi
  ADD COLUMN thanh_tien numeric
  GENERATED ALWAYS AS (don_gia * so_luong) STORED;
