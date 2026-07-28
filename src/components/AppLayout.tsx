import { Eye } from "lucide-react";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import QuickActions from "@/components/quick-actions/QuickActions";
import { InstallPWA } from "@/components/InstallPWA";
import { useIsReadOnly } from "@/hooks/use-permissions";
import { t, useTranslate } from "@/lib/i18n";

export function AppLayout({ children }: { children: React.ReactNode }) {
  useTranslate();
  // Dải cảnh báo nằm trong <header>, KHÔNG trong <main>: các trang dùng `h-full`
  // tính theo chiều cao main, chèn vào main sẽ đội nội dung tràn khỏi khung.
  const chiXem = useIsReadOnly();

  return (
    <SidebarProvider>
      {/* 100dvh: chiều cao "động" — đúng trên mobile khi thanh địa chỉ ẩn/hiện. */}
      <div className="min-h-[100dvh] flex w-full">
        <AppSidebar />
        <div className="flex-1 flex flex-col min-w-0">
          {/* Header sticky + chừa safe-area trên (tai thỏ) khi chạy standalone. */}
          <header className="sticky top-0 z-30 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 pt-[env(safe-area-inset-top)]">
            <div className="h-12 flex items-center gap-2 px-2">
              <SidebarTrigger />
              {/* Tên app trên mobile để giống ứng dụng (desktop có sidebar nên ẩn). */}
              <span className="md:hidden font-semibold text-sm">S8 Travel</span>
            </div>
            {chiXem && (
              <div className="flex items-center gap-1.5 px-3 py-1 bg-amber-100 text-amber-900 text-xs border-t border-amber-200">
                <Eye className="h-3.5 w-3.5 shrink-0" />
                {t("Tài khoản chỉ xem — mọi thao tác thêm/sửa/xóa đều bị khóa.")}
              </div>
            )}
          </header>
          <main className="flex-1 min-w-0">{children}</main>
        </div>
      </div>
      <QuickActions />
      <InstallPWA />
    </SidebarProvider>
  );
}
