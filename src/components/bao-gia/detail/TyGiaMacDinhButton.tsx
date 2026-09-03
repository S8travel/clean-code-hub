import { useState } from "react";
import { RotateCcw, Pencil, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useTyGiaMacDinh, useLuuCaiDat } from "@/hooks/use-cai-dat";
import { useAuth } from "@/hooks/use-auth";
import {
  KHOA_TY_GIA_MAC_DINH, tyGiaHopLe, TY_GIA_MIN, TY_GIA_MAX,
} from "@/lib/bao-gia-ty-gia";

interface Props {
  /** Điền mức mặc định vào ô Tỷ giá của báo giá đang mở. */
  onApply: (rate: number) => void;
}

/** Nút "Mặc định 25.500" cạnh ô Tỷ giá:
 *  - bấm nút    → điền mức mặc định vào báo giá đang mở
 *  - bấm ✎      → sửa MỨC MẶC ĐỊNH (dùng chung cả team, chỉ ảnh hưởng báo giá
 *                 TẠO MỚI sau đó; báo giá đã lưu giữ nguyên tỷ giá của nó)
 *  Khi chưa đọc được mức chung thì KHÔNG hiện số: hằng số trong code trông y hệt
 *  một mức thật, bấm nhầm là đóng sai tỷ giá vào báo giá / ghi đè mức của cả nhóm. */
export function TyGiaMacDinhButton({ onApply }: Props) {
  const { tyGia, isPending, isError, refetch } = useTyGiaMacDinh();
  const luuCaiDat = useLuuCaiDat();
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [nhap, setNhap] = useState("");

  const sanSang = !isPending && !isError;

  const toggle = (o: boolean) => {
    setOpen(o);
    if (o) setNhap(String(tyGia));
  };

  const handleLuu = () => {
    // Chỉ lấy chữ số: người nhập hay gõ "25.500" / "25,500" theo kiểu tiền Việt.
    const v = Number(nhap.replace(/\D/g, ""));
    if (!tyGiaHopLe(v)) {
      toast.error(
        `Tỷ giá phải là số trong khoảng ${TY_GIA_MIN.toLocaleString("vi-VN")}–${TY_GIA_MAX.toLocaleString("vi-VN")}`,
      );
      return;
    }
    luuCaiDat.mutate(
      { khoa: KHOA_TY_GIA_MAC_DINH, gia_tri: String(v) },
      {
        onSuccess: () => {
          setOpen(false);
          toast.success(
            `Đã đặt mặc định ${v.toLocaleString("vi-VN")} VND/USD — áp dụng cho báo giá tạo mới. ` +
            "Muốn dùng cho báo giá này thì bấm nút Mặc định.",
            { duration: 6000 },
          );
        },
        onError: (err: unknown) =>
          toast.error(
            "Không lưu được mức mặc định: " +
            (err instanceof Error ? err.message : "lỗi không rõ"),
          ),
      },
    );
  };

  // Tài khoản chỉ xem: mọi đường ghi đều bị chặn ở DB, ẩn hẳn cho khỏi bấm hụt.
  if (user?.chi_xem) return null;

  return (
    <span className="inline-flex items-center gap-0.5">
      <button
        type="button"
        // Giữ focus cho ô Tỷ giá: nếu để input blur, onBlur của nó ghi số vừa gõ
        // xuống DB TRƯỚC click này → hai lệnh ghi đua nhau, số cuối cùng hên xui.
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => (isError ? refetch() : onApply(tyGia))}
        disabled={isPending}
        title={
          isError ? "Chưa lấy được mức mặc định — bấm để thử lại"
            : isPending ? "Đang lấy mức mặc định…"
              : "Điền tỷ giá mặc định vào ô Tỷ giá"
        }
        className="inline-flex items-center gap-1 h-6 px-1.5 rounded text-[10px] text-slate-500 hover:text-blue-600 hover:bg-blue-50 disabled:opacity-50 disabled:hover:bg-transparent tabular-nums"
      >
        <RotateCcw className="h-3 w-3" />
        Mặc định {sanSang ? tyGia.toLocaleString("vi-VN") : isError ? "— thử lại" : "…"}
      </button>
      {sanSang && (
        <Popover open={open} onOpenChange={toggle}>
          <PopoverTrigger asChild>
            <button
              type="button"
              title="Sửa mức mặc định (dùng chung, áp dụng cho báo giá tạo mới)"
              className="h-6 w-6 inline-flex items-center justify-center rounded text-slate-400 hover:text-blue-600 hover:bg-blue-50"
            >
              <Pencil className="h-3 w-3" />
            </button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-72 p-3">
            <p className="text-xs font-medium text-slate-700">Mức tỷ giá mặc định</p>
            <p className="text-[11px] text-slate-500 mt-0.5 leading-snug">
              Dùng chung cả nhóm. Chỉ điền sẵn cho báo giá <b>tạo mới</b> — báo giá
              đã lưu giữ nguyên tỷ giá của nó.
            </p>
            <div className="flex items-center gap-2 mt-2">
              <Input
                type="text"
                inputMode="numeric"
                value={nhap}
                autoFocus
                onChange={(e) => setNhap(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") handleLuu(); }}
                className="h-8 text-sm tabular-nums"
              />
              <Button
                type="button"
                size="sm"
                onClick={handleLuu}
                disabled={luuCaiDat.isPending}
                className="h-8 text-xs shrink-0"
              >
                {luuCaiDat.isPending
                  ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  : "Lưu"}
              </Button>
            </div>
          </PopoverContent>
        </Popover>
      )}
    </span>
  );
}
