import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/use-auth";
import { AppLayout } from "./AppLayout";
import { DailyBriefModal } from "./DailyBriefModal";
import { t, useTranslate } from "@/lib/i18n";
import { resolveAgentScope, duongDanChoPhepAgent, TRANG_MAC_DINH_AGENT } from "@/lib/agent-scope";

export function ProtectedLayout() {
  useTranslate();
  const { isAuthenticated, isLoading, user } = useAuth();
  const { pathname } = useLocation();

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

  // Tài khoản đối tác (agent_ids): chỉ danh sách đoàn + chi tiết đoàn + thông báo.
  // Tầng giao diện thôi — DB không chặn theo agent (xem lib/agent-scope.ts).
  const laTaiKhoanAgent = resolveAgentScope(user?.agent_ids) != null;
  if (laTaiKhoanAgent && !duongDanChoPhepAgent(pathname)) {
    return <Navigate to={TRANG_MAC_DINH_AGENT} replace />;
  }

  return (
    <AppLayout>
      {!laTaiKhoanAgent && <DailyBriefModal />}
      <Outlet />
    </AppLayout>
  );
}
