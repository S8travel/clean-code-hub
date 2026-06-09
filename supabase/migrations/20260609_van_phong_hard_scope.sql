-- ============================================================================
-- VĂN PHÒNG HARD SCOPE — RLS tường cứng theo văn phòng (2026-06-09)
-- ----------------------------------------------------------------------------
-- Trước đây scope VP chỉ ở client; RLS thật = auth.uid() IS NOT NULL (ai login
-- cũng thấy hết). Migration này enforce ở DB:
--   • Cross-VP (bypass mọi VP): CHỈ admin | giam_doc.
--   • Kế toán (bo_phan='ke_toan') KHÔNG bypass — bị scope theo VP như điều hành.
--     Muốn xem nhiều VP → admin tích user_roles.van_phong_ids (mảng).
--   • Scope đa-VP: van_phong_ids ∪ {van_phong_id} (VP nhà).
--   • Đoàn van_phong_id NULL → chỉ cross-VP thấy.
--   • Bản ghi định kỳ/aggregate (doan_id NULL: ĐNTT định kỳ, công nợ gộp) → cross-VP
--     + KẾ TOÁN thấy (định kỳ gộp nhiều VP, không quy về 1 VP được).
-- Rollback: docs/db-rollback/20260609_van_phong_hard_scope_DOWN.sql
-- Snapshot trước khi apply: docs/db-rollback/20260609_van_phong_hard_scope_PRE_STATE.md
-- KHÔNG mutate dữ liệu hàng (trừ backfill VP nhà ở mục 1b — idempotent, WHERE NULL).
-- ============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 1a. Cột scope đa-VP (ALTER → không cần GRANT lại)
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.user_roles
  ADD COLUMN IF NOT EXISTS van_phong_ids integer[] NULL;

COMMENT ON COLUMN public.user_roles.van_phong_ids IS
  'Các VP user được TRUY CẬP (đọc+ghi trong scope; xem/sửa tùy ACTION layer). '
  'NULL/rỗng → chỉ van_phong_id (VP nhà). Chỉ admin/giam_doc bypass toàn bộ.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 1b. Backfill VP nhà cho user đang NULL (tránh khoá nhầm khi bật tường cứng).
--     Idempotent: chỉ set khi đang NULL. (1=Quảng Ninh, 2=Hà Nội, 3=Đà Nẵng)
-- ─────────────────────────────────────────────────────────────────────────────
UPDATE public.user_roles SET van_phong_id = 2  -- Hà Nội
WHERE van_phong_id IS NULL AND lower(email) IN (
  's8travel.xetour@gmail.com',      -- Xe Tour
  'nn135354466@gmail.com',          -- Nghĩa Nguyễn (admin)
  'test@gmail.com',                 -- Test
  'tiendungnguyen1988dn@gmail.com', -- Nguyễn Tiến Dũng (giám đốc)
  's8travelhuy.nq@gmail.com',       -- Nguyễn Quang Huy (kế toán)
  's8tonghopdulieu@gmail.com',      -- Nguyễn Chí Linh (TP kế toán)
  's8travel.huyen@gmail.com'        -- Đỗ Xuân Huyên (kế toán)
);
UPDATE public.user_roles SET van_phong_id = 3  -- Đà Nẵng
WHERE van_phong_id IS NULL AND lower(email) IN (
  's8travel.thucnhi@gmail.com'      -- Đỗ Phan Thục Nhi (kế toán)
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 1c. Seed quyền xem chéo: Hà Nội (2) ↔ Đà Nẵng (3) thấy nhau. Quảng Ninh (1) tách
--     riêng (không có user active). Guard `van_phong_ids IS NULL` → idempotent,
--     KHÔNG đè chỉnh tay sau này. Admin tinh chỉnh từng user qua trang Người dùng.
-- ─────────────────────────────────────────────────────────────────────────────
UPDATE public.user_roles SET van_phong_ids = ARRAY[3]  -- HN → xem thêm ĐN
WHERE active AND van_phong_id = 2 AND van_phong_ids IS NULL;
UPDATE public.user_roles SET van_phong_ids = ARRAY[2]  -- ĐN → xem thêm HN
WHERE active AND van_phong_id = 3 AND van_phong_ids IS NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Helper functions (SECURITY DEFINER — bypass RLS user_roles để user tự
--    resolve scope của chính mình; theo pattern is_admin/get_user_role sẵn có)
-- ─────────────────────────────────────────────────────────────────────────────

-- 2a. Cross-VP = bypass mọi văn phòng. CHỈ admin/giam_doc (kế toán KHÔNG còn).
CREATE OR REPLACE FUNCTION public.current_user_cross_vp()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid() AND ur.active
      AND ur.role IN ('admin','giam_doc')
  );
$$;

-- 2b. Là kế toán? Dùng cho bản ghi định kỳ/aggregate (doan_id NULL) — kế toán
--     vẫn thấy dù bị scope VP cho các bản ghi đoàn cụ thể.
CREATE OR REPLACE FUNCTION public.current_user_is_accounting()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid() AND ur.active
      AND ur.bo_phan = 'ke_toan'
  );
$$;

-- 2c. Tập VP user được truy cập = van_phong_ids ∪ {van_phong_id}.
--     COALESCE 2 vế vì `NULL || mảng` = NULL. Rỗng → không thấy đoàn nào.
CREATE OR REPLACE FUNCTION public.current_user_vp_scope()
RETURNS integer[]
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT COALESCE(ur.van_phong_ids, '{}'::integer[])
       || COALESCE(ARRAY[ur.van_phong_id], '{}'::integer[])
  FROM public.user_roles ur
  WHERE ur.user_id = auth.uid() AND ur.active
  LIMIT 1;
$$;

-- 2d. Truy cập được 1 VP cụ thể (target = doan.van_phong_id)?
--     target NULL → chỉ cross-VP (đoàn chưa gán VP = privileged-only).
CREATE OR REPLACE FUNCTION public.can_access_van_phong(target integer)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT public.current_user_cross_vp()
      OR (target IS NOT NULL AND target = ANY(public.current_user_vp_scope()));
$$;

GRANT EXECUTE ON FUNCTION public.current_user_cross_vp()       TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.current_user_is_accounting()  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.current_user_vp_scope()       TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_access_van_phong(integer) TO authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Policy: bảng `doan` (van_phong_id trực tiếp)
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS auth_required    ON public.doan;
DROP POLICY IF EXISTS van_phong_scope  ON public.doan;
CREATE POLICY van_phong_scope ON public.doan
  FOR ALL TO public
  USING      (auth.uid() IS NOT NULL AND public.can_access_van_phong(van_phong_id))
  WITH CHECK (auth.uid() IS NOT NULL AND public.can_access_van_phong(van_phong_id));

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Policy: 7 bảng con có `doan_id` NOT NULL → resolve qua doan.van_phong_id.
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'doan_ngay','doan_ngay_item','doan_chi_phi',
    'doan_booking_ks','doan_booking_nh','doan_booking_dv','doan_ks_dem'
  ]
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS auth_required   ON public.%I;', t);
    EXECUTE format('DROP POLICY IF EXISTS van_phong_scope ON public.%I;', t);
    EXECUTE format($f$
      CREATE POLICY van_phong_scope ON public.%1$I
        FOR ALL TO public
        USING (
          auth.uid() IS NOT NULL AND (
            public.current_user_cross_vp()
            OR EXISTS (SELECT 1 FROM public.doan d
                       WHERE d.id = %1$I.doan_id
                         AND public.can_access_van_phong(d.van_phong_id))
          )
        )
        WITH CHECK (
          auth.uid() IS NOT NULL AND (
            public.current_user_cross_vp()
            OR EXISTS (SELECT 1 FROM public.doan d
                       WHERE d.id = %1$I.doan_id
                         AND public.can_access_van_phong(d.van_phong_id))
          )
        );
    $f$, t);
  END LOOP;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Policy: de_nghi_thanh_toan + cong_no (doan_id CÓ THỂ NULL = định kỳ/gộp).
--    NULL → cross-VP + kế toán thấy; có doan_id → scope theo VP của đoàn.
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['de_nghi_thanh_toan','cong_no']
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS auth_required   ON public.%I;', t);
    EXECUTE format('DROP POLICY IF EXISTS van_phong_scope ON public.%I;', t);
    EXECUTE format($f$
      CREATE POLICY van_phong_scope ON public.%1$I
        FOR ALL TO public
        USING (
          auth.uid() IS NOT NULL AND (
            public.current_user_cross_vp()
            OR (%1$I.doan_id IS NULL AND public.current_user_is_accounting())
            OR EXISTS (SELECT 1 FROM public.doan d
                       WHERE d.id = %1$I.doan_id
                         AND public.can_access_van_phong(d.van_phong_id))
          )
        )
        WITH CHECK (
          auth.uid() IS NOT NULL AND (
            public.current_user_cross_vp()
            OR (%1$I.doan_id IS NULL AND public.current_user_is_accounting())
            OR EXISTS (SELECT 1 FROM public.doan d
                       WHERE d.id = %1$I.doan_id
                         AND public.can_access_van_phong(d.van_phong_id))
          )
        );
    $f$, t);
  END LOOP;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. Policy: payments (qua dntt_id → de_nghi_thanh_toan; dntt.doan_id có thể NULL)
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS auth_required    ON public.payments;
DROP POLICY IF EXISTS van_phong_scope  ON public.payments;
CREATE POLICY van_phong_scope ON public.payments
  FOR ALL TO public
  USING (
    auth.uid() IS NOT NULL AND (
      public.current_user_cross_vp()
      OR EXISTS (
        SELECT 1 FROM public.de_nghi_thanh_toan dn
        WHERE dn.id = payments.dntt_id AND (
          (dn.doan_id IS NULL AND public.current_user_is_accounting())
          OR EXISTS (SELECT 1 FROM public.doan d
                     WHERE d.id = dn.doan_id
                       AND public.can_access_van_phong(d.van_phong_id))
        )
      )
    )
  )
  WITH CHECK (
    auth.uid() IS NOT NULL AND (
      public.current_user_cross_vp()
      OR EXISTS (
        SELECT 1 FROM public.de_nghi_thanh_toan dn
        WHERE dn.id = payments.dntt_id AND (
          (dn.doan_id IS NULL AND public.current_user_is_accounting())
          OR EXISTS (SELECT 1 FROM public.doan d
                     WHERE d.id = dn.doan_id
                       AND public.can_access_van_phong(d.van_phong_id))
        )
      )
    )
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. Policy: dntt_allocations (qua chi_phi_id → doan_chi_phi.doan_id NOT NULL → doan)
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS auth_required    ON public.dntt_allocations;
DROP POLICY IF EXISTS van_phong_scope  ON public.dntt_allocations;
CREATE POLICY van_phong_scope ON public.dntt_allocations
  FOR ALL TO public
  USING (
    auth.uid() IS NOT NULL AND (
      public.current_user_cross_vp()
      OR EXISTS (
        SELECT 1 FROM public.doan_chi_phi cp
        JOIN public.doan d ON d.id = cp.doan_id
        WHERE cp.id = dntt_allocations.chi_phi_id
          AND public.can_access_van_phong(d.van_phong_id)
      )
    )
  )
  WITH CHECK (
    auth.uid() IS NOT NULL AND (
      public.current_user_cross_vp()
      OR EXISTS (
        SELECT 1 FROM public.doan_chi_phi cp
        JOIN public.doan d ON d.id = cp.doan_id
        WHERE cp.id = dntt_allocations.chi_phi_id
          AND public.can_access_van_phong(d.van_phong_id)
      )
    )
  );
