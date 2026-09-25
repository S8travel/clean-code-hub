import { useState } from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { usePermission } from "@/hooks/use-permissions";
import { AccessDenied } from "@/components/PermissionGate";
import { t, useTranslate } from "@/lib/i18n";
import type { WebRowFilter } from "@/lib/web-anh";
import WebVenueTable from "@/components/web-gioi-thieu/WebVenueTable";
import WebCanhDiemTable from "@/components/web-gioi-thieu/WebCanhDiemTable";

type Tab = "khach_san" | "nha_hang" | "canh_diem";

/** Ảnh + logo + ẩn/hiện cho trang giới thiệu đối tác (repo s8-gioi-thieu).
 *  Trang web đọc thẳng từ hệ thống nên tải xong là lần mở web kế tiếp thấy ngay. */
function WebGioiThieuPageContent() {
  useTranslate();
  const canEdit = usePermission("danh_muc", "edit");
  const [tab, setTab] = useState<Tab>("khach_san");
  const [tim, setTim] = useState("");
  const [chiChuaAnh, setChiChuaAnh] = useState(false);
  const [chiDangAn, setChiDangAn] = useState(false);
  const filter: WebRowFilter = { tim, chiChuaAnh, chiDangAn };

  return (
    <div className="p-4 space-y-3">
      <div className="space-y-0.5">
        <h1 className="text-lg font-semibold">{t("Ảnh trang giới thiệu")}</h1>
        <p className="text-xs text-muted-foreground">
          {t("Tải ảnh và logo cho trang giới thiệu đối tác. Ảnh mới hiện trên web ngay lần mở trang kế tiếp.")}
        </p>
        {!canEdit && (
          <p className="text-xs text-amber-600">{t("Bạn chỉ có quyền xem — không tải ảnh được.")}</p>
        )}
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)}>
        <div className="flex flex-wrap items-center gap-2">
          <TabsList className="h-8">
            <TabsTrigger value="khach_san" className="text-xs h-7">{t("Khách sạn")}</TabsTrigger>
            <TabsTrigger value="nha_hang" className="text-xs h-7">{t("Nhà hàng")}</TabsTrigger>
            <TabsTrigger value="canh_diem" className="text-xs h-7">{t("Cảnh điểm")}</TabsTrigger>
          </TabsList>
          <div className="relative w-64 max-w-full">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
            <Input
              placeholder={t("Tìm theo tên hoặc địa điểm…")}
              value={tim}
              onChange={(e) => setTim(e.target.value)}
              className="h-7 text-xs pl-7"
            />
          </div>
          <label className="flex items-center gap-1.5 text-xs cursor-pointer">
            <Checkbox checked={chiChuaAnh} onCheckedChange={(v) => setChiChuaAnh(v === true)} />
            {t("Chỉ chưa có ảnh")}
          </label>
          <label className="flex items-center gap-1.5 text-xs cursor-pointer">
            <Checkbox checked={chiDangAn} onCheckedChange={(v) => setChiDangAn(v === true)} />
            {t("Đang ẩn trên web")}
          </label>
        </div>

        <TabsContent value="khach_san">
          <WebVenueTable loai="khach_san" canEdit={canEdit} filter={filter} />
        </TabsContent>
        <TabsContent value="nha_hang">
          <WebVenueTable loai="nha_hang" canEdit={canEdit} filter={filter} />
        </TabsContent>
        <TabsContent value="canh_diem">
          <WebCanhDiemTable canEdit={canEdit} filter={filter} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default function WebGioiThieuPage() {
  const canView = usePermission("danh_muc", "view");
  if (!canView) return <AccessDenied />;
  return <WebGioiThieuPageContent />;
}
