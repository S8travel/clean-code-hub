-- Tạm ẩn cấp 2 (Kế toán Thanh toán). ĐNTT mới INSERT auto-stamp cả cấp 1 và 2.
-- Trigger notify: INSERT có cả tp_dh_duyet_luc + kttt_duyet_luc → notify cấp 3.
-- Backfill ĐNTT cũ ở cấp 2.
-- Để bật lại cấp 2: chỉ stamp tp_dh_duyet_luc trong auto_pass_dntt_level_1.

CREATE OR REPLACE FUNCTION auto_pass_dntt_level_1()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.trang_thai_duyet = 'cho_duyet' THEN
    IF NEW.tp_dh_duyet_luc IS NULL THEN
      NEW.tp_dh_duyet_luc := COALESCE(NEW.tao_luc, now());
      NEW.tp_dh_duyet_boi := NEW.tao_boi;
    END IF;
    IF NEW.kttt_duyet_luc IS NULL THEN
      NEW.kttt_duyet_luc := COALESCE(NEW.tao_luc, now());
      NEW.kttt_duyet_boi := NEW.tao_boi;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

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
    IF NEW.kttt_duyet_luc IS NOT NULL THEN
      notify_level := 3;
      notify_user_id := '0f9c9c0f-d949-4e04-85cf-185f924afcaf'::uuid;
    ELSIF NEW.tp_dh_duyet_luc IS NOT NULL THEN
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
SET kttt_duyet_luc = COALESCE(tp_dh_duyet_luc, tao_luc, created_at, now()),
    kttt_duyet_boi = COALESCE(tp_dh_duyet_boi, tao_boi)
WHERE trang_thai_duyet = 'cho_duyet'
  AND kttt_duyet_luc IS NULL;
