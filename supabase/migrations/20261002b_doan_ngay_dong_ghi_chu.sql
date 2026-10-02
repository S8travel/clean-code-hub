-- Dòng ghi chú tự do trong cột "Chương trình" của Điều tour: chuyến bay nội địa, sự
-- kiện, giờ hẹn... OP gõ tay, KHÔNG phải cảnh điểm.
--
-- Cố ý KHÔNG lưu ở doan_ngay_item: bảng đó lái chi phí, booking DV, ĐNTT theo
-- canh_diem_id — một dòng chữ lọt vào đó là thành dòng tiền / mail booking.
--
-- Mỗi phần tử: {"sau": <số cảnh điểm đứng trước dòng này, 0 = đầu ngày>,
--               "noi_dung": <chữ OP gõ>}. Đọc/ghi qua src/lib/dong-ghi-chu.ts.
--
-- Chỉ ALTER TABLE thêm cột → giữ nguyên grant + RLS (kể cả policy chi_xem_*) của bảng.
-- Cột có DEFAULT hằng nên Postgres chỉ sửa metadata, không ghi lại bảng.
ALTER TABLE public.doan_ngay
  ADD COLUMN IF NOT EXISTS dong_ghi_chu jsonb NOT NULL DEFAULT '[]'::jsonb;
