import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { NotificationBell } from "@/components/NotificationBell";
import { useCurrentSession } from "@/hooks/use-current-user";
import AiChat from "@/components/AiChat";

export function AppLayout({ children }: { children: React.ReactNode }) {
  const { session } = useCurrentSession();
  const userId = session?.user?.id ?? null;

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <AppSidebar />
        <div className="flex-1 flex flex-col min-w-0">
          <header className="h-12 flex items-center justify-between border-b px-2">
            <SidebarTrigger />
            <NotificationBell userId={userId} />
          </header>
          <main className="flex-1">{children}</main>
        </div>
      </div>
      <AiChat />
    </SidebarProvider>
  );
}
