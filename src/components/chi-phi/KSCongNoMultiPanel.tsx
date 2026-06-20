import { useEffect, useMemo, useRef } from "react";
import { useCongNoByNCC } from "@/hooks/use-cong-no";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { AlertCircle } from "lucide-react";
import type { CanTruSelection } from "./KSCongNoPanel";
import { t, useTranslate } from "@/lib/i18n";

const fmt = (n: number) => Math.round(n).toLocaleString("vi-VN");

function extractDoanFromGhiChu(ghi_chu: string | null | undefined): string | null {
  if (!ghi_chu) return null;
  const m = ghi_chu.match(/Đoàn[:：]\s*(.+)/i);
  return m ? m[1].trim() : null;
}

interface Props {
  nccId: number | null | undefined;
  value: CanTruSelection[];
  onChange: (v: CanTruSelection[]) => void;
  /** Tổng cấn trừ tối đa hợp lý (= số tiền ĐNTT). Clamp tổng các dòng ≤ giá trị này. */
  maxAmount?: number | null;
}

/**
 * Cấn trừ NHIỀU cong_no cùng NCC trong 1 ĐNTT (gộp các khoản lẻ).
 * Quỹ trả trước lên đầu + tự tích chọn tới khi đủ maxAmount.
 */
export default function KSCongNoMultiPanel({ nccId, value, onChange, maxAmount }: Props) {
  useTranslate();
  const { data: congNoList = [], isLoading } = useCongNoByNCC(nccId);

  const options = useMemo(() => {
    const mapped = congNoList.map((r) => {
      const isPrepaid = r.loai === "tra_truoc";
      const tenDoan = isPrepaid
        ? t("Quỹ trả trước")
        : r.ten_doan ||
          extractDoanFromGhiChu(r.ghi_chu) ||
          (r.doan_id ? `#${r.doan_id}` : r.ly_do || t("Khoản dư"));
      return {
        id: r.id,
        conLai: r.so_tien_con_lai,
        tenDoan,
        isPrepaid,
        label: `${isPrepaid ? `💰 ${t("Quỹ trả trước")}` : tenDoan} — ${fmt(r.so_tien_con_lai)} VND`,
      };
    });
    return mapped.sort((a, b) => Number(b.isPrepaid) - Number(a.isPrepaid));
  }, [congNoList]);

  const hasPrepaid = options.some((o) => o.isPrepaid);
  const effMax = maxAmount != null && maxAmount > 0 ? maxAmount : Infinity;
  const selById = useMemo(
    () => new Map(value.map((s) => [s.congNoId, s])),
    [value],
  );
  const sumSelected = value.reduce((s, x) => s + x.soTienCanTru, 0);

  // Tự tích quỹ trả trước (FIFO) tới khi đủ maxAmount — 1 lần / nccId.
  const autoAppliedNcc = useRef<number | null>(null);
  useEffect(() => {
    if (autoAppliedNcc.current === nccId) return;
    if (!nccId || options.length === 0) return;
    const prepaid = options.filter((o) => o.isPrepaid);
    if (prepaid.length === 0 || value.length > 0) return;
    autoAppliedNcc.current = nccId;
    const picked: CanTruSelection[] = [];
    let acc = 0;
    for (const p of prepaid) {
      if (acc >= effMax) break;
      const amt = Math.min(p.conLai, effMax === Infinity ? p.conLai : effMax - acc);
      if (amt <= 0) continue;
      picked.push({ congNoId: p.id, soTienConLai: p.conLai, soTienCanTru: amt, tenDoan: p.tenDoan });
      acc += amt;
    }
    if (picked.length > 0) onChange(picked);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nccId, options]);

  // maxAmount đổi (full↔cọc) → cắt bớt từ cuối nếu tổng vượt.
  useEffect(() => {
    if (value.length === 0) return;
    let acc = 0;
    const trimmed: CanTruSelection[] = [];
    for (const s of value) {
      const room = effMax - acc;
      if (room <= 0) break;
      const amt = Math.min(s.soTienCanTru, room);
      trimmed.push({ ...s, soTienCanTru: amt });
      acc += amt;
    }
    if (
      trimmed.length !== value.length ||
      trimmed.some((tr, i) => tr.soTienCanTru !== value[i].soTienCanTru)
    ) {
      onChange(trimmed);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [maxAmount]);

  if (!nccId || isLoading || options.length === 0) return null;

  const toggle = (optId: number) => {
    const opt = options.find((o) => o.id === optId);
    if (!opt) return;
    if (selById.has(optId)) {
      onChange(value.filter((s) => s.congNoId !== optId));
      return;
    }
    const room = Math.max(0, effMax - sumSelected);
    const amt = Math.min(opt.conLai, effMax === Infinity ? opt.conLai : room);
    onChange([
      ...value,
      { congNoId: opt.id, soTienConLai: opt.conLai, soTienCanTru: amt, tenDoan: opt.tenDoan },
    ]);
  };

  const setAmount = (optId: number, raw: string) => {
    const opt = options.find((o) => o.id === optId);
    if (!opt) return;
    const parsed = parseInt(raw.replace(/\D/g, ""), 10);
    const sumOthers = value
      .filter((s) => s.congNoId !== optId)
      .reduce((s, x) => s + x.soTienCanTru, 0);
    const room = effMax === Infinity ? opt.conLai : Math.max(0, effMax - sumOthers);
    const amt = isNaN(parsed) ? 0 : Math.min(parsed, opt.conLai, room);
    onChange(value.map((s) => (s.congNoId === optId ? { ...s, soTienCanTru: amt } : s)));
  };

  return (
    <div className="space-y-1.5 rounded-md border border-amber-200 bg-amber-50/40 p-2">
      <div className="flex items-center gap-1 text-amber-700 text-xs">
        <AlertCircle className="h-3.5 w-3.5 shrink-0" />
        <span className="font-medium">
          {hasPrepaid ? t("NCC trả trước — chọn quỹ/công nợ để cấn trừ") : `${t("Có")} ${options.length} ${t("khoản công nợ — có thể chọn nhiều")}`}
        </span>
      </div>
      <div className="space-y-1">
        {options.map((o) => {
          const sel = selById.get(o.id);
          return (
            <div key={o.id} className="flex items-center gap-2">
              <Checkbox
                id={`ct-${o.id}`}
                checked={!!sel}
                onCheckedChange={() => toggle(o.id)}
              />
              <label htmlFor={`ct-${o.id}`} className="text-xs flex-1 cursor-pointer truncate">
                {o.isPrepaid ? <span className="text-amber-700 font-medium">{o.label}</span> : o.label}
              </label>
              {sel && (
                <div className="flex items-center gap-1 shrink-0">
                  <Input
                    className="h-7 text-xs w-28"
                    value={sel.soTienCanTru ? fmt(sel.soTienCanTru) : ""}
                    onChange={(e) => setAmount(o.id, e.target.value)}
                    placeholder={t("Số tiền")}
                  />
                  <span className="text-[11px] text-muted-foreground">₫</span>
                </div>
              )}
            </div>
          );
        })}
      </div>
      {sumSelected > 0 && (
        <div className="text-[11px] text-muted-foreground border-t border-amber-200 pt-1">
          {t("Tổng cấn trừ")}: <span className="font-medium text-amber-700 tabular-nums">{fmt(sumSelected)} ₫</span>
          {effMax !== Infinity && (
            <> {" / "} {t("tối đa")} <span className="tabular-nums">{fmt(effMax)} ₫</span></>
          )}
        </div>
      )}
    </div>
  );
}
