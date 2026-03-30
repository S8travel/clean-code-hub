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
} from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { useLocation } from "react-router-dom";
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
  useSidebar,
} from "@/components/ui/sidebar";

const menuGroups = [
  {
    label: "QUẢN LÝ ĐOÀN",
    items: [
      { title: "Tổng quan", url: "/dashboard", icon: LayoutDashboard },
      { title: "Danh sách đoàn", url: "/doan", icon: List },
    ],
  },
  {
    label: "DANH MỤC",
    items: [
      { title: "Nhà hàng", url: "/quan-ly/nha-hang", icon: UtensilsCrossed },
      { title: "Khách sạn", url: "/quan-ly/khach-san", icon: Hotel },
      { title: "Xe", url: "/quan-ly/xe", icon: Car },
      { title: "Cảnh điểm", url: "/quan-ly/canh-diem", icon: MapPin },
      { title: "Hướng dẫn viên", url: "/quan-ly/hdv", icon: UserCheck },
      { title: "Nhà cung cấp", url: "/quan-ly/nha-cung-cap", icon: Package },
    ],
  },
  {
    label: "HỆ THỐNG",
    items: [
      { title: "Thanh toán", url: "/de-nghi-thanh-toan", icon: CreditCard },
      { title: "Thanh toán định kỳ", url: "/thanh-toan-dinh-ky", icon: CalendarClock },
      { title: "Công nợ", url: "/cong-no", icon: Wallet },
      { title: "Người dùng", url: "/quan-ly/nguoi-dung", icon: Users },
      { title: "Agent", url: "/quan-ly/agent", icon: Bot },
    ],
  },
];

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const location = useLocation();

  const isActive = (url: string) =>
    location.pathname === url || location.pathname.startsWith(url + "/");

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="px-4 py-4">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground font-bold text-sm">
            S8
          </div>
          {!collapsed && (
            <span className="font-semibold text-sm text-foreground truncate">
              S8 Travel
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
                  <SidebarMenuItem key={item.url}>
                    <SidebarMenuButton
                      asChild
                      isActive={isActive(item.url)}
                      tooltip={item.title}
                    >
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
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>
    </Sidebar>
  );
}
