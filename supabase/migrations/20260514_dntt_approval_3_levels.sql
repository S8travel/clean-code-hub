-- 3-level approval cho ĐNTT: TP Điều hành → Kế toán TT → Kế toán trưởng
-- Trang_thai_duyet vẫn giữ (cho_duyet/da_duyet/tu_choi/da_huy) nhưng chỉ
-- chuyển 'da_duyet' khi đủ 3 cấp. Cấp 1, 2 chỉ stamp người duyệt + thời gian.

ALTER TABLE de_nghi_thanh_toan
  ADD COLUMN IF NOT EXISTS tp_dh_duyet_boi uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS tp_dh_duyet_luc timestamptz,
  ADD COLUMN IF NOT EXISTS kttt_duyet_boi uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS kttt_duyet_luc timestamptz,
  ADD COLUMN IF NOT EXISTS ktt_duyet_boi  uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS ktt_duyet_luc  timestamptz;

-- Backfill ĐNTT đã 'da_duyet': set cả 3 cấp = duyet_boi/duyet_luc cũ
-- (duyet_boi có thể NULL với legacy data, ok — UI hiển thị "—").
UPDATE de_nghi_thanh_toan
SET tp_dh_duyet_boi = duyet_boi, tp_dh_duyet_luc = duyet_luc,
    kttt_duyet_boi = duyet_boi, kttt_duyet_luc = duyet_luc,
    ktt_duyet_boi  = duyet_boi, ktt_duyet_luc  = duyet_luc
WHERE trang_thai_duyet = 'da_duyet'
  AND duyet_luc IS NOT NULL;

CREATE OR REPLACE VIEW public.dntt_with_payment_status AS
SELECT
  d.id, d.doan_id, d.loai, d.mo_ta,
  d.nha_cung_cap_id, d.ten_nha_cung_cap, d.so_tai_khoan, d.ngan_hang,
  d.so_tien, d.tao_boi, d.tao_luc, d.duyet_boi, d.duyet_luc, d.ghi_chu,
  d.ref_loai, d.ref_id, d.created_at, d.trang_thai_duyet,
  d.la_coc, d.ty_le_coc, d.ngay_can_thanh_toan,
  d.hoa_don_url, d.unc_url, d.trang_thai_hoa_don, d.trang_thai_unc,
  COALESCE(p.paid_amount, 0::numeric) AS paid_amount,
  CASE
    WHEN COALESCE(p.paid_amount, 0::numeric) = 0::numeric THEN 'unpaid'::text
    WHEN COALESCE(p.paid_amount, 0::numeric) >= d.so_tien THEN 'paid'::text
    ELSE 'partial'::text
  END AS payment_status,
  p.last_payment_at AS thanh_toan_luc,
  d.quyet_toan_data,
  d.tp_dh_duyet_boi, d.tp_dh_duyet_luc,
  d.kttt_duyet_boi,  d.kttt_duyet_luc,
  d.ktt_duyet_boi,   d.ktt_duyet_luc
FROM de_nghi_thanh_toan d
LEFT JOIN (
  SELECT payments.dntt_id,
         sum(payments.so_tien) AS paid_amount,
         max(payments.ngay_thanh_toan) AS last_payment_at
  FROM payments
  GROUP BY payments.dntt_id
) p ON p.dntt_id = d.id;

GRANT SELECT ON public.dntt_with_payment_status TO anon, authenticated, service_role;
