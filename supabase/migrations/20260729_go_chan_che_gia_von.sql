-- ============================================================================
-- GỠ toàn bộ cách làm "chặn + trang riêng" của che_gia_von (2026-07-29)
-- ----------------------------------------------------------------------------
-- Lý do gỡ: mục tiêu nghiệp vụ là GIẤU giá vốn — người dùng không được biết mình
-- đang bị giới hạn. Cách làm cũ lại làm điều ngược lại, nó BÁO HIỆU:
--   • menu tên thẳng "Chi phí (bản agent)"
--   • các trang cũ trả màn hình "Bạn không có quyền truy cập"
--   • sidebar thiếu hẳn nhiều mục so với tài khoản khác
--   • công tắc "Che giá vốn" trong trang Người dùng
-- Một tài khoản bị chặn kiểu đó biết ngay là có chuyện.
--
-- Hướng thay thế: tài khoản dùng app y như mọi người, chỉ khác là các con số chi
-- phí của đoàn thuộc agent có hệ số được nhân lên trước khi hiển thị.
--
-- Giữ lại:
--   • bảng `agent_he_so`   — nơi lưu hệ số (RLS chỉ admin/giám đốc đọc được)
--   • cột `user_roles.che_gia_von` — cờ đánh dấu tài khoản áp hệ số
--   • cột `user_roles.chi_xem` + toàn bộ khoá ghi (không liên quan, vẫn đúng)
-- Bỏ:
--   • 29 policy che_gia_von_block_select (chặn đọc → màn hình trống → lộ)
--   • 3 RPC bản agent (trang riêng đã bỏ)
--   • resource chi_phi_agent
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1) Gỡ chặn đọc trên mọi bảng
-- ---------------------------------------------------------------------------
DO $mig$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT c.relname
    FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid
    WHERE p.polname = 'che_gia_von_block_select'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS che_gia_von_block_select ON public.%I', r.relname);
  END LOOP;
END $mig$;

-- ---------------------------------------------------------------------------
-- 2) Bỏ RPC của trang riêng
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.get_chi_phi_agent_view(bigint);
DROP FUNCTION IF EXISTS public.get_lich_trinh_agent_view(bigint);
DROP FUNCTION IF EXISTS public.get_doan_agent_view();

-- ---------------------------------------------------------------------------
-- 3) Bỏ resource của trang riêng
-- ---------------------------------------------------------------------------
DELETE FROM public.role_permissions WHERE resource = 'chi_phi_agent';
DELETE FROM public.user_permissions WHERE resource = 'chi_phi_agent';

-- ---------------------------------------------------------------------------
-- 4) Kiểm chứng
-- ---------------------------------------------------------------------------
DO $mig$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM pg_policy WHERE polname = 'che_gia_von_block_select';
  IF n <> 0 THEN
    RAISE EXCEPTION 'Vẫn còn % policy chặn đọc', n;
  END IF;

  SELECT count(*) INTO n FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
  WHERE ns.nspname = 'public' AND p.proname LIKE '%_agent_view';
  IF n <> 0 THEN
    RAISE EXCEPTION 'Vẫn còn % RPC bản agent', n;
  END IF;

  RAISE NOTICE 'Da go sach chan doc + RPC ban agent';
END $mig$;
