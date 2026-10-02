import { AlertTriangle, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ChuThichLuat } from "@/lib/bao-gia-chu-thich-luat";

/** Chú thích LUẬT hiện ngay dưới tên dịch vụ — chữ đọc được luôn, không giấu
 *  trong tooltip. Dùng chung cho màn AI đọc lịch trình và bảng chi phí báo giá. */
export function ChuThichLuatList({
  items, className,
}: {
  items: readonly ChuThichLuat[] | undefined;
  className?: string;
}) {
  if (!items?.length) return null;
  return (
    <ul className={cn("mt-0.5 space-y-0.5", className)}>
      {items.map((c, i) => (
        <li
          key={i}
          className={cn(
            "flex items-start gap-1 text-[11px] leading-snug",
            c.muc === "canh_bao" ? "text-amber-700" : "text-slate-500",
          )}
        >
          {c.muc === "canh_bao"
            ? <AlertTriangle className="mt-[2px] h-3 w-3 shrink-0" />
            : <Info className="mt-[2px] h-3 w-3 shrink-0" />}
          <span className="break-words">{c.noi_dung}</span>
        </li>
      ))}
    </ul>
  );
}
