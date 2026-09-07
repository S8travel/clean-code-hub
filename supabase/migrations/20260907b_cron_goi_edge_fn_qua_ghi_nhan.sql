-- Đổi 4 job cron sang gọi edge function QUA `public.cron_goi_http` để kết quả thật
-- được ghi lại (xem 20260907_theo_doi_cron_goi_edge_fn.sql), và vá hạn chờ.
--
-- ⚠️ VÁ QUAN TRỌNG: `sync-dntt-to-sheet-30min` là job DUY NHẤT không đặt
-- `timeout_milliseconds` → pg_net lấy mặc định **5 giây**, trong khi ba job kia đều
-- 120 giây. Edge fn phải đọc vài nghìn dòng ĐNTT rồi ghi Google Sheet nên 5 giây là
-- không đủ: đo 07/09/2026 có 5/15 lượt `timed_out = true`. Nay đặt 120 giây như các
-- job khác.
--
-- Nội dung request giữ NGUYÊN (url, header, secret đọc từ vault) — chỉ bọc thêm lớp
-- ghi nhận. Riêng job sync-dntt dùng `Authorization: Bearer <khoá anon LEGACY>` nằm
-- ngay trong command; migration này lấy lại đúng khoá đó TỪ DB thay vì chép vào file
-- (repo đang PUBLIC). Việc chuyển khoá legacy sang publishable key là việc riêng,
-- chưa làm ở đây để không đổi hai thứ cùng lúc.

-- ── 1. Ba job dùng secret trong vault: viết thẳng được, không có bí mật trong file ──
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'push-portal-2lan-ngay') THEN
    PERFORM cron.unschedule('push-portal-2lan-ngay');
  END IF;
END $$;

SELECT cron.schedule(
  'push-portal-2lan-ngay',
  '0 1,9 * * *',
  $cron$
  SELECT public.cron_goi_http(
    'push-portal-2lan-ngay',
    'https://lflsbwoqzmbknzdpaequ.supabase.co/functions/v1/push-portal',
    jsonb_build_object(
      'Content-Type',    'application/json',
      'x-portal-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets
                          WHERE name = 'portal_cron_secret')
    ),
    '{}'::jsonb,
    120000
  );
  $cron$
);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'sync-chi-phi-weekly') THEN
    PERFORM cron.unschedule('sync-chi-phi-weekly');
  END IF;
END $$;

SELECT cron.schedule(
  'sync-chi-phi-weekly',
  '0 8 * * 4',
  $cron$
  SELECT public.cron_goi_http(
    'sync-chi-phi-weekly',
    'https://lflsbwoqzmbknzdpaequ.supabase.co/functions/v1/sync-chi-phi-to-sheet',
    jsonb_build_object(
      'Content-Type',  'application/json',
      'x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets
                        WHERE name = 'chi_phi_cron_secret')
    ),
    '{}'::jsonb,
    120000
  );
  $cron$
);

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
  SELECT public.cron_goi_http(
    'sync-su-co-weekly',
    'https://lflsbwoqzmbknzdpaequ.supabase.co/functions/v1/sync-su-co-to-sheet',
    jsonb_build_object(
      'Content-Type',  'application/json',
      'x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets
                        WHERE name = 'su_co_cron_secret')
    ),
    '{}'::jsonb,
    120000
  );
  $cron$
);

-- ── 2. Job sync-dntt: lấy lại khoá từ command cũ, KHÔNG chép khoá vào file ──────
DO $$
DECLARE
  v_token text;
  v_cmd   text;
BEGIN
  SELECT substring(command from 'Bearer ([A-Za-z0-9_.\-]+)')
    INTO v_token
  FROM cron.job WHERE jobname = 'sync-dntt-to-sheet-30min';

  IF v_token IS NULL OR length(v_token) < 20 THEN
    RAISE EXCEPTION 'Khong doc duoc token tu command cua sync-dntt-to-sheet-30min — dung lai de khoi lam hong job dang chay';
  END IF;

  v_cmd := format(
    $f$SELECT public.cron_goi_http('sync-dntt-to-sheet-30min', 'https://lflsbwoqzmbknzdpaequ.supabase.co/functions/v1/sync-dntt-to-sheet', jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer %s'), '{}'::jsonb, 120000);$f$,
    v_token
  );

  PERFORM cron.unschedule('sync-dntt-to-sheet-30min');
  PERFORM cron.schedule('sync-dntt-to-sheet-30min', '*/30 * * * *', v_cmd);
END $$;
