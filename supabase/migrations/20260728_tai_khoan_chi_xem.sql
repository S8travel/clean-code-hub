-- ============================================================================
-- TÀI KHOẢN CHỈ XEM (read-only) — khóa ghi ở tầng DB (2026-07-28)
-- ----------------------------------------------------------------------------
-- Bối cảnh: ma trận quyền (role_permissions / user_permissions) có sẵn cột
-- can_create / can_edit / can_delete NHƯNG app gần như KHÔNG dùng — mọi trang
-- chỉ check can_view, DoanDetail còn hardcode canEdit = true. Nên cấp một tài
-- khoản "chỉ xem" bằng ma trận quyền là ẢO: user vẫn sửa/xóa được đoàn, chi phí,
-- danh mục.
--
-- Quyết định: thêm cờ CỨNG `user_roles.chi_xem` và enforce ở DB bằng RLS
-- RESTRICTIVE (AND với mọi policy permissive sẵn có) trên toàn bộ bảng public:
--   • INSERT / UPDATE / DELETE → chặn khi is_tk_chi_xem()
--   • SELECT → KHÔNG đụng (tài khoản vẫn xem bình thường)
-- Kèm guard trong các RPC SECURITY DEFINER gọi được từ client — nhóm này chạy
-- bằng quyền owner nên BYPASS RLS, là lỗ duy nhất còn lại nếu không vá.
--
-- Ngoại lệ DUY NHẤT: UPDATE trên `thong_bao` (đánh dấu đã đọc). Đây là trạng
-- thái UI của chính user, không phải dữ liệu nghiệp vụ; chặn thì chuông báo
-- không bao giờ tắt được.
--
-- Perf: mọi lời gọi helper bọc `(SELECT ...)` để Postgres cache InitPlan —
-- xem 20260627_rls_initplan_perf.sql (không bọc = re-eval mỗi dòng).
--
-- Rollback:
--   DO $$ DECLARE r record; BEGIN
--     FOR r IN SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
--              WHERE n.nspname='public' AND c.relkind='r' LOOP
--       EXECUTE format('DROP POLICY IF EXISTS chi_xem_block_insert ON public.%I', r.relname);
--       EXECUTE format('DROP POLICY IF EXISTS chi_xem_block_update ON public.%I', r.relname);
--       EXECUTE format('DROP POLICY IF EXISTS chi_xem_block_delete ON public.%I', r.relname);
--     END LOOP; END $$;
--   ALTER TABLE public.user_roles DROP COLUMN chi_xem;
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1) Cờ chỉ-xem
-- ---------------------------------------------------------------------------
ALTER TABLE public.user_roles
  ADD COLUMN IF NOT EXISTS chi_xem boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.user_roles.chi_xem IS
  'true = tài khoản chỉ xem. RLS restrictive chặn mọi INSERT/UPDATE/DELETE '
  '(ngoại lệ: UPDATE thong_bao để đánh dấu đã đọc).';

-- ---------------------------------------------------------------------------
-- 2) Helper — SECURITY DEFINER để đọc user_roles bất chấp RLS
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_tk_chi_xem()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid() AND ur.chi_xem
  );
$function$;

GRANT EXECUTE ON FUNCTION public.is_tk_chi_xem() TO authenticated, anon, service_role;

-- ---------------------------------------------------------------------------
-- 3) RLS RESTRICTIVE chặn ghi trên mọi bảng public đang bật RLS
--    (restrictive = AND với policy permissive sẵn có → không nới quyền ai)
-- ---------------------------------------------------------------------------
DO $mig$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT c.relname
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relrowsecurity
    ORDER BY c.relname
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS chi_xem_block_insert ON public.%I', r.relname);
    EXECUTE format('DROP POLICY IF EXISTS chi_xem_block_update ON public.%I', r.relname);
    EXECUTE format('DROP POLICY IF EXISTS chi_xem_block_delete ON public.%I', r.relname);

    EXECUTE format(
      'CREATE POLICY chi_xem_block_insert ON public.%I AS RESTRICTIVE '
      'FOR INSERT TO public WITH CHECK (NOT (SELECT public.is_tk_chi_xem()))',
      r.relname);

    -- thong_bao: chừa UPDATE để user chỉ-xem vẫn tắt được chuông báo của mình.
    IF r.relname <> 'thong_bao' THEN
      EXECUTE format(
        'CREATE POLICY chi_xem_block_update ON public.%I AS RESTRICTIVE '
        'FOR UPDATE TO public USING (NOT (SELECT public.is_tk_chi_xem()))',
        r.relname);
    END IF;

    EXECUTE format(
      'CREATE POLICY chi_xem_block_delete ON public.%I AS RESTRICTIVE '
      'FOR DELETE TO public USING (NOT (SELECT public.is_tk_chi_xem()))',
      r.relname);
  END LOOP;
END $mig$;

-- ---------------------------------------------------------------------------
-- 4) Guard trong RPC SECURITY DEFINER có ghi (gọi được từ client)
--    Nhóm này chạy bằng quyền owner → BYPASS RLS ở (3). Chèn guard vào ngay sau
--    BEGIN của thân hàm, giữ nguyên phần còn lại (patch tại chỗ để không phải
--    chép lại thân hàm — tránh sai lệch với bản đang chạy).
-- ---------------------------------------------------------------------------
DO $mig$
DECLARE
  r      record;
  def    text;
  newdef text;
  -- Mỗi dòng phải là literal E'' riêng: literal thường (standard_conforming_strings=on)
  -- giữ nguyên \n thành 2 ký tự backslash-n → thân hàm sinh ra sẽ lỗi cú pháp.
  guard  text := E'\n  IF public.is_tk_chi_xem() THEN\n'
              || E'    RAISE EXCEPTION ''Tài khoản chỉ xem — không thực hiện được thao tác này''\n'
              || E'      USING ERRCODE = ''42501'';\n'
              || E'  END IF;\n';
  fns    text[] := ARRAY[
    'cong_no_ghi_can_tru',
    'cong_no_hoan_can_tru',
    'find_or_create_khach_hang',
    'mark_deadline_done',
    'recalc_chi_phi_payment_status',
    'remap_canh_diem_theo_ngay',
    'remap_nha_hang_theo_ngay',
    'update_my_profile'
  ];
  patched int := 0;
BEGIN
  FOR r IN
    SELECT p.oid, p.proname
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = ANY(fns) AND p.prosecdef
  LOOP
    def := pg_get_functiondef(r.oid);
    IF def LIKE '%is_tk_chi_xem%' THEN
      patched := patched + 1;   -- đã vá (chạy lại migration)
      CONTINUE;
    END IF;

    newdef := regexp_replace(def, '(AS \$function\$.*?\nBEGIN\n)', '\1' || guard);
    IF newdef = def THEN
      RAISE EXCEPTION 'Không tìm được điểm chèn guard trong %', r.proname;
    END IF;

    EXECUTE newdef;
    patched := patched + 1;
  END LOOP;

  IF patched <> array_length(fns, 1) THEN
    RAISE EXCEPTION 'Chỉ vá được %/% RPC', patched, array_length(fns, 1);
  END IF;
END $mig$;

-- ---------------------------------------------------------------------------
-- 5) Kiểm chứng
-- ---------------------------------------------------------------------------
DO $mig$
DECLARE
  n_tables int;
  n_ins    int;
  n_del    int;
  n_guard  int;
BEGIN
  SELECT count(*) INTO n_tables
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relrowsecurity;

  SELECT count(*) INTO n_ins FROM pg_policy WHERE polname = 'chi_xem_block_insert';
  SELECT count(*) INTO n_del FROM pg_policy WHERE polname = 'chi_xem_block_delete';

  -- prokind='f' bắt buộc: pg_get_functiondef() nổ 42809 trên aggregate/window.
  SELECT count(*) INTO n_guard
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.prokind = 'f'
    AND p.proname <> 'is_tk_chi_xem'
    AND pg_get_functiondef(p.oid) LIKE '%is_tk_chi_xem()%';

  IF n_ins <> n_tables OR n_del <> n_tables THEN
    RAISE EXCEPTION 'Thiếu policy chặn ghi: % bảng, % insert, % delete', n_tables, n_ins, n_del;
  END IF;
  IF n_guard < 8 THEN
    RAISE EXCEPTION 'Thiếu guard RPC: chỉ % hàm', n_guard;
  END IF;

  RAISE NOTICE 'chi_xem OK: % bảng khóa ghi, % RPC có guard', n_tables, n_guard;
END $mig$;
