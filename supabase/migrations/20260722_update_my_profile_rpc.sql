-- Cho phép user TỰ sửa họ tên + SĐT của mình (dialog "Thông tin cá nhân").
--
-- Bối cảnh bug: bảng user_roles chỉ có 1 policy UPDATE là admin_update (is_admin()).
-- Non-admin bấm Lưu → UPDATE khớp 0 row → PostgREST trả 204 KHÔNG kèm lỗi →
-- UI toast "Đã cập nhật thông tin" nhưng DB không đổi. Hệ quả: gần như mọi user
-- không phải admin đều còn so_dien_thoai = NULL.
--
-- KHÔNG nới policy UPDATE cho self: RLS WITH CHECK không so sánh được OLD/NEW nên
-- policy "user_id = auth.uid()" sẽ cho user tự sửa luôn role/bo_phan/van_phong_ids
-- /active → leo thang quyền. Dùng RPC SECURITY DEFINER giới hạn đúng 2 cột thay vì.

CREATE OR REPLACE FUNCTION public.update_my_profile(
  p_ho_ten text,
  p_so_dien_thoai text DEFAULT NULL::text
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_uid  uuid := auth.uid();
  v_rows integer;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Chưa đăng nhập';
  END IF;

  -- left(): hồ sơ do chính user nhập, cap để không bơm text nhiều MB vào DB.
  UPDATE user_roles
     SET ho_ten        = NULLIF(left(trim(coalesce(p_ho_ten, '')), 200), ''),
         so_dien_thoai = NULLIF(left(trim(coalesce(p_so_dien_thoai, '')), 50), '')
   WHERE user_id = v_uid;

  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows = 0 THEN
    RAISE EXCEPTION 'Không tìm thấy hồ sơ người dùng';
  END IF;
END;
$function$;

-- REVOKE trước: Postgres cấp EXECUTE cho PUBLIC (gồm anon) trên mọi function mới.
-- Hàm này đã tự chặn bằng auth.uid() nhưng vẫn siết cho đúng least-privilege.
REVOKE ALL ON FUNCTION public.update_my_profile(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_my_profile(text, text) TO authenticated, service_role;
