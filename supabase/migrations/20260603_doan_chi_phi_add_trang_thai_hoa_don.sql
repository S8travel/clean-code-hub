-- Trạng thái hóa đơn cho dòng chi phí do HDV thanh toán (không có ĐNTT nên không
-- thể bám trang_thai_hoa_don của de_nghi_thanh_toan). Nullable → NULL = 'chua_co'.
-- Kế toán bấm đổi thủ công (chua_co → da_co → khong_can).
ALTER TABLE public.doan_chi_phi
  ADD COLUMN IF NOT EXISTS trang_thai_hoa_don text;

COMMENT ON COLUMN public.doan_chi_phi.trang_thai_hoa_don IS
  'Trạng thái hóa đơn dòng HDV trả (NH/DV/KS). NULL=chua_co. da_co|khong_can. Dòng công ty trả dùng de_nghi_thanh_toan.trang_thai_hoa_don.';
