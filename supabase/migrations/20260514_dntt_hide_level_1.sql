-- Tạm ẩn cấp 1 (TP Điều hành) trong duyệt ĐNTT.
-- ĐNTT mới INSERT tự được stamp cấp 1 done = ngay lúc tạo.
-- Trigger notify update: INSERT khi cấp 1 đã có timestamp → notify cấp 2.
-- Backfill ĐNTT cũ ở cấp 1 (cho_duyet, tp_dh_duyet_luc IS NULL) → auto-pass.
-- Để bật lại cấp 1: DROP trigger trg_auto_pass_dntt_level_1.

CREATE OR REPLACE FUNCTION auto_pass_dntt_level_1()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.trang_thai_duyet = 'cho_duyet' AND NEW.tp_dh_duyet_luc IS NULL THEN
    NEW.tp_dh_duyet_luc := COALESCE(NEW.tao_luc, now());
    NEW.tp_dh_duyet_boi := NEW.tao_boi;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_auto_pass_dntt_level_1 ON de_nghi_thanh_toan;
CREATE TRIGGER trg_auto_pass_dntt_level_1
BEFORE INSERT ON de_nghi_thanh_toan
FOR EACH ROW
EXECUTE FUNCTION auto_pass_dntt_level_1();

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
    IF NEW.tp_dh_duyet_luc IS NOT NULL THEN
      notify_level := 2;
      notify_user_id := 'f3a0420f-84a5-41d7-b83c-4aaee353d41c'::uuid;
    ELSE
      notify_level := 1;
      notify_user_id := '882d2911-5084-479c-a452-45b226045c6e'::uuid;
    END IF;
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

UPDATE de_nghi_thanh_toan
SET tp_dh_duyet_luc = COALESCE(tao_luc, created_at, now()),
    tp_dh_duyet_boi = tao_boi
WHERE trang_thai_duyet = 'cho_duyet'
  AND tp_dh_duyet_luc IS NULL;
