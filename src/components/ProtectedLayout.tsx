import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "@/hooks/use-auth";
import { AppLayout } from "./AppLayout";

export function ProtectedLayout() {
  const { isAuthenticated, isLoading } = useAuth();

  // Đang kiểm tra session / load user → chờ
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-sm text-muted-foreground">Đang tải...</p>
      </div>
    );
  }

  // Không có session hoặc tài khoản bị khoá → về login
  if (!isAuthenticated) return <Navigate to="/login" replace />;

  return (
    <AppLayout>
      <Outlet />
    </AppLayout>
  );
}
