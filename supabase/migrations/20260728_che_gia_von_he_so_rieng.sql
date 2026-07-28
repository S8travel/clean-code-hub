-- ============================================================================
-- SỬA THIẾT KẾ: hệ số hiển thị phải NẰM NGOÀI tầm đọc của tài khoản che giá vốn
-- (2026-07-28, vá 20260728_che_gia_von_agent_view.sql cùng ngày)
-- ----------------------------------------------------------------------------
-- Lỗi của bản trước: hệ số để ở cột `agents.he_so_hien_thi`, mà bảng `agents`
-- thì mọi tài khoản đăng nhập đều đọc được (RLS không lọc theo cột). Đại diện
-- agent chỉ cần đọc thấy 1.2 là chia ngược ra giá vốn thật → che giá vốn thành
-- vô nghĩa. RPC cũ cũng trả kèm cột `he_so` ra client, lộ y hệt.
--
-- Sửa:
--   • Tách sang bảng riêng `agent_he_so`, RLS chỉ cho admin/giám đốc đọc-ghi.
--     RPC là SECURITY DEFINER nên vẫn đọc được để nhân.
--   • Bỏ cột `agents.he_so_hien_thi`.
--   • RPC KHÔNG trả cột `he_so` nữa — client không cần biết, và không được biết.
--
-- Rollback:
--   DROP FUNCTION IF EXISTS public.get_chi_phi_agent_view(bigint);
--   DROP TABLE IF EXISTS public.agent_he_so;
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1) Bảng hệ số — tách riêng để chặn đọc được
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.agent_he_so (
  agent_id     bigint PRIMARY KEY REFERENCES public.agents(id) ON DELETE CASCADE,
  he_so        numeric NOT NULL DEFAULT 1.0 CHECK (he_so >= 1.0),
  ghi_chu      text,
  cap_nhat_luc timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.agent_he_so IS
  'Hệ số nhân chi phí khi phát cho tài khoản che_gia_von. Để riêng bảng vì `agents` ai cũng đọc được — biết hệ số là chia ngược ra giá vốn.';

-- anon KHÔNG được đọc (khác template mặc định): đây là dữ liệu biên lợi nhuận.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.agent_he_so TO authenticated, service_role;

ALTER TABLE public.agent_he_so ENABLE ROW LEVEL SECURITY;

-- current_user_cross_vp() = role IN (admin, giam_doc).
DROP POLICY IF EXISTS agent_he_so_admin ON public.agent_he_so;
CREATE POLICY agent_he_so_admin ON public.agent_he_so
  FOR ALL TO authenticated
  USING ((SELECT public.current_user_cross_vp()))
  WITH CHECK ((SELECT public.current_user_cross_vp()));

-- Bảng mới → phải tự thêm khóa ghi cho tài khoản chỉ xem (xem CLAUDE.md,
-- migration 20260728_tai_khoan_chi_xem là sweep MỘT LẦN, không phủ bảng mới).
DROP POLICY IF EXISTS chi_xem_block_insert ON public.agent_he_so;
CREATE POLICY chi_xem_block_insert ON public.agent_he_so AS RESTRICTIVE
  FOR INSERT TO public WITH CHECK (NOT (SELECT public.is_tk_chi_xem()));
DROP POLICY IF EXISTS chi_xem_block_update ON public.agent_he_so;
CREATE POLICY chi_xem_block_update ON public.agent_he_so AS RESTRICTIVE
  FOR UPDATE TO public USING (NOT (SELECT public.is_tk_chi_xem()));
DROP POLICY IF EXISTS chi_xem_block_delete ON public.agent_he_so;
CREATE POLICY chi_xem_block_delete ON public.agent_he_so AS RESTRICTIVE
  FOR DELETE TO public USING (NOT (SELECT public.is_tk_chi_xem()));

-- ---------------------------------------------------------------------------
-- 2) Chuyển dữ liệu rồi bỏ cột cũ trên agents
-- ---------------------------------------------------------------------------
INSERT INTO public.agent_he_so (agent_id, he_so)
SELECT a.id, a.he_so_hien_thi FROM public.agents a WHERE a.he_so_hien_thi > 1.0
ON CONFLICT (agent_id) DO NOTHING;

ALTER TABLE public.agents DROP COLUMN IF EXISTS he_so_hien_thi;

-- ---------------------------------------------------------------------------
-- 3) RPC — bỏ cột he_so khỏi kết quả
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.get_chi_phi_agent_view(bigint);

CREATE FUNCTION public.get_chi_phi_agent_view(p_doan_id bigint)
RETURNS TABLE (
  danh_muc    text,
  mo_ta       text,
  ngay_so     integer,
  so_luong    numeric,
  don_gia     numeric,
  thanh_tien  numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_he_so numeric;
  v_vp    bigint;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Chưa đăng nhập';
  END IF;

  SELECT d.van_phong_id, COALESCE(hs.he_so, 1.0)
    INTO v_vp, v_he_so
  FROM public.doan d
  LEFT JOIN public.agent_he_so hs ON hs.agent_id = d.agent_id
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
    -- Nhân trên số THỰC TẾ (thanh_tien_thuc_te nếu đã điều chỉnh sau thanh toán),
    -- khớp cách useChiPhiSummaryMap tính tổng chi phí đoàn.
    round(COALESCE(cp.thanh_tien_thuc_te, cp.tien_cong_ty + cp.tien_hdv) * v_he_so)::numeric
  FROM public.doan_chi_phi cp
  WHERE cp.doan_id = p_doan_id
    AND COALESCE(cp.is_excluded, false) = false
    AND COALESCE(cp.trang_thai_dntt, '') NOT IN ('cong_no', 'hoan_tien')
  ORDER BY cp.danh_muc, cp.ngay_so NULLS LAST, cp.id;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.get_chi_phi_agent_view(bigint) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4) Resource `chi_phi_agent` vào ma trận quyền (trang "Chi phí (bản agent)")
-- ---------------------------------------------------------------------------
INSERT INTO public.role_permissions (role, resource, can_view, can_create, can_edit, can_delete)
SELECT r, 'chi_phi_agent', true, false, false, false
FROM unnest(ARRAY['admin','giam_doc','truong_phong']) AS r
ON CONFLICT (role, resource) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 5) Kiểm chứng
-- ---------------------------------------------------------------------------
DO $mig$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'agents' AND column_name = 'he_so_hien_thi';
  IF n <> 0 THEN
    RAISE EXCEPTION 'Cột he_so_hien_thi vẫn còn trên agents — hệ số vẫn đọc được';
  END IF;

  SELECT count(*) INTO n FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
  WHERE ns.nspname = 'public' AND p.proname = 'get_chi_phi_agent_view'
    AND pg_get_functiondef(p.oid) LIKE '%he_so%numeric%';
  RAISE NOTICE 'che_gia_von he so rieng OK';
END $mig$;
