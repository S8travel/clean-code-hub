-- Phase 2 "Xếp lại theo ngày" — mở rộng remap cho CẢNH ĐIỂM / DỊCH VỤ có phí.
-- Cảnh điểm dễ hơn nhà hàng: doan_chi_phi nối item qua ref_doan_ngay_item_id (FK ổn
-- định) → KHÔNG cần match theo tên. doan_ngay_item.id là danh tính ổn định. Dời =
-- đổi item.doan_ngay_id + chi phí (ngay_so, ref_doan_ngay_id, mo_ta=tên live). GIỮ
-- NGUYÊN payment/ĐNTT/allocations. DV booking (doan_booking_dv) gom theo NCC, không
-- gắn ngày → KHÔNG đụng ở đây (dich_vu_list.ngay_date là thông tin, resync khi lưu điều tour).

-- ── 1. ALTER UNIQUE(doan_ngay_id, canh_diem_id) → DEFERRABLE ──────────────────
-- Cho phép hoán vị/reshuffle item có chu trình (vd cùng cảnh điểm trên 2 ngày tráo
-- nhau) mà không va trùng tạm thời. INITIALLY IMMEDIATE = mặc định check ngay → code cũ KHÔNG đổi.
ALTER TABLE public.doan_ngay_item
  DROP CONSTRAINT IF EXISTS doan_ngay_item_unique;

ALTER TABLE public.doan_ngay_item
  ADD CONSTRAINT doan_ngay_item_unique
  UNIQUE (doan_ngay_id, canh_diem_id)
  DEFERRABLE INITIALLY IMMEDIATE;

-- ── 2. RPC remap_canh_diem_theo_ngay ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.remap_canh_diem_theo_ngay(
  p_doan_id  bigint,
  p_mapping  jsonb   -- [{"item_id":1,"to_doan_ngay_id":10}, ...]
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_van_phong_id  bigint;
  v_nhom_count    int;
  v_n_mapping     int;
  v_src_count     int;
  v_moved         int := 0;
  v_chi_phi_count int := 0;
  v_chi_phi_ids   bigint[];
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Chưa đăng nhập'; END IF;
  IF p_doan_id IS NULL OR p_mapping IS NULL OR jsonb_typeof(p_mapping) <> 'array' THEN
    RAISE EXCEPTION 'Tham số không hợp lệ';
  END IF;
  v_n_mapping := jsonb_array_length(p_mapping);
  IF v_n_mapping = 0 THEN
    RETURN jsonb_build_object('moved', 0, 'chi_phi_updated', 0, 'chi_phi_ids', '[]'::jsonb);
  END IF;

  SELECT van_phong_id INTO v_van_phong_id FROM doan WHERE id = p_doan_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Đoàn % không tồn tại', p_doan_id; END IF;
  IF NOT public.can_access_van_phong(v_van_phong_id) THEN RAISE EXCEPTION 'Không có quyền trên đoàn này'; END IF;

  SELECT count(*) INTO v_nhom_count FROM doan_nhom WHERE doan_id = p_doan_id;
  IF v_nhom_count > 1 THEN
    RAISE EXCEPTION 'V1 chưa hỗ trợ remap đoàn nhiều nhóm (đoàn % có % nhóm)', p_doan_id, v_nhom_count;
  END IF;

  SET CONSTRAINTS doan_ngay_item_unique DEFERRED;

  -- SNAPSHOT: gắn cp_id (chi phí main qua ref_doan_ngay_item_id — danh tính ổn định,
  -- loại extras [dvps_]). JOIN lọc item không hợp lệ (khác đoàn / ngày đích sai).
  CREATE TEMP TABLE _cd_src ON COMMIT DROP AS
  SELECT
    it.id                           AS item_id,
    it.canh_diem_id                 AS canh_diem_id,
    it.doan_ngay_id                 AS from_dn_id,
    (e->>'to_doan_ngay_id')::bigint AS to_dn_id,
    dn_to.ngay_so                   AS to_ngay_so,
    cd.ten                          AS cd_ten,
    cp.cp_id                        AS cp_id
  FROM jsonb_array_elements(p_mapping) e
  JOIN doan_ngay_item it ON it.id = (e->>'item_id')::bigint AND it.doan_id = p_doan_id
  -- Loại cảnh điểm day-use KS (khach_san_id != null): chi phí quản lý như KS (tab Chi phí),
  -- KHÔNG phải danh_muc='canh_diem' cascade → remap như cảnh điểm sẽ lệch.
  JOIN canh_diem cd      ON cd.id = it.canh_diem_id AND cd.khach_san_id IS NULL
  JOIN doan_ngay dn_to   ON dn_to.id = (e->>'to_doan_ngay_id')::bigint AND dn_to.doan_id = p_doan_id
  LEFT JOIN LATERAL (
    SELECT cp.id AS cp_id
    FROM doan_chi_phi cp
    WHERE cp.doan_id = p_doan_id AND cp.danh_muc = 'canh_diem'
      AND cp.ref_doan_ngay_item_id = it.id
      AND cp.mo_ta NOT LIKE '[dvps_%'
    ORDER BY cp.id LIMIT 1
  ) cp ON true;

  SELECT count(*) INTO v_src_count FROM _cd_src;
  IF v_src_count <> v_n_mapping THEN
    RAISE EXCEPTION 'Có mục không hợp lệ (khác đoàn / ngày đích sai)';
  END IF;

  IF (SELECT count(*) FROM _cd_src) <> (SELECT count(DISTINCT item_id) FROM _cd_src) THEN
    RAISE EXCEPTION 'Mục bị lặp trong mapping';
  END IF;

  -- Ngày đích đã có cảnh điểm này qua item KHÁC (không di chuyển) → va UNIQUE → CHẶN.
  IF EXISTS (
    SELECT 1 FROM _cd_src s
    JOIN doan_ngay_item it2 ON it2.doan_ngay_id = s.to_dn_id AND it2.canh_diem_id = s.canh_diem_id
    WHERE it2.id NOT IN (SELECT item_id FROM _cd_src)
  ) THEN
    RAISE EXCEPTION 'Ngày đích đã có cảnh điểm này — xử lý tay trước khi xếp lại';
  END IF;

  -- Hai mục cùng cảnh điểm xếp vào cùng ngày → va UNIQUE.
  IF (SELECT count(*) FROM _cd_src) <> (SELECT count(DISTINCT (to_dn_id, canh_diem_id)) FROM _cd_src) THEN
    RAISE EXCEPTION 'Hai mục cùng cảnh điểm xếp vào cùng ngày';
  END IF;

  -- Mục có chi phí phát sinh (extras [dvps_<cp_id>]) → V1 không di chuyển extras → CHẶN.
  IF EXISTS (
    SELECT 1 FROM _cd_src s
    JOIN doan_chi_phi cp ON cp.doan_id = p_doan_id AND cp.danh_muc = 'canh_diem'
      AND s.cp_id IS NOT NULL
      AND cp.mo_ta LIKE '[dvps_' || s.cp_id || '] %'
  ) THEN
    RAISE EXCEPTION 'Mục có chi phí phát sinh (extras) — xử lý tay trước khi xếp lại';
  END IF;

  -- MOVE item (deferred constraint cho phép trùng tạm thời khi reshuffle)
  UPDATE doan_ngay_item it
    SET doan_ngay_id = s.to_dn_id
  FROM _cd_src s
  WHERE it.id = s.item_id;
  GET DIAGNOSTICS v_moved = ROW_COUNT;
  IF v_moved <> v_n_mapping THEN
    RAISE EXCEPTION 'Số mục di chuyển (%) khác số mapping (%)', v_moved, v_n_mapping;
  END IF;

  -- UPDATE chi phí main theo cp_id. mo_ta = tên cảnh điểm LIVE (đồng bộ cascade điều tour).
  UPDATE doan_chi_phi cp
    SET ngay_so          = s.to_ngay_so,
        ref_doan_ngay_id = s.to_dn_id,
        mo_ta            = s.cd_ten
  FROM _cd_src s
  WHERE cp.id = s.cp_id AND s.cp_id IS NOT NULL;
  GET DIAGNOSTICS v_chi_phi_count = ROW_COUNT;

  SELECT array_agg(cp_id) INTO v_chi_phi_ids FROM _cd_src WHERE cp_id IS NOT NULL;
  IF v_chi_phi_ids IS NOT NULL AND array_length(v_chi_phi_ids, 1) > 0 THEN
    PERFORM public.recalc_chi_phi_payment_status(v_chi_phi_ids);
  END IF;

  RETURN jsonb_build_object(
    'moved',           v_moved,
    'chi_phi_updated', v_chi_phi_count,
    'chi_phi_ids',     to_jsonb(COALESCE(v_chi_phi_ids, '{}'::bigint[]))
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.remap_canh_diem_theo_ngay(bigint, jsonb) TO authenticated;
