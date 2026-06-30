import { format } from "date-fns";
import { CreditCard } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger,
} from "@/components/ui/select";
import { TableCell, TableRow } from "@/components/ui/table";
import { toast } from "@/hooks/use-toast";
import { type HoaDonUNCRow as HoaDonRow } from "@/hooks/use-hoa-don-unc";
import { t } from "@/lib/i18n";
import { buildPaymentContent } from "./payment-content";
import { DocCell } from "./DocCell";
import { HoaDonAmountCell } from "./HoaDonAmountCell";
import { PAYMENT_SOURCE_LABELS as PAYMENT_SOURCES } from "@/lib/payment-sources";

const fmt = (n: number) => n.toLocaleString("vi-VN");

const loaiLabel: Record<string, { textKey: string; color: string }> = {
  khach_san: { textKey: "KS", color: "bg-blue-100 text-blue-700" },
  nha_hang: { textKey: "NH", color: "bg-orange-100 text-orange-700" },
  dich_vu: { textKey: "DV", color: "bg-purple-100 text-purple-700" },
  xe: { textKey: "Xe", color: "bg-green-100 text-green-700" },
  visa: { textKey: "Visa", color: "bg-indigo-100 text-indigo-700" },
  bao_hiem: { textKey: "BH", color: "bg-rose-100 text-rose-700" },
};

interface Props {
  row: HoaDonRow;
  stt: number;
  canTru: number;
  /** Phần đã trả bằng voucher (payments method='voucher') — hiển thị "Voucher: −X". */
  voucherPaid: number;
  /** Cọc đã trả của anh em cùng ref — hiển thị "Đã cọc". */
  cocSibling: number;
  /** Tổng so_tien MỌI ĐNTT khác cùng ref (cọc + bổ sung) — mốc so sánh hóa đơn gộp. */
  siblingTotal: number;
  paidNguon?: string;
  selectedNguon: string;
  onSelectNguon: (v: string) => void;
  onMarkPaid: () => void;
  markPaidPending: boolean;
  onUncUploaded: (row: HoaDonRow, url: string) => void;
}

export function HoaDonUNCRow({
  row, stt, canTru, voucherPaid, cocSibling, siblingTotal, paidNguon,
  selectedNguon, onSelectNguon, onMarkPaid, markPaidPending, onUncUploaded,
}: Props) {
  const lt = loaiLabel[row.loai];
  const lTxt = lt ? t(lt.textKey) : row.loai;
  const lCls = lt?.color ?? "bg-muted text-muted-foreground";

  // Phần đã khấu = cấn trừ công nợ + trả bằng voucher → cash thực còn phải trả.
  const daKhau = canTru + voucherPaid;
  const thucTT = Math.max(0, row.so_tien - daKhau);
  const isThuHoi = (row.ghi_chu || "").includes("[Thu hồi]");
  const sign = isThuHoi ? "-" : "";
  const amountCls = isThuHoi ? "text-blue-600" : "";

  return (
    <TableRow>
      <TableCell className="text-center text-sm">{stt}</TableCell>
      <TableCell>
        <span className="text-sm font-medium">{row.ten_doan ?? "—"}</span>
      </TableCell>
      <TableCell>
        <span className={cn("px-2 py-0.5 rounded text-xs font-medium", lCls)}>
          {lTxt}
        </span>
      </TableCell>
      <TableCell className="text-sm">{row.mo_ta ?? "—"}</TableCell>
      <TableCell className="text-xs font-mono">
        <button
          type="button"
          className="text-left hover:bg-muted/50 px-1 -mx-1 rounded transition"
          onClick={() => {
            const content = buildPaymentContent(row);
            navigator.clipboard.writeText(content);
            toast({ title: t("Đã sao chép nội dung TT") });
          }}
          title={t("Click để sao chép")}
        >
          {buildPaymentContent(row)}
        </button>
      </TableCell>
      <TableCell className="text-right text-sm font-medium">
        <div className="space-y-0.5">
          {daKhau > 0 ? (
            <div className="text-xs space-y-0.5">
              <div className="text-muted-foreground">{t("Tổng")}: <span className={amountCls}>{sign}{fmt(row.so_tien)}</span></div>
              {voucherPaid > 0 && (
                <div className="text-purple-600">{t("Voucher")}: −{fmt(voucherPaid)}</div>
              )}
              {canTru > 0 && (
                <div className="text-amber-600">{t("Cấn trừ")}: −{fmt(canTru)}</div>
              )}
              <div className={cn("text-sm font-semibold", amountCls)}>{t("Thực TT")}: {sign}{fmt(thucTT)}</div>
            </div>
          ) : (
            <div className={amountCls}>{sign}{fmt(row.so_tien)}</div>
          )}
          {isThuHoi && (
            <span className="inline-block text-[10px] bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded font-medium">
              {t("Thu hồi")}
            </span>
          )}
          {row.la_coc && (
            <span className="inline-block text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded font-medium">
              {t("Cọc")}
            </span>
          )}
          {!row.la_coc && cocSibling > 0 && (
            <div className="text-[11px] text-muted-foreground font-normal">
              {t("Đã cọc")}: <span className="text-amber-600 font-medium">{fmt(cocSibling)}</span>
            </div>
          )}
        </div>
      </TableCell>
      <TableCell className="text-xs text-muted-foreground">
        {row.ngay_can_thanh_toan
          ? format(new Date(row.ngay_can_thanh_toan), "dd/MM/yyyy")
          : "—"}
      </TableCell>
      <TableCell>
        {row.payment_status === "paid" ? (
          <div className="flex flex-col gap-0.5">
            <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded px-2 py-0.5 w-fit">
              <CreditCard className="h-3 w-3" /> {t("Đã TT")}
            </span>
            {row.thanh_toan_luc && (
              <span className="text-xs text-muted-foreground">
                {format(new Date(row.thanh_toan_luc), "dd/MM/yyyy")}
              </span>
            )}
            {paidNguon && (
              <span className="text-xs font-medium text-blue-700">
                {paidNguon}
              </span>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-1">
            {/* Chọn nguồn = tự xác nhận TT luôn (page gọi markPaid trong onSelectNguon). */}
            <Select
              value={selectedNguon}
              onValueChange={onSelectNguon}
              disabled={markPaidPending}
            >
              <SelectTrigger className="h-7 px-2 text-xs w-[160px]">
                <span>{selectedNguon || t("Chọn nguồn")}</span>
              </SelectTrigger>
              <SelectContent>
                {PAYMENT_SOURCES.map((src) => (
                  <SelectItem key={src} value={src}>{src}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {/* Retry khi auto-confirm lỗi (chọn lại cùng nguồn không fire onValueChange) */}
            {selectedNguon && (
              <Button
                size="sm"
                className="h-7 px-2 text-xs"
                disabled={markPaidPending}
                onClick={onMarkPaid}
              >
                {markPaidPending ? t("Đang xác nhận...") : t("Xác nhận TT")}
              </Button>
            )}
          </div>
        )}
      </TableCell>
      <TableCell>
        <HoaDonAmountCell row={row} siblingTotal={siblingTotal} />
      </TableCell>
      <TableCell>
        <DocCell
          row={row}
          loaiDoc="unc"
          onUncUploaded={onUncUploaded}
        />
      </TableCell>
    </TableRow>
  );
}
