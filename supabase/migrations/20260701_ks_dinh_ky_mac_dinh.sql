-- Khách sạn: cờ "mặc định thanh toán định kỳ".
-- TRUE = mọi chi phí KS của khách sạn này mặc định gộp thanh toán định kỳ theo NCC.
--   * Đoàn mới: dòng chi phí KS tạo ra tự set doan_chi_phi.thanh_toan_dinh_ky = true.
--   * Đoàn cũ: backfill 1 lần các dòng chưa thanh toán (chạy ngoài migration, data op).
-- ALTER TABLE (thêm cột) → KHÔNG cần GRANT lại (giữ nguyên grants của bảng).
ALTER TABLE public.khach_san
  ADD COLUMN IF NOT EXISTS thanh_toan_dinh_ky_mac_dinh BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN public.khach_san.thanh_toan_dinh_ky_mac_dinh IS
  'TRUE = chi phí KS này mặc định thanh toán định kỳ (gộp theo NCC). Đoàn mới tự đánh dấu doan_chi_phi.thanh_toan_dinh_ky=true khi tạo dòng.';
