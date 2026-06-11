-- ============================================================================
-- AUDIT LOG DANH MỤC — trigger DB ghi activity_log (2026-06-11)
-- ----------------------------------------------------------------------------
-- Bối cảnh: giá set menu GODA bị đổi (+8% VAT) mà không truy được ai/lúc nào —
-- bảng danh mục không có updated_at, activity_log chỉ phủ đoàn/chi phí/ĐNTT.
-- Làm ở tầng TRIGGER (không phải client) vì:
--   • Bắt được MỌI đường ghi (UI, SQL tay, script) — không sót call site.
--   • Có old → new chính xác (client không giữ giá trị cũ).
--   • Miễn nhiễm lỗi client kiểu "PostgrestBuilder lazy thiếu .then" (đã dính
--     ở buildAuditLogger — log chi phí câm lặng suốt từ PR #141).
--
-- Chỉ log khi CỘT THEO DÕI (tiền / hệ số tính toán / tài khoản thanh toán) đổi.
-- Đổi ghi chú / email / địa chỉ... → KHÔNG log (tránh nhiễu).
-- INSERT/DELETE log kèm giá trị các cột theo dõi (giá khởi tạo cũng là chứng cứ
-- — vd set 250k/300k của GODA được TẠO sẵn với giá +8%).
-- user: auth.uid() (NULL nếu service_role/script → hiểu là "hệ thống/tay").
-- doan_id = NULL (log danh mục không thuộc đoàn nào) — xem ở admin list.
-- Rollback: DROP TRIGGER trg_log_danh_muc ON <7 bảng>; DROP FUNCTION log_danh_muc_change;
-- ============================================================================

CREATE OR REPLACE FUNCTION public.log_danh_muc_change()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_nhan      text  := TG_ARGV[0];  -- nhãn tiếng Việt hiện trong mô tả
  v_label_col text  := TG_ARGV[1];  -- cột tên hiển thị (ten / ten_set / ...)
  v_old   jsonb := CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE to_jsonb(OLD) END;
  v_new   jsonb := CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE to_jsonb(NEW) END;
  v_row   jsonb := COALESCE(v_new, v_old);
  v_label text;
  v_action text;
  v_parts text[] := '{}';
  v_col   text;
  i int;
  v_ho_ten text;
BEGIN
  v_label := COALESCE(v_row->>v_label_col, '#' || (v_row->>'id'));

  IF TG_OP = 'UPDATE' THEN
    FOR i IN 2 .. TG_NARGS - 1 LOOP
      v_col := TG_ARGV[i];
      IF (v_old->>v_col) IS DISTINCT FROM (v_new->>v_col) THEN
        v_parts := v_parts || format('%s: %s → %s',
          v_col, COALESCE(v_old->>v_col, '—'), COALESCE(v_new->>v_col, '—'));
      END IF;
    END LOOP;
    -- Không đụng cột theo dõi → không log
    IF array_length(v_parts, 1) IS NULL THEN
      RETURN NULL;
    END IF;
    v_action := 'sua';
  ELSIF TG_OP = 'INSERT' THEN
    v_action := 'tao';
    FOR i IN 2 .. TG_NARGS - 1 LOOP
      v_col := TG_ARGV[i];
      IF v_new->>v_col IS NOT NULL AND v_col <> v_label_col THEN
        v_parts := v_parts || format('%s: %s', v_col, v_new->>v_col);
      END IF;
    END LOOP;
  ELSE -- DELETE
    v_action := 'xoa';
    FOR i IN 2 .. TG_NARGS - 1 LOOP
      v_col := TG_ARGV[i];
      IF v_old->>v_col IS NOT NULL AND v_col <> v_label_col THEN
        v_parts := v_parts || format('%s: %s', v_col, v_old->>v_col);
      END IF;
    END LOOP;
  END IF;

  SELECT ur.ho_ten INTO v_ho_ten
  FROM public.user_roles ur WHERE ur.user_id = auth.uid() LIMIT 1;

  INSERT INTO public.activity_log (user_id, ho_ten, action, table_name, record_id, doan_id, mo_ta)
  VALUES (
    auth.uid(), v_ho_ten, v_action, TG_TABLE_NAME, v_row->>'id', NULL,
    v_nhan || ' "' || v_label || '"'
      || CASE WHEN array_length(v_parts, 1) IS NOT NULL
              THEN ' — ' || array_to_string(v_parts, '; ')
              ELSE '' END
  );
  RETURN NULL;
END;
$$;

-- ── Gắn trigger: (nhãn, cột label, ...cột theo dõi) ─────────────────────────

DROP TRIGGER IF EXISTS trg_log_danh_muc ON public.nha_hang_set_menu;
CREATE TRIGGER trg_log_danh_muc
AFTER INSERT OR UPDATE OR DELETE ON public.nha_hang_set_menu
FOR EACH ROW EXECUTE FUNCTION public.log_danh_muc_change(
  'Set menu NH', 'ten_set', 'ten_set', 'gia', 'don_vi', 'loai_gia', 'gia_thue_tau');

DROP TRIGGER IF EXISTS trg_log_danh_muc ON public.nha_hang;
CREATE TRIGGER trg_log_danh_muc
AFTER INSERT OR UPDATE OR DELETE ON public.nha_hang
FOR EACH ROW EXECUTE FUNCTION public.log_danh_muc_change(
  'Nhà hàng', 'ten', 'ten', 'foc_khach', 'foc_mien', 'chiet_khau_phan_tram',
  'tinh_suat_tl', 'nguoi_thanh_toan', 'tai_khoan_thanh_toan');

DROP TRIGGER IF EXISTS trg_log_danh_muc ON public.khach_san;
CREATE TRIGGER trg_log_danh_muc
AFTER INSERT OR UPDATE OR DELETE ON public.khach_san
FOR EACH ROW EXECUTE FUNCTION public.log_danh_muc_change(
  'Khách sạn', 'ten', 'ten', 'foc_khach', 'foc_mien',
  'nguoi_thanh_toan', 'tai_khoan_thanh_toan');

DROP TRIGGER IF EXISTS trg_log_danh_muc ON public.canh_diem;
CREATE TRIGGER trg_log_danh_muc
AFTER INSERT OR UPDATE OR DELETE ON public.canh_diem
FOR EACH ROW EXECUTE FUNCTION public.log_danh_muc_change(
  'Cảnh điểm/DV', 'ten', 'ten', 'gia_mac_dinh', 'don_vi', 'co_phi',
  'nguoi_thanh_toan', 'tai_khoan_thanh_toan');

DROP TRIGGER IF EXISTS trg_log_danh_muc ON public.nha_xe_loai_xe;
CREATE TRIGGER trg_log_danh_muc
AFTER INSERT OR UPDATE OR DELETE ON public.nha_xe_loai_xe
FOR EACH ROW EXECUTE FUNCTION public.log_danh_muc_change(
  'Loại xe', 'ten_xe', 'ten_xe', 'gia', 'so_cho', 'don_vi');

DROP TRIGGER IF EXISTS trg_log_danh_muc ON public.loai_visa;
CREATE TRIGGER trg_log_danh_muc
AFTER INSERT OR UPDATE OR DELETE ON public.loai_visa
FOR EACH ROW EXECUTE FUNCTION public.log_danh_muc_change(
  'Loại visa', 'quoc_gia', 'quoc_gia', 'loai', 'thoi_han', 'gia', 'don_vi');

DROP TRIGGER IF EXISTS trg_log_danh_muc ON public.nha_cung_cap;
CREATE TRIGGER trg_log_danh_muc
AFTER INSERT OR UPDATE OR DELETE ON public.nha_cung_cap
FOR EACH ROW EXECUTE FUNCTION public.log_danh_muc_change(
  'Nhà cung cấp', 'ten', 'ten', 'ma_so_thue', 'so_tai_khoan', 'ngan_hang', 'tra_truoc');
