import { useState } from "react";
import { Plus } from "lucide-react";
import type { BaoGiaItem } from "@/hooks/use-bao-gia";
import { clampNgay } from "@/components/bao-gia/detail/helpers";

// Form "＋ Thêm dòng" đặt cuối mỗi nhóm — dùng CHUNG cho bảng chi phí và màn
// review "AI điền từ lịch trình". Chỉ hỏi 2 thứ KHÔNG sửa được inline sau đó:
// NGÀY và BỮA (dòng ăn). Tên / đơn giá / N / FOC đều gõ thẳng trên dòng vừa
// thêm nên không hỏi ở đây — hỏi thêm chỉ làm form dài mà không thêm khả năng.

interface Props {
  loai: BaoGiaItem["loai"];
  /** Số ngày của tour — chặn nhập ngày ngoài chương trình. */
  soNgay: number;
  onAdd: (ngay_so: number, bua_an?: "trua" | "toi") => void;
  disabled?: boolean;
}

const NHAN: Record<BaoGiaItem["loai"], string> = {
  hotel: "khách sạn",
  meal: "bữa ăn",
  ticket: "vé / dịch vụ",
  transport: "xe",
};

export function AddServiceRow({ loai, soNgay, onAdd, disabled }: Props) {
  const [ngay, setNgay] = useState("1");
  const [bua, setBua] = useState<"trua" | "toi">("trua");

  const submit = () => {
    if (disabled) return;
    onAdd(clampNgay(parseInt(ngay, 10), soNgay), loai === "meal" ? bua : undefined);
  };

  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] text-slate-500">
      <span>Ngày</span>
      <input
        type="number" min={1} max={Math.max(1, soNgay)}
        value={ngay}
        onChange={(e) => setNgay(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
        disabled={disabled}
        className="h-6 w-12 rounded border border-slate-200 px-1 text-center text-xs [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none disabled:opacity-50"
      />
      {loai === "meal" && (
        <select
          value={bua}
          onChange={(e) => setBua(e.target.value === "toi" ? "toi" : "trua")}
          disabled={disabled}
          className="h-6 rounded border border-slate-200 bg-white px-1 text-xs outline-none focus:border-blue-300 disabled:opacity-50"
        >
          <option value="trua">Trưa</option>
          <option value="toi">Tối</option>
        </select>
      )}
      <button
        type="button"
        onClick={submit}
        disabled={disabled}
        title={`Thêm 1 dòng ${NHAN[loai]} trống — điền tên và giá ngay trên dòng vừa thêm`}
        className="inline-flex items-center gap-1 rounded border border-dashed border-slate-300 px-2 py-0.5 text-[11px] text-slate-600 hover:border-blue-400 hover:text-blue-700 disabled:opacity-40"
      >
        <Plus className="h-3 w-3" /> Thêm dòng {NHAN[loai]}
      </button>
    </span>
  );
}
