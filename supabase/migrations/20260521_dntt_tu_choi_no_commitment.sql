-- ĐNTT bị từ chối (tu_choi) KHÔNG còn được tính là cam kết thanh toán.
-- Trước: so_tien_da_dntt = SUM(alloc WHERE trang_thai_duyet != 'da_huy') → tính cả tu_choi
--        → chi phí có ĐNTT bị từ chối bị "treo" commitment ảo, và tạo ĐNTT mới sẽ double-count.
-- Sau:  loại luôn tu_choi (NOT IN ('da_huy','tu_choi')) → từ chối = coi như bỏ; tạo ĐNTT mới sạch.
-- da_tt (đã trả) không đổi — vốn chỉ tính 'da_duyet'.

CREATE OR REPLACE FUNCTION public.recalc_chi_phi_payment_status(p_chi_phi_ids bigint[])
 RETURNS void
 LANGUAGE plpgsql
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

-- Cập nhật lại các chi phí đang dính ĐNTT tu_choi để so_tien_da_dntt phản ánh đúng ngay.
SELECT recalc_chi_phi_payment_status(
  ARRAY(
    SELECT DISTINCT a.chi_phi_id
    FROM dntt_allocations a
    JOIN de_nghi_thanh_toan d ON d.id = a.dntt_id
    WHERE d.trang_thai_duyet = 'tu_choi'
  )::bigint[]
);
