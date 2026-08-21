import { useState } from "react";
import { FileText, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { coChuGon, moFileLead, useLeadTaiLieu } from "@/hooks/use-lead-tai-lieu";
import { t } from "@/lib/i18n";

// File đối tác gửi kèm khi làm yêu cầu báo giá trên cổng 外網.
//
// Lead không có file thì KHÔNG hiện gì: đa số lead là khách lẻ, thêm một khối
// "chưa có tệp nào" vào mọi lead chỉ làm dài thêm tab Thông tin.

export function LeadTepDinhKem({ leadId }: { leadId: number }) {
  const { data } = useLeadTaiLieu(leadId);
  const [dangMo, setDangMo] = useState<number | null>(null);

  if (!data?.length) return null;

  const mo = async (id: number, duongDan: string) => {
    setDangMo(id);
    try {
      await moFileLead(duongDan);
    } catch {
      toast.error(t("Không mở được file — có thể file đã bị gỡ."));
    } finally {
      setDangMo(null);
    }
  };

  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
        {t("Tệp đính kèm")}
      </p>
      <div className="space-y-1.5">
        {data.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => mo(f.id, f.duong_dan)}
            disabled={dangMo === f.id}
            className="w-full flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-left hover:bg-muted disabled:opacity-60"
          >
            {dangMo === f.id
              ? <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />
              : <FileText className="h-3.5 w-3.5 shrink-0 text-primary" />}
            <span className="text-xs truncate flex-1">{f.file_name || f.ten || `#${f.id}`}</span>
            {f.co_chu ? (
              <span className="text-[10px] text-muted-foreground shrink-0">{coChuGon(f.co_chu)}</span>
            ) : null}
          </button>
        ))}
      </div>
      <p className="text-[11px] text-muted-foreground">{t("Đối tác gửi kèm khi yêu cầu báo giá.")}</p>
    </div>
  );
}
