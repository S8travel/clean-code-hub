-- ⚠️ FILE BÙ SỔ — chép NGUYÊN VĂN từ bản đã chạy trên prod, không phải viết mới.
--    Phiên bản trên prod: 20260818011352   (5/9 trong chuỗi migration cổng đối tác)
--    Bù vào repo 31/08/2026: thư mục migrations thiếu file này, nên người sau
--    lấy nhầm bản cũ trong repo làm nền cho CREATE OR REPLACE và xoá mất việc
--    của người trước. Xem PR mô tả sự cố.
-- ─── nguyên văn ───
-- Dựng chương trình cho NHIỀU đoàn trong một lần gọi.
-- Khi cổng chuyển sang "đối tác thấy mọi đoàn của mình" thì mỗi lượt đồng bộ phải
-- dựng cả trăm đoàn; gọi build_portal_doan_noi_dung từng cái là cả trăm vòng
-- round-trip từ edge function, đủ để chạm timeout của cron.
CREATE OR REPLACE FUNCTION public.build_portal_doan_batch(p_doan_ids bigint[])
RETURNS TABLE (doan_id bigint, noi_dung jsonb)
LANGUAGE sql STABLE
SET search_path TO 'public'
AS $$
  SELECT d.id, public.build_portal_doan_noi_dung(d.id)
  FROM doan d
  WHERE d.id = ANY(p_doan_ids);
$$;

REVOKE ALL ON FUNCTION public.build_portal_doan_batch(bigint[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.build_portal_doan_batch(bigint[]) TO authenticated, service_role;
