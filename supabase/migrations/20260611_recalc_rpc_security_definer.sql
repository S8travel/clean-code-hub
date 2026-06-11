-- ============================================================================
-- recalc_chi_phi_payment_status → SECURITY DEFINER (2026-06-11)
-- ----------------------------------------------------------------------------
-- Bối cảnh: RPC này trước là SECURITY INVOKER → chạy dưới RLS NGƯỜI GỌI.
-- Sau 20260609_van_phong_hard_scope, điều này gây 2 lỗi tính trạng thái chi phí:
--   1. Điều hành gọi recalc (sửa chi phí inline / rebooking cascade) KHÔNG thấy
--      ĐNTT định kỳ (doan_id NULL — chỉ kế toán/cross-VP) → JOIN rớt allocation:
--      chi phí có CẢ alloc định kỳ + alloc thường sẽ bị GHI ĐÈ so_tien_da_tt
--      thiếu phần định kỳ → hiện "chưa trả đủ" → nguy cơ tạo ĐNTT bổ sung trùng.
--   2. Kế toán bị scope VP mark paid ĐNTT định kỳ gộp nhiều VP → UPDATE
--      doan_chi_phi của đoàn ngoài scope bị RLS bỏ qua im lặng → chi phí đó
--      kẹt "unpaid" dù đã trả.
-- Đây là hàm hệ thống tính giá trị DERIVED (so_tien_da_dntt/da_tt/trạng thái) —
-- phải nhìn TOÀN CỤC allocations + DNTT + payments mới đúng, bất kể ai trigger.
-- SECURITY DEFINER + search_path cố định (pattern is_admin/current_user_*).
-- Không rò dữ liệu: RETURNS void, chỉ ghi giá trị derived.
-- Thân hàm GIỮ NGUYÊN 20260521_dntt_tu_choi_no_commitment.
-- Rollback: chạy lại 20260521 (bản INVOKER).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.recalc_chi_phi_payment_status(p_chi_phi_ids bigint[])
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  UPDATE doan_chi_phi cp
  SET
    so_tien_da_dntt = COALESCE(s.da_dntt, 0),
    so_tien_da_tt = COALESCE(s.da_tt, 0),
    trang_thai_thanh_toan = CASE
      WHEN COALESCE(s.da_tt, 0) = 0 THEN 'unpaid'
      WHEN COALESCE(s.da_tt, 0) >= COALESCE(cp.thanh_tien_thuc_te, cp.thanh_tien) THEN 'paid'
      ELSE 'partial_paid'
    END,
    trang_thai_dntt = CASE
      WHEN COALESCE(s.has_cho_duyet, false) THEN 'cho_duyet'
      WHEN COALESCE(s.has_da_duyet_unpaid, false) THEN 'da_duyet'
      WHEN COALESCE(s.da_tt, 0) >= COALESCE(cp.thanh_tien_thuc_te, cp.thanh_tien) THEN 'da_thanh_toan'
      WHEN COALESCE(s.da_tt, 0) > 0 THEN 'thanh_toan_mot_phan'
      ELSE 'chua_de_nghi'
    END
  FROM (
    SELECT
      a.chi_phi_id,
      SUM(CASE WHEN d.trang_thai_duyet NOT IN ('da_huy', 'tu_choi') THEN a.so_tien ELSE 0 END) AS da_dntt,
      SUM(
        CASE
          WHEN d.trang_thai_duyet = 'da_duyet' AND COALESCE(p.paid, 0) > 0
          THEN a.so_tien * LEAST(1.0, COALESCE(p.paid, 0)::numeric / NULLIF(d.so_tien, 0))
          ELSE 0
        END
      ) AS da_tt,
      BOOL_OR(d.trang_thai_duyet = 'cho_duyet') AS has_cho_duyet,
      BOOL_OR(d.trang_thai_duyet = 'da_duyet' AND COALESCE(p.paid, 0) < d.so_tien) AS has_da_duyet_unpaid
    FROM dntt_allocations a
    JOIN de_nghi_thanh_toan d ON d.id = a.dntt_id
    LEFT JOIN (
      SELECT dntt_id, SUM(so_tien) AS paid FROM payments GROUP BY dntt_id
    ) p ON p.dntt_id = a.dntt_id
    WHERE a.chi_phi_id = ANY(p_chi_phi_ids)
    GROUP BY a.chi_phi_id
  ) s
  WHERE cp.id = ANY(p_chi_phi_ids)
    AND cp.id = s.chi_phi_id;

  -- Reset chi phí không còn allocation nào
  UPDATE doan_chi_phi cp
  SET so_tien_da_dntt = 0,
      so_tien_da_tt = 0,
      trang_thai_thanh_toan = 'unpaid',
      trang_thai_dntt = 'chua_de_nghi'
  WHERE cp.id = ANY(p_chi_phi_ids)
    AND NOT EXISTS (
      SELECT 1 FROM dntt_allocations a WHERE a.chi_phi_id = cp.id
    );
END;
$function$;

-- SECURITY DEFINER → siết EXECUTE: chỉ user đăng nhập + service_role (anon không
-- có lý do recalc; khớp hardening 20260601).
REVOKE EXECUTE ON FUNCTION public.recalc_chi_phi_payment_status(bigint[]) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.recalc_chi_phi_payment_status(bigint[]) TO authenticated, service_role;
