-- Siết bảo mật theo Supabase Security Advisor (2026-06-01) — security_invoker view.
-- Lint 0010 (Security Definer View). View hiện chạy bằng quyền OWNER (bỏ qua RLS của
-- người truy vấn); đổi sang chạy bằng quyền + RLS của NGƯỜI TRUY VẤN.
--
-- ĐÃ VERIFY AN TOÀN (rà code + DB, không vỡ luồng nào):
--  - service_role.rolbypassrls = TRUE → edge fn sync (sync-dntt-to-sheet,
--    sync-chi-phi-to-sheet, sync-dntt-du-chi-to-sheet, xuat-word-dntt-ks — đều dùng
--    SERVICE_ROLE_KEY) bỏ qua RLS, đọc đủ rows như cũ.
--  - authenticated: có SELECT grant trên base table + RLS cho xem hết
--    (de_nghi_thanh_toan/payments/cong_no: auth.uid() IS NOT NULL; voucher*: auth_all true)
--    → dữ liệu user thấy KHÔNG đổi.
--  - voucher_with_status: KHÔNG được app dùng; anon đang đọc được TOÀN BỘ voucher qua
--    security_definer → security_invoker + revoke anon = đóng lỗ rò.
-- Bonus: sẵn sàng cho kế hoạch phân quyền per-user (scope theo văn phòng/đoàn) — khi
-- siết RLS base table thì các view này tự áp theo, không rò chéo.

ALTER VIEW public.dntt_with_payment_status SET (security_invoker = on);
ALTER VIEW public.cong_no_with_status      SET (security_invoker = on);
ALTER VIEW public.voucher_with_status      SET (security_invoker = on);

-- voucher_with_status không có nơi nào dùng + anon không cần đọc → revoke (đóng lỗ rò).
REVOKE SELECT ON public.voucher_with_status FROM anon;
