import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "@/hooks/use-auth";
import { AppLayout } from "./AppLayout";

export function ProtectedLayout() {
  const { email, isAuthenticated, isLoading } = useAuth();

  // Chưa nhập email → về login
  if (!email) return <Navigate to="/login" replace />;

  // Đang load user từ DB
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-sm text-muted-foreground">Đang tải...</p>
      </div>
    );
  }

  // Email không tồn tại hoặc tài khoản bị khoá → về login
  if (!isAuthenticated) return <Navigate to="/login" replace />;

  return (
    <AppLayout>
      <Outlet />
    </AppLayout>
  );
}
