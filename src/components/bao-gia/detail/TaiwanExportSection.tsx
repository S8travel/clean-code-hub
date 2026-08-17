import { Plus, X, RotateCcw, FileDown } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import type { BaoGiaExportBracket, BaoGiaKetQua, BaoGiaRow } from "@/hooks/use-bao-gia";
import { liveKetQua } from "./helpers";
import { taiwanExportDefaults } from "@/lib/bao-gia-taiwan-content";

interface Props {
  draft: BaoGiaRow;
  updateDraftKetQua: (next: BaoGiaKetQua) => void;
  saveKetQua: (next: BaoGiaKetQua) => void;
}

// Cấu hình nội dung file xuất báo giá (kiểu Đài Loan) — SỬA + LƯU theo báo giá.
// Field trống → export dùng mặc định tính live. Cảnh điểm mất phí tự nối vào 報價包含.
export function TaiwanExportSection({ draft, updateDraftKetQua, saveKetQua }: Props) {
  const ket = draft.ket_qua;
  if (!ket) return null;
  const xr = draft.exchange_rate ?? 26000;
  const fresh = liveKetQua(draft) ?? ket;
  const def = taiwanExportDefaults(fresh, fresh.items, xr);
  const cfg = ket.export_config ?? {};

  // Giá trị hiển thị = config đã lưu (nếu có) HOẶC mặc định live.
  const brackets: BaoGiaExportBracket[] = cfg.brackets && cfg.brackets.length ? cfg.brackets : def.brackets;
  const single = cfg.single_supplement_usd ?? def.single_supplement_usd;
  const above = cfg.above_notes ?? def.above_notes;
  const included = cfg.included ?? def.included;
  const excluded = cfg.excluded ?? def.excluded;
  const notes = cfg.notes ?? def.notes;

  const cfgNow = () => draft.ket_qua?.export_config ?? {};
  const live = (patch: Partial<typeof cfg>) => updateDraftKetQua({ ...ket, export_config: { ...cfgNow(), ...patch } });
  const persist = () => { if (draft.ket_qua) saveKetQua(draft.ket_qua); };
  const commit = (patch: Partial<typeof cfg>) => saveKetQua({ ...ket, export_config: { ...cfgNow(), ...patch } });

  const setBracket = (i: number, p: Partial<BaoGiaExportBracket>, commitNow = false) => {
    const next = brackets.map((b, j) => (j === i ? { ...b, ...p } : b));
    commitNow ? commit({ brackets: next }) : live({ brackets: next });
  };

  return (
    <section className="bg-white border border-slate-200 rounded-lg p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xs uppercase tracking-wider font-semibold text-slate-500 inline-flex items-center gap-1.5">
          <FileDown className="h-3.5 w-3.5" /> Nội dung file xuất (báo giá Đài Loan)
        </h2>
        <Button size="sm" variant="ghost" className="h-7 text-xs gap-1 text-slate-500"
          onClick={() => saveKetQua({ ...ket, export_config: null })}
          title="Xoá tùy chỉnh, dùng lại mặc định tính tự động">
          <RotateCcw className="h-3 w-3" /> Khôi phục mặc định
        </Button>
      </div>

      {/* Khoảng giá */}
      <div className="space-y-1.5">
        <p className="text-[11px] font-medium text-slate-600">Khoảng giá (cột trong bảng) — giá bán/khách USD:</p>
        <div className="space-y-1">
          {brackets.map((b, i) => (
            <div key={i} className="flex items-center gap-1.5">
              <Input
                value={b.label}
                onChange={(e) => setBracket(i, { label: e.target.value })}
                onBlur={persist}
                placeholder="Nhãn (vd 10-14 pax)"
                className="h-7 text-xs flex-1"
              />
              <span className="text-xs text-slate-400">$</span>
              <Input
                type="number"
                value={b.price_usd}
                onChange={(e) => setBracket(i, { price_usd: parseInt(e.target.value, 10) || 0 })}
                onBlur={persist}
                className="h-7 text-xs w-24 text-right [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
              />
              <button type="button" onClick={() => commit({ brackets: brackets.filter((_, j) => j !== i) })}
                disabled={brackets.length <= 1}
                className="text-slate-400 hover:text-red-500 disabled:opacity-30" title="Xoá khoảng">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
        <Button size="sm" variant="outline" className="h-7 text-xs gap-1"
          onClick={() => commit({ brackets: [...brackets, { label: "", price_usd: 0 }] })}>
          <Plus className="h-3 w-3" /> Thêm khoảng giá
        </Button>
      </div>

      {/* 單房差 */}
      <div className="flex items-center gap-2">
        <span className="text-[11px] font-medium text-slate-600">單房差 (phụ thu phòng đơn, USD):</span>
        <Input
          type="number"
          value={single}
          onChange={(e) => live({ single_supplement_usd: parseInt(e.target.value, 10) || 0 })}
          onBlur={persist}
          className="h-7 text-xs w-28 text-right [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
        />
      </div>

      {/* Các ô text */}
      <TextArea label="以上價格不含 (mỗi dòng 1 mục)" value={above} onChange={(v) => live({ above_notes: v })} onBlur={persist} rows={3} />
      <TextArea
        label="報價包含 (mỗi dòng 1 mục — cảnh điểm mất phí tự nối thêm khi xuất)"
        value={included} onChange={(v) => live({ included: v })} onBlur={persist} rows={5}
      />
      <TextArea label="報價不含 (mỗi dòng 1 mục)" value={excluded} onChange={(v) => live({ excluded: v })} onBlur={persist} rows={2} />
      <TextArea label="備註 (ghi chú, để trống nếu không có)" value={notes} onChange={(v) => live({ notes: v })} onBlur={persist} rows={2} />

      <p className="text-[11px] text-slate-500">
        Sửa xong bấm nút <b>xuất</b> ở đầu trang → file Word (.docx) lấy đúng nội dung này. Mã báo giá được nhúng ẩn (chữ trắng nền trắng) để tra lại.
      </p>
    </section>
  );
}

function TextArea({ label, value, onChange, onBlur, rows }: {
  label: string; value: string; onChange: (v: string) => void; onBlur: () => void; rows: number;
}) {
  return (
    <div className="space-y-1">
      <p className="text-[11px] font-medium text-slate-600">{label}</p>
      <Textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
        rows={rows}
        className="text-xs"
      />
    </div>
  );
}
