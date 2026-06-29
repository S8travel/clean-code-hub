-- Giá phòng khách sạn theo GIAI ĐOẠN (mùa). Thay cột đơn khach_san.gia_phong_mac_dinh
-- (bỏ ở cuối) bằng bảng nhiều dòng/KS: mỗi dòng = tên giai đoạn + khoảng ngày + loại
-- phòng + giá. Dòng tu_ngay/den_ngay NULL = giá "Mặc định" (fallback khi không khớp
-- giai đoạn nào). Đã APPLY PROD 2026-06-27.

CREATE TABLE public.khach_san_gia_phong (
  id            bigserial PRIMARY KEY,
  khach_san_id  bigint NOT NULL REFERENCES public.khach_san(id) ON DELETE CASCADE,
  ten_giai_doan text,
  tu_ngay       date,
  den_ngay      date,
  loai_phong    text,
  gia           numeric NOT NULL DEFAULT 0,
  ghi_chu       text,
  active        boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_ksgp_khach_san ON public.khach_san_gia_phong(khach_san_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.khach_san_gia_phong TO authenticated, service_role;
GRANT SELECT ON public.khach_san_gia_phong TO anon;
GRANT USAGE, SELECT ON SEQUENCE public.khach_san_gia_phong_id_seq TO authenticated, service_role;

ALTER TABLE public.khach_san_gia_phong ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_all" ON public.khach_san_gia_phong
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Migrate giá median đã backfill (cột gia_phong_mac_dinh) → dòng "Mặc định".
INSERT INTO public.khach_san_gia_phong (khach_san_id, ten_giai_doan, loai_phong, gia, ghi_chu)
SELECT id, 'Mặc định', 'TWN/DBL', gia_phong_mac_dinh,
       'Tự động từ chi phí KS thực tế (median TWN/DBL)'
FROM public.khach_san
WHERE gia_phong_mac_dinh IS NOT NULL;

-- Bỏ cột đơn (đã chuyển sang bảng) — chưa feature nào đọc.
ALTER TABLE public.khach_san DROP COLUMN IF EXISTS gia_phong_mac_dinh;
