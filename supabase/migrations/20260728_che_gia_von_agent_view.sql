-- ============================================================================
-- CHE GIÁ VỐN + BẢN CHI PHÍ CHO AGENT (2026-07-28)
-- ----------------------------------------------------------------------------
-- Bối cảnh: cần cho đại diện agent (tài khoản chỉ xem) thấy chi phí đoàn của
-- agent đó ĐÃ CỘNG HỆ SỐ, và KHÔNG thấy giá vốn thật.
--
-- Vì sao không nhân 20% ở tầng hiển thị: chi phí không có tầng hiển thị chung
-- (151 file chạm tới tien_cong_ty/thanh_tien/don_gia/so_tien), và dù có ẩn hết
-- trên UI thì gọi thẳng API vẫn đọc được `doan_chi_phi`. Nên phải chặn ĐỌC ở
-- DB trước, rồi phát số đã nhân qua một RPC duy nhất.
--
-- Thiết kế:
--   1. `user_roles.che_gia_von`  — tài khoản không được đọc bảng giá vốn đoàn.
--   2. `agents.he_so_hien_thi`   — hệ số nhân khi phát cho agent (1.0 = nguyên giá).
--   3. RLS RESTRICTIVE chặn SELECT 7 bảng giá vốn đoàn. RLS lọc dòng nên trả về
--      RỖNG chứ không ném lỗi → các query cũ không vỡ, chỉ không có dữ liệu.
--   4. RPC `get_chi_phi_agent_view` là đường DUY NHẤT tài khoản này lấy được số
--      chi phí, và số phát ra đã nhân hệ số.
--
-- ⚠️ GIỚI HẠN CÒN LẠI (có chủ ý, đã báo user): `doan_ngay_item.don_gia` và giá
-- master danh mục (canh_diem.gia_mac_dinh, nha_hang_set_menu.gia, nha_xe_loai_xe
-- .gia, loai_visa.gia) VẪN đọc được qua API trực tiếp — các bảng này chứa dữ
-- liệu vận hành (tên cảnh điểm, tên set, lịch trình) mà tài khoản cần để xem
-- đoàn, RLS thì lọc theo DÒNG chứ không lọc theo CỘT. UI đã ẩn. Muốn kín nốt
-- phải gỡ luôn quyền `doan` và dựng bản agent cho cả lịch trình.
--
-- Rollback:
--   DROP FUNCTION IF EXISTS public.get_chi_phi_agent_view(bigint);
--   DO $$ DECLARE r record; BEGIN
--     FOR r IN SELECT unnest(ARRAY['doan_chi_phi','de_nghi_thanh_toan','payments',
--                                  'cong_no','dntt_allocations','doan_invoice',
--                                  'doan_ks_dem']) AS t LOOP
--       EXECUTE format('DROP POLICY IF EXISTS che_gia_von_block_select ON public.%I', r.t);
--     END LOOP; END $$;
--   DROP FUNCTION IF EXISTS public.is_tk_che_gia_von();
--   ALTER TABLE public.user_roles DROP COLUMN che_gia_von;
--   ALTER TABLE public.agents DROP COLUMN he_so_hien_thi;
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1) Cột cấu hình
-- ---------------------------------------------------------------------------
ALTER TABLE public.user_roles
  ADD COLUMN IF NOT EXISTS che_gia_von boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.user_roles.che_gia_von IS
  'true = không được đọc bảng giá vốn đoàn (doan_chi_phi, ĐNTT, payments, cong_no...). Lấy chi phí qua RPC get_chi_phi_agent_view (đã nhân hệ số).';

ALTER TABLE public.agents
  ADD COLUMN IF NOT EXISTS he_so_hien_thi numeric NOT NULL DEFAULT 1.0
    CHECK (he_so_hien_thi >= 1.0);

COMMENT ON COLUMN public.agents.he_so_hien_thi IS
  'Hệ số nhân chi phí khi phát cho tài khoản che_gia_von. 1.0 = nguyên giá (mặc định), 1.2 = +20%.';

-- ---------------------------------------------------------------------------
-- 2) Helper
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_tk_che_gia_von()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid() AND ur.che_gia_von
  );
$function$;

GRANT EXECUTE ON FUNCTION public.is_tk_che_gia_von() TO authenticated, anon, service_role;

-- ---------------------------------------------------------------------------
-- 3) Chặn ĐỌC các bảng giá vốn đoàn
-- ---------------------------------------------------------------------------
DO $mig$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'doan_chi_phi',          -- chi phí từng dòng
    'de_nghi_thanh_toan',    -- số tiền đề nghị trả NCC
    'payments',              -- số tiền đã trả
    'cong_no',               -- công nợ NCC
    'dntt_allocations',      -- phân bổ ĐNTT → chi phí
    'doan_invoice',          -- chi phí thực tế vs invoice
    'doan_ks_dem'            -- giá phòng / đêm
  ]
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS che_gia_von_block_select ON public.%I', t);
    EXECUTE format(
      'CREATE POLICY che_gia_von_block_select ON public.%I AS RESTRICTIVE '
      'FOR SELECT TO public USING (NOT (SELECT public.is_tk_che_gia_von()))',
      t);
  END LOOP;
END $mig$;

-- ---------------------------------------------------------------------------
-- 4) RPC phát chi phí đã nhân hệ số
--    SECURITY DEFINER (bypass RLS ở 3) → PHẢI tự kiểm tra scope văn phòng,
--    khớp policy `van_phong_scope` của bảng doan.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_chi_phi_agent_view(p_doan_id bigint)
RETURNS TABLE (
  danh_muc    text,
  mo_ta       text,
  ngay_so     integer,
  so_luong    numeric,
  don_gia     numeric,
  thanh_tien  numeric,
  he_so       numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_he_so   numeric;
  v_vp      bigint;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Chưa đăng nhập';
  END IF;

  SELECT d.van_phong_id, COALESCE(a.he_so_hien_thi, 1.0)
    INTO v_vp, v_he_so
  FROM public.doan d
  LEFT JOIN public.agents a ON a.id = d.agent_id
  WHERE d.id = p_doan_id;

  IF NOT FOUND THEN
    RETURN;  -- đoàn không tồn tại
  END IF;

  -- Khớp RLS bảng doan: cross-VP xem hết; còn lại phải thuộc tập VP truy cập
  -- (đoàn van_phong_id NULL chỉ cross-VP thấy — `NULL = ANY(...)` trả NULL nên
  -- nhánh này tự chặn).
  IF NOT current_user_cross_vp()
     AND COALESCE(v_vp = ANY(current_user_vp_scope()), false) = false THEN
    RETURN;
  END IF;

  -- Tài khoản che giá vốn CHỈ được nhận đoàn của agent đã cấu hình hệ số.
  -- Agent chưa cấu hình (hệ số 1.0) → trả rỗng, KHÔNG phát giá gốc ra ngoài.
  IF is_tk_che_gia_von() AND v_he_so <= 1.0 THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    cp.danh_muc::text,
    cp.mo_ta::text,
    cp.ngay_so::integer,
    cp.so_luong::numeric,
    round(cp.don_gia * v_he_so)::numeric,
    -- Nhân trên số THỰC TẾ (thanh_tien_thuc_te nếu có điều chỉnh sau thanh toán),
    -- khớp cách tab Chi phí tính tổng.
    round(COALESCE(cp.thanh_tien_thuc_te, cp.tien_cong_ty + cp.tien_hdv) * v_he_so)::numeric,
    v_he_so
  FROM public.doan_chi_phi cp
  WHERE cp.doan_id = p_doan_id
    AND COALESCE(cp.is_excluded, false) = false
    -- Dòng công nợ / hoàn tiền không phải chi phí phát sinh, khớp useChiPhiSummaryMap.
    AND COALESCE(cp.trang_thai_dntt, '') NOT IN ('cong_no', 'hoan_tien')
  ORDER BY cp.danh_muc, cp.ngay_so NULLS LAST, cp.id;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.get_chi_phi_agent_view(bigint) TO authenticated, service_role;

-- Tài khoản chỉ xem không được gọi RPC ghi, nhưng RPC này chỉ đọc → không cần
-- guard is_tk_chi_xem(). STABLE + chỉ SELECT.

-- ---------------------------------------------------------------------------
-- 5) Kiểm chứng
-- ---------------------------------------------------------------------------
DO $mig$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM pg_policy WHERE polname = 'che_gia_von_block_select';
  IF n <> 7 THEN
    RAISE EXCEPTION 'Thiếu policy chặn đọc: mong 7, có %', n;
  END IF;
  RAISE NOTICE 'che_gia_von OK: % bảng chặn đọc', n;
END $mig$;
