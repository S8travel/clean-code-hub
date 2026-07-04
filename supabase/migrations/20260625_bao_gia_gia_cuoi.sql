-- Báo giá: thêm Agent (đối tác bán), loại tour, loại báo giá (tự tính / giá cuối),
-- và danh sách file lịch trình đính kèm.
--
-- ALTER trên bảng có sẵn → KHÔNG cần GRANT lại (giữ nguyên grants của bao_gia).
--
-- loai_bao_gia:
--   'tu_tinh'  — engine cũ: tính giá từ từng dịch vụ × bậc số khách + markup.
--   'gia_cuoi' — land tour lấy của bên khác, giá đã chốt: nhập thẳng giá theo
--                bậc số khách (ket_qua.gia_cuoi_tiers), bỏ qua costing.
-- Hàng cũ → default 'tu_tinh' (giữ nguyên hành vi).
--
-- lich_trinh_files jsonb: mảng { ten, url, uploaded_at, uploaded_by } — file
-- lịch trình đính kèm (chỉ lưu để xem/tải/xuất kèm, KHÔNG AI đọc).

ALTER TABLE public.bao_gia
  ADD COLUMN IF NOT EXISTS agent_id bigint REFERENCES public.agents(id),
  ADD COLUMN IF NOT EXISTS loai_tour text,
  ADD COLUMN IF NOT EXISTS loai_bao_gia text NOT NULL DEFAULT 'tu_tinh',
  ADD COLUMN IF NOT EXISTS lich_trinh_files jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.bao_gia.agent_id IS 'Đối tác bán (agents) — báo giá làm cho agent này.';
COMMENT ON COLUMN public.bao_gia.loai_tour IS 'inbound | outbound | noi_dia (nhãn; map sang doan.loai_tour khi chốt).';
COMMENT ON COLUMN public.bao_gia.loai_bao_gia IS 'tu_tinh (tính từ dịch vụ) | gia_cuoi (giá chốt sẵn theo bậc khách).';
COMMENT ON COLUMN public.bao_gia.lich_trinh_files IS 'jsonb mảng { ten, url, uploaded_at, uploaded_by } — file lịch trình đính kèm.';
