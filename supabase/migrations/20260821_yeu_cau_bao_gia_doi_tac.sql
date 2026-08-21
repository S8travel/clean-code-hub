-- 詢價 — đối tác gửi yêu cầu báo giá từ CỔNG (外網) về CRM thành một lead.
-- Project lflsbwoqzmbknzdpaequ. Deploy migration thủ công.
--
-- Đường đi: cổng (project khác) → edge fn 'gui-yeu-cau' bên cổng → edge fn
-- 'yeu-cau-doi-tac' bên CRM (xác thực bằng x-portal-secret) → RPC dưới đây.
-- Đối tác KHÔNG có tài khoản project này nên không có đường nào gọi thẳng.
--
-- File này làm 4 việc:
--   1) lead.agent_id — biết yêu cầu của đối tác nào (rate-limit + lọc + tra cứu).
--   2) user_roles.nhan_yeu_cau_doi_tac — ai nhận yêu cầu từ cổng.
--   3) lead_tai_lieu + bucket 'lead-files' — file lịch trình đối tác đính kèm.
--   4) create_lead_from_agent_portal viết lại: nhận file, chọn người nhận theo
--      cờ ở (2), bắn chuông cho họ.

-- ───────────────────────────────────────────────────────────────────────────
-- 1) Lead thuộc đối tác nào
-- ───────────────────────────────────────────────────────────────────────────
-- Trước đây chỉ biết qua chuỗi '[Tên đối tác]' đầu ghi_chu — đổi tên đối tác
-- trong danh mục là mất dấu, mà rate-limit lại đếm theo đúng chuỗi đó.
ALTER TABLE public.lead
  ADD COLUMN IF NOT EXISTS agent_id bigint REFERENCES public.agents(id);

CREATE INDEX IF NOT EXISTS idx_lead_agent ON public.lead (agent_id)
  WHERE agent_id IS NOT NULL;

COMMENT ON COLUMN public.lead.agent_id IS
  'Đối tác gửi yêu cầu (lead nguồn agent_portal). NULL với lead khách lẻ.';

-- ───────────────────────────────────────────────────────────────────────────
-- 2) Ai nhận yêu cầu từ cổng
-- ───────────────────────────────────────────────────────────────────────────
-- KHÔNG hardcode user_id trong hàm: người nghỉ việc / đổi vai trò thì yêu cầu
-- rơi vào khoảng không mà không ai biết. Cờ này sửa được ở trang Người dùng.
ALTER TABLE public.user_roles
  ADD COLUMN IF NOT EXISTS nhan_yeu_cau_doi_tac boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.user_roles.nhan_yeu_cau_doi_tac IS
  'Nhận yêu cầu báo giá đối tác gửi từ cổng 外網: được chia lượt + nhận chuông.';

-- Chốt 21/08/2026: Thanh Thảo (điều hành, tour Đài Loan) + Chín Hai (sales).
-- Tra theo email vì đó là thứ không đổi khi đổi tên hiển thị.
UPDATE public.user_roles
SET nhan_yeu_cau_doi_tac = true
WHERE email IN ('s8travel.dingbooking01@gmail.com', 'gino.s8travel@gmail.com');

-- ───────────────────────────────────────────────────────────────────────────
-- 3) File đối tác đính kèm
-- ───────────────────────────────────────────────────────────────────────────
-- Đối tác Đài Loan thường gửi sẵn file lịch trình; bắt họ gõ lại vào ô nội dung
-- là mất chính thứ sales cần đọc.
CREATE TABLE IF NOT EXISTS public.lead_tai_lieu (
  id         bigserial PRIMARY KEY,
  lead_id    bigint NOT NULL REFERENCES public.lead(id) ON DELETE CASCADE,
  ten        text,
  file_name  text,
  -- Đường dẫn trong bucket 'lead-files'. KHÔNG lưu URL: link ký là thứ hết hạn.
  duong_dan  text NOT NULL,
  co_chu     bigint,
  mime       text,
  nguon      text NOT NULL DEFAULT 'agent_portal',
  tao_luc    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_lead_tai_lieu_lead ON public.lead_tai_lieu (lead_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.lead_tai_lieu TO authenticated, service_role;
GRANT USAGE, SELECT ON SEQUENCE public.lead_tai_lieu_id_seq TO authenticated, service_role;

ALTER TABLE public.lead_tai_lieu ENABLE ROW LEVEL SECURITY;

DO $pol$
BEGIN
  CREATE POLICY auth_all ON public.lead_tai_lieu
    FOR ALL TO authenticated USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $pol$;

-- Tài khoản chỉ xem: migration 20260728 quét MỘT LẦN các bảng có lúc đó, bảng
-- tạo sau phải tự khoá ghi.
DO $pol$
BEGIN
  CREATE POLICY chi_xem_block_insert ON public.lead_tai_lieu AS RESTRICTIVE
    FOR INSERT TO public WITH CHECK (NOT (SELECT public.is_tk_chi_xem()));
EXCEPTION WHEN duplicate_object THEN NULL;
END $pol$;
DO $pol$
BEGIN
  CREATE POLICY chi_xem_block_update ON public.lead_tai_lieu AS RESTRICTIVE
    FOR UPDATE TO public USING (NOT (SELECT public.is_tk_chi_xem()));
EXCEPTION WHEN duplicate_object THEN NULL;
END $pol$;
DO $pol$
BEGIN
  CREATE POLICY chi_xem_block_delete ON public.lead_tai_lieu AS RESTRICTIVE
    FOR DELETE TO public USING (NOT (SELECT public.is_tk_chi_xem()));
EXCEPTION WHEN duplicate_object THEN NULL;
END $pol$;

-- Kho file riêng, PRIVATE. Không dùng chung 'dntt-documents' (chứng từ tiền):
-- file do người ngoài gửi vào thì để riêng một chỗ, dễ soát và dễ gỡ.
DO $buck$
BEGIN
  INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  VALUES ('lead-files', 'lead-files', false, 10485760, ARRAY[
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'image/jpeg', 'image/png', 'image/webp'
  ])
  ON CONFLICT (id) DO NOTHING;
EXCEPTION WHEN insufficient_privilege THEN
  RAISE WARNING 'Chua tao duoc bucket lead-files — tao tay o Dashboard > Storage (private, 10MB).';
END $buck$;

-- Bucket private mà thiếu policy SELECT thì chính createSignedUrl cũng fail —
-- đúng cái bẫy đã vấp hôm khoá bucket chứng từ (13/08).
-- Ghi vào bucket này CHỈ qua service_role trong edge function: file đến từ ngoài
-- CRM, không mở đường cho client đẩy thẳng.
DO $pol$
BEGIN
  CREATE POLICY lead_files_auth_select ON storage.objects
    FOR SELECT TO authenticated
    USING (bucket_id = 'lead-files');
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN insufficient_privilege THEN
    RAISE WARNING 'Chua tao duoc policy doc bucket lead-files — tao tay o Dashboard > Storage > Policies (SELECT, authenticated, bucket_id = lead-files).';
END $pol$;

-- ───────────────────────────────────────────────────────────────────────────
-- 4) create_lead_from_agent_portal — nhận yêu cầu, tạo lead, bắn chuông
-- ───────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.create_lead_from_agent_portal(payload jsonb)
RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_agent_id    bigint;
  v_agent_ten   text;
  v_nguoi       text;
  v_noi_dung    text;
  v_tieu_de     text;
  v_assigned_to uuid;
  v_lead_id     bigint;
  v_so_tep      int;
  v_so_bao      int;
BEGIN
  -- Tài khoản chỉ xem không được ghi, kể cả qua RPC SECURITY DEFINER (bypass RLS).
  IF public.is_tk_chi_xem() THEN
    RAISE EXCEPTION 'Tài khoản chỉ xem — không thực hiện được thao tác này'
      USING ERRCODE = '42501';
  END IF;

  v_agent_id := NULLIF(payload->>'agent_id', '')::bigint;
  SELECT a.ten INTO v_agent_ten FROM agents a WHERE a.id = v_agent_id;
  IF v_agent_ten IS NULL THEN
    RAISE EXCEPTION 'Đối tác không hợp lệ';
  END IF;

  -- left(): chặn bơm text nhiều MB qua endpoint không captcha.
  v_tieu_de  := NULLIF(left(trim(coalesce(payload->>'tieu_de', '')), 200), '');
  v_noi_dung := NULLIF(left(trim(coalesce(payload->>'noi_dung', '')), 2000), '');
  v_nguoi    := coalesce(NULLIF(left(trim(coalesce(payload->>'nguoi_lien_he', '')), 200), ''), v_agent_ten);

  IF v_tieu_de IS NULL AND v_noi_dung IS NULL THEN
    RAISE EXCEPTION 'Cần nhập nội dung yêu cầu';
  END IF;

  -- Rate-limit: 10 yêu cầu / đối tác / giờ. Cổng có đăng nhập nên không cần ngặt
  -- như form public, nhưng vẫn chặn được vòng lặp gửi hỏng từ phía cổng.
  IF (
    SELECT count(*) FROM lead
    WHERE nguon = 'agent_portal'
      AND agent_id = v_agent_id
      AND created_at > now() - interval '1 hour'
  ) >= 10 THEN
    RAISE EXCEPTION 'Đã gửi quá nhiều yêu cầu trong 1 giờ, vui lòng liên hệ trực tiếp phụ trách';
  END IF;

  -- Người nhận: những ai được bật cờ nhan_yeu_cau_doi_tac, chia lượt theo người
  -- lâu nhất chưa nhận lead. Không ai bật cờ → rơi về sales như trước, để yêu cầu
  -- không bao giờ vô chủ.
  WITH duoc_chon AS (
    SELECT u.user_id FROM user_roles u
    WHERE u.nhan_yeu_cau_doi_tac AND u.active AND u.user_id IS NOT NULL
  ),
  pool AS (
    SELECT user_id FROM duoc_chon
    UNION
    SELECT u.user_id FROM user_roles u
    WHERE u.bo_phan = 'sales' AND u.active AND u.user_id IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM duoc_chon)
  ),
  ranked AS (
    SELECT p.user_id,
           (SELECT MAX(l.created_at) FROM lead l WHERE l.assigned_to = p.user_id) AS last_assigned
    FROM pool p
  )
  SELECT user_id INTO v_assigned_to
  FROM ranked ORDER BY last_assigned NULLS FIRST, user_id LIMIT 1;

  INSERT INTO lead (
    ho_ten, email, so_dien_thoai, nguon, loai_tour, loai_khach,
    agent_id, ten_to_chuc,
    so_nguoi_lon, ngay_di_du_kien, ngay_ve_du_kien,
    yeu_cau_dac_biet, ghi_chu, assigned_to, trang_thai
  ) VALUES (
    v_nguoi,
    NULLIF(left(trim(coalesce(payload->>'email', '')), 200), ''),
    NULLIF(left(trim(coalesce(payload->>'so_dien_thoai', '')), 50), ''),
    'agent_portal',
    'inbound',
    'agent_doi_tac',
    v_agent_id,
    v_agent_ten,
    LEAST(GREATEST(coalesce(NULLIF(payload->>'so_khach', '')::int, 1), 1), 1000),
    NULLIF(payload->>'ngay_di_du_kien', '')::date,
    NULLIF(payload->>'ngay_ve_du_kien', '')::date,
    v_noi_dung,
    '[' || v_agent_ten || '] ' || coalesce(v_tieu_de, 'Yêu cầu từ cổng đối tác'),
    v_assigned_to, 'moi'
  )
  RETURNING id INTO v_lead_id;

  -- File đính kèm: edge fn đã chép sang bucket 'lead-files' rồi mới gọi hàm này,
  -- nên ở đây chỉ ghi lại đường dẫn. Tối đa 3 file — cắt ở đây phòng khi phía gọi
  -- gửi nhiều hơn.
  INSERT INTO lead_tai_lieu (lead_id, ten, file_name, duong_dan, co_chu, mime)
  SELECT v_lead_id,
         NULLIF(left(trim(coalesce(x.f->>'ten', '')), 200), ''),
         NULLIF(left(trim(coalesce(x.f->>'file_name', '')), 300), ''),
         x.f->>'duong_dan',
         NULLIF(x.f->>'co_chu', '')::bigint,
         NULLIF(left(trim(coalesce(x.f->>'mime', '')), 100), '')
  FROM (
    SELECT f FROM jsonb_array_elements(coalesce(payload->'tep', '[]'::jsonb)) f
    WHERE coalesce(f->>'duong_dan', '') <> ''
    LIMIT 3
  ) x;
  GET DIAGNOSTICS v_so_tep = ROW_COUNT;

  INSERT INTO lead_activity (lead_id, loai, noi_dung)
  VALUES (v_lead_id, 'tao_lead',
          'Đối tác ' || v_agent_ten || ' gửi yêu cầu báo giá từ cổng 外網' ||
          CASE WHEN v_so_tep > 0 THEN ' — kèm ' || v_so_tep || ' file' ELSE '' END ||
          CASE WHEN v_assigned_to IS NOT NULL THEN ', đã chia cho người phụ trách'
               ELSE ' — chưa chia (không có người nhận nào đang bật)' END);

  -- Chuông cho TẤT CẢ người được bật cờ, không chỉ người được chia lượt: hai
  -- người cùng phụ trách mảng đối tác thì người kia cũng cần biết đang có gì tới.
  -- loai bắt đầu bằng 'lead_' để bấm vào là mở đúng lead (xem targetUrl).
  INSERT INTO thong_bao (user_id, loai, tieu_de, noi_dung, lead_id)
  SELECT u.user_id, 'lead_yeu_cau_doi_tac',
         'Đối tác ' || v_agent_ten || ' gửi yêu cầu báo giá',
         left(coalesce(v_tieu_de || ' — ', '') || coalesce(v_noi_dung, ''), 300),
         v_lead_id
  FROM user_roles u
  WHERE u.nhan_yeu_cau_doi_tac AND u.active AND u.user_id IS NOT NULL;
  GET DIAGNOSTICS v_so_bao = ROW_COUNT;

  -- Không ai bật cờ: ít nhất báo cho người vừa được chia, đừng để yêu cầu nằm im.
  IF v_so_bao = 0 AND v_assigned_to IS NOT NULL THEN
    INSERT INTO thong_bao (user_id, loai, tieu_de, noi_dung, lead_id)
    VALUES (v_assigned_to, 'lead_yeu_cau_doi_tac',
            'Đối tác ' || v_agent_ten || ' gửi yêu cầu báo giá',
            left(coalesce(v_tieu_de || ' — ', '') || coalesce(v_noi_dung, ''), 300),
            v_lead_id);
  END IF;

  RETURN v_lead_id;
END;
$fn$;

-- Chỉ edge function (service_role) được gọi. Trước đây hàm mở cho anon — mà khoá
-- publishable của CRM nằm sẵn trong bundle web nên ai cũng gọi tạo lead được.
REVOKE EXECUTE ON FUNCTION public.create_lead_from_agent_portal(jsonb) FROM anon, authenticated, public;
GRANT EXECUTE ON FUNCTION public.create_lead_from_agent_portal(jsonb) TO service_role;

COMMENT ON FUNCTION public.create_lead_from_agent_portal(jsonb) IS
  'Yêu cầu báo giá từ cổng đối tác 外網 → lead nguồn agent_portal. Gọi qua edge fn yeu-cau-doi-tac.';
