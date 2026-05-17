// Web Notifications (popup desktop) cho thông báo realtime — Tier 1 (chỉ foreground).
// Không service worker, không server push: chỉ hiện khi trình duyệt đang chạy
// và app mở ở 1 tab bất kỳ. Lựa chọn bật/tắt lưu ở localStorage theo máy.

const LS_KEY = "desktop_notif_enabled";

export function desktopNotifSupported(): boolean {
  return typeof window !== "undefined" && "Notification" in window;
}

export function desktopNotifPermission(): NotificationPermission | "unsupported" {
  if (!desktopNotifSupported()) return "unsupported";
  return Notification.permission;
}

// Bật = user đã chọn bật VÀ trình duyệt đã cấp quyền.
export function desktopNotifEnabled(): boolean {
  if (!desktopNotifSupported()) return false;
  if (Notification.permission !== "granted") return false;
  return localStorage.getItem(LS_KEY) === "1";
}

// Xin quyền (nếu cần) rồi bật. Trả về true nếu cuối cùng bật được.
export async function enableDesktopNotif(): Promise<boolean> {
  if (!desktopNotifSupported()) return false;
  let perm = Notification.permission;
  if (perm === "default") {
    try {
      perm = await Notification.requestPermission();
    } catch {
      return false;
    }
  }
  if (perm !== "granted") return false;
  localStorage.setItem(LS_KEY, "1");
  return true;
}

export function disableDesktopNotif() {
  localStorage.setItem(LS_KEY, "0");
}

export interface DesktopNotifPayload {
  id: number | string;
  title: string;
  body?: string | null;
}

// Hiện 1 popup desktop. Tự bỏ qua nếu chưa bật / chưa cấp quyền,
// hoặc khi user đang focus vào app (lúc đó chuông in-app đã đủ).
export function showDesktopNotif(p: DesktopNotifPayload, onClick?: () => void) {
  if (!desktopNotifEnabled()) return;
  if (typeof document !== "undefined" && document.hasFocus()) return;
  try {
    const n = new Notification(p.title, {
      body: p.body ?? undefined,
      icon: "/logo.jpg",
      tag: `thongbao-${p.id}`, // trùng id → gộp, không spam
    });
    n.onclick = () => {
      window.focus();
      n.close();
      onClick?.();
    };
  } catch {
    /* vài trình duyệt chặn new Notification() ngoài service worker — bỏ qua */
  }
}
