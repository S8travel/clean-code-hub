-- Lưu subject của email booking để mail UNC sau này có thể vào cùng thread.
-- Gmail group emails theo subject + sender + recipient (sau khi strip Re:/Fwd:)
-- → cần subject UNC = subject booking gốc.

ALTER TABLE doan_booking_ks ADD COLUMN IF NOT EXISTS email_subject text;
ALTER TABLE doan_booking_nh ADD COLUMN IF NOT EXISTS email_subject text;
ALTER TABLE doan_booking_dv ADD COLUMN IF NOT EXISTS email_subject text;
