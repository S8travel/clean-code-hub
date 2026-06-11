// Xử lý click trên notification hiển thị qua registration.showNotification()
// (đường fallback cho Android PWA — new Notification() bị cấm ở page context).
// File này được nạp vào service worker chính qua workbox.importScripts
// (vite.config.ts). Nếu sửa nội dung file → ĐỔI TÊN FILE (vd sw-notify-v2.js)
// để chắc chắn SW client cập nhật (importScripts bị HTTP-cache theo URL).
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
