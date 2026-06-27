import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useBaoGia, useUpdateBaoGia, type BaoGiaKetQua, type BaoGiaRow } from "@/hooks/use-bao-gia";
import { useLead } from "@/hooks/use-leads";
import { exportBaoGiaWord, exportBaoGiaGiaCuoiWord } from "@/lib/export-bao-gia-word";
import { liveKetQua, liveTierBreakdown } from "@/components/bao-gia/detail/helpers";
import { giaCuoiBrackets } from "@/lib/bao-gia-calc";
import { BaoGiaHeader } from "@/components/bao-gia/detail/BaoGiaHeader";
import { ThongTinTourSection } from "@/components/bao-gia/detail/ThongTinTourSection";
import { ChuongTrinhTourSection } from "@/components/bao-gia/detail/ChuongTrinhTourSection";
import { DichVuPhuTroSection } from "@/components/bao-gia/detail/DichVuPhuTroSection";
import { TierMatrixSection } from "@/components/bao-gia/detail/TierMatrixSection";
import { TongHopChiPhiPanel } from "@/components/bao-gia/detail/TongHopChiPhiPanel";
import { GiaCuoiInfoSection } from "@/components/bao-gia/detail/GiaCuoiInfoSection";
import { GiaCuoiPriceSection } from "@/components/bao-gia/detail/GiaCuoiPriceSection";
import { LichTrinhFilesSection } from "@/components/bao-gia/detail/LichTrinhFilesSection";
import { BaoGiaFooter } from "@/components/bao-gia/detail/BaoGiaFooter";

// Trang chi tiết Báo giá. State pattern: PARENT giữ `draft` (mirror row +
// live edits). Children controlled bởi draft. Mỗi field change → setDraft
// (live render); save persist on blur qua saveField/saveKetQua. Panel
// TỔNG HỢP đọc draft → recompute ngay khi pax/profit/xr đổi, KHÔNG chờ blur.
export default function BaoGiaDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const bgId = Number(id);
  const { data: row, isLoading, error } = useBaoGia(bgId);
  const update = useUpdateBaoGia();

  const [draft, setDraft] = useState<BaoGiaRow | null>(null);
  useEffect(() => { if (row) setDraft(row); }, [row]);

  // Pax dự kiến của lead gắn báo giá → highlight bậc giá áp dụng.
  const { data: lead } = useLead(draft?.lead_id ?? null);
  const leadPax = lead ? (lead.so_nguoi_lon ?? 0) + (lead.so_nguoi_em ?? 0) : undefined;

  if (isLoading || !draft) {
    return (
      <div className="p-8 text-center text-sm text-muted-foreground">Đang tải báo giá...</div>
    );
  }
  if (error || !row || !row.ket_qua) {
    return (
      <div className="p-8 text-center">
        <p className="text-sm text-muted-foreground mb-3">
          Không tìm thấy báo giá hoặc dữ liệu bị thiếu.
        </p>
        <button onClick={() => navigate("/bao-gia")} className="text-sm text-blue-600 hover:underline">
          ← Quay lại danh sách
        </button>
      </div>
    );
  }

  // Save persisted (blur): update draft local + mutate DB
  const saveField = <K extends keyof BaoGiaRow>(field: K, value: BaoGiaRow[K]) => {
    if (value === row[field]) return;
    setDraft({ ...draft, [field]: value });
    update.mutate({ id: draft.id, [field]: value }, { onError: () => toast.error("Lỗi lưu") });
  };
  // Save nhiều field cùng lúc (atomic) — vd xe_ten + xe_gia khi pick từ catalog.
  // 2 saveField liên tiếp sẽ race local state vì closure stale.
  const savePatch = (patch: Partial<BaoGiaRow>) => {
    setDraft({ ...draft, ...patch });
    update.mutate({ id: draft.id, ...patch }, { onError: () => toast.error("Lỗi lưu") });
  };
  const saveKetQua = (next: BaoGiaKetQua) => {
    setDraft({ ...draft, ket_qua: next });
    update.mutate({ id: draft.id, ket_qua: next }, { onError: () => toast.error("Lỗi lưu") });
  };

  // Live edit (mỗi keystroke) — KHÔNG persist, chỉ update draft cho re-render.
  const updateDraftField = <K extends keyof BaoGiaRow>(field: K, value: BaoGiaRow[K]) => {
    setDraft((d) => d ? { ...d, [field]: value } : d);
  };
  const updateDraftKetQua = (next: BaoGiaKetQua) => {
    setDraft((d) => d ? { ...d, ket_qua: next } : d);
  };

  const isSent = draft.trang_thai === "sent";
  const isGiaCuoi = draft.loai_bao_gia === "gia_cuoi";

  const handleExportPdf = async () => {
    if (!draft.ket_qua) return;
    try {
      const xr = draft.exchange_rate ?? 26000;
      if (isGiaCuoi) {
        // Giá cuối: chỉ bảng giá theo khoảng khách (nhập tay) — không section costing.
        const tiers = giaCuoiBrackets(draft.ket_qua.gia_cuoi_tiers, xr).map((b) => ({
          guests: b.guests_from,
          gia_ban_vnd: b.gia_ban_vnd,
          gia_ban_usd: b.gia_ban_usd,
          label: b.label,
        }));
        await exportBaoGiaGiaCuoiWord(draft.ket_qua, xr, tiers);
        toast.success("Đã xuất file Word!");
        return;
      }
      // Recompute case totals từ items + xe_gia hiện tại → Word khớp panel UI.
      const fresh = liveKetQua(draft);
      if (!fresh) return;
      // Bảng giá theo số khách (ma trận thật) — khớp section ma trận trên màn hình.
      const tiers = liveTierBreakdown(draft).map((t) => ({
        guests: t.guests,
        gia_ban_vnd: t.line.gia_ban_per_pax,
        gia_ban_usd: xr > 0 ? t.line.gia_ban_per_pax / xr : 0,
      }));
      await exportBaoGiaWord(fresh, xr, draft.profit_usd ?? 0, undefined, tiers);
      toast.success("Đã xuất file Word!");
    } catch {
      toast.error("Lỗi xuất file");
    }
  };

  // Gửi khách = chốt giá (freeze): trạng thái 'sent', khóa chỉnh sửa. Mở lại được.
  const handleSend = () => {
    if (isSent) return;
    saveField("trang_thai", "sent");
    toast.success("Đã gửi khách — báo giá đã chốt giá (khóa sửa).");
  };
  const handleReopen = () => {
    saveField("trang_thai", "draft");
    toast.info("Đã mở lại để chỉnh sửa.");
  };
  const todo = (label: string) => toast.info(`${label}: tính năng đang phát triển`);

  return (
    <div className="flex flex-col min-h-[calc(100vh-3rem)] bg-slate-50">
      <BaoGiaHeader
        row={draft}
        onSaveDraft={() => todo("Lưu nháp")}
        onExportPdf={handleExportPdf}
        onSendCustomer={handleSend}
      />
      <div className="flex-1 px-4 py-4">
        {isSent && (
          <div className="max-w-[1400px] mx-auto mb-3 flex items-center justify-between gap-2 rounded-md border border-violet-200 bg-violet-50 px-4 py-2">
            <span className="inline-flex items-center gap-1.5 text-xs text-violet-800">
              <Lock className="h-3.5 w-3.5" /> Báo giá đã gửi khách — đã chốt giá, khóa chỉnh sửa.
            </span>
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={handleReopen}>Mở lại để sửa</Button>
          </div>
        )}
        <fieldset disabled={isSent} className="border-0 p-0 m-0 min-w-0 [&:disabled]:opacity-100">
        {isGiaCuoi ? (
          <div className="max-w-[1400px] mx-auto space-y-4 min-w-0">
            <GiaCuoiInfoSection
              draft={draft}
              row={row}
              updateDraftField={updateDraftField}
              updateDraftKetQua={updateDraftKetQua}
              saveField={saveField}
              saveKetQua={saveKetQua}
            />
            <GiaCuoiPriceSection
              draft={draft}
              updateDraftKetQua={updateDraftKetQua}
              saveKetQua={saveKetQua}
              leadPax={leadPax}
            />
            <LichTrinhFilesSection draft={draft} />
          </div>
        ) : (
          <div className="max-w-[1400px] mx-auto grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_300px] gap-4">
            <div className="space-y-4 min-w-0">
              <ThongTinTourSection
                draft={draft}
                row={row}
                updateDraftField={updateDraftField}
                updateDraftKetQua={updateDraftKetQua}
                saveField={saveField}
                savePatch={savePatch}
                saveKetQua={saveKetQua}
              />
              <ChuongTrinhTourSection
                draft={draft}
                updateDraftKetQua={updateDraftKetQua}
                saveKetQua={saveKetQua}
              />
              <DichVuPhuTroSection
                draft={draft}
                updateDraftKetQua={updateDraftKetQua}
                saveKetQua={saveKetQua}
              />
              <TierMatrixSection draft={draft} saveKetQua={saveKetQua} leadPax={leadPax} />
              <LichTrinhFilesSection draft={draft} />
            </div>
            <TongHopChiPhiPanel draft={draft} />
          </div>
        )}
        </fieldset>
      </div>
      <BaoGiaFooter
        onSaveDraft={() => todo("Lưu nháp")}
        onCreateBooking={() => todo("Tạo booking")}
        onExportPdf={handleExportPdf}
      />
    </div>
  );
}
