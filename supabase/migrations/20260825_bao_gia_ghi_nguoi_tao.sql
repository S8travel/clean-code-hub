-- Ghi lại AI TẠO báo giá.
-- Project lflsbwoqzmbknzdpaequ. ĐÃ APPLY PROD 25/08/2026.
--
-- Đo trước khi sửa: MỌI dòng hiện có đều bỏ trống `created_by` — chỗ tạo báo giá
-- chưa bao giờ điền cột này, và cột cũng không có DEFAULT.
--
-- Hệ quả vừa lộ ra khi làm "đối tác yêu cầu sửa chương trình": chuông đáng lẽ
-- gọi đúng người làm báo giá, nhưng created_by rỗng nên lần nào cũng rơi về
-- nhánh dự phòng (nhóm bật cờ `nhan_yeu_cau_doi_tac`). Hai người đó nhận hết mọi
-- yêu cầu của mọi báo giá — đúng thứ làm người ta ngừng đọc chuông.
--
-- Đặt DEFAULT ở DB thay vì sửa chỗ tạo bên client: báo giá sinh ra từ nhiều
-- đường (modal tạo mới, nhân bản, tạo từ yêu cầu đối tác), vá từng chỗ thì sót
-- một chỗ là lại rỗng. Insert bằng service_role (edge function) vẫn để trống —
-- đúng, vì lúc đó không có người nào đứng sau thao tác.
--
-- KHÔNG backfill dòng cũ: không có dữ liệu nào nói ai đã tạo chúng, đoán bừa
-- thì tệ hơn để trống. Chúng vẫn đi nhánh dự phòng như hiện nay.
ALTER TABLE public.bao_gia
  ALTER COLUMN created_by SET DEFAULT auth.uid();

COMMENT ON COLUMN public.bao_gia.created_by IS
  'Người tạo báo giá (auth.uid() lúc INSERT). Nhận chuông khi đối tác yêu cầu sửa.';
