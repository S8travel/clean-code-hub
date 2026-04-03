-- Bảng nhà xe
CREATE TABLE public.nha_xe (
  id SERIAL PRIMARY KEY,
  ten TEXT NOT NULL,
  dia_diem TEXT DEFAULT NULL,
  email TEXT DEFAULT NULL,
  so_dien_thoai TEXT DEFAULT NULL,
  tai_khoan_thanh_toan TEXT DEFAULT NULL,
  nguoi_thanh_toan TEXT DEFAULT NULL,
  ghi_chu TEXT DEFAULT NULL,
  nha_cung_cap_id INT REFERENCES public.nha_cung_cap(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.nha_xe ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read" ON public.nha_xe FOR SELECT USING (true);
CREATE POLICY "Allow public insert" ON public.nha_xe FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update" ON public.nha_xe FOR UPDATE USING (true);
CREATE POLICY "Allow public delete" ON public.nha_xe FOR DELETE USING (true);

-- Bảng loại xe (sản phẩm của từng nhà xe)
CREATE TABLE public.nha_xe_loai_xe (
  id SERIAL PRIMARY KEY,
  nha_xe_id INT NOT NULL REFERENCES public.nha_xe(id) ON DELETE CASCADE,
  ten_xe TEXT NOT NULL,
  so_cho INT DEFAULT NULL,
  gia NUMERIC DEFAULT NULL,
  don_vi TEXT DEFAULT 'chuyến',
  ghi_chu TEXT DEFAULT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.nha_xe_loai_xe ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read" ON public.nha_xe_loai_xe FOR SELECT USING (true);
CREATE POLICY "Allow public insert" ON public.nha_xe_loai_xe FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update" ON public.nha_xe_loai_xe FOR UPDATE USING (true);
CREATE POLICY "Allow public delete" ON public.nha_xe_loai_xe FOR DELETE USING (true);
