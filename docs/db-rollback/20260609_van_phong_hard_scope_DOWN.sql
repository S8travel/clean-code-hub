-- ============================================================================
-- ROLLBACK cho 20260609_van_phong_hard_scope.sql
-- ----------------------------------------------------------------------------
-- KHÔNG để file này trong supabase/migrations/ (sẽ bị apply như migration xuôi).
-- Chạy THỦ CÔNG khi cần khôi phục: MCP apply_migration HOẶC psql.
-- An toàn idempotent: DROP POLICY IF EXISTS + CREATE.
-- ============================================================================

-- 1. Khôi phục policy auth_required (auth.uid() IS NOT NULL) cho 12 bảng.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'doan','doan_ngay','doan_ngay_item','doan_chi_phi',
    'doan_booking_ks','doan_booking_nh','doan_booking_dv','doan_ks_dem',
    'de_nghi_thanh_toan','dntt_allocations','payments','cong_no'
  ]
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS van_phong_scope ON public.%I;', t);
    EXECUTE format('DROP POLICY IF EXISTS auth_required ON public.%I;', t);
    EXECUTE format($f$
      CREATE POLICY auth_required ON public.%I
        FOR ALL TO public
        USING (auth.uid() IS NOT NULL)
        WITH CHECK (auth.uid() IS NOT NULL);
    $f$, t);
  END LOOP;
END $$;

-- 2. Drop helper functions.
DROP FUNCTION IF EXISTS public.can_access_van_phong(int);
DROP FUNCTION IF EXISTS public.current_user_vp_scope();
DROP FUNCTION IF EXISTS public.current_user_is_accounting();
DROP FUNCTION IF EXISTS public.current_user_cross_vp();

-- 3. Drop cột scope đa-VP (data không bị mất — cột mới, nullable).
ALTER TABLE public.user_roles DROP COLUMN IF EXISTS van_phong_ids;

-- 4. (TÙY CHỌN) Backfill VP nhà ở migration UP để LẠI — vô hại khi RLS về auth-only.
--    8 user dưới đây vốn van_phong_id=NULL trước migration; bỏ comment nếu muốn revert sạch:
-- UPDATE public.user_roles SET van_phong_id = NULL WHERE lower(email) IN (
--   's8travel.xetour@gmail.com','nn135354466@gmail.com','test@gmail.com',
--   'tiendungnguyen1988dn@gmail.com','s8travelhuy.nq@gmail.com','s8tonghopdulieu@gmail.com',
--   's8travel.thucnhi@gmail.com','s8travel.huyen@gmail.com'
-- );
