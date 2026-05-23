import { Component, type ErrorInfo, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { t } from "@/lib/i18n";

type Props = { children: ReactNode };
type State = { hasError: boolean };

export class AppErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("App runtime error:", error, info);
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-6">
        <div className="w-full max-w-md space-y-4 rounded-lg border bg-card p-6 text-center shadow-sm">
          <div className="space-y-2">
            <h1 className="text-xl font-semibold text-foreground">{t("Không tải được ứng dụng")}</h1>
            <p className="text-sm text-muted-foreground">
              {t("Phiên làm việc có thể đã hết hạn hoặc trình duyệt đang giữ bản cũ.")}
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:justify-center">
            <Button onClick={() => window.location.reload()}>{t("Tải lại")}</Button>
            <Button variant="outline" onClick={() => window.location.assign("/login")}>{t("Đăng nhập lại")}</Button>
          </div>
        </div>
      </div>
    );
  }
}
