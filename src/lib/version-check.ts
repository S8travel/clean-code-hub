import { useEffect } from "react";
import { toast } from "sonner";
import { t } from "@/lib/i18n";

// ─────────────────────────────────────────────────────────────────────────────
// Phát hiện deploy mới → báo người đang mở tab, cho ÂN HẠN rồi mới tự tải lại.
// Client poll /version.json (file thật, no-store) so với __APP_VERSION__ baked
// trong bundle. Khác → toast đếm ngược COUNTDOWN_S giây rồi tự reload (có nút
// "Tải lại ngay" để OP tải ngay nếu muốn). Đây là cơ chế báo bản mới DUY NHẤT.
// Ân hạn 5 phút (không phải 10s): reload đột ngột giữa lúc OP đang nhập dở =
// mất công; cho họ thời gian blur/hoàn tất rồi tự tải, hoặc bấm tải ngay.
// PWA service worker (vite-plugin-pwa) chạy network-first / KHÔNG precache
// index.html → navigation luôn ra mạng, không che mất luồng version.json này.
// ─────────────────────────────────────────────────────────────────────────────

const POLL_MS = 3 * 60_000; // poll mỗi 3 phút
const COUNTDOWN_S = 5 * 60;  // ân hạn 5 phút trước khi tự reload
const TOAST_ID = "app-version-update";

/** Có nên reload không: chỉ khi latest hợp lệ, khác rỗng và khác current. */
export function shouldReload(current: string, latest: unknown): boolean {
  if (typeof latest !== "string" || latest.length === 0) return false;
  return latest !== current;
}

/** Đếm ngược dạng m:ss ("5:00", "4:09"). Ân hạn 5 phút nên "300s…" đọc xấu. */
export function formatCountdown(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return `${m}:${String(rem).padStart(2, "0")}`;
}

async function fetchLatestVersion(): Promise<string | null> {
  try {
    const res = await fetch(`/version.json?t=${Date.now()}`, { cache: "no-store" });
    if (!res.ok) return null;
    const data: unknown = await res.json();
    const v = (data as { version?: unknown } | null)?.version;
    return typeof v === "string" ? v : null;
  } catch {
    return null; // offline / lỗi tạm thời → bỏ qua, lần poll sau thử lại
  }
}

function startCountdownAndReload() {
  let remaining = COUNTDOWN_S;
  const render = () =>
    toast(t("Có phiên bản mới"), {
      id: TOAST_ID,
      description: `${t("Tự tải lại sau")} ${formatCountdown(remaining)}`,
      duration: Infinity,
      action: {
        label: t("Tải lại ngay"),
        onClick: () => window.location.reload(),
      },
    });
  render();
  const iv = window.setInterval(() => {
    remaining -= 1;
    if (remaining <= 0) {
      window.clearInterval(iv);
      window.location.reload();
    } else {
      render();
    }
  }, 1000);
}

/** Mount 1 lần ở App. No-op trong dev (không có version.json / bundle ổn định). */
export function useVersionCheck(): void {
  useEffect(() => {
    if (!import.meta.env.PROD) return;

    let triggered = false;

    const check = async () => {
      if (triggered || document.visibilityState === "hidden") return;
      const latest = await fetchLatestVersion();
      if (shouldReload(__APP_VERSION__, latest)) {
        triggered = true;
        startCountdownAndReload();
      }
    };

    const iv = window.setInterval(check, POLL_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") void check();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      window.clearInterval(iv);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);
}
