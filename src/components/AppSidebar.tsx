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
  BriefcaseBusiness,
  CalendarRange,
} from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { useLocation, useNavigate } from "react-router-dom";
import { notifyLanguageChange } from "@/lib/i18n";
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
import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { usePermission, useRoleAtLeast, useBoPhan, type Resource } from "@/hooks/use-permissions";
import { useLockPhongDeadlineAlerts } from "@/hooks/use-lock-phong";
import { useCurrentSession } from "@/hooks/use-current-user";

// ── Google Translate button ──

function isTranslated(): boolean {
  return document.cookie.includes("googtrans=/vi/zh-TW");
}

function setGTCookie(value: string | null) {
  const host = window.location.hostname;
  if (value) {
    document.cookie = `googtrans=${value}; path=/`;
    document.cookie = `googtrans=${value}; domain=.${host}; path=/`;
  } else {
    document.cookie = `googtrans=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT`;
    document.cookie = `googtrans=; domain=.${host}; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT`;
  }
}

function triggerGTSelect(lang: string): boolean {
  const select = document.querySelector("select.goog-te-combo") as HTMLSelectElement | null;
  if (!select) return false;
  select.value = lang;
  select.dispatchEvent(new Event("change"));
  return true;
}

function TranslateButton({ collapsed }: { collapsed: boolean }) {
  const [translated, setTranslated] = useState(isTranslated);

  // On mount: if cookie says translated, trigger GT widget after it initializes
  useEffect(() => {
    if (!isTranslated()) return;
    let attempts = 0;
    const interval = setInterval(() => {
      attempts++;
      if (triggerGTSelect("zh-TW")) {
        clearInterval(interval);
      } else if (attempts >= 20) {
        // GT widget never loaded – clear stale cookie
        setGTCookie(null);
        setTranslated(false);
        clearInterval(interval);
      }
    }, 300);
    return () => clearInterval(interval);
  }, []);

  const handleTranslate = () => {
    setGTCookie("/vi/zh-TW");
    let attempts = 0;
    const interval = setInterval(() => {
      attempts++;
      if (triggerGTSelect("zh-TW")) {
        setTranslated(true);
        notifyLanguageChange();
        clearInterval(interval);
      } else if (attempts >= 20) {
        // GT widget not available – fall back to reload
        clearInterval(interval);
        window.location.reload();
      }
    }, 300);
  };

  const handleRestore = () => {
    setGTCookie(null);
    if (triggerGTSelect("")) {
      setTranslated(false);
      notifyLanguageChange();
    } else {
      window.location.reload();
    }
  };

  return (
    <button
      type="button"
      onClick={translated ? handleRestore : handleTranslate}
      title={translated ? "Khôi phục tiếng Việt" : "Dịch sang tiếng Trung (phồn thể)"}
      className={`
        notranslate flex items-center justify-center rounded-md border text-[11px] font-semibold
        transition-colors h-6 shrink-0
        ${collapsed ? "w-6 px-0" : "px-2 gap-1"}
        ${translated
          ? "border-blue-300 bg-blue-50 text-blue-700 hover:bg-blue-100"
          : "border-border bg-muted/40 text-muted-foreground hover:bg-muted hover:text-foreground"
        }
      `}
    >
      {translated ? (
        collapsed ? "VI" : <><span>🇻🇳</span><span>VI</span></>
      ) : (
        collapsed ? "中" : <><span>🇹🇼</span><span>中文</span></>
      )}
    </button>
  );
}

interface MenuItem {
  title: string;
  titleZh?: string;     // override khi đang dịch sang zh-TW
  url: string;
  icon: React.ElementType;
  resource?: Resource;  // undefined = luôn hiển thị
  minRole?: string;     // yêu cầu role tối thiểu
  boPhanOnly?: string;  // chỉ hiện với bộ phận này (+ admin)
}

const menuGroups: { label: string; items: MenuItem[] }[] = [
  {
    label: "QUẢN LÝ ĐOÀN",
    items: [
      { title: "Tổng quan", url: "/dashboard", icon: LayoutDashboard },
      { title: "Công việc của tôi", url: "/my-job", icon: BriefcaseBusiness },
      { title: "Danh sách đoàn", titleZh: "團表", url: "/doan", icon: List, resource: "doan" },
      { title: "Theo dõi", url: "/theo-doi", icon: ClipboardList, minRole: "truong_phong" },
      { title: "Xếp HDV", url: "/xep-hdv", icon: CalendarCheck, minRole: "giam_doc" },
      { title: "Lock Phòng", titleZh: "鎖房", url: "/lock-phong", icon: CalendarRange },
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
      { title: "Thanh toán", url: "/de-nghi-thanh-toan", icon: CreditCard, boPhanOnly: "ke_toan" },
      { title: "Thanh toán định kỳ", url: "/thanh-toan-dinh-ky", icon: CalendarClock },
      { title: "Hóa đơn & UNC", url: "/hoa-don-unc", icon: FileStack, resource: "hoa_don_unc" },
      { title: "Công nợ", url: "/cong-no", icon: Wallet },
      { title: "Người dùng", url: "/quan-ly/nguoi-dung", icon: Users, resource: "nguoi_dung" },
      { title: "Agent", url: "/quan-ly/agent", icon: Bot },
    ],
  },
];

function MenuItemWrapper({ item, collapsed, isActive }: { item: MenuItem; collapsed: boolean; isActive: boolean }) {
  const allowed = usePermission(item.resource ?? "doan", "view");
  const roleOk = useRoleAtLeast(item.minRole ?? "nhan_vien");
  const boPhanOk = useBoPhan(item.boPhanOnly ?? "");

  if (item.resource && !allowed) return null;
  if (item.minRole && !roleOk) return null;
  if (item.boPhanOnly && !boPhanOk) return null;

  const isZh = item.titleZh && document.cookie.includes("googtrans=/vi/zh-TW");
  const displayTitle = isZh ? item.titleZh! : item.title;

  return (
    <SidebarMenuItem>
      <SidebarMenuButton asChild isActive={isActive} tooltip={displayTitle}>
        <NavLink
          to={item.url}
          className="hover:bg-muted/50"
          activeClassName="bg-muted text-primary font-medium"
        >
          <item.icon className="h-4 w-4" />
          {!collapsed && <span className={isZh ? "notranslate" : undefined}>{displayTitle}</span>}
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
  const { session } = useCurrentSession();
  const deadlineAlerts = useLockPhongDeadlineAlerts(session?.user?.id ?? null);

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
            <span className="font-bold text-sm text-[#0a3d7c] truncate flex-1">
              S8 TRAVEL
            </span>
          )}
          <TranslateButton collapsed={collapsed} />
        </div>
      </SidebarHeader>

      <SidebarContent>
        {menuGroups.map((group) => (
          <SidebarGroup key={group.label}>
            <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {group.items.map((item) => {
                  if (item.url === "/lock-phong" && deadlineAlerts.length > 0) {
                    return (
                      <SidebarMenuItem key={item.url}>
                        <SidebarMenuButton asChild isActive={isActive(item.url)} tooltip={item.title}>
                          <NavLink
                            to={item.url}
                            className="hover:bg-muted/50"
                            activeClassName="bg-muted text-primary font-medium"
                          >
                            <item.icon className="h-4 w-4" />
                            {!collapsed && (
                              <span className="flex-1 flex items-center justify-between">
                                {item.title}
                                <span className="ml-1 min-w-[18px] h-[18px] rounded-full bg-orange-500 text-white text-[10px] font-bold flex items-center justify-center px-1">
                                  {deadlineAlerts.length}
                                </span>
                              </span>
                            )}
                          </NavLink>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    );
                  }
                  return (
                    <MenuItemWrapper
                      key={item.url}
                      item={item}
                      collapsed={collapsed}
                      isActive={isActive(item.url)}
                    />
                  );
                })}
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
