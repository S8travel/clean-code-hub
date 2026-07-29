import { useState } from "react";
import { ChevronDown, ChevronRight, Copy, Check } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type { SopMuc } from "@/lib/sop-data";
import { t } from "@/lib/i18n";

interface Props {
  muc: SopMuc;
  /** Mở sẵn (dùng khi đang tìm kiếm — người dùng muốn thấy ngay chỗ khớp). */
  moSan?: boolean;
}

/**
 * Một mục trong Sổ tay: quy trình / tình huống / checklist.
 *
 * Checklist tick vào KHÔNG lưu (tải lại trang là trắng) — đúng như bản HTML gốc.
 * Muốn lưu theo từng đoàn thì cần bảng DB riêng, để dành cho bước sau.
 */
export default function SopMucCard({ muc, moSan = false }: Props) {
  const [mo, setMo] = useState(moSan);
  const [daTick, setDaTick] = useState<Set<number>>(new Set());
  const [daChep, setDaChep] = useState(false);

  const toggleTick = (i: number) =>
    setDaTick((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });

  const chepMauCau = async () => {
    if (!muc.mauCau) return;
    try {
      await navigator.clipboard.writeText(muc.mauCau);
      setDaChep(true);
      setTimeout(() => setDaChep(false), 1800);
    } catch {
      toast.error(t("Không sao chép được — bôi đen rồi copy tay giúp mình"));
    }
  };

  const soTick = daTick.size;
  const tongTick = muc.items?.length ?? 0;

  return (
    <div className="border border-border rounded-lg overflow-hidden bg-background">
      <button
        type="button"
        onClick={() => setMo((v) => !v)}
        className={cn(
          "w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors",
          mo ? "bg-[#E6F1FB]" : "hover:bg-muted/40",
        )}
      >
        <span className="text-lg leading-none shrink-0" aria-hidden>{muc.icon}</span>
        <span className="flex-1 min-w-0">
          <span className="block text-sm font-semibold break-words">{muc.title}</span>
          <span className="block text-xs text-muted-foreground break-words">{muc.sub}</span>
        </span>
        {tongTick > 0 && (
          <span className={cn(
            "text-[11px] font-semibold px-1.5 py-0.5 rounded shrink-0",
            soTick === tongTick ? "bg-emerald-100 text-emerald-700" : "bg-muted text-muted-foreground",
          )}>
            {soTick}/{tongTick}
          </span>
        )}
        {mo
          ? <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
          : <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />}
      </button>

      {mo && (
        <div className="px-3 py-3 space-y-3 border-t border-border">
          {/* ── Quy trình ─────────────────────────────────────────── */}
          {muc.uuTien && muc.uuTien.length > 0 && (
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wide text-amber-700 mb-1.5">
                {t("Thứ tự ưu tiên")}
              </p>
              <ol className="space-y-1">
                {muc.uuTien.map((u, i) => (
                  <li key={i} className="flex gap-2 items-start text-sm">
                    <span className="shrink-0 w-5 h-5 rounded bg-[#1B3A6B] text-white text-[11px] font-bold grid place-items-center">
                      {i + 1}
                    </span>
                    <span className="break-words">{u}</span>
                  </li>
                ))}
              </ol>
            </div>
          )}

          {muc.buoc && muc.buoc.length > 0 && (
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wide text-[#1B3A6B] mb-1.5">
                {t("Các bước thực hiện")}
              </p>
              <ol className="divide-y divide-dashed divide-border">
                {muc.buoc.map((b, i) => (
                  <li key={i} className="flex gap-2.5 items-start py-2">
                    <span className="shrink-0 w-6 h-6 rounded-md bg-[#1B3A6B] text-white text-xs font-bold grid place-items-center">
                      {i + 1}
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm font-medium break-words">{b.title}</span>
                      {b.note && (
                        <span className="block text-xs text-muted-foreground break-words">{b.note}</span>
                      )}
                    </span>
                  </li>
                ))}
              </ol>
            </div>
          )}

          {/* ── Tình huống ────────────────────────────────────────── */}
          {muc.tinhHuong && (
            <div className="rounded-md border-l-4 border-amber-600 bg-amber-50 px-3 py-2">
              <p className="text-[11px] font-bold uppercase tracking-wide text-amber-800 mb-1">
                {t("Tình huống")}
              </p>
              <p className="text-sm text-amber-900 break-words">{muc.tinhHuong}</p>
            </div>
          )}

          {muc.cachXuLy && muc.cachXuLy.length > 0 && (
            <div className="rounded-md border-l-4 border-green-700 bg-green-50 px-3 py-2">
              <p className="text-[11px] font-bold uppercase tracking-wide text-green-900 mb-1.5">
                {t("Phương án xử lý")}
              </p>
              <ol className="space-y-1.5">
                {muc.cachXuLy.map((c, i) => (
                  <li key={i} className="flex gap-2 items-start">
                    <span className="shrink-0 w-5 h-5 rounded-full bg-green-800 text-white text-[11px] font-bold grid place-items-center mt-0.5">
                      {i + 1}
                    </span>
                    <span className="text-sm text-green-900 break-words">{c}</span>
                  </li>
                ))}
              </ol>
            </div>
          )}

          {muc.mauCau && (
            <div className="rounded-md border-l-4 border-blue-700 bg-blue-50 px-3 py-2">
              <div className="flex items-start justify-between gap-2 mb-1">
                <p className="text-[11px] font-bold uppercase tracking-wide text-blue-900">
                  {t("Mẫu câu trả lời")}
                </p>
                <button
                  type="button"
                  onClick={chepMauCau}
                  className="shrink-0 inline-flex items-center gap-1 text-[11px] font-medium text-blue-800 hover:text-blue-950"
                >
                  {daChep
                    ? <><Check className="h-3 w-3" />{t("Đã chép")}</>
                    : <><Copy className="h-3 w-3" />{t("Chép")}</>}
                </button>
              </div>
              <p className="text-sm text-blue-900 italic break-words">“{muc.mauCau}”</p>
            </div>
          )}

          {/* ── Checklist ─────────────────────────────────────────── */}
          {muc.items && muc.items.length > 0 && (
            <ul className="divide-y divide-border">
              {muc.items.map((it, i) => {
                const tick = daTick.has(i);
                return (
                  <li key={i}>
                    <button
                      type="button"
                      onClick={() => toggleTick(i)}
                      className="w-full flex items-start gap-2.5 py-2 text-left"
                    >
                      <span className={cn(
                        "shrink-0 w-5 h-5 rounded border-2 grid place-items-center mt-0.5 transition-colors",
                        tick ? "bg-[#1B3A6B] border-[#1B3A6B]" : "border-muted-foreground/40",
                      )}>
                        {tick && <Check className="h-3 w-3 text-white" />}
                      </span>
                      <span className={cn(
                        "text-sm break-words",
                        tick && "line-through text-muted-foreground",
                      )}>
                        {it}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
