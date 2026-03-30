-- Đánh dấu chi phí thanh toán định kỳ (gộp cuối tháng theo NCC)
-- thay vì thanh toán ngay theo từng đoàn
ALTER TABLE public.doan_chi_phi
  ADD COLUMN IF NOT EXISTS thanh_toan_dinh_ky BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN public.doan_chi_phi.thanh_toan_dinh_ky IS
  'TRUE = chi phí này được thanh toán gộp định kỳ theo NCC (kế toán tạo ĐNTT batch). FALSE = thanh toán ngay theo đoàn.';
