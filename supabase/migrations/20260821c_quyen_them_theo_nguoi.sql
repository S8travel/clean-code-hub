-- Cấp quyền THÊM cho riêng một người, không đụng tới vai trò của cả nhóm.
-- Project lflsbwoqzmbknzdpaequ. Deploy migration thủ công.
--
-- Bối cảnh: Thanh Thảo (vai trò nhan_vien_cao_cap) cần vào mục Báo Giá để xử lý
-- yêu cầu đối tác gửi từ cổng, nhưng bật `role_permissions.bao_gia` cho vai trò
-- đó là mở cho cả 16 người trong nhóm — trong khi báo giá có giá vốn và lợi nhuận.
--
-- VÌ SAO KHÔNG DÙNG LẠI `user_permissions`:
-- Bảng đó hiện có 367 dòng, nhưng chỉ 25 dòng (3 tài khoản 'specialist') là đang
-- có tác dụng — code chỉ đọc nó cho vai trò đó. 342 dòng còn lại thuộc 19 người
-- vai trò thường + 1 tài khoản không còn trong user_roles, và **tất cả đều bật đủ
-- xem/tạo/sửa/xoá trên 18 mục** (gồm Người dùng, ĐNTT, HĐ&UNC, Công nợ).
-- Chỉ cần cho code đọc bảng đó với vai trò thường là 20 tài khoản lập tức lên
-- gần bằng admin ở tầng giao diện. Xoá 342 dòng ấy là việc nên làm, nhưng đó là
-- quyết định của chủ hệ thống chứ không phải hệ quả phụ của một yêu cầu nhỏ.
-- Nên: bảng MỚI, rỗng, chỉ chứa đúng những gì được cấp có chủ đích.

CREATE TABLE IF NOT EXISTS public.user_quyen_them (
  id         bigserial PRIMARY KEY,
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  resource   text NOT NULL,
  can_view   boolean NOT NULL DEFAULT false,
  can_create boolean NOT NULL DEFAULT false,
  can_edit   boolean NOT NULL DEFAULT false,
  can_delete boolean NOT NULL DEFAULT false,
  /** Vì sao người này được cấp thêm — để tháng sau còn biết mà gỡ. */
  ghi_chu    text,
  tao_luc    timestamptz NOT NULL DEFAULT now(),
  tao_boi    uuid,
  UNIQUE (user_id, resource)
);

CREATE INDEX IF NOT EXISTS idx_user_quyen_them_user ON public.user_quyen_them (user_id);

COMMENT ON TABLE public.user_quyen_them IS
  'Quyền cấp THÊM cho một người, cộng vào quyền của vai trò. CHỈ cộng thêm — không cấm được gì.';
COMMENT ON COLUMN public.user_quyen_them.resource IS
  'Khớp union Resource trong src/hooks/use-permissions.ts (bao_gia, doan, chi_phi...).';

GRANT SELECT ON public.user_quyen_them TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_quyen_them TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.user_quyen_them_id_seq TO authenticated, service_role;
-- KHÔNG cấp cho anon: đây là bảng phân quyền, khoá publishable nằm sẵn trong
-- bundle web (bài học view yeu_cau_bao_gia 21/08).
REVOKE ALL ON public.user_quyen_them FROM anon;

ALTER TABLE public.user_quyen_them ENABLE ROW LEVEL SECURITY;

-- Ai đăng nhập cũng ĐỌC được: mỗi người cần đọc dòng của chính mình để biết
-- mình thấy được menu nào, còn màn Người dùng (chỉ admin vào) cần đọc của người khác.
DO $pol$
BEGIN
  CREATE POLICY uqt_doc ON public.user_quyen_them
    FOR SELECT TO authenticated USING (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $pol$;

-- GHI thì chỉ admin. Bọc (SELECT ...) để Postgres tính một lần cho cả câu
-- (bài học auth_rls_initplan).
DO $pol$
BEGIN
  CREATE POLICY uqt_ghi_admin ON public.user_quyen_them
    FOR ALL TO authenticated
    USING ((SELECT public.is_admin())) WITH CHECK ((SELECT public.is_admin()));
EXCEPTION WHEN duplicate_object THEN NULL;
END $pol$;

DO $pol$
BEGIN
  CREATE POLICY chi_xem_block_insert ON public.user_quyen_them AS RESTRICTIVE
    FOR INSERT TO public WITH CHECK (NOT (SELECT public.is_tk_chi_xem()));
EXCEPTION WHEN duplicate_object THEN NULL;
END $pol$;
DO $pol$
BEGIN
  CREATE POLICY chi_xem_block_update ON public.user_quyen_them AS RESTRICTIVE
    FOR UPDATE TO public USING (NOT (SELECT public.is_tk_chi_xem()));
EXCEPTION WHEN duplicate_object THEN NULL;
END $pol$;
DO $pol$
BEGIN
  CREATE POLICY chi_xem_block_delete ON public.user_quyen_them AS RESTRICTIVE
    FOR DELETE TO public USING (NOT (SELECT public.is_tk_chi_xem()));
EXCEPTION WHEN duplicate_object THEN NULL;
END $pol$;

-- ───────────────────────────────────────────────────────────────────────────
-- Cấp cho Võ Thị Thanh Thảo quyền XEM mục Báo Giá
-- ───────────────────────────────────────────────────────────────────────────
-- Chỉ can_view: chị ấy cần đọc yêu cầu đối tác gửi và làm báo giá từ đó; quyền
-- tạo/sửa/xoá báo giá vẫn theo vai trò như mọi người trong nhóm.
INSERT INTO public.user_quyen_them (user_id, resource, can_view, ghi_chu)
SELECT ur.user_id, 'bao_gia', true,
       'Xử lý yêu cầu báo giá đối tác gửi từ cổng 外網 (chốt 21/08/2026)'
FROM public.user_roles ur
WHERE ur.email = 's8travel.dingbooking01@gmail.com'
ON CONFLICT (user_id, resource) DO UPDATE SET can_view = true;
