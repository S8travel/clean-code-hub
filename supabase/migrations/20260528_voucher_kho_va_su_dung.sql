-- Kho voucher cho loại voucher GIÁ-BIẾN-THIÊN (1 voucher đổi 1 bữa/DV, giá trị
-- = giá lúc dùng). Khác cong_no (tiền cố định): ở đây THEO DÕI SỐ LƯỢNG, không quy tiền.
CREATE TABLE public.voucher (
  id bigserial PRIMARY KEY,
  nha_cung_cap_id bigint REFERENCES public.nha_cung_cap(id) ON DELETE SET NULL,
  ten text NOT NULL,
  so_luong integer NOT NULL DEFAULT 0 CHECK (so_luong >= 0),
  ghi_chu text,
  active boolean NOT NULL DEFAULT true,
  ngay_tao timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

-- Log mỗi lần dùng voucher cho 1 dòng chi phí (bữa ăn / dịch vụ).
CREATE TABLE public.voucher_su_dung (
  id bigserial PRIMARY KEY,
  voucher_id bigint NOT NULL REFERENCES public.voucher(id) ON DELETE RESTRICT,
  doan_id bigint REFERENCES public.doan(id) ON DELETE SET NULL,
  chi_phi_id bigint REFERENCES public.doan_chi_phi(id) ON DELETE SET NULL,
  so_luong integer NOT NULL DEFAULT 1 CHECK (so_luong > 0),
  gia_tri numeric NOT NULL DEFAULT 0,
  ngay_dung timestamptz DEFAULT now(),
  ghi_chu text,
  tao_boi uuid,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX idx_voucher_su_dung_voucher ON public.voucher_su_dung(voucher_id);
CREATE INDEX idx_voucher_su_dung_chi_phi ON public.voucher_su_dung(chi_phi_id);
CREATE INDEX idx_voucher_su_dung_doan ON public.voucher_su_dung(doan_id);

-- View: tồn = so_luong - SUM(đã dùng); kèm tổng giá trị đã dùng (báo cáo).
CREATE VIEW public.voucher_with_status AS
SELECT v.*,
  COALESCE(u.so_luong_da_dung, 0) AS so_luong_da_dung,
  v.so_luong - COALESCE(u.so_luong_da_dung, 0) AS so_luong_con_lai,
  COALESCE(u.tong_gia_tri_da_dung, 0) AS tong_gia_tri_da_dung
FROM public.voucher v
LEFT JOIN (
  SELECT voucher_id,
         SUM(so_luong) AS so_luong_da_dung,
         SUM(gia_tri)  AS tong_gia_tri_da_dung
  FROM public.voucher_su_dung
  GROUP BY voucher_id
) u ON u.voucher_id = v.id;

-- GRANT (rule: bảng/view mới phải grant thủ công cho Data API)
GRANT SELECT, INSERT, UPDATE, DELETE ON public.voucher TO authenticated, service_role;
GRANT SELECT ON public.voucher TO anon;
GRANT USAGE, SELECT ON SEQUENCE public.voucher_id_seq TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.voucher_su_dung TO authenticated, service_role;
GRANT SELECT ON public.voucher_su_dung TO anon;
GRANT USAGE, SELECT ON SEQUENCE public.voucher_su_dung_id_seq TO authenticated, service_role;
GRANT SELECT ON public.voucher_with_status TO authenticated, anon, service_role;

-- RLS (UI gate admin-only; DB policy permissive như các bảng khác)
ALTER TABLE public.voucher ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.voucher_su_dung ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_all" ON public.voucher FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_all" ON public.voucher_su_dung FOR ALL TO authenticated USING (true) WITH CHECK (true);
