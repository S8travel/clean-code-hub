import { useState } from "react";
import { Plus, X, AlertTriangle, ClipboardList } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth";
import { t, useTranslate } from "@/lib/i18n";
import TaoSuCoModal from "./TaoSuCoModal";
import TaoViecModal from "@/components/my-job/TaoViecModal";

// FAB "Thao tác nhanh" (thay nút AI chat cũ). Bấm → bung 2 action:
//  1. Tạo sự cố nhanh   → TaoSuCoModal (doan_log loai='su_co')
//  2. Giao việc nhanh   → TaoViecModal (cong_viec)
export default function QuickActions() {
  useTranslate();
  const { user } = useAuth();
  const uid = user?.user_id;
  const uname = user?.ho_ten;

  const [menuOpen, setMenuOpen] = useState(false);
  const [modal, setModal] = useState<null | "su_co" | "viec">(null);

  const openModal = (m: "su_co" | "viec") => {
    setMenuOpen(false);
    setModal(m);
  };

  const actions = [
    { key: "su_co" as const, label: t("Tạo sự cố nhanh"), icon: AlertTriangle, cls: "text-amber-600" },
    { key: "viec" as const, label: t("Giao việc nhanh"), icon: ClipboardList, cls: "text-primary" },
  ];

  return (
    <>
      {/* Backdrop để bấm ngoài đóng menu */}
      {menuOpen && (
        <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} aria-hidden />
      )}

      {/* Cụm FAB + action — chừa safe-area dưới cho mobile/PWA */}
      <div className="fixed right-5 bottom-5 z-50 flex flex-col items-end gap-2 pb-[env(safe-area-inset-bottom)]">
        {menuOpen && actions.map((a) => (
          <button
            key={a.key}
            onClick={() => openModal(a.key)}
            className="flex items-center gap-2 rounded-full border bg-background shadow-md pl-3 pr-4 py-2 text-xs font-medium hover:bg-muted transition-colors animate-in fade-in slide-in-from-bottom-1"
          >
            <a.icon className={cn("h-4 w-4", a.cls)} />
            {a.label}
          </button>
        ))}

        <button
          onClick={() => setMenuOpen((v) => !v)}
          className={cn(
            "h-12 w-12 rounded-full shadow-lg flex items-center justify-center transition-all",
            menuOpen
              ? "bg-muted text-muted-foreground rotate-45"
              : "bg-primary text-primary-foreground hover:bg-primary/90"
          )}
          title={t("Thao tác nhanh")}
          aria-label={t("Thao tác nhanh")}
        >
          {menuOpen ? <X className="h-5 w-5 -rotate-45" /> : <Plus className="h-5 w-5" />}
        </button>
      </div>

      {/* Modals — chỉ render khi có user (FAB nằm trong khu vực đã đăng nhập) */}
      {uid && uname && (
        <>
          <TaoSuCoModal
            open={modal === "su_co"}
            onClose={() => setModal(null)}
            userId={uid}
            userName={uname}
          />
          <TaoViecModal
            open={modal === "viec"}
            onClose={() => setModal(null)}
            userId={uid}
            userName={uname}
          />
        </>
      )}
    </>
  );
}
