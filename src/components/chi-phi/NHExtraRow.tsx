import { Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { applyChietKhau } from "@/lib/chi-phi-calc";
import { NHInput } from "./NHInput";
import { fmt, type LocalNHExtra } from "./nh-section-shared";
import { t, useTranslate } from "@/lib/i18n";

interface Props {
  mealKey: string;
  extra: LocalNHExtra;
  idx: number;
  onChange: (key: string, idx: number, field: keyof LocalNHExtra, value: string | number) => void;
  onSave: (key: string, idx: number, nguoiTtOverride?: "cong_ty" | "hdv") => void;
  onDelete: (key: string, idx: number) => void;
}

// 1 dòng dịch vụ phát sinh của bữa ăn. Tách verbatim từ NHRow.
export default function NHExtraRow({ mealKey, extra, idx, onChange, onSave, onDelete }: Props) {
  useTranslate();
  return (
    <tr className="border-b border-border/50 last:border-b-0 bg-muted/20">
      {/* Col 1: empty */}
      <td />
      {/* Col 2: empty */}
      <td />
      {/* Col 3: description */}
      <td className="px-3 py-1">
        <div className="flex items-center gap-1.5 pl-4">
          <span className="text-muted-foreground text-[10px] shrink-0">↳</span>
          <Input
            placeholder={t("Dịch vụ phát sinh")}
            value={extra.mo_ta}
            onChange={(e) => onChange(mealKey, idx, "mo_ta", e.target.value)}
            onBlur={() => onSave(mealKey, idx)}
            className="h-6 text-xs flex-1"
          />
        </div>
      </td>
      {/* Col 4: số lượng — căn trái, khớp dòng chính */}
      <td className="px-3 py-1">
        <div className="flex items-center gap-1">
          <NHInput
            value={extra.so_luong}
            onChange={(v) => onChange(mealKey, idx, "so_luong", v)}
            onBlur={() => onSave(mealKey, idx)}
            width="w-[56px]"
          />
        </div>
      </td>
      {/* Col 6: đơn giá — căn trái, khớp dòng chính */}
      <td className="px-3 py-1">
        <div className="flex items-center gap-1">
          <NHInput
            value={extra.don_gia}
            onChange={(v) => onChange(mealKey, idx, "don_gia", v)}
            onBlur={() => onSave(mealKey, idx)}
            width="w-[112px]"
            money
            decimal
          />
        </div>
      </td>
      {/* Col 7: CK% riêng từng extra (suất trẻ em = CK; HDV phát sinh để 0) */}
      <td className="px-2 py-1">
        <div className="relative flex justify-center">
          <NHInput
            value={extra.chiet_khau_phan_tram}
            onChange={(v) => onChange(mealKey, idx, "chiet_khau_phan_tram", v)}
            onBlur={() => onSave(mealKey, idx)}
            width="w-[48px]"
          />
          {(() => {
            const truocCK = extra.so_luong * extra.don_gia;
            const sauCK = applyChietKhau(truocCK, extra.chiet_khau_phan_tram);
            const ckSoTien = truocCK - sauCK;
            return ckSoTien > 0 ? (
              <span className="absolute left-1/2 -translate-x-1/2 top-full -mt-1 text-[10px] text-muted-foreground tabular-nums whitespace-nowrap pointer-events-none">
                −{fmt(ckSoTien)}
              </span>
            ) : null;
          })()}
        </div>
      </td>
      {/* Col 8: thành tiền (đã trừ CK) */}
      <td className="px-3 py-1 text-right whitespace-nowrap">
        {extra.so_luong > 0 && extra.don_gia > 0 ? (
          <span className={cn("text-[11px] font-semibold", extra.nguoi_tt === "hdv" ? "text-amber-600" : "text-primary")}>
            {fmt(applyChietKhau(extra.so_luong * extra.don_gia, extra.chiet_khau_phan_tram))}
          </span>
        ) : ""}
      </td>
      {/* Col 9: Ai trả — toggle giống main row */}
      <td className="px-2 py-1 text-center">
        <button
          onClick={() => {
            const next = extra.nguoi_tt === "hdv" ? "cong_ty" : "hdv";
            onChange(mealKey, idx, "nguoi_tt", next);
            onSave(mealKey, idx, next);
          }}
          className={cn(
            "px-1.5 py-0.5 rounded text-[10px] font-medium cursor-pointer transition-colors border",
            extra.nguoi_tt === "cong_ty"
              ? "bg-blue-50 text-blue-600 hover:bg-blue-100 border-blue-200"
              : "bg-amber-50 text-amber-600 hover:bg-amber-100 border-amber-200"
          )}
        >
          {extra.nguoi_tt === "cong_ty" ? t("Công ty") : t("HDV")}
        </button>
      </td>
      {/* Col 10: empty */}
      <td />
      {/* Col 11: delete */}
      <td className="px-2 py-1">
        <div className="flex justify-end">
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => onDelete(mealKey, idx)}>
            <Trash2 className="h-3 w-3 text-destructive" />
          </Button>
        </div>
      </td>
    </tr>
  );
}
