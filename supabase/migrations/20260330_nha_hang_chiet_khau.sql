-- Thêm cột chiết khấu % trên tổng tiền cho nhà hàng
ALTER TABLE public.nha_hang
  ADD COLUMN IF NOT EXISTS chiet_khau_phan_tram NUMERIC DEFAULT NULL;

COMMENT ON COLUMN public.nha_hang.chiet_khau_phan_tram IS
  'Chiết khấu % trên tổng tiền sử dụng dịch vụ (sau FOC). Ví dụ: 10 = giảm 10%. NULL = không áp dụng.';
