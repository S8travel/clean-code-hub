-- Danh mục chuyến bay — OP chọn khi tạo đoàn (snapshot text vào doan.chuyen_bay_don/tien).
CREATE TABLE public.chuyen_bay (
  id bigserial PRIMARY KEY,
  ma_bay text NOT NULL,
  hang_bay text,
  chang text,
  gio_di text,
  gio_den text,
  ghi_chu text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.chuyen_bay TO authenticated, service_role;
GRANT SELECT ON public.chuyen_bay TO anon;
GRANT USAGE, SELECT ON SEQUENCE public.chuyen_bay_id_seq TO authenticated, service_role;

ALTER TABLE public.chuyen_bay ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_all" ON public.chuyen_bay
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
