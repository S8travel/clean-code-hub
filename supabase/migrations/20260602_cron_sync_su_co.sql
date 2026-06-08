-- pg_cron: tự động gọi edge function sync-su-co-to-sheet sáng thứ 7 hàng tuần.
-- '0 1 * * 6' = 1h UTC thứ 7 = 8h00 thứ 7 giờ VN → báo cáo TUẦN VỪA KẾT THÚC
-- (thứ 7 tuần trước → thứ 6 hôm qua, 7 ngày). Edge fn tự tính khoảng khi body rỗng.
--
-- ⚠️ ÁP MIGRATION NÀY SAU CÙNG. Trước khi áp, phải:
--   1. Đã deploy edge function sync-su-co-to-sheet (verify_jwt = false).
--   2. Đã đặt secret cho edge function: GCP_SA_JSON (đã có), SU_CO_SHEET_ID,
--      SU_CO_CRON_SECRET, (tuỳ chọn) SU_CO_REPORT_NGUOI_BAO_CAO, SU_CO_REPORT_BO_PHAN,
--      RESEND_API_KEY (đã có), SU_CO_REPORT_EMAIL.
--   3. Đã tạo Vault secret 'su_co_cron_secret' = đúng giá trị env SU_CO_CRON_SECRET:
--        SELECT vault.create_secret('<secret>', 'su_co_cron_secret');
--      Cron đọc lại secret này qua vault.decrypted_secrets — KHÔNG để secret trong git.
--
-- Project ref trong URL: lflsbwoqzmbknzdpaequ.

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Idempotent: gỡ job cũ nếu áp lại migration.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'sync-su-co-weekly') THEN
    PERFORM cron.unschedule('sync-su-co-weekly');
  END IF;
END $$;

SELECT cron.schedule(
  'sync-su-co-weekly',
  '0 1 * * 6',
  $cron$
  SELECT net.http_post(
    url     := 'https://lflsbwoqzmbknzdpaequ.supabase.co/functions/v1/sync-su-co-to-sheet',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets
                        WHERE name = 'su_co_cron_secret')
    ),
    body    := '{}'::jsonb,
    timeout_milliseconds := 120000
  );
  $cron$
);
