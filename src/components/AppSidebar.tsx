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
  Stamp,
  FileStack,
  LayoutTemplate,
  ClipboardList,
  CalendarCheck,
  BriefcaseBusiness,
  CalendarRange,
  FileText,
  Calculator,
  Users2,
  BarChart3,
  Target,
} from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { useLocation, useNavigate } from "react-router-dom";
import { t, useTranslate, notifyLanguageChange, startZhCorrectionObserver, stopZhCorrectionObserver } from "@/lib/i18n";
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
import { usePermission, useRoleAtLeast, useBoPhan, type Resource } from "@/hooks/use-permissions";
import { useLockPhongDeadlineAlerts } from "@/hooks/use-lock-phong";
import { useCurrentSession } from "@/hooks/use-current-user";
import { useThongBaoCount } from "@/hooks/use-thong-bao";
import { useLeadStats } from "@/hooks/use-lead-stats";
import { useMyOverdueCount } from "@/hooks/use-lead-next-action";
import { UserSettingsMenu } from "@/components/UserSettingsMenu";
import { NotificationBell } from "@/components/NotificationBell";

// ── Google Translate button ──

function isTranslated(): boolean {
  return document.cookie.includes("googtrans=/vi/zh-TW");
}

function getAllDomainVariants(): (string | undefined)[] {
  const host = window.location.hostname;
  const parts = host.split(".");
  const variants: (string | undefined)[] = [undefined]; // host-only (no domain attr)
  // Build every parent domain variant: crm.s8travel.com, .crm.s8travel.com, s8travel.com, .s8travel.com, com, .com
  for (let i = 0; i < parts.length; i++) {
    const d = parts.slice(i).join(".");
    if (!d) continue;
    variants.push(d);
    variants.push("." + d);
  }
  return variants;
}

function setGTCookie(value: string | null) {
  const domains = getAllDomainVariants();
  const isSecure = window.location.protocol === "https:";
  const sameSiteAttr = `; SameSite=Lax${isSecure ? "; Secure" : ""}`;

  if (value) {
    for (const d of domains) {
      document.cookie = `googtrans=${value}; path=/${d ? `; domain=${d}` : ""}${sameSiteAttr}`;
    }
  } else {
    for (const d of domains) {
      for (const p of ["/", ""]) {
        document.cookie = `googtrans=; path=${p}; expires=Thu, 01 Jan 1970 00:00:00 GMT${d ? `; domain=${d}` : ""}`;
      }
    }
    for (const name of ["googtrans", "GOOGTRANS", "_googtrans"]) {
      for (const d of domains) {
        document.cookie = `${name}=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT${d ? `; domain=${d}` : ""}`;
      }
    }
    try {
      localStorage.removeItem("googtrans");
      sessionStorage.removeItem("googtrans");
    } catch { /* ignore */ }
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
        startZhCorrectionObserver();
        clearInterval(interval);
      } else if (attempts >= 20) {
        clearInterval(interval);
        window.location.reload();
      }
    }, 300);
  };

  const handleRestore = () => {
    setGTCookie(null);
    stopZhCorrectionObserver();
    setTimeout(() => window.location.reload(), 100);
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
  title: string;        // = key i18n (zh-TW.json). Bản dịch ở src/locales/zh-TW.json
  url: string;
  icon: React.ElementType;
  resource?: Resource;  // undefined = luôn hiển thị
  minRole?: string;     // yêu cầu role tối thiểu
  boPhanOnly?: string;  // chỉ hiện với bộ phận này (+ admin)
}

const menuGroups: { label: string; items: MenuItem[] }[] = [
  {
    label: "KHÁCH HÀNG",
    items: [
      { title: "Lead", url: "/leads", icon: Users2, resource: "lead" },
      { title: "Lead cần xử lý", url: "/viec-lead", icon: Target, resource: "lead" },
      { title: "Báo cáo Lead", url: "/leads/bao-cao", icon: BarChart3, resource: "bao_cao_lead" },
    ],
  },
  {
    label: "QUẢN LÝ ĐOÀN",
    items: [
      { title: "Tổng quan", url: "/dashboard", icon: LayoutDashboard, resource: "dashboard" },
      { title: "Công việc của tôi", url: "/my-job", icon: BriefcaseBusiness, resource: "my_job" },
      { title: "Danh sách đoàn", url: "/doan", icon: List, resource: "doan" },
      { title: "Theo dõi", url: "/theo-doi", icon: ClipboardList, resource: "theo_doi" },
      { title: "Xếp HDV", url: "/xep-hdv", icon: CalendarCheck, resource: "xep_hdv" },
      { title: "Lock Phòng", url: "/lock-phong", icon: CalendarRange, resource: "lock_phong" },
      { title: "Invoice", url: "/invoice", icon: FileText, resource: "invoice" },
      { title: "Báo Giá", url: "/bao-gia", icon: Calculator, resource: "bao_gia" },
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
      { title: "Đề nghị thanh toán", url: "/de-nghi-thanh-toan", icon: CreditCard, resource: "dntt", boPhanOnly: "ke_toan", minRole: "giam_doc" },
      { title: "Thanh toán định kỳ", url: "/thanh-toan-dinh-ky", icon: CalendarClock, resource: "thanh_toan_dk" },
      { title: "Thanh Toán, Hóa Đơn & UNC", url: "/hoa-don-unc", icon: FileStack, resource: "hoa_don_unc", boPhanOnly: "ke_toan" },
      { title: "Công nợ", url: "/cong-no", icon: Wallet, resource: "cong_no" },
      { title: "Người dùng", url: "/quan-ly/nguoi-dung", icon: Users, resource: "nguoi_dung" },
      { title: "Agent", url: "/quan-ly/agent", icon: Bot, resource: "agent" },
      { title: "Phân công team", url: "/settings/teams", icon: Users2, resource: "phan_cong_team" },
    ],
  },
];

function MenuItemWrapper({ item, collapsed, isActive, badgeCount = 0, badgeColor = "bg-orange-500" }: { item: MenuItem; collapsed: boolean; isActive: boolean; badgeCount?: number; badgeColor?: string }) {
  const allowed = usePermission(item.resource ?? "doan", "view");
  const roleOk = useRoleAtLeast(item.minRole ?? "nhan_vien");
  const boPhanOk = useBoPhan(item.boPhanOnly ?? "");

  if (item.resource && !allowed) return null;
  // Khi có cả minRole và boPhanOnly → semantic OR (match bộ phận HOẶC đạt minRole).
  // Khi chỉ có một → AND như cũ.
  if (item.minRole && item.boPhanOnly) {
    if (!roleOk && !boPhanOk) return null;
  } else {
    if (item.minRole && !roleOk) return null;
    if (item.boPhanOnly && !boPhanOk) return null;
  }

  const displayTitle = t(item.title);

  return (
    <SidebarMenuItem>
      <SidebarMenuButton asChild isActive={isActive} tooltip={displayTitle}>
        <NavLink
          to={item.url}
          className="transition-colors"
          activeClassName="font-medium"
        >
          <item.icon className="h-4 w-4" />
          {!collapsed && (
            badgeCount > 0 ? (
              <span className="flex-1 flex items-center justify-between">
                <span className="notranslate">{displayTitle}</span>
                <span className={`ml-1 min-w-[18px] h-[18px] rounded-full ${badgeColor} text-white text-[10px] font-bold flex items-center justify-center px-1`}>
                  {badgeCount}
                </span>
              </span>
            ) : (
              <span className="notranslate">{displayTitle}</span>
            )
          )}
        </NavLink>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}

export function AppSidebar() {
  useTranslate(); // re-render khi đổi ngôn ngữ (toggle 🇹🇼)
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const { session } = useCurrentSession();
  // Điều hành / admin: thấy alert deadline của TẤT CẢ lock phòng.
  const includeAllAlerts = user?.bo_phan === "dieu_hanh" || user?.role === "admin";
  const deadlineAlerts = useLockPhongDeadlineAlerts(session?.user?.id ?? null, { includeAll: includeAllAlerts });
  const { data: invoiceBadge = 0 } = useThongBaoCount(session?.user?.id ?? null, "gia");
  const { data: suCoBadge = 0 } = useThongBaoCount(session?.user?.id ?? null, "su_co");
  const { data: giaoViecBadge = 0 } = useThongBaoCount(session?.user?.id ?? null, "giao_viec");
  const { data: leadStats } = useLeadStats(session?.user?.id ?? null);
  const { data: viecLeadBadge = 0 } = useMyOverdueCount(session?.user?.id ?? null);
  const leadBadge = (leadStats?.lead_moi_today ?? 0) + (leadStats?.follow_up_today ?? 0) + (leadStats?.follow_up_overdue ?? 0);
  const leadOverdue = (leadStats?.follow_up_overdue ?? 0) > 0;

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
            className="h-11 w-11 shrink-0 object-contain"
          />
          {!collapsed && (
            <span className="font-bold text-sm text-primary truncate flex-1">
              S8 TRAVEL
            </span>
          )}
          <TranslateButton collapsed={collapsed} />
        </div>
      </SidebarHeader>

      <SidebarContent>
        {menuGroups.map((group) => (
          <SidebarGroup key={group.label}>
            <SidebarGroupLabel className="notranslate">{t(group.label)}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {group.items.map((item) => {
                  const badgeCount =
                    item.url === "/lock-phong" ? deadlineAlerts.length :
                    item.url === "/invoice" ? invoiceBadge :
                    item.url === "/theo-doi" ? suCoBadge :
                    item.url === "/my-job" ? giaoViecBadge :
                    item.url === "/viec-lead" ? viecLeadBadge :
                    item.url === "/leads" ? leadBadge : 0;
                  // Quá hạn → đỏ (urgent), còn lại → cam mặc định
                  const badgeColor =
                    ((item.url === "/leads" && leadOverdue) || item.url === "/viec-lead")
                      ? "bg-red-500" : "bg-orange-500";
                  return (
                    <MenuItemWrapper
                      key={item.url}
                      item={item}
                      collapsed={collapsed}
                      isActive={isActive(item.url)}
                      badgeCount={badgeCount}
                      badgeColor={badgeColor}
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
            <div className="flex items-center gap-0.5 shrink-0">
              <NotificationBell userId={session?.user?.id ?? null} />
              <UserSettingsMenu user={user} onLogout={handleLogout} />
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-1">
            <NotificationBell userId={session?.user?.id ?? null} />
            <UserSettingsMenu user={user} onLogout={handleLogout} collapsed />
          </div>
        )}
      </SidebarFooter>
    </Sidebar>
  );
}
