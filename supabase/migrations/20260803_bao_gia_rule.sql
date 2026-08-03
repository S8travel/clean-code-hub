-- Quy tắc tính giá báo giá do user DẠY qua chat (AI parse câu tiếng Việt → rule
-- có cấu trúc). AI không "nhớ trong đầu" — mọi thứ đã dạy lưu ở đây, code áp dụng
-- deterministic khi resolve báo giá (xem applyKsBuaRules trong bao-gia-ai-resolve).
--
-- P1 chỉ có 1 loai='ks_gia_kem_bua': "KS này khi đêm đó có bữa X trong lịch trình
-- → giá phòng = gia_phong VÀ không tính tiền bữa X riêng" (kiểu half-board).
-- Loại quy tắc mới sau này = thêm giá trị loai + cột/jsonb khi cần.
-- Sửa quy tắc = deactivate dòng cũ + insert dòng mới (giữ lịch sử ai dạy lúc nào).

CREATE TABLE public.bao_gia_rule (
  id            bigserial PRIMARY KEY,
  loai          text NOT NULL DEFAULT 'ks_gia_kem_bua',
  khach_san_id  bigint REFERENCES public.khach_san(id) ON DELETE CASCADE,
  bua           text CHECK (bua IN ('trua','toi','ca_hai')),
  gia_phong     numeric,
  -- Nguyên văn câu user dạy (audit) + diễn giải AI đã xác nhận (hiển thị).
  mo_ta_goc     text,
  dien_giai     text,
  active        boolean NOT NULL DEFAULT true,
  tao_boi       uuid,
  tao_luc       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_bao_gia_rule_ks ON public.bao_gia_rule(khach_san_id) WHERE active;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.bao_gia_rule TO authenticated, service_role;
GRANT SELECT ON public.bao_gia_rule TO anon;
GRANT USAGE, SELECT ON SEQUENCE public.bao_gia_rule_id_seq TO authenticated, service_role;

ALTER TABLE public.bao_gia_rule ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth_all" ON public.bao_gia_rule
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Khóa ghi cho tài khoản chỉ xem (bảng tạo sau migration quét 20260728).
CREATE POLICY chi_xem_block_insert ON public.bao_gia_rule AS RESTRICTIVE
  FOR INSERT TO public WITH CHECK (NOT (SELECT public.is_tk_chi_xem()));
CREATE POLICY chi_xem_block_update ON public.bao_gia_rule AS RESTRICTIVE
  FOR UPDATE TO public USING (NOT (SELECT public.is_tk_chi_xem()));
CREATE POLICY chi_xem_block_delete ON public.bao_gia_rule AS RESTRICTIVE
  FOR DELETE TO public USING (NOT (SELECT public.is_tk_chi_xem()));
