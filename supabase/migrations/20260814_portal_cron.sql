-- Cron đẩy dữ liệu sang cổng đối tác (外網), 2 lần/ngày (8h và 16h giờ VN).
--
-- Đẩy LẠI TOÀN BỘ báo giá + đoàn đang bật portal_enabled (upsert theo crm_*_id
-- nên chạy lại bao nhiêu lần cũng ra một kết quả). Chọn cách này thay vì dò xem
-- cái gì vừa đổi: bảng doan/bao_gia KHÔNG có cột updated_at, mà thêm cột +
-- trigger chỉ để biết "có gì đổi không" thì đắt hơn là cứ đẩy lại vài trăm dòng.
--
-- Vì sao 2 lần/ngày là đủ: BÁO GIÁ không còn chờ cron — bấm Gửi là client đẩy ngay
-- (BaoGiaDetailPage), đối tác thấy bản mới trong vài giây. Cron chỉ còn lo phần
-- ĐOÀN (chương trình đổi trong ngày) và làm lưới hứng khi lượt đẩy ngay thất bại.
--
-- Secret nằm trong vault (KHÔNG commit giá trị vào repo — repo này public).
-- Tạo một lần bằng tay, cùng giá trị với env PORTAL_CRON_SECRET của edge function:
--   select vault.create_secret('<gia-tri>', 'portal_cron_secret', 'Header x-portal-secret');
--   npx supabase secrets set --project-ref lflsbwoqzmbknzdpaequ PORTAL_CRON_SECRET='<gia-tri>'

SELECT cron.schedule(
  'push-portal-2lan-ngay',
  '0 1,9 * * *',   -- UTC → 8h và 16h giờ VN
  $job$
  SELECT net.http_post(
    url     := 'https://lflsbwoqzmbknzdpaequ.supabase.co/functions/v1/push-portal',
    headers := jsonb_build_object(
      'Content-Type',     'application/json',
      'x-portal-secret',  (SELECT decrypted_secret FROM vault.decrypted_secrets
                           WHERE name = 'portal_cron_secret')
    ),
    body    := '{}'::jsonb,
    timeout_milliseconds := 120000
  );
  $job$
);
