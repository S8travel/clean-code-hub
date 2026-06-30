-- ============================================================================
-- GỠ MÌN duplicate-key cascade cảnh điểm — sync mo_ta về tên hiện tại (2026-06-27)
-- ----------------------------------------------------------------------------
-- Bug: cascade điều tour dedupe chi phí cảnh điểm theo `mo_ta`, nhưng UNIQUE là
-- (doan_id, ngay_so, danh_muc, ref_doan_ngay_item_id). Khi đổi tên cảnh điểm,
-- dòng chi phí cũ giữ mo_ta cũ → lần lưu điều tour sau dedupe trượt → INSERT đụng
-- UNIQUE (duplicate key, save fail giữa chừng). Code đã fix (lookup fallback theo
-- ref). Migration này gỡ sẵn các "quả mìn" tồn đọng: dòng MAIN có mo_ta lệch tên
-- cảnh điểm hiện tại (đo được 100 dòng) → đồng bộ mo_ta = canh_diem.ten.
--
-- AN TOÀN: mo_ta KHÔNG nằm trong unique/foc/tiền — chỉ là nhãn hiển thị. Loại
-- extras (mo_ta LIKE '[%'). Idempotent (chạy lại = 0 dòng). KHÔNG đụng tiền.
-- ============================================================================

UPDATE public.doan_chi_phi cp
SET mo_ta = cd.ten
FROM public.doan_ngay_item dni
JOIN public.canh_diem cd ON cd.id = dni.canh_diem_id
WHERE cp.ref_doan_ngay_item_id = dni.id
  AND cp.danh_muc = 'canh_diem'
  AND cp.ref_doan_ngay_item_id IS NOT NULL
  AND cp.mo_ta NOT LIKE '[%'
  AND cp.mo_ta IS DISTINCT FROM cd.ten;
