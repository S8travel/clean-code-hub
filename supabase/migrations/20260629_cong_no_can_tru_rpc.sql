-- Cấn trừ công nợ với quỹ theo NCC (cong_no doan_id=NULL: voucher / trả trước /
-- "phát sinh trước hệ thống") bị RLS van_phong_scope ẩn khỏi OP điều hành.
--
-- Policy van_phong_scope trên cong_no chỉ cho dòng doan_id=NULL hiển thị với
-- admin/GĐ (cross_vp) hoặc kế toán → 16 user OP không thấy → panel cấn trừ
-- (KSCongNoMultiPanel) tự ẩn (options rỗng) ở MỌI section NH/KS/DV.
--
-- Giải pháp: RPC SECURITY DEFINER bypass RLS RIÊNG cho luồng cấn trừ. KHÔNG nới
-- policy SELECT trên cong_no (ghi_chu liệt kê mã đoàn nhiều VP → tránh lộ chéo VP).
-- - Đọc: cong_no_kha_dung_cho_ncc — doan_id=NULL hiện cho mọi user; dòng gắn đoàn
--   GIỮ scope VP như cũ; KHÔNG trả ghi_chu.
-- - Ghi: cong_no_ghi_can_tru / cong_no_hoan_can_tru — append/gỡ log + flip/revert
--   trạng thái. log_entry/log_match tính sẵn ở JS (đồng nhất format, tránh drift
--   với removeCanTruLog vốn parse chuỗi để gỡ đúng dòng).
--
-- ALTER/CREATE FUNCTION không cần GRANT bảng; FUNCTION mới cần GRANT EXECUTE.

-- 1) Đọc quỹ/công nợ còn dư khả dụng để cấn trừ cho 1 NCC.
CREATE OR REPLACE FUNCTION public.cong_no_kha_dung_cho_ncc(p_ncc_id bigint)
RETURNS TABLE (
  id bigint,
  so_tien_con_lai numeric,
  loai text,
  ly_do text,
  doan_id bigint,
  ten_doan text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT cn.id::bigint, cn.so_tien_con_lai::numeric, cn.loai::text, cn.ly_do::text,
         cn.doan_id::bigint, d.ten_doan::text
  FROM public.cong_no_with_status cn
  LEFT JOIN public.doan d ON d.id = cn.doan_id
  WHERE cn.nha_cung_cap_id = p_ncc_id
    AND cn.trang_thai = 'con_du'
    AND cn.so_tien_con_lai > 0
    AND auth.uid() IS NOT NULL
    AND (
      public.current_user_cross_vp()
      OR public.current_user_is_accounting()
      OR cn.doan_id IS NULL                                   -- quỹ NCC: mọi user thấy (fix)
      OR EXISTS (                                             -- công nợ gắn đoàn: giữ scope VP
        SELECT 1 FROM public.doan dd
        WHERE dd.id = cn.doan_id
          AND dd.van_phong_id IN (SELECT unnest(public.current_user_vp_scope()))
      )
    )
  ORDER BY cn.created_at DESC;
$$;

-- 2) Ghi 1 lần cấn trừ lên cong_no: append log (nếu có) + flip 'da_can_tru' khi cạn.
CREATE OR REPLACE FUNCTION public.cong_no_ghi_can_tru(
  p_cong_no_id bigint,
  p_log_entry text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_ghi_chu text;
  v_con_lai numeric;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Chưa đăng nhập';
  END IF;

  IF p_log_entry IS NOT NULL AND p_log_entry <> '' THEN
    SELECT ghi_chu INTO v_ghi_chu FROM public.cong_no WHERE id = p_cong_no_id;
    UPDATE public.cong_no
      SET ghi_chu = CASE
        WHEN v_ghi_chu IS NULL OR v_ghi_chu = '' THEN p_log_entry
        ELSE v_ghi_chu || E'\n' || p_log_entry
      END
      WHERE id = p_cong_no_id;
  END IF;

  SELECT so_tien_con_lai INTO v_con_lai
  FROM public.cong_no_with_status WHERE id = p_cong_no_id;

  IF v_con_lai IS NOT NULL AND v_con_lai <= 0 THEN
    UPDATE public.cong_no SET trang_thai = 'da_can_tru' WHERE id = p_cong_no_id;
  END IF;
END;
$$;

-- 3) Hoàn cấn trừ (rollback hủy ĐNTT / xóa payment): gỡ 1 dòng log khớp (nếu có) +
--    revert 'con_du' khi còn dư & đang 'da_can_tru'.
CREATE OR REPLACE FUNCTION public.cong_no_hoan_can_tru(
  p_cong_no_id bigint,
  p_log_match text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_ghi_chu text;
  v_lines text[];
  v_idx int := NULL;
  v_con_lai numeric;
  v_trang_thai text;
  i int;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Chưa đăng nhập';
  END IF;

  IF p_log_match IS NOT NULL AND p_log_match <> '' THEN
    SELECT ghi_chu INTO v_ghi_chu FROM public.cong_no WHERE id = p_cong_no_id;
    IF v_ghi_chu IS NOT NULL THEN
      v_lines := string_to_array(v_ghi_chu, E'\n');
      FOR i IN 1 .. cardinality(v_lines) LOOP
        IF position(p_log_match IN v_lines[i]) > 0 THEN
          v_idx := i;
          EXIT;
        END IF;
      END LOOP;
      IF v_idx IS NOT NULL THEN
        v_lines := v_lines[1:v_idx-1] || v_lines[v_idx+1:cardinality(v_lines)];
        UPDATE public.cong_no
          SET ghi_chu = CASE
            WHEN cardinality(v_lines) IS NULL OR cardinality(v_lines) = 0 THEN NULL
            ELSE array_to_string(v_lines, E'\n')
          END
          WHERE id = p_cong_no_id;
      END IF;
    END IF;
  END IF;

  SELECT so_tien_con_lai, trang_thai INTO v_con_lai, v_trang_thai
  FROM public.cong_no_with_status WHERE id = p_cong_no_id;

  IF v_con_lai IS NOT NULL AND v_con_lai > 0 AND v_trang_thai = 'da_can_tru' THEN
    UPDATE public.cong_no SET trang_thai = 'con_du' WHERE id = p_cong_no_id;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.cong_no_kha_dung_cho_ncc(bigint) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.cong_no_ghi_can_tru(bigint, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.cong_no_hoan_can_tru(bigint, text) TO authenticated, service_role;
