-- ============================================================================
-- RPC lấy chi_phi_id của 1 ĐNTT — không bị RLS văn phòng cắt (2026-07-30)
-- ----------------------------------------------------------------------------
-- Mọi thao tác đổi trạng thái ĐNTT (hủy / từ chối / mark paid / gỡ payment) đều
-- chạy 2 bước:
--     getChiPhiIdsForDNTT(id)  → phiếu này phân bổ vào những dòng chi phí nào?
--     recalcChiPhiStatus(ids)  → tính lại cam kết / đã trả cho đúng các dòng đó
-- Bước 2 là RPC SECURITY DEFINER nên ghi được mọi dòng. Bước 1 lại là SELECT trần
-- trên `dntt_allocations` → chịu RLS của người bấm nút. BẤT ĐỐI XỨNG NẰM Ở ĐÓ.
--
-- Policy `van_phong_scope` của dntt_allocations:
--     cross_vp OR (đoàn chứa DÒNG CHI PHÍ thuộc VP của mình)
-- KHÔNG có nhánh "phiếu doan_id IS NULL và người dùng là kế toán" như policy của
-- `payments` và `de_nghi_thanh_toan`. Phiếu gộp định kỳ (doan_id = NULL) gom chi phí
-- của NHIỀU đoàn, nên kế toán chỉ scope một phần VP sẽ chỉ "thấy tên" một phần dòng.
--
-- Hậu quả khi trúng: hủy phiếu gộp → các dòng ngoài scope KHÔNG được tính lại → giữ
-- nguyên cam kết của phiếu đã chết → `còn phải đề nghị = net − cam kết = 0` → biến
-- mất khỏi cụm NCC × tháng vĩnh viễn. Nợ NCC im lặng bốc hơi khỏi hệ thống, không
-- báo lỗi, không ai thấy.
--
-- HIỆN CHƯA CẮN (đo 30/07/2026): mọi đoàn thuộc VP 2 hoặc 3, và cả 7 kế toán đang
-- hoạt động đều có scope {2,3} → bước 1 chưa bao giờ trả thiếu. Đây là lớp chặn
-- TRƯỚC, để hệ thống vẫn đúng khi mở thêm văn phòng hoặc thu hẹp quyền kế toán.
--
-- Vì sao SECURITY DEFINER chứ không nới RLS SELECT trên dntt_allocations: cùng lý do
-- đã chốt ở ca cấn trừ công nợ doan_id=NULL — nới policy đọc mở rộng bề mặt cho MỌI
-- truy vấn khác, còn RPC chỉ mở đúng một câu hỏi hẹp.
--
-- An toàn: hàm CHỈ ĐỌC và chỉ trả về danh sách id (không tiền, không tên NCC, không
-- nội dung chi phí). Đọc được nội dung dòng chi phí vẫn phải qua RLS của
-- `doan_chi_phi`. Vì không ghi nên không cần guard is_tk_chi_xem() (xem CLAUDE.md).
-- Chặn truy cập bằng GRANT chứ KHÔNG bằng `auth.uid() IS NULL`: `anon` đã bị REVOKE
-- EXECUTE nên không gọi được, còn kiểm auth.uid() sẽ chặn nhầm cả service_role /
-- postgres (kết nối server không mang JWT) — chặt hơn cả SELECT trần trước đây.
--
-- Rollback: DROP FUNCTION public.get_chi_phi_ids_for_dntt(bigint);
--           rồi trả getChiPhiIdsForDNTT về SELECT trần.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_chi_phi_ids_for_dntt(p_dntt_id bigint)
RETURNS bigint[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT coalesce(array_agg(a.chi_phi_id ORDER BY a.chi_phi_id), '{}'::bigint[])
  FROM dntt_allocations a
  WHERE a.dntt_id = p_dntt_id;
$$;

REVOKE ALL ON FUNCTION public.get_chi_phi_ids_for_dntt(bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_chi_phi_ids_for_dntt(bigint) TO authenticated, service_role;

COMMENT ON FUNCTION public.get_chi_phi_ids_for_dntt(bigint) IS
  'Danh sách chi_phi_id mà 1 ĐNTT phân bổ vào, KHÔNG bị RLS văn phòng cắt. Dùng trước '
  'recalc_chi_phi_payment_status: recalc là SECURITY DEFINER ghi được mọi dòng, nên nếu '
  'danh sách đầu vào bị cắt thì dòng ngoài scope giữ cam kết của phiếu đã hủy = nợ NCC '
  'biến mất khỏi luồng đề nghị. Chỉ trả id, không trả tiền.';
