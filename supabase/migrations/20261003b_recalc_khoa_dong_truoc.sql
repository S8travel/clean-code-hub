-- ============================================================================
-- recalc_chi_phi_payment_status: khóa các dòng TRƯỚC khi tính tổng (2026-10-03)
-- ----------------------------------------------------------------------------
-- Lỗi mất cập nhật (đã tái hiện trên PostgreSQL thật, 2 phiên):
--   recalc là UPDATE doan_chi_phi ... FROM (SELECT tổng allocation/payment ...).
--   Dưới READ COMMITTED, khi UPDATE phải chờ khóa một dòng rồi chạy tiếp, Postgres
--   chỉ kiểm lại DÒNG ĐÍCH (EvalPlanQual) — tổng trong subquery vẫn tính từ
--   snapshot lúc câu lệnh bắt đầu. Giao dịch đang đổi allocation của các dòng đó
--   (trigger trg_dinh_ky_don_phan_du dồn phần dư — migration 20261003; tạo / hủy
--   ĐNTT) commit sau → recalc này ghi đè so_tien_da_dntt bằng số CŨ → "Còn" ở trang
--   Thanh toán định kỳ phình lại đúng phần vừa dồn, và trigger (WHEN đọc cột cache
--   này) có thể không chạy ở lần giảm sau.
--
-- Sửa: khóa các dòng (FOR NO KEY UPDATE, theo id) rồi mới UPDATE. Mỗi câu lệnh
-- plpgsql lấy snapshot mới → hai UPDATE sau thấy đủ allocation của giao dịch vừa
-- nhả khóa. ORDER BY id → 2 recalc chạy song song khóa cùng thứ tự, không deadlock.
-- Gọi từ trong trigger thì các dòng đã do chính giao dịch đó giữ → không chờ.
-- FOR NO KEY UPDATE không chặn insert allocation/payment (FK chỉ lấy KEY SHARE).
--
-- Thân hàm còn lại GIỮ NGUYÊN bản đang chạy trên prod (pg_get_functiondef
-- 03/10/2026, đã có guard is_tk_chi_xem của 20260728_tai_khoan_chi_xem — file
-- 20260521 trong repo chưa có guard đó). CREATE OR REPLACE giữ nguyên GRANT hiện có.
--
-- Rollback: chạy lại khối CREATE OR REPLACE dưới đây bỏ câu PERFORM.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.recalc_chi_phi_payment_status(p_chi_phi_ids bigint[])
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN

  IF public.is_tk_chi_xem() THEN
    RAISE EXCEPTION 'Tài khoản chỉ xem — không thực hiện được thao tác này'
      USING ERRCODE = '42501';
  END IF;

  PERFORM 1 FROM doan_chi_phi
  WHERE id = ANY(p_chi_phi_ids)
  ORDER BY id
  FOR NO KEY UPDATE;

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
