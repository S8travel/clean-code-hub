import { usePermission, type Resource, type PermAction } from "@/hooks/use-permissions";

interface Props {
  resource: Resource;
  action: PermAction;
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

/** Chỉ render children nếu user có quyền. Mặc định fallback = null (ẩn). */
export function PermissionGate({ resource, action, children, fallback = null }: Props) {
  const allowed = usePermission(resource, action);
  return allowed ? <>{children}</> : <>{fallback}</>;
}

interface AccessDeniedProps {
  message?: string;
}

export function AccessDenied({ message = "Bạn không có quyền truy cập trang này." }: AccessDeniedProps) {
  return (
    <div className="flex flex-1 items-center justify-center h-[calc(100vh-3rem)]">
      <div className="text-center space-y-2">
        <div className="text-4xl">🔒</div>
        <h2 className="font-semibold text-base">Không có quyền truy cập</h2>
        <p className="text-sm text-muted-foreground">{message}</p>
      </div>
    </div>
  );
}
