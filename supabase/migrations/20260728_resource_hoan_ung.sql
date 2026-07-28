-- ============================================================================
-- RESOURCE `hoan_ung` — đưa "Chi phí văn phòng" vào ma trận quyền (2026-07-28)
-- ----------------------------------------------------------------------------
-- Bối cảnh: menu "Chi phí văn phòng" (/hoan-ung) là mục DUY NHẤT trong sidebar
-- không gắn `resource` → mọi tài khoản đều thấy, không cách nào ẩn với một
-- người cụ thể. RLS `hoan_ung_owner` (20260611) lại cho MỌI user đăng nhập tự
-- tạo/xem đơn hoàn ứng của chính mình.
--
-- Quyết định: thêm resource `hoan_ung` vào ma trận quyền và enforce cả ở DB:
--   • Backfill can_view/create/edit/delete = true cho các role sẵn có VÀ cho
--     mọi specialist đang có quyền per-user → GIỮ NGUYÊN hành vi hiện tại,
--     không ai mất quyền. Chỉ specialist KHÔNG được cấp dòng này mới bị chặn.
--   • Policy RESTRICTIVE trên de_nghi_thanh_toan: không có quyền xem `hoan_ung`
--     thì không SELECT/INSERT được dòng loai='hoan_ung' — kể cả đơn của chính
--     mình, kể cả gọi thẳng API (ẩn menu ở app là chưa đủ).
--
-- Rollback:
--   DROP POLICY IF EXISTS hoan_ung_perm_select ON public.de_nghi_thanh_toan;
--   DROP POLICY IF EXISTS hoan_ung_perm_insert ON public.de_nghi_thanh_toan;
--   DROP FUNCTION IF EXISTS public.can_view_hoan_ung();
--   DELETE FROM public.role_permissions WHERE resource = 'hoan_ung';
--   DELETE FROM public.user_permissions WHERE resource = 'hoan_ung';
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1) Backfill ma trận role — giữ nguyên hành vi cũ (ai cũng vào được)
-- ---------------------------------------------------------------------------
INSERT INTO public.role_permissions (role, resource, can_view, can_create, can_edit, can_delete)
SELECT r, 'hoan_ung', true, true, true, true
FROM unnest(ARRAY['admin','giam_doc','truong_phong','nhan_vien_cao_cap','nhan_vien']) AS r
ON CONFLICT (role, resource) DO NOTHING;

-- Specialist dùng quyền per-user, không đọc ma trận role → cấp thẳng cho các
-- specialist ĐANG tồn tại để không ai mất quyền sẵn có.
INSERT INTO public.user_permissions (user_id, resource, can_view, can_create, can_edit, can_delete)
SELECT ur.user_id, 'hoan_ung', true, true, true, true
FROM public.user_roles ur
WHERE ur.role = 'specialist' AND ur.active
  AND EXISTS (SELECT 1 FROM public.user_permissions up WHERE up.user_id = ur.user_id)
ON CONFLICT (user_id, resource) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 2) Helper — mirror đúng logic usePermission() ở app
--    (admin bypass · specialist đọc user_permissions · còn lại đọc role matrix)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.can_view_hoan_ung()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
  WITH me AS (
    SELECT ur.role FROM public.user_roles ur
    WHERE ur.user_id = auth.uid() AND ur.active
    LIMIT 1
  )
  -- CASE tìm kiếm (không dùng `WHEN NULL`: NULL = NULL là unknown, không khớp).
  SELECT CASE
    WHEN (SELECT role FROM me) IS NULL THEN false
    WHEN (SELECT role FROM me) = 'admin' THEN true
    WHEN (SELECT role FROM me) = 'specialist' THEN COALESCE((
      SELECT up.can_view FROM public.user_permissions up
      WHERE up.user_id = auth.uid() AND up.resource = 'hoan_ung'
    ), false)
    ELSE COALESCE((
      SELECT rp.can_view FROM public.role_permissions rp
      WHERE rp.role = (SELECT role FROM me) AND rp.resource = 'hoan_ung'
    ), false)
  END;
$function$;

GRANT EXECUTE ON FUNCTION public.can_view_hoan_ung() TO authenticated, anon, service_role;

-- ---------------------------------------------------------------------------
-- 3) RLS — chặn đọc/tạo đơn hoàn ứng khi không có quyền
--    RESTRICTIVE → AND với policy sẵn có (van_phong_scope, hoan_ung_owner...),
--    KHÔNG nới quyền cho ai. Bọc (SELECT ...) cho InitPlan (perf).
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS hoan_ung_perm_select ON public.de_nghi_thanh_toan;
CREATE POLICY hoan_ung_perm_select ON public.de_nghi_thanh_toan
  AS RESTRICTIVE FOR SELECT TO public
  USING (loai IS DISTINCT FROM 'hoan_ung' OR (SELECT public.can_view_hoan_ung()));

DROP POLICY IF EXISTS hoan_ung_perm_insert ON public.de_nghi_thanh_toan;
CREATE POLICY hoan_ung_perm_insert ON public.de_nghi_thanh_toan
  AS RESTRICTIVE FOR INSERT TO public
  WITH CHECK (loai IS DISTINCT FROM 'hoan_ung' OR (SELECT public.can_view_hoan_ung()));
