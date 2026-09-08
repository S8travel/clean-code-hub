-- Thu hồi quyền của riêng MỘT người, không đụng vai trò của cả nhóm.
-- Project lflsbwoqzmbknzdpaequ. Deploy migration thủ công.
--
-- Bối cảnh: cần ẩn mục Danh mục khỏi đúng một trưởng phòng. Quyền đó đến từ ma
-- trận vai trò (dùng chung 5 người), còn `user_quyen_them` thì CỐ Ý chỉ cộng
-- thêm — không có đường nào cấm riêng một người ngoài việc tắt cho cả vai trò
-- hoặc đổi vai trò của họ (kéo theo mọi quyền khác).
--
-- Nên: bảng đối xứng với user_quyen_them, mỗi ô true = MẤT đúng quyền đó. Luật
-- ở src/lib/quyen.ts: thu hồi chạy sau cùng và thắng mọi nguồn cho, TRỪ admin —
-- admin là đường quay lại sửa phân quyền, thu hồi được của admin là tự khoá cửa.
--
-- ⚠️ Đây là tầng GIAO DIỆN (ẩn menu + chặn vào trang). Dữ liệu danh mục ở DB vẫn
-- chỉ có policy "đã đăng nhập" — xem mục "ĐÃ THỬ VÀ BỎ" trong CLAUDE.md.

CREATE TABLE IF NOT EXISTS public.user_quyen_bo (
  id         bigserial PRIMARY KEY,
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  resource   text NOT NULL,
  can_view   boolean NOT NULL DEFAULT false,
  can_create boolean NOT NULL DEFAULT false,
  can_edit   boolean NOT NULL DEFAULT false,
  can_delete boolean NOT NULL DEFAULT false,
  /** Vì sao thu hồi — để tháng sau còn biết mà gỡ. */
  ghi_chu    text,
  tao_luc    timestamptz NOT NULL DEFAULT now(),
  tao_boi    uuid,
  UNIQUE (user_id, resource)
);

CREATE INDEX IF NOT EXISTS idx_user_quyen_bo_user ON public.user_quyen_bo (user_id);

COMMENT ON TABLE public.user_quyen_bo IS
  'Quyền THU HỒI của riêng một người. Mỗi ô true = mất đúng quyền đó dù vai trò cho. Không áp cho admin.';
COMMENT ON COLUMN public.user_quyen_bo.resource IS
  'Khớp union Resource trong src/hooks/use-permissions.ts (danh_muc, bao_gia, doan...).';

GRANT SELECT ON public.user_quyen_bo TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_quyen_bo TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.user_quyen_bo_id_seq TO authenticated, service_role;
-- KHÔNG cấp cho anon: bảng phân quyền, khoá publishable nằm sẵn trong bundle web.
REVOKE ALL ON public.user_quyen_bo FROM anon;

ALTER TABLE public.user_quyen_bo ENABLE ROW LEVEL SECURITY;

-- Ai đăng nhập cũng ĐỌC được: mỗi người cần đọc dòng của chính mình để biết menu
-- nào bị ẩn, còn màn Người dùng (chỉ admin vào) cần đọc dòng của người khác.
DO $pol$
BEGIN
  CREATE POLICY uqb_doc ON public.user_quyen_bo
    FOR SELECT TO authenticated USING (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $pol$;

-- GHI thì chỉ admin. Bọc (SELECT ...) để Postgres tính một lần cho cả câu
-- (bài học auth_rls_initplan).
DO $pol$
BEGIN
  CREATE POLICY uqb_ghi_admin ON public.user_quyen_bo
    FOR ALL TO authenticated
    USING ((SELECT public.is_admin())) WITH CHECK ((SELECT public.is_admin()));
EXCEPTION WHEN duplicate_object THEN NULL;
END $pol$;

DO $pol$
BEGIN
  CREATE POLICY chi_xem_block_insert ON public.user_quyen_bo AS RESTRICTIVE
    FOR INSERT TO public WITH CHECK (NOT (SELECT public.is_tk_chi_xem()));
EXCEPTION WHEN duplicate_object THEN NULL;
END $pol$;
DO $pol$
BEGIN
  CREATE POLICY chi_xem_block_update ON public.user_quyen_bo AS RESTRICTIVE
    FOR UPDATE TO public USING (NOT (SELECT public.is_tk_chi_xem()));
EXCEPTION WHEN duplicate_object THEN NULL;
END $pol$;
DO $pol$
BEGIN
  CREATE POLICY chi_xem_block_delete ON public.user_quyen_bo AS RESTRICTIVE
    FOR DELETE TO public USING (NOT (SELECT public.is_tk_chi_xem()));
EXCEPTION WHEN duplicate_object THEN NULL;
END $pol$;
