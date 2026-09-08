import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/use-auth";
import { useRolePermissions, usePermission, type Resource } from "@/hooks/use-permissions";

// Chặn ĐƯỜNG VÀO TRANG theo quyền xem, không chỉ ẩn menu: ẩn ở sidebar mà route
// vẫn mở thì gõ thẳng địa chỉ là vào được, nên "đã ẩn mục đó" là nói sai.
//
// ⚠️ Đây vẫn là tầng GIAO DIỆN. Dữ liệu ở DB phần lớn chỉ có policy "đã đăng
// nhập" → người biết kỹ thuật vẫn đọc được qua API. Xem mục "ĐÃ THỬ VÀ BỎ"
// trong CLAUDE.md trước khi hứa với ai là đã giấu được gì.

export function CanQuyen({ resource, children }: { resource: Resource; children: ReactNode }) {
  const { isLoading: dangDangNhap } = useAuth();
  // Cùng query key với usePermission bên dưới → dùng cache chung, không gọi thêm.
  const { isLoading: dangTaiQuyen } = useRolePermissions();
  const duocXem = usePermission(resource, "view");

  // Chưa nạp xong thì quyền còn rỗng — điều hướng lúc này là đá nhầm người có quyền.
  if (dangDangNhap || dangTaiQuyen) return null;
  if (!duocXem) return <Navigate to="/my-job" replace />;
  return <>{children}</>;
}
