-- 1. Thêm thông tin ngân hàng cho hướng dẫn viên
ALTER TABLE public.huong_dan_vien
  ADD COLUMN IF NOT EXISTS so_tai_khoan VARCHAR(50) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS ngan_hang VARCHAR(100) DEFAULT NULL;

COMMENT ON COLUMN public.huong_dan_vien.so_tai_khoan IS 'Số tài khoản ngân hàng để quyết toán';
COMMENT ON COLUMN public.huong_dan_vien.ngan_hang IS 'Tên ngân hàng';

-- 2. Thêm hdv_id vào đề nghị thanh toán (cho tạm ứng + quyết toán HDV)
ALTER TABLE public.de_nghi_thanh_toan
  ADD COLUMN IF NOT EXISTS hdv_id INT REFERENCES public.huong_dan_vien(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.de_nghi_thanh_toan.hdv_id IS
  'FK tới hướng dẫn viên. Dùng khi ref_loai = hdv_tam_ung hoặc hdv_quyet_toan';

-- 3. Thêm flag thu hồi (HDV hoàn lại tiền cho công ty khi chi < tạm ứng)
ALTER TABLE public.de_nghi_thanh_toan
  ADD COLUMN IF NOT EXISTS la_thu_hoi BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN public.de_nghi_thanh_toan.la_thu_hoi IS
  'TRUE = đây là khoản thu hồi từ HDV (HDV hoàn lại tiền dư tạm ứng), FALSE = công ty chi cho HDV';
