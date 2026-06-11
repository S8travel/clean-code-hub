// SW handlers cho thông báo (tiền thân: sw-notify.js — chỉ có notificationclick).
// - "push": Web Push từ edge fn send-push → hiện notification (app đóng vẫn nhận)
// - "notificationclick": chung cho cả push lẫn reg.showNotification từ trang (Tier-1)
// File này được nạp vào service worker chính qua workbox.importScripts
// (vite.config.ts). Nếu sửa nội dung file → ĐỔI TÊN FILE (vd sw-push-v2.js)
// để chắc chắn SW client cập nhật (importScripts bị HTTP-cache theo URL).

self.addEventListener("push", (event) => {
  if (!event.data) return;
  let p;
  try {
    p = event.data.json();
  } catch {
    return;
  }
  event.waitUntil(
    (async () => {
      // User đang nhìn app → chuông in-app (realtime) đủ, khỏi popup
      const clients = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      if (clients.some((c) => c.focused)) return;
      await self.registration.showNotification(p.title || "Thông báo", {
        body: p.body || undefined,
        icon: "/logo.jpg",
        // tag trùng với Tier-1 (thongbao-<id>) → trình duyệt tự gộp, không double
        tag: p.tag || (p.id != null ? `thongbao-${p.id}` : undefined),
        data: { id: p.id, url: p.url || "/" },
      });
    })(),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const data = event.notification.data || {};
  const url = typeof data.url === "string" && data.url ? data.url : "/";
  event.waitUntil(
    (async () => {
      const clients = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      const client = clients.find((c) => "focus" in c) || clients[0];
      if (client) {
        // App đang mở → focus + báo về trang để điều hướng + mark đã đọc
        await client.focus();
        client.postMessage({ type: "THONG_BAO_CLICK", id: data.id, url });
      } else {
        // App đóng hẳn → mở cửa sổ mới thẳng tới trang đích (không mark đọc được)
        await self.clients.openWindow(url);
      }
    })(),
  );
});
