import { Users, ShieldAlert, Shield, History, Building2 } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/hooks/use-auth";
import { t, useTranslate } from "@/lib/i18n";
import { NguoiDungTab } from "@/components/nguoi-dung/NguoiDungTab";
import { VanPhongTab } from "@/components/nguoi-dung/VanPhongTab";
import { PhanQuyenTab } from "@/components/nguoi-dung/PhanQuyenTab";
import { NhatKyTab } from "@/components/nguoi-dung/NhatKyTab";

// ── Admin Guard ─────────────────────────────────────────────────────────────

function AdminGuard({ children }: { children: React.ReactNode }) {
  useTranslate();
  const { user } = useAuth();

  if (!user || user.role !== "admin") {
    return (
      <div className="flex flex-1 items-center justify-center h-[calc(100vh-3rem)]">
        <div className="text-center space-y-3">
          <ShieldAlert className="h-12 w-12 mx-auto text-destructive opacity-60" />
          <div>
            <h2 className="font-semibold text-base">{t("Không có quyền truy cập")}</h2>
            <p className="text-sm text-muted-foreground mt-1">{t("Trang này chỉ dành cho Admin.")}</p>
          </div>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}

// ── Main Page ────────────────────────────────────────────────────────────────

export default function NguoiDungPage() {
  return (
    <AdminGuard>
      <NguoiDungContent />
    </AdminGuard>
  );
}

function NguoiDungContent() {
  useTranslate();
  return (
    <div className="h-[calc(100vh-3rem)] flex flex-col overflow-hidden">
      <Tabs defaultValue="nguoi_dung" className="flex flex-col flex-1 overflow-hidden">
        <div className="border-b px-6 pt-4 pb-0 shrink-0">
          <h1 className="text-lg font-semibold mb-3">{t("Quản lý hệ thống")}</h1>
          <TabsList className="h-9">
            <TabsTrigger value="nguoi_dung" className="text-xs gap-1.5">
              <Users className="h-3.5 w-3.5" /> {t("Người dùng")}
            </TabsTrigger>
            <TabsTrigger value="van_phong" className="text-xs gap-1.5">
              <Building2 className="h-3.5 w-3.5" /> {t("Văn phòng")}
            </TabsTrigger>
            <TabsTrigger value="phan_quyen" className="text-xs gap-1.5">
              <Shield className="h-3.5 w-3.5" /> {t("Phân quyền")}
            </TabsTrigger>
            <TabsTrigger value="nhat_ky" className="text-xs gap-1.5">
              <History className="h-3.5 w-3.5" /> {t("Nhật ký")}
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="nguoi_dung" className="flex-1 overflow-hidden mt-0">
          <NguoiDungTab />
        </TabsContent>
        <TabsContent value="van_phong" className="flex-1 overflow-auto mt-0 px-6 py-4">
          <VanPhongTab />
        </TabsContent>
        <TabsContent value="phan_quyen" className="flex-1 overflow-auto mt-0 px-6 py-4">
          <PhanQuyenTab />
        </TabsContent>
        <TabsContent value="nhat_ky" className="flex-1 overflow-auto mt-0 px-6 py-4">
          <NhatKyTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
