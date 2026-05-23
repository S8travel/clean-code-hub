import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "@/hooks/use-auth";
import { AppLayout } from "./AppLayout";
import { DailyBriefModal } from "./DailyBriefModal";
import { t, useTranslate } from "@/lib/i18n";

export function ProtectedLayout() {
  useTranslate();
  const { isAuthenticated, isLoading } = useAuth();

  // Đang kiểm tra session / load user → chờ
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-sm text-muted-foreground">{t("Đang tải...")}</p>
      </div>
    );
  }

  // Không có session hoặc tài khoản bị khoá → về login
  if (!isAuthenticated) return <Navigate to="/login" replace />;

  return (
    <AppLayout>
      <DailyBriefModal />
      <Outlet />
    </AppLayout>
  );
}
