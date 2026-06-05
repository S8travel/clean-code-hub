import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import AiChat from "@/components/AiChat";
import { InstallPWA } from "@/components/InstallPWA";

export function AppLayout({ children }: { children: React.ReactNode }) {
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
          </header>
          <main className="flex-1 min-w-0">{children}</main>
        </div>
      </div>
      <AiChat />
      <InstallPWA />
    </SidebarProvider>
  );
}
