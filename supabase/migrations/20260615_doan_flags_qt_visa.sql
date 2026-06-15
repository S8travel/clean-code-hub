-- Cờ tay (thao tác) hiển thị ở danh sách đoàn — kế toán/admin tick.
-- da_check_quyet_toan: đã check quyết toán (cờ tay, ĐỘC LẬP với trạng thái
--   "Đã quyết toán" tự tính từ DNTT quyết toán HDV — không đồng bộ).
-- da_thu_visa: đã thu visa (cờ tay).
-- ALTER trên bảng có sẵn → KHÔNG cần GRANT lại.
ALTER TABLE public.doan
  ADD COLUMN IF NOT EXISTS da_check_quyet_toan boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS da_thu_visa boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.doan.da_check_quyet_toan IS
  'Cờ tay: kế toán/admin đánh dấu đã check quyết toán. Độc lập với trạng thái "Đã quyết toán" computed từ DNTT quyết toán HDV.';
COMMENT ON COLUMN public.doan.da_thu_visa IS
  'Cờ tay: kế toán/admin đánh dấu đã thu visa.';
