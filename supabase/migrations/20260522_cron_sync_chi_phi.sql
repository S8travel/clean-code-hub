-- pg_cron: tự động gọi edge function sync-chi-phi-to-sheet chiều thứ 5 hàng tuần.
-- '0 9 * * 4' = 9h UTC thứ 5 = 16h00 thứ 5 giờ VN (Supabase chạy giờ UTC).
--
-- ⚠️ ÁP MIGRATION NÀY SAU CÙNG. Trước khi áp, phải:
--   1. Đã deploy edge function sync-chi-phi-to-sheet (verify_jwt = false).
--   2. Đã đặt các secret cho edge function: GCP_SA_JSON, CHI_PHI_SHEET_ID,
--      CHI_PHI_CRON_SECRET, RESEND_API_KEY, CHI_PHI_REPORT_EMAIL.
--   3. Đã tạo Vault secret 'chi_phi_cron_secret' = đúng giá trị env CHI_PHI_CRON_SECRET:
--        SELECT vault.create_secret('<secret>', 'chi_phi_cron_secret');
--      Cron đọc lại secret này qua vault.decrypted_secrets — KHÔNG để secret trong git.
--
-- Project ref trong URL: lflsbwoqzmbknzdpaequ.

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Idempotent: gỡ job cũ nếu áp lại migration.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'sync-chi-phi-weekly') THEN
    PERFORM cron.unschedule('sync-chi-phi-weekly');
  END IF;
END $$;

SELECT cron.schedule(
  'sync-chi-phi-weekly',
  '0 9 * * 4',
  $cron$
  SELECT net.http_post(
    url     := 'https://lflsbwoqzmbknzdpaequ.supabase.co/functions/v1/sync-chi-phi-to-sheet',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets
                        WHERE name = 'chi_phi_cron_secret')
    ),
    body    := '{}'::jsonb,
    timeout_milliseconds := 120000
  );
  $cron$
);
