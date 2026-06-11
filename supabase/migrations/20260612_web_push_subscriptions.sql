-- Web Push (Mức 2): bảng push_subscriptions + trigger bắn push khi INSERT thong_bao.
-- Edge function: supabase/functions/send-push (deploy verify_jwt=false — caller là pg_net).
--
-- ⚠️ Thứ tự bật (push mặc định TẮT cho tới khi đủ 3 bước):
--   1. Deploy edge function send-push.
--   2. Đặt secrets cho edge fn: VAPID_KEYS_JSON (output của scripts/gen-vapid-keys.mjs),
--      PUSH_WEBHOOK_SECRET (chuỗi ngẫu nhiên), PUSH_ENABLED=true.
--   3. Tạo Vault secret cùng giá trị với PUSH_WEBHOOK_SECRET:
--        SELECT vault.create_secret('<PUSH_WEBHOOK_SECRET>', 'push_webhook_secret');
--      Chưa có Vault secret → trigger skip (kill-switch mềm).
--
-- Kill-switch (nhẹ → nặng):
--   a. Secret PUSH_ENABLED=false trên edge fn (tắt bằng config, không cần deploy).
--   b. SELECT vault.update_secret(id, ...) / xóa Vault secret 'push_webhook_secret' → trigger skip.
--   c. DROP TRIGGER tr_thong_bao_push ON public.thong_bao; (tắt hẳn tầng DB)
--   d. DELETE FROM push_subscriptions; (rút sạch địa chỉ gửi)

CREATE TABLE public.push_subscriptions (
  id bigserial PRIMARY KEY,
  user_id uuid NOT NULL,
  endpoint text NOT NULL UNIQUE,
  p256dh text NOT NULL,
  auth text NOT NULL,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_push_subscriptions_user ON public.push_subscriptions (user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.push_subscriptions TO authenticated, service_role;
GRANT USAGE, SELECT ON SEQUENCE public.push_subscriptions_id_seq TO authenticated, service_role;

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

-- User chỉ thấy/sửa subscription của chính mình (edge fn dùng service_role, bypass RLS).
CREATE POLICY "own_push_subscriptions" ON public.push_subscriptions
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Trigger: AFTER INSERT thong_bao → gọi edge fn send-push qua pg_net.
-- pg_net là ASYNC — không block, không bao giờ làm fail INSERT thong_bao.
CREATE OR REPLACE FUNCTION public.fn_thong_bao_send_push()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_secret text;
BEGIN
  -- User không có thiết bị nào subscribe → khỏi gọi edge fn cho đỡ rác
  IF NOT EXISTS (SELECT 1 FROM public.push_subscriptions WHERE user_id = NEW.user_id) THEN
    RETURN NEW;
  END IF;

  SELECT decrypted_secret INTO v_secret
  FROM vault.decrypted_secrets
  WHERE name = 'push_webhook_secret';
  IF v_secret IS NULL THEN
    RETURN NEW; -- chưa cấu hình secret → coi như push đang tắt
  END IF;

  PERFORM net.http_post(
    url     := 'https://lflsbwoqzmbknzdpaequ.supabase.co/functions/v1/send-push',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'x-push-secret', v_secret
    ),
    body    := jsonb_build_object('record', to_jsonb(NEW)),
    timeout_milliseconds := 5000
  );
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Push là tính năng cộng thêm — lỗi gì cũng nuốt, INSERT thong_bao phải sống.
  RETURN NEW;
END $$;

-- Trigger function không cho gọi trực tiếp từ client
REVOKE ALL ON FUNCTION public.fn_thong_bao_send_push() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS tr_thong_bao_push ON public.thong_bao;
CREATE TRIGGER tr_thong_bao_push
  AFTER INSERT ON public.thong_bao
  FOR EACH ROW EXECUTE FUNCTION public.fn_thong_bao_send_push();
