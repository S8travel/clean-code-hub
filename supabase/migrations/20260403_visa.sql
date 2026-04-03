-- Bảng đơn vị visa (công ty làm visa)
CREATE TABLE public.don_vi_visa (
  id SERIAL PRIMARY KEY,
  ten TEXT NOT NULL,
  email TEXT DEFAULT NULL,
  so_dien_thoai TEXT DEFAULT NULL,
  dia_chi TEXT DEFAULT NULL,
  tai_khoan_thanh_toan TEXT DEFAULT NULL,
  ghi_chu TEXT DEFAULT NULL,
  nha_cung_cap_id INT REFERENCES public.nha_cung_cap(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.don_vi_visa ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow public read" ON public.don_vi_visa FOR SELECT USING (true);
CREATE POLICY "Allow public insert" ON public.don_vi_visa FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update" ON public.don_vi_visa FOR UPDATE USING (true);
CREATE POLICY "Allow public delete" ON public.don_vi_visa FOR DELETE USING (true);

-- Bảng loại visa (sản phẩm của từng đơn vị visa)
CREATE TABLE public.loai_visa (
  id SERIAL PRIMARY KEY,
  don_vi_visa_id INT NOT NULL REFERENCES public.don_vi_visa(id) ON DELETE CASCADE,
  quoc_gia TEXT NOT NULL,
  loai TEXT DEFAULT NULL,
  thoi_han TEXT DEFAULT NULL,
  gia NUMERIC DEFAULT NULL,
  don_vi TEXT DEFAULT 'người',
  ghi_chu TEXT DEFAULT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.loai_visa ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow public read" ON public.loai_visa FOR SELECT USING (true);
CREATE POLICY "Allow public insert" ON public.loai_visa FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update" ON public.loai_visa FOR UPDATE USING (true);
CREATE POLICY "Allow public delete" ON public.loai_visa FOR DELETE USING (true);
