-- Báo giá nhiều phiên bản — một báo giá bị sửa và gửi lại nhiều lần.
-- Project lflsbwoqzmbknzdpaequ. Deploy migration thủ công.
--
-- Trước đây chỉ giữ được MỘT bản: bao_gia.portal_noi_dung bị đè mỗi lần gửi, còn
-- bảng giá thì tính live nên sửa đơn giá vốn hôm nay là đổi luôn con số đã chào
-- tuần trước. Không tra lại được đã chào bao nhiêu, lúc nào, vì sao đổi.
--
-- Mô hình: tách BÀN LÀM VIỆC khỏi BẢN ĐÃ CHÀO.
--   bao_gia            = bản nháp đang soạn, sửa thoải mái
--   bao_gia_phien_ban  = ảnh chụp mỗi lần bấm Gửi, CHỈ ghi thêm, không sửa không xoá
--
-- Mỗi phiên bản chụp HAI lớp:
--   noi_dung_chao — thứ đối tác thấy (bậc giá, 單房差, 包含/不含, KS theo ngày)
--   noi_dung_von  — items + đơn giá, xe, phụ thu, tỷ giá, profit target.
--                   Ở LẠI CRM, không bao giờ rời đi. Đây là thứ trả lời câu
--                   "vì sao lần 2 rẻ hơn lần 1 13 đô" — không có nó thì chỉ biết
--                   giá đổi mà không biết đổi vì cái gì.

-- ───────────────────────────────────────────────────────────────────────────
-- 1) Cột mới trên bao_gia
-- ───────────────────────────────────────────────────────────────────────────
ALTER TABLE public.bao_gia
  ADD COLUMN IF NOT EXISTS so_phien_ban_cuoi      integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS phien_ban_hien_hanh_id bigint;

COMMENT ON COLUMN public.bao_gia.so_phien_ban_cuoi IS
  'Số phiên bản đã cấp. RPC tao_phien_ban_bao_gia khoá dòng rồi mới tăng — bấm Gửi hai lần không ra hai bản trùng số.';

-- ───────────────────────────────────────────────────────────────────────────
-- 2) bao_gia_phien_ban — bằng chứng, không sửa được
-- ───────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.bao_gia_phien_ban (
  id            bigserial PRIMARY KEY,
  -- RESTRICT chứ không CASCADE: báo giá đã từng chào ra ngoài thì không xoá được
  -- nữa. Muốn bỏ thì đánh dấu, đừng phi tang.
  bao_gia_id    bigint NOT NULL REFERENCES public.bao_gia(id) ON DELETE RESTRICT,
  so_phien_ban  integer NOT NULL CHECK (so_phien_ban >= 1),
  ma_hien_thi   text NOT NULL,               -- BG00025 · BG00025-v2 · BG00025-v3
  noi_dung_chao jsonb NOT NULL,
  noi_dung_von  jsonb,
  chao_ngay     date NOT NULL,
  hieu_luc_den  date,
  ly_do         text,                        -- bắt buộc từ bản #2 (ép ở RPC)
  gui_boi       uuid,
  gui_boi_ten   text,
  gui_luc       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (bao_gia_id, so_phien_ban)
);

CREATE INDEX IF NOT EXISTS idx_bg_phien_ban_bao_gia
  ON public.bao_gia_phien_ban (bao_gia_id, so_phien_ban DESC);

ALTER TABLE public.bao_gia
  DROP CONSTRAINT IF EXISTS bao_gia_phien_ban_hien_hanh_fk;
ALTER TABLE public.bao_gia
  ADD CONSTRAINT bao_gia_phien_ban_hien_hanh_fk
  FOREIGN KEY (phien_ban_hien_hanh_id) REFERENCES public.bao_gia_phien_ban(id) ON DELETE SET NULL;

-- Bất biến ở TẦNG DB, không chỉ ở app: bảng này là bằng chứng khi tranh chấp giá
-- với đối tác, nên một câu UPDATE lỡ tay hay một tài khoản admin cũng không được
-- sửa. Trigger chặn cả service_role.
CREATE OR REPLACE FUNCTION public.chan_sua_phien_ban_bao_gia()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  RAISE EXCEPTION 'Phiên bản báo giá đã gửi không sửa/xoá được — tạo phiên bản mới thay vì sửa bản cũ'
    USING ERRCODE = '42501';
END;
$$;

DROP TRIGGER IF EXISTS bao_gia_phien_ban_bat_bien ON public.bao_gia_phien_ban;
CREATE TRIGGER bao_gia_phien_ban_bat_bien
  BEFORE UPDATE OR DELETE ON public.bao_gia_phien_ban
  FOR EACH ROW EXECUTE FUNCTION public.chan_sua_phien_ban_bao_gia();

-- ───────────────────────────────────────────────────────────────────────────
-- 3) bao_gia_log — dòng thời gian gửi qua lại (mẫu theo doan_log)
-- ───────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.bao_gia_log (
  id          bigserial PRIMARY KEY,
  bao_gia_id  bigint NOT NULL REFERENCES public.bao_gia(id) ON DELETE CASCADE,
  loai        text NOT NULL,   -- gui_ban | mo_phien_ban | thu_hoi
                               -- (sau này: yeu_cau_sua | doi_tac_xem khi làm cổng)
  noi_dung    text,
  tao_boi     uuid,
  tao_boi_ten text,
  tao_luc     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bao_gia_log_bao_gia ON public.bao_gia_log (bao_gia_id, tao_luc DESC);

-- ───────────────────────────────────────────────────────────────────────────
-- 4) GRANT + RLS
-- ───────────────────────────────────────────────────────────────────────────
-- KHÔNG cấp UPDATE/DELETE trên bảng phiên bản — tường thứ hai cạnh trigger.
GRANT SELECT, INSERT ON public.bao_gia_phien_ban TO authenticated, service_role;
GRANT USAGE, SELECT ON SEQUENCE public.bao_gia_phien_ban_id_seq TO authenticated, service_role;
GRANT SELECT, INSERT ON public.bao_gia_log TO authenticated, service_role;
GRANT USAGE, SELECT ON SEQUENCE public.bao_gia_log_id_seq TO authenticated, service_role;

ALTER TABLE public.bao_gia_phien_ban ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bao_gia_log       ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS auth_doc_ghi ON public.bao_gia_phien_ban;
CREATE POLICY auth_doc_ghi ON public.bao_gia_phien_ban
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS auth_them ON public.bao_gia_phien_ban;
CREATE POLICY auth_them ON public.bao_gia_phien_ban
  FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS auth_doc_ghi ON public.bao_gia_log;
CREATE POLICY auth_doc_ghi ON public.bao_gia_log
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS auth_them ON public.bao_gia_log;
CREATE POLICY auth_them ON public.bao_gia_log
  FOR INSERT TO authenticated WITH CHECK (true);

-- Khoá ghi cho tài khoản chỉ xem (bảng tạo sau đợt quét 20260728 nên phải tự thêm).
DROP POLICY IF EXISTS chi_xem_block_insert ON public.bao_gia_phien_ban;
CREATE POLICY chi_xem_block_insert ON public.bao_gia_phien_ban AS RESTRICTIVE
  FOR INSERT TO public WITH CHECK (NOT (SELECT public.is_tk_chi_xem()));
DROP POLICY IF EXISTS chi_xem_block_insert ON public.bao_gia_log;
CREATE POLICY chi_xem_block_insert ON public.bao_gia_log AS RESTRICTIVE
  FOR INSERT TO public WITH CHECK (NOT (SELECT public.is_tk_chi_xem()));

-- ───────────────────────────────────────────────────────────────────────────
-- 5) RPC tao_phien_ban_bao_gia — chốt một bản chào, nguyên tử
-- ───────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.tao_phien_ban_bao_gia(
  p_bao_gia_id bigint,
  p_chao       jsonb,
  p_von        jsonb DEFAULT NULL,
  p_ly_do      text  DEFAULT NULL
)
RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_so      integer;
  v_ma_bg   text;
  v_ma      text;
  v_id      bigint;
  v_ten     text;
  v_ly_do   text;
BEGIN
  IF public.is_tk_chi_xem() THEN
    RAISE EXCEPTION 'Tài khoản chỉ xem — không thực hiện được thao tác này'
      USING ERRCODE = '42501';
  END IF;

  IF p_chao IS NULL OR p_chao = 'null'::jsonb THEN
    RAISE EXCEPTION 'Thiếu nội dung bản chào';
  END IF;

  -- Khoá dòng báo giá rồi mới cấp số: bấm Gửi hai lần (hoặc hai người cùng bấm)
  -- không tạo ra hai phiên bản trùng số.
  SELECT so_phien_ban_cuoi, ma_bg INTO v_so, v_ma_bg
  FROM bao_gia WHERE id = p_bao_gia_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Không tìm thấy báo giá %', p_bao_gia_id;
  END IF;

  v_so := coalesce(v_so, 0) + 1;
  v_ma_bg := coalesce(v_ma_bg, 'BG' || lpad(p_bao_gia_id::text, 5, '0'));
  -- Bản đầu giữ nguyên mã; từ bản 2 thêm hậu tố để đối tác biết đang cầm bản nào.
  v_ma := CASE WHEN v_so = 1 THEN v_ma_bg ELSE v_ma_bg || '-v' || v_so END;

  v_ly_do := NULLIF(left(trim(coalesce(p_ly_do, '')), 500), '');
  IF v_so > 1 AND v_ly_do IS NULL THEN
    RAISE EXCEPTION 'Từ phiên bản thứ 2 phải ghi lý do vì sao khác bản trước';
  END IF;

  SELECT ho_ten INTO v_ten FROM user_roles WHERE user_id = auth.uid() LIMIT 1;

  INSERT INTO bao_gia_phien_ban (
    bao_gia_id, so_phien_ban, ma_hien_thi, noi_dung_chao, noi_dung_von,
    chao_ngay, hieu_luc_den, ly_do, gui_boi, gui_boi_ten
  ) VALUES (
    p_bao_gia_id, v_so, v_ma, p_chao, p_von,
    coalesce((p_chao->>'chao_ngay')::date, current_date),
    (p_chao->>'hieu_luc_den')::date,
    v_ly_do, auth.uid(), v_ten
  )
  RETURNING id INTO v_id;

  -- portal_noi_dung từ nay là BẢN SAO lớp chào của phiên bản hiện hành → đường đẩy
  -- sang cổng và cổng đối tác chạy y như cũ, không phải sửa cùng lúc.
  -- portal_enabled = true: "Gửi khách" NGHĨA LÀ gửi cho đối tác, nên không bắt OP
  -- bật thêm công tắc nào nữa — gửi bản mới là đối tác thấy bản mới.
  UPDATE bao_gia
  SET so_phien_ban_cuoi = v_so,
      phien_ban_hien_hanh_id = v_id,
      portal_noi_dung = p_chao,
      portal_enabled = true,
      trang_thai = 'sent'
  WHERE id = p_bao_gia_id;

  INSERT INTO bao_gia_log (bao_gia_id, loai, noi_dung, tao_boi, tao_boi_ten)
  VALUES (p_bao_gia_id, 'gui_ban',
          'Gửi bản ' || v_ma || coalesce(' — ' || v_ly_do, ''), auth.uid(), v_ten);

  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.tao_phien_ban_bao_gia(bigint, jsonb, jsonb, text)
  TO authenticated, service_role;

-- ───────────────────────────────────────────────────────────────────────────
-- 6) RPC mo_phien_ban_moi — mở khoá để soạn bản kế tiếp
-- ───────────────────────────────────────────────────────────────────────────
-- Bản đã gửi vẫn nguyên vẹn và VẪN hiển thị cho đối tác; đây chỉ là mở bàn làm
-- việc ra sửa tiếp. Lý do vì sao đổi được hỏi lúc GỬI, khi đã biết mình sửa gì.
CREATE OR REPLACE FUNCTION public.mo_phien_ban_moi(p_bao_gia_id bigint)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_ten text;
BEGIN
  IF public.is_tk_chi_xem() THEN
    RAISE EXCEPTION 'Tài khoản chỉ xem — không thực hiện được thao tác này'
      USING ERRCODE = '42501';
  END IF;

  SELECT ho_ten INTO v_ten FROM user_roles WHERE user_id = auth.uid() LIMIT 1;

  UPDATE bao_gia SET trang_thai = 'draft' WHERE id = p_bao_gia_id;

  INSERT INTO bao_gia_log (bao_gia_id, loai, noi_dung, tao_boi, tao_boi_ten)
  VALUES (p_bao_gia_id, 'mo_phien_ban', 'Mở soạn phiên bản mới', auth.uid(), v_ten);
END;
$$;

GRANT EXECUTE ON FUNCTION public.mo_phien_ban_moi(bigint) TO authenticated, service_role;

-- ───────────────────────────────────────────────────────────────────────────
-- 7) Backfill bản đã chào trước khi có tính năng này
-- ───────────────────────────────────────────────────────────────────────────
INSERT INTO public.bao_gia_phien_ban (
  bao_gia_id, so_phien_ban, ma_hien_thi, noi_dung_chao, noi_dung_von,
  chao_ngay, hieu_luc_den, ly_do, gui_luc
)
SELECT b.id, 1,
       coalesce(b.ma_bg, 'BG' || lpad(b.id::text, 5, '0')),
       b.portal_noi_dung,
       NULL,                                   -- bản cũ không chụp lớp vốn
       coalesce((b.portal_noi_dung->>'chao_ngay')::date, current_date),
       (b.portal_noi_dung->>'hieu_luc_den')::date,
       'Backfill bản đã chào trước khi có phiên bản',
       coalesce(b.portal_pushed_at, now())
FROM public.bao_gia b
WHERE b.portal_noi_dung IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM public.bao_gia_phien_ban p WHERE p.bao_gia_id = b.id);

UPDATE public.bao_gia b
SET so_phien_ban_cuoi = 1,
    phien_ban_hien_hanh_id = p.id
FROM public.bao_gia_phien_ban p
WHERE p.bao_gia_id = b.id AND p.so_phien_ban = 1 AND b.so_phien_ban_cuoi = 0;
