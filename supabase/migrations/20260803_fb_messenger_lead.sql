-- FB Messenger → Lead: tin nhắn fanpage tự nổi trong CRM.
-- Edge fn fb-lead-webhook (mở rộng nhận field `messages` — Meta chỉ cho 1 callback
-- URL cho object `page`, leadgen + messages cùng đổ về đó) gọi RPC
-- upsert_lead_from_messenger bằng service_role.
--
-- Luồng: khách nhắn fanpage → webhook → RPC:
--   PSID chưa có lead → tạo lead nguon='fb_messenger', gán sales round-robin
--     nhóm bo_phan='sales' (CÙNG nhóm với form web/Lead Ads — gán trước khi
--     insert để trigger trg_lead_auto_assign nhóm dieu_hanh bỏ qua, tránh dính
--     tài khoản test); trg_lead_notify_new tự bắn thong_bao 'lead_moi'.
--   PSID đã có lead   → log lead_activity + bắn thong_bao 'lead_tin_nhan_fb'
--   Chuông app đã realtime sẵn (use-thong-bao) → tự nổi không cần F5.
-- Nhiều fanpage: fb_page_id/fb_page_ten lưu tin về trang nào; webhook đọc token
-- per-page qua secret FB_PAGE_TOKENS (JSON) khi có nhiều trang.

-- 1) Định danh Messenger trên lead. fb_psid KHÔNG unique: 1 khách (PSID) có thể
--    có nhiều lead theo thời gian (khach_hang master 1 khách → N lead); RPC luôn
--    bám lead MỚI NHẤT của PSID.
ALTER TABLE public.lead ADD COLUMN IF NOT EXISTS fb_psid text;
ALTER TABLE public.lead ADD COLUMN IF NOT EXISTS fb_page_id text;
ALTER TABLE public.lead ADD COLUMN IF NOT EXISTS fb_page_ten text;
CREATE INDEX IF NOT EXISTS idx_lead_fb_psid
  ON public.lead (fb_psid, id DESC) WHERE fb_psid IS NOT NULL;

-- 2) Deep-link chuông → lead (targetUrl client + send-push đọc lead_id).
ALTER TABLE public.thong_bao ADD COLUMN IF NOT EXISTS lead_id bigint
  REFERENCES public.lead(id) ON DELETE SET NULL;

-- 3) Dedup tin nhắn theo message id — FB retry webhook khi không nhận 200 kịp.
CREATE UNIQUE INDEX IF NOT EXISTS uq_lead_activity_fb_mid
  ON public.lead_activity (channel_ref)
  WHERE channel = 'facebook' AND channel_ref IS NOT NULL;

-- 4) RPC nhận 1 tin nhắn Messenger (atomic: tìm/tạo lead + log + thông báo).
DROP FUNCTION IF EXISTS public.upsert_lead_from_messenger(text, text, text, text);

CREATE OR REPLACE FUNCTION public.upsert_lead_from_messenger(
  p_psid     text,
  p_message  text DEFAULT NULL,
  p_mid      text DEFAULT NULL,
  p_ho_ten   text DEFAULT NULL,
  p_page_id  text DEFAULT NULL,
  p_page_ten text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_psid     text;
  v_msg      text;
  v_mid      text;
  v_page_id  text;
  v_page_ten text;
  v_lead_id  bigint;
  v_assigned uuid;
  v_ho_ten   text;
  v_lead_page_ten text;
  v_is_new   boolean := false;
  v_act_id   bigint;
BEGIN
  -- Guard tài khoản chỉ xem (rule chung cho RPC SECURITY DEFINER có ghi;
  -- thực tế hàm chỉ GRANT cho service_role — xem cuối file).
  IF public.is_tk_chi_xem() THEN
    RAISE EXCEPTION 'Tài khoản chỉ xem — không thực hiện được thao tác này'
      USING ERRCODE = '42501';
  END IF;

  -- left(): chặn bơm text nhiều MB qua endpoint public (giống create_lead_from_form).
  v_psid := NULLIF(left(trim(coalesce(p_psid, '')), 64), '');
  IF v_psid IS NULL THEN
    RAISE EXCEPTION 'p_psid là bắt buộc';
  END IF;
  v_msg      := NULLIF(left(trim(coalesce(p_message, '')), 2000), '');
  v_mid      := NULLIF(left(trim(coalesce(p_mid, '')), 128), '');
  v_page_id  := NULLIF(left(trim(coalesce(p_page_id, '')), 64), '');
  v_page_ten := NULLIF(left(trim(coalesce(p_page_ten, '')), 200), '');

  -- Serialize theo PSID: FB có thể bắn 2 event song song cho cùng người nhắn
  -- lần đầu → không lock sẽ tạo 2 lead trùng.
  PERFORM pg_advisory_xact_lock(hashtext('fb_psid:' || v_psid));

  SELECT id, assigned_to, ho_ten, fb_page_ten
  INTO v_lead_id, v_assigned, v_ho_ten, v_lead_page_ten
  FROM lead WHERE fb_psid = v_psid ORDER BY id DESC LIMIT 1;

  IF v_lead_id IS NULL THEN
    -- Trần burst toàn cục (giống create_lead_from_form): webhook public, nếu
    -- FB_APP_SECRET chưa set thì POST giả bơm được lead → chặn flood tầng DB.
    IF (SELECT count(*) FROM lead WHERE created_at > now() - interval '1 minute') >= 30 THEN
      RAISE EXCEPTION 'Hệ thống đang nhận quá nhiều lead, vui lòng thử lại sau ít phút';
    END IF;
    v_is_new := true;

    -- Round-robin nhóm SALES — copy đúng logic create_lead_from_form để mọi nguồn
    -- lead tự động gán cùng một nhóm người. Gán TRƯỚC khi insert → trigger
    -- fn_auto_assign_lead (nhóm dieu_hanh) thấy assigned_to có sẵn sẽ bỏ qua.
    WITH base AS (
      SELECT u.user_id, u.phan_loai_tour
      FROM user_roles u
      WHERE u.bo_phan = 'sales' AND u.active = true AND u.user_id IS NOT NULL
    ),
    matched AS (
      SELECT user_id FROM base
      WHERE phan_loai_tour IS NOT NULL AND 'outbound' = ANY(phan_loai_tour)
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
    SELECT user_id INTO v_assigned
    FROM ranked
    ORDER BY last_assigned NULLS FIRST, user_id
    LIMIT 1;

    -- loai_tour NOT NULL → mặc định 'outbound' (giống web form + FB Lead Ads);
    -- sales sửa lại sau khi tư vấn.
    INSERT INTO lead (ho_ten, nguon, loai_tour, trang_thai, fb_psid, fb_page_id, fb_page_ten, assigned_to, ghi_chu)
    VALUES (
      coalesce(NULLIF(left(trim(coalesce(p_ho_ten, '')), 200), ''), 'Khách Messenger'),
      'fb_messenger', 'outbound', 'moi', v_psid, v_page_id, v_page_ten,
      v_assigned,
      'Tự tạo từ tin nhắn Facebook Messenger' || COALESCE(' — Trang: ' || v_page_ten, '')
    )
    RETURNING id, assigned_to, ho_ten, fb_page_ten
    INTO v_lead_id, v_assigned, v_ho_ten, v_lead_page_ten;
    -- trg_lead_notify_new (AFTER INSERT) tự bắn thong_bao 'lead_moi'.
  ELSIF v_page_id IS NOT NULL THEN
    -- Backfill trang cho lead cũ chưa ghi (tạo trước bản v2).
    UPDATE lead
    SET fb_page_id = coalesce(fb_page_id, v_page_id),
        fb_page_ten = coalesce(fb_page_ten, v_page_ten)
    WHERE id = v_lead_id;
    v_lead_page_ten := coalesce(v_lead_page_ten, v_page_ten);
  END IF;

  -- Trần burst per-lead: chặn spam activity/thông báo khi endpoint bị bơm
  -- (60 tin/phút/lead — hội thoại thật không chạm nổi).
  IF (
    SELECT count(*) FROM lead_activity
    WHERE lead_id = v_lead_id AND channel = 'facebook'
      AND created_at > now() - interval '1 minute'
  ) >= 60 THEN
    RETURN jsonb_build_object('lead_id', v_lead_id, 'is_new', v_is_new, 'duplicated', false, 'throttled', true);
  END IF;

  -- Log tin nhắn vào timeline. Dedup theo mid qua partial unique index:
  -- conflict target PHẢI kèm WHERE khớp index predicate để Postgres suy ra index.
  INSERT INTO lead_activity (lead_id, loai, noi_dung, channel, direction, channel_ref)
  VALUES (
    v_lead_id, 'tin_nhan_messenger',
    coalesce(v_msg, '(tin nhắn không có nội dung text)'),
    'facebook', 'inbound', v_mid
  )
  ON CONFLICT (channel_ref) WHERE channel = 'facebook' AND channel_ref IS NOT NULL
  DO NOTHING
  RETURNING id INTO v_act_id;

  IF v_act_id IS NULL AND v_mid IS NOT NULL THEN
    -- FB retry cùng mid → đã xử lý trước đó, không thông báo lần 2.
    RETURN jsonb_build_object('lead_id', v_lead_id, 'is_new', false, 'duplicated', true);
  END IF;

  -- Lead cũ có tin mới → báo sales phụ trách (lead MỚI đã có thông báo từ trigger).
  IF NOT v_is_new AND v_assigned IS NOT NULL THEN
    -- Nhiều fanpage → prefix tên trang vào preview để sales biết tin về trang nào.
    INSERT INTO thong_bao (user_id, loai, tieu_de, noi_dung, lead_id, is_read, created_at)
    VALUES (
      v_assigned, 'lead_tin_nhan_fb',
      '💬 Tin nhắn Messenger: ' || coalesce(v_ho_ten, 'Khách'),
      CASE WHEN coalesce(v_lead_page_ten, v_page_ten) IS NOT NULL
           THEN '[' || coalesce(v_lead_page_ten, v_page_ten) || '] ' ELSE '' END
        || left(coalesce(v_msg, '(đính kèm)'), 200),
      v_lead_id, false, now()
    );
  END IF;

  RETURN jsonb_build_object('lead_id', v_lead_id, 'is_new', v_is_new, 'duplicated', false);
END;
$$;

-- Chỉ webhook (service_role) được gọi — KHÔNG mở cho client/anon.
REVOKE ALL ON FUNCTION public.upsert_lead_from_messenger(text, text, text, text, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_lead_from_messenger(text, text, text, text, text, text)
  TO service_role;

-- 5) fn_lead_notify_new: kèm lead_id (deep-link chuông) + nhãn nguồn mới
--    + fix noi_dung NULL khi loai_tour NULL (concat với NULL nuốt cả chuỗi).
CREATE OR REPLACE FUNCTION public.fn_lead_notify_new()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_nguon_label text;
  v_loai_tour_label text;
BEGIN
  IF NEW.assigned_to IS NULL THEN RETURN NEW; END IF;

  v_nguon_label := CASE NEW.nguon
    WHEN 'facebook_ads' THEN 'Facebook Ads'
    WHEN 'fb_lead_ads'  THEN 'FB Lead Ads'
    WHEN 'fb_messenger' THEN 'FB Messenger'
    WHEN 'web_form'     THEN 'Form web public'
    WHEN 'zalo_oa'      THEN 'Zalo OA'
    WHEN 'website'      THEN 'Website'
    WHEN 'hotline'      THEN 'Hotline'
    WHEN 'walk_in'      THEN 'Walk-in'
    WHEN 'referral'     THEN 'Giới thiệu'
    WHEN 'doi_tac'      THEN 'Đối tác'
    ELSE NEW.nguon
  END;

  v_loai_tour_label := CASE NEW.loai_tour
    WHEN 'outbound' THEN 'Outbound'
    WHEN 'noi_dia'  THEN 'Nội địa'
    ELSE NEW.loai_tour
  END;

  INSERT INTO thong_bao(user_id, loai, tieu_de, noi_dung, lead_id, is_read, created_at)
  VALUES (
    NEW.assigned_to,
    'lead_moi',
    '🆕 Lead mới: ' || NEW.ho_ten,
    'Nguồn: ' || v_nguon_label || ' | Loại tour: ' || coalesce(v_loai_tour_label, '—')
      || COALESCE(' | SĐT: ' || NEW.so_dien_thoai, ''),
    NEW.id,
    false,
    now()
  );
  RETURN NEW;
END;
$$;
