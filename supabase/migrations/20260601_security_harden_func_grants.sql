-- Siết bảo mật hàm theo Supabase Security Advisor (2026-06-01).
-- Gồm 2 nhóm AN TOÀN (không đụng luồng app, đã verify caller + ACL + cron):
--   #3 — REVOKE EXECUTE các hàm nội bộ/cron/trigger khỏi anon (+ authenticated nếu
--        client không gọi). lint 0028/0029.
--   #6 — SET search_path cố định cho hàm còn để mutable. lint 0011.
-- KHÔNG đụng: is_admin/get_user_role/is_web_admin (auth-helper dùng trong RLS, cố ý
-- SECURITY DEFINER), create_lead_from_form (form lead công khai — đúng thiết kế).

-- ─────────────────────────────────────────────────────────────────────────────
-- #3. REVOKE EXECUTE
-- ACL hiện tại của 4 hàm: PUBLIC (=X) + explicit anon/authenticated/service_role.
-- anon là thành viên PUBLIC → phải revoke CẢ anon LẪN PUBLIC mới chặn được anon.
-- service_role + postgres (owner) GIỮ NGUYÊN → cron (chạy bằng postgres) + edge fn
-- (service_role) vẫn hoạt động.

-- mark_deadline_done: APP (authenticated) gọi qua use-my-job.ts:182, có sẵn check
-- `auth.uid() IS NULL → raise`. Chỉ chặn anon/PUBLIC (defense-in-depth), GIỮ authenticated.
REVOKE EXECUTE ON FUNCTION public.mark_deadline_done(text, bigint) FROM anon, PUBLIC;

-- fn_doan_booking_escalation / fn_remind_pv_phancong: hàm CRON (pg_cron job
-- doan_booking_escalation_daily / remind_pv_phancong_daily, chạy bằng postgres),
-- KHÔNG do client gọi → chặn anon + authenticated + PUBLIC.
REVOKE EXECUTE ON FUNCTION public.fn_doan_booking_escalation() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_remind_pv_phancong()      FROM anon, authenticated, PUBLIC;

-- fn_doan_phanviec_events: hàm TRIGGER (chạy theo trigger trên bảng doan), không
-- bao giờ gọi trực tiếp qua RPC → chặn anon + authenticated + PUBLIC.
-- (Trigger vẫn fire vì chạy bằng owner, không phụ thuộc EXECUTE grant.)
REVOKE EXECUTE ON FUNCTION public.fn_doan_phanviec_events() FROM anon, authenticated, PUBLIC;

-- ─────────────────────────────────────────────────────────────────────────────
-- #6. SET search_path cố định (chống search_path injection)
-- '' (an toàn nhất) cho hàm CHỈ dùng NEW/OLD hoặc đã schema-qualify mọi tham chiếu.
-- pg_catalog luôn nằm trong path ngầm nên built-in (now/coalesce/sum...) vẫn chạy.
ALTER FUNCTION public.auto_pass_dntt_level_1()             SET search_path = '';
ALTER FUNCTION public.touch_updated_at()                  SET search_path = '';
ALTER FUNCTION public.doan_nhom_touch_updated_at()        SET search_path = '';
ALTER FUNCTION public.doan_auto_create_nhom_default()     SET search_path = '';  -- INSERT public.doan_nhom (đã qualify)
ALTER FUNCTION public.get_chi_phi_doan_summary(date, date) SET search_path = '';  -- public.doan/agents/doan_chi_phi (đã qualify)
ALTER FUNCTION public.sync_cong_no_trang_thai()           SET search_path = '';  -- public.cong_no/payments (đã qualify)

-- = public cho 2 hàm tham chiếu bảng public KHÔNG qualify (đặt '' sẽ vỡ).
ALTER FUNCTION public.get_dntt_pending_export()   SET search_path = public;  -- dntt_with_payment_status, doan, payments
ALTER FUNCTION public.notify_dntt_approval_user() SET search_path = public;  -- doan, thong_bao
