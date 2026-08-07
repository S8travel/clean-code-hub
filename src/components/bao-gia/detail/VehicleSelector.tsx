import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useBangGiaDichVu } from "@/hooks/use-bang-gia-dich-vu";
import { ServiceTypeahead } from "./ServiceTypeahead";

interface Props {
  xeTen: string | null;
  xeGia: number | null;
  // Patch tên + giá cùng lúc (atomic) để tránh 2 saveField liên tiếp race nhau.
  onChange: (xeTen: string | null, xeGia: number | null) => void;
}

// Picker xe cho tour: dropdown đọc bang_gia_dich_vu (loai='xe') + free-text.
// Chọn entry catalog → fill cả tên + giá; user vẫn sửa được giá sau (đàm
// phán lại với NCC). Snapshot vào bao_gia.xe_ten/xe_gia → re-import bảng
// giá KHÔNG ảnh hưởng báo giá đã lưu.
export function VehicleSelector({ xeTen, xeGia, onChange }: Props) {
  const { data: bangGia = [] } = useBangGiaDichVu();
  const [tenLocal, setTenLocal] = useState(xeTen ?? "");
  const wrapRef = useRef<HTMLDivElement>(null);

  // Sync tên khi parent push giá trị mới (vd pick từ catalog). Chỉ bỏ qua khi
  // focus đang nằm TRONG chính instance này — kiểm tra "activeElement là INPUT
  // bất kỳ" sẽ làm instance khác cùng field (modal AI + trang cùng mount) giữ
  // tên stale rồi blur-save ghi đè tên mới.
  useEffect(() => {
    if (!wrapRef.current?.contains(document.activeElement)) setTenLocal(xeTen ?? "");
  }, [xeTen]);

  const commitText = () => {
    const next = tenLocal.trim();
    if (next === (xeTen ?? "")) return;
    onChange(next || null, xeGia);
  };
  const handlePick = (ten: string, gia: number) => {
    setTenLocal(ten);
    onChange(ten, gia);
  };
  const handleClear = () => {
    setTenLocal("");
    onChange(null, null);
  };

  return (
    <div ref={wrapRef} className="flex items-center gap-2">
      <div className="flex-1 min-w-0">
        <ServiceTypeahead
          value={tenLocal}
          onChangeText={setTenLocal}
          onPick={handlePick}
          onCommit={commitText}
          loai="transport"
          items={bangGia}
          placeholder="Tìm hoặc gõ tên xe..."
        />
      </div>
      <Input
        type="text"
        inputMode="numeric"
        value={(xeGia ?? 0) > 0 ? (xeGia ?? 0).toLocaleString("vi-VN") : ""}
        onChange={(e) => {
          const digits = e.target.value.replace(/[^0-9]/g, "");
          onChange(xeTen, digits ? parseInt(digits, 10) : null);
        }}
        placeholder="Giá xe"
        className="h-9 w-40 text-xs text-right shrink-0"
      />
      {(xeTen || (xeGia ?? 0) > 0) && (
        <Button
          variant="ghost"
          size="icon"
          className="h-9 w-9 shrink-0 text-slate-400 hover:text-destructive"
          title="Bỏ chọn xe"
          onClick={handleClear}
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      )}
    </div>
  );
}
