-- Link xem báo giá gửi cho người KHÔNG có tài khoản cổng (khách lẻ, đối tác chưa
-- được cấp tài khoản — nhóm đông hơn nhóm có cổng).
--
-- Nội dung link nằm bên project CỔNG (bảng bao_gia_link + bao_gia_link_ban, đọc
-- qua RPC xem_bao_gia_link). Bên này chỉ giữ đúng phần điều hành cần thấy: link
-- nào đã tạo, hết hạn khi nào, thu hồi chưa, và khách đã mở hay chưa.
--
-- VÌ SAO KHÔNG DỰNG TRANG CÔNG KHAI Ở CHÍNH CRM: project này có giá vốn ở gần
-- như mọi bảng. Một trang mở cho người không đăng nhập là bề mặt tấn công lớn
-- nhất; đặt nó cạnh giá vốn thì một lỗi nhỏ đổi thành lộ giá gốc.

ALTER TABLE public.bao_gia
  -- Token do edge fn sinh (128 bit). Giữ lại để hiện link và thu hồi; KHÔNG
  -- dùng để phân quyền bên này.
  ADD COLUMN IF NOT EXISTS link_token       text,
  ADD COLUMN IF NOT EXISTS link_het_han     date,
  ADD COLUMN IF NOT EXISTS link_thu_hoi     boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS link_tao_luc     timestamptz,
  -- Hai cột dưới do lượt đồng bộ kéo ngược từ cổng về: hiện tại gửi mail xong là
  -- mù hoàn toàn, không biết khách đã đọc hay chưa.
  ADD COLUMN IF NOT EXISTS link_so_lan_mo   integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS link_mo_gan_nhat timestamptz;

COMMENT ON COLUMN public.bao_gia.link_token IS
  'Token trang xem công khai bên cổng. NULL = chưa tạo link cho báo giá này.';
COMMENT ON COLUMN public.bao_gia.link_mo_gan_nhat IS
  'Lần khách mở link gần nhất — đồng bộ ngược từ cổng, KHÔNG ghi tay.';

-- Chỉ vài trăm dòng có link, index một phần là đủ.
CREATE INDEX IF NOT EXISTS idx_bao_gia_link_token
  ON public.bao_gia (link_token)
  WHERE link_token IS NOT NULL;
