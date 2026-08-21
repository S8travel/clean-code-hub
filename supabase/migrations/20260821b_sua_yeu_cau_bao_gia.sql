-- Sửa 4 lỗi của migration 20260821_tab_yeu_cau_bao_gia.sql, tìm ra khi soi lại.
-- Project lflsbwoqzmbknzdpaequ. Deploy migration thủ công.

-- ───────────────────────────────────────────────────────────────────────────
-- 1) LỖ BẢO MẬT: view chạy bằng quyền chủ sở hữu + anon vẫn đọc được
-- ───────────────────────────────────────────────────────────────────────────
-- View mặc định của Postgres là SECURITY DEFINER: nó chạy bằng quyền owner nên
-- BỎ QUA RLS của mọi bảng bên dưới (yeu_cau_bao_gia, bao_gia, lead_tai_lieu,
-- user_roles). Cộng thêm GRANT mặc định của Supabase cho `anon` (chưa bị thu),
-- kết quả là bất kỳ ai cầm khoá publishable — thứ nằm sẵn trong bundle web —
-- đọc được toàn bộ yêu cầu của đối tác mà KHÔNG cần đăng nhập.
-- Đo trên prod 21/08: has_table_privilege('anon', view, 'SELECT') = true,
-- reloptions = NULL (các view khác như dntt_with_payment_status đều đã
-- security_invoker=on). Đây đúng là cái bẫy migration 20260814010000 bên cổng
-- đã ghi: chỉ dựa vào RLS thì một đường vòng là thủng.
-- (View được dựng lại ở mục 3 kèm security_invoker=on.)
REVOKE ALL ON public.yeu_cau_bao_gia_view FROM anon;
REVOKE ALL ON public.yeu_cau_bao_gia      FROM anon;
REVOKE ALL ON public.lead_tai_lieu        FROM anon;

-- ───────────────────────────────────────────────────────────────────────────
-- 2) Dấu vết file đối tác gửi mà hệ thống không lấy được
-- ───────────────────────────────────────────────────────────────────────────
-- Trước: file chép hỏng chỉ được trả về trong response cho cổng rồi biến mất.
-- Người làm báo giá mở tab thấy "không có file" và tưởng đối tác không gửi gì,
-- trong khi đối tác đinh ninh đã gửi kèm lịch trình.
ALTER TABLE public.yeu_cau_bao_gia
  ADD COLUMN IF NOT EXISTS so_tep_gui integer,
  ADD COLUMN IF NOT EXISTS tep_hong   jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.yeu_cau_bao_gia.so_tep_gui IS
  'Số file đối tác ĐÍNH KÈM lúc gửi. So với số dòng lead_tai_lieu để biết có file nào rớt.';
COMMENT ON COLUMN public.yeu_cau_bao_gia.tep_hong IS
  'Tên các file hệ thống không lấy được — tab hiện cảnh báo để đi xin lại.';

-- ───────────────────────────────────────────────────────────────────────────
-- 3) View: đã làm báo giá thì không còn là "bỏ qua"
-- ───────────────────────────────────────────────────────────────────────────
-- Trước: 'bo_qua' thắng tuyệt đối. Yêu cầu từng bị bỏ qua rồi sau đó có người
-- làm báo giá (qua đường khác, hoặc bước ghi trạng thái hỏng giữa chừng) sẽ
-- nằm im trong nhóm "Bỏ qua" — giấu mất việc đã làm.
-- Nay: có báo giá thật thì luôn là "đã báo giá"; 'bo_qua' chỉ còn ý nghĩa khi
-- chưa ai làm gì.
-- DROP rồi CREATE, không CREATE OR REPLACE: view dùng `y.*` nên vừa thêm 2 cột ở
-- mục (2) là danh sách cột đổi thứ tự, mà REPLACE thì Postgres từ chối
-- ("cannot change name of view column"). Bài học cho mọi view có `bang.*`.
DROP VIEW IF EXISTS public.yeu_cau_bao_gia_view;

CREATE VIEW public.yeu_cau_bao_gia_view
WITH (security_invoker = on) AS
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
    WHEN EXISTS (SELECT 1 FROM public.bao_gia b WHERE b.yeu_cau_id = y.id) THEN 'da_bao_gia'
    WHEN y.trang_thai = 'bo_qua' THEN 'bo_qua'
    ELSE 'moi'
  END                                                                        AS trang_thai_hien_thi,
  u.ho_ten                                                                   AS xu_ly_ten
FROM public.yeu_cau_bao_gia y
LEFT JOIN public.user_roles u ON u.user_id = y.xu_ly_boi;

GRANT SELECT ON public.yeu_cau_bao_gia_view TO authenticated, service_role;
REVOKE ALL ON public.yeu_cau_bao_gia_view FROM anon;

COMMENT ON VIEW public.yeu_cau_bao_gia_view IS
  'Yêu cầu + số báo giá đã làm + trạng thái hiển thị. security_invoker=on: view KHÔNG được đi vòng qua RLS.';

-- ───────────────────────────────────────────────────────────────────────────
-- 4) RPC: đừng bịa số khách, và ghi lại file rớt
-- ───────────────────────────────────────────────────────────────────────────
-- Trước: đối tác không khai số khách → coalesce(...,1) ghi thành "1 khách".
-- Tab hiện con số bịa đó y như thật; người báo giá đọc xong tính sai cỡ đoàn.
-- Nay: không khai thì để trống, tab hiện "—".
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
  v_so_tep_gui  int;
  v_tep_hong    jsonb;
  v_so_bao      int;
BEGIN
  IF public.is_tk_chi_xem() THEN
    RAISE EXCEPTION 'Tài khoản chỉ xem — không thực hiện được thao tác này'
      USING ERRCODE = '42501';
  END IF;

  v_agent_id := NULLIF(payload->>'agent_id', '')::bigint;
  SELECT a.ten INTO v_agent_ten FROM agents a WHERE a.id = v_agent_id;
  IF v_agent_ten IS NULL THEN
    RAISE EXCEPTION 'Đối tác không hợp lệ';
  END IF;

  v_tieu_de  := NULLIF(left(trim(coalesce(payload->>'tieu_de', '')), 200), '');
  v_noi_dung := NULLIF(left(trim(coalesce(payload->>'noi_dung', '')), 2000), '');
  v_nguoi    := coalesce(NULLIF(left(trim(coalesce(payload->>'nguoi_lien_he', '')), 200), ''), v_agent_ten);
  v_email    := NULLIF(left(trim(coalesce(payload->>'email', '')), 200), '');
  v_sdt      := NULLIF(left(trim(coalesce(payload->>'so_dien_thoai', '')), 50), '');
  -- KHÔNG coalesce về 1: "không nói số khách" là một thông tin, "1 khách" là số bịa.
  -- Phải bọc CASE: GREATEST/LEAST BỎ QUA NULL, nên GREATEST(NULL, 1) ra 1 — đúng
  -- cái số bịa vừa muốn bỏ. Đo trên prod mới lòi ra (yêu cầu không khai số khách
  -- vẫn hiện "1 khách").
  v_so_khach := CASE
    WHEN NULLIF(payload->>'so_khach', '') IS NULL THEN NULL
    ELSE LEAST(GREATEST((payload->>'so_khach')::int, 1), 1000)
  END;
  v_ngay_di  := NULLIF(payload->>'ngay_di_du_kien', '')::date;
  v_ngay_ve  := NULLIF(payload->>'ngay_ve_du_kien', '')::date;
  v_so_tep_gui := NULLIF(payload->>'so_tep_gui', '')::int;
  v_tep_hong   := coalesce(payload->'tep_hong', '[]'::jsonb);

  IF v_tieu_de IS NULL AND v_noi_dung IS NULL THEN
    RAISE EXCEPTION 'Cần nhập nội dung yêu cầu';
  END IF;

  IF (
    SELECT count(*) FROM yeu_cau_bao_gia
    WHERE agent_id = v_agent_id
      AND tao_luc > now() - interval '1 hour'
  ) >= 10 THEN
    RAISE EXCEPTION 'Đã gửi quá nhiều yêu cầu trong 1 giờ, vui lòng liên hệ trực tiếp phụ trách';
  END IF;

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

  INSERT INTO yeu_cau_bao_gia (
    agent_id, ten_agent, tai_khoan_email, tai_khoan_ten,
    nguoi_lien_he, email, so_dien_thoai,
    tieu_de, noi_dung, so_khach, ngay_di_du_kien, ngay_ve_du_kien,
    so_tep_gui, tep_hong
  ) VALUES (
    v_agent_id, v_agent_ten,
    NULLIF(left(trim(coalesce(payload->>'tai_khoan_email', '')), 200), ''),
    NULLIF(left(trim(coalesce(payload->>'tai_khoan_ten', '')), 200), ''),
    v_nguoi, v_email, v_sdt,
    v_tieu_de, v_noi_dung, v_so_khach, v_ngay_di, v_ngay_ve,
    v_so_tep_gui, v_tep_hong
  )
  RETURNING id INTO v_yeu_cau_id;

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
          CASE WHEN jsonb_array_length(v_tep_hong) > 0
               THEN ' (' || jsonb_array_length(v_tep_hong) || ' file KHÔNG lấy được)' ELSE '' END ||
          CASE WHEN v_assigned_to IS NOT NULL THEN ', đã chia cho người phụ trách'
               ELSE ' — chưa chia (không có người nhận nào đang bật)' END);

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
