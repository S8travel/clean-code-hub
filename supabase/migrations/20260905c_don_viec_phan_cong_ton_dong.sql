-- Dọn tồn đọng của luồng "phân người phụ trách" (một lần, sau khi vá cron).
--
-- Đo ngày 05/09/2026: 77 đoàn bị đánh dấu "chưa phân người", trong đó
--   • 28 đoàn là BÁO NHẦM — đã phân đủ Khách sạn + Nhà hàng & DV + Xe, chỉ còn
--     Visa và Vé máy bay để trống. Đều là tour inbound, hai mục đó do khách/đối
--     tác lo. Bảng phân việc cũ chỉ đóng khi đủ CẢ 5 mục nên chúng treo mãi.
--     Luật mới ở src/lib/phan-viec-muc.ts đã sửa cho các đoàn về sau; migration
--     này dọn số đã treo.
--   • 49 đoàn thiếu người Nhà hàng & DV thật → GIỮ NGUYÊN, cron sẽ nhắc.
--
-- Và 70 đầu việc MỒ CÔI: đoàn đã bị xoá (FK ON DELETE SET NULL) nhưng việc vẫn
-- nằm trong danh sách của 12 người, cũ nhất từ 19/05. Chính chúng làm chết cron.
-- Đóng bằng trạng thái 'huy' — không xoá, vẫn tra cứu lại được.

-- ── 1. Đóng việc "cần phân người" của đoàn ĐÃ phân đủ mục bắt buộc ───────────
-- Mục bắt buộc: inbound/nội địa = KS + NH&DV + Xe; outbound = thêm Visa.
WITH bat_buoc AS (
  SELECT d.id AS doan_id, k.key
  FROM doan d
  CROSS JOIN LATERAL unnest(
    CASE WHEN d.loai_tour = 'outbound'
         THEN ARRAY['pv_ks','pv_nh_dv','pv_xe','pv_visa']
         ELSE ARRAY['pv_ks','pv_nh_dv','pv_xe'] END
  ) AS k(key)
),
con_thieu AS (
  SELECT DISTINCT b.doan_id
  FROM bat_buoc b
  WHERE NOT EXISTS (
    SELECT 1 FROM cong_viec c
    WHERE c.doan_id = b.doan_id AND c.loai_viec = b.key AND c.trang_thai <> 'huy'
  )
)
UPDATE cong_viec cv
SET trang_thai = 'hoan_thanh',
    ghi_chu_ket_qua = coalesce(cv.ghi_chu_ket_qua || ' · ', '')
      || 'Tự đóng 05/09/2026: đã có người cho mọi đầu việc bắt buộc '
      || '(Visa/Vé máy bay của tour inbound không tính là thiếu).',
    updated_at = now()
WHERE cv.loai_viec = 'pv_phancong'
  AND cv.trang_thai IN ('cho_nhan','dang_lam')
  AND cv.doan_id IS NOT NULL
  AND cv.doan_id NOT IN (SELECT doan_id FROM con_thieu);

-- ── 2. Đóng đầu việc mồ côi (đoàn đã bị xoá) ─────────────────────────────────
UPDATE cong_viec
SET trang_thai = 'huy',
    ghi_chu_ket_qua = coalesce(ghi_chu_ket_qua || ' · ', '')
      || 'Tự đóng 05/09/2026: đoàn đã bị xoá, việc không còn đối tượng.',
    updated_at = now()
WHERE doan_id IS NULL
  AND trang_thai IN ('cho_nhan','dang_lam');
