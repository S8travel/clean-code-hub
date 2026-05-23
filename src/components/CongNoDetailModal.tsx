import { useNavigate } from "react-router-dom";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { usePaymentsByCongNo } from "@/hooks/use-payments";
import type { CongNoRow } from "@/hooks/use-cong-no";
import { t, useTranslate } from "@/lib/i18n";

const fmt = (n: number) => n.toLocaleString("vi-VN");
const fmtDate = (s: string | null) => {
  if (!s) return "—";
  const d = new Date(s);
  return isNaN(d.getTime())
    ? "—"
    : `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
};

interface Props {
  row: CongNoRow | null;
  onClose: () => void;
}

export default function CongNoDetailModal({ row, onClose }: Props) {
  useTranslate();
  const navigate = useNavigate();
  const { data: entries = [], isLoading } = usePaymentsByCongNo(row?.id);

  const isPrepaid = row?.loai === "tra_truoc";

  return (
    <Dialog open={!!row} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {t("Chi tiết cấn trừ")} — {row?.ten_ncc || "—"}{" "}
            <span className={isPrepaid ? "text-amber-600" : "text-purple-600"}>
              ({isPrepaid ? t("Quỹ trả trước") : t("Công nợ")})
            </span>
          </DialogTitle>
        </DialogHeader>

        {row && (
          <div className="grid grid-cols-3 gap-3 text-sm">
            <div className="rounded-md border p-2">
              <p className="text-xs text-muted-foreground">{t("Gốc")}</p>
              <p className="font-semibold">{fmt(row.so_tien_goc)} ₫</p>
            </div>
            <div className="rounded-md border p-2">
              <p className="text-xs text-muted-foreground">{t("Đã cấn trừ")}</p>
              <p className="font-semibold text-purple-600">{fmt(row.so_tien_da_dung)} ₫</p>
            </div>
            <div className="rounded-md border p-2">
              <p className="text-xs text-muted-foreground">{t("Còn lại")}</p>
              <p className="font-semibold text-amber-600">{fmt(row.so_tien_con_lai)} ₫</p>
            </div>
          </div>
        )}

        <div className="max-h-[55vh] overflow-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow className="text-xs">
                <TableHead className="py-2 px-3 w-[110px]">{t("Ngày")}</TableHead>
                <TableHead className="py-2 px-3">{t("Đoàn")}</TableHead>
                <TableHead className="py-2 px-3">{t("Mô tả ĐNTT")}</TableHead>
                <TableHead className="py-2 px-3 w-[130px] text-right">{t("Số tiền")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-center py-6 text-muted-foreground text-sm">
                    {t("Đang tải...")}
                  </TableCell>
                </TableRow>
              ) : entries.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-center py-6 text-muted-foreground text-sm">
                    {t("Chưa có lần cấn trừ nào.")}
                  </TableCell>
                </TableRow>
              ) : (
                entries.map((e) => (
                  <TableRow key={e.id} className="text-sm">
                    <TableCell className="py-2 px-3 whitespace-nowrap">{fmtDate(e.ngay_thanh_toan)}</TableCell>
                    <TableCell className="py-2 px-3">
                      {e.doan_id ? (
                        <button
                          className="text-left hover:underline text-primary font-medium"
                          onClick={() => { onClose(); navigate(`/doan/${e.doan_id}`); }}
                        >
                          {e.ten_doan || `${t("Đoàn")} #${e.doan_id}`}
                        </button>
                      ) : (
                        <span className="text-muted-foreground">{e.ten_doan || "—"}</span>
                      )}
                    </TableCell>
                    <TableCell className="py-2 px-3 text-muted-foreground text-xs">
                      {e.dntt_mo_ta || "—"}
                    </TableCell>
                    <TableCell className="py-2 px-3 text-right font-semibold tabular-nums">
                      {fmt(e.so_tien)} ₫
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </DialogContent>
    </Dialog>
  );
}
