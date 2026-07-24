-- Kỳ thanh toán định kỳ (override thủ công).
--
-- Bối cảnh: trang Thanh toán định kỳ gom chi phí theo THÁNG NGÀY ĐI của đoàn.
-- Nhưng NCC (KS/xe) chỉ xuất hóa đơn khi đoàn KẾT THÚC → đoàn khởi hành cuối
-- tháng (29/30) có hóa đơn rơi sang tháng sau, kế toán phải trả ở kỳ kế tiếp.
-- Đây không phải case hiếm: một phần đáng kể đoàn có ngày đi và ngày về khác tháng.
--
-- Giữ mặc định theo ngày đi (khỏi xáo trộn các cụm đang chạy) + cột này làm van
-- xả cho kế toán đẩy dòng sang kỳ khác. NULL = dùng mặc định.
--
-- Định dạng 'YYYY-MM' = kỳ TUYỆT ĐỐI (không phải offset) → đẩy nhiều lần không
-- cộng dồn nhầm, và đọc DB là biết ngay dòng đang thuộc kỳ nào.

ALTER TABLE public.doan_chi_phi
  ADD COLUMN IF NOT EXISTS ky_thanh_toan text NULL;

ALTER TABLE public.doan_chi_phi
  DROP CONSTRAINT IF EXISTS doan_chi_phi_ky_thanh_toan_format;

ALTER TABLE public.doan_chi_phi
  ADD CONSTRAINT doan_chi_phi_ky_thanh_toan_format
  CHECK (ky_thanh_toan IS NULL OR ky_thanh_toan ~ '^\d{4}-(0[1-9]|1[0-2])$');

COMMENT ON COLUMN public.doan_chi_phi.ky_thanh_toan IS
  'Kỳ thanh toán định kỳ override (YYYY-MM). NULL = mặc định theo tháng ngày đi của đoàn. Dùng khi hóa đơn NCC xuất sang tháng sau (đoàn kết thúc đầu tháng kế).';

-- Lọc/gom theo kỳ → index phần (chỉ dòng có override, thường rất ít).
CREATE INDEX IF NOT EXISTS idx_doan_chi_phi_ky_thanh_toan
  ON public.doan_chi_phi (ky_thanh_toan)
  WHERE ky_thanh_toan IS NOT NULL;
