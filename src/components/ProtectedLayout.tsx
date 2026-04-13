import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "@/hooks/use-auth";
import { useCurrentSession } from "@/hooks/use-current-user";
import { AppLayout } from "./AppLayout";

export function ProtectedLayout() {
  const session = useCurrentSession();
  const { isAuthenticated, isLoading } = useAuth();

  // Session chưa được xác định (đang load từ Supabase)
  if (session === null && isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-sm text-muted-foreground">Đang tải...</p>
      </div>
    );
  }

  // Không có session → về login
  if (!session) return <Navigate to="/login" replace />;

  // Đang load thông tin user từ user_roles
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-sm text-muted-foreground">Đang tải...</p>
      </div>
    );
  }

  // Tài khoản không tồn tại hoặc bị khoá → về login
  if (!isAuthenticated) return <Navigate to="/login" replace />;

  return (
    <AppLayout>
      <Outlet />
    </AppLayout>
  );
}
