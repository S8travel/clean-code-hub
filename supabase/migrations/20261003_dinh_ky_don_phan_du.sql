-- ============================================================================
-- Thanh toán định kỳ: tự dồn phần đã đề nghị bị DƯ khi chi phí giảm (2026-10-03)
-- ----------------------------------------------------------------------------
-- ĐNTT định kỳ (loai='dinh_ky') là MỘT khoản gộp cho cả cụm NCC × kỳ, nhưng số
-- tiền của nó được chẻ ra từng dòng chi phí qua dntt_allocations (chia theo phần
-- còn lại lúc tạo phiếu). Trang Thanh toán định kỳ tính "Còn" THEO TỪNG DÒNG:
--   Σ max(0, net − so_tien_da_dntt)
--
-- Lỗ: OP sửa giảm một chi phí (về 0, đổi sang HDV trả, bớt số lượng...) SAU khi
-- phiếu đã tạo → phần phiếu gán cho dòng đó vượt chi phí mới của nó. max(0, …)
-- nuốt mất phần vượt thay vì trừ vào các dòng khác của cụm → "Còn" phình đúng bằng
-- phần vượt → kế toán bấm "Tạo ĐNTT → Toàn bộ" là đề nghị / TRẢ DƯ cho NCC. Đã xảy
-- ra thật: 1 cụm, 2 dòng xe sửa giá về 0 sau khi tạo phiếu cọc.
--
-- Chỉ sửa phép cộng ở trang là KHÔNG đủ: khi phiếu được trả, dòng 0đ tự thành
-- 'paid' và rời khỏi danh sách (trang lọc bỏ dòng 'paid') → phần vượt vô hình,
-- "Còn" lệch trở lại. Phải đưa phần vượt về đúng chỗ: chuyển allocation sang các
-- dòng còn thiếu của cùng cụm. Tổng phiếu, trạng thái duyệt, tiền đã trả giữ
-- nguyên; bản in phiếu định kỳ chỉ ghi "Thanh toán công nợ tháng ..." nên NCC và
-- người duyệt không thấy gì khác.
--
-- Gồm:
--   1. chia_theo_ty_le(): chia số nguyên theo trọng số (largest remainder) — bản
--      SQL của proRataInts (lib/pro-rata.ts), tổng các phần luôn khớp tuyệt đối.
--   2. dinh_ky_don_phan_du(chi_phi_id, so_tien): rút tối đa `so_tien` khỏi
--      allocation định kỳ của dòng (phiếu mới nhất trước) và chia sang các dòng
--      còn thiếu CÙNG NCC của phiếu — ưu tiên dòng cùng phiếu, thiếu chỗ thì dòng
--      khác cùng kỳ (thêm allocation vào phiếu). Hết chỗ thì phần còn lại nằm yên:
--      đề nghị dư thật, người xử lý (trang định kỳ hiện cảnh báo). Ghi chú vào
--      phiếu + nhật ký đoàn, rồi recalc.
--   3. Trigger trên doan_chi_phi: CHỈ khi dòng định kỳ GIẢM chi phí và vượt phần
--      đã đề nghị. Chỉ dồn phần vượt DO LẦN GIẢM NÀY sinh ra (≤ net cũ − net mới).
--   4. Dọn các dòng đang vượt lúc chạy migration.
--
-- Không bao giờ xử lý một khoản dư hai lần — phần dư có thể đã thành CÔNG NỢ:
--   • Dòng có BẤT KỲ phiếu sống nào (định kỳ hay per-đoàn) được cong_no.dntt_goc_id
--     trỏ vào → không dồn. "Điều chỉnh sau thanh toán" (useCreateAdjustment) INSERT
--     công nợ TRƯỚC rồi mới hạ thanh_tien_thuc_te từng dòng → trigger đã thấy.
--     (Nút đó nay cũng bị chặn với phiếu định kỳ ở frontend.)
--   • Phần vượt có từ trước lần giảm không động tới: có thể đã được ghi công nợ
--     ở footer tab Chi phí (công nợ đó gắn phiếu per-đoàn, không gắn phiếu này).
--   • Bước 4 bỏ qua thêm đoàn đã có công nợ với NCC đó.
--
-- Đồng thời: khóa phiếu (FOR NO KEY UPDATE, theo id giảm dần) trước khi đọc cam kết
-- → 2 lần dồn trên cùng phiếu chạy tuần tự, không dồn quá chỗ. Dòng nhận khóa bằng
-- SKIP LOCKED: dòng người khác đang sửa thì bỏ qua lần này thay vì chờ. lock_timeout
-- 2s cho hàm. Trigger bắt mọi lỗi của việc dồn (deadlock hiếm giữa 2 câu UPDATE nhiều
-- dòng, hết thời gian chờ khóa...) → ghi nhật ký 'loi', KHÔNG làm hỏng lần lưu chi
-- phí của OP; phần dư khi đó nằm yên và hiện cảnh báo ở trang định kỳ.
-- Đi kèm 20261003b: recalc khóa dòng trước khi tính, kẻo recalc chạy song song ghi
-- đè so_tien_da_dntt bằng số cũ sau khi trigger vừa dồn.
--
-- Hệ quả cần biết: dòng nhận ngoài phiếu (đoàn thêm sau phiếu) giờ có ĐNTT định kỳ
-- → chặn xoá dòng / hủy đoàn / đẩy kỳ như mọi dòng đã nằm trong phiếu. Đúng tiền:
-- phần đó đã được phiếu (có thể đã trả) phủ.
--
-- Kỳ thanh toán tính ở SQL phải khớp kyHieuLuc (lib/ky-thanh-toan.ts) và mốc
-- ngay_kh_di của useDinhKyChiPhiList (KS ngoài tour lấy ngoai_tour_ci, còn lại
-- doan.ngay_di). Sửa một bên phải sửa bên kia.
--
-- Rollback:
--   DROP TRIGGER IF EXISTS trg_dinh_ky_don_phan_du ON public.doan_chi_phi;
--   DROP FUNCTION IF EXISTS public.trg_dinh_ky_don_phan_du();
--   DROP FUNCTION IF EXISTS public.dinh_ky_don_phan_du(bigint, numeric);
--   DROP FUNCTION IF EXISTS public.chia_theo_ty_le(numeric, bigint[], numeric[]);
--   (Allocation đã dồn để nguyên — tổng từng phiếu vẫn đúng.)
-- ============================================================================

-- ── 1. Chia số nguyên theo trọng số ─────────────────────────────────────────
-- Trọng số <= 0 bị bỏ. Người gọi bảo đảm p_tong và trọng số là số NGUYÊN và
-- p_tong <= Σ trọng số → không phần nào vượt trọng số của nó (phần dư +1 chỉ rơi
-- vào phần có lẻ, nên ≤ ceil(exact) ≤ trọng số).
CREATE OR REPLACE FUNCTION public.chia_theo_ty_le(
  p_tong     numeric,
  p_ids      bigint[],
  p_trong_so numeric[]
)
RETURNS TABLE (chi_phi_id bigint, so_tien numeric)
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  WITH x AS (
    SELECT u.cid, u.w, u.ord
    FROM unnest(p_ids, p_trong_so) WITH ORDINALITY AS u(cid, w, ord)
    WHERE u.w > 0
  ),
  e AS (
    SELECT x.cid, x.ord, round(p_tong) * x.w / sum(x.w) OVER () AS exact
    FROM x
  ),
  r AS (
    SELECT e.cid,
           floor(e.exact) AS fl,
           row_number() OVER (ORDER BY e.exact - floor(e.exact) DESC, e.ord) AS rn,
           round(p_tong) - sum(floor(e.exact)) OVER () AS du
    FROM e
  )
  SELECT r.cid, r.fl + CASE WHEN r.rn <= r.du THEN 1 ELSE 0 END
  FROM r
$$;

-- ── 2. Dồn phần dư của 1 dòng sang dòng còn thiếu cùng cụm ──────────────────
-- SECURITY DEFINER: dòng nhận thuộc đoàn khác, có thể khác văn phòng với người
-- đang sửa — RLS văn phòng trên dntt_allocations sẽ giấu chúng (xem
-- 20260730_get_chi_phi_ids_for_dntt.sql). Có ghi → bắt buộc guard chỉ xem.
-- Mọi số tiền dồn là ĐỒNG NGUYÊN (floor) để tổng phiếu khớp tuyệt đối kể cả khi chi
-- phí có số lẻ. Trả về số tiền đã dồn được.
-- lock_timeout 2s (< statement_timeout 8s của authenticated): chờ khóa lâu thì báo
-- 55P03 để trigger BẮT được; để statement_timeout nổ (57014, WHEN OTHERS không bắt)
-- là lần lưu chi phí của OP bị hủy theo.
CREATE OR REPLACE FUNCTION public.dinh_ky_don_phan_du(
  p_chi_phi_id bigint,
  p_so_tien    numeric
)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
SET lock_timeout = '2s'
AS $$
DECLARE
  v_cp       record;
  v_d        record;
  v_alloc    record;
  v_can_don  numeric;
  v_cam_ket  numeric;
  v_lay      numeric;
  v_phieu    bigint[];
  v_ung_vien bigint[];
  v_ids1     bigint[];
  v_ws1      numeric[];
  v_room1    numeric;
  v_ids2     bigint[];
  v_ws2      numeric[];
  v_room2    numeric;
  v_da1      numeric;
  v_da2      numeric;
  v_n1       int;
  v_n2       int;
  v_chuyen   numeric;
  v_tong_don numeric := 0;
  v_cham     bigint[] := ARRAY[p_chi_phi_id];
BEGIN
  IF public.is_tk_chi_xem() THEN
    RAISE EXCEPTION 'Tài khoản chỉ xem — không thực hiện được thao tác này'
      USING ERRCODE = '42501';
  END IF;

  SELECT c.id, c.doan_id, d.ten_doan,
         GREATEST(COALESCE(c.thanh_tien_thuc_te, c.tien_cong_ty, 0), 0) AS net,
         COALESCE(c.ky_thanh_toan,
                  to_char(CASE WHEN c.ngoai_tour AND c.ngoai_tour_ci IS NOT NULL
                               THEN c.ngoai_tour_ci ELSE d.ngay_di END, 'YYYY-MM')) AS ky
    INTO v_cp
  FROM doan_chi_phi c
  LEFT JOIN doan d ON d.id = c.doan_id
  WHERE c.id = p_chi_phi_id
  FOR NO KEY UPDATE OF c;
  IF NOT FOUND THEN
    RETURN 0;
  END IF;

  v_can_don := floor(COALESCE(p_so_tien, 0));
  IF v_can_don <= 0 THEN
    RETURN 0;
  END IF;

  -- Dòng có BẤT KỲ phiếu sống nào (định kỳ hay per-đoàn) đã có công nợ đối ứng →
  -- không dồn: phần dư có thể chính là khoản công nợ đó. "Điều chỉnh sau thanh
  -- toán" (useCreateAdjustment) INSERT công nợ TRƯỚC rồi mới hạ thanh_tien_thuc_te,
  -- nên lúc trigger chạy đã thấy. Phần dư nằm yên → trang hiện cảnh báo.
  IF EXISTS (
    SELECT 1
    FROM dntt_allocations a
    JOIN de_nghi_thanh_toan d ON d.id = a.dntt_id
    JOIN cong_no cn ON cn.dntt_goc_id = d.id
    WHERE a.chi_phi_id = p_chi_phi_id
      AND d.trang_thai_duyet NOT IN ('da_huy', 'tu_choi')
  ) THEN
    RETURN 0;
  END IF;

  -- Phiếu định kỳ sống của dòng. Khóa theo id giảm dần (thứ tự cố định → 2 giao
  -- dịch cùng phiếu không khóa chéo nhau).
  FOR v_d IN
    SELECT d.id AS dntt_id, d.nha_cung_cap_id AS ncc_id
    FROM de_nghi_thanh_toan d
    WHERE d.id IN (SELECT a.dntt_id FROM dntt_allocations a WHERE a.chi_phi_id = p_chi_phi_id)
      AND d.loai = 'dinh_ky'
      AND d.trang_thai_duyet NOT IN ('da_huy', 'tu_choi')
    ORDER BY d.id DESC
    FOR NO KEY UPDATE OF d
  LOOP
    EXIT WHEN v_can_don <= 0;

    SELECT a.id, a.so_tien INTO v_alloc
    FROM dntt_allocations a
    WHERE a.dntt_id = v_d.dntt_id AND a.chi_phi_id = p_chi_phi_id
    FOR UPDATE;
    CONTINUE WHEN NOT FOUND;

    -- Cam kết tính lại SAU khi khóa phiếu, KHÔNG tin cột cache so_tien_da_dntt.
    SELECT COALESCE(sum(a.so_tien), 0) INTO v_cam_ket
    FROM dntt_allocations a
    JOIN de_nghi_thanh_toan d ON d.id = a.dntt_id
    WHERE a.chi_phi_id = p_chi_phi_id
      AND d.trang_thai_duyet NOT IN ('da_huy', 'tu_choi');
    EXIT WHEN v_cam_ket - v_cp.net < 1;  -- hết phần vượt

    v_lay := floor(LEAST(v_can_don, v_cam_ket - v_cp.net, v_alloc.so_tien));
    CONTINUE WHEN v_lay <= 0;

    SELECT COALESCE(array_agg(x.chi_phi_id), '{}') INTO v_phieu
    FROM dntt_allocations x
    WHERE x.dntt_id = v_d.dntt_id;

    -- Ứng viên nhận (lọc như useDinhKyChiPhiList + anKhoiDinhKy), CÙNG NCC với
    -- phiếu: cùng phiếu, hoặc cùng kỳ với dòng bị giảm. SKIP LOCKED: dòng giao dịch
    -- khác đang giữ thì bỏ qua lần này — không chờ (không deadlock) và không cộng
    -- dồn lên room đã đọc cũ.
    SELECT COALESCE(array_agg(u.id), '{}') INTO v_ung_vien
    FROM (
      SELECT c.id
      FROM doan_chi_phi c
      LEFT JOIN doan dn ON dn.id = c.doan_id
      WHERE c.id <> p_chi_phi_id
        AND COALESCE(c.thanh_toan_dinh_ky, false)
        AND NOT c.ks_huy
        AND COALESCE(c.trang_thai_thanh_toan, '') <> 'paid'
        AND COALESCE(c.trang_thai_dntt, '') NOT IN ('cong_no', 'hoan_tien')
        AND dn.trang_thai IS DISTINCT FROM 'huy'
        AND c.nha_cung_cap_id IS NOT DISTINCT FROM v_d.ncc_id
        AND (
          c.id = ANY (v_phieu)
          OR COALESCE(c.ky_thanh_toan,
               to_char(CASE WHEN c.ngoai_tour AND c.ngoai_tour_ci IS NOT NULL
                            THEN c.ngoai_tour_ci ELSE dn.ngay_di END, 'YYYY-MM'))
             IS NOT DISTINCT FROM v_cp.ky
        )
      ORDER BY c.id
      FOR UPDATE OF c SKIP LOCKED
    ) u;

    SELECT
      COALESCE(array_agg(r.cid  ORDER BY r.cid) FILTER (WHERE r.cung_phieu), '{}'),
      COALESCE(array_agg(r.room ORDER BY r.cid) FILTER (WHERE r.cung_phieu), '{}'),
      COALESCE(sum(r.room) FILTER (WHERE r.cung_phieu), 0),
      COALESCE(array_agg(r.cid  ORDER BY r.cid) FILTER (WHERE NOT r.cung_phieu), '{}'),
      COALESCE(array_agg(r.room ORDER BY r.cid) FILTER (WHERE NOT r.cung_phieu), '{}'),
      COALESCE(sum(r.room) FILTER (WHERE NOT r.cung_phieu), 0)
      INTO v_ids1, v_ws1, v_room1, v_ids2, v_ws2, v_room2
    FROM (
      SELECT c.id AS cid,
             c.id = ANY (v_phieu) AS cung_phieu,
             floor(GREATEST(COALESCE(c.thanh_tien_thuc_te, c.tien_cong_ty, 0), 0)
                   - COALESCE(ck.cam_ket, 0)) AS room
      FROM doan_chi_phi c
      LEFT JOIN LATERAL (
        SELECT sum(a2.so_tien) AS cam_ket
        FROM dntt_allocations a2
        JOIN de_nghi_thanh_toan d2 ON d2.id = a2.dntt_id
        WHERE a2.chi_phi_id = c.id
          AND d2.trang_thai_duyet NOT IN ('da_huy', 'tu_choi')
      ) ck ON true
      WHERE c.id = ANY (v_ung_vien)
    ) r
    WHERE r.room > 0;

    v_da1 := 0; v_n1 := 0; v_da2 := 0; v_n2 := 0;

    IF LEAST(v_lay, v_room1) > 0 THEN
      WITH chia AS (
        SELECT p.chi_phi_id, p.so_tien
        FROM public.chia_theo_ty_le(LEAST(v_lay, v_room1), v_ids1, v_ws1) p
        WHERE p.so_tien > 0
      ), cap_nhat AS (
        UPDATE dntt_allocations a
        SET so_tien = a.so_tien + chia.so_tien
        FROM chia
        WHERE a.dntt_id = v_d.dntt_id AND a.chi_phi_id = chia.chi_phi_id
        RETURNING chia.so_tien
      )
      SELECT COALESCE(sum(so_tien), 0), count(*) INTO v_da1, v_n1 FROM cap_nhat;
      v_cham := v_cham || v_ids1;
    END IF;

    IF LEAST(v_lay - v_da1, v_room2) > 0 THEN
      WITH chia AS (
        SELECT p.chi_phi_id, p.so_tien
        FROM public.chia_theo_ty_le(LEAST(v_lay - v_da1, v_room2), v_ids2, v_ws2) p
        WHERE p.so_tien > 0
      ), them AS (
        INSERT INTO dntt_allocations (dntt_id, chi_phi_id, so_tien, ghi_chu)
        SELECT v_d.dntt_id, chia.chi_phi_id, chia.so_tien,
               'Tự dồn từ chi phí #' || p_chi_phi_id || ' (chi phí giảm sau khi đề nghị)'
        FROM chia
        ON CONFLICT (dntt_id, chi_phi_id)
          DO UPDATE SET so_tien = dntt_allocations.so_tien + EXCLUDED.so_tien
        RETURNING so_tien AS so_tien_moi
      )
      SELECT count(*) INTO v_n2 FROM them;
      -- RETURNING ở nhánh ON CONFLICT trả tổng MỚI, không phải phần cộng thêm → tính
      -- phần đã chia từ chính chia_theo_ty_le (tổng của nó = đúng số yêu cầu).
      v_da2 := CASE WHEN v_n2 > 0 THEN LEAST(v_lay - v_da1, v_room2) ELSE 0 END;
      v_cham := v_cham || v_ids2;
    END IF;

    v_chuyen := v_da1 + v_da2;
    CONTINUE WHEN v_chuyen <= 0;

    -- CHECK so_tien > 0 → về 0 thì xoá dòng allocation.
    IF v_alloc.so_tien - v_chuyen <= 0 THEN
      DELETE FROM dntt_allocations WHERE id = v_alloc.id;
    ELSE
      UPDATE dntt_allocations SET so_tien = so_tien - v_chuyen WHERE id = v_alloc.id;
    END IF;

    UPDATE de_nghi_thanh_toan
    SET ghi_chu = concat_ws(E'\n', NULLIF(ghi_chu, ''), format(
      '[Tự phân bổ lại %s] Chi phí #%s (%s) giảm còn %s ₫, thấp hơn phần phiếu đã gán '
        || '→ chuyển %s ₫ sang %s chi phí còn thiếu cùng NCC/kỳ. Tổng phiếu giữ nguyên.',
      to_char(now() AT TIME ZONE 'Asia/Ho_Chi_Minh', 'DD/MM/YYYY'),
      p_chi_phi_id,
      COALESCE(v_cp.ten_doan, 'đoàn #' || v_cp.doan_id),
      replace(to_char(v_cp.net, 'FM999,999,999,990'), ',', '.'),
      replace(to_char(v_chuyen, 'FM999,999,999,990'), ',', '.'),
      v_n1 + v_n2))
    WHERE id = v_d.dntt_id;

    v_tong_don := v_tong_don + v_chuyen;
    v_can_don  := v_can_don - v_chuyen;
  END LOOP;

  IF v_tong_don > 0 THEN
    PERFORM public.recalc_chi_phi_payment_status(v_cham);

    INSERT INTO activity_log (user_id, ho_ten, action, table_name, record_id, mo_ta, doan_id)
    VALUES (
      auth.uid(), 'Hệ thống', 'sua', 'dntt_allocations', p_chi_phi_id::text,
      format('Chi phí #%s giảm còn %s ₫, thấp hơn phần đã đề nghị định kỳ → tự chuyển %s ₫ '
               || 'sang chi phí còn thiếu cùng NCC/kỳ (tổng phiếu giữ nguyên)',
             p_chi_phi_id,
             replace(to_char(v_cp.net, 'FM999,999,999,990'), ',', '.'),
             replace(to_char(v_tong_don, 'FM999,999,999,990'), ',', '.')),
      v_cp.doan_id
    );
  END IF;

  RETURN v_tong_don;
END;
$$;

COMMENT ON FUNCTION public.dinh_ky_don_phan_du(bigint, numeric) IS
  'Chuyển tối đa p_so_tien phần ĐNTT định kỳ đang vượt chi phí của 1 dòng sang các '
  'dòng còn thiếu cùng NCC (cùng phiếu, rồi cùng kỳ). Không dồn nếu dòng có phiếu sống '
  'đã có công nợ đối ứng. Tổng phiếu giữ nguyên. Trả về số đã dồn.';

-- ── 3. Trigger: dòng định kỳ giảm chi phí xuống dưới phần đã đề nghị ─────────
-- AFTER + chỉ UPDATE OF 2 cột tiền: recalc (chạy bên trong) chỉ ghi so_tien_da_*
-- / trang_thai_* nên không tự kích hoạt lại trigger này.
-- WHEN đọc so_tien_da_dntt (cache) để lọc rẻ; hàm tự tính lại cam kết thật.
-- Lỗi khi dồn KHÔNG được làm hỏng lần lưu chi phí: có caller bỏ qua lỗi update
-- (cascade đổi số khách) → hỏng ở đây là mất luôn sửa đổi chi phí mà không ai biết.
CREATE OR REPLACE FUNCTION public.trg_dinh_ky_don_phan_du()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  BEGIN
    PERFORM public.dinh_ky_don_phan_du(
      NEW.id,
      GREATEST(COALESCE(OLD.thanh_tien_thuc_te, OLD.tien_cong_ty, 0), 0)
        - GREATEST(COALESCE(NEW.thanh_tien_thuc_te, NEW.tien_cong_ty, 0), 0)
    );
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO activity_log (user_id, ho_ten, action, table_name, record_id, mo_ta, doan_id)
    VALUES (auth.uid(), 'Hệ thống', 'loi', 'dntt_allocations', NEW.id::text,
            'Không tự dồn được phần đề nghị định kỳ vượt chi phí: ' || SQLERRM, NEW.doan_id);
  END;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_dinh_ky_don_phan_du ON public.doan_chi_phi;
CREATE TRIGGER trg_dinh_ky_don_phan_du
AFTER UPDATE OF tien_cong_ty, thanh_tien_thuc_te ON public.doan_chi_phi
FOR EACH ROW
WHEN (
  COALESCE(NEW.thanh_toan_dinh_ky, false)
  AND COALESCE(NEW.thanh_tien_thuc_te, NEW.tien_cong_ty, 0)
      < COALESCE(OLD.thanh_tien_thuc_te, OLD.tien_cong_ty, 0)
  AND COALESCE(NEW.so_tien_da_dntt, 0)
      > GREATEST(COALESCE(NEW.thanh_tien_thuc_te, NEW.tien_cong_ty, 0), 0)
)
EXECUTE FUNCTION public.trg_dinh_ky_don_phan_du();

-- Chỉ trigger (chạy dưới quyền owner) gọi các hàm này — không mở cho client.
-- Supabase tự GRANT EXECUTE hàm mới cho anon/authenticated → phải REVOKE đích danh.
REVOKE ALL ON FUNCTION public.chia_theo_ty_le(numeric, bigint[], numeric[]) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.dinh_ky_don_phan_du(bigint, numeric) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.trg_dinh_ky_don_phan_du() FROM PUBLIC, anon, authenticated;

-- ── 4. Dọn dữ liệu đang lệch ─────────────────────────────────────────────────
-- Dồn TOÀN BỘ phần vượt của các dòng định kỳ hiện có (hàm vẫn bỏ qua phiếu có công
-- nợ đối ứng). Bỏ qua thêm đoàn đã có công nợ với NCC đó: phần vượt có thể đã được
-- ghi công nợ qua phiếu per-đoàn — dồn nữa là xử lý hai lần.
DO $mig$
DECLARE
  r     record;
  v_don numeric;
  n     int := 0;
BEGIN
  FOR r IN
    SELECT c.id,
           COALESCE(c.so_tien_da_dntt, 0)
             - GREATEST(COALESCE(c.thanh_tien_thuc_te, c.tien_cong_ty, 0), 0) AS vuot
    FROM doan_chi_phi c
    WHERE COALESCE(c.thanh_toan_dinh_ky, false)
      AND COALESCE(c.so_tien_da_dntt, 0)
          > GREATEST(COALESCE(c.thanh_tien_thuc_te, c.tien_cong_ty, 0), 0)
      AND NOT EXISTS (
        SELECT 1 FROM cong_no cn
        WHERE cn.doan_id = c.doan_id
          AND cn.nha_cung_cap_id IS NOT DISTINCT FROM c.nha_cung_cap_id
      )
    ORDER BY c.id
  LOOP
    v_don := public.dinh_ky_don_phan_du(r.id, r.vuot);
    n := n + 1;
    RAISE NOTICE 'Chi phí #%: vượt % → đã dồn %', r.id, r.vuot, v_don;
  END LOOP;
  RAISE NOTICE 'Đã soát % dòng định kỳ đang vượt phần đã đề nghị', n;
END
$mig$;
