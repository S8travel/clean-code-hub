import { PenLine } from "lucide-react";
import { t } from "@/lib/i18n";

// Ô chữ của một dòng ghi chú tự do trong cột Chương trình (chuyến bay, sự kiện...) —
// xem lib/dong-ghi-chu.ts. Trông như một dòng chữ thường, bấm vào là sửa tại chỗ.
// Enter = xong (rời ô), Shift+Enter = xuống dòng.
export function DongGhiChuInput({
  value,
  onChange,
  onXong,
}: {
  value: string;
  onChange: (v: string) => void;
  /** Rời ô (bấm ra ngoài / Enter). Parent bỏ dòng nếu chữ còn rỗng. */
  onXong: () => void;
}) {
  const tuGian = (el: HTMLTextAreaElement | null) => {
    if (!el) return;
    el.style.height = "auto";
    el.style.height = el.scrollHeight + "px";
  };
  return (
    <div className="flex-1 min-w-0 flex items-start gap-1" title={t("Dòng ghi chú — không tính chi phí")}>
      <PenLine className="h-3 w-3 mt-1.5 shrink-0 text-amber-600 print-hide" />
      <textarea
        className="print-hide w-full min-w-0 text-[13px] leading-snug text-slate-700 px-1.5 py-0.5 rounded border border-transparent bg-transparent resize-none overflow-hidden hover:border-border focus:border-ring focus:bg-background focus:outline-none"
        rows={1}
        value={value}
        placeholder={t("Dòng ghi chú...")}
        ref={tuGian}
        onChange={(e) => {
          tuGian(e.currentTarget);
          onChange(e.target.value);
        }}
        onKeyDown={(e) => {
          // isComposing: bộ gõ đang ghép dấu thì Enter thuộc về bộ gõ, đừng chốt ô.
          if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault();
            e.currentTarget.blur();
          }
        }}
        onBlur={onXong}
      />
      {/* Bản in: textarea in ra bị cắt còn 1 dòng → in chữ thường thay vào. */}
      <p className="hidden print:block whitespace-pre-wrap text-[13px]">{value}</p>
    </div>
  );
}
