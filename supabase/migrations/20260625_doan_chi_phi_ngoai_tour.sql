-- Chi phí "ngoài tour": dòng chi phí tự do KHÔNG gắn lịch trình điều tour
-- (KS/NH/DV ngoài tour). Cờ này để:
--   1. Cascade điều tour (use-dieu-tour) bỏ qua row (vốn chỉ đụng nha_hang +
--      cảnh điểm theo ref; KS không cascade nên thực tế KS đã an toàn sẵn).
--   2. Reconcile section (use-ks-section) loại các row này khỏi máy tính
--      phòng/đêm/FOC — chúng hiển thị ở panel "Ngoài tour" riêng.
-- ALTER TABLE: giữ nguyên grants/RLS cũ, KHÔNG cần GRANT lại.
ALTER TABLE public.doan_chi_phi
  ADD COLUMN IF NOT EXISTS ngoai_tour boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.doan_chi_phi.ngoai_tour IS
  'true = chi phi phat sinh ngoai lich trinh tour (KS/NH/DV ngoai tour). Cascade dieu tour + reconcile section bo qua row nay.';

-- KS ngoài tour: chọn khách sạn từ danh mục + check-in/check-out (số đêm).
-- Các cột này CHỈ dùng cho row ngoai_tour=true (KS trong tour suy khách sạn/ngày
-- qua ref_doan_ngay_id → doan_ngay). NULL cho mọi row hiện có.
ALTER TABLE public.doan_chi_phi
  ADD COLUMN IF NOT EXISTS khach_san_id bigint,
  ADD COLUMN IF NOT EXISTS ngoai_tour_ci date,
  ADD COLUMN IF NOT EXISTS ngoai_tour_co date;

COMMENT ON COLUMN public.doan_chi_phi.khach_san_id IS
  'KS ngoai tour: khach san chon tu danh muc (khong FK; in-tour suy qua ref_doan_ngay_id).';
COMMENT ON COLUMN public.doan_chi_phi.ngoai_tour_ci IS 'KS ngoai tour: ngay check-in.';
COMMENT ON COLUMN public.doan_chi_phi.ngoai_tour_co IS 'KS ngoai tour: ngay check-out. So dem = co - ci.';
