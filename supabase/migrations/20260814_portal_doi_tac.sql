-- 外網 — Cổng đối tác (agent Đài Loan). Phần thuộc project CRM.
-- Project lflsbwoqzmbknzdpaequ. Deploy migration thủ công.
--
-- Cổng đối tác nằm ở MỘT PROJECT SUPABASE KHÁC. Lý do (đo 14/08/2026): 72/82 bảng
-- trong project này có policy `auth_required` = auth.uid() IS NOT NULL với roles =
-- PUBLIC → bất kỳ tài khoản nào đăng nhập vào project này đều đọc được nha_cung_cap
-- (kèm số tài khoản), bang_gia_dich_vu, canh_diem, bao_gia (profit_usd). Vì vậy đối
-- tác KHÔNG BAO GIỜ có tài khoản ở đây; dữ liệu đẩy một chiều sang project cổng.
--
-- File này chỉ làm 3 việc phía CRM:
--   1) Cờ mở cổng + chỗ lưu bản báo giá đã đóng băng.
--   2) Hàm dựng chương trình đoàn (jsonb sạch tiền) cho luồng đẩy.
--   3) RPC nhận yêu cầu mới từ cổng → tạo lead.

-- ───────────────────────────────────────────────────────────────────────────
-- 1) Cờ mở cổng
-- ───────────────────────────────────────────────────────────────────────────
-- Báo giá: nội dung ĐÓNG BĂNG lúc OP bấm "Gửi cho đối tác" (portal_noi_dung).
-- Bản đã chào không được đổi theo giá vốn sửa sau — đây cũng là chỗ vá lỗ
-- "giá chào không được lưu" (trước nay bảng giá tính live mỗi lần render).
ALTER TABLE public.bao_gia
  ADD COLUMN IF NOT EXISTS portal_enabled   boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS portal_noi_dung  jsonb,
  ADD COLUMN IF NOT EXISTS portal_pushed_at timestamptz;

-- Đoàn: chương trình KHÔNG đóng băng — đổi lịch thì đối tác phải thấy bản mới,
-- nên nội dung dựng lại mỗi lần đẩy bằng build_portal_doan_noi_dung().
ALTER TABLE public.doan
  ADD COLUMN IF NOT EXISTS portal_enabled   boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS portal_pushed_at timestamptz;

COMMENT ON COLUMN public.bao_gia.portal_noi_dung IS
  'Bản báo giá đã đóng băng gửi cổng đối tác (chỉ giá bán USD). Dựng ở client bằng lib/portal-payload.ts.';
COMMENT ON COLUMN public.doan.portal_enabled IS
  'Đoàn này hiện trên cổng đối tác. Chương trình đẩy lại mỗi 30 phút, không đẩy tiền và không đẩy trạng thái booking.';

CREATE INDEX IF NOT EXISTS idx_bao_gia_portal ON public.bao_gia (portal_enabled) WHERE portal_enabled;
CREATE INDEX IF NOT EXISTS idx_doan_portal    ON public.doan (portal_enabled)    WHERE portal_enabled;

-- ───────────────────────────────────────────────────────────────────────────
-- 2) build_portal_doan_noi_dung — chương trình đoàn dạng jsonb cho cổng
-- ───────────────────────────────────────────────────────────────────────────
-- CHỈ chương trình: ngày, thành phố, khách sạn, nhà hàng, cảnh điểm, HDV, chuyến bay.
-- KHÔNG có: đơn giá, chi phí, nhà cung cấp, số tài khoản, trạng thái booking
-- (đối tác thấy "chưa gửi" sẽ gọi thẳng khách sạn — xem ghi chú khảo sát 13/08).
-- SECURITY INVOKER (mặc định): gọi trong app thì vẫn chịu RLS scope văn phòng;
-- cron chạy bằng role postgres nên đọc được toàn bộ đoàn đang mở cổng.

-- Tên danh mục hay bị nhét giá vào trong ngoặc ("Xe điện phố cổ ( 10k)"). Bỏ cụm
-- ngoặc có chữ số đi kèm đơn vị tiền; ngoặc không dính tiền ("( ko ăn)") giữ nguyên.
CREATE OR REPLACE FUNCTION public.portal_lam_sach_ten(p_ten text)
RETURNS text
LANGUAGE sql IMMUTABLE
SET search_path TO 'public'
AS $$
  SELECT NULLIF(trim(regexp_replace(
    coalesce(p_ten, ''),
    '\(\s*[^)]*[0-9]+\s*(k|K|đ|Đ|vnd|VND|VNĐ|000)[^)]*\)',
    '', 'g'
  )), '');
$$;

CREATE OR REPLACE FUNCTION public.build_portal_doan_noi_dung(p_doan_id bigint)
RETURNS jsonb
LANGUAGE sql STABLE
SET search_path TO 'public'
AS $$
  SELECT jsonb_build_object(
    'version',        1,
    'ma_doan',        d.ten_doan,
    'ngay_di',        d.ngay_di,
    'ngay_ve',        d.ngay_ve,
    'so_khach',       d.so_khach,
    'truong_doan',    d.truong_doan,
    'chuyen_bay_den', d.chuyen_bay_don,
    'chuyen_bay_di',  d.chuyen_bay_tien,
    'hdv', (
      SELECT coalesce(jsonb_agg(jsonb_build_object(
               'ten', h.ten, 'so_dien_thoai', h.so_dien_thoai)), '[]'::jsonb)
      FROM huong_dan_vien h
      WHERE h.id IN (d.huong_dan_vien_id, d.huong_dan_vien_id_2)
    ),
    'ngay', (
      SELECT coalesce(jsonb_agg(s.noi_dung ORDER BY s.ngay_so), '[]'::jsonb)
      FROM (
        SELECT dn.ngay_so, jsonb_build_object(
          'ngay_so',   dn.ngay_so,
          'ngay_date', dn.ngay_date,
          'thu',       dn.thu,
          'thanh_pho', dn.thanh_pho,
          'khach_san', (SELECT portal_lam_sach_ten(coalesce(NULLIF(ks.ten_zh, ''), ks.ten))
                        FROM khach_san ks WHERE ks.id = dn.khach_san_id),
          'an_trua',   (SELECT portal_lam_sach_ten(coalesce(NULLIF(nh.ten_zh, ''), nh.ten))
                        FROM nha_hang nh WHERE nh.id = dn.an_trua_nha_hang_id),
          'an_toi',    (SELECT portal_lam_sach_ten(coalesce(NULLIF(nh.ten_zh, ''), nh.ten))
                        FROM nha_hang nh WHERE nh.id = dn.an_toi_nha_hang_id),
          'canh_diem', (
            -- Tên tiếng Trung lấy từ bí danh AI đã học được (bao_gia_match_alias),
            -- không có thì dùng tên tiếng Việt trong danh mục.
            SELECT coalesce(jsonb_agg(x.ten ORDER BY x.thu_tu, x.id), '[]'::jsonb)
            FROM (
              SELECT it.id, it.thu_tu,
                     portal_lam_sach_ten(coalesce(zh.text_key, cd.ten)) AS ten
              FROM doan_ngay_item it
              JOIN canh_diem cd ON cd.id = it.canh_diem_id
              LEFT JOIN LATERAL (
                SELECT a.text_key FROM bao_gia_match_alias a
                WHERE a.match_table = 'canh_diem'
                  AND a.target_id = cd.id
                  AND a.text_key ~ '[一-鿿]'
                ORDER BY a.lan_dung DESC NULLS LAST, a.id
                LIMIT 1
              ) zh ON true
              WHERE it.doan_ngay_id = dn.id
            ) x
            WHERE x.ten IS NOT NULL
          )
        ) AS noi_dung
        FROM doan_ngay dn
        WHERE dn.doan_id = d.id
      ) s
    )
  )
  FROM doan d
  WHERE d.id = p_doan_id;
$$;

GRANT EXECUTE ON FUNCTION public.portal_lam_sach_ten(text)          TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.build_portal_doan_noi_dung(bigint) TO authenticated, service_role;

-- ───────────────────────────────────────────────────────────────────────────
-- 3) create_lead_from_agent_portal — đối tác gửi yêu cầu mới từ cổng
-- ───────────────────────────────────────────────────────────────────────────
-- Đường DUY NHẤT từ cổng ngược về CRM. Cổng gọi qua edge function của nó (giữ
-- anon key CRM trong secret), không lộ ra frontend đối tác.
-- KHÔNG tạo khach_hang: người gửi là nhân viên của agent, không phải khách lẻ.
CREATE OR REPLACE FUNCTION public.create_lead_from_agent_portal(payload jsonb)
RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_agent_id    bigint;
  v_agent_ten   text;
  v_nguoi       text;
  v_noi_dung    text;
  v_tieu_de     text;
  v_assigned_to uuid;
  v_lead_id     bigint;
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

  -- Rate-limit: 10 yêu cầu / agent / giờ. Cổng có đăng nhập nên không cần ngặt
  -- như form public, nhưng vẫn chặn được vòng lặp gửi hỏng từ phía cổng.
  IF (
    SELECT count(*) FROM lead
    WHERE nguon = 'agent_portal'
      AND ghi_chu LIKE '[' || v_agent_ten || ']%'
      AND created_at > now() - interval '1 hour'
  ) >= 10 THEN
    RAISE EXCEPTION 'Đã gửi quá nhiều yêu cầu trong 1 giờ, vui lòng liên hệ trực tiếp phụ trách';
  END IF;

  -- Round-robin cho sales (cùng cách create_lead_from_form).
  WITH base AS (
    SELECT u.user_id, u.phan_loai_tour
    FROM user_roles u
    WHERE u.bo_phan = 'sales' AND u.active = true AND u.user_id IS NOT NULL
  ),
  matched AS (
    SELECT user_id FROM base
    WHERE phan_loai_tour IS NOT NULL AND 'inbound' = ANY(phan_loai_tour)
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
  FROM ranked ORDER BY last_assigned NULLS FIRST, user_id LIMIT 1;

  INSERT INTO lead (
    ho_ten, email, so_dien_thoai, nguon, loai_tour,
    so_nguoi_lon, ngay_di_du_kien, ngay_ve_du_kien,
    yeu_cau_dac_biet, ghi_chu, assigned_to, trang_thai
  ) VALUES (
    v_nguoi,
    NULLIF(left(trim(coalesce(payload->>'email', '')), 200), ''),
    NULLIF(left(trim(coalesce(payload->>'so_dien_thoai', '')), 50), ''),
    'agent_portal',
    'inbound',
    LEAST(GREATEST(coalesce(NULLIF(payload->>'so_khach', '')::int, 1), 1), 1000),
    NULLIF(payload->>'ngay_di_du_kien', '')::date,
    NULLIF(payload->>'ngay_ve_du_kien', '')::date,
    v_noi_dung,
    '[' || v_agent_ten || '] ' || coalesce(v_tieu_de, 'Yêu cầu từ cổng đối tác'),
    v_assigned_to, 'moi'
  )
  RETURNING id INTO v_lead_id;

  INSERT INTO lead_activity (lead_id, loai, noi_dung)
  VALUES (v_lead_id, 'tao_lead',
          'Đối tác ' || v_agent_ten || ' gửi yêu cầu từ cổng 外網' ||
          CASE WHEN v_assigned_to IS NOT NULL THEN ' — auto-assign cho sales'
               ELSE ' — chưa assign (không có sales active)' END);

  RETURN v_lead_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_lead_from_agent_portal(jsonb)
  TO anon, authenticated, service_role;
