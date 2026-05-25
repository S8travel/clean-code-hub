import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { useBaoGia, useUpdateBaoGia, type BaoGiaKetQua, type BaoGiaRow } from "@/hooks/use-bao-gia";
import { exportBaoGiaWord } from "@/lib/export-bao-gia-word";
import { liveKetQua } from "@/components/bao-gia/detail/helpers";
import { BaoGiaHeader } from "@/components/bao-gia/detail/BaoGiaHeader";
import { ThongTinTourSection } from "@/components/bao-gia/detail/ThongTinTourSection";
import { ChuongTrinhTourSection } from "@/components/bao-gia/detail/ChuongTrinhTourSection";
import { DichVuPhuTroSection } from "@/components/bao-gia/detail/DichVuPhuTroSection";
import { TongHopChiPhiPanel } from "@/components/bao-gia/detail/TongHopChiPhiPanel";
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

  const handleExportPdf = async () => {
    if (!draft.ket_qua) return;
    try {
      // Recompute case totals + giá trung bình từ items + xe_gia hiện tại
      // → Word khớp với panel UI, không stale theo AI extract gốc.
      const fresh = liveKetQua(draft);
      if (!fresh) return;
      await exportBaoGiaWord(fresh, draft.exchange_rate ?? 26000, draft.profit_usd ?? 0);
      toast.success("Đã xuất file Word!");
    } catch {
      toast.error("Lỗi xuất file");
    }
  };
  const todo = (label: string) => toast.info(`${label}: tính năng đang phát triển`);

  return (
    <div className="flex flex-col min-h-[calc(100vh-3rem)] bg-slate-50">
      <BaoGiaHeader
        row={draft}
        onSaveDraft={() => todo("Lưu nháp")}
        onExportPdf={handleExportPdf}
        onSendCustomer={() => todo("Gửi khách hàng")}
      />
      <div className="flex-1 px-4 py-4">
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
          </div>
          <TongHopChiPhiPanel draft={draft} />
        </div>
      </div>
      <BaoGiaFooter
        onSaveDraft={() => todo("Lưu nháp")}
        onCreateBooking={() => todo("Tạo booking")}
        onExportPdf={handleExportPdf}
      />
    </div>
  );
}
