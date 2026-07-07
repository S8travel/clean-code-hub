-- Fix: báo cáo Lead — funnel + conversion luôn ra 0%.
--
-- Nguyên nhân: get_lead_funnel cũ chỉ đếm COUNT(*) GROUP BY trang_thai HIỆN TẠI
-- (snapshot). Khi lead tiến sang bước sau (vd "Đã báo giá", "Chốt deal") thì bước
-- trước = 0 → frontend tính conversion = cnt[i+1]/cnt[i] ra 0% hoặc chia-cho-0.
-- Lead thực tế còn nhảy LÙI (chot_deal → da_lien_he) và NHẢY CÓC (moi → chot_deal)
-- nên KHÔNG thể suy ra funnel từ snapshot — phải dựa lịch sử đổi trạng thái.
--
-- Cách mới: funnel tích luỹ theo "bước xa nhất từng đạt" (furthest stage reached).
--   - Với mỗi lead: gom mọi trạng thái từng ở (hiện tại + lead_activity.trang_thai_cu/moi
--     + baseline 'moi' vì mọi lead vào phễu ở 'moi'), lấy index bước xa nhất trong pipeline.
--   - funnel[bước k] = số lead có max_idx >= k  → luôn ĐƠN ĐIỆU GIẢM, conversion ∈ [0,100%].
--   - mat_khach KHÔNG phải bước pipeline (bị bỏ qua khi lấy max) nhưng lead mất vẫn được
--     đếm tới bước xa nhất nó đạt trước khi mất (nhờ lịch sử) → không biến mất khỏi phễu.
--
-- Chỉ CREATE OR REPLACE FUNCTION (bảng không đổi) → không cần GRANT/RLS mới.
-- Rollback: CREATE OR REPLACE lại bản cũ (SELECT trang_thai, COUNT(*) GROUP BY trang_thai).

CREATE OR REPLACE FUNCTION public.get_lead_funnel(
  p_from date,
  p_to date,
  p_loai_tour text DEFAULT NULL::text,
  p_van_phong_id bigint DEFAULT NULL::bigint
)
RETURNS TABLE(trang_thai text, cnt bigint)
LANGUAGE sql
STABLE
SET search_path TO 'public', 'pg_temp'
AS $function$
  WITH stage(code, idx) AS (
    VALUES
      ('moi', 0), ('da_lien_he', 1), ('dang_tu_van', 2),
      ('da_bao_gia', 3), ('cho_chot', 4), ('chot_deal', 5)
  ),
  scoped AS (
    SELECT l.id, l.trang_thai
    FROM lead l
    LEFT JOIN user_roles u ON u.user_id = l.assigned_to
    WHERE l.created_at::date BETWEEN p_from AND p_to
      AND (p_loai_tour IS NULL OR l.loai_tour = p_loai_tour)
      AND (p_van_phong_id IS NULL OR u.van_phong_id = p_van_phong_id)
  ),
  -- Mọi trạng thái mỗi lead từng đi qua (baseline moi + hiện tại + lịch sử cu/moi)
  reached AS (
    SELECT s.id, 'moi'::text AS code FROM scoped s
    UNION SELECT s.id, s.trang_thai FROM scoped s
    UNION SELECT a.lead_id, a.trang_thai_moi
      FROM lead_activity a JOIN scoped s ON s.id = a.lead_id
      WHERE a.trang_thai_moi IS NOT NULL
    UNION SELECT a.lead_id, a.trang_thai_cu
      FROM lead_activity a JOIN scoped s ON s.id = a.lead_id
      WHERE a.trang_thai_cu IS NOT NULL
  ),
  -- Bước pipeline xa nhất mỗi lead đạt tới (mat_khach/khác không có idx → bỏ qua)
  furthest AS (
    SELECT r.id, MAX(st.idx) AS max_idx
    FROM reached r
    JOIN stage st ON st.code = r.code
    GROUP BY r.id
  )
  SELECT
    st.code AS trang_thai,
    COUNT(f.id) FILTER (WHERE f.max_idx >= st.idx)::bigint AS cnt
  FROM stage st
  LEFT JOIN furthest f ON f.max_idx >= st.idx
  GROUP BY st.code, st.idx
  ORDER BY st.idx;
$function$;
