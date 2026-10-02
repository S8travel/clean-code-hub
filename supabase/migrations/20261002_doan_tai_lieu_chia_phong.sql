-- Loại tài liệu mới 'chia_phong' (分房表) cho đoàn.
--
-- Đại lý tải 分房表 lên cổng đối tác (edge fn gui-giay-to bên cổng → giay-to-doi-tac
-- bên CRM), hoặc OP tự tải ở tab Tài liệu khi đại lý gửi qua mail/LINE. Cổng dùng
-- việc có file này để hiện trạng thái "đã chia phòng" trên danh sách đoàn.
--
-- Giống hop_dong / danh_sach_khach: MỘT file mỗi đoàn, tải lại là thay file cũ.
-- Unique là PARTIAL index nên phải dựng lại để có thêm 'chia_phong'.

ALTER TABLE public.doan_tai_lieu DROP CONSTRAINT IF EXISTS doan_tai_lieu_loai_check;
ALTER TABLE public.doan_tai_lieu
  ADD CONSTRAINT doan_tai_lieu_loai_check
  CHECK (loai = ANY (ARRAY['bao_gia', 'hop_dong', 'danh_sach_khach', 'chia_phong', 'khac']));

DROP INDEX IF EXISTS public.doan_tai_lieu_doan_loai_fixed_unique;
CREATE UNIQUE INDEX doan_tai_lieu_doan_loai_fixed_unique
  ON public.doan_tai_lieu (doan_id, loai)
  WHERE loai = ANY (ARRAY['hop_dong', 'danh_sach_khach', 'chia_phong']);
