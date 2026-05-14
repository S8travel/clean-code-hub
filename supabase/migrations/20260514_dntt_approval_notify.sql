-- Notification cho ĐNTT khi vào cấp đang chờ duyệt:
--   Cấp 1 → Võ Thị Minh Xuân  (882d2911-5084-479c-a452-45b226045c6e)
--   Cấp 2 → Trần Thị Ánh Hồng  (f3a0420f-84a5-41d7-b83c-4aaee353d41c)
--   Cấp 3 → Nguyễn Chí Linh    (0f9c9c0f-d949-4e04-85cf-185f924afcaf)
-- Mapping hard-code theo yêu cầu nghiệp vụ; đổi user → đổi UUID dưới.

ALTER TABLE thong_bao ADD COLUMN IF NOT EXISTS dntt_id bigint
  REFERENCES de_nghi_thanh_toan(id) ON DELETE CASCADE;

CREATE OR REPLACE FUNCTION notify_dntt_approval_user()
RETURNS TRIGGER AS $$
DECLARE
  notify_user_id uuid;
  notify_level int;
  doan_name text;
  trigger_notify boolean := false;
BEGIN
  IF NEW.trang_thai_duyet <> 'cho_duyet' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    notify_level := 1;
    notify_user_id := '882d2911-5084-479c-a452-45b226045c6e'::uuid;
    trigger_notify := true;
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.tp_dh_duyet_luc IS NULL AND NEW.tp_dh_duyet_luc IS NOT NULL THEN
      notify_level := 2;
      notify_user_id := 'f3a0420f-84a5-41d7-b83c-4aaee353d41c'::uuid;
      trigger_notify := true;
    ELSIF OLD.kttt_duyet_luc IS NULL AND NEW.kttt_duyet_luc IS NOT NULL THEN
      notify_level := 3;
      notify_user_id := '0f9c9c0f-d949-4e04-85cf-185f924afcaf'::uuid;
      trigger_notify := true;
    END IF;
  END IF;

  IF trigger_notify THEN
    SELECT ten_doan INTO doan_name FROM doan WHERE id = NEW.doan_id;
    INSERT INTO thong_bao (user_id, doan_id, doan_ten, dntt_id, loai, tieu_de, noi_dung, is_read)
    VALUES (
      notify_user_id,
      NEW.doan_id,
      doan_name,
      NEW.id,
      'dntt_can_duyet',
      'ĐNTT cần duyệt (cấp ' || notify_level || ')',
      COALESCE(NEW.mo_ta, '') || ' — ' || to_char(NEW.so_tien, 'FM999G999G999') || ' VND',
      false
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_notify_dntt_approval ON de_nghi_thanh_toan;
CREATE TRIGGER trg_notify_dntt_approval
AFTER INSERT OR UPDATE ON de_nghi_thanh_toan
FOR EACH ROW
EXECUTE FUNCTION notify_dntt_approval_user();
