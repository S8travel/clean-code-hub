-- Realtime cho module Lead: webhook FB Messenger ghi lead/lead_activity từ
-- SERVER (service_role) → client đang mở không hề biết để refetch (khác mọi
-- mutation nội bộ vốn tự invalidate). Hệ quả: mở sẵn LeadDrawer rồi khách nhắn
-- → tin không hiện cho tới khi F5. Thêm 2 bảng vào publication để client
-- subscribe postgres_changes (use-lead-realtime.ts).
-- Realtime tôn trọng RLS: lead_activity policy auth_required → chỉ user đăng
-- nhập nhận event.
ALTER PUBLICATION supabase_realtime ADD TABLE public.lead;
ALTER PUBLICATION supabase_realtime ADD TABLE public.lead_activity;
