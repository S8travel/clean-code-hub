-- ============================================================================
-- CHE GIÁ VỐN — bịt nốt các đường còn đọc được giá (2026-07-29)
-- ----------------------------------------------------------------------------
-- Bản trước (20260728_che_gia_von_agent_view) mới chặn 7 bảng "thuần tiền".
-- Rà lại bằng schema thì còn hở nhiều hơn báo cáo ban đầu — đo trên đoàn của
-- một agent lớn:
--   • doan_ngay_item.don_gia            1878 dòng ·  1,995 tỷ giá vốn cảnh điểm
--   • doan_booking_nh.gia_snapshot      1285 dòng
--   • doan_booking_dv.dich_vu_list       890 dòng
--   • bảng giá NCC (canh_diem, nha_hang_set_menu, khach_san_gia_phong,
--     nha_xe_loai_xe, loai_visa, bang_gia_dich_vu, seri_tour_ngay_item)
--                                       5072 dòng
--   • bao_gia, voucher_su_dung, doan_khach_le
-- Ba VIEW (dntt_with_payment_status, cong_no_with_status, voucher_with_status)
-- đều `security_invoker=on` nên đã đi theo RLS bảng gốc — không phải vá.
--
-- Quyết định: chặn SELECT nốt, KỂ CẢ bảng `doan`. Hệ quả: tài khoản che giá vốn
-- không còn đọc thẳng được gì về đoàn → mọi thứ nó thấy đi qua 3 RPC dưới đây,
-- và RPC là nơi duy nhất quyết định phát cái gì. Đổi lại, các trang cũ (danh
-- sách đoàn, điều tour, booking) sẽ rỗng với tài khoản này → app gỡ luôn quyền
-- tương ứng để không hiện màn hình trống.
--
-- Vì sao chặn cả bảng giá master: `canh_diem.gia_mac_dinh`, `nha_hang_set_menu
-- .gia`... là giá NCC niêm yết. Biết giá niêm yết + lịch trình là dựng lại được
-- giá vốn, nên ẩn ở UI thôi thì không đủ.
--
-- Rollback:
--   DO $$ DECLARE t text; BEGIN
--     FOREACH t IN ARRAY ARRAY['doan','doan_ngay','doan_ngay_item', ...] LOOP
--       EXECUTE format('DROP POLICY IF EXISTS che_gia_von_block_select ON public.%I', t);
--     END LOOP; END $$;
--   DROP FUNCTION IF EXISTS public.get_doan_agent_view();
--   DROP FUNCTION IF EXISTS public.get_lich_trinh_agent_view(bigint);
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1) Chặn đọc nốt
-- ---------------------------------------------------------------------------
DO $mig$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    -- Dữ liệu đoàn (giá vốn nằm rải trong đây)
    'doan', 'doan_ngay', 'doan_ngay_item',
    'doan_booking_ks', 'doan_booking_nh', 'doan_booking_dv', 'doan_khach_le',
    -- Bảng giá / điều khoản thương mại của NCC
    'canh_diem', 'nha_hang', 'nha_hang_set_menu', 'khach_san_gia_phong',
    'nha_xe_loai_xe', 'loai_visa', 'bang_gia_dich_vu', 'nha_cung_cap',
    -- Template lịch trình (mang đơn giá)
    'seri_tour', 'seri_tour_ngay', 'seri_tour_ngay_item',
    -- Báo giá + voucher
    'bao_gia', 'bao_gia_match_alias', 'voucher', 'voucher_su_dung'
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
-- 2) RPC: danh sách đoàn cho bản agent
--    Chỉ đoàn của agent ĐÃ cấu hình hệ số — agent chưa cấu hình thì không phát,
--    tránh lỡ tay để lọt đoàn của agent khác.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_doan_agent_view()
RETURNS TABLE (
  id         bigint,
  ten_doan   text,
  ngay_di    date,
  ngay_ve    date,
  so_khach   integer,
  trang_thai text,
  agent_ten  text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT d.id, d.ten_doan::text, d.ngay_di, d.ngay_ve, d.so_khach::integer,
         d.trang_thai::text, a.ten::text
  FROM public.doan d
  JOIN public.agent_he_so hs ON hs.agent_id = d.agent_id AND hs.he_so > 1.0
  LEFT JOIN public.agents a ON a.id = d.agent_id
  WHERE auth.uid() IS NOT NULL
    AND (
      (SELECT public.current_user_cross_vp())
      OR COALESCE(d.van_phong_id = ANY(public.current_user_vp_scope()), false)
    )
  ORDER BY d.ngay_di DESC NULLS LAST, d.id DESC;
$function$;

GRANT EXECUTE ON FUNCTION public.get_doan_agent_view() TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3) RPC: lịch trình cho bản agent — KHÔNG kèm bất kỳ giá nào
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_lich_trinh_agent_view(p_doan_id bigint)
RETURNS TABLE (
  ngay_so    integer,
  ngay_date  date,
  thu        text,
  thanh_pho  text,
  khach_san  text,
  an_trua    text,
  an_toi     text,
  canh_diem  text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_vp    bigint;
  v_he_so numeric;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Chưa đăng nhập';
  END IF;

  SELECT d.van_phong_id, COALESCE(hs.he_so, 1.0)
    INTO v_vp, v_he_so
  FROM public.doan d
  LEFT JOIN public.agent_he_so hs ON hs.agent_id = d.agent_id
  WHERE d.id = p_doan_id;

  IF NOT FOUND THEN RETURN; END IF;

  IF NOT current_user_cross_vp()
     AND COALESCE(v_vp = ANY(current_user_vp_scope()), false) = false THEN
    RETURN;
  END IF;

  IF is_tk_che_gia_von() AND v_he_so <= 1.0 THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    dn.ngay_so::integer,
    dn.ngay_date,
    dn.thu::text,
    dn.thanh_pho::text,
    ks.ten::text,
    nh_t.ten::text,
    nh_o.ten::text,
    (
      SELECT string_agg(cd.ten, ', ' ORDER BY it.thu_tu, it.id)
      FROM public.doan_ngay_item it
      JOIN public.canh_diem cd ON cd.id = it.canh_diem_id
      WHERE it.doan_ngay_id = dn.id
    )::text
  FROM public.doan_ngay dn
  LEFT JOIN public.khach_san ks   ON ks.id   = dn.khach_san_id
  LEFT JOIN public.nha_hang  nh_t ON nh_t.id = dn.an_trua_nha_hang_id
  LEFT JOIN public.nha_hang  nh_o ON nh_o.id = dn.an_toi_nha_hang_id
  WHERE dn.doan_id = p_doan_id
  ORDER BY dn.ngay_so;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.get_lich_trinh_agent_view(bigint) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4) Kiểm chứng
-- ---------------------------------------------------------------------------
DO $mig$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM pg_policy WHERE polname = 'che_gia_von_block_select';
  IF n <> 29 THEN
    RAISE EXCEPTION 'Số bảng chặn đọc không khớp: mong 29 (7 cũ + 22 mới), có %', n;
  END IF;
  RAISE NOTICE 'che_gia_von: % bảng chặn đọc', n;
END $mig$;
