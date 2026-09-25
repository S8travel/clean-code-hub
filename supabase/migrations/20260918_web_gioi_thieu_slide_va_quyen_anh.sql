-- Trang gioi thieu doi tac (repo s8-gioi-thieu, deploy Vercel) doc 3 view
-- web_khach_san / web_nha_hang / web_canh_diem bang khoa publishable. Dot nay:
--   1. Canh diem co them slide trang chu (thu tu + anh kho rong).
--   2. Khoa ghi QUA VIEW cho anon/authenticated. Ba view nay la SECURITY DEFINER
--      co y (trang web can doc bang goc co RLS) -> truoc day INSERT/UPDATE qua
--      view di vong duoc RLS cua bang goc.
--   3. is_web_editor(): nhan vien dang hoat dong (khong chi_xem) duoc tai anh
--      len web-images/showcase/... tu man "Anh trang gioi thieu" trong CRM.
--      is_web_admin() (bang web_admin_users) van giu quyen toan bucket.
--   4. Hai bang noi dung khong cho anon cham truc tiep - web chi doc qua view.
--
-- Da apply prod 18/09/2026 qua MCP (web_gioi_thieu_slide_va_quyen_anh +
-- web_gioi_thieu_revoke_anon_content). File nay de repo co ban ghi.

ALTER TABLE public.web_canh_diem_content
  ADD COLUMN IF NOT EXISTS slide_thu_tu integer,
  ADD COLUMN IF NOT EXISTS slide_anh_url text;

CREATE OR REPLACE VIEW public.web_canh_diem AS
SELECT slug, loai, mien, tinh_vi, tinh_zh, tinh_en, ten_vi, ten_zh, ten_en,
       phu_vi, phu_zh, phu_en, nhan_vi, nhan_zh, nhan_en, gt_vi, gt_zh, gt_en,
       vt_vi, vt_zh, vt_en, dc_vi, dc_zh, dc_en, mua_vi, mua_zh, mua_en,
       anh_url, anh_nguon, thu_tu, slide_thu_tu, slide_anh_url
  FROM public.web_canh_diem_content
 WHERE COALESCE(an_tren_web, false) = false;

REVOKE INSERT, UPDATE, DELETE, TRUNCATE
  ON public.web_khach_san, public.web_nha_hang, public.web_canh_diem
  FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.is_web_editor()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT public.is_web_admin() OR EXISTS (
    SELECT 1 FROM public.user_roles u
     WHERE u.user_id = (SELECT auth.uid())
       AND COALESCE(u.active, true)
       AND NOT COALESCE(u.chi_xem, false)
  );
$$;

DROP POLICY IF EXISTS "web-images showcase insert" ON storage.objects;
CREATE POLICY "web-images showcase insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'web-images' AND name LIKE 'showcase/%' AND public.is_web_editor());

DROP POLICY IF EXISTS "web-images showcase update" ON storage.objects;
CREATE POLICY "web-images showcase update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'web-images' AND name LIKE 'showcase/%' AND public.is_web_editor())
  WITH CHECK (bucket_id = 'web-images' AND name LIKE 'showcase/%' AND public.is_web_editor());

DROP POLICY IF EXISTS "web-images showcase delete" ON storage.objects;
CREATE POLICY "web-images showcase delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'web-images' AND name LIKE 'showcase/%' AND public.is_web_editor());

REVOKE ALL ON public.web_canh_diem_content FROM anon;
REVOKE ALL ON public.web_showcase_content FROM anon;
