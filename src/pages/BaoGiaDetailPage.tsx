import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { Lock, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BaoGiaAiImport } from "@/components/bao-gia/BaoGiaAiImport";
import { useBaoGia, useUpdateBaoGia, type BaoGiaKetQua, type BaoGiaRow } from "@/hooks/use-bao-gia";
import { useLead } from "@/hooks/use-leads";
import { exportBaoGiaTaiwanWord, exportBaoGiaGiaCuoiWord } from "@/lib/export-bao-gia-word";
import { liveKetQua, baoGiaCode } from "@/components/bao-gia/detail/helpers";
import { extractItineraryText, imageMime } from "@/lib/itinerary-file";
import { pickProgramFile, renderPdfToPageImages, imageToPageImages, MAX_PROGRAM_PAGES, type PageImage } from "@/lib/itinerary-images";
import { giaCuoiBrackets } from "@/lib/bao-gia-calc";
import { buildPhienBan, maPhienBan, type PhienBanMoi } from "@/lib/bao-gia-phien-ban";
import { useTaoPhienBan, useMoPhienBanMoi } from "@/hooks/use-bao-gia-phien-ban";
import { BaoGiaHeader } from "@/components/bao-gia/detail/BaoGiaHeader";
import { ThongTinTourSection } from "@/components/bao-gia/detail/ThongTinTourSection";
import { CostingSheetSection } from "@/components/bao-gia/detail/CostingSheetSection";
import { TaiwanExportSection } from "@/components/bao-gia/detail/TaiwanExportSection";
import { TongHopChiPhiPanel } from "@/components/bao-gia/detail/TongHopChiPhiPanel";
import { GiaCuoiInfoSection } from "@/components/bao-gia/detail/GiaCuoiInfoSection";
import { GiaCuoiPriceSection } from "@/components/bao-gia/detail/GiaCuoiPriceSection";
import { LichTrinhFilesSection } from "@/components/bao-gia/detail/LichTrinhFilesSection";
import { PortalShareSection } from "@/components/bao-gia/detail/PortalShareSection";
import { PhienBanSection } from "@/components/bao-gia/detail/PhienBanSection";
import { GuiPhienBanModal } from "@/components/bao-gia/detail/GuiPhienBanModal";
import { BaoGiaFooter } from "@/components/bao-gia/detail/BaoGiaFooter";
import { resolveStorageUrl } from "@/lib/storage-url";

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
  const [aiOpen, setAiOpen] = useState(false);
  const [guiOpen, setGuiOpen] = useState(false);
  const [phienBanMoi, setPhienBanMoi] = useState<PhienBanMoi | null>(null);
  const taoPhienBan = useTaoPhienBan();
  const moPhienBanMoi = useMoPhienBanMoi();

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
      // Recompute case totals từ items + xe_gia hiện tại → giá TB khớp panel UI.
      const fresh = liveKetQua(draft);
      if (!fresh) return;
      // 行程內容: ưu tiên file PDF/ảnh → render từng trang thành ẢNH nhúng vào
      // Word (giữ nguyên format gốc của khách; nhiều file ảnh = nhiều trang).
      // Word/Excel → trích text (mất bảng biểu — khuyên đính kèm bản PDF).
      let programText = "";
      let programImages: PageImage[] | undefined;
      const prog = pickProgramFile(draft.lich_trinh_files ?? []);
      if (prog) {
        try {
          if (prog.kind === "pdf") {
            const buf = await (await fetch(await resolveStorageUrl(prog.files[0].url))).arrayBuffer();
            const r = await renderPdfToPageImages(buf);
            programImages = r.pages;
            if (r.truncated) {
              toast.warning(`Lịch trình PDF dài ${r.numPages} trang — file xuất chỉ nhúng ${r.pages.length} trang đầu.`, { duration: 6000 });
            }
          } else if (prog.kind === "image") {
            const all: PageImage[] = [];
            for (const f of prog.files) {
              const buf = await (await fetch(await resolveStorageUrl(f.url))).arrayBuffer();
              all.push(...(await imageToPageImages(buf, imageMime(f.ten) || "image/png")));
            }
            programImages = all.slice(0, MAX_PROGRAM_PAGES);
            if (all.length > MAX_PROGRAM_PAGES) {
              toast.warning(`Lịch trình dạng ảnh dài ${all.length} trang — file xuất chỉ nhúng ${MAX_PROGRAM_PAGES} trang đầu.`, { duration: 6000 });
            }
          } else {
            const buf = await (await fetch(await resolveStorageUrl(prog.files[0].url))).arrayBuffer();
            programText = await extractItineraryText(buf, prog.kind);
          }
        } catch {
          // File PDF/ảnh lỗi (hỏng, có mật khẩu, đã xóa khỏi storage...) nhưng
          // báo giá còn đính kèm Word/Excel → fallback trích text thay vì xuất
          // thiếu hẳn 行程內容 (hành vi cũ trước khi có nhúng ảnh).
          if (prog.fallbackText) {
            try {
              const fb = prog.fallbackText;
              const buf = await (await fetch(await resolveStorageUrl(fb.file.url))).arrayBuffer();
              programText = await extractItineraryText(buf, fb.kind);
              toast.warning(`Không đọc được "${prog.files[0].ten}" — dùng nội dung text từ "${fb.file.ten}" thay thế (mất định dạng gốc).`, { duration: 6000 });
            } catch {
              toast.warning(`Không đọc được file lịch trình đính kèm — file xuất sẽ thiếu phần 行程內容.`);
            }
          } else {
            toast.warning(`Không đọc được file lịch trình "${prog.files[0].ten}" — file xuất sẽ thiếu phần 行程內容.`);
          }
        }
      }
      // Xuất kiểu Đài Loan (報價): bảng giá 3 mốc + 單房差 + 報價包含/不含 + mã code + 行程內容.
      await exportBaoGiaTaiwanWord(fresh, fresh.items, xr, baoGiaCode(draft), programText, programImages);
      toast.success("Đã xuất file Word!");
    } catch {
      toast.error("Lỗi xuất file");
    }
  };

  // Gửi khách = chốt MỘT PHIÊN BẢN. Bản đã chốt khoá vĩnh viễn (DB chặn sửa/xoá),
  // muốn đổi thì ra bản kế tiếp — nhờ vậy sửa đơn giá vốn hôm nay không làm đổi
  // con số đã chào tuần trước, và tra lại được đã chào gì, lúc nào, vì sao đổi.
  const soPhienBanSapTao = (draft.so_phien_ban_cuoi ?? 0) + 1;
  const openGuiModal = () => {
    if (isSent) return;
    // Mode 'gia_cuoi': bảng giá nhập tay theo bậc, chưa dựng được bản chào.
    const fresh = isGiaCuoi ? null : liveKetQua(draft);
    if (!fresh) {
      saveField("trang_thai", "sent");
      toast.success("Đã gửi khách — báo giá đã chốt giá (khóa sửa).");
      return;
    }
    try {
      setPhienBanMoi(buildPhienBan(draft, fresh));
      setGuiOpen(true);
    } catch (e) {
      // buildPhienBan ném lỗi khi phát hiện field giá vốn lọt vào lớp chào —
      // thà không chốt còn hơn chốt bằng dữ liệu sai.
      toast.error(e instanceof Error ? e.message : "Lỗi chốt giá");
    }
  };

  const handleGui = (lyDo: string) => {
    if (!phienBanMoi) return;
    taoPhienBan.mutate(
      { baoGiaId: draft.id, chao: phienBanMoi.noi_dung_chao, von: phienBanMoi.noi_dung_von, lyDo },
      {
        onSuccess: () => {
          setGuiOpen(false);
          setPhienBanMoi(null);
          toast.success(`Đã chốt và gửi bản ${maPhienBan(baoGiaCode(draft), soPhienBanSapTao)}.`);
        },
        onError: (e) => toast.error(e instanceof Error ? e.message : "Lỗi chốt phiên bản"),
      },
    );
  };

  // Không phải "mở lại để sửa bản cũ" — bản cũ vẫn nguyên vẹn và vẫn là bản đối
  // tác đang xem; đây chỉ là mở bàn làm việc ra soạn bản kế tiếp.
  const handleSoanBanMoi = () => {
    moPhienBanMoi.mutate(draft.id, {
      onSuccess: () => toast.info("Đã mở để soạn bản mới. Bản đang gửi vẫn giữ nguyên cho tới khi bạn gửi bản kế tiếp."),
      onError: (e) => toast.error(e instanceof Error ? e.message : "Lỗi mở phiên bản"),
    });
  };
  const todo = (label: string) => toast.info(`${label}: tính năng đang phát triển`);

  return (
    <div className="flex flex-col min-h-[calc(100vh-3rem)] bg-slate-50">
      <BaoGiaHeader
        row={draft}
        onSaveDraft={() => todo("Lưu nháp")}
        onExportPdf={handleExportPdf}
        onSendCustomer={openGuiModal}
      />
      <div className="flex-1 px-4 py-4">
        {isSent && (
          <div className="max-w-[1400px] mx-auto mb-3 flex items-center justify-between gap-2 rounded-md border border-violet-200 bg-violet-50 px-4 py-2">
            <span className="inline-flex items-center gap-1.5 text-xs text-violet-800">
              <Lock className="h-3.5 w-3.5" /> Bản {maPhienBan(baoGiaCode(draft), draft.so_phien_ban_cuoi ?? 1)} đã gửi — khoá vĩnh viễn, không sửa được.
            </span>
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={handleSoanBanMoi}>Soạn bản mới</Button>
          </div>
        )}
        {/* NGOÀI fieldset: chia sẻ cổng chỉ dùng được SAU khi đã gửi khách, mà
            lúc đó cả fieldset bị disabled → để bên trong là bấm không được. */}
        {!isGiaCuoi && (
          <div className="max-w-[1400px] mx-auto mb-3">
            <PortalShareSection draft={draft} />
          </div>
        )}
        <div className="max-w-[1400px] mx-auto mb-3">
          <PhienBanSection draft={draft} />
        </div>
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
              <div className="flex justify-end">
                <Button size="sm" variant="outline" className="h-8 gap-1.5 border-violet-300 text-violet-700 hover:bg-violet-50"
                  onClick={() => setAiOpen(true)}>
                  <Sparkles className="h-3.5 w-3.5" /> AI điền từ lịch trình
                </Button>
              </div>
              <ThongTinTourSection
                draft={draft}
                row={row}
                updateDraftField={updateDraftField}
                updateDraftKetQua={updateDraftKetQua}
                saveField={saveField}
                savePatch={savePatch}
                saveKetQua={saveKetQua}
              />
              <CostingSheetSection
                draft={draft}
                updateDraftKetQua={updateDraftKetQua}
                saveKetQua={saveKetQua}
                leadPax={leadPax}
              />
              <TaiwanExportSection
                draft={draft}
                updateDraftKetQua={updateDraftKetQua}
                saveKetQua={saveKetQua}
              />
              <LichTrinhFilesSection draft={draft} />
            </div>
            <TongHopChiPhiPanel draft={draft} />
          </div>
        )}
        </fieldset>
      </div>
      <BaoGiaAiImport
        open={aiOpen}
        onClose={() => setAiOpen(false)}
        draft={draft}
        row={row}
        updateDraftField={updateDraftField}
        saveField={saveField}
        savePatch={savePatch}
        saveKetQua={saveKetQua}
        savedReview={draft.ket_qua?.ai_review ?? null}
        onSaveDraft={(d) => {
          const ket = draft.ket_qua;
          if (!ket) return;
          saveKetQua({ ...ket, ai_review: d });
        }}
        onApply={(items, ten, soNgay) => {
          const ket = draft.ket_qua;
          if (!ket) return;
          saveKetQua({
            ...ket,
            ten_chuong_trinh: ten || ket.ten_chuong_trinh,
            so_ngay: soNgay || ket.so_ngay,
            items,
            ai_review: null, // đã áp dụng → bỏ bản nháp review
          });
          toast.success(`Đã nạp ${items.length} mục từ lịch trình. Kiểm tra giá & nhập bậc số khách.`);
        }}
      />
      <GuiPhienBanModal
        open={guiOpen}
        onClose={() => { setGuiOpen(false); setPhienBanMoi(null); }}
        soPhienBan={soPhienBanSapTao}
        maHienThi={maPhienBan(baoGiaCode(draft), soPhienBanSapTao)}
        phienBan={phienBanMoi}
        dangGui={taoPhienBan.isPending}
        onGui={handleGui}
      />
      <BaoGiaFooter
        onSaveDraft={() => todo("Lưu nháp")}
        onCreateBooking={() => todo("Tạo booking")}
        onExportPdf={handleExportPdf}
      />
    </div>
  );
}
