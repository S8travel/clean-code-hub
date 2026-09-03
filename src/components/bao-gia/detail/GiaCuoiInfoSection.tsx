import { useNavigate } from "react-router-dom";
import { ArrowRightLeft } from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { BaoGiaKetQua, BaoGiaRow } from "@/hooks/use-bao-gia";
import { AgentSelect, LoaiTourSelect } from "@/components/bao-gia/BaoGiaFields";
import { LeadSelector } from "./LeadSelector";
import { fmtVnd } from "./helpers";
import { TyGiaMacDinhButton } from "./TyGiaMacDinhButton";
import { TY_GIA_BAO_GIA_MAC_DINH } from "@/lib/bao-gia-ty-gia";

interface Props {
  draft: BaoGiaRow;
  row: BaoGiaRow;
  updateDraftField: <K extends keyof BaoGiaRow>(field: K, value: BaoGiaRow[K]) => void;
  updateDraftKetQua: (next: BaoGiaKetQua) => void;
  saveField: <K extends keyof BaoGiaRow>(field: K, value: BaoGiaRow[K]) => void;
  savePatch: (patch: Partial<BaoGiaRow>) => void;
  saveKetQua: (next: BaoGiaKetQua) => void;
}

// Thông tin tour cho báo giá GIÁ CUỐI — gọn hơn ThongTinTourSection (không có
// pax / profit / xe / phụ thu vì không tính từ dịch vụ). Tỷ giá vẫn cần để quy đổi USD.
export function GiaCuoiInfoSection({
  draft, row, updateDraftField, updateDraftKetQua, saveField, savePatch, saveKetQua,
}: Props) {
  const navigate = useNavigate();
  const ket = draft.ket_qua;

  const patchKet = (patch: Partial<BaoGiaKetQua>) => {
    if (ket) updateDraftKetQua({ ...ket, ...patch });
  };

  // Nút "Mặc định": ghi thẳng DB bằng savePatch. saveField bỏ qua khi trùng `row`
  // (bản DB đã fetch, có thể cũ hơn số vừa gõ) → sẽ báo xong mà không lưu gì.
  const applyTyGiaMacDinh = (rate: number) => {
    savePatch({ exchange_rate: rate });
    toast.success(`Đã điền tỷ giá mặc định ${rate.toLocaleString("vi-VN")} VND`);
  };

  return (
    <section className="bg-white border border-slate-200 rounded-lg p-4">
      <h2 className="text-xs uppercase tracking-wider font-semibold text-slate-500 mb-3">
        Thông tin tour
      </h2>
      <div className="grid grid-cols-12 gap-3">
        {/* Tên chương trình */}
        <div className="col-span-7">
          <Label className="text-xs text-slate-600">Tên chương trình *</Label>
          <Input
            value={ket?.ten_chuong_trinh ?? ""}
            onChange={(e) => patchKet({ ten_chuong_trinh: e.target.value })}
            onBlur={() => {
              if (ket && ket.ten_chuong_trinh !== row.ket_qua?.ten_chuong_trinh) saveKetQua(ket);
            }}
            className="h-9 mt-1"
          />
        </div>
        {/* Số ngày */}
        <div className="col-span-2">
          <Label className="text-xs text-slate-600">Số ngày</Label>
          <Input
            type="number"
            min={1}
            value={ket?.so_ngay ?? 1}
            onChange={(e) => {
              const v = parseInt(e.target.value, 10);
              if (!isNaN(v) && v >= 1) patchKet({ so_ngay: v });
            }}
            onBlur={() => {
              if (ket && ket.so_ngay !== row.ket_qua?.so_ngay) saveKetQua(ket);
            }}
            className="h-9 mt-1"
          />
        </div>
        {/* Tỷ giá */}
        <div className="col-span-3">
          <Label className="text-xs text-slate-600">Tỷ giá (USD)</Label>
          <div className="relative mt-1">
            <Input
              type="number"
              value={draft.exchange_rate ?? TY_GIA_BAO_GIA_MAC_DINH}
              onChange={(e) => {
                const v = parseFloat(e.target.value);
                // Chặn 0/âm: `?? mặc định` không bắt số 0 → chia cho 0 khi quy đổi USD.
                if (!isNaN(v) && v > 0) updateDraftField("exchange_rate", v);
              }}
              onBlur={() => {
                const v = draft.exchange_rate;
                if (v != null && v > 0 && v !== row.exchange_rate) saveField("exchange_rate", v);
              }}
              className="h-9 pr-7"
            />
            <ArrowRightLeft className="absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
          </div>
          <div className="flex flex-wrap items-center justify-between gap-x-1 gap-y-0.5 mt-0.5">
            <p className="text-[10px] text-slate-400 tabular-nums">{fmtVnd(draft.exchange_rate || 0)} VND/USD</p>
            <TyGiaMacDinhButton onApply={applyTyGiaMacDinh} />
          </div>
        </div>

        {/* Agent + Loại tour */}
        <div className="col-span-4">
          <Label className="text-xs text-slate-600">Agent (đối tác)</Label>
          <div className="mt-1">
            <AgentSelect
              value={draft.agent_id}
              onChange={(id) => saveField("agent_id", id)}
            />
          </div>
        </div>
        <div className="col-span-4">
          <Label className="text-xs text-slate-600">Loại tour</Label>
          <div className="mt-1">
            <LoaiTourSelect
              value={draft.loai_tour}
              onChange={(v) => saveField("loai_tour", v)}
            />
          </div>
        </div>
        <div className="col-span-2">
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
        <div className="col-span-2">
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

        {/* Lead + Ghi chú */}
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
            <LeadSelector leadId={draft.lead_id} onChange={(newId) => saveField("lead_id", newId)} />
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
