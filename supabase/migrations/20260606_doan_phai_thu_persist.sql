-- Phải thu (tab Chi phí) — persist các trường trước đây chỉ là local state / localStorage,
-- để không mất khi reload và xuất được ra Excel tổng hợp.
--   tip_currency   : loại tiền tip (NDT/NT$/US$/USD/VND). NULL = NDT (mặc định cũ).
--   tip_nguoi_thu  : ai thu tip ('hdv' | 'cong_ty'). NULL = 'hdv' (mặc định cũ).
--   tip_ty_gia     : tỷ giá quy đổi tip → VND (snapshot per tour). NULL = fallback 800.
--   phai_thu_extras: các dòng thu thêm tay (nút ➕). Mảng JSON
--                    [{moTa,soTien,loaiTien,tyGia,nguoiThu}]. Mặc định [].
-- ALTER TABLE: bảng giữ nguyên grants/RLS cũ → KHÔNG cần GRANT lại.
ALTER TABLE public.doan
  ADD COLUMN IF NOT EXISTS tip_currency text,
  ADD COLUMN IF NOT EXISTS tip_nguoi_thu text,
  ADD COLUMN IF NOT EXISTS tip_ty_gia numeric,
  ADD COLUMN IF NOT EXISTS phai_thu_extras jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.doan.tip_currency IS 'Loại tiền tip (NDT/NT$/US$/USD/VND). NULL=NDT.';
COMMENT ON COLUMN public.doan.tip_nguoi_thu IS 'Ai thu tip: hdv | cong_ty. NULL=hdv.';
COMMENT ON COLUMN public.doan.tip_ty_gia IS 'Tỷ giá tip → VND (snapshot per tour). NULL=fallback 800.';
COMMENT ON COLUMN public.doan.phai_thu_extras IS 'Dòng thu thêm tay: [{moTa,soTien,loaiTien,tyGia,nguoiThu}].';
