-- Tầng 2 — Booking KS có vòng đời (thẻ "Đã hủy" đàng hoàng thay vì nhét mục ngoài-tour).
--
-- Bối cảnh: KS hủy bị charge (guard PR #251) hiện lưu bằng hack: dòng ngoài-tour prefix
-- "[Phí hủy]"/"[Chờ xử lý]" + ĐNTT ref_loai='ngoai_tour_ks' → lẫn với KS ngoài tour thật
-- (đêm phụ/KS HDV), badge "ĐNTT lệch" giả, không thấy lịch sử "đêm X từng là KS A".
--
-- Tầng 2: doan_booking_ks (vốn là entity booking 1 row/KS/đoàn) mang vòng đời:
--   trang_thai 'active' | 'da_huy' + phi_huy + ly_do_huy + huy_luc/huy_boi + cong_no_id.
-- Dòng chi phí thuộc cụm hủy đánh dấu doan_chi_phi.ks_huy = true (dải "Đã hủy" group
-- theo khach_san_id trên các dòng này; panel KS ngoài tour LOẠI chúng ra).
--
-- ALTER TABLE → không cần GRANT/RLS mới (bảng giữ grants cũ — xem CLAUDE.md).

-- 1. Vòng đời booking KS
ALTER TABLE public.doan_booking_ks
  ADD COLUMN IF NOT EXISTS trang_thai text NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS phi_huy numeric,
  ADD COLUMN IF NOT EXISTS ly_do_huy text,
  ADD COLUMN IF NOT EXISTS huy_luc timestamptz,
  ADD COLUMN IF NOT EXISTS huy_boi uuid,
  ADD COLUMN IF NOT EXISTS cong_no_id bigint REFERENCES public.cong_no(id) ON DELETE SET NULL;

ALTER TABLE public.doan_booking_ks
  DROP CONSTRAINT IF EXISTS doan_booking_ks_trang_thai_check;
ALTER TABLE public.doan_booking_ks
  ADD CONSTRAINT doan_booking_ks_trang_thai_check CHECK (trang_thai IN ('active', 'da_huy'));

-- 2. Đánh dấu dòng chi phí thuộc cụm KS đã hủy (phí hủy + dòng convert "[Chờ xử lý]")
ALTER TABLE public.doan_chi_phi
  ADD COLUMN IF NOT EXISTS ks_huy boolean NOT NULL DEFAULT false;

-- 3. Backfill ca Wyndham (đoàn 324, KS 112, NCC 143 — gỡ tay 07/07/2026):
--    dòng "[Phí hủy] Wyndham" + cong_no 20.34M đã tồn tại, giờ gắn vào lifecycle.
UPDATE public.doan_booking_ks
SET trang_thai = 'da_huy',
    phi_huy    = 20340000,
    ly_do_huy  = 'Hủy do bão — đổi sang Crowne Plaza (NCC giữ phí hủy 50%)',
    huy_luc    = '2026-07-07T09:00:00+07:00',
    cong_no_id = (SELECT id FROM public.cong_no
                  WHERE dntt_goc_id = 1344 AND nha_cung_cap_id = 143
                  ORDER BY id LIMIT 1)
WHERE doan_id = 324 AND khach_san_id = 112;

INSERT INTO public.doan_booking_ks (doan_id, khach_san_id, trang_thai, phi_huy, ly_do_huy, huy_luc, cong_no_id)
SELECT 324, 112, 'da_huy', 20340000,
       'Hủy do bão — đổi sang Crowne Plaza (NCC giữ phí hủy 50%)',
       '2026-07-07T09:00:00+07:00',
       (SELECT id FROM public.cong_no
        WHERE dntt_goc_id = 1344 AND nha_cung_cap_id = 143
        ORDER BY id LIMIT 1)
WHERE EXISTS (SELECT 1 FROM public.doan WHERE id = 324)
  AND NOT EXISTS (SELECT 1 FROM public.doan_booking_ks WHERE doan_id = 324 AND khach_san_id = 112);

UPDATE public.doan_chi_phi
SET ks_huy = true
WHERE doan_id = 324 AND danh_muc = 'khach_san' AND ngoai_tour = true AND khach_san_id = 112;
