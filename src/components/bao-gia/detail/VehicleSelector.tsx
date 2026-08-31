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
  // Chỉ gọi khi COMMIT (blur / Enter / pick catalog / xoá) — KHÔNG gọi mỗi keystroke.
  onChange: (xeTen: string | null, xeGia: number | null) => void;
  // Mỗi keystroke ô giá: cập nhật draft cho bảng tính hiện số live, KHÔNG ghi DB.
  onDraftGia?: (xeGia: number | null) => void;
}

// Picker xe cho tour: dropdown đọc bang_gia_dich_vu (loai='xe') + free-text.
// Chọn entry catalog → fill cả tên + giá; user vẫn sửa được giá sau (đàm
// phán lại với NCC). Snapshot vào bao_gia.xe_ten/xe_gia → re-import bảng
// giá KHÔNG ảnh hưởng báo giá đã lưu.
export function VehicleSelector({ xeTen, xeGia, onChange, onDraftGia }: Props) {
  const { data: bangGia = [] } = useBangGiaDichVu();
  const [tenLocal, setTenLocal] = useState(xeTen ?? "");
  const [giaLocal, setGiaLocal] = useState<number | null>(xeGia ?? null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const giaRef = useRef<HTMLInputElement>(null);

  // Sync tên khi parent push giá trị mới (vd pick từ catalog). Chỉ bỏ qua khi
  // focus đang nằm TRONG chính instance này — kiểm tra "activeElement là INPUT
  // bất kỳ" sẽ làm instance khác cùng field (modal AI + trang cùng mount) giữ
  // tên stale rồi blur-save ghi đè tên mới.
  useEffect(() => {
    if (!wrapRef.current?.contains(document.activeElement)) setTenLocal(xeTen ?? "");
  }, [xeTen]);

  // Giá gõ tay giữ ở local state: ô này TỪNG save DB mỗi keystroke → mỗi phím
  // là 1 UPDATE + invalidate ["bao_gia"] → refetch ghi đè draft → gõ nhanh bị
  // lag và rụng số. Nay chỉ commit khi blur/Enter. Vẫn sync khi parent đổi giá
  // (pick catalog), trừ lúc chính ô này đang được gõ.
  useEffect(() => {
    if (document.activeElement !== giaRef.current) setGiaLocal(xeGia ?? null);
  }, [xeGia]);

  const commitText = () => {
    const next = tenLocal.trim();
    if (next === (xeTen ?? "")) return;
    onChange(next || null, xeGia);
  };
  // KHÔNG so sánh với prop xeGia: onDraftGia đã đẩy số đang gõ lên draft nên
  // prop trùng giá trị local → so sánh ở đây sẽ nuốt luôn lần lưu. Caller tự
  // đối chiếu với row (state DB) trước khi mutate.
  const commitGia = () => {
    onChange(xeTen, giaLocal != null && giaLocal > 0 ? giaLocal : null);
  };
  const handlePick = (ten: string, gia: number) => {
    setTenLocal(ten);
    setGiaLocal(gia > 0 ? gia : null);
    onChange(ten, gia > 0 ? gia : null);
  };
  const handleClear = () => {
    setTenLocal("");
    setGiaLocal(null);
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
        ref={giaRef}
        type="text"
        inputMode="numeric"
        value={(giaLocal ?? 0) > 0 ? (giaLocal ?? 0).toLocaleString("vi-VN") : ""}
        onChange={(e) => {
          const digits = e.target.value.replace(/[^0-9]/g, "");
          const next = digits ? parseInt(digits, 10) : null;
          setGiaLocal(next);
          onDraftGia?.(next);
        }}
        onBlur={commitGia}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
        }}
        placeholder="Giá xe"
        className="h-9 w-40 text-xs text-right shrink-0"
      />
      {(xeTen || (giaLocal ?? 0) > 0) && (
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
