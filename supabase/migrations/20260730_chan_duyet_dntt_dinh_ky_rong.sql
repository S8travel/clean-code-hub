-- ============================================================================
-- Chặn duyệt PHIẾU RỖNG của luồng thanh toán định kỳ (2026-07-30)
-- ----------------------------------------------------------------------------
-- 20260710_dntt_atomic_insert.sql dựng 2 tầng chống phiếu rỗng, nhưng tầng trigger
-- chỉ phủ `ref_loai IN ('doan_chi_phi','khach_san')` với lý do ghi ngay trong file:
--   "(hoan_ung / hdv / dinh_ky có ref_loai khác → không đụng tới.)"
-- Tiền đề đó SAI với `dinh_ky`: useCreateBatchDNTT (trang Thanh toán định kỳ)
-- allocate THẲNG vào doan_chi_phi của nhiều đoàn — y hệt luồng per-đoàn.
--
-- Hậu quả của lỗ này: phiếu gộp cuối tháng bị rỗng (client cũ insert phiếu trước,
-- allocations sau, không transaction — đứt giữa chừng vì mất mạng / chi phí vừa bị
-- xoá / token hết hạn) vẫn DUYỆT VÀ CHI ĐƯỢC, trong khi recalc_chi_phi_payment_status
-- không thấy allocation nào nên mọi dòng chi phí của cụm vẫn `so_tien_da_dntt = 0`
-- → kỳ sau cụm đó lại hiện "còn phải đề nghị" → TRẢ TIỀN HAI LẦN.
-- Khó thấy hơn luồng per-đoàn: phiếu rỗng không có allocation nên `ky_hieu_luc` =
-- NULL, nó rơi vào cụm "Chưa rõ tháng", nằm ngoài cụm tháng kế toán đang làm.
--
-- Client đã chuyển sang RPC nguyên tử `create_dntt_with_allocations` (cùng ngày,
-- use-thanh-toan-dinh-ky.ts) — đây là tầng chốt chặn thứ hai cho phiếu lọt bằng
-- đường khác (client cũ đang mở, script tay).
--
-- CREATE OR REPLACE FUNCTION: trigger cũ trỏ vào chính hàm này nên không cần dựng
-- lại trigger, cũng không cần GRANT.
--
-- Rollback: chạy lại khối CREATE OR REPLACE FUNCTION ở 20260710_dntt_atomic_insert.sql.
-- ============================================================================

-- SECURITY DEFINER (bản 20260710 là INVOKER): đếm allocation là kiểm TÍNH TOÀN VẸN
-- DỮ LIỆU, phải nhìn toàn bảng. Chạy dưới quyền người bấm duyệt thì RLS văn phòng
-- (20260627_rls_initplan_perf.sql — dntt_allocations lọc theo van_phong_id của đoàn,
-- kế toán KHÔNG cross-VP) có thể giấu hết allocation của một phiếu GỘP hợp lệ →
-- `NOT EXISTS` thành true → chặn oan, kèm lời khuyên sai ("hủy phiếu rồi tạo lại").
-- Hàm chỉ ĐỌC + RAISE, không ghi gì → không cần guard is_tk_chi_xem() (CLAUDE.md).
CREATE OR REPLACE FUNCTION public.chan_duyet_dntt_khong_allocation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.trang_thai_duyet = 'da_duyet'
     AND OLD.trang_thai_duyet IS DISTINCT FROM 'da_duyet'
     AND NEW.ref_loai IN ('doan_chi_phi', 'khach_san', 'dinh_ky')
     AND NOT EXISTS (SELECT 1 FROM dntt_allocations a WHERE a.dntt_id = NEW.id)
  THEN
    RAISE EXCEPTION
      'ĐNTT #% không gắn với dòng chi phí nào (phiếu rỗng) — không thể duyệt. Hủy phiếu này và tạo lại.',
      NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.chan_duyet_dntt_khong_allocation() IS
  'Chặn duyệt ĐNTT gắn chi phí mà không có allocation (phiếu rỗng → chi tiền xong '
  'chi phí vẫn báo chưa đề nghị → trả hai lần). Phủ doan_chi_phi, khach_san, dinh_ky.';

-- ── Báo cáo phiếu rỗng ĐANG TỒN (không tự xử — phải người quyết) ─────────────
-- Phiếu đã duyệt/đã chi từ trước KHÔNG bị trigger đụng (nó chỉ chặn lúc CHUYỂN sang
-- da_duyet). Phiếu rỗng còn `cho_duyet` thì từ nay bấm duyệt sẽ báo lỗi — đúng ý:
-- kế toán hủy nó rồi tạo lại từ trang định kỳ.
DO $mig$
DECLARE r record; n int := 0;
BEGIN
  FOR r IN
    SELECT d.id, d.loai, d.ref_loai, d.trang_thai_duyet, d.so_tien,
           COALESCE(p.paid, 0) AS da_tra
    FROM de_nghi_thanh_toan d
    LEFT JOIN (SELECT dntt_id, sum(so_tien) AS paid FROM payments GROUP BY dntt_id) p
      ON p.dntt_id = d.id
    WHERE d.ref_loai IN ('doan_chi_phi', 'khach_san', 'dinh_ky')
      AND d.trang_thai_duyet NOT IN ('da_huy', 'tu_choi')
      AND NOT EXISTS (SELECT 1 FROM dntt_allocations a WHERE a.dntt_id = d.id)
    ORDER BY d.id
  LOOP
    n := n + 1;
    RAISE NOTICE 'PHIẾU RỖNG #% loai=% ref=% trạng thái=% số tiền=% đã trả=%',
      r.id, r.loai, r.ref_loai, r.trang_thai_duyet, r.so_tien, r.da_tra;
  END LOOP;
  IF n > 0 THEN
    RAISE NOTICE '→ % phiếu rỗng đang tồn. Phiếu ĐÃ CHI cần đối chiếu tay (tiền đã ra '
      'nhưng chi phí vẫn báo chưa đề nghị); phiếu chưa chi thì hủy rồi tạo lại.', n;
  ELSE
    RAISE NOTICE 'Không có phiếu rỗng nào đang tồn. OK.';
  END IF;
END $mig$;
