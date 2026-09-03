-- Cài đặt hệ thống dùng chung (key-value) — mục đầu tiên: tỷ giá mặc định cho
-- báo giá TẠO MỚI. Cố ý KHÔNG dùng để tính lại báo giá cũ: mỗi báo giá đã lưu
-- tỷ giá riêng ở bao_gia.exchange_rate, đổi mặc định không được đụng vào bản cũ.
CREATE TABLE IF NOT EXISTS public.cai_dat_he_thong (
  khoa text PRIMARY KEY,
  gia_tri text,
  mo_ta text,
  cap_nhat_luc timestamptz NOT NULL DEFAULT now(),
  cap_nhat_boi uuid
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.cai_dat_he_thong TO authenticated, service_role;
-- Dữ liệu nội bộ: KHÔNG mở cho anon (khoá publishable nằm sẵn trong bundle web).
REVOKE ALL ON public.cai_dat_he_thong FROM anon;

ALTER TABLE public.cai_dat_he_thong ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS auth_all ON public.cai_dat_he_thong;
CREATE POLICY auth_all ON public.cai_dat_he_thong
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Khoá ghi cho tài khoản chỉ xem (user_roles.chi_xem).
DROP POLICY IF EXISTS chi_xem_block_insert ON public.cai_dat_he_thong;
CREATE POLICY chi_xem_block_insert ON public.cai_dat_he_thong AS RESTRICTIVE
  FOR INSERT TO public WITH CHECK (NOT (SELECT public.is_tk_chi_xem()));
DROP POLICY IF EXISTS chi_xem_block_update ON public.cai_dat_he_thong;
CREATE POLICY chi_xem_block_update ON public.cai_dat_he_thong AS RESTRICTIVE
  FOR UPDATE TO public USING (NOT (SELECT public.is_tk_chi_xem()));
DROP POLICY IF EXISTS chi_xem_block_delete ON public.cai_dat_he_thong;
CREATE POLICY chi_xem_block_delete ON public.cai_dat_he_thong AS RESTRICTIVE
  FOR DELETE TO public USING (NOT (SELECT public.is_tk_chi_xem()));

INSERT INTO public.cai_dat_he_thong (khoa, gia_tri, mo_ta)
VALUES ('ty_gia_bao_gia_mac_dinh', '25500',
        'Tỷ giá VND/USD điền sẵn khi tạo báo giá mới (sửa được ở màn Báo giá)')
ON CONFLICT (khoa) DO NOTHING;
