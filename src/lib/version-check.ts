import { useEffect } from "react";
import { toast } from "sonner";
import { t } from "@/lib/i18n";

// ─────────────────────────────────────────────────────────────────────────────
// Phát hiện deploy mới → ép người đang mở tab tải lại.
// Client poll /version.json (file thật, no-store) so với __APP_VERSION__ baked
// trong bundle. Khác → toast đếm ngược COUNTDOWN_S giây rồi tự reload (có nút
// "Tải lại ngay"). KHÔNG dùng service worker (xem memory PWA risk).
// ─────────────────────────────────────────────────────────────────────────────

const POLL_MS = 3 * 60_000; // poll mỗi 3 phút
const COUNTDOWN_S = 10;      // đếm ngược trước khi tự reload
const TOAST_ID = "app-version-update";

/** Có nên reload không: chỉ khi latest hợp lệ, khác rỗng và khác current. */
export function shouldReload(current: string, latest: unknown): boolean {
  if (typeof latest !== "string" || latest.length === 0) return false;
  return latest !== current;
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
      description: `${t("Tự tải lại sau")} ${remaining}s…`,
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
