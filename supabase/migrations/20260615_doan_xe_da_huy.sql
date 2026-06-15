-- Đánh dấu xe của đoàn đã hủy (chọn "Đã hủy xe" trong form sửa đoàn).
-- doan.xe_id là FK tới nha_xe_loai_xe nên không nhét được giá trị giả → dùng cột boolean riêng.
-- Khi xe_da_huy = true thì xe_id được set NULL (xem DoanDrawer onChange).
-- ALTER trên bảng có sẵn → KHÔNG cần GRANT lại (bảng giữ nguyên grants cũ).
ALTER TABLE public.doan
  ADD COLUMN IF NOT EXISTS xe_da_huy boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.doan.xe_da_huy IS
  'Đánh dấu xe của đoàn đã hủy. true → xe_id = NULL. Chọn qua mục "Đã hủy xe" trong form sửa đoàn.';
