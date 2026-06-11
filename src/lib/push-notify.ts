// Web Push (Mức 2): đăng ký/hủy push subscription cho thiết bị hiện tại.
// Server gửi qua edge fn send-push (trigger trên INSERT thong_bao) → SW handler
// "push" trong public/sw-push.js hiện notification — app ĐÓNG vẫn nhận được.
// Yêu cầu: SW đã đăng ký (prod build — dev không có SW → silent fail, còn Tier-1).
import { externalSupabase } from "@/lib/supabase-external";

// VAPID applicationServerKey (public) — đi cặp với private key trong secret
// VAPID_KEYS_JSON của edge fn send-push (tạo bởi scripts/gen-vapid-keys.mjs).
// ⚠️ Đổi key = mọi subscription hiện có chết, từng máy phải bật lại toggle.
const VAPID_PUBLIC_KEY =
  "BMI9uqRff-b1nnc-Ekra4EPL1pHdW0UuIkMG36xOqtxZsp8EduwwX__ntmJM93w2GRMoiy_qZAu8e-FwVP9nZPk";

export function pushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  // ArrayBuffer tường minh để khớp BufferSource (TS chặn ArrayBufferLike/Shared)
  const arr = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

interface SubJson {
  endpoint: string;
  p256dh: string;
  auth: string;
}

function toSubJson(sub: PushSubscription): SubJson | null {
  const j = sub.toJSON();
  if (!j.endpoint || !j.keys?.p256dh || !j.keys?.auth) return null;
  return { endpoint: j.endpoint, p256dh: j.keys.p256dh, auth: j.keys.auth };
}

async function upsertSub(userId: string, s: SubJson) {
  return externalSupabase.from("push_subscriptions").upsert(
    {
      user_id: userId,
      endpoint: s.endpoint,
      p256dh: s.p256dh,
      auth: s.auth,
      user_agent: navigator.userAgent.slice(0, 300),
      last_seen_at: new Date().toISOString(),
    },
    { onConflict: "endpoint" },
  );
}

// Đăng ký push cho máy này + lưu subscription lên DB. Trả về true nếu OK.
// Silent fail (false) khi: dev không có SW, trình duyệt không hỗ trợ
// (Safari thường / iOS chưa cài PWA), chưa cấp quyền Notification.
export async function subscribePush(userId: string): Promise<boolean> {
  if (!pushSupported()) return false;
  if (Notification.permission !== "granted") return false;
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    if (!reg) return false;
    const opts = {
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    };
    let sub = await reg.pushManager.subscribe(opts);
    let json = toSubJson(sub);
    if (!json) return false;

    let { error } = await upsertSub(userId, json);
    if (error) {
      // Endpoint cũ có thể thuộc user khác (đổi tài khoản trên cùng máy) → RLS
      // chặn UPDATE row người khác. Hủy subscription cũ để push service cấp
      // endpoint MỚI rồi thử lại 1 lần.
      await sub.unsubscribe();
      sub = await reg.pushManager.subscribe(opts);
      json = toSubJson(sub);
      if (!json) return false;
      ({ error } = await upsertSub(userId, json));
      if (error) return false;
    }
    return true;
  } catch {
    return false;
  }
}

// Hủy push cho máy này (tắt toggle). Best-effort — lỗi thì bỏ qua.
export async function unsubscribePush(): Promise<void> {
  if (!pushSupported()) return;
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    const sub = await reg?.pushManager.getSubscription();
    if (!sub) return;
    const endpoint = sub.endpoint;
    await sub.unsubscribe();
    await externalSupabase.from("push_subscriptions").delete().eq("endpoint", endpoint);
  } catch {
    /* best-effort */
  }
}
