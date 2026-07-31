-- Cảnh điểm combo đã BAO GỒM bữa ăn (vd Bà Nà: vé cáp treo + buffet trưa).
--
-- Bối cảnh: AI báo giá đọc lịch trình thấy "đi cáp treo" và "ăn buffet trên đỉnh"
-- là 2 ý riêng → trích 2 dòng → khớp cả dòng combo lẫn dòng nhà hàng → TÍNH TIỀN
-- BỮA ĂN 2 LẦN. Danh mục cũ không có chỗ nào diễn đạt "vé này đã gồm bữa ăn" nên
-- cả AI lẫn code đều không thể biết.
--
-- NULL = vé thường (không gồm bữa nào) — giữ nguyên hành vi cũ cho toàn bộ dữ liệu.
-- ALTER TABLE → bảng giữ nguyên GRANT/RLS sẵn có, không cần cấp lại.

ALTER TABLE public.canh_diem
  ADD COLUMN IF NOT EXISTS bao_gom_bua_an text,
  ADD COLUMN IF NOT EXISTS bao_gom_ghi_chu text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.canh_diem'::regclass AND conname = 'canh_diem_bao_gom_bua_an_check'
  ) THEN
    ALTER TABLE public.canh_diem
      ADD CONSTRAINT canh_diem_bao_gom_bua_an_check
      CHECK (bao_gom_bua_an IS NULL OR bao_gom_bua_an IN ('trua', 'toi', 'ca_hai'));
  END IF;
END $$;

COMMENT ON COLUMN public.canh_diem.bao_gom_bua_an IS
  'Combo đã bao gồm bữa ăn: trua | toi | ca_hai. NULL = vé thường. Báo giá AI dùng cờ này để KHÔNG tính tiền bữa ăn cùng ngày 2 lần.';
COMMENT ON COLUMN public.canh_diem.bao_gom_ghi_chu IS
  'Mô tả bữa ăn đã gồm trong combo (vd "buffet trưa tại nhà hàng trên đỉnh") — hiện ở tooltip dòng bị ẩn.';

-- Cờ này ĐỔI SỐ TIỀN báo giá (bật lên là bữa ăn cùng ngày không được tính nữa) và
-- bật được ngay từ màn AI báo giá → phải có dấu vết ai bật/tắt. Trigger audit danh
-- mục nhận cột theo dõi qua ARGV nên buộc phải DROP + CREATE lại (ALTER TRIGGER
-- không sửa được args). Danh sách cột giữ nguyên như cũ, chỉ nối thêm cột mới.
DROP TRIGGER IF EXISTS trg_log_danh_muc ON public.canh_diem;
CREATE TRIGGER trg_log_danh_muc
  AFTER INSERT OR DELETE OR UPDATE ON public.canh_diem
  FOR EACH ROW EXECUTE FUNCTION public.log_danh_muc_change(
    'Cảnh điểm/DV', 'ten',
    'ten', 'gia_mac_dinh', 'don_vi', 'co_phi', 'nguoi_thanh_toan',
    'tai_khoan_thanh_toan', 'bao_gom_bua_an');
