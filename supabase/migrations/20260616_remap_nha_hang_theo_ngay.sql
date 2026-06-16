-- Phase 1 "Xếp lại nhà hàng theo ngày" (remap NH) — đổi đường đi làm NH xáo ngày
-- cho nhau (HOÁN VỊ, không hủy NH nào). Dời booking + chi phí + slot điều tour sang
-- ngày khác mà GIỮ NGUYÊN thanh toán/ĐNTT/email thread — bỏ qua guard chặn-đổi-khi-đã-book
-- của save điều tour bằng 1 đường đi RPC atomic, có kiểm soát.

-- ── 1. ALTER UNIQUE(doan_ngay_id, bua_an) → DEFERRABLE ────────────────────────
-- Hoán vị booking có CHU TRÌNH (A↔B, A→B→C→A) → update tuần tự va ô đích trùng tạm
-- thời. bua_an chỉ 'trua'/'toi' (không có sentinel) → phải defer constraint.
-- INITIALLY IMMEDIATE = mặc định vẫn check ngay như cũ → code/PostgREST cũ KHÔNG đổi.
-- ALTER constraint (không CREATE TABLE) → KHÔNG cần GRANT lại. IF EXISTS cho idempotent.
ALTER TABLE public.doan_booking_nh
  DROP CONSTRAINT IF EXISTS doan_booking_nh_doan_ngay_id_bua_an_key;

ALTER TABLE public.doan_booking_nh
  ADD CONSTRAINT doan_booking_nh_doan_ngay_id_bua_an_key
  UNIQUE (doan_ngay_id, bua_an)
  DEFERRABLE INITIALLY IMMEDIATE;

-- ── 2. RPC remap_nha_hang_theo_ngay ──────────────────────────────────────────
-- Di chuyển ROW booking (chỉ đổi doan_ngay_id + bua_an), đồng bộ slot doan_ngay
-- (an_*_nha_hang_id + an_*_set_menu_id), và doan_chi_phi (ngay_so + ref_doan_ngay_id
-- + mo_ta). GIỮ NGUYÊN: booking_status, email_thread_id, mọi snapshot, so_tien_da_tt,
-- so_tien_da_dntt, thanh_tien_thuc_te, dntt_allocations. SECURITY DEFINER, 1 transaction.
--
-- Định danh chi phí NH (không có nha_hang_id): theo (doan_id, danh_muc='nha_hang',
-- ref_doan_ngay_id = booking.doan_ngay_id NGUỒN, suffix bữa). KHÔNG dùng ngay_so vì
-- ngay_so KHÔNG unique trong đoàn (đa nhóm). cp_id chụp TRƯỚC mọi mutation rồi update
-- theo id. mo_ta MỚI = nha_hang.ten LIVE + suffix đích → ĐỒNG BỘ với cascade điều tour
-- (cascade khớp theo tên live) để lần save sau không tạo chi phí double/orphan.
CREATE OR REPLACE FUNCTION public.remap_nha_hang_theo_ngay(
  p_doan_id  bigint,
  p_mapping  jsonb   -- [{"booking_id":1,"to_doan_ngay_id":10,"to_bua_an":"trua"}, ...]
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
  -- 0. Auth + tham số
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Chưa đăng nhập';
  END IF;
  IF p_doan_id IS NULL OR p_mapping IS NULL OR jsonb_typeof(p_mapping) <> 'array' THEN
    RAISE EXCEPTION 'Tham số không hợp lệ';
  END IF;
  v_n_mapping := jsonb_array_length(p_mapping);
  IF v_n_mapping = 0 THEN
    RETURN jsonb_build_object('moved', 0, 'chi_phi_updated', 0, 'chi_phi_ids', '[]'::jsonb);
  END IF;

  -- 1. IDOR guard (RPC DEFINER bypass RLS → tự kiểm quyền văn phòng)
  SELECT van_phong_id INTO v_van_phong_id FROM doan WHERE id = p_doan_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Đoàn % không tồn tại', p_doan_id;
  END IF;
  IF NOT public.can_access_van_phong(v_van_phong_id) THEN
    RAISE EXCEPTION 'Không có quyền trên đoàn này';
  END IF;

  -- 2. CHẶN đoàn nhiều nhóm (V1: chi phí merge cross-nhóm theo (ngay_so,mo_ta) → lệch)
  SELECT count(*) INTO v_nhom_count FROM doan_nhom WHERE doan_id = p_doan_id;
  IF v_nhom_count > 1 THEN
    RAISE EXCEPTION 'V1 chưa hỗ trợ remap đoàn nhiều nhóm (đoàn % có % nhóm)', p_doan_id, v_nhom_count;
  END IF;

  -- 3. Defer UNIQUE(doan_ngay_id, bua_an) cho cả transaction này
  SET CONSTRAINTS doan_booking_nh_doan_ngay_id_bua_an_key DEFERRED;

  -- 4. SNAPSHOT nguồn TRƯỚC mọi mutation: gắn cp_id (định danh chi phí theo ref nguồn +
  --    suffix; ORDER BY khớp tên live trước). JOIN lọc booking không hợp lệ (khác đoàn /
  --    chưa chọn NH / tàu ngày / đã hủy) + ngày đích thuộc đoàn → dòng sống sót là hợp lệ.
  CREATE TEMP TABLE _remap_src ON COMMIT DROP AS
  SELECT
    b.id                            AS booking_id,
    b.doan_ngay_id                  AS from_dn_id,
    b.bua_an                        AS from_bua,
    dn_from.ngay_so                 AS from_ngay_so,
    (e->>'to_doan_ngay_id')::bigint AS to_dn_id,
    (e->>'to_bua_an')::text         AS to_bua,
    dn_to.ngay_so                   AS to_ngay_so,
    b.nha_hang_id                   AS nha_hang_id,
    nh.ten                          AS nha_hang_ten,
    cp.cp_id                        AS cp_id,
    cp.total_cnt                    AS cp_total_cnt,
    cp.exact_cnt                    AS cp_exact_cnt
  FROM jsonb_array_elements(p_mapping) e
  JOIN doan_booking_nh b   ON b.id = (e->>'booking_id')::bigint
                          AND b.doan_id = p_doan_id
                          AND b.nha_hang_id IS NOT NULL
                          AND b.booking_status <> 'da_huy'         -- không remap booking đã hủy
  JOIN nha_hang nh         ON nh.id = b.nha_hang_id
                          AND COALESCE(nh.loai, 'nha_hang') = 'nha_hang'  -- loại tàu ngày
  JOIN doan_ngay dn_from   ON dn_from.id = b.doan_ngay_id
  JOIN doan_ngay dn_to     ON dn_to.id = (e->>'to_doan_ngay_id')::bigint
                          AND dn_to.doan_id = p_doan_id            -- ngày đích thuộc đoàn
  LEFT JOIN LATERAL (
    -- chi phí main của ĐÚNG ô nguồn: ref_doan_ngay_id = booking.doan_ngay_id + suffix bữa.
    -- Ưu tiên khớp tên live (đề phòng nhiều main row cùng ô = mồ côi cũ). total/exact_cnt
    -- để guard ambiguity ở 4g.
    SELECT
      (array_agg(cp.id  ORDER BY (cp.mo_ta = nh.ten || (CASE WHEN b.bua_an='trua' THEN ' (trưa)' ELSE ' (tối)' END)) DESC, cp.id))[1] AS cp_id,
      count(*)                                                                                                                       AS total_cnt,
      count(*) FILTER (WHERE cp.mo_ta = nh.ten || (CASE WHEN b.bua_an='trua' THEN ' (trưa)' ELSE ' (tối)' END))                       AS exact_cnt
    FROM doan_chi_phi cp
    WHERE cp.doan_id = p_doan_id
      AND cp.danh_muc = 'nha_hang'
      AND cp.ref_doan_ngay_id = b.doan_ngay_id
      AND cp.mo_ta NOT LIKE '[trua] %'
      AND cp.mo_ta NOT LIKE '[toi] %'
      AND cp.mo_ta LIKE '%' || (CASE WHEN b.bua_an='trua' THEN ' (trưa)' ELSE ' (tối)' END)
  ) cp ON true
  WHERE (e->>'to_bua_an') IN ('trua', 'toi');

  -- 4a. Mọi booking trong mapping phải hợp lệ (không bị JOIN loại)
  SELECT count(*) INTO v_src_count FROM _remap_src;
  IF v_src_count <> v_n_mapping THEN
    RAISE EXCEPTION 'Có booking không hợp lệ (khác đoàn / chưa chọn NH / tàu ngày / đã hủy / ngày đích sai / bữa sai)';
  END IF;

  -- 4b. booking_id KHÔNG được lặp trong mapping
  IF (SELECT count(*) FROM _remap_src) <> (SELECT count(DISTINCT booking_id) FROM _remap_src) THEN
    RAISE EXCEPTION 'Booking bị lặp trong mapping';
  END IF;

  -- 4c. Targets phân biệt (không 2 booking về cùng 1 ô)
  IF (SELECT count(*) FROM _remap_src)
     <> (SELECT count(DISTINCT (to_dn_id, to_bua)) FROM _remap_src) THEN
    RAISE EXCEPTION 'Hai booking cùng một ô đích';
  END IF;

  -- 4d. Ô đích KHÔNG được đang bị booking KHÁC (ngoài tập di chuyển) chiếm.
  --     UNIQUE không xét status → mọi row tồn tại (kể cả da_huy/tàu ngày) đều chiếm ô.
  IF EXISTS (
    SELECT 1
    FROM _remap_src s
    JOIN doan_booking_nh b ON b.doan_ngay_id = s.to_dn_id AND b.bua_an = s.to_bua
    WHERE b.id NOT IN (SELECT booking_id FROM _remap_src)
  ) THEN
    RAISE EXCEPTION 'Ô đích đang có booking khác không di chuyển';
  END IF;

  -- 4e. Ô đích đã có NH gán ở Điều tour nhưng CHƯA gửi booking (assignment-only) →
  --     step 7 sẽ ghi đè âm thầm → CHẶN. (Loại trừ ô có booking — đã xét ở 4d.)
  IF EXISTS (
    SELECT 1
    FROM _remap_src s
    JOIN doan_ngay dn ON dn.id = s.to_dn_id
    WHERE (
        (s.to_bua = 'trua' AND dn.an_trua_nha_hang_id IS NOT NULL AND dn.an_trua_nha_hang_id <> s.nha_hang_id)
     OR (s.to_bua = 'toi'  AND dn.an_toi_nha_hang_id  IS NOT NULL AND dn.an_toi_nha_hang_id  <> s.nha_hang_id)
    )
    AND NOT EXISTS (
      SELECT 1 FROM doan_booking_nh b2 WHERE b2.doan_ngay_id = s.to_dn_id AND b2.bua_an = s.to_bua
    )
  ) THEN
    RAISE EXCEPTION 'Ô đích đã chọn nhà hàng ở Điều tour nhưng chưa gửi booking — xử lý tay trước khi xếp lại';
  END IF;

  -- 4f. CHẶN nếu ô NGUỒN có extras NH ([trua]/[toi]) — V1 không di chuyển extras.
  IF EXISTS (
    SELECT 1
    FROM _remap_src s
    JOIN doan_chi_phi cp ON cp.doan_id = p_doan_id AND cp.danh_muc = 'nha_hang'
      AND cp.ngay_so = s.from_ngay_so
      AND cp.mo_ta LIKE (CASE WHEN s.from_bua = 'trua' THEN '[trua] %' ELSE '[toi] %' END)
  ) THEN
    RAISE EXCEPTION 'Bữa nguồn có chi phí phát sinh (extras) — xử lý tay trước khi xếp lại';
  END IF;

  -- 4g. Ô nguồn có >1 chi phí NH main mà KHÔNG khớp tên live duy nhất (mồ côi/double cũ)
  --     → không định danh chắc chắn được chi phí cần dời → CHẶN, yêu cầu dọn trước.
  IF EXISTS (
    SELECT 1 FROM _remap_src WHERE cp_total_cnt > 1 AND cp_exact_cnt <> 1
  ) THEN
    RAISE EXCEPTION 'Bữa nguồn có nhiều chi phí nhà hàng trùng (mồ côi) — cần dọn trước khi xếp lại';
  END IF;

  -- 5. MOVE booking (set-based; deferred constraint cho phép trùng ô tạm thời)
  UPDATE doan_booking_nh b
    SET doan_ngay_id = s.to_dn_id, bua_an = s.to_bua
  FROM _remap_src s
  WHERE b.id = s.booking_id;
  GET DIAGNOSTICS v_moved = ROW_COUNT;
  IF v_moved <> v_n_mapping THEN
    RAISE EXCEPTION 'Số booking di chuyển (%) khác số mapping (%)', v_moved, v_n_mapping;
  END IF;

  -- 6. CLEAR slot doan_ngay NGUỒN — VÔ ĐIỀU KIỆN theo (from_dn, from_bua). An toàn vì
  --    UNIQUE đảm bảo ô nguồn chỉ có đúng booking đang move (active) làm chủ; step 7 set
  --    lại mọi ô là đích. Vô điều kiện còn DỌN luôn slot lệch (an_*_nha_hang_id cũ ≠ booking).
  UPDATE doan_ngay dn
    SET an_trua_nha_hang_id = NULL, an_trua_set_menu_id = NULL
  FROM _remap_src s
  WHERE s.from_bua = 'trua' AND dn.id = s.from_dn_id;

  UPDATE doan_ngay dn
    SET an_toi_nha_hang_id = NULL, an_toi_set_menu_id = NULL
  FROM _remap_src s
  WHERE s.from_bua = 'toi' AND dn.id = s.from_dn_id;

  -- 7. SET slot doan_ngay ĐÍCH (đọc set_menu từ booking đã ở vị trí mới)
  UPDATE doan_ngay dn
    SET an_trua_nha_hang_id = b.nha_hang_id, an_trua_set_menu_id = b.set_menu_id
  FROM _remap_src s
  JOIN doan_booking_nh b ON b.id = s.booking_id
  WHERE s.to_bua = 'trua' AND dn.id = s.to_dn_id;

  UPDATE doan_ngay dn
    SET an_toi_nha_hang_id = b.nha_hang_id, an_toi_set_menu_id = b.set_menu_id
  FROM _remap_src s
  JOIN doan_booking_nh b ON b.id = s.booking_id
  WHERE s.to_bua = 'toi' AND dn.id = s.to_dn_id;

  -- 8. UPDATE doan_chi_phi theo cp_id. mo_ta MỚI = tên NH LIVE + suffix đích (đồng bộ
  --    cascade điều tour → không tạo chi phí double/orphan lần save sau).
  UPDATE doan_chi_phi cp
    SET ngay_so          = s.to_ngay_so,
        ref_doan_ngay_id = s.to_dn_id,
        mo_ta            = s.nha_hang_ten || (CASE WHEN s.to_bua = 'trua' THEN ' (trưa)' ELSE ' (tối)' END)
  FROM _remap_src s
  WHERE cp.id = s.cp_id AND s.cp_id IS NOT NULL;
  GET DIAGNOSTICS v_chi_phi_count = ROW_COUNT;

  -- 9. Recalc trạng thái thanh toán (no-op kỳ vọng: tiền/alloc không đổi) — phòng thủ.
  SELECT array_agg(cp_id) INTO v_chi_phi_ids FROM _remap_src WHERE cp_id IS NOT NULL;
  IF v_chi_phi_ids IS NOT NULL AND array_length(v_chi_phi_ids, 1) > 0 THEN
    PERFORM public.recalc_chi_phi_payment_status(v_chi_phi_ids);
  END IF;

  -- 10. UNIQUE(doan_ngay_id, bua_an) được check tại COMMIT (deferred).
  RETURN jsonb_build_object(
    'moved',           v_moved,
    'chi_phi_updated', v_chi_phi_count,
    'chi_phi_ids',     to_jsonb(COALESCE(v_chi_phi_ids, '{}'::bigint[]))
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.remap_nha_hang_theo_ngay(bigint, jsonb) TO authenticated;
