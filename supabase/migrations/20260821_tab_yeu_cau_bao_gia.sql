-- Tab "Yêu cầu báo giá" trong trang Báo giá — bản gốc của yêu cầu đối tác gửi.
-- Project lflsbwoqzmbknzdpaequ. Deploy migration thủ công.
--
-- VÌ SAO CÓ BẢNG RIÊNG THAY VÌ DÙNG LẠI `lead`:
--   1) Phải trả lời được "TÀI KHOẢN NÀO gửi" — email tài khoản cổng của đối tác.
--      Đó không phải thuộc tính của một lead (lead có người liên hệ, không có
--      tài khoản đăng nhập), nhét vào lead là bịa thêm nghĩa cho cột sẵn có.
--   2) Việc của sales trên lead (đang tư vấn / chờ chốt / mất khách) KHÁC việc
--      "yêu cầu này đã được báo giá chưa". Trộn hai vòng đời vào một cột trạng
--      thái thì đổi bên này hỏng bên kia.
--   3) Tab Báo giá cần một danh sách gọn, không kéo theo bộ lọc/quyền của Leads.
-- Lead vẫn được tạo như cũ (sales theo dõi phễu ở trang Leads); hai bên nối bằng
-- `yeu_cau_bao_gia.lead_id`.

-- ───────────────────────────────────────────────────────────────────────────
-- 1) Bảng yêu cầu
-- ───────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.yeu_cau_bao_gia (
  id              bigserial PRIMARY KEY,
  agent_id        bigint REFERENCES public.agents(id),
  -- Snapshot tên đối tác lúc gửi: đổi tên trong danh mục sau này không làm sai
  -- lịch sử "ai đã gửi cái gì".
  ten_agent       text,

  -- Tài khoản cổng đã đăng nhập để gửi (KHÁC người liên hệ họ gõ trong form).
  tai_khoan_email text,
  tai_khoan_ten   text,

  -- Người liên hệ + cách liên lạc lại, do đối tác tự điền.
  nguoi_lien_he   text,
  email           text,
  so_dien_thoai   text,

  tieu_de         text,
  noi_dung        text,
  so_khach        integer,
  ngay_di_du_kien date,
  ngay_ve_du_kien date,

  -- 'moi' = chưa ai đụng tới. 'da_bao_gia' = đã tạo báo giá từ yêu cầu này.
  -- 'bo_qua' = xem rồi và quyết định không báo giá (bắt buộc có lý do).
  -- Trạng thái hiển thị vẫn ĐỐI CHIẾU với báo giá thật (xem view bên dưới):
  -- báo giá bị xoá thì yêu cầu phải quay về "chưa xử lý", không treo lơ lửng.
  trang_thai      text NOT NULL DEFAULT 'moi'
                    CHECK (trang_thai IN ('moi', 'da_bao_gia', 'bo_qua')),
  ly_do_bo_qua    text,

  lead_id         bigint REFERENCES public.lead(id) ON DELETE SET NULL,
  xu_ly_boi       uuid,
  xu_ly_luc       timestamptz,
  tao_luc         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ycbg_trang_thai ON public.yeu_cau_bao_gia (trang_thai, tao_luc DESC);
CREATE INDEX IF NOT EXISTS idx_ycbg_agent      ON public.yeu_cau_bao_gia (agent_id);
CREATE INDEX IF NOT EXISTS idx_ycbg_lead       ON public.yeu_cau_bao_gia (lead_id);

COMMENT ON TABLE public.yeu_cau_bao_gia IS
  'Yêu cầu báo giá đối tác gửi từ cổng 外網. Hiện ở tab "Yêu cầu báo giá" trang Báo giá.';
COMMENT ON COLUMN public.yeu_cau_bao_gia.tai_khoan_email IS
  'Email tài khoản cổng đã đăng nhập để gửi — khác email người liên hệ trong form.';

GRANT SELECT, INSERT, UPDATE, DELETE ON public.yeu_cau_bao_gia TO authenticated, service_role;
GRANT USAGE, SELECT ON SEQUENCE public.yeu_cau_bao_gia_id_seq TO authenticated, service_role;

ALTER TABLE public.yeu_cau_bao_gia ENABLE ROW LEVEL SECURITY;

DO $pol$
BEGIN
  CREATE POLICY auth_all ON public.yeu_cau_bao_gia
    FOR ALL TO authenticated USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $pol$;

-- Tài khoản chỉ xem: bảng tạo sau migration 20260728 nên phải tự khoá ghi.
DO $pol$
BEGIN
  CREATE POLICY chi_xem_block_insert ON public.yeu_cau_bao_gia AS RESTRICTIVE
    FOR INSERT TO public WITH CHECK (NOT (SELECT public.is_tk_chi_xem()));
EXCEPTION WHEN duplicate_object THEN NULL;
END $pol$;
DO $pol$
BEGIN
  CREATE POLICY chi_xem_block_update ON public.yeu_cau_bao_gia AS RESTRICTIVE
    FOR UPDATE TO public USING (NOT (SELECT public.is_tk_chi_xem()));
EXCEPTION WHEN duplicate_object THEN NULL;
END $pol$;
DO $pol$
BEGIN
  CREATE POLICY chi_xem_block_delete ON public.yeu_cau_bao_gia AS RESTRICTIVE
    FOR DELETE TO public USING (NOT (SELECT public.is_tk_chi_xem()));
EXCEPTION WHEN duplicate_object THEN NULL;
END $pol$;

-- ───────────────────────────────────────────────────────────────────────────
-- 2) Nối báo giá ↔ yêu cầu
-- ───────────────────────────────────────────────────────────────────────────
-- Một yêu cầu có thể sinh nhiều báo giá (báo lại lần 2, đổi phương án), nên
-- khoá nằm ở phía bao_gia. ON DELETE SET NULL: xoá yêu cầu KHÔNG kéo theo báo
-- giá đã chào — bản đã gửi đối tác phải sống độc lập.
ALTER TABLE public.bao_gia
  ADD COLUMN IF NOT EXISTS yeu_cau_id bigint REFERENCES public.yeu_cau_bao_gia(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_bao_gia_yeu_cau ON public.bao_gia (yeu_cau_id)
  WHERE yeu_cau_id IS NOT NULL;

COMMENT ON COLUMN public.bao_gia.yeu_cau_id IS
  'Báo giá này làm từ yêu cầu nào của đối tác (tab Yêu cầu báo giá).';

-- ───────────────────────────────────────────────────────────────────────────
-- 3) File đính kèm gắn vào yêu cầu, không chỉ vào lead
-- ───────────────────────────────────────────────────────────────────────────
-- Trước: file chỉ treo vào lead. Xoá lead là mất luôn file gốc của đối tác, mà
-- tab Yêu cầu vẫn phải mở được nó để làm báo giá.
ALTER TABLE public.lead_tai_lieu
  ADD COLUMN IF NOT EXISTS yeu_cau_id bigint REFERENCES public.yeu_cau_bao_gia(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_lead_tai_lieu_yeu_cau ON public.lead_tai_lieu (yeu_cau_id)
  WHERE yeu_cau_id IS NOT NULL;

-- lead_id thành tuỳ chọn + không kéo file đi theo khi lead bị xoá.
ALTER TABLE public.lead_tai_lieu ALTER COLUMN lead_id DROP NOT NULL;

DO $fk$
BEGIN
  ALTER TABLE public.lead_tai_lieu DROP CONSTRAINT IF EXISTS lead_tai_lieu_lead_id_fkey;
  ALTER TABLE public.lead_tai_lieu
    ADD CONSTRAINT lead_tai_lieu_lead_id_fkey
    FOREIGN KEY (lead_id) REFERENCES public.lead(id) ON DELETE SET NULL;
END $fk$;

-- File phải thuộc về ÍT NHẤT một thứ, không thì nó là rác không ai tìm ra.
DO $ck$
BEGIN
  ALTER TABLE public.lead_tai_lieu
    ADD CONSTRAINT lead_tai_lieu_co_chu_so_huu
    CHECK (lead_id IS NOT NULL OR yeu_cau_id IS NOT NULL);
EXCEPTION WHEN duplicate_object THEN NULL;
END $ck$;

-- ───────────────────────────────────────────────────────────────────────────
-- 4) View cho tab — trạng thái ĐỐI CHIẾU với báo giá thật
-- ───────────────────────────────────────────────────────────────────────────
-- Cột `trang_thai` là thứ người dùng bấm; `trang_thai_hien_thi` là thứ màn hình
-- hiện. Hai cái lệch nhau khi báo giá bị xoá sau đó — lúc ấy yêu cầu phải quay
-- về "chưa xử lý" chứ không nằm im ở "đã báo giá" (không ai biết mà làm lại).
CREATE OR REPLACE VIEW public.yeu_cau_bao_gia_view AS
SELECT
  y.*,
  (SELECT count(*) FROM public.bao_gia b WHERE b.yeu_cau_id = y.id)          AS so_bao_gia,
  (SELECT count(*) FROM public.lead_tai_lieu t WHERE t.yeu_cau_id = y.id)    AS so_tep,
  (SELECT b.id FROM public.bao_gia b WHERE b.yeu_cau_id = y.id
    ORDER BY b.created_at DESC, b.id DESC LIMIT 1)                           AS bao_gia_moi_nhat_id,
  (SELECT b.tieu_de FROM public.bao_gia b WHERE b.yeu_cau_id = y.id
    ORDER BY b.created_at DESC, b.id DESC LIMIT 1)                           AS bao_gia_moi_nhat_ten,
  (SELECT b.portal_enabled FROM public.bao_gia b WHERE b.yeu_cau_id = y.id
    ORDER BY b.created_at DESC, b.id DESC LIMIT 1)                           AS bao_gia_da_gui_cong,
  CASE
    WHEN y.trang_thai = 'bo_qua' THEN 'bo_qua'
    WHEN EXISTS (SELECT 1 FROM public.bao_gia b WHERE b.yeu_cau_id = y.id) THEN 'da_bao_gia'
    ELSE 'moi'
  END                                                                        AS trang_thai_hien_thi,
  u.ho_ten                                                                   AS xu_ly_ten
FROM public.yeu_cau_bao_gia y
LEFT JOIN public.user_roles u ON u.user_id = y.xu_ly_boi;

GRANT SELECT ON public.yeu_cau_bao_gia_view TO authenticated, service_role;

COMMENT ON VIEW public.yeu_cau_bao_gia_view IS
  'Yêu cầu + số báo giá đã làm + trạng thái hiển thị (đối chiếu báo giá thật, không tin mỗi cột trang_thai).';

-- ───────────────────────────────────────────────────────────────────────────
-- 5) RPC nhận yêu cầu — nay ghi cả bảng yêu cầu, không chỉ lead
-- ───────────────────────────────────────────────────────────────────────────
-- Đổi kiểu trả về (bigint → jsonb) nên phải DROP trước.
DROP FUNCTION IF EXISTS public.create_lead_from_agent_portal(jsonb);

CREATE OR REPLACE FUNCTION public.create_lead_from_agent_portal(payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_agent_id    bigint;
  v_agent_ten   text;
  v_nguoi       text;
  v_noi_dung    text;
  v_tieu_de     text;
  v_email       text;
  v_sdt         text;
  v_so_khach    int;
  v_ngay_di     date;
  v_ngay_ve     date;
  v_assigned_to uuid;
  v_lead_id     bigint;
  v_yeu_cau_id  bigint;
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
  v_email    := NULLIF(left(trim(coalesce(payload->>'email', '')), 200), '');
  v_sdt      := NULLIF(left(trim(coalesce(payload->>'so_dien_thoai', '')), 50), '');
  v_so_khach := LEAST(GREATEST(coalesce(NULLIF(payload->>'so_khach', '')::int, 1), 1), 1000);
  v_ngay_di  := NULLIF(payload->>'ngay_di_du_kien', '')::date;
  v_ngay_ve  := NULLIF(payload->>'ngay_ve_du_kien', '')::date;

  IF v_tieu_de IS NULL AND v_noi_dung IS NULL THEN
    RAISE EXCEPTION 'Cần nhập nội dung yêu cầu';
  END IF;

  -- Rate-limit: 10 yêu cầu / đối tác / giờ. Đếm trên bảng yêu cầu (bản gốc) —
  -- lead có thể bị sales xoá, đếm ở đó thì hạn mức tự nới ra.
  IF (
    SELECT count(*) FROM yeu_cau_bao_gia
    WHERE agent_id = v_agent_id
      AND tao_luc > now() - interval '1 hour'
  ) >= 10 THEN
    RAISE EXCEPTION 'Đã gửi quá nhiều yêu cầu trong 1 giờ, vui lòng liên hệ trực tiếp phụ trách';
  END IF;

  -- Người nhận: những ai được bật cờ nhan_yeu_cau_doi_tac, chia lượt theo người
  -- lâu nhất chưa nhận lead. Không ai bật cờ → rơi về sales, để yêu cầu không vô chủ.
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

  -- 1) Bản gốc của yêu cầu (tab Yêu cầu báo giá đọc bảng này).
  INSERT INTO yeu_cau_bao_gia (
    agent_id, ten_agent, tai_khoan_email, tai_khoan_ten,
    nguoi_lien_he, email, so_dien_thoai,
    tieu_de, noi_dung, so_khach, ngay_di_du_kien, ngay_ve_du_kien
  ) VALUES (
    v_agent_id, v_agent_ten,
    NULLIF(left(trim(coalesce(payload->>'tai_khoan_email', '')), 200), ''),
    NULLIF(left(trim(coalesce(payload->>'tai_khoan_ten', '')), 200), ''),
    v_nguoi, v_email, v_sdt,
    v_tieu_de, v_noi_dung, v_so_khach, v_ngay_di, v_ngay_ve
  )
  RETURNING id INTO v_yeu_cau_id;

  -- 2) Lead cho phễu sales.
  INSERT INTO lead (
    ho_ten, email, so_dien_thoai, nguon, loai_tour, loai_khach,
    agent_id, ten_to_chuc,
    so_nguoi_lon, ngay_di_du_kien, ngay_ve_du_kien,
    yeu_cau_dac_biet, ghi_chu, assigned_to, trang_thai
  ) VALUES (
    v_nguoi, v_email, v_sdt,
    'agent_portal', 'inbound', 'agent_doi_tac',
    v_agent_id, v_agent_ten,
    v_so_khach, v_ngay_di, v_ngay_ve,
    v_noi_dung,
    '[' || v_agent_ten || '] ' || coalesce(v_tieu_de, 'Yêu cầu từ cổng đối tác'),
    v_assigned_to, 'moi'
  )
  RETURNING id INTO v_lead_id;

  UPDATE yeu_cau_bao_gia SET lead_id = v_lead_id WHERE id = v_yeu_cau_id;

  -- 3) File đính kèm: edge fn đã chép sang bucket 'lead-files' rồi mới gọi hàm
  -- này. Gắn vào CẢ yêu cầu lẫn lead — hai màn hình khác nhau cùng cần mở.
  INSERT INTO lead_tai_lieu (lead_id, yeu_cau_id, ten, file_name, duong_dan, co_chu, mime)
  SELECT v_lead_id, v_yeu_cau_id,
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

  -- 4) Chuông cho TẤT CẢ người được bật cờ, không chỉ người được chia lượt.
  -- loai bắt đầu bằng 'lead_' để bấm vào là mở đúng lead (xem targetUrl).
  INSERT INTO thong_bao (user_id, loai, tieu_de, noi_dung, lead_id)
  SELECT u.user_id, 'lead_yeu_cau_doi_tac',
         'Đối tác ' || v_agent_ten || ' gửi yêu cầu báo giá',
         left(coalesce(v_tieu_de || ' — ', '') || coalesce(v_noi_dung, ''), 300),
         v_lead_id
  FROM user_roles u
  WHERE u.nhan_yeu_cau_doi_tac AND u.active AND u.user_id IS NOT NULL;
  GET DIAGNOSTICS v_so_bao = ROW_COUNT;

  IF v_so_bao = 0 AND v_assigned_to IS NOT NULL THEN
    INSERT INTO thong_bao (user_id, loai, tieu_de, noi_dung, lead_id)
    VALUES (v_assigned_to, 'lead_yeu_cau_doi_tac',
            'Đối tác ' || v_agent_ten || ' gửi yêu cầu báo giá',
            left(coalesce(v_tieu_de || ' — ', '') || coalesce(v_noi_dung, ''), 300),
            v_lead_id);
  END IF;

  RETURN jsonb_build_object(
    'lead_id', v_lead_id,
    'yeu_cau_id', v_yeu_cau_id,
    'so_tep', v_so_tep
  );
END;
$fn$;

REVOKE EXECUTE ON FUNCTION public.create_lead_from_agent_portal(jsonb) FROM anon, authenticated, public;
GRANT EXECUTE ON FUNCTION public.create_lead_from_agent_portal(jsonb) TO service_role;

COMMENT ON FUNCTION public.create_lead_from_agent_portal(jsonb) IS
  'Yêu cầu báo giá từ cổng 外網 → yeu_cau_bao_gia + lead + file + chuông. Gọi qua edge fn yeu-cau-doi-tac.';
