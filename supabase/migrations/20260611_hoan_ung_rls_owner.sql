-- ============================================================================
-- HOÀN ỨNG (Chi phí văn phòng) — chủ đơn tự tạo/xem được (2026-06-11)
-- ----------------------------------------------------------------------------
-- Bối cảnh: 20260609_van_phong_hard_scope đặt RLS de_nghi_thanh_toan sao cho
-- bản ghi doan_id=NULL CHỈ cross-VP (admin/giam_doc) + kế toán thấy/ghi.
-- Nhưng hoàn ứng (loai='hoan_ung', doan_id=NULL) do MỌI nhân viên tự tạo cho
-- chính mình (trang /hoan-ung mở cho toàn bộ nhân viên):
--   • Điều hành tạo đơn → INSERT bị WITH CHECK chặn (42501).
--   • Điều hành mở danh sách → rỗng, kể cả đơn của chính mình
--     (view dntt_with_payment_status là security_invoker).
-- Cùng lớp lỗi với bug công nợ rời (20260610_cong_no_roi_visible_all).
--
-- Quyết định: thêm policy CỘNG THÊM (additive, OR với van_phong_scope):
--   1. de_nghi_thanh_toan: chủ đơn (tao_boi/nguoi_ung_id = auth.uid()) toàn quyền
--      trên đơn hoàn ứng CỦA MÌNH (tạo / xem / hủy / xóa khi tu_choi).
--   2. payments: chủ đơn ĐỌC payments của đơn hoàn ứng mình (để view tính
--      paid_amount/payment_status đúng). KHÔNG cho ghi — mark paid là kế toán.
-- Duyệt + thanh toán vẫn là kế toán/cross-VP qua nhánh policy sẵn có.
-- Rollback: DROP POLICY hoan_ung_owner ON de_nghi_thanh_toan;
--           DROP POLICY hoan_ung_owner_select ON payments;
-- ============================================================================

DROP POLICY IF EXISTS hoan_ung_owner ON public.de_nghi_thanh_toan;
CREATE POLICY hoan_ung_owner ON public.de_nghi_thanh_toan
  FOR ALL TO public
  USING (
    auth.uid() IS NOT NULL
    AND doan_id IS NULL
    AND loai = 'hoan_ung'
    AND (tao_boi = auth.uid() OR nguoi_ung_id = auth.uid())
  )
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND doan_id IS NULL
    AND loai = 'hoan_ung'
    AND (tao_boi = auth.uid() OR nguoi_ung_id = auth.uid())
  );

DROP POLICY IF EXISTS hoan_ung_owner_select ON public.payments;
CREATE POLICY hoan_ung_owner_select ON public.payments
  FOR SELECT TO public
  USING (
    auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.de_nghi_thanh_toan dn
      WHERE dn.id = payments.dntt_id
        AND dn.doan_id IS NULL
        AND dn.loai = 'hoan_ung'
        AND (dn.tao_boi = auth.uid() OR dn.nguoi_ung_id = auth.uid())
    )
  );
