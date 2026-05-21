import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { fmt } from "./nh-section-shared";

interface Props {
  effectiveDelta: number;
  sumActual: number;
  sumPaid: number;
  groupCongNoTotal: number;
  onCommit: () => void;
}

// Dòng footer chốt chênh lệch sau điều chỉnh bữa ăn. Tách verbatim từ NHRow.
export default function NHAggFooterRow({
  effectiveDelta, sumActual, sumPaid, groupCongNoTotal, onCommit,
}: Props) {
  return (
    <tr className={cn(
      "border-b border-border/50",
      effectiveDelta > 0 ? "bg-orange-50/50" : "bg-purple-50/50",
    )}>
      <td colSpan={12} className="px-3 py-1.5">
        <div className="flex items-center justify-end gap-3 text-[11px]">
          <span className="text-muted-foreground">
            Sau điều chỉnh:
            <span className="ml-1">Thực tế <span className="font-medium text-foreground tabular-nums">{fmt(sumActual)}</span> ₫</span>
            <span className="mx-1">·</span>
            <span>Đã TT <span className="font-medium text-foreground tabular-nums">{fmt(sumPaid)}</span> ₫</span>
            {groupCongNoTotal > 0 && (
              <>
                <span className="mx-1">·</span>
                <span>Đã CN/HT <span className="font-medium text-foreground tabular-nums">{fmt(groupCongNoTotal)}</span> ₫</span>
              </>
            )}
            <span className="mx-1">·</span>
            <span>Còn lệch <span className={cn(
              "font-semibold tabular-nums",
              effectiveDelta > 0 ? "text-orange-700" : "text-purple-700",
            )}>
              {effectiveDelta > 0 ? "+" : "−"}{fmt(Math.abs(effectiveDelta))} ₫
            </span> ({effectiveDelta > 0 ? "thiếu" : "thừa"})</span>
          </span>
          <Button
            size="sm"
            className={cn(
              "h-7 text-[11px] px-2.5 text-white",
              effectiveDelta > 0
                ? "bg-orange-600 hover:bg-orange-700"
                : "bg-purple-600 hover:bg-purple-700",
            )}
            onClick={onCommit}
          >
            {effectiveDelta > 0
              ? `Thanh toán bổ sung ${fmt(effectiveDelta)} ₫`
              : `Xử lý chênh lệch thừa ${fmt(Math.abs(effectiveDelta))} ₫`}
          </Button>
        </div>
      </td>
    </tr>
  );
}
