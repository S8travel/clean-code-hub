// Edge function: gửi Web Push tới mọi thiết bị đã subscribe của user khi có
// thong_bao mới.
//
// Trigger: tr_thong_bao_push (AFTER INSERT public.thong_bao) → pg_net POST
//          body {record: <row thong_bao>}. pg_net async — lỗi ở đây không
//          ảnh hưởng INSERT gốc.
// Auth:    verify_jwt=false (xem supabase/config.toml) + header 'x-push-secret'
//          phải khớp env PUSH_WEBHOOK_SECRET → chặn người lạ gọi.
// Secrets: PUSH_ENABLED ('true' mới gửi — kill-switch config),
//          PUSH_WEBHOOK_SECRET, VAPID_KEYS_JSON ({publicKey, privateKey} JWK —
//          output của scripts/gen-vapid-keys.mjs; public key đi cặp với
//          VAPID_PUBLIC_KEY hardcode trong src/lib/push-notify.ts).
// Hành vi: ĐỌC push_subscriptions + XÓA subscription chết (push service trả
//          404/410). KHÔNG đụng dữ liệu nghiệp vụ.
import * as webpush from "jsr:@negrel/webpush";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

interface ThongBaoRecord {
  id: number;
  user_id: string;
  loai: string | null;
  tieu_de: string | null;
  noi_dung: string | null;
  doan_id: number | null;
  cong_viec_id: number | null;
  lead_id: number | null;
  bao_gia_id: number | null;
}

// Bản sao của targetUrl trong src/lib/thong-bao-utils.ts — sửa bên đó
// thì sửa cả đây (edge fn không import được code src/).
function targetUrl(tb: ThongBaoRecord): string {
  const { loai, doan_id, cong_viec_id, lead_id, bao_gia_id } = tb;
  if (!loai) return "/";
  if (loai.startsWith("deadline") && doan_id) return `/doan/${doan_id}`;
  if (loai === "giao_viec" && cong_viec_id) return `/my-job?cong_viec=${cong_viec_id}`;
  if (loai === "giao_viec" && doan_id) return `/doan/${doan_id}`;
  if (loai === "dntt_can_duyet") return "/de-nghi-thanh-toan";
  if (loai === "su_co" && doan_id) return `/doan/${doan_id}?tab=log`;
  // Đối tác yêu cầu sửa chương trình: mở thẳng báo giá đó.
  if (loai === "bao_gia_yeu_cau_sua" && bao_gia_id) return `/bao-gia/${bao_gia_id}`;
  // Yêu cầu báo giá đối tác: xử lý ở tab trong trang Báo giá, không phải phễu Leads.
  if (loai === "lead_yeu_cau_doi_tac") return "/bao-gia?tab=yeu-cau";
  if (loai.startsWith("lead_")) return lead_id ? `/leads?lead=${lead_id}` : "/leads";
  if (loai === "gia" && doan_id) return `/doan/${doan_id}`;
  if (loai === "thong_tin_doan" && doan_id) return `/doan/${doan_id}`;
  return "/";
}

Deno.serve(async (req) => {
  try {
    if (req.method !== "POST") {
      return new Response("method not allowed", { status: 405 });
    }
    const secret = Deno.env.get("PUSH_WEBHOOK_SECRET");
    if (!secret || req.headers.get("x-push-secret") !== secret) {
      return new Response("unauthorized", { status: 401 });
    }
    if (Deno.env.get("PUSH_ENABLED") !== "true") {
      return Response.json({ skipped: "PUSH_ENABLED != true" });
    }
    const vapidJson = Deno.env.get("VAPID_KEYS_JSON");
    if (!vapidJson) {
      return Response.json({ skipped: "thiếu VAPID_KEYS_JSON" });
    }

    const { record } = (await req.json()) as { record?: ThongBaoRecord };
    if (!record?.id || !record?.user_id) {
      return Response.json({ skipped: "không có record" });
    }

    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const { data: subs, error } = await sb
      .from("push_subscriptions")
      .select("id, endpoint, p256dh, auth")
      .eq("user_id", record.user_id);
    if (error) throw error;
    if (!subs?.length) return Response.json({ sent: 0 });

    const vapidKeys = await webpush.importVapidKeys(JSON.parse(vapidJson), {
      extractable: false,
    });
    const appServer = await webpush.ApplicationServer.new({
      contactInformation: "mailto:nn135354466@gmail.com",
      vapidKeys,
    });

    // tag trùng với Tier-1 (showDesktopNotif) → trình duyệt tự gộp, không double
    const payload = JSON.stringify({
      id: record.id,
      title: record.tieu_de ?? "Thông báo",
      body: record.noi_dung ?? undefined,
      url: targetUrl(record),
      tag: `thongbao-${record.id}`,
    });

    let sent = 0;
    let removed = 0;
    await Promise.all(
      subs.map(async (s) => {
        try {
          const subscriber = appServer.subscribe({
            endpoint: s.endpoint,
            keys: { p256dh: s.p256dh, auth: s.auth },
          });
          await subscriber.pushTextMessage(payload, {
            ttl: 24 * 60 * 60, // thông báo nghiệp vụ cũ hơn 1 ngày thì thôi
            urgency: webpush.Urgency.High,
          });
          sent++;
        } catch (err) {
          // 404/410 = subscription chết (gỡ app, thu hồi quyền, Apple revoke)
          if (err instanceof webpush.PushMessageError && err.isGone()) {
            await sb.from("push_subscriptions").delete().eq("id", s.id);
            removed++;
          } else {
            console.error(`push fail sub=${s.id}:`, String(err));
          }
        }
      }),
    );
    return Response.json({ sent, removed });
  } catch (err) {
    console.error("send-push error:", String(err));
    return new Response("internal error", { status: 500 });
  }
});
