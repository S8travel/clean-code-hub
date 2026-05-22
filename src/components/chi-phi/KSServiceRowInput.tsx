import { useState, useCallback, useEffect, useRef, memo } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DecimalInput } from "@/components/ui/decimal-input";
import { TableCell, TableRow } from "@/components/ui/table";
import type { LocalKSRow, KSLoaiRow } from "./ks-section-shared";

const fmt = (n: number) => n.toLocaleString("vi-VN");

type ServiceLoai = Exclude<KSLoaiRow, "phong">;

interface Props {
  row: LocalKSRow;
  globalIdx: number;
  onFieldChange: (idx: number, field: string, value: string | number) => void;
  onBlurSave: (idx: number) => void;
  onDelete: (idx: number) => void;
  /** Khoá input khi KS đã có DNTT paid. */
  disabled?: boolean;
  /** Toggle nguồn (Công ty ↔ HDV) cho dòng dịch vụ đã lưu. */
  onToggleNguoiTt?: (idx: number) => void;
}

export default memo(function KSServiceRowInput({
  row, globalIdx, onFieldChange, onBlurSave, onDelete, disabled = false, onToggleNguoiTt,
}: Props) {
  const [localTen, setLocalTen] = useState(row.loai_phong);
  const [localSL, setLocalSL] = useState(String(row.so_phong));
  const [localFoc, setLocalFoc] = useState(String(row.foc_count ?? 0));

  // Re-sync state nội bộ khi prop đổi do reconcile (DB/máy khác). Prop chỉ
  // đổi sau blur (onFieldChange) hoặc reconcile → không đè lúc đang gõ.
  const externalKey = `${row.id ?? "new"}|${row.loai_phong}|${row.so_phong}|${row.foc_count ?? 0}`;
  const lastSyncedKeyRef = useRef(externalKey);
  useEffect(() => {
    if (lastSyncedKeyRef.current !== externalKey) {
      lastSyncedKeyRef.current = externalKey;
      setLocalTen(row.loai_phong);
      setLocalSL(String(row.so_phong));
      setLocalFoc(String(row.foc_count ?? 0));
    }
  }, [externalKey, row]);

  const handleTenBlur = useCallback(() => {
    onFieldChange(globalIdx, "loai_phong", localTen);
    setTimeout(() => onBlurSave(globalIdx), 0);
  }, [globalIdx, localTen, onFieldChange, onBlurSave]);

  const handleSLBlur = useCallback(() => {
    const val = Number(localSL) || 0;
    onFieldChange(globalIdx, "so_phong", val);
    setTimeout(() => onBlurSave(globalIdx), 0);
  }, [globalIdx, localSL, onFieldChange, onBlurSave]);

  const handleFocBlur = useCallback(() => {
    const val = Math.max(0, Number(localFoc) || 0);
    onFieldChange(globalIdx, "foc_count", val);
    setTimeout(() => onBlurSave(globalIdx), 0);
  }, [globalIdx, localFoc, onFieldChange, onBlurSave]);

  const sl = Number(localSL) || 0;
  const foc = Math.max(0, Number(localFoc) || 0);
  const billed = Math.max(0, sl - foc);
  const thanhTien = billed * (row.gia_phong || 0);
  const currentLoai: ServiceLoai =
    row.loai_row && row.loai_row !== "phong" ? row.loai_row : "dich_vu_khac";

  const lockTitle = "Đã thanh toán — dùng nút Điều chỉnh để track";
  const loaiLabel = currentLoai === "dich_vu_an" ? "Ăn" : currentLoai === "dich_vu_ve" ? "Vé" : "Khác";

  return (
    <TableRow className="text-xs">
      <TableCell className="py-0.5 px-2">
        {disabled ? (
          <span className="text-xs font-medium" title={lockTitle}>{localTen || "—"}</span>
        ) : (
          <Input
            value={localTen}
            onChange={(e) => setLocalTen(e.target.value)}
            onBlur={handleTenBlur}
            className="h-6 text-xs"
            placeholder="Tên dịch vụ..."
          />
        )}
      </TableCell>
      <TableCell className="py-0.5 px-2">
        {disabled ? (
          <span className="text-xs" title={lockTitle}>{loaiLabel}</span>
        ) : (
          <select
            value={currentLoai}
            onChange={(e) => {
              onFieldChange(globalIdx, "loai_row", e.target.value as ServiceLoai);
              setTimeout(() => onBlurSave(globalIdx), 0);
            }}
            className="h-6 text-xs border rounded px-1 bg-background w-full"
          >
            <option value="dich_vu_an">Ăn</option>
            <option value="dich_vu_ve">Vé</option>
            <option value="dich_vu_khac">Khác</option>
          </select>
        )}
      </TableCell>
      <TableCell className="py-0.5 px-2">
        {disabled ? (
          <span className="text-xs text-center block tabular-nums" title={lockTitle}>{localSL || 0}</span>
        ) : (
          <Input
            type="number"
            value={localSL}
            onChange={(e) => setLocalSL(e.target.value)}
            onBlur={handleSLBlur}
            className="h-6 text-xs text-center w-[60px] [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
          />
        )}
      </TableCell>
      <TableCell className="py-0.5 px-2">
        {disabled ? (
          <span className="text-xs text-center block tabular-nums" title={lockTitle}>{localFoc || 0}</span>
        ) : (
          <Input
            type="number"
            value={localFoc}
            onChange={(e) => setLocalFoc(e.target.value)}
            onBlur={handleFocBlur}
            placeholder="0"
            title="FOC (miễn phí) — OP tự nhập"
            className="h-6 text-xs text-center w-[60px] [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
          />
        )}
      </TableCell>
      <TableCell className="py-0.5 px-2">
        {disabled ? (
          <span className="text-xs text-right block tabular-nums" title={lockTitle}>{fmt(row.gia_phong || 0)}</span>
        ) : (
          <DecimalInput
            value={row.gia_phong}
            onChange={(v) => onFieldChange(globalIdx, "gia_phong", v)}
            onBlur={() => onBlurSave(globalIdx)}
            placeholder="0"
            className="h-6 text-xs w-[112px] text-right"
          />
        )}
      </TableCell>
      <TableCell className="py-0.5 px-2 text-xs font-medium" title={foc > 0 ? `${sl} − ${foc} FOC = ${billed}` : undefined}>
        <div className="flex flex-col items-start gap-0.5">
          <span>{fmt(thanhTien)}</span>
          {onToggleNguoiTt && row.id != null && (
            <button
              onClick={() => !disabled && onToggleNguoiTt(globalIdx)}
              disabled={disabled}
              title={row.is_hdv ? "HDV trả — bấm để chuyển Công ty" : "Công ty trả — bấm để chuyển HDV (HDV trả tiền mặt, không vào ĐNTT)"}
              className={
                "px-1.5 py-0.5 rounded text-[10px] font-medium border transition-colors " +
                (disabled ? "cursor-default opacity-70 " : "cursor-pointer ") +
                (row.is_hdv
                  ? "bg-amber-50 text-amber-600 border-amber-200 hover:bg-amber-100"
                  : "bg-blue-50 text-blue-600 border-blue-200 hover:bg-blue-100")
              }
            >
              {row.is_hdv ? "HDV" : "Công ty"}
            </button>
          )}
        </div>
      </TableCell>
      <TableCell className="py-0.5 px-2">
        {!disabled && (
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={() => onDelete(globalIdx)}
          >
            <Trash2 className="h-3 w-3 text-destructive" />
          </Button>
        )}
      </TableCell>
    </TableRow>
  );
});
