-- ============================================================================
-- NHÀ HÀNG: cờ "mặc định thanh toán định kỳ" (2026-07-29)
-- ----------------------------------------------------------------------------
-- Khách sạn đã có `khach_san.thanh_toan_dinh_ky_mac_dinh` (xem lib/ks-dinh-ky.ts):
-- KS gắn cờ thì đoàn MỚI tự đánh dấu dòng chi phí là định kỳ, khỏi phải bật tay
-- từng đoàn. Nhà hàng chưa có — trong khi vẫn có NCC thanh toán theo kỳ.
--
-- Ngữ nghĩa GIỐNG HỆT bên KS (mirror trong lib/nh-dinh-ky.ts):
--   • Bữa ăn CHƯA có dòng chi phí trong đoàn → seed theo cờ của nhà hàng.
--   • Bữa ăn ĐÃ có dòng chi phí → tôn trọng `doan_chi_phi.thanh_toan_dinh_ky`
--     hiện tại, KHÔNG "hồi sinh" định kỳ mà OP đã tắt tay ở đoàn cũ.
-- Nên bật/tắt cờ này KHÔNG đụng tới đoàn đã có chi phí — đúng rule "đổi danh mục
-- không được ảnh hưởng đoàn hiện có" (CLAUDE.md).
--
-- ALTER TABLE → giữ nguyên grants/RLS sẵn có, không cần cấp lại.
--
-- Rollback:
--   ALTER TABLE public.nha_hang DROP COLUMN thanh_toan_dinh_ky_mac_dinh;
-- ============================================================================

ALTER TABLE public.nha_hang
  ADD COLUMN IF NOT EXISTS thanh_toan_dinh_ky_mac_dinh boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.nha_hang.thanh_toan_dinh_ky_mac_dinh IS
  'true = đoàn MỚI tự đánh dấu chi phí nhà hàng này là thanh toán định kỳ. Bữa đã có dòng chi phí thì giữ nguyên toggle tay. Mirror khach_san.thanh_toan_dinh_ky_mac_dinh.';

DO $mig$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'nha_hang'
    AND column_name = 'thanh_toan_dinh_ky_mac_dinh';
  IF n <> 1 THEN RAISE EXCEPTION 'Thiếu cột thanh_toan_dinh_ky_mac_dinh trên nha_hang'; END IF;
  RAISE NOTICE 'nha_hang.thanh_toan_dinh_ky_mac_dinh OK';
END $mig$;
