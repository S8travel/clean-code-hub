-- Siết create_lead_from_form — endpoint GHI công khai (anon có GRANT EXECUTE).
--
-- Bối cảnh: hàm này là RPC duy nhất cho form lead public + FB webhook. Trước đợt
-- vá này nó nhận text từ client và INSERT thẳng vào 4 bảng (lead, khach_hang,
-- lead_diem_den, lead_activity) mà KHÔNG giới hạn độ dài và KHÔNG rate-limit:
--   - bot gửi p_ghi_chu vài MB trong vòng lặp → phình DB không giới hạn;
--   - flood lead rác → cướp sạch round-robin assign, chôn lead thật của sales.
--
-- Bản vá này copy nguyên pattern đã áp dụng đúng ở create_khao_sat_from_form
-- (20260706_khach_hang_khao_sat.sql): left() cap mọi trường text + rate-limit 2 tầng.
--
-- GIỮ NGUYÊN signature (tên + kiểu + default) — form public và FB webhook đang
-- gọi hàm này, đổi signature là gãy production.
--
-- Cắt ngắn im lặng (không RAISE) cho các trường text: người dùng thật không bao
-- giờ chạm ngưỡng, còn bot thì không cần được báo lỗi tử tế.

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
  v_sdt         text;
  v_email       text;
  v_sdt_norm    text;
BEGIN
  -- left(): chặn bơm text nhiều MB gây phình DB qua endpoint public không captcha.
  v_name := left(trim(coalesce(p_ho_ten, '')), 200);
  IF v_name = '' THEN
    RAISE EXCEPTION 'ho_ten là bắt buộc';
  END IF;

  v_sdt   := NULLIF(left(trim(coalesce(p_so_dien_thoai, '')), 50), '');
  v_email := NULLIF(left(trim(coalesce(p_email, '')), 200), '');

  IF v_sdt IS NULL AND v_email IS NULL THEN
    RAISE EXCEPTION 'Cần ít nhất số điện thoại hoặc email';
  END IF;

  v_nguon := coalesce(NULLIF(left(trim(coalesce(p_nguon, '')), 50), ''), 'web_form');

  -- ── Rate-limit 1: chống double-submit / spam theo danh tính ────────────────
  -- Khớp theo SĐT đã chuẩn hoá (chỉ giữ chữ số) để "0901 234 567" và
  -- "0901-234-567" không né được; không có SĐT thì khớp theo email.
  v_sdt_norm := NULLIF(regexp_replace(coalesce(v_sdt, ''), '[^0-9]', '', 'g'), '');

  IF v_sdt_norm IS NOT NULL AND EXISTS (
    SELECT 1 FROM lead
    WHERE created_at > now() - interval '1 minute'
      AND regexp_replace(coalesce(so_dien_thoai, ''), '[^0-9]', '', 'g') = v_sdt_norm
  ) THEN
    RAISE EXCEPTION 'Vui lòng đợi 1 phút trước khi gửi lại';
  END IF;

  IF v_sdt_norm IS NULL AND v_email IS NOT NULL AND EXISTS (
    SELECT 1 FROM lead
    WHERE created_at > now() - interval '1 minute'
      AND lower(coalesce(email, '')) = lower(v_email)
  ) THEN
    RAISE EXCEPTION 'Vui lòng đợi 1 phút trước khi gửi lại';
  END IF;

  -- ── Rate-limit 2: chống flood khi attacker đổi SĐT/email mỗi request ───────
  -- Rate-limit 1 khớp theo danh tính nên bot randomize SĐT là né được → cần
  -- thêm trần burst toàn cục. Ngưỡng 30/phút rộng gấp nhiều lần lưu lượng thật
  -- (form public + FB webhook), nhưng chặn được vòng lặp bơm dữ liệu.
  IF (
    SELECT count(*) FROM lead WHERE created_at > now() - interval '1 minute'
  ) >= 30 THEN
    RAISE EXCEPTION 'Hệ thống đang nhận quá nhiều yêu cầu, vui lòng thử lại sau ít phút';
  END IF;

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

  -- Truyền giá trị ĐÃ cap xuống find_or_create_khach_hang — hàm đó chạy trong
  -- ngữ cảnh SECURITY DEFINER của hàm này nên anon ghi gián tiếp được vào
  -- khach_hang; cap ở đây là chốt chặn duy nhất.
  v_kh_id := public.find_or_create_khach_hang(v_name, v_sdt, v_email, NULL, NULL, NULL, v_nguon, NULL);

  INSERT INTO lead (
    ho_ten, so_dien_thoai, email, nguon, loai_tour,
    so_nguoi_lon, so_nguoi_em,
    ngay_di_du_kien, ngay_ve_du_kien, ngan_sach_per_khach,
    yeu_cau_dac_biet, ghi_chu,
    assigned_to, trang_thai, khach_hang_id
  ) VALUES (
    v_name,
    v_sdt,
    v_email,
    v_nguon,
    left(trim(coalesce(p_loai_tour, '')), 20),
    -- Chặn số khách phi lý (bot gửi 2^31) — không phải rủi ro dung lượng nhưng
    -- làm hỏng báo cáo và round-robin.
    LEAST(GREATEST(coalesce(p_so_nguoi_lon, 1), 1), 1000),
    LEAST(GREATEST(coalesce(p_so_nguoi_em, 0), 0), 1000),
    p_ngay_di_du_kien, p_ngay_ve_du_kien, p_ngan_sach_per_khach,
    NULLIF(left(trim(coalesce(p_yeu_cau_dac_biet, '')), 2000), ''),
    NULLIF(left(trim(coalesce(p_ghi_chu, '')), 2000), ''),
    v_assigned_to, 'moi', v_kh_id
  )
  RETURNING id INTO v_lead_id;

  IF coalesce(trim(coalesce(p_diem_den, '')), '') <> '' THEN
    INSERT INTO lead_diem_den (lead_id, diem_den)
    VALUES (v_lead_id, left(trim(p_diem_den), 200));
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

-- Giữ nguyên grant cũ (anon cần gọi được — đây là form public có chủ đích).
GRANT EXECUTE ON FUNCTION public.create_lead_from_form(
  text, text, text, text, text, integer, integer, date, date, bigint, text, text, text
) TO anon, authenticated, service_role;

-- Index đỡ 2 rate-limit query bên trên (quét lead theo cửa sổ 1 phút).
CREATE INDEX IF NOT EXISTS idx_lead_created_at ON public.lead (created_at DESC);
