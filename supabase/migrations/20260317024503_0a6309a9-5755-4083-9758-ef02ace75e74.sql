
CREATE TABLE public.travel_groups (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  ten_doan TEXT NOT NULL,
  hdv TEXT,
  so_khach INTEGER DEFAULT 0,
  ngay_di DATE,
  ngay_ve DATE,
  ghi_chu TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.travel_groups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read" ON public.travel_groups FOR SELECT USING (true);
CREATE POLICY "Allow public insert" ON public.travel_groups FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update" ON public.travel_groups FOR UPDATE USING (true);
CREATE POLICY "Allow public delete" ON public.travel_groups FOR DELETE USING (true);
