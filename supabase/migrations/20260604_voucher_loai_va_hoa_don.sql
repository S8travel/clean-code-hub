-- Voucher: phân biệt MUA vs TẶNG + link ĐNTT voucher để theo dõi hóa đơn.
--
-- Bối cảnh: voucher MUA (mua sỉ giá rẻ, đã trả trước) — khi dùng NCC VẪN xuất hóa
-- đơn theo giá trị voucher → cần 1 ĐNTT "đã trả bằng voucher" để kế toán nhập hóa
-- đơn trong trang Hóa đơn–UNC như ĐNTT thường. Voucher TẶNG — không hóa đơn.
-- (method='voucher' cần nới CHECK constraint: xem 20260604_payments_method_voucher.sql.)

ALTER TABLE public.voucher
  ADD COLUMN IF NOT EXISTS loai text NOT NULL DEFAULT 'mua';  -- 'mua' | 'tang'

ALTER TABLE public.voucher_su_dung
  ADD COLUMN IF NOT EXISTS dntt_id bigint
    REFERENCES public.de_nghi_thanh_toan(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_voucher_su_dung_dntt
  ON public.voucher_su_dung(dntt_id);

-- Recreate view để lộ cột loai (view cũ cố định danh sách cột lúc tạo, không tự
-- thêm khi ALTER bảng). Giữ security_invoker=on (đã siết theo Advisor #6).
DROP VIEW IF EXISTS public.voucher_with_status;
CREATE VIEW public.voucher_with_status WITH (security_invoker = on) AS
SELECT v.*,
  COALESCE(u.so_luong_da_dung, 0) AS so_luong_da_dung,
  v.so_luong - COALESCE(u.so_luong_da_dung, 0) AS so_luong_con_lai,
  COALESCE(u.tong_gia_tri_da_dung, 0) AS tong_gia_tri_da_dung
FROM public.voucher v
LEFT JOIN (
  SELECT voucher_id,
         SUM(so_luong) AS so_luong_da_dung,
         SUM(gia_tri)  AS tong_gia_tri_da_dung
  FROM public.voucher_su_dung
  GROUP BY voucher_id
) u ON u.voucher_id = v.id;

GRANT SELECT ON public.voucher_with_status TO authenticated, anon, service_role;
