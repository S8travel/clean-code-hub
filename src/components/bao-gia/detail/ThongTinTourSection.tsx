import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Users, ArrowRightLeft, RefreshCw, Loader2, Check } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { BaoGiaKetQua, BaoGiaRow } from "@/hooks/use-bao-gia";
import { useFetchExchangeRate, type VcbRate } from "@/hooks/use-exchange-rate";
import { paxOf, fmtVnd, defaultDayItems } from "./helpers";
import { LeadSelector } from "./LeadSelector";
import { VehicleSelector } from "./VehicleSelector";
import { AgentSelect, LoaiTourSelect } from "@/components/bao-gia/BaoGiaFields";

interface Props {
  draft: BaoGiaRow;
  row: BaoGiaRow;  // committed state (DB) — so sánh trước save tránh dirty save
  updateDraftField: <K extends keyof BaoGiaRow>(field: K, value: BaoGiaRow[K]) => void;
  updateDraftKetQua: (next: BaoGiaKetQua) => void;
  saveField: <K extends keyof BaoGiaRow>(field: K, value: BaoGiaRow[K]) => void;
  savePatch: (patch: Partial<BaoGiaRow>) => void;
  saveKetQua: (next: BaoGiaKetQua) => void;
}

// Children fully controlled bởi draft từ parent. Mỗi keystroke → updateDraft*
// (panel cost recompute live). Blur → save* persist DB.
export function ThongTinTourSection({
  draft, row, updateDraftField, updateDraftKetQua, saveField, savePatch, saveKetQua,
}: Props) {
  const navigate = useNavigate();
  const ket = draft.ket_qua;
  const pax = paxOf(ket);
  const fetchRate = useFetchExchangeRate();
  // VCB rate transient — KHÔNG store DB. User xem rồi click "Áp dụng" để
  // copy sang ô Tỷ giá chính (tự điền).
  const [vcbRate, setVcbRate] = useState<VcbRate | null>(null);

  const handleFetchVcb = () => {
    fetchRate.mutate(undefined, {
      onSuccess: (data) => {
        setVcbRate(data);
        const rate = Math.round(data.rate);
        // Auto-save vcb_rate để costBreakdown tính chênh lệch tỷ giá ngay.
        if (rate !== row.vcb_rate) saveField("vcb_rate", rate);
        const note = data.cached ? " (cache)" : "";
        toast.success(`VCB mua USD: ${rate.toLocaleString("vi-VN")} VND${note}`);
      },
      onError: (err) => toast.error(`Lỗi lấy tỷ giá VCB: ${err.message}`),
    });
  };

  const applyVcbRate = () => {
    if (!vcbRate) return;
    const rate = Math.round(vcbRate.rate);
    if (rate !== row.exchange_rate) saveField("exchange_rate", rate);
    else updateDraftField("exchange_rate", rate);
    toast.success(`Đã áp dụng tỷ giá ${rate.toLocaleString("vi-VN")} VND`);
  };

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
        {/* Row 1: Tên (5) | Số ngày (2) | Pax (2) | Tỷ giá (3) — tỷ giá rộng
            hơn để icon + số 5 chữ số không bị che. */}
        <div className="col-span-5">
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
              if (!isNaN(v) && v >= 1 && ket) {
                // Tăng → append 4 default cho mỗi ngày mới; Giảm → giữ items
                // các ngày bị "ẩn" (không xoá để user không mất data nếu lỡ tay).
                const prevSoNgay = ket.so_ngay ?? 1;
                let nextItems = ket.items ?? [];
                if (v > prevSoNgay) {
                  const appended = [...nextItems];
                  for (let d = prevSoNgay + 1; d <= v; d++) {
                    appended.push(...defaultDayItems(d));
                  }
                  nextItems = appended;
                }
                updateDraftKetQua({ ...ket, so_ngay: v, items: nextItems });
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
        <div className="col-span-3">
          <Label className="text-xs text-slate-600">Tỷ giá *</Label>
          <div className="flex items-center gap-1.5 mt-1">
            <span className="inline-flex items-center px-2 h-9 rounded-md bg-slate-100 text-xs text-slate-600 font-medium shrink-0">
              VND
            </span>
            <div className="relative flex-1 min-w-0">
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
                className="h-9 pr-7 w-full"
              />
              <ArrowRightLeft className="absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
            </div>
          </div>
          <p className="text-[10px] text-slate-400 mt-0.5 tabular-nums">{fmtVnd(draft.exchange_rate || 0)} VND/USD</p>
        </div>

        {/* Row 1b: Tỷ giá VCB (tham khảo — read-only, KHÔNG store DB).
            Click ↻ fetch → hiển thị giá MUA USD VCB. Bấm "Áp dụng" copy sang
            ô Tỷ giá chính ở trên. */}
        <div className="col-span-12">
          <Label className="text-xs text-slate-600">
            Tỷ giá VCB <span className="text-[10px] text-slate-400 font-normal">(tham khảo — giá MUA USD)</span>
          </Label>
          <div className="flex items-center gap-2 mt-1">
            <div className="relative flex-1 max-w-[260px]">
              <Input
                readOnly
                value={
                  vcbRate
                    ? Math.round(vcbRate.rate).toLocaleString("vi-VN") + " VND"
                    : draft.vcb_rate
                      ? Math.round(draft.vcb_rate).toLocaleString("vi-VN") + " VND"
                      : "Chưa lấy — click ↻ để cập nhật"
                }
                className="h-9 pr-9 text-right bg-slate-50 cursor-default"
              />
              <button
                type="button"
                onClick={handleFetchVcb}
                disabled={fetchRate.isPending}
                title="Lấy giá MUA USD từ Vietcombank"
                className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7 inline-flex items-center justify-center rounded text-slate-500 hover:text-blue-600 hover:bg-blue-50 disabled:opacity-40"
              >
                {fetchRate.isPending
                  ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  : <RefreshCw className="h-3.5 w-3.5" />}
              </button>
            </div>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={!vcbRate}
              onClick={applyVcbRate}
              className="h-9 text-xs gap-1"
              title="Copy tỷ giá VCB sang ô Tỷ giá ở trên"
            >
              <Check className="h-3.5 w-3.5" />
              Áp dụng
            </Button>
            {vcbRate && (
              <span className="text-[10px] text-slate-500 ml-1">
                {vcbRate.date}{vcbRate.cached ? " (cache)" : ""}
                {" · "}TT: {Math.round(vcbRate.rate_transfer).toLocaleString("vi-VN")}
                {" · "}Bán: {Math.round(vcbRate.rate_sell).toLocaleString("vi-VN")}
              </span>
            )}
          </div>
        </div>

        {/* Row 2 */}
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

        {/* Row 2b: Agent đối tác + Loại tour */}
        <div className="col-span-6">
          <Label className="text-xs text-slate-600">Agent (đối tác)</Label>
          <div className="mt-1">
            <AgentSelect value={draft.agent_id} onChange={(id) => saveField("agent_id", id)} />
          </div>
        </div>
        <div className="col-span-6">
          <Label className="text-xs text-slate-600">Loại tour</Label>
          <div className="mt-1">
            <LoaiTourSelect value={draft.loai_tour} onChange={(v) => saveField("loai_tour", v)} />
          </div>
        </div>

        {/* Row 3: Xe sử dụng full width — dropdown rộng + giá hiển thị kế bên */}
        <div className="col-span-12">
          <Label className="text-xs text-slate-600">Xe sử dụng</Label>
          <div className="mt-1">
            <VehicleSelector
              xeTen={draft.xe_ten}
              xeGia={draft.xe_gia}
              onChange={(xeTen, xeGia) => {
                if (xeTen === row.xe_ten && xeGia === row.xe_gia) return;
                savePatch({ xe_ten: xeTen, xe_gia: xeGia });
              }}
            />
          </div>
        </div>

        {/* Row 3b: Phụ thu lump-sum (cầu đường, transfer...) — KHÔNG × pax */}
        <div className="col-span-12">
          <Label className="text-xs text-slate-600">
            Phụ thu <span className="text-[10px] text-slate-400 font-normal">(vé cầu đường, xe trung chuyển — tính 1 lần)</span>
          </Label>
          <Input
            type="text"
            inputMode="numeric"
            value={(draft.phu_thu ?? 0) > 0 ? (draft.phu_thu ?? 0).toLocaleString("vi-VN") : ""}
            onChange={(e) => {
              const digits = e.target.value.replace(/[^0-9]/g, "");
              updateDraftField("phu_thu", digits ? parseInt(digits, 10) : 0);
            }}
            onBlur={() => {
              if ((draft.phu_thu ?? 0) !== (row.phu_thu ?? 0)) saveField("phu_thu", draft.phu_thu ?? 0);
            }}
            className="h-9 mt-1 text-right"
            placeholder="0"
          />
        </div>

        {/* Row 4 */}
        <div className="col-span-6">
          <div className="flex items-center justify-between">
            <Label className="text-xs text-slate-600">Khách hàng (Lead)</Label>
            {draft.lead_id != null && (
              <button
                type="button"
                onClick={() => navigate(`/leads?lead=${draft.lead_id}`)}
                className="text-[11px] text-primary hover:underline"
              >
                → Xem lead
              </button>
            )}
          </div>
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
