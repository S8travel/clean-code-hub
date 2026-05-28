import { useState, useEffect } from "react";
import { Loader2, Pencil, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DecimalInput } from "@/components/ui/decimal-input";
import { useAuth } from "@/hooks/use-auth";
import { useSaveHoaDonSoTien, type HoaDonUNCRow } from "@/hooks/use-hoa-don-unc";
import { toast } from "@/hooks/use-toast";
import { errMsg } from "@/lib/error";
import { t, useTranslate } from "@/lib/i18n";

// Cột "Hóa đơn": nhập SỐ TIỀN hóa đơn (thay upload ảnh). Lưu xong so với
// so_tien của DNTT — lệch bất kỳ → tạo việc ưu tiên cao + chuông cho OP.
export function HoaDonAmountCell({ row }: { row: HoaDonUNCRow }) {
  useTranslate();
  const { user } = useAuth();
  const saveMut = useSaveHoaDonSoTien();
  const entered = (row.hoa_don_so_tien ?? 0) > 0;
  // Có số rồi → chế độ xem (khoá), bấm Sửa mới nhập lại. Chưa có → nhập luôn.
  const [editing, setEditing] = useState(!entered);
  const [val, setVal] = useState<number>(row.hoa_don_so_tien ?? 0);

  useEffect(() => {
    setVal(row.hoa_don_so_tien ?? 0);
    setEditing((row.hoa_don_so_tien ?? 0) <= 0);
  }, [row.hoa_don_so_tien]);

  const lech = entered ? Math.round(row.hoa_don_so_tien!) - Math.round(row.so_tien) : 0;

  const handleConfirm = () => {
    const next = val > 0 ? val : null;
    if (next == null) {
      toast({ title: t("Nhập số tiền hóa đơn trước khi xác nhận"), variant: "destructive" });
      return;
    }
    if (next === (row.hoa_don_so_tien ?? null)) {
      setEditing(false);
      return;
    }
    saveMut.mutate(
      {
        id: row.id,
        hoaDonSoTien: next,
        dnttSoTien: row.so_tien,
        doanId: row.doan_id,
        taoBoi: row.tao_boi,
        tenDoan: row.ten_doan,
        nguoiGiao: user?.user_id ?? "",
      },
      {
        onSuccess: (res) => {
          setEditing(false);
          if (res.mismatch && res.notified) {
            toast({ title: t("⚠ Hóa đơn lệch — đã báo OP + tạo việc ưu tiên cao"), variant: "destructive" });
          } else if (res.mismatch) {
            toast({ title: t("⚠ Hóa đơn lệch số tiền (chưa xác định OP để báo)"), variant: "destructive" });
          } else {
            toast({ title: t("Đã lưu số tiền hóa đơn") });
          }
        },
        onError: (err: unknown) => toast({ title: `${t("Lỗi")}: ${errMsg(err) || t("Không lưu được")}`, variant: "destructive" }),
      },
    );
  };

  // Chế độ xem (đã có số, không edit) — hiển thị số + badge + nút Sửa
  if (!editing) {
    return (
      <div className="flex flex-col gap-1 min-w-[150px]">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-medium tabular-nums">
            {Math.round(row.hoa_don_so_tien ?? 0).toLocaleString("vi-VN")} ₫
          </span>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 text-blue-500"
            title={t("Sửa số tiền hóa đơn")}
            onClick={() => { setVal(row.hoa_don_so_tien ?? 0); setEditing(true); }}
          >
            <Pencil className="h-3 w-3" />
          </Button>
        </div>
        {lech === 0 ? (
          <span className="text-[10px] text-emerald-600 font-medium">✓ {t("Khớp số tiền DNTT")}</span>
        ) : (
          <span
            className="text-[10px] text-red-600 font-medium"
            title={`HĐ ${Math.round(row.hoa_don_so_tien!).toLocaleString("vi-VN")} ₫ vs DNTT ${Math.round(row.so_tien).toLocaleString("vi-VN")} ₫`}
          >
            ⚠ {t("Lệch")} {lech > 0 ? "+" : ""}{lech.toLocaleString("vi-VN")} ₫
          </span>
        )}
      </div>
    );
  }

  // Chế độ nhập — input + nút Xác nhận
  return (
    <div className="flex flex-col gap-1 min-w-[150px]">
      <div className="flex items-center gap-1">
        <DecimalInput
          value={val}
          onChange={(v) => setVal(v ?? 0)}
          placeholder={t("Nhập số tiền HĐ")}
          className="h-7 text-xs flex-1 text-right"
        />
        <Button
          size="icon"
          className="h-7 w-7 shrink-0"
          title={t("Xác nhận số tiền hóa đơn")}
          disabled={saveMut.isPending}
          onClick={handleConfirm}
        >
          {saveMut.isPending
            ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
            : <Check className="h-3.5 w-3.5" />}
        </Button>
      </div>
      {!entered ? (
        <span className="text-[10px] text-muted-foreground">{t("Chưa nhập hóa đơn")}</span>
      ) : (
        <span className="text-[10px] text-muted-foreground">{t("Đang sửa — bấm Xác nhận để lưu")}</span>
      )}
    </div>
  );
}
