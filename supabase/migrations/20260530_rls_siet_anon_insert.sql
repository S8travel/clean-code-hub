-- Siết RLS: gỡ policy INSERT thừa "Allow public insert" trên các bảng tài chính +
-- danh mục. Mỗi bảng đã có policy `auth_required` (FOR ALL, qual/with_check =
-- auth.uid() IS NOT NULL) bao trùm cả INSERT. Nhưng policy thừa "Allow public insert"
-- (FOR INSERT, role public, WITH CHECK true) khiến INSERT được phép cho BẤT KỲ ai —
-- kể cả `anon` chưa đăng nhập (anon key nằm sẵn trong JS bundle) — vì RLS gộp policy
-- theo phép OR. Hậu quả: ai có URL + anon key đều ghi được vào dntt_allocations
-- (phân bổ thanh toán), nha_xe / nha_xe_loai_xe / don_vi_visa / loai_visa (danh mục giá).
--
-- Sau khi DROP, INSERT vào các bảng này chỉ còn do `auth_required` chi phối →
-- bắt buộc đăng nhập (auth.uid() IS NOT NULL). KHÔNG đụng SELECT/UPDATE/DELETE
-- (đã do auth_required quản). KHÔNG đụng các bảng dùng policy 'authenticated'
-- (doan_nhom, doan_tai_lieu, lead_*, voucher*) — đã yêu cầu đăng nhập.

DROP POLICY IF EXISTS "Allow public insert" ON public.dntt_allocations;
DROP POLICY IF EXISTS "Allow public insert" ON public.nha_xe;
DROP POLICY IF EXISTS "Allow public insert" ON public.nha_xe_loai_xe;
DROP POLICY IF EXISTS "Allow public insert" ON public.don_vi_visa;
DROP POLICY IF EXISTS "Allow public insert" ON public.loai_visa;
