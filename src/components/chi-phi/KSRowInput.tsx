import React, { useState, useCallback, memo } from "react";
import { format } from "date-fns";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TableCell, TableRow } from "@/components/ui/table";
import type { LocalKSRow } from "./ChiPhiKSSection";

const fmt = (n: number) => n.toLocaleString("vi-VN");

interface Props {
  row: LocalKSRow;
  globalIdx: number;
  onFieldChange: (idx: number, field: string, value: any) => void;
  onBlurSave: (idx: number) => void;
  onDelete: (idx: number) => void;
}

export default memo(function KSRowInput({
  row, globalIdx,
  onFieldChange, onBlurSave, onDelete,
}: Props) {
  const [localLoaiPhong, setLocalLoaiPhong] = useState(row.loai_phong);
  const [localSoPhong, setLocalSoPhong] = useState(String(row.so_phong));
  const [localGiaPhong, setLocalGiaPhong] = useState(String(row.gia_phong || ""));

  const handleLoaiPhongBlur = useCallback(() => {
    onFieldChange(globalIdx, "loai_phong", localLoaiPhong);
    setTimeout(() => onBlurSave(globalIdx), 0);
  }, [globalIdx, localLoaiPhong, onFieldChange, onBlurSave]);

  const handleSoPhongBlur = useCallback(() => {
    const val = Number(localSoPhong) || 0;
    onFieldChange(globalIdx, "so_phong", val);
    setTimeout(() => onBlurSave(globalIdx), 0);
  }, [globalIdx, localSoPhong, onFieldChange, onBlurSave]);

  const handleGiaPhongBlur = useCallback(() => {
    const val = Number(localGiaPhong) || 0;
    onFieldChange(globalIdx, "gia_phong", val);
    setTimeout(() => onBlurSave(globalIdx), 0);
  }, [globalIdx, localGiaPhong, onFieldChange, onBlurSave]);

  const soPhong = Number(localSoPhong) || 0;
  const giaPhong = Number(localGiaPhong) || 0;
  const thanhTien = soPhong * giaPhong * row.so_dem;

  return (
    <TableRow className="text-xs">
      <TableCell className="py-1.5 px-2">
        <Input
          value={localLoaiPhong}
          onChange={(e) => setLocalLoaiPhong(e.target.value)}
          onBlur={handleLoaiPhongBlur}
          className="h-7 text-xs"
          placeholder="Twin/Double..."
        />
      </TableCell>
      <TableCell className="py-1.5 px-2">
        <Input
          type="number"
          value={localSoPhong}
          onChange={(e) => setLocalSoPhong(e.target.value)}
          onBlur={handleSoPhongBlur}
          className="h-7 text-xs text-center w-[50px] [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
        />
      </TableCell>
      <TableCell className="py-1.5 px-2 text-xs">
        {row.ci ? format(new Date(row.ci), "dd/MM/yyyy") : "—"}
      </TableCell>
      <TableCell className="py-1.5 px-2 text-xs">
        {row.co ? format(new Date(row.co), "dd/MM/yyyy") : "—"}
      </TableCell>
      <TableCell className="py-1.5 px-2 text-xs text-center">{row.so_dem}</TableCell>
      <TableCell className="py-1.5 px-2">
        <Input
          type="number"
          value={localGiaPhong}
          onChange={(e) => setLocalGiaPhong(e.target.value)}
          onBlur={handleGiaPhongBlur}
          placeholder="0"
          className="h-7 text-xs w-[90px] [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
        />
      </TableCell>
      <TableCell className="py-1.5 px-2 text-xs font-medium">
        {fmt(thanhTien)}
      </TableCell>
      <TableCell className="py-1.5 px-2">
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6"
          onClick={() => onDelete(globalIdx)}
        >
          <Trash2 className="h-3 w-3 text-destructive" />
        </Button>
      </TableCell>
    </TableRow>
  );
});
