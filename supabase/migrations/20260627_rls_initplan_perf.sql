-- ============================================================================
-- RLS InitPlan PERF FIX — bọc auth/helper trong (select ...) (2026-06-27)
-- ----------------------------------------------------------------------------
-- TRIỆU CHỨNG: hàng loạt "canceling statement due to statement timeout" (trần 8s
-- role authenticated). pg_stat_statements: dntt_allocations+embed chi_phi ~6.5h,
-- dntt_with_payment_status ~5.5h, doan list ~43ph. Bảng đều nhỏ (doan 441,
-- chi_phi 8493, dntt_allocations 2693) → KHÔNG phải thiếu index.
--
-- GỐC (đo bằng EXPLAIN ANALYZE, user thường non cross-VP):
--   SELECT * FROM dntt_allocations  →  5389 ms cho 2695 dòng.
--   Policy van_phong_scope (mig 20260609) gọi THẲNG auth.uid(),
--   current_user_cross_vp(), current_user_is_accounting(), can_access_van_phong()
--   KHÔNG bọc (select ...). Dù STABLE, Postgres re-eval PER ROW (lỗi
--   auth_rls_initplan — advisor báo 65 bảng). RLS lồng nhau qua doan_chi_phi→doan
--   khiến can_access_van_phong chạy ~8500 lần, mỗi lần query user_roles.
--
-- FIX: bọc các call KHÔNG phụ thuộc cột vào (select ...) → InitPlan (1 lần/query):
--   auth.uid() → (select auth.uid())
--   current_user_cross_vp() → (select public.current_user_cross_vp())
--   current_user_is_accounting() → (select public.current_user_is_accounting())
--   can_access_van_phong(d.van_phong_id) [nhận cột → KHÔNG InitPlan được] thay bằng
--     d.van_phong_id IN (SELECT unnest(public.current_user_vp_scope()))
--     → uncorrelated set, Postgres hash 1 lần. Tương đương semantics:
--       cross_vp đã ở nhánh OR ngoài; target=ANY(scope) ⇔ target IN unnest(scope);
--       target NULL → NULL IN (...) = false ⇔ can_access_van_phong(NULL)=cross_vp.
--
-- KẾT QUẢ ĐO (cùng query, cùng user, transaction thử + ROLLBACK):
--   dntt_allocations: 5389 ms → 15.7 ms  (~340x).
--
-- KHÔNG đổi quyền truy cập (ai thấy gì giữ nguyên) — chỉ đổi cách Postgres eval.
-- KHÔNG mutate dữ liệu hàng. Chỉ DROP/CREATE POLICY (idempotent qua tên policy).
-- ============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. doan (van_phong_id trực tiếp)
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS van_phong_scope ON public.doan;
CREATE POLICY van_phong_scope ON public.doan
  FOR ALL TO public
  USING (
    (select auth.uid()) IS NOT NULL AND (
      (select public.current_user_cross_vp())
      OR van_phong_id IN (SELECT unnest(public.current_user_vp_scope()))
    )
  )
  WITH CHECK (
    (select auth.uid()) IS NOT NULL AND (
      (select public.current_user_cross_vp())
      OR van_phong_id IN (SELECT unnest(public.current_user_vp_scope()))
    )
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. 7 bảng con có doan_id NOT NULL → resolve qua doan.van_phong_id
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'doan_ngay','doan_ngay_item','doan_chi_phi',
    'doan_booking_ks','doan_booking_nh','doan_booking_dv','doan_ks_dem'
  ]
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS van_phong_scope ON public.%I;', t);
    EXECUTE format($f$
      CREATE POLICY van_phong_scope ON public.%1$I
        FOR ALL TO public
        USING (
          (select auth.uid()) IS NOT NULL AND (
            (select public.current_user_cross_vp())
            OR EXISTS (SELECT 1 FROM public.doan d
                       WHERE d.id = %1$I.doan_id
                         AND d.van_phong_id IN (SELECT unnest(public.current_user_vp_scope())))
          )
        )
        WITH CHECK (
          (select auth.uid()) IS NOT NULL AND (
            (select public.current_user_cross_vp())
            OR EXISTS (SELECT 1 FROM public.doan d
                       WHERE d.id = %1$I.doan_id
                         AND d.van_phong_id IN (SELECT unnest(public.current_user_vp_scope())))
          )
        );
    $f$, t);
  END LOOP;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. de_nghi_thanh_toan + cong_no (doan_id CÓ THỂ NULL = định kỳ/gộp)
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['de_nghi_thanh_toan','cong_no']
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS van_phong_scope ON public.%I;', t);
    EXECUTE format($f$
      CREATE POLICY van_phong_scope ON public.%1$I
        FOR ALL TO public
        USING (
          (select auth.uid()) IS NOT NULL AND (
            (select public.current_user_cross_vp())
            OR (%1$I.doan_id IS NULL AND (select public.current_user_is_accounting()))
            OR EXISTS (SELECT 1 FROM public.doan d
                       WHERE d.id = %1$I.doan_id
                         AND d.van_phong_id IN (SELECT unnest(public.current_user_vp_scope())))
          )
        )
        WITH CHECK (
          (select auth.uid()) IS NOT NULL AND (
            (select public.current_user_cross_vp())
            OR (%1$I.doan_id IS NULL AND (select public.current_user_is_accounting()))
            OR EXISTS (SELECT 1 FROM public.doan d
                       WHERE d.id = %1$I.doan_id
                         AND d.van_phong_id IN (SELECT unnest(public.current_user_vp_scope())))
          )
        );
    $f$, t);
  END LOOP;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. payments (qua dntt_id → de_nghi_thanh_toan; dntt.doan_id có thể NULL)
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS van_phong_scope ON public.payments;
CREATE POLICY van_phong_scope ON public.payments
  FOR ALL TO public
  USING (
    (select auth.uid()) IS NOT NULL AND (
      (select public.current_user_cross_vp())
      OR EXISTS (
        SELECT 1 FROM public.de_nghi_thanh_toan dn
        WHERE dn.id = payments.dntt_id AND (
          (dn.doan_id IS NULL AND (select public.current_user_is_accounting()))
          OR EXISTS (SELECT 1 FROM public.doan d
                     WHERE d.id = dn.doan_id
                       AND d.van_phong_id IN (SELECT unnest(public.current_user_vp_scope())))
        )
      )
    )
  )
  WITH CHECK (
    (select auth.uid()) IS NOT NULL AND (
      (select public.current_user_cross_vp())
      OR EXISTS (
        SELECT 1 FROM public.de_nghi_thanh_toan dn
        WHERE dn.id = payments.dntt_id AND (
          (dn.doan_id IS NULL AND (select public.current_user_is_accounting()))
          OR EXISTS (SELECT 1 FROM public.doan d
                     WHERE d.id = dn.doan_id
                       AND d.van_phong_id IN (SELECT unnest(public.current_user_vp_scope())))
        )
      )
    )
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. dntt_allocations (qua chi_phi_id → doan_chi_phi.doan_id NOT NULL → doan)
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS van_phong_scope ON public.dntt_allocations;
CREATE POLICY van_phong_scope ON public.dntt_allocations
  FOR ALL TO public
  USING (
    (select auth.uid()) IS NOT NULL AND (
      (select public.current_user_cross_vp())
      OR EXISTS (
        SELECT 1 FROM public.doan_chi_phi cp
        JOIN public.doan d ON d.id = cp.doan_id
        WHERE cp.id = dntt_allocations.chi_phi_id
          AND d.van_phong_id IN (SELECT unnest(public.current_user_vp_scope()))
      )
    )
  )
  WITH CHECK (
    (select auth.uid()) IS NOT NULL AND (
      (select public.current_user_cross_vp())
      OR EXISTS (
        SELECT 1 FROM public.doan_chi_phi cp
        JOIN public.doan d ON d.id = cp.doan_id
        WHERE cp.id = dntt_allocations.chi_phi_id
          AND d.van_phong_id IN (SELECT unnest(public.current_user_vp_scope()))
      )
    )
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. hoan_ung policies (cùng bảng nóng) — bọc auth.uid() để hết initplan warning
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS hoan_ung_owner ON public.de_nghi_thanh_toan;
CREATE POLICY hoan_ung_owner ON public.de_nghi_thanh_toan
  FOR ALL TO public
  USING (
    (select auth.uid()) IS NOT NULL AND doan_id IS NULL AND loai = 'hoan_ung'
    AND (tao_boi = (select auth.uid()) OR nguoi_ung_id = (select auth.uid()))
  )
  WITH CHECK (
    (select auth.uid()) IS NOT NULL AND doan_id IS NULL AND loai = 'hoan_ung'
    AND (tao_boi = (select auth.uid()) OR nguoi_ung_id = (select auth.uid()))
  );

DROP POLICY IF EXISTS hoan_ung_owner_select ON public.payments;
CREATE POLICY hoan_ung_owner_select ON public.payments
  FOR SELECT TO public
  USING (
    (select auth.uid()) IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.de_nghi_thanh_toan dn
      WHERE dn.id = payments.dntt_id AND dn.doan_id IS NULL AND dn.loai = 'hoan_ung'
        AND (dn.tao_boi = (select auth.uid()) OR dn.nguoi_ung_id = (select auth.uid()))
    )
  );
