-- Siết bảo mật DB theo Security Advisor (đợt bảo trì 05/09/2026).
--
-- ── Phần 1: chặn `anon` gọi RPC nội bộ ───────────────────────────────────────
-- Khoá publishable của Supabase nằm sẵn trong bundle web, ai mở trình duyệt cũng
-- có. Hàm SECURITY DEFINER mà PUBLIC còn quyền EXECUTE thì gọi được qua
-- /rest/v1/rpc/<tên> mà không cần đăng nhập. Lưu ý `=X/postgres` trong proacl
-- nghĩa là PUBLIC có EXECUTE — nên phải REVOKE khỏi PUBLIC, revoke mỗi `anon`
-- không đủ.
--
-- ⛔ CỐ Ý KHÔNG ĐỘNG (advisor vẫn sẽ kêu, đừng "sửa" lần sau):
--   • is_tk_chi_xem()  — 268 policy dùng, gồm cả policy áp cho role public.
--   • is_web_admin()   — 8 policy public (site_text, site_menus, web_posts...).
--   • is_admin()       — 4 policy public trên user_roles.
--   • can_view_hoan_ung() — 2 policy public trên de_nghi_thanh_toan.
--   Policy được đánh giá bằng quyền của chính người truy vấn; cắt EXECUTE của anon
--   là trang web công khai đọc site_text/web_posts sẽ lỗi "permission denied".
--   • create_lead_from_form, create_khao_sat_from_form, get_khao_sat_doan_info —
--     phục vụ /lead-form và /khao-sat/:doanId, hai trang KHÔNG cần đăng nhập.

-- Trigger function: quyền EXECUTE chỉ được kiểm lúc CREATE TRIGGER, không kiểm
-- mỗi lần trigger chạy → thu hồi sạch, không ai gọi qua REST được nữa.
REVOKE EXECUTE ON FUNCTION public.handle_new_user()                    FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.notify_web_submission()              FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.log_danh_muc_change()                FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.guard_delete_chi_phi_active_dntt()   FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.chan_duyet_dntt_khong_allocation()   FROM PUBLIC, anon, authenticated;

-- RPC app thật sự gọi: chỉ người đã đăng nhập.
REVOKE EXECUTE ON FUNCTION public.remap_canh_diem_theo_ngay(bigint, jsonb) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.remap_canh_diem_theo_ngay(bigint, jsonb) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.remap_nha_hang_theo_ngay(bigint, jsonb)  FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.remap_nha_hang_theo_ngay(bigint, jsonb)  TO authenticated;
REVOKE EXECUTE ON FUNCTION public.cong_no_ghi_can_tru(bigint, text)        FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.cong_no_ghi_can_tru(bigint, text)        TO authenticated;
REVOKE EXECUTE ON FUNCTION public.cong_no_hoan_can_tru(bigint, text)       FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.cong_no_hoan_can_tru(bigint, text)       TO authenticated;
REVOKE EXECUTE ON FUNCTION public.cong_no_kha_dung_cho_ncc(bigint)         FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.cong_no_kha_dung_cho_ncc(bigint)         TO authenticated;

-- Không client nào gọi trực tiếp; get_user_role còn được 1 policy (áp cho
-- authenticated) dùng nên phải giữ quyền cho authenticated.
REVOKE EXECUTE ON FUNCTION public.get_user_role()                          FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_user_role()                          TO authenticated;
REVOKE EXECUTE ON FUNCTION public.find_or_create_khach_hang(text, text, text, text, text, text, text, bigint) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.find_or_create_khach_hang(text, text, text, text, text, text, text, bigint) TO authenticated;

-- ── Phần 2: khoá search_path cho 8 hàm còn thiếu ─────────────────────────────
-- search_path thả nổi = ai tạo được schema tạm là chèn được hàm/bảng cùng tên,
-- hàm SECURITY DEFINER sẽ chạy code đó bằng quyền owner.
ALTER FUNCTION public.doan_khach_le_touch_updated_at()          SET search_path = public, pg_temp;
ALTER FUNCTION public.khach_hang_touch_updated_at()             SET search_path = public, pg_temp;
ALTER FUNCTION public.get_doan_agent_weekly(p_from date, p_to date) SET search_path = public, pg_temp;
ALTER FUNCTION public.get_su_co_weekly(p_from date, p_to date)  SET search_path = public, pg_temp;
ALTER FUNCTION public.learn_bao_gia_aliases(items jsonb)        SET search_path = public, pg_temp;
ALTER FUNCTION public.web_clean_url(src text)                   SET search_path = public, pg_temp;
ALTER FUNCTION public.web_mien(city text)                       SET search_path = public, pg_temp;
ALTER FUNCTION public.web_norm_city(p text)                     SET search_path = public, pg_temp;
