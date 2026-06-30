-- ============================================================================
-- FOC dịch vụ (cảnh điểm) — thêm foc_khach/foc_mien vào danh mục canh_diem
-- ----------------------------------------------------------------------------
-- Mirror nha_hang.foc_khach/foc_mien: "cứ X khách miễn Y suất". Dùng làm GIÁ TRỊ
-- MẶC ĐỊNH cho chi phí dịch vụ; khi điều tour cascade tạo doan_chi_phi, giá trị
-- này được SNAPSHOT vào doan_chi_phi.foc_khach_snapshot/foc_mien_snapshot
-- (cột đã có sẵn) → master đổi sau KHÔNG ảnh hưởng đoàn cũ.
-- ALTER TABLE (chỉ thêm cột) → KHÔNG cần GRANT lại (bảng giữ grants cũ).
-- ============================================================================

ALTER TABLE public.canh_diem
  ADD COLUMN IF NOT EXISTS foc_khach numeric NULL,
  ADD COLUMN IF NOT EXISTS foc_mien  numeric NULL;

COMMENT ON COLUMN public.canh_diem.foc_khach IS
  'FOC: cứ foc_khach khách thì miễn foc_mien suất (vé). NULL = không FOC. '
  'Snapshot vào doan_chi_phi.foc_khach_snapshot khi điều tour cascade.';
COMMENT ON COLUMN public.canh_diem.foc_mien IS
  'Số suất miễn cho mỗi foc_khach khách (xem foc_khach). NULL = không FOC.';
