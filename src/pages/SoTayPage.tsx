import { useMemo, useState } from "react";
import { BookOpen, Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { AccessDenied } from "@/components/PermissionGate";
import { usePermission } from "@/hooks/use-permissions";
import SopMucCard from "@/components/so-tay/SopMucCard";
import { SOP_DATA, SOP_CAT_LABEL, type SopCat } from "@/lib/sop-data";
import { locSop, nhomTheoCat } from "@/lib/sop-filter";
import { t, useTranslate } from "@/lib/i18n";

const TABS: { value: SopCat | null; label: string }[] = [
  { value: null, label: "Tất cả" },
  { value: "quy_trinh", label: "Quy trình" },
  { value: "tinh_huong", label: "Tình huống" },
  { value: "checklist", label: "Checklist" },
];

/**
 * Sổ tay điều hành — tra cứu quy trình, cách xử lý tình huống và checklist.
 *
 * Nội dung nằm trong lib/sop-data.ts (không phải DB) — xem ghi chú đầu file đó.
 */
export default function SoTayPage() {
  useTranslate();
  const canView = usePermission("so_tay", "view");
  const [tab, setTab] = useState<SopCat | null>(null);
  const [tuKhoa, setTuKhoa] = useState("");

  const ketQua = useMemo(() => locSop(SOP_DATA, tab, tuKhoa), [tab, tuKhoa]);
  const dangTim = tuKhoa.trim().length > 0;
  // Đang tìm hoặc đã chọn 1 nhóm → không cần gom nhóm, hiện phẳng cho gọn.
  const nhom = useMemo(
    () => (dangTim || tab ? null : nhomTheoCat(ketQua)),
    [dangTim, tab, ketQua],
  );

  if (!canView) return <AccessDenied />;

  return (
    <div className="h-full flex flex-col">
      <div className="shrink-0 flex items-center gap-2 px-6 py-4 border-b bg-background">
        <BookOpen className="h-5 w-5 text-primary" />
        <h1 className="text-xl font-bold">{t("Sổ tay điều hành")}</h1>
        <span className="text-sm text-muted-foreground">
          {t("Tra cứu quy trình & xử lý tình huống")}
        </span>
      </div>

      <div className="shrink-0 px-6 py-3 border-b bg-muted/20 space-y-2.5">
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <Input
            value={tuKhoa}
            onChange={(e) => setTuKhoa(e.target.value)}
            placeholder={t("Tìm quy trình, tình huống... (gõ không dấu cũng được)")}
            className="h-9 pl-9 pr-9 text-sm"
          />
          {dangTim && (
            <button
              type="button"
              onClick={() => setTuKhoa("")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              aria-label={t("Xóa tìm kiếm")}
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          {TABS.map((tb) => (
            <button
              key={tb.label}
              type="button"
              onClick={() => setTab(tb.value)}
              className={cn(
                "px-3 py-1 rounded-full text-xs font-medium border transition-colors",
                tab === tb.value
                  ? "bg-[#1B3A6B] text-white border-[#1B3A6B]"
                  : "bg-background text-muted-foreground border-border hover:border-primary",
              )}
            >
              {t(tb.label)}
            </button>
          ))}
          {dangTim && (
            <span className="self-center text-xs text-muted-foreground">
              {ketQua.length} {t("kết quả")}
            </span>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-auto px-6 py-4">
        {ketQua.length === 0 ? (
          <p className="text-sm text-muted-foreground py-8 text-center">
            {t("Không tìm thấy kết quả nào.")}
          </p>
        ) : nhom ? (
          <div className="space-y-5 max-w-3xl">
            {nhom.map((g) => (
              <section key={g.cat}>
                <h2 className="text-xs font-bold uppercase tracking-wide text-muted-foreground mb-2">
                  {t(SOP_CAT_LABEL[g.cat])}
                  <span className="ml-1.5 font-normal normal-case">({g.muc.length})</span>
                </h2>
                <div className="space-y-2">
                  {g.muc.map((m) => <SopMucCard key={m.id} muc={m} />)}
                </div>
              </section>
            ))}
          </div>
        ) : (
          <div className="space-y-2 max-w-3xl">
            {ketQua.map((m) => (
              // Đang tìm → mở sẵn để thấy ngay chỗ khớp, khỏi phải bấm từng cái.
              <SopMucCard key={m.id} muc={m} moSan={dangTim} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
