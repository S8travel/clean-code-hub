-- Sửa lỗi đường đẩy sang cổng đối tác (外網) sau đợt soát 17/08/2026.
-- Project lflsbwoqzmbknzdpaequ. Deploy migration thủ công.

-- ───────────────────────────────────────────────────────────────────────────
-- 1) portal_lam_sach_ten: chỉ cắt SỐ TIỀN, không cắt cả cụm ngoặc
-- ───────────────────────────────────────────────────────────────────────────
-- Bản đầu cắt trọn cụm ngoặc nào có số + đơn vị tiền, nên
-- "Bà Nà (gồm 2 chiều cáp treo 700k)" ra "Bà Nà" — mất luôn phần quyền lợi mà
-- đối tác cần biết. Giờ chỉ bỏ đúng con số, phần chữ giữ nguyên:
--   "Bà Nà (gồm 2 chiều cáp treo 700k)" → "Bà Nà (gồm 2 chiều cáp treo)"
--   "Vé thuyền (150.000đ/khách)"        → "Vé thuyền"
--   "Xe điện phố cổ ( 10k)"             → "Xe điện phố cổ"
--   "Đi thúng ( ko ăn)"                 → giữ nguyên
CREATE OR REPLACE FUNCTION public.portal_lam_sach_ten(p_ten text)
RETURNS text
LANGUAGE sql IMMUTABLE
SET search_path TO 'public'
AS $$
  -- Xếp tầng từng bước cho dễ đọc, mỗi bước chỉ làm một việc.
  SELECT NULLIF(trim(b6), '') FROM
    (SELECT regexp_replace(b5, '\s+\)', ')', 'g') AS b6 FROM
      (SELECT regexp_replace(b4, '\(\s+', '(', 'g') AS b5 FROM
        (SELECT regexp_replace(b3, '\s{2,}', ' ', 'g') AS b4 FROM
          -- d) dọn ngoặc rỗng / chỉ còn dấu câu
          (SELECT regexp_replace(b2, '\(\s*[-–/,.:;]*\s*\)', '', 'g') AS b3 FROM
            -- c) số trần từ 5 chữ số trở lên: 150000
            (SELECT regexp_replace(b1, '\m[0-9]{5,}\M', '', 'g') AS b2 FROM
              -- b) số có dấu phân cách nghìn, không kèm đơn vị: 150.000
              (SELECT regexp_replace(b0, '\m[0-9]{1,3}([.,][0-9]{3})+\M', '', 'g') AS b1 FROM
                -- a) số kèm đơn vị tiền, nuốt luôn phần "/khách", "/pax" phía sau
                (SELECT regexp_replace(coalesce(p_ten, ''),
                        '[0-9][0-9.,]*\s*(k|K|đ|Đ|vnd|VND|VNĐ)\M(\s*/\s*[^)\s]+)?', '', 'g') AS b0
                ) t0
              ) t1
            ) t2
          ) t3
        ) t4
      ) t5
    ) t6;
$$;

-- ───────────────────────────────────────────────────────────────────────────
-- 2) portal_push_log — biết được luồng đẩy có còn sống không
-- ───────────────────────────────────────────────────────────────────────────
-- cron.job_run_details báo 'succeeded' kể cả khi edge function trả 500, vì nó
-- chỉ đo việc XẾP HÀNG request chứ không đo kết quả. Không có bảng này thì luồng
-- đẩy chết cả tuần cũng không ai hay.
CREATE TABLE IF NOT EXISTS public.portal_push_log (
  id          bigserial PRIMARY KEY,
  luc         timestamptz NOT NULL DEFAULT now(),
  nguon       text NOT NULL DEFAULT 'cron',   -- 'cron' | 'tay'
  so_bao_gia  integer NOT NULL DEFAULT 0,
  so_doan     integer NOT NULL DEFAULT 0,
  so_xoa      integer NOT NULL DEFAULT 0,
  loi         text,                            -- NULL = chạy trót lọt
  chi_tiet    jsonb                            -- dòng bị bỏ qua + lý do
);

CREATE INDEX IF NOT EXISTS idx_portal_push_log_luc ON public.portal_push_log (luc DESC);

GRANT SELECT ON public.portal_push_log TO authenticated;
GRANT SELECT, INSERT ON public.portal_push_log TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.portal_push_log_id_seq TO service_role;

ALTER TABLE public.portal_push_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS portal_push_log_doc ON public.portal_push_log;
CREATE POLICY portal_push_log_doc ON public.portal_push_log
  FOR SELECT TO authenticated USING (true);

-- Khoá ghi cho tài khoản chỉ xem (bảng tạo sau đợt quét 20260728 nên phải tự thêm).
DROP POLICY IF EXISTS chi_xem_block_insert ON public.portal_push_log;
CREATE POLICY chi_xem_block_insert ON public.portal_push_log AS RESTRICTIVE
  FOR INSERT TO public WITH CHECK (NOT (SELECT public.is_tk_chi_xem()));
DROP POLICY IF EXISTS chi_xem_block_update ON public.portal_push_log;
CREATE POLICY chi_xem_block_update ON public.portal_push_log AS RESTRICTIVE
  FOR UPDATE TO public USING (NOT (SELECT public.is_tk_chi_xem()));
DROP POLICY IF EXISTS chi_xem_block_delete ON public.portal_push_log;
CREATE POLICY chi_xem_block_delete ON public.portal_push_log AS RESTRICTIVE
  FOR DELETE TO public USING (NOT (SELECT public.is_tk_chi_xem()));
