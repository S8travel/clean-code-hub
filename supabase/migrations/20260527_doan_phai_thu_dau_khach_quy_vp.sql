-- Thêm 2 khoản phải thu cố định cho mỗi đoàn (ngoài Tip đã có):
-- 1. Thu tiền đầu khách: per-pax × đơn giá (không nhân ngày)
-- 2. Thu tiền quỹ VP: lump-sum cho cả đoàn
-- Mỗi khoản có currency + ty_gia + nguoi_thu (cong_ty/hdv) riêng.
-- Tất cả nullable — NULL = chưa có khoản đó, row UI vẫn render với input rỗng.
-- (UI iteration sau hardcode currency=VND, tỷ giá=1 nên 2 field đó để dành
--  cho future flexibility — chưa surface trên UI.)

ALTER TABLE public.doan
  ADD COLUMN IF NOT EXISTS dau_khach_rate numeric,
  ADD COLUMN IF NOT EXISTS dau_khach_currency text,
  ADD COLUMN IF NOT EXISTS dau_khach_ty_gia numeric,
  ADD COLUMN IF NOT EXISTS dau_khach_nguoi_thu text,
  ADD COLUMN IF NOT EXISTS quy_vp_amount numeric,
  ADD COLUMN IF NOT EXISTS quy_vp_currency text,
  ADD COLUMN IF NOT EXISTS quy_vp_ty_gia numeric,
  ADD COLUMN IF NOT EXISTS quy_vp_nguoi_thu text;
