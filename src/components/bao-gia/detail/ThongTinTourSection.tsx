import { Users, ArrowRightLeft } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { BaoGiaKetQua, BaoGiaRow } from "@/hooks/use-bao-gia";
import { paxOf, fmtVnd } from "./helpers";
import { LeadSelector } from "./LeadSelector";

interface Props {
  draft: BaoGiaRow;
  row: BaoGiaRow;  // committed state (DB) — so sánh trước save tránh dirty save
  updateDraftField: <K extends keyof BaoGiaRow>(field: K, value: BaoGiaRow[K]) => void;
  updateDraftKetQua: (next: BaoGiaKetQua) => void;
  saveField: <K extends keyof BaoGiaRow>(field: K, value: BaoGiaRow[K]) => void;
  saveKetQua: (next: BaoGiaKetQua) => void;
}

// Children fully controlled bởi draft từ parent. Mỗi keystroke → updateDraft*
// (panel cost recompute live). Blur → save* persist DB.
export function ThongTinTourSection({
  draft, row, updateDraftField, updateDraftKetQua, saveField, saveKetQua,
}: Props) {
  const ket = draft.ket_qua;
  const pax = paxOf(ket);

  // Helper: build new ket_qua object trên field jsonb đơn (không phải case)
  const patchKetQua = (patch: Partial<BaoGiaKetQua>) => {
    if (!ket) return null;
    return { ...ket, ...patch };
  };

  return (
    <section className="bg-white border border-slate-200 rounded-lg p-4">
      <h2 className="text-xs uppercase tracking-wider font-semibold text-slate-500 mb-3">
        Thông tin tour
      </h2>
      <div className="grid grid-cols-12 gap-3">
        <div className="col-span-6">
          <Label className="text-xs text-slate-600">Tên chương trình *</Label>
          <Input
            value={ket?.ten_chuong_trinh ?? ""}
            onChange={(e) => {
              const next = patchKetQua({ ten_chuong_trinh: e.target.value });
              if (next) updateDraftKetQua(next);
            }}
            onBlur={() => {
              if (ket && ket.ten_chuong_trinh !== row.ket_qua?.ten_chuong_trinh) {
                saveKetQua(ket);
              }
            }}
            className="h-9 mt-1"
          />
        </div>
        <div className="col-span-2">
          <Label className="text-xs text-slate-600">Số ngày *</Label>
          <Input
            type="number"
            min={1}
            value={ket?.so_ngay ?? 0}
            onChange={(e) => {
              const v = parseInt(e.target.value, 10);
              if (!isNaN(v) && v >= 1) {
                const next = patchKetQua({ so_ngay: v });
                if (next) updateDraftKetQua(next);
              }
            }}
            onBlur={() => {
              if (ket && ket.so_ngay !== row.ket_qua?.so_ngay) saveKetQua(ket);
            }}
            className="h-9 mt-1"
          />
        </div>
        <div className="col-span-2">
          <Label className="text-xs text-slate-600">Số khách (pax) *</Label>
          <div className="relative mt-1">
            <Input
              type="number"
              min={1}
              value={pax}
              onChange={(e) => {
                const v = parseInt(e.target.value, 10);
                if (!isNaN(v) && v >= 1 && ket) {
                  const next: BaoGiaKetQua = {
                    ...ket,
                    case_16: ket.case_16 ? { ...ket.case_16, guests: v } : ket.case_16,
                    case_20: ket.case_20 ? { ...ket.case_20, guests: v } : ket.case_20,
                  };
                  updateDraftKetQua(next);
                }
              }}
              onBlur={() => {
                if (ket && paxOf(ket) !== paxOf(row.ket_qua)) saveKetQua(ket);
              }}
              className="h-9 pr-8"
            />
            <Users className="absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
          </div>
        </div>
        <div className="col-span-2">
          <Label className="text-xs text-slate-600">Tỷ giá *</Label>
          <div className="flex items-center gap-1 mt-1">
            <Input value="VND" readOnly className="h-9 bg-slate-50 flex-1" />
            <div className="relative flex-1">
              <Input
                type="number"
                value={draft.exchange_rate ?? 26000}
                onChange={(e) => {
                  const v = parseFloat(e.target.value);
                  if (!isNaN(v)) updateDraftField("exchange_rate", v);
                }}
                onBlur={() => {
                  const v = draft.exchange_rate;
                  if (v != null && v > 0 && v !== row.exchange_rate) saveField("exchange_rate", v);
                }}
                className="h-9 pr-7"
              />
              <ArrowRightLeft className="absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
            </div>
          </div>
          <p className="text-[10px] text-slate-400 mt-0.5 tabular-nums">{fmtVnd(draft.exchange_rate || 0)} VND/USD</p>
        </div>

        <div className="col-span-3">
          <Label className="text-xs text-slate-600">Ngày khởi hành</Label>
          <Input
            type="date"
            value={draft.ngay_di ?? ""}
            onChange={(e) => updateDraftField("ngay_di", e.target.value || null)}
            onBlur={() => {
              if ((draft.ngay_di ?? null) !== (row.ngay_di ?? null)) saveField("ngay_di", draft.ngay_di);
            }}
            className="h-9 mt-1"
          />
        </div>
        <div className="col-span-3">
          <Label className="text-xs text-slate-600">Ngày kết thúc</Label>
          <Input
            type="date"
            value={draft.ngay_ve ?? ""}
            onChange={(e) => updateDraftField("ngay_ve", e.target.value || null)}
            onBlur={() => {
              if ((draft.ngay_ve ?? null) !== (row.ngay_ve ?? null)) saveField("ngay_ve", draft.ngay_ve);
            }}
            className="h-9 mt-1"
          />
        </div>
        <div className="col-span-6">
          <Label className="text-xs text-slate-600">Profit target</Label>
          <div className="flex items-center gap-1 mt-1">
            <Input
              type="number"
              value={draft.profit_usd ?? 0}
              onChange={(e) => {
                const v = parseFloat(e.target.value);
                if (!isNaN(v)) updateDraftField("profit_usd", v);
              }}
              onBlur={() => {
                if (draft.profit_usd !== row.profit_usd) saveField("profit_usd", draft.profit_usd);
              }}
              className="h-9 flex-1"
            />
            <span className="text-xs text-slate-500 px-2 whitespace-nowrap">USD / pax</span>
          </div>
        </div>

        <div className="col-span-6">
          <Label className="text-xs text-slate-600">Khách hàng (Lead)</Label>
          <div className="mt-1">
            <LeadSelector
              leadId={draft.lead_id}
              onChange={(newId) => saveField("lead_id", newId)}
            />
          </div>
        </div>

        <div className="col-span-6">
          <Label className="text-xs text-slate-600">Ghi chú</Label>
          <Input
            placeholder="Nhập ghi chú nếu có..."
            value={draft.ghi_chu ?? ""}
            onChange={(e) => updateDraftField("ghi_chu", e.target.value || null)}
            onBlur={() => {
              if ((draft.ghi_chu ?? null) !== (row.ghi_chu ?? null)) saveField("ghi_chu", draft.ghi_chu);
            }}
            className="h-9 mt-1"
          />
        </div>
      </div>
    </section>
  );
}
