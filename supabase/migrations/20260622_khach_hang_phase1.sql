-- Phase 1 — Khách hàng master (CRM contact) + liên kết lead/đoàn + dedup + backfill
-- Project lflsbwoqzmbknzdpaequ. Deploy migration thủ công.
--
-- Quyết định kiến trúc:
--  * khach_hang scope = auth_required (CHỈ cần đăng nhập) — GIỐNG bảng `lead`.
--    KHÔNG scope văn phòng: lead không scope VP, khách là master của lead nên cùng
--    model → tránh "lead hiện mà khách bị ẩn" + dedup chạy được xuyên VP.
--    `doan` (vận hành) vẫn scope VP qua doan.van_phong_id, không đổi.
--  * Dedup theo SĐT = GỢI Ý, KHÔNG ép UNIQUE (chốt với user). Chỉ index để tra nhanh;
--    gộp khách trùng làm ở Phase 2.
--  * van_phong_id trên khach_hang là metadata (nguồn gốc VP) — bigint thường, KHÔNG
--    dùng trong RLS, KHÔNG FK (tránh phụ thuộc tên bảng VP).

-- ───────────────────────────────────────────────────────────────────────────
-- 1) Bảng khach_hang
-- ───────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.khach_hang (
  id                    bigserial PRIMARY KEY,
  ho_ten                text NOT NULL,
  loai                  text NOT NULL DEFAULT 'ca_nhan',   -- 'ca_nhan' | 'to_chuc'
  so_dien_thoai         text,
  sdt_norm              text GENERATED ALWAYS AS (regexp_replace(coalesce(so_dien_thoai, ''), '[^0-9]', '', 'g')) STORED,
  email                 text,
  facebook_url          text,
  zalo                  text,
  -- Hồ sơ doanh nghiệp / xuất hóa đơn (Phase 2 surface UI chỉnh sửa)
  ten_to_chuc           text,
  ma_so_thue            text,
  dia_chi_xuat_hd       text,
  nguoi_dai_dien        text,
  chuc_vu               text,
  -- Cá nhân
  ngay_sinh             date,
  gioi_tinh             text,
  dia_chi               text,
  -- Sở thích / chăm sóc sau bán (Phase 2 surface UI)
  phong_cach            text,
  so_thich              text,
  mon_kieng_di_ung      text,
  tags                  text[] NOT NULL DEFAULT '{}',
  do_not_contact        boolean NOT NULL DEFAULT false,
  do_not_contact_reason text,
  -- Gốc / quản trị
  nguon_dau             text,
  van_phong_id          bigint,                            -- metadata, KHÔNG dùng RLS
  assigned_to           uuid,
  ghi_chu               text,
  created_by            uuid,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

-- Index dedup theo SĐT normalize (KHÔNG UNIQUE) + tra theo tên
CREATE INDEX IF NOT EXISTS idx_khach_hang_sdt_norm ON public.khach_hang (sdt_norm) WHERE sdt_norm <> '';
CREATE INDEX IF NOT EXISTS idx_khach_hang_ho_ten   ON public.khach_hang (ho_ten);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.khach_hang TO authenticated, service_role;
GRANT USAGE, SELECT ON SEQUENCE public.khach_hang_id_seq TO authenticated, service_role;

ALTER TABLE public.khach_hang ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS auth_required ON public.khach_hang;
CREATE POLICY auth_required ON public.khach_hang
  FOR ALL TO public
  USING      (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

-- updated_at tự cập nhật
CREATE OR REPLACE FUNCTION public.khach_hang_touch_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END;
$$;
DROP TRIGGER IF EXISTS trg_khach_hang_updated_at ON public.khach_hang;
CREATE TRIGGER trg_khach_hang_updated_at
  BEFORE UPDATE ON public.khach_hang
  FOR EACH ROW EXECUTE FUNCTION public.khach_hang_touch_updated_at();

-- ───────────────────────────────────────────────────────────────────────────
-- 2) Liên kết lead + đoàn → khach_hang (ON DELETE SET NULL: xóa khách không mất lead/đoàn)
-- ───────────────────────────────────────────────────────────────────────────
ALTER TABLE public.lead ADD COLUMN IF NOT EXISTS khach_hang_id bigint
  REFERENCES public.khach_hang(id) ON DELETE SET NULL;
ALTER TABLE public.doan ADD COLUMN IF NOT EXISTS khach_hang_id bigint
  REFERENCES public.khach_hang(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_lead_khach_hang_id ON public.lead (khach_hang_id);
CREATE INDEX IF NOT EXISTS idx_doan_khach_hang_id ON public.doan (khach_hang_id);

-- ───────────────────────────────────────────────────────────────────────────
-- 3) RPC find_or_create_khach_hang — dedup theo SĐT, tạo mới nếu chưa có.
--    Dùng bởi create_lead_from_form (form public) + client (luồng nội bộ).
-- ───────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.find_or_create_khach_hang(
  p_ho_ten        text,
  p_so_dien_thoai text DEFAULT NULL,
  p_email         text DEFAULT NULL,
  p_facebook_url  text DEFAULT NULL,
  p_ten_to_chuc   text DEFAULT NULL,
  p_chuc_vu       text DEFAULT NULL,
  p_nguon         text DEFAULT NULL,
  p_van_phong_id  bigint DEFAULT NULL
) RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_norm text;
  v_id   bigint;
BEGIN
  v_norm := regexp_replace(coalesce(p_so_dien_thoai, ''), '[^0-9]', '', 'g');
  IF v_norm <> '' THEN
    SELECT id INTO v_id FROM khach_hang WHERE sdt_norm = v_norm ORDER BY id LIMIT 1;
    IF v_id IS NOT NULL THEN RETURN v_id; END IF;
  END IF;

  INSERT INTO khach_hang (
    ho_ten, loai, so_dien_thoai, email, facebook_url, ten_to_chuc, chuc_vu,
    nguon_dau, van_phong_id, created_by
  ) VALUES (
    coalesce(NULLIF(trim(coalesce(p_ho_ten, '')), ''), 'Khách'),
    CASE WHEN coalesce(trim(p_ten_to_chuc), '') <> '' THEN 'to_chuc' ELSE 'ca_nhan' END,
    NULLIF(trim(coalesce(p_so_dien_thoai, '')), ''),
    NULLIF(trim(coalesce(p_email, '')), ''),
    NULLIF(trim(coalesce(p_facebook_url, '')), ''),
    NULLIF(trim(coalesce(p_ten_to_chuc, '')), ''),
    NULLIF(trim(coalesce(p_chuc_vu, '')), ''),
    p_nguon, p_van_phong_id, auth.uid()
  ) RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.find_or_create_khach_hang(text,text,text,text,text,text,text,bigint)
  TO authenticated, service_role;

-- ───────────────────────────────────────────────────────────────────────────
-- 4) Cập nhật create_lead_from_form: gắn khach_hang_id (dedup SĐT) — GIỮ NGUYÊN
--    signature để không vỡ form public/FB webhook đang chạy. Chỉ thêm phần khách.
-- ───────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.create_lead_from_form(
  p_ho_ten text,
  p_so_dien_thoai text DEFAULT NULL::text,
  p_email text DEFAULT NULL::text,
  p_loai_tour text DEFAULT 'outbound'::text,
  p_diem_den text DEFAULT NULL::text,
  p_so_nguoi_lon integer DEFAULT 1,
  p_so_nguoi_em integer DEFAULT 0,
  p_ngay_di_du_kien date DEFAULT NULL::date,
  p_ngay_ve_du_kien date DEFAULT NULL::date,
  p_ngan_sach_per_khach bigint DEFAULT NULL::bigint,
  p_yeu_cau_dac_biet text DEFAULT NULL::text,
  p_ghi_chu text DEFAULT NULL::text,
  p_nguon text DEFAULT 'web_form'::text
) RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_assigned_to uuid;
  v_lead_id     bigint;
  v_name        text;
  v_kh_id       bigint;
  v_nguon       text;
BEGIN
  v_name := trim(coalesce(p_ho_ten, ''));
  IF v_name = '' THEN
    RAISE EXCEPTION 'ho_ten là bắt buộc';
  END IF;
  IF coalesce(trim(p_so_dien_thoai), '') = '' AND coalesce(trim(p_email), '') = '' THEN
    RAISE EXCEPTION 'Cần ít nhất số điện thoại hoặc email';
  END IF;
  v_nguon := coalesce(NULLIF(trim(p_nguon), ''), 'web_form');

  -- Round-robin assign (giữ nguyên logic cũ)
  WITH base AS (
    SELECT u.user_id, u.phan_loai_tour
    FROM user_roles u
    WHERE u.bo_phan = 'sales' AND u.active = true AND u.user_id IS NOT NULL
  ),
  matched AS (
    SELECT user_id FROM base
    WHERE phan_loai_tour IS NOT NULL AND p_loai_tour = ANY(phan_loai_tour)
  ),
  pool AS (
    SELECT user_id FROM matched
    UNION ALL
    SELECT user_id FROM base WHERE NOT EXISTS (SELECT 1 FROM matched)
  ),
  ranked AS (
    SELECT p.user_id,
           (SELECT MAX(l.created_at) FROM lead l WHERE l.assigned_to = p.user_id) AS last_assigned
    FROM pool p
  )
  SELECT user_id INTO v_assigned_to
  FROM ranked
  ORDER BY last_assigned NULLS FIRST, user_id
  LIMIT 1;

  -- Tìm/ tạo khách hàng theo SĐT (dedup) — luôn gắn 1 khách cho mỗi lead
  v_kh_id := public.find_or_create_khach_hang(v_name, p_so_dien_thoai, p_email, NULL, NULL, NULL, v_nguon, NULL);

  INSERT INTO lead (
    ho_ten, so_dien_thoai, email, nguon, loai_tour,
    so_nguoi_lon, so_nguoi_em,
    ngay_di_du_kien, ngay_ve_du_kien, ngan_sach_per_khach,
    yeu_cau_dac_biet, ghi_chu,
    assigned_to, trang_thai, khach_hang_id
  ) VALUES (
    v_name,
    NULLIF(trim(coalesce(p_so_dien_thoai, '')), ''),
    NULLIF(trim(coalesce(p_email, '')), ''),
    v_nguon,
    p_loai_tour,
    GREATEST(coalesce(p_so_nguoi_lon, 1), 1),
    GREATEST(coalesce(p_so_nguoi_em, 0), 0),
    p_ngay_di_du_kien, p_ngay_ve_du_kien, p_ngan_sach_per_khach,
    NULLIF(trim(coalesce(p_yeu_cau_dac_biet, '')), ''),
    NULLIF(trim(coalesce(p_ghi_chu, '')), ''),
    v_assigned_to, 'moi', v_kh_id
  )
  RETURNING id INTO v_lead_id;

  IF coalesce(trim(p_diem_den), '') <> '' THEN
    INSERT INTO lead_diem_den (lead_id, diem_den) VALUES (v_lead_id, trim(p_diem_den));
  END IF;

  INSERT INTO lead_activity (lead_id, loai, noi_dung)
  VALUES (
    v_lead_id,
    'tao_lead',
    'Tự tạo từ form web public' ||
      CASE WHEN v_assigned_to IS NOT NULL
           THEN ' — auto-assign cho sales'
           ELSE ' — chưa assign (không có sales active)'
      END
  );

  RETURN v_lead_id;
END;
$function$;

-- ───────────────────────────────────────────────────────────────────────────
-- 5) Backfill: lead hiện có → sinh/gắn khach_hang (dedup SĐT), rồi đoàn → khách.
--    Chỉ xử lý rows chưa gắn (idempotent). Dữ liệu nhỏ → dùng vòng lặp cho rõ ràng.
-- ───────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  r      record;
  v_id   bigint;
  v_norm text;
BEGIN
  FOR r IN SELECT * FROM public.lead WHERE khach_hang_id IS NULL ORDER BY created_at, id LOOP
    v_norm := regexp_replace(coalesce(r.so_dien_thoai, ''), '[^0-9]', '', 'g');
    v_id := NULL;
    IF v_norm <> '' THEN
      SELECT id INTO v_id FROM public.khach_hang WHERE sdt_norm = v_norm ORDER BY id LIMIT 1;
    END IF;
    IF v_id IS NULL THEN
      INSERT INTO public.khach_hang (
        ho_ten, loai, so_dien_thoai, email, facebook_url, ten_to_chuc, chuc_vu,
        nguon_dau, van_phong_id, assigned_to, created_by, created_at
      )
      SELECT r.ho_ten,
             CASE WHEN coalesce(trim(r.ten_to_chuc), '') <> '' THEN 'to_chuc' ELSE 'ca_nhan' END,
             r.so_dien_thoai, r.email, r.facebook_url, r.ten_to_chuc, r.chuc_vu, r.nguon,
             (SELECT van_phong_id FROM public.doan WHERE id = r.doan_id),
             r.assigned_to, r.created_by, r.created_at
      RETURNING id INTO v_id;
    END IF;
    UPDATE public.lead SET khach_hang_id = v_id WHERE id = r.id;
  END LOOP;
END $$;

-- Đoàn (qua lead) → khách: lấy khách của lead cũ nhất gắn với đoàn
UPDATE public.doan d
SET khach_hang_id = (
  SELECT l.khach_hang_id FROM public.lead l
  WHERE l.doan_id = d.id AND l.khach_hang_id IS NOT NULL
  ORDER BY l.created_at, l.id LIMIT 1
)
WHERE d.khach_hang_id IS NULL
  AND EXISTS (SELECT 1 FROM public.lead l WHERE l.doan_id = d.id AND l.khach_hang_id IS NOT NULL);

-- ───────────────────────────────────────────────────────────────────────────
-- 6) View thống kê (lịch sử derived). security_invoker → tôn trọng RLS người gọi
--    (so_doan chỉ đếm đoàn user thấy theo scope VP).
-- ───────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW public.khach_hang_with_stats
WITH (security_invoker = true) AS
SELECT k.*,
  (SELECT count(*) FROM public.lead l WHERE l.khach_hang_id = k.id) AS so_lead,
  (SELECT count(*) FROM public.doan d WHERE d.khach_hang_id = k.id) AS so_doan,
  (SELECT max(coalesce(l.last_touched_at, l.ngay_lien_he_cuoi))
     FROM public.lead l WHERE l.khach_hang_id = k.id) AS lan_lien_he_gan_nhat
FROM public.khach_hang k;
GRANT SELECT ON public.khach_hang_with_stats TO authenticated, service_role;

-- ───────────────────────────────────────────────────────────────────────────
-- 7) Verify backfill
-- ───────────────────────────────────────────────────────────────────────────
DO $$
DECLARE n_null int; n_kh int; n_lead int;
BEGIN
  SELECT count(*) INTO n_null FROM public.lead WHERE khach_hang_id IS NULL;
  IF n_null > 0 THEN
    RAISE EXCEPTION 'Backfill chưa xong: % lead chưa có khach_hang_id', n_null;
  END IF;
  SELECT count(*) INTO n_kh   FROM public.khach_hang;
  SELECT count(*) INTO n_lead FROM public.lead;
  RAISE NOTICE 'Phase 1 OK — khach_hang=%, lead=% (tất cả lead đã gắn khách)', n_kh, n_lead;
END $$;
