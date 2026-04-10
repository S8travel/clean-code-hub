import {
  LayoutDashboard,
  List,
  UtensilsCrossed,
  Hotel,
  Car,
  MapPin,
  UserCheck,
  Users,
  Bot,
  Package,
  CreditCard,
  Wallet,
  CalendarClock,
  LogOut,
  Stamp,
  FileStack,
  LayoutTemplate,
  ClipboardList,
  CalendarCheck,
} from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { useLocation, useNavigate } from "react-router-dom";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  SidebarFooter,
  useSidebar,
} from "@/components/ui/sidebar";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { usePermission, type Resource } from "@/hooks/use-permissions";

interface MenuItem {
  title: string;
  url: string;
  icon: React.ElementType;
  resource?: Resource;  // undefined = luôn hiển thị
}

const menuGroups: { label: string; items: MenuItem[] }[] = [
  {
    label: "QUẢN LÝ ĐOÀN",
    items: [
      { title: "Tổng quan", url: "/dashboard", icon: LayoutDashboard },
      { title: "Danh sách đoàn", url: "/doan", icon: List, resource: "doan" },
      { title: "Theo dõi", url: "/theo-doi", icon: ClipboardList, resource: "doan" },
      { title: "Xếp HDV", url: "/xep-hdv", icon: CalendarCheck, resource: "doan" },
    ],
  },
  {
    label: "DANH MỤC",
    items: [
      { title: "Nhà hàng", url: "/quan-ly/nha-hang", icon: UtensilsCrossed, resource: "danh_muc" },
      { title: "Khách sạn", url: "/quan-ly/khach-san", icon: Hotel, resource: "danh_muc" },
      { title: "Xe", url: "/quan-ly/xe", icon: Car, resource: "danh_muc" },
      { title: "Cảnh điểm", url: "/quan-ly/canh-diem", icon: MapPin, resource: "danh_muc" },
      { title: "Hướng dẫn viên", url: "/quan-ly/hdv", icon: UserCheck, resource: "danh_muc" },
      { title: "Mẫu seri", url: "/quan-ly/seri", icon: LayoutTemplate, resource: "seri" },
      { title: "Visa", url: "/quan-ly/visa", icon: Stamp, resource: "danh_muc" },
      { title: "Nhà cung cấp", url: "/quan-ly/nha-cung-cap", icon: Package, resource: "danh_muc" },
    ],
  },
  {
    label: "HỆ THỐNG",
    items: [
      { title: "Thanh toán", url: "/de-nghi-thanh-toan", icon: CreditCard, resource: "dntt" },
      { title: "Thanh toán định kỳ", url: "/thanh-toan-dinh-ky", icon: CalendarClock, resource: "thanh_toan_dk" },
      { title: "Hóa đơn & UNC", url: "/hoa-don-unc", icon: FileStack, resource: "hoa_don_unc" },
      { title: "Công nợ", url: "/cong-no", icon: Wallet, resource: "cong_no" },
      { title: "Người dùng", url: "/quan-ly/nguoi-dung", icon: Users, resource: "nguoi_dung" },
      { title: "Agent", url: "/quan-ly/agent", icon: Bot },
    ],
  },
];

function MenuItemWrapper({ item, collapsed, isActive }: { item: MenuItem; collapsed: boolean; isActive: boolean }) {
  const allowed = usePermission(item.resource ?? "doan", "view");
  if (item.resource && !allowed) return null;

  return (
    <SidebarMenuItem>
      <SidebarMenuButton asChild isActive={isActive} tooltip={item.title}>
        <NavLink
          to={item.url}
          className="hover:bg-muted/50"
          activeClassName="bg-muted text-primary font-medium"
        >
          <item.icon className="h-4 w-4" />
          {!collapsed && <span>{item.title}</span>}
        </NavLink>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuth();

  const isActive = (url: string) =>
    location.pathname === url || location.pathname.startsWith(url + "/");

  const handleLogout = () => {
    logout();
    navigate("/login", { replace: true });
  };

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="px-3 py-3">
        <div className="flex items-center gap-2">
          <img
            src="/logo.jpg"
            alt="S8 Travel"
            className="h-8 w-8 shrink-0 object-contain"
          />
          {!collapsed && (
            <span className="font-bold text-sm text-[#0a3d7c] truncate">
              S8 TRAVEL
            </span>
          )}
        </div>
      </SidebarHeader>

      <SidebarContent>
        {menuGroups.map((group) => (
          <SidebarGroup key={group.label}>
            <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {group.items.map((item) => (
                  <MenuItemWrapper
                    key={item.url}
                    item={item}
                    collapsed={collapsed}
                    isActive={isActive(item.url)}
                  />
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>

      <SidebarFooter className="border-t p-2">
        {!collapsed ? (
          <div className="flex items-center justify-between gap-2 px-2 py-1">
            <div className="min-w-0">
              <p className="text-xs font-medium truncate">{user?.ho_ten ?? user?.email}</p>
              <p className="text-[10px] text-muted-foreground truncate">{user?.email}</p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive"
              onClick={handleLogout}
              title="Đăng xuất"
            >
              <LogOut className="h-3.5 w-3.5" />
            </Button>
          </div>
        ) : (
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 mx-auto text-muted-foreground hover:text-destructive"
            onClick={handleLogout}
            title="Đăng xuất"
          >
            <LogOut className="h-4 w-4" />
          </Button>
        )}
      </SidebarFooter>
    </Sidebar>
  );
}
