-- PR B nhà xe thứ 2: booking xe theo TỪNG xe (mỗi nhà xe 1 booking riêng để
-- gửi mail + theo dõi trạng thái độc lập). Trước đây UNIQUE(doan_id) → 1 row/đoàn.
-- ALTER (không CREATE TABLE) → KHÔNG cần GRANT lại.

ALTER TABLE public.doan_booking_xe
  ADD COLUMN IF NOT EXISTS xe_id bigint NULL REFERENCES public.nha_xe_loai_xe(id) ON DELETE SET NULL;

-- Backfill: booking cũ (1 row/đoàn) gắn về xe CHÍNH của đoàn.
UPDATE public.doan_booking_xe b
SET xe_id = d.xe_id
FROM public.doan d
WHERE b.doan_id = d.id AND b.xe_id IS NULL AND d.xe_id IS NOT NULL;

-- Đổi UNIQUE(doan_id) → UNIQUE(doan_id, xe_id): mỗi xe 1 booking. NON-deferrable
-- để upsert onConflict("doan_id,xe_id") chạy được (xem bài học DEFERRABLE).
ALTER TABLE public.doan_booking_xe DROP CONSTRAINT IF EXISTS doan_booking_xe_doan_id_key;
ALTER TABLE public.doan_booking_xe
  ADD CONSTRAINT doan_booking_xe_doan_id_xe_id_key UNIQUE (doan_id, xe_id);
