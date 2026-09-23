-- Đoàn có từ 3 HDV trở lên (có đoàn 5–6 HDV). Giữ nguyên 2 ô cũ
-- huong_dan_vien_id (chính) + huong_dan_vien_id_2 (phụ) — cổng đối tác, khảo sát
-- khách, báo cáo sự cố, quyết toán… đều đọc 2 cột đó, gom lại thành danh sách sẽ
-- phải sửa hết. Người thứ 3 trở đi nằm ở cột mảng này, KHÔNG gồm chính/phụ.
--
-- Chọn cột mảng trên doan thay vì bảng nối: lưu CÙNG một lệnh UPDATE với đoàn
-- (không có cảnh lưu đoàn xong mà danh sách HDV hỏng giữa chừng), và tự thừa
-- hưởng RLS văn phòng + khóa ghi tài khoản chỉ xem của bảng doan. Tiền lệ:
-- huong_dan_vien.agent_ids / dia_diem_ids.
--
-- Không có FK từng phần tử: HDV bị xoá khỏi danh mục thì id còn nằm lại, nơi đọc
-- (lib/hdv-doan.ts) bỏ qua id không tra được.
--
-- Nơi đọc: Xếp HDV (chặn lịch), mail booking + Word điều tour (in tên + SĐT),
-- người đứng tên phiếu tạm ứng/quyết toán HDV.
--
-- ALTER TABLE thêm cột → bảng giữ nguyên grants/RLS cũ, KHÔNG cần GRANT thêm.
ALTER TABLE public.doan
  ADD COLUMN IF NOT EXISTS hdv_di_cung_ids bigint[] NOT NULL DEFAULT '{}'::bigint[];

-- Phần tử NULL làm vỡ .in("id", ids) và phép so trùng lịch → chặn từ gốc.
ALTER TABLE public.doan
  DROP CONSTRAINT IF EXISTS doan_hdv_di_cung_ids_khong_null;
ALTER TABLE public.doan
  ADD CONSTRAINT doan_hdv_di_cung_ids_khong_null
  CHECK (array_position(hdv_di_cung_ids, NULL) IS NULL);

COMMENT ON COLUMN public.doan.hdv_di_cung_ids IS
  'HDV đi cùng từ người thứ 3 trở đi (không gồm huong_dan_vien_id / huong_dan_vien_id_2). Rỗng = đoàn 1–2 HDV.';
