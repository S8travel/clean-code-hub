-- ============================================================================
-- ĐỊNH KỲ: dòng phát sinh phải mang cờ của DÒNG CHÍNH (2026-07-30)
-- ----------------------------------------------------------------------------
-- Nút "Định kỳ" ở tab Chi phí NH/DV chỉ ghi `thanh_toan_dinh_ky` vào dòng CHÍNH.
-- Dòng phát sinh ([trua]/[toi] cho nhà hàng, [dvps_<id>] cho dịch vụ) giữ false:
--   • trang Thanh toán định kỳ lọc `thanh_toan_dinh_ky = true` → không thấy nó;
--   • luồng gộp theo NCC trong đoàn (lib/dntt-gop-calc) lại bỏ qua CẢ NHÓM khi
--     dòng chính là định kỳ.
-- → dòng phát sinh không nằm trong luồng đề nghị thanh toán nào cả = tiền bỏ quên.
--
-- Code đã sửa (use-nh-section / use-dv-section + lib/dinh-ky-nhom.ts); migration
-- này dọn dữ liệu CŨ.
--
-- CHỈ chạm dòng AN TOÀN TUYỆT ĐỐI:
--   • dòng chính đang định kỳ, dòng phát sinh chưa;
--   • CẢ HAI chưa có cam kết ĐNTT nào (so_tien_da_dntt = 0).
-- Nhóm đã có ĐNTT bị BỎ QUA CÓ CHỦ Ý: phiếu per-bữa/per-dịch vụ dồn toàn bộ
-- allocation vào dòng chính (so_tien = chính + phát sinh), nên tiền phát sinh ĐÃ
-- được đề nghị rồi — gắn cờ sẽ làm nó hiện lại như "chưa đề nghị" → đề nghị/trả
-- lần hai. Các nhóm đó xử tay qua nút "Thanh toán bổ sung" ở footer nhóm.
--
-- Đồng thời vá `nha_cung_cap_id` cho dòng phát sinh (lấy của dòng chính): trang
-- định kỳ gom cụm theo NCC, thiếu NCC thì dòng rơi vào cụm "Chưa có NCC" và nút
-- Tạo ĐNTT báo "Tháng này không có NCC hợp lệ".
--
-- UPDATE thuần → không cần cấp lại grants/RLS.
--
-- Rollback: không có (chỉ bật cờ cho dòng lẽ ra đã phải bật). Muốn lùi thì tắt
-- định kỳ cho từng bữa/dịch vụ trên UI.
-- ============================================================================

-- ── 1. Nhà hàng: extras [trua] / [toi] ────────────────────────────────────────
-- Dòng chính của bữa = cùng (doan_id, danh_muc, ref_doan_ngay_id), mo_ta KHÔNG có
-- prefix và kết thúc bằng "(trưa)" / "(tối)" — xem lib/nh-chi-phi-resolve.ts.
WITH extra AS (
  SELECT id, doan_id, ref_doan_ngay_id, nha_cung_cap_id,
         CASE WHEN mo_ta LIKE '[trua] %' THEN '% (trưa)' ELSE '% (tối)' END AS main_pattern
  FROM public.doan_chi_phi
  WHERE danh_muc = 'nha_hang'
    AND ref_doan_ngay_id IS NOT NULL
    AND (mo_ta LIKE '[trua] %' OR mo_ta LIKE '[toi] %')
    AND thanh_toan_dinh_ky IS DISTINCT FROM true
    AND COALESCE(so_tien_da_dntt, 0) = 0
),
pair AS (
  SELECT e.id, m.nha_cung_cap_id AS main_ncc
  FROM extra e
  JOIN LATERAL (
    SELECT c.nha_cung_cap_id
    FROM public.doan_chi_phi c
    WHERE c.danh_muc = 'nha_hang'
      AND c.doan_id = e.doan_id
      AND c.ref_doan_ngay_id = e.ref_doan_ngay_id
      AND c.mo_ta LIKE e.main_pattern
      AND c.mo_ta NOT LIKE '[%'
      AND c.thanh_toan_dinh_ky = true
      AND COALESCE(c.so_tien_da_dntt, 0) = 0
    ORDER BY c.id
    LIMIT 1
  ) m ON true
)
UPDATE public.doan_chi_phi d
SET thanh_toan_dinh_ky = true,
    nha_cung_cap_id = COALESCE(d.nha_cung_cap_id, p.main_ncc)
FROM pair p
WHERE d.id = p.id;

-- ── 2. Dịch vụ: extras [dvps_<mainId>] ────────────────────────────────────────
-- Ở đây id dòng chính nằm ngay trong mo_ta → khớp chính xác, không cần đoán.
WITH extra AS (
  SELECT id,
         (regexp_match(mo_ta, '^\[dvps_(\d+)\] '))[1]::bigint AS main_id
  FROM public.doan_chi_phi
  WHERE danh_muc = 'canh_diem'
    AND mo_ta ~ '^\[dvps_\d+\] '
    AND thanh_toan_dinh_ky IS DISTINCT FROM true
    AND COALESCE(so_tien_da_dntt, 0) = 0
),
pair AS (
  SELECT e.id, m.nha_cung_cap_id AS main_ncc
  FROM extra e
  JOIN public.doan_chi_phi m ON m.id = e.main_id
  WHERE m.thanh_toan_dinh_ky = true
    AND COALESCE(m.so_tien_da_dntt, 0) = 0
)
UPDATE public.doan_chi_phi d
SET thanh_toan_dinh_ky = true,
    nha_cung_cap_id = COALESCE(d.nha_cung_cap_id, p.main_ncc)
FROM pair p
WHERE d.id = p.id;

-- ── 3. Kiểm tra: còn dòng phát sinh nào lệch cờ mà chưa có cam kết ĐNTT? ──────
DO $mig$
DECLARE con_lech int;
BEGIN
  SELECT count(*) INTO con_lech
  FROM public.doan_chi_phi e
  JOIN public.doan_chi_phi m
    ON m.id = (regexp_match(e.mo_ta, '^\[dvps_(\d+)\] '))[1]::bigint
  WHERE e.danh_muc = 'canh_diem'
    AND e.mo_ta ~ '^\[dvps_\d+\] '
    AND e.thanh_toan_dinh_ky IS DISTINCT FROM true
    AND COALESCE(e.so_tien_da_dntt, 0) = 0
    AND m.thanh_toan_dinh_ky = true
    AND COALESCE(m.so_tien_da_dntt, 0) = 0;
  IF con_lech > 0 THEN
    RAISE EXCEPTION 'Còn % dòng phát sinh dịch vụ lệch cờ định kỳ', con_lech;
  END IF;
  RAISE NOTICE 'Đồng bộ cờ định kỳ cho dòng phát sinh: OK';
END $mig$;
