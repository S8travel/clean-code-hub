-- ⚠️ FILE BÙ SỔ — chép NGUYÊN VĂN từ bản đã chạy trên prod, không phải viết mới.
--    Phiên bản trên prod: 20260817020042   (3/9 trong chuỗi migration cổng đối tác)
--    Bù vào repo 31/08/2026: thư mục migrations thiếu file này, nên người sau
--    lấy nhầm bản cũ trong repo làm nền cho CREATE OR REPLACE và xoá mất việc
--    của người trước. Xem PR mô tả sự cố.
-- ─── nguyên văn ───
CREATE OR REPLACE FUNCTION public.portal_lam_sach_ten(p_ten text)
RETURNS text
LANGUAGE sql IMMUTABLE
SET search_path TO 'public'
AS $$
  SELECT NULLIF(trim(
    regexp_replace(
      regexp_replace(
        regexp_replace(
          regexp_replace(
            regexp_replace(
              coalesce(p_ten, ''),
              '[0-9][0-9.,]*\s*(k|K|đ|Đ|vnd|VND|VNĐ)\M(\s*/\s*[^)\s]+)?', '', 'g'),
            '\m[0-9]{1,3}([.,][0-9]{3})+\M', '', 'g'),
          '\m[0-9]{5,}\M', '', 'g'),
        '\(\s*[-–/,.:;]*\s*\)', '', 'g'),
      '\s{2,}', ' ', 'g')
  ), '');
$$;

CREATE TABLE IF NOT EXISTS public.portal_push_log (
  id          bigserial PRIMARY KEY,
  luc         timestamptz NOT NULL DEFAULT now(),
  nguon       text NOT NULL DEFAULT 'cron',
  so_bao_gia  integer NOT NULL DEFAULT 0,
  so_doan     integer NOT NULL DEFAULT 0,
  so_xoa      integer NOT NULL DEFAULT 0,
  loi         text,
  chi_tiet    jsonb
);

CREATE INDEX IF NOT EXISTS idx_portal_push_log_luc ON public.portal_push_log (luc DESC);

GRANT SELECT ON public.portal_push_log TO authenticated;
GRANT SELECT, INSERT ON public.portal_push_log TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.portal_push_log_id_seq TO service_role;

ALTER TABLE public.portal_push_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS portal_push_log_doc ON public.portal_push_log;
CREATE POLICY portal_push_log_doc ON public.portal_push_log
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS chi_xem_block_insert ON public.portal_push_log;
CREATE POLICY chi_xem_block_insert ON public.portal_push_log AS RESTRICTIVE
  FOR INSERT TO public WITH CHECK (NOT (SELECT public.is_tk_chi_xem()));
DROP POLICY IF EXISTS chi_xem_block_update ON public.portal_push_log;
CREATE POLICY chi_xem_block_update ON public.portal_push_log AS RESTRICTIVE
  FOR UPDATE TO public USING (NOT (SELECT public.is_tk_chi_xem()));
DROP POLICY IF EXISTS chi_xem_block_delete ON public.portal_push_log;
CREATE POLICY chi_xem_block_delete ON public.portal_push_log AS RESTRICTIVE
  FOR DELETE TO public USING (NOT (SELECT public.is_tk_chi_xem()));
