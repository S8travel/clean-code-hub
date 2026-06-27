-- ============================================================================
-- RLS InitPlan PERF SWEEP — quét nốt auth_rls_initplan toàn DB (2026-06-27)
-- ----------------------------------------------------------------------------
-- Tiếp theo 20260627_rls_initplan_perf (đã fix 6 bảng nóng). File này bọc nốt
-- MỌI policy còn lại gọi auth.* per-row → (select ...) (InitPlan, 1 lần/query).
-- Advisor performance báo 65 auth_rls_initplan; bản này dọn các bảng còn lại.
--
-- AN TOÀN — KHÔNG đổi semantics (quyền truy cập y nguyên):
--   `auth.uid() IS NOT NULL`  ⇔  `(select auth.uid()) IS NOT NULL`  (cùng boolean)
--   `id = auth.uid()`         ⇔  `id = (select auth.uid())`
--   (select ...) chỉ ép Postgres eval hàm STABLE 1 lần/query thay vì mỗi dòng.
-- Chỉ DROP/CREATE POLICY (idempotent qua tên). KHÔNG mutate dữ liệu, KHÔNG đụng
-- unindexed-FK / multiple-permissive (best-practice riêng, để PR khác cân nhắc).
-- ============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. 42 bảng có policy auth_required = (auth.uid() IS NOT NULL), cmd ALL, TO public
--    → bọc (select auth.uid()). Pattern giống hệt nhau nên loop.
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'activity_log','agents','bang_gia_dich_vu','bao_gia','canh_diem','cong_viec',
    'cong_viec_comment','dia_diem','doan_booking_visa','doan_booking_xe','doan_invoice',
    'doan_log','doan_permissions','don_vi_visa','huong_dan_vien','khach_hang','khach_san',
    'lead','lead_activity','lead_campaign','lead_diem_den','lead_task','loai_visa',
    'lock_phong','lock_phong_ks','nha_cung_cap','nha_hang','nha_hang_set_menu',
    'nha_hang_set_menu_mon','nha_xe','nha_xe_loai_xe','role_permissions','seri_tour',
    'seri_tour_ngay','seri_tour_ngay_item','team_agents','team_task_assignments','teams',
    'thong_bao','trang_thai','user_permissions','van_phong'
  ]
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS auth_required ON public.%I;', t);
    EXECUTE format($f$
      CREATE POLICY auth_required ON public.%1$I
        FOR ALL TO public
        USING ((select auth.uid()) IS NOT NULL)
        WITH CHECK ((select auth.uid()) IS NOT NULL);
    $f$, t);
  END LOOP;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. doan_khach_le.van_phong_scope (bảng mới — còn dạng chưa bọc + can_access_van_phong)
--    Đổi sang dạng InitPlan giống các bảng con khác (tương đương semantics).
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS van_phong_scope ON public.doan_khach_le;
CREATE POLICY van_phong_scope ON public.doan_khach_le FOR ALL TO public
  USING ((select auth.uid()) IS NOT NULL AND ((select public.current_user_cross_vp())
    OR EXISTS (SELECT 1 FROM public.doan d WHERE d.id = doan_khach_le.doan_id
               AND d.van_phong_id IN (SELECT unnest(public.current_user_vp_scope())))))
  WITH CHECK ((select auth.uid()) IS NOT NULL AND ((select public.current_user_cross_vp())
    OR EXISTS (SELECT 1 FROM public.doan d WHERE d.id = doan_khach_le.doan_id
               AND d.van_phong_id IN (SELECT unnest(public.current_user_vp_scope())))));

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Policy đặc thù dùng auth.uid()/auth.jwt() per-row → bọc (select ...)
-- ─────────────────────────────────────────────────────────────────────────────

-- profiles (3 policy own)
DROP POLICY IF EXISTS "profiles insert own" ON public.profiles;
CREATE POLICY "profiles insert own" ON public.profiles FOR INSERT TO public
  WITH CHECK (id = (select auth.uid()));
DROP POLICY IF EXISTS "profiles select own" ON public.profiles;
CREATE POLICY "profiles select own" ON public.profiles FOR SELECT TO public
  USING (id = (select auth.uid()));
DROP POLICY IF EXISTS "profiles update own" ON public.profiles;
CREATE POLICY "profiles update own" ON public.profiles FOR UPDATE TO public
  USING (id = (select auth.uid())) WITH CHECK (id = (select auth.uid()));

-- push_subscriptions (own, TO authenticated)
DROP POLICY IF EXISTS own_push_subscriptions ON public.push_subscriptions;
CREATE POLICY own_push_subscriptions ON public.push_subscriptions FOR ALL TO authenticated
  USING ((select auth.uid()) = user_id) WITH CHECK ((select auth.uid()) = user_id);

-- user_roles (self_select + team_select; admin_* dùng is_admin() — không phải auth.*, giữ nguyên)
DROP POLICY IF EXISTS self_select ON public.user_roles;
CREATE POLICY self_select ON public.user_roles FOR SELECT TO public
  USING (user_id = (select auth.uid()));
DROP POLICY IF EXISTS team_select ON public.user_roles;
CREATE POLICY team_select ON public.user_roles FOR SELECT TO public
  USING ((select auth.uid()) IS NOT NULL);

-- web_favorites (own)
DROP POLICY IF EXISTS "favorites manage own" ON public.web_favorites;
CREATE POLICY "favorites manage own" ON public.web_favorites FOR ALL TO public
  USING (user_id = (select auth.uid())) WITH CHECK (user_id = (select auth.uid()));

-- web_bookings (owner read qua auth.jwt()->>'email')
DROP POLICY IF EXISTS "bookings owner read" ON public.web_bookings;
CREATE POLICY "bookings owner read" ON public.web_bookings FOR SELECT TO public
  USING (customer_email = ((select auth.jwt()) ->> 'email'::text));
