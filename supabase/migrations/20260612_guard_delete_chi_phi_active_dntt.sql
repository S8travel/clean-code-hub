-- Tường cứng DB: KHÔNG cho xóa doan_chi_phi còn ĐNTT HIỆU LỰC (chưa hủy/từ chối).
--
-- Bối cảnh: quy tắc "đã cam kết ĐNTT thì không xóa chi phí" trước đây chỉ được
-- enforce ở tầng app (useDeleteChiPhi + các guard điều tour). Đường khác — CASCADE
-- (apply seri DELETE thẳng), RPC, edge function, hoặc thao tác DB trực tiếp — vẫn
-- xóa được → CASCADE xoá luôn dntt_allocations của ĐNTT cọc đã trả → mất dấu phần
-- đã cọc/đã trả → ĐNTT khoản còn lại tính sai. Trigger này là tường chót: chặn ở
-- DB nên bắt MỌI đường, kể cả TOCTOU/race mà guard client không với tới.
--
-- Phạm vi: CHỈ chặn theo ĐNTT hiệu lực (trang_thai_duyet NOT IN da_huy,tu_choi) —
-- KHÔNG chặn theo so_tien_da_tt. Lý do: flow hủy ĐNTT đã trả tạo cong_no rồi
-- AUTO-XÓA chi phí orphan (ĐNTT đã da_huy, so_tien_da_tt có thể còn > 0) — flow đó
-- PHẢI chạy được. Khớp đúng semantics getActiveDnttIdsForChiPhi + useDeleteChiPhi.
--
-- SECURITY DEFINER + search_path khoá: để SELECT trong trigger thấy allocations
-- bất kể RLS (tránh fail-open: RLS ẩn alloc → trigger tưởng "sạch" → cho xóa nhầm).

CREATE OR REPLACE FUNCTION public.guard_delete_chi_phi_active_dntt()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_dntt_ids text;
BEGIN
  SELECT string_agg('#' || d.id::text, ', ' ORDER BY d.id)
    INTO v_dntt_ids
  FROM public.dntt_allocations a
  JOIN public.de_nghi_thanh_toan d ON d.id = a.dntt_id
  WHERE a.chi_phi_id = OLD.id
    AND d.trang_thai_duyet NOT IN ('da_huy', 'tu_choi');

  IF v_dntt_ids IS NOT NULL THEN
    RAISE EXCEPTION
      'Không thể xóa chi phí "%" — còn ĐNTT hiệu lực (%). Hủy ĐNTT trước, hoặc dùng "Điều chỉnh" sửa số lượng/đơn giá về 0 thay vì xóa.',
      COALESCE(NULLIF(OLD.mo_ta, ''), 'id ' || OLD.id::text), v_dntt_ids
      USING ERRCODE = 'raise_exception';
  END IF;

  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_delete_chi_phi_active_dntt ON public.doan_chi_phi;
CREATE TRIGGER trg_guard_delete_chi_phi_active_dntt
  BEFORE DELETE ON public.doan_chi_phi
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_delete_chi_phi_active_dntt();
