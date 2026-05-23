import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { type DNTTRow } from "@/hooks/use-chi-phi";
import { t, useTranslate } from "@/lib/i18n";

const fmt = (n: number) => n.toLocaleString("vi-VN");

interface Props {
  chiPhiId: number | undefined;
  dnttList: DNTTRow[];
}

export default function ThanhToanCell({ chiPhiId, dnttList }: Props) {
  useTranslate();
  if (!chiPhiId) return <span className="text-xs text-muted-foreground">—</span>;

  const myDntt = dnttList.filter(
    d => d.ref_loai === "doan_chi_phi" && d.ref_id === chiPhiId && d.trang_thai_duyet === "da_duyet"
  );

  if (myDntt.length === 0) {
    return <span className="text-xs text-muted-foreground">—</span>;
  }

  return (
    <div className="space-y-1 min-w-[100px]">
      {myDntt.map(d => (
        <div key={d.id} className="text-xs">
          {d.payment_status === "paid" ? (
            <div>
              <Badge className="text-[10px] px-1.5 py-0 bg-primary">{t("Đã TT")}</Badge>
              {d.thanh_toan_luc && (
                <span className="ml-1 text-muted-foreground">
                  {format(new Date(d.thanh_toan_luc), "dd/MM")}
                </span>
              )}
            </div>
          ) : (
            <div>
              <Badge variant="secondary" className="text-[10px] px-1.5 py-0 bg-yellow-100 text-yellow-800 border-yellow-300">
                {t("Chờ UNC")}
              </Badge>
              <span className="ml-1 font-medium">{fmt(d.so_tien - (d.paid_amount || 0))}</span>
            </div>
          )}
          {d.la_coc && (
            <span className="text-[9px] text-muted-foreground">
              ({t("Cọc")}{d.ty_le_coc ? ` ${d.ty_le_coc}%` : ""})
            </span>
          )}
        </div>
      ))}
    </div>
  );
}
