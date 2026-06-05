import { useEffect, useState } from "react";
import { Download, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { t, useTranslate } from "@/lib/i18n";

// Banner gợi ý "Cài app" (Add to Home Screen). Network-first PWA — banner chỉ là UX
// để cài, không liên quan offline. Tự ẩn khi: đã chạy standalone, đã từng tắt, hoặc
// trình duyệt không hỗ trợ cài.

const DISMISS_KEY = "pwa-install-dismissed";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

function isStandalone(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    // iOS Safari
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function isIOS(): boolean {
  return /iphone|ipad|ipod/i.test(window.navigator.userAgent);
}

export function InstallPWA() {
  useTranslate();
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [iosHint, setIosHint] = useState(false);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (isStandalone() || localStorage.getItem(DISMISS_KEY) === "1") return;

    // Android / desktop Chromium: bắt sự kiện cài.
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
      setVisible(true);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);

    // iOS Safari không bắn beforeinstallprompt → hiện hướng dẫn thủ công.
    let iosTimer: number | undefined;
    if (isIOS()) {
      iosTimer = window.setTimeout(() => {
        setIosHint(true);
        setVisible(true);
      }, 1500);
    }

    const onInstalled = () => {
      setVisible(false);
      localStorage.setItem(DISMISS_KEY, "1");
    };
    window.addEventListener("appinstalled", onInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
      if (iosTimer) window.clearTimeout(iosTimer);
    };
  }, []);

  const dismiss = () => {
    setVisible(false);
    localStorage.setItem(DISMISS_KEY, "1");
  };

  const install = async () => {
    if (!deferred) return;
    await deferred.prompt();
    await deferred.userChoice;
    dismiss();
  };

  if (!visible) return null;

  return (
    <div
      className="fixed inset-x-0 bottom-0 z-50 flex justify-center px-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)]"
      role="dialog"
      aria-label={t("Cài ứng dụng")}
    >
      <div className="w-full max-w-md rounded-xl border bg-background shadow-lg p-3 flex items-start gap-3">
        <img src="/pwa-192x192.png" alt="S8 Travel" className="h-10 w-10 rounded-lg shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">{t("Cài S8 Travel làm ứng dụng")}</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {iosHint
              ? t('Bấm nút Chia sẻ của Safari rồi chọn "Thêm vào MH chính".')
              : t("Thêm vào màn hình chính để mở nhanh như app.")}
          </p>
          {!iosHint && (
            <div className="mt-2 flex gap-2">
              <Button size="sm" className="h-8 gap-1.5" onClick={install}>
                <Download className="h-3.5 w-3.5" />
                {t("Cài đặt")}
              </Button>
              <Button size="sm" variant="ghost" className="h-8" onClick={dismiss}>
                {t("Để sau")}
              </Button>
            </div>
          )}
        </div>
        <button onClick={dismiss} className="shrink-0 text-muted-foreground hover:text-foreground" aria-label={t("Đóng")}>
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
