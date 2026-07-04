import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { Sparkles, Loader2, Check, AlertTriangle, HelpCircle, FileText, Upload, Save, Hotel, Utensils, Bus, Ticket } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { errMsg } from "@/lib/error";
import { useAuth } from "@/hooks/use-auth";
import {
  useExtractMatchItinerary, useUploadLichTrinhFile,
  type BaoGiaItem, type LichTrinhFile,
} from "@/hooks/use-bao-gia";
import { useBaoGiaResolveMaps } from "@/hooks/use-bao-gia-ai-maps";
import {
  resolveAiItems, toBaoGiaItems, aliasesToLearn,
  hotelChoiceGroups, defaultHotelSelection, applyHotelSelection,
  type ResolvedItem, type AiReviewDraft,
} from "@/lib/bao-gia-ai-resolve";
import { useBaoGiaAliasMap, useLearnAliases } from "@/hooks/use-bao-gia-aliases";
import { fileKind, imageMime, extractItineraryText } from "@/lib/itinerary-file";
import { resolveGiaPhongValue } from "@/lib/khach-san-gia-phong";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";

interface Props {
  open: boolean;
  onClose: () => void;
  baoGiaId: number;
  files: LichTrinhFile[];
  /** Ngày tour ('YYYY-MM-DD') để lấy giá KS theo mùa. */
  tourDate?: string | null;
  /** Tỷ giá để hiển thị đơn giá USD trong bảng review. Default 26000. */
  exchangeRate?: number | null;
  /** Bản nháp review đã lưu (ket_qua.ai_review) → mở lại tiếp tục. */
  savedReview?: AiReviewDraft | null;
  onApply: (items: BaoGiaItem[], tenChuongTrinh: string, soNgay: number) => void;
  /** Lưu nháp review (không áp dụng) → persist vào báo giá. */
  onSaveDraft: (draft: AiReviewDraft) => void;
}

// Nhóm review theo bố cục Excel (Xe → KS → Ăn → Vé). icon + nhãn.
const REVIEW_GROUPS: { key: ResolvedItem["loai"]; label: string; icon: React.ReactNode; tint: string }[] = [
  { key: "transport", label: "Xe / Vận chuyển", icon: <Bus className="h-3.5 w-3.5" />,      tint: "text-cyan-700 bg-cyan-50" },
  { key: "hotel",     label: "Khách sạn",        icon: <Hotel className="h-3.5 w-3.5" />,    tint: "text-indigo-700 bg-indigo-50" },
  { key: "meal",      label: "Ăn uống",          icon: <Utensils className="h-3.5 w-3.5" />, tint: "text-orange-700 bg-orange-50" },
  { key: "ticket",    label: "Vé / Dịch vụ",     icon: <Ticket className="h-3.5 w-3.5" />,   tint: "text-rose-700 bg-rose-50" },
];

const buaOrder = (b?: "trua" | "toi") => (b === "trua" ? 0 : b === "toi" ? 1 : 2);

// 1 lựa chọn danh mục cho picker (KS / cảnh điểm / set menu NH / loại xe).
interface CatalogOption { id: number; ten: string; gia?: number | null; nhaHangId?: number }

// Modal "AI điền từ lịch trình": ưu tiên đọc FILE lịch trình đính kèm (PDF/ảnh);
// không có file thì upload; vẫn cho dán text. AI trích xuất + khớp danh mục →
// review (sửa giá, chọn 1 KS/đêm) → áp dụng vào items báo giá.
export function BaoGiaAiImport({ open, onClose, baoGiaId, files, tourDate, exchangeRate, savedReview, onApply, onSaveDraft }: Props) {
  const xr = exchangeRate && exchangeRate > 0 ? exchangeRate : 26000;
  const [mode, setMode] = useState<"file" | "text">("file");
  const [selectedUrl, setSelectedUrl] = useState<string | null>(null);
  const [itinerary, setItinerary] = useState("");
  const [rows, setRows] = useState<ResolvedItem[] | null>(null);
  const [selection, setSelection] = useState<Record<number, number>>({});
  const [ten, setTen] = useState("");
  const [soNgay, setSoNgay] = useState(1);
  const [extracting, setExtracting] = useState(false); // đang trích text docx/xlsx
  const [runningProvider, setRunningProvider] = useState<"claude" | "keystone" | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const loadedRef = useRef(false); // đã nạp bản nháp lưu chưa (1 lần/lần mở)

  const { user } = useAuth();
  const extract = useExtractMatchItinerary();
  const upload = useUploadLichTrinhFile();
  const { data: maps, isLoading: mapsLoading } = useBaoGiaResolveMaps(open);
  const { data: aliasMap } = useBaoGiaAliasMap(open);
  const learn = useLearnAliases();

  useEffect(() => {
    if (!open) {
      setMode("file"); setSelectedUrl(null); setItinerary("");
      setRows(null); setSelection({}); setTen(""); setSoNgay(1); setExtracting(false);
      loadedRef.current = false;
      return;
    }
    // Mở lại có bản nháp đã lưu → nạp thẳng vào review (1 lần/lần mở).
    if (!loadedRef.current) {
      loadedRef.current = true;
      if (savedReview?.items?.length) {
        setRows(savedReview.items);
        setSelection(savedReview.selection ?? {});
        setTen(savedReview.ten ?? "");
        setSoNgay(savedReview.so_ngay && savedReview.so_ngay > 0 ? savedReview.so_ngay : 1);
      }
    }
  }, [open, savedReview]);

  // Auto-chọn file đọc được (PDF/ảnh/Word/Excel) đầu tiên khi danh sách đổi.
  useEffect(() => {
    if (!open) return;
    const firstSupported = files.find((f) => fileKind(f.ten) !== "other");
    setSelectedUrl((cur) => (cur && files.some((f) => f.url === cur) ? cur : firstSupported?.url ?? null));
  }, [open, files]);

  const groups = useMemo(() => (rows ? hotelChoiceGroups(rows) : new Map<number, number[]>()), [rows]);
  const included = useMemo(
    () => (rows ? applyHotelSelection(rows, groups, selection) : []),
    [rows, groups, selection],
  );

  const runExtract = async (input: { itinerary?: string; fileUrl?: string; fileType?: string; provider: "claude" | "keystone" }) => {
    if (!maps) { toast.warning("Đang tải danh mục, thử lại sau giây lát"); return; }
    setRunningProvider(input.provider);
    try {
      const result = await extract.mutateAsync(input);
      const resolved = resolveAiItems(result, maps, tourDate, aliasMap);
      setTen(result.ten_chuong_trinh ?? "");
      setSoNgay(result.so_ngay && result.so_ngay > 0 ? result.so_ngay : 1);
      setRows(resolved);
      setSelection(defaultHotelSelection(resolved, hotelChoiceGroups(resolved)));
    } catch (e: unknown) {
      toast.error(errMsg(e) || "Lỗi phân tích lịch trình");
    } finally {
      setRunningProvider(null);
    }
  };

  const handleAnalyze = async (prov: "claude" | "keystone") => {
    if (mode === "text") {
      if (!itinerary.trim()) { toast.warning("Dán lịch trình trước đã"); return; }
      runExtract({ itinerary, provider: prov });
      return;
    }
    const f = files.find((x) => x.url === selectedUrl);
    if (!f) { toast.warning("Chọn 1 file lịch trình"); return; }
    const kind = fileKind(f.ten);
    // PDF/ảnh → đọc file trực tiếp (edge fn gửi cho model). Word/Excel → trích text ở client.
    if (kind === "pdf") return runExtract({ fileUrl: f.url, fileType: "application/pdf", provider: prov });
    if (kind === "image") return runExtract({ fileUrl: f.url, fileType: imageMime(f.ten), provider: prov });
    if (kind === "docx" || kind === "xlsx") {
      try {
        setExtracting(true);
        setRunningProvider(prov);
        const buf = await (await fetch(f.url)).arrayBuffer();
        const text = await extractItineraryText(buf, kind);
        if (!text.trim()) { toast.warning("File rỗng / không đọc được nội dung"); return; }
        await runExtract({ itinerary: text, provider: prov });
      } catch (e: unknown) {
        toast.error(errMsg(e) || "Lỗi đọc file");
      } finally {
        setExtracting(false);
        setRunningProvider(null);
      }
      return;
    }
    toast.warning("File này chưa đọc được — chuyển sang dán text");
  };

  const handleUpload = async (file: File | null) => {
    if (!file) return;
    try {
      await upload.mutateAsync({ baoGiaId, file, current: files, uploadedBy: user?.user_id });
      toast.success("Đã tải file — chọn rồi Phân tích");
    } catch (e: unknown) {
      toast.error(errMsg(e) || "Lỗi tải file");
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  // Danh mục master cho picker đổi/chọn dịch vụ (mọi loại — giống KS).
  const sortByTen = (a: CatalogOption, b: CatalogOption) => a.ten.localeCompare(b.ten);
  const ksOptions = useMemo(
    () => (maps ? [...maps.khachSan.entries()].map(([id, v]) => ({ id, ten: v.ten })).sort(sortByTen) : []),
    [maps],
  );
  const canhDiemOptions = useMemo(
    () => (maps ? [...maps.canhDiem.entries()].map(([id, v]) => ({ id, ten: v.ten, gia: v.gia })).sort(sortByTen) : []),
    [maps],
  );
  const xeOptions = useMemo(
    () => (maps ? [...maps.xe.entries()].map(([id, v]) => ({ id, ten: v.ten, gia: v.gia })).sort(sortByTen) : []),
    [maps],
  );
  const setMenuOptions = useMemo(
    () => (maps ? [...maps.setMenu.entries()].map(([id, v]) => ({ id, ten: `${v.nhaHangTen} · ${v.ten}`, gia: v.gia, nhaHangId: v.nhaHangId })).sort(sortByTen) : []),
    [maps],
  );
  const optionsFor = (loai: ResolvedItem["loai"]): CatalogOption[] =>
    loai === "hotel" ? ksOptions : loai === "meal" ? setMenuOptions : loai === "transport" ? xeOptions : canhDiemOptions;

  const patchRow = (idx: number, patch: Partial<ResolvedItem>) =>
    setRows((rs) => rs ? rs.map((r, i) => (i === idx ? { ...r, ...patch } : r)) : rs);
  // Gõ tên tay → xoá ref danh mục (thành dòng chỉ-giá nhập tay).
  const clearRef = (idx: number, text: string) =>
    patchRow(idx, { mo_ta: text, match_table: null, match_id: null, match_set_menu_id: null, from_alias: false });
  // Chọn từ danh mục → fill tên + giá + ref (để học alias). KS lấy giá theo mùa.
  const pickCatalogForRow = (idx: number, loai: ResolvedItem["loai"], opt: CatalogOption) => {
    if (loai === "hotel") {
      const gia = resolveGiaPhongValue(maps?.khachSanGia.get(opt.id) ?? [], tourDate);
      patchRow(idx, {
        mo_ta: opt.ten, match_label: opt.ten,
        match_table: "khach_san", match_id: opt.id, match_set_menu_id: null, from_alias: false,
        ...(gia && gia > 0 ? { don_gia: gia, status: "matched" as const } : { status: "no_price" as const }),
      });
      return;
    }
    const patch: Partial<ResolvedItem> = { mo_ta: opt.ten, match_label: opt.ten, from_alias: false };
    if (loai === "meal") { patch.match_table = "nha_hang"; patch.match_id = opt.nhaHangId ?? null; patch.match_set_menu_id = opt.id; }
    else if (loai === "transport") { patch.match_table = "nha_xe_loai_xe"; patch.match_id = opt.id; patch.match_set_menu_id = null; }
    else { patch.match_table = "canh_diem"; patch.match_id = opt.id; patch.match_set_menu_id = null; }
    if (opt.gia != null && opt.gia > 0) { patch.don_gia = opt.gia; patch.status = "matched"; }
    else { patch.status = "no_price"; }
    patchRow(idx, patch);
  };
  // Đổi loại/nhóm dòng (Ăn trưa/tối, Vé, KS, Xe). Giữ tên + giá; xoá ref danh
  // mục (khác loại → ref cũ không còn đúng) → thành dòng tự nhập, chọn lại được.
  const loaiValue = (r: ResolvedItem): string =>
    r.loai === "meal" ? `meal:${r.bua_an ?? "trua"}` : r.loai;
  const changeLoai = (idx: number, value: string) => {
    if (!rows) return;
    const parsed = value.startsWith("meal:")
      ? { loai: "meal" as const, bua: value.split(":")[1] as "trua" | "toi" }
      : { loai: value as ResolvedItem["loai"], bua: undefined };
    const next = rows.map((r, i) => i === idx ? {
      ...r, loai: parsed.loai, bua_an: parsed.bua,
      match_table: null, match_id: null, match_set_menu_id: null, match_label: "", from_alias: false,
      status: (r.don_gia > 0 ? "matched" : "unmatched") as ResolvedItem["status"],
    } : r);
    setRows(next);
    setSelection(defaultHotelSelection(next, hotelChoiceGroups(next)));
  };

  const setGia = (idx: number, gia: number) =>
    setRows((rs) => rs ? rs.map((r, i) => (i === idx ? { ...r, don_gia: gia } : r)) : rs);
  // FOC override (số miễn). undefined → auto theo chính sách NH (foc_khach/foc_mien).
  const setFoc = (idx: number, foc: number | undefined) =>
    setRows((rs) => rs ? rs.map((r, i) => (i === idx ? { ...r, foc } : r)) : rs);
  const removeRow = (idx: number) =>
    setRows((rs) => {
      if (!rs) return rs;
      const next = rs.filter((_, i) => i !== idx);
      setSelection(defaultHotelSelection(next, hotelChoiceGroups(next)));
      return next;
    });

  const handleApply = () => {
    if (included.length === 0) return;
    onApply(toBaoGiaItems(included), ten, soNgay);
    // Học bộ nhớ khớp từ các dòng đã áp dụng (fire-and-forget) → lần sau tự khớp.
    const toLearn = aliasesToLearn(included, user?.user_id);
    if (toLearn.length) learn.mutate(toLearn);
    onClose();
  };

  const handleSaveDraft = () => {
    if (!rows) return;
    onSaveDraft({ items: rows, selection, ten, so_ngay: soNgay, saved_at: new Date().toISOString() });
    toast.success("Đã lưu nháp — lần sau mở lại tiếp tục được");
  };

  const matched = included.filter((r) => r.don_gia > 0).length;
  const missing = included.filter((r) => r.don_gia <= 0).length;
  const busy = extract.isPending || mapsLoading || extracting;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-4xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-violet-600" /> AI điền từ lịch trình
          </DialogTitle>
          <DialogDescription>
            AI đọc file lịch trình (PDF/ảnh) hoặc text, lọc hạng mục mất tiền + khớp danh mục; giá lấy từ hệ thống.
            Kiểm tra & điền giá còn thiếu, chọn 1 khách sạn cho đêm có nhiều phương án.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-auto">
        {!rows ? (
          <div className="space-y-3">
            {mode === "file" ? (
              <>
                {files.length > 0 ? (
                  <div className="space-y-1.5">
                    <p className="text-xs font-medium text-slate-600">Chọn file lịch trình:</p>
                    <div className="rounded-md border divide-y">
                      {files.map((f) => {
                        const k = fileKind(f.ten);
                        const sup = k !== "other";
                        return (
                          <label key={f.url} className={`flex items-center gap-2 px-3 py-2 text-xs cursor-pointer ${sup ? "hover:bg-muted/40" : "opacity-60"}`}>
                            <input
                              type="radio" name="lt-file" disabled={!sup}
                              checked={selectedUrl === f.url}
                              onChange={() => setSelectedUrl(f.url)}
                            />
                            <FileText className="h-4 w-4 text-blue-600 shrink-0" />
                            <span className="flex-1 min-w-0 truncate">{f.ten}</span>
                            {(k === "docx" || k === "xlsx") && <span className="text-[10px] text-slate-400">đọc qua text</span>}
                            {!sup && <span className="text-[10px] text-amber-600">chưa đọc được — dán text</span>}
                          </label>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  <div className="rounded-md border border-dashed p-5 text-center">
                    <FileText className="h-6 w-6 mx-auto text-slate-300 mb-1" />
                    <p className="text-xs text-muted-foreground mb-2">Chưa có file lịch trình đính kèm.</p>
                    <Button size="sm" variant="outline" className="h-8 text-xs gap-1" onClick={() => fileInputRef.current?.click()} disabled={upload.isPending}>
                      {upload.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />} Tải file lên
                    </Button>
                  </div>
                )}
                <div className="flex items-center justify-between">
                  {files.length > 0 ? (
                    <Button size="sm" variant="ghost" className="h-7 text-xs gap-1 text-muted-foreground" onClick={() => fileInputRef.current?.click()} disabled={upload.isPending}>
                      {upload.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Upload className="h-3 w-3" />} Tải thêm file
                    </Button>
                  ) : <span />}
                  <button type="button" className="text-[11px] text-primary hover:underline" onClick={() => setMode("text")}>
                    hoặc dán nội dung text →
                  </button>
                </div>
                <input ref={fileInputRef} type="file" className="hidden" onChange={(e) => handleUpload(e.target.files?.[0] ?? null)} />
              </>
            ) : (
              <>
                <Textarea
                  value={itinerary}
                  onChange={(e) => setItinerary(e.target.value)}
                  placeholder="Dán nội dung chương trình tour ở đây..."
                  className="min-h-[240px] text-sm"
                  autoFocus
                />
                <button type="button" className="text-[11px] text-primary hover:underline" onClick={() => setMode("file")}>
                  ← dùng file đính kèm
                </button>
              </>
            )}
            <p className="text-[11px] text-muted-foreground">
              {mapsLoading ? "Đang tải danh mục..." : "AI chỉ chọn dòng danh mục + lấy giá thật; không tự bịa giá. Đọc trực tiếp PDF/ảnh."}
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            <div className="flex items-center gap-3 text-xs">
              <span className="font-medium">{ten || "(chưa có tên)"}</span>
              <span className="text-muted-foreground">{soNgay} ngày · {included.length} mục</span>
              <span className="text-emerald-700 inline-flex items-center gap-1"><Check className="h-3 w-3" />{matched} có giá</span>
              {missing > 0 && <span className="text-amber-700 inline-flex items-center gap-1"><AlertTriangle className="h-3 w-3" />{missing} cần điền giá</span>}
            </div>
            <div className="rounded-md border overflow-hidden">
              <table className="w-full text-xs border-collapse">
                <thead className="bg-[#E6F1FB] sticky top-0 z-10">
                  <tr>
                    <th className="py-1.5 px-2 text-center font-semibold w-[48px]">Ngày</th>
                    <th className="py-1.5 px-2 text-left font-semibold">Hạng mục (VI / 中文)</th>
                    <th className="py-1.5 px-2 text-left font-semibold">Khớp danh mục</th>
                    <th className="py-1.5 px-2 text-right font-semibold w-[84px]">ĐG USD</th>
                    <th className="py-1.5 px-2 text-right font-semibold w-[120px]">ĐG VND</th>
                    <th className="py-1.5 px-2 text-center font-semibold w-[64px]" title="FOC: số suất/phòng miễn (NH tự tính theo chính sách)">FOC</th>
                    <th className="w-[32px]" />
                  </tr>
                </thead>
                <tbody>
                  {REVIEW_GROUPS.map((g) => {
                    const list = rows
                      .map((r, idx) => ({ r, idx }))
                      .filter(({ r }) => r.loai === g.key)
                      .sort((a, b) => (a.r.ngay_so - b.r.ngay_so) || (buaOrder(a.r.bua_an) - buaOrder(b.r.bua_an)));
                    if (list.length === 0) return null;
                    return (
                      <Fragment key={g.key}>
                        <tr>
                          <td colSpan={7} className="bg-slate-100/70 px-2 py-1">
                            <span className={`inline-flex items-center gap-1.5 rounded px-2 py-0.5 text-[11px] font-semibold ${g.tint}`}>
                              {g.icon} {g.label}
                            </span>
                          </td>
                        </tr>
                        {list.map(({ r, idx }) => {
                          const isAltHotel = r.loai === "hotel" && groups.has(r.ngay_so);
                          const chosen = !isAltHotel || selection[r.ngay_so] === idx;
                          const ok = r.don_gia > 0;
                          return (
                            <tr key={idx} className={`border-t border-slate-100 ${!chosen ? "opacity-50" : ok ? "" : "bg-amber-50/50"}`}>
                              <td className="py-1 px-2 text-center text-slate-500 align-top">
                                {r.ngay_so}
                                {r.bua_an && <span className="block text-[9px] text-slate-400">{r.bua_an === "trua" ? "trưa" : "tối"}</span>}
                              </td>
                              <td className="py-1 px-2">
                                <div className="flex items-center gap-1.5">
                                  {isAltHotel && (
                                    <input type="radio" name={`ks-${r.ngay_so}`} checked={chosen}
                                      onChange={() => setSelection((s) => ({ ...s, [r.ngay_so]: idx }))}
                                      title="Chọn khách sạn này cho đêm" className="shrink-0" />
                                  )}
                                  <span className="min-w-0 flex-1">
                                    <span className="flex items-center gap-1">
                                      <CatalogPicker
                                        value={r.mo_ta}
                                        options={optionsFor(r.loai)}
                                        onType={(t) => clearRef(idx, t)}
                                        onPick={(opt) => pickCatalogForRow(idx, r.loai, opt)}
                                      />
                                      {isAltHotel && <span className="text-[9px] text-violet-600 shrink-0">PA</span>}
                                    </span>
                                    {r.ten_zh && r.ten_zh !== r.mo_ta && <span className="block text-[10px] text-slate-400 truncate max-w-[240px] px-1">{r.ten_zh}</span>}
                                    <select
                                      value={loaiValue(r)}
                                      onChange={(e) => changeLoai(idx, e.target.value)}
                                      title="Đổi loại/nhóm dòng này"
                                      className="mt-0.5 ml-1 text-[10px] text-slate-500 bg-transparent border border-slate-200 rounded px-1 py-0.5 outline-none focus:border-blue-300 cursor-pointer"
                                    >
                                      <option value="meal:trua">🍴 Ăn trưa</option>
                                      <option value="meal:toi">🍴 Ăn tối</option>
                                      <option value="ticket">🎫 Vé / Dịch vụ</option>
                                      <option value="hotel">🏨 Khách sạn</option>
                                      <option value="transport">🚗 Xe</option>
                                    </select>
                                  </span>
                                </div>
                              </td>
                              <td className="py-1 px-2">
                                {r.status === "unmatched" ? (
                                  <span className="inline-flex items-center gap-1 text-amber-700"><HelpCircle className="h-3 w-3" />Chưa khớp</span>
                                ) : (
                                  <span className={`inline-flex items-center gap-1 ${r.from_alias ? "text-violet-700" : ""}`}>
                                    <span className={`truncate max-w-[150px] ${r.match_label ? "" : "text-slate-400 italic"}`}
                                      title={r.from_alias ? "Tự điền từ bộ nhớ đã học — sửa lại được" : (r.match_label || "Tự nhập (không khớp danh mục)")}>
                                      {r.match_label || "(tự nhập)"}
                                    </span>
                                    {r.from_alias && <span className="text-[9px] text-violet-500" title="Bộ nhớ đã học">đã nhớ</span>}
                                    {!r.from_alias && r.confidence > 0 && r.confidence < 0.6 && (
                                      <span className="text-[9px] text-amber-600" title="Độ tin cậy thấp — kiểm tra lại">⚠</span>
                                    )}
                                  </span>
                                )}
                              </td>
                              <td className="py-1 px-2 text-right text-slate-500 tabular-nums">
                                {r.don_gia > 0 ? (r.don_gia / xr).toFixed(2) : "—"}
                              </td>
                              <td className="py-1 px-2">
                                <Input
                                  type="text" inputMode="numeric"
                                  value={r.don_gia > 0 ? r.don_gia.toLocaleString("vi-VN") : ""}
                                  onChange={(e) => setGia(idx, parseInt(e.target.value.replace(/[^0-9]/g, ""), 10) || 0)}
                                  placeholder="0"
                                  className={`h-7 text-xs text-right ${chosen && !ok ? "border-amber-400" : ""}`}
                                />
                              </td>
                              <td className="py-1 px-1 text-center">
                                {r.loai === "transport" ? (
                                  <span className="text-slate-300">—</span>
                                ) : (
                                  <input
                                    type="number" min={0} step={0.5}
                                    value={r.foc ?? ""}
                                    placeholder={r.foc_khach ? `${r.foc_khach}免${r.foc_mien ?? 0}` : "0"}
                                    title={r.foc_khach
                                      ? `Tự tính ${r.foc_khach} miễn ${r.foc_mien ?? 0} mỗi cỡ đoàn — nhập số để ghi đè`
                                      : "Số suất/phòng miễn (để trống = 0)"}
                                    onChange={(e) => {
                                      const s = e.target.value.trim();
                                      if (s === "") return setFoc(idx, undefined);
                                      const v = parseFloat(s);
                                      setFoc(idx, !isNaN(v) && v >= 0 ? v : 0);
                                    }}
                                    className="h-7 w-14 text-xs text-center border rounded [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                  />
                                )}
                              </td>
                              <td className="py-1 px-1 text-center">
                                <button type="button" onClick={() => removeRow(idx)} className="text-slate-400 hover:text-red-500" title="Bỏ mục này">×</button>
                              </td>
                            </tr>
                          );
                        })}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="text-[11px] text-muted-foreground">
              <b>PA</b> = phương án khách sạn (đêm có nhiều lựa chọn) → chọn 1, chỉ KS được chọn vào báo giá.
              Mục nền cam = chưa có giá → điền tay. <span className="text-violet-700">“đã nhớ”</span> = tự điền từ bộ nhớ đã học (sửa lại được).
              Khi bấm <b>Áp dụng</b>, hệ thống ghi nhớ khớp + giá để lần sau tự điền. Sau đó nhập bậc số khách để ra giá tour.
            </p>
          </div>
        )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Hủy</Button>
          {!rows ? (
            <>
              <Button onClick={() => handleAnalyze("claude")} disabled={busy || (mode === "file" && !selectedUrl)}>
                {runningProvider === "claude" ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Sparkles className="h-4 w-4 mr-1.5" />}
                Phân tích · Claude
              </Button>
              <Button variant="secondary" onClick={() => handleAnalyze("keystone")} disabled={busy || (mode === "file" && !selectedUrl)}>
                {runningProvider === "keystone" ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Sparkles className="h-4 w-4 mr-1.5" />}
                Phân tích · Keystone
              </Button>
            </>
          ) : (
            <>
              <Button variant="ghost" onClick={() => { setRows(null); setSelection({}); }}>← Quay lại</Button>
              <Button variant="outline" className="gap-1.5" onClick={handleSaveDraft}>
                <Save className="h-3.5 w-3.5" /> Lưu nháp
              </Button>
              <Button onClick={handleApply} disabled={included.length === 0}>Áp dụng {included.length} mục</Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Picker đổi/chọn dịch vụ trong review (mọi loại): gõ tự do (tên tự nhập + giá
// tay) HOẶC chọn từ danh mục master (tự điền giá). Quote được dịch vụ không có
// trong chương trình gốc.
function CatalogPicker({ value, options, onType, onPick }: {
  value: string;
  options: CatalogOption[];
  onType: (text: string) => void;
  onPick: (opt: CatalogOption) => void;
}) {
  const [open, setOpen] = useState(false);
  const suggestions = useMemo(() => {
    const q = value.toLowerCase().trim();
    const pool = q ? options.filter((o) => o.ten.toLowerCase().includes(q)) : options;
    return pool.slice(0, 40);
  }, [options, value]);

  return (
    <Popover open={open && suggestions.length > 0} onOpenChange={setOpen}>
      <PopoverAnchor asChild>
        <input
          value={value}
          onChange={(e) => { onType(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          placeholder="Chọn danh mục / gõ tay"
          className="w-full max-w-[220px] bg-transparent text-xs font-medium text-slate-700 outline-none rounded px-1 py-0.5 border border-transparent hover:border-slate-200 focus:border-blue-300 focus:bg-blue-50/40"
        />
      </PopoverAnchor>
      <PopoverContent
        align="start" sideOffset={4}
        className="w-[280px] p-0 max-h-[240px] overflow-y-auto"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        {suggestions.map((o) => (
          <button
            key={o.id}
            type="button"
            onMouseDown={(e) => { e.preventDefault(); onPick(o); setOpen(false); }}
            className="w-full flex items-center justify-between gap-2 px-2.5 py-1.5 text-xs text-left hover:bg-slate-50"
          >
            <span className="truncate flex-1">{o.ten}</span>
            {o.gia != null && o.gia > 0 && (
              <span className="shrink-0 text-[10px] tabular-nums text-slate-500">{o.gia.toLocaleString("vi-VN")} ₫</span>
            )}
          </button>
        ))}
      </PopoverContent>
    </Popover>
  );
}
