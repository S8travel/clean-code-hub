-- ============================================================================
-- DỌN SẠCH tàn dư che_gia_von (2026-07-29)
-- ----------------------------------------------------------------------------
-- Hướng "che giá vốn / nhân hệ số cho tài khoản agent" đã DỪNG hẳn: bất kỳ cách
-- nhân số nào ở phía client đều lộ trong DevTools (server trả số gốc rồi trình
-- duyệt mới nhân), còn làm ở server thì vẫn để lại dấu vết đủ cho người kỹ thuật
-- nhận ra. Chốt lại: tài khoản đối tác dùng app bình thường, KHÔNG nhân hệ số.
--
-- 20260729_go_chan_che_gia_von đã gỡ 29 policy chặn đọc + 3 RPC bản agent.
-- File này dọn nốt phần cấu hình không còn ai dùng.
--
-- GIỮ NGUYÊN (vẫn đang dùng):
--   • user_roles.chi_xem + toàn bộ khoá ghi  → 20260728_tai_khoan_chi_xem
--   • resource hoan_ung + policy hoan_ung_perm_* → 20260728_resource_hoan_ung
-- ============================================================================

-- is_tk_che_gia_von() đọc cột che_gia_von → phải bỏ hàm trước khi bỏ cột.
-- (20260729_go_chan_che_gia_von đã xoá hết policy tham chiếu tới hàm này.)
DROP FUNCTION IF EXISTS public.is_tk_che_gia_von();

ALTER TABLE public.user_roles DROP COLUMN IF EXISTS che_gia_von;

DROP TABLE IF EXISTS public.agent_he_so;

DO $mig$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'user_roles' AND column_name = 'che_gia_von';
  IF n <> 0 THEN RAISE EXCEPTION 'Cột che_gia_von chưa bỏ được'; END IF;

  SELECT count(*) INTO n FROM pg_class c JOIN pg_namespace ns ON ns.oid = c.relnamespace
  WHERE ns.nspname = 'public' AND c.relname = 'agent_he_so';
  IF n <> 0 THEN RAISE EXCEPTION 'Bảng agent_he_so chưa bỏ được'; END IF;

  -- Phần vẫn phải còn
  SELECT count(*) INTO n FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'user_roles' AND column_name = 'chi_xem';
  IF n <> 1 THEN RAISE EXCEPTION 'Mất cột chi_xem — khoá ghi hỏng'; END IF;

  SELECT count(*) INTO n FROM pg_policy
  WHERE polname IN ('hoan_ung_perm_select', 'hoan_ung_perm_insert');
  IF n <> 2 THEN RAISE EXCEPTION 'Mất policy hoan_ung: %', n; END IF;

  RAISE NOTICE 'Da don sach che_gia_von; chi_xem + hoan_ung con nguyen';
END $mig$;
