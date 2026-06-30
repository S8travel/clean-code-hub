import { useState, useCallback, useEffect, useRef, memo } from "react";
import { format } from "date-fns";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DecimalInput } from "@/components/ui/decimal-input";
import { TableCell, TableRow } from "@/components/ui/table";
import type { LocalKSRow } from "./ks-section-shared";
import { t, useTranslate } from "@/lib/i18n";

const fmt = (n: number) => Math.round(n).toLocaleString("vi-VN");

interface Props {
  row: LocalKSRow;
  globalIdx: number;
  // FOC pro-rata tính từ parent — trừ vào "Thành tiền" hiển thị NET.
  rowFocDeduction?: number;
  onFieldChange: (idx: number, field: string, value: string | number) => void;
  onBlurSave: (idx: number) => void;
  onDelete: (idx: number) => void;
  /** Khoá input khi KS đã có DNTT paid — chỉ chỉnh được qua "Điều chỉnh" modal. */
  disabled?: boolean;
}

export default memo(function KSRowInput({
  row, globalIdx, rowFocDeduction = 0,
  onFieldChange, onBlurSave, onDelete, disabled = false,
}: Props) {
  useTranslate();
  const [localLoaiPhong, setLocalLoaiPhong] = useState(row.loai_phong);
  const [localSoPhong, setLocalSoPhong] = useState(String(row.so_phong));
  const [localFocCount, setLocalFocCount] = useState(String(row.foc_count ?? 0));

  // Re-sync khi prop đổi do reconcile (DB/máy khác). KHÔNG đè khi input
  // đang được focus (user đang gõ) — tránh xoá chữ user vừa gõ khi máy
  // khác lưu cùng dòng. Sau khi blur xong → editingRef=false → lần render
  // tiếp theo sync bình thường.
  const externalKey = `${row.id ?? "new"}|${row.loai_phong}|${row.so_phong}|${row.foc_count ?? 0}`;
  const lastSyncedKeyRef = useRef(externalKey);
  const editingRef = useRef(false);
  useEffect(() => {
    if (editingRef.current) return;
    if (lastSyncedKeyRef.current !== externalKey) {
      lastSyncedKeyRef.current = externalKey;
      setLocalLoaiPhong(row.loai_phong);
      setLocalSoPhong(String(row.so_phong));
      setLocalFocCount(String(row.foc_count ?? 0));
    }
  }, [externalKey, row]);

  const handleLoaiPhongBlur = useCallback(() => {
    onFieldChange(globalIdx, "loai_phong", localLoaiPhong);
    setTimeout(() => onBlurSave(globalIdx), 0);
  }, [globalIdx, localLoaiPhong, onFieldChange, onBlurSave]);

  const handleSoPhongBlur = useCallback(() => {
    const val = Number(localSoPhong) || 0;
    onFieldChange(globalIdx, "so_phong", val);
    setTimeout(() => onBlurSave(globalIdx), 0);
  }, [globalIdx, localSoPhong, onFieldChange, onBlurSave]);

  const handleFocCountBlur = useCallback(() => {
    const val = Math.max(0, Number(localFocCount) || 0);
    onFieldChange(globalIdx, "foc_count", val);
    setTimeout(() => onBlurSave(globalIdx), 0);
  }, [globalIdx, localFocCount, onFieldChange, onBlurSave]);

  const soPhong = Number(localSoPhong) || 0;
  const thanhTienGross = soPhong * row.gia_phong * row.so_dem;
  // Hiển thị NET (đã trừ FOC theo foc_count manual) — khớp với subtotal card + lưu tien_cong_ty
  const thanhTien = Math.max(0, thanhTienGross - rowFocDeduction);

  return (
    <TableRow className="text-xs">
      <TableCell className="py-0.5 px-2">
        {disabled ? (
          <span className="text-xs font-medium" title={t("Đã thanh toán — dùng nút Điều chỉnh để track")}>
            {localLoaiPhong || "—"}
          </span>
        ) : (
          <Input
            value={localLoaiPhong}
            onChange={(e) => setLocalLoaiPhong(e.target.value)}
            onFocus={() => { editingRef.current = true; }}
            onBlur={() => { editingRef.current = false; handleLoaiPhongBlur(); }}
            className="h-6 text-xs"
            placeholder={t("Twin/Double...")}
          />
        )}
      </TableCell>
      <TableCell className="py-0.5 px-2">
        {disabled ? (
          <span className="text-xs text-center block tabular-nums" title={t("Đã thanh toán — dùng nút Điều chỉnh để track")}>
            {localSoPhong || 0}
          </span>
        ) : (
          <Input
            type="number"
            value={localSoPhong}
            onChange={(e) => setLocalSoPhong(e.target.value)}
            onFocus={() => { editingRef.current = true; }}
            onBlur={() => { editingRef.current = false; handleSoPhongBlur(); }}
            className="h-6 text-xs text-center w-[50px] [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
          />
        )}
      </TableCell>
      <TableCell className="py-0.5 px-2">
        {disabled ? (
          <span className="text-xs text-center block tabular-nums" title={t("Đã thanh toán — dùng nút Điều chỉnh để track")}>
            {Number(localFocCount) > 0 ? localFocCount : "—"}
          </span>
        ) : (
          <Input
            type="number"
            min={0}
            step="0.5"
            value={localFocCount}
            onChange={(e) => setLocalFocCount(e.target.value)}
            onFocus={() => { editingRef.current = true; }}
            onBlur={() => { editingRef.current = false; handleFocCountBlur(); }}
            placeholder="0"
            className="h-6 text-xs text-center w-[50px] [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
            title={t("Số phòng được miễn phí (FOC). Gợi ý 16免1 hiện ở header ngày.")}
          />
        )}
      </TableCell>
      <TableCell className="py-0.5 px-2 text-xs">
        {row.ci ? format(new Date(row.ci), "dd/MM/yyyy") : "—"}
      </TableCell>
      <TableCell className="py-0.5 px-2 text-xs">
        {row.co ? format(new Date(row.co), "dd/MM/yyyy") : "—"}
      </TableCell>
      <TableCell className="py-0.5 px-2 text-xs text-center">{row.so_dem}</TableCell>
      <TableCell className="py-0.5 px-2">
        {disabled ? (
          <span className="text-xs text-right block tabular-nums" title={t("Đã thanh toán — dùng nút Điều chỉnh để track")}>
            {fmt(row.gia_phong || 0)}
          </span>
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
      <TableCell className="py-0.5 px-2 text-xs font-medium">
        {fmt(thanhTien)}
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
