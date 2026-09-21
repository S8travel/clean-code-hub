-- Tài khoản giới hạn theo agent: chỉ xem đoàn của các agent trong agent_ids.
-- NULL / rỗng = tài khoản thường. Enforce ở TẦNG GIAO DIỆN (src/lib/agent-scope.ts),
-- DB KHÔNG chặn theo cột này — xem CLAUDE.md "⛔ ĐÃ THỬ VÀ BỎ".
-- ALTER TABLE → không cần GRANT (bảng giữ grants cũ).
ALTER TABLE public.user_roles ADD COLUMN IF NOT EXISTS agent_ids bigint[];

COMMENT ON COLUMN public.user_roles.agent_ids IS
  'Chỉ xem đoàn của các agent này (giới hạn tầng giao diện). NULL = không giới hạn.';
