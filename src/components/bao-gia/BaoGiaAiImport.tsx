import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { Sparkles, Loader2, Check, AlertTriangle, HelpCircle, FileText, Upload, Save, Hotel, Utensils, Bus, Ticket, Plus, X } from "lucide-react";
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
  type BaoGiaItem, type BaoGiaKetQua, type BaoGiaRow,
} from "@/hooks/use-bao-gia";
import { aiPreviewSheet, fmtVnd, fmtUsd, tierGuestsOf } from "@/components/bao-gia/detail/helpers";
import { VehicleSelector } from "@/components/bao-gia/detail/VehicleSelector";
import { useBaoGiaResolveMaps, useMarkCanhDiemCombo, useWriteGiaPhongFromBaoGia } from "@/hooks/use-bao-gia-ai-maps";
import { useSoTay, useHocSoTay } from "@/hooks/use-bao-gia-so-tay";
import {
  apSoTay, banDoSoTay, locDongDeHoc, dongDeHocKhiLuuNhap, LOAI_SO_TAY,
  type LoaiSoTay,
} from "@/lib/bao-gia-so-tay";
import { useIsReadOnly } from "@/hooks/use-permissions";
import {
  resolveAiItems, toBaoGiaItems, aliasesToLearn, giaPhongWritebacks, dongChuaChac, usdBudgetPrice,
  applyKsBuaRules, toKsBuaRules,
  hotelChoiceGroups, defaultHotelSelection, applyExclusions, droppedByHotel,
  analyzeCombo, comboPatchForRef, sanitizeDraftRows, newResolvedItem, BUA_LABEL,
  type ResolvedItem, type AiReviewDraft, type BaoGomBuaAn, type KsBuaRule,
} from "@/lib/bao-gia-ai-resolve";
import { useBaoGiaAliasMap, useLearnAliases } from "@/hooks/use-bao-gia-aliases";
import { useBaoGiaRuleList } from "@/hooks/use-bao-gia-rules";
import { BaoGiaRuleChatPanel } from "@/components/bao-gia/BaoGiaRuleChat";
import { AddServiceRow } from "@/components/bao-gia/AddServiceRow";
import { fileKind, imageMime, extractItineraryText, unsupportedFileInfo } from "@/lib/itinerary-file";
import { useFileDrop } from "@/hooks/use-file-drop";
import { resolveGiaPhongValue } from "@/lib/khach-san-gia-phong";
import { Popover, PopoverAnchor, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { resolveStorageUrl } from "@/lib/storage-url";
import { TY_GIA_BAO_GIA_MAC_DINH, tyGiaCuaBaoGia } from "@/lib/bao-gia-ty-gia";
import { apGiaTauHaLong } from "@/lib/bao-gia-tau-ha-long";

/** Quy đổi mức USD đối tác ghi → tiền Việt, cho sổ tay dùng khi bên mình chưa
 *  chốt giá nào. Dòng chi phí báo giá có thêm loại "dich_vu" mà sổ tay không
 *  biết — tính như vé (cùng công thức, không cộng phụ trội bữa ăn). */
const quyDoiUsdSoTay = (usd: number, loai: LoaiSoTay) =>
  usdBudgetPrice(usd, loai === "dich_vu" ? "ticket" : loai);

/** Dòng người nhập đã tự tay sửa → sổ tay KHÔNG được đè lại. */
const giuNguyenDongSuaTay = (r: ResolvedItem) => !!r.sua_tay;

interface Props {
  open: boolean;
  onClose: () => void;
  /** Draft báo giá (live) — nguồn file/tỷ giá + xe_gia/phu_thu/profit/tier_guests
   *  cho phần tính tiền xem trước ngay trong màn review. */
  draft: BaoGiaRow;
  /** Committed state (DB) — so sánh trước save tránh dirty save. */
  row: BaoGiaRow;
  updateDraftField: <K extends keyof BaoGiaRow>(field: K, value: BaoGiaRow[K]) => void;
  saveField: <K extends keyof BaoGiaRow>(field: K, value: BaoGiaRow[K]) => void;
  savePatch: (patch: Partial<BaoGiaRow>) => void;
  saveKetQua: (next: BaoGiaKetQua) => void;
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

// Modal "AI điền từ lịch trình": ưu tiên đọc FILE lịch trình đính kèm (PDF/ảnh);
// không có file thì upload; vẫn cho dán text. AI trích xuất + khớp danh mục →
// review (sửa giá, chọn 1 KS/đêm, điền xe/phụ thu, xem giá sống) → áp dụng.
export function BaoGiaAiImport({
  open, onClose, draft, row, updateDraftField, saveField, savePatch, saveKetQua,
  savedReview, onApply, onSaveDraft,
}: Props) {
  const baoGiaId = draft.id;
  const tourDate = draft.ngay_di;
  const files = useMemo(() => draft.lich_trinh_files ?? [], [draft.lich_trinh_files]);
  const xr = tyGiaCuaBaoGia(draft.exchange_rate);
  const [mode, setMode] = useState<"file" | "text">("file");
  const [selectedUrl, setSelectedUrl] = useState<string | null>(null);
  const [itinerary, setItinerary] = useState("");
  // ── Sổ tay báo giá ──
  // Bộ nhớ tiếng Trung ↔ tiếng Việt ↔ giá VỐN, dựng từ chính thao tác của người
  // nhập. Đây là nguồn giá được ưu tiên: nó phản ánh thứ công ty THỰC SỰ chào,
  // khác với danh mục vận hành vốn dựng ra để điều đoàn.
  const { data: soTay = [], isFetched: soTayDaNap } = useSoTay(open);
  const hocSoTay = useHocSoTay();
  const banDo = useMemo(() => banDoSoTay(soTay), [soTay]);

  const [rows, setRows] = useState<ResolvedItem[] | null>(null);
  const [selection, setSelection] = useState<Record<number, number>>({});
  const [ten, setTen] = useState("");
  const [soNgay, setSoNgay] = useState(1);
  const [extracting, setExtracting] = useState(false); // đang trích text docx/xlsx
  const [runningProvider, setRunningProvider] = useState<"claude" | "keystone" | null>(null);
  const [newTier, setNewTier] = useState(""); // ô "thêm cỡ đoàn" ở phần tính tiền
  const fileInputRef = useRef<HTMLInputElement>(null);
  const loadedRef = useRef(false); // đã nạp bản nháp lưu chưa (1 lần/lần mở)

  const { user } = useAuth();
  const readOnly = useIsReadOnly();
  const extract = useExtractMatchItinerary();
  const markCombo = useMarkCanhDiemCombo();
  const writeGiaPhong = useWriteGiaPhongFromBaoGia();
  const upload = useUploadLichTrinhFile();
  const { data: maps, isLoading: mapsLoading, isFetched: mapsDaNap } = useBaoGiaResolveMaps(open);
  const { data: aliasMap } = useBaoGiaAliasMap(open);
  const { data: ruleRows } = useBaoGiaRuleList(open);
  const learn = useLearnAliases();

  useEffect(() => {
    if (!open) {
      setMode("file"); setSelectedUrl(null); setItinerary("");
      setRows(null); setSelection({}); setTen(""); setSoNgay(1); setExtracting(false);
      loadedRef.current = false;
      return;
    }
    // Mở lại có bản nháp đã lưu → nạp vào review (1 lần/lần mở).
    //
    // CHỜ sổ tay nạp xong rồi mới nạp nháp, và TRA LẠI SỔ TAY trên dòng nháp:
    // bản nháp là ảnh chụp giá của lần trước, trong khi giữa hai lần mở người
    // nhập có thể đã dạy sổ tay giá đúng (ở báo giá khác). Nạp nguyên si = mở
    // nháp ra vẫn thấy con số cũ đã biết là sai, tưởng sổ tay không nhớ gì.
    // Dòng đã sửa tay thì giữ nguyên — thứ người vừa gõ đáng tin nhất.
    //
    // `soTayDaNap` là "đã cố nạp xong", kể cả khi hỏng: sổ tay lỗi mạng không
    // được phép khoá luôn bản nháp của người ta.
    if (!loadedRef.current && soTayDaNap && mapsDaNap) {
      loadedRef.current = true;
      if (savedReview?.items?.length) {
        const daSoTay = apSoTay(
          sanitizeDraftRows(savedReview.items),
          banDo, quyDoiUsdSoTay, giuNguyenDongSuaTay,
        );
        setRows(maps ? apGiaTauHaLong(daSoTay, maps, tourDate) : daSoTay);
        setSelection(savedReview.selection ?? {});
        setTen(savedReview.ten ?? "");
        setSoNgay(savedReview.so_ngay && savedReview.so_ngay > 0 ? savedReview.so_ngay : 1);
      }
    }
  }, [open, savedReview, soTayDaNap, banDo, mapsDaNap, maps, tourDate]);

  // Auto-chọn file đọc được (PDF/ảnh/Word/Excel) đầu tiên khi danh sách đổi.
  useEffect(() => {
    if (!open) return;
    const firstSupported = files.find((f) => fileKind(f.ten) !== "other");
    setSelectedUrl((cur) => (cur && files.some((f) => f.url === cur) ? cur : firstSupported?.url ?? null));
  }, [open, files]);

  const groups = useMemo(() => (rows ? hotelChoiceGroups(rows) : new Map<number, number[]>()), [rows]);
  // Phương án KS không được chọn → không vào báo giá, nên cũng không được đóng vai
  // combo trừ bữa ăn (xem analyzeCombo). Phụ thuộc selection → combo tính lại khi
  // OP đổi phương án.
  const droppedHotels = useMemo(() => droppedByHotel(groups, selection), [groups, selection]);
  // Combo (vé đã gồm bữa ăn): dòng ăn tương ứng bị ẩn khỏi báo giá, dòng vé đáng
  // ngờ thì chỉ cảnh báo. Tính lại mỗi lần rows đổi → không có trạng thái kẹt.
  const combo = useMemo(() => analyzeCombo(rows ?? [], droppedHotels), [rows, droppedHotels]);
  const included = useMemo(
    () => (rows ? applyExclusions(rows, groups, selection, combo) : []),
    [rows, groups, selection, combo],
  );
  // Dòng máy ĐOÁN KHÔNG CHẮC mà vẫn ra một con số trông như thật — loại sai khó
  // thấy nhất. Trước đây chỉ có một dấu ⚠ nhỏ xíu cuối ô tên; giờ đếm lên đầu màn
  // và chặn nút Áp dụng cho tới khi người nhập xác nhận đã xem.
  const chuaChac = useMemo(() => dongChuaChac(included), [included]);
  // Xác nhận phải HẾT HẠN khi danh sách đổi: đã xem bản cũ không có nghĩa là đã
  // xem bản mới. Ký theo nội dung chứ không theo số lượng — sửa một dòng thành
  // dòng khác mà số lượng giữ nguyên thì vẫn phải xem lại.
  const chuKyChuaChac = chuaChac.map((r) => `${r.ngay_so}|${r.ten_zh}|${r.match_label}`).join("~");
  const [daXemChuaChac, setDaXemChuaChac] = useState("");
  const canXacNhan = chuaChac.length > 0 && daXemChuaChac !== chuKyChuaChac;

  // Dòng ăn đang bị nghi tính trùng (để gắn nhãn ngay trên chính dòng ăn đó).
  const warnedMeals = useMemo(() => {
    const s = new Set<number>();
    for (const w of combo.warnings.values()) for (const mi of w.mealIdxs) s.add(mi);
    return s;
  }, [combo]);
  // Các dòng combo THỰC SỰ đã trừ được 1 bữa → chỉ những dòng này mới được ghi
  // chú "Đã gồm ăn trưa" khi xuất báo giá.
  const daTruCombo = useMemo(() => {
    const s = new Set<ResolvedItem>();
    if (rows) for (const sup of combo.suppressed.values()) s.add(rows[sup.byIdx]);
    return s;
  }, [rows, combo]);
  // Ngày có dòng ăn tính tiền riêng → dòng vé của ngày đó mới cần hỏi "có kèm ăn?".
  const daysWithMeal = useMemo(() => {
    const s = new Set<number>();
    for (const r of rows ?? []) if (r.loai === "meal") s.add(r.ngay_so);
    return s;
  }, [rows]);

  // ── Tính tiền XEM TRƯỚC ngay trong review ──
  // Chạy CHÍNH costingSheet trên items đang review (qua aiPreviewSheet) → giá
  // hiển thị ở đây khớp 100% bảng chi phí sau khi bấm Áp dụng, không lệch công thức.
  const previewItems = useMemo(() => toBaoGiaItems(included, daTruCombo), [included, daTruCombo]);
  const previewSheet = useMemo(
    () => (rows ? aiPreviewSheet(draft, previewItems, soNgay) : null),
    [rows, draft, previewItems, soNgay],
  );
  const tierGuests = tierGuestsOf(draft.ket_qua);
  const setTierGuests = (next: number[]) => {
    const ket = draft.ket_qua;
    if (!ket) return;
    const cleaned = [...new Set(next.filter((n) => n > 0).map((n) => Math.round(n)))].sort((a, b) => a - b);
    saveKetQua({ ...ket, tier_guests: cleaned.length ? cleaned : [16, 20] });
  };
  const addTier = () => {
    const n = Number(newTier);
    if (!n || n <= 0) return;
    setTierGuests([...tierGuests, n]);
    setNewTier("");
  };

  const runExtract = async (input: { itinerary?: string; fileUrl?: string; fileType?: string; provider: "claude" | "keystone" }) => {
    if (!maps) { toast.warning("Đang tải danh mục, thử lại sau giây lát"); return; }
    setRunningProvider(input.provider);
    try {
      const result = await extract.mutateAsync(input);
      // Quy tắc đã dạy qua chat (vd KS giá kèm ăn tối) áp NGAY sau resolve —
      // chỉ lần phân tích này, không re-apply lên nháp/rows user đã sửa.
      // Sổ tay chạy SAU cùng và ĐÈ LÊN kết quả khớp danh mục: giá người mình
      // từng gõ đáng tin hơn giá suy ra từ kho vận hành. Dòng nào sổ tay chưa
      // biết thì giữ nguyên thứ đang có (có thể AI khớp được), chứ không xoá.
      const resolved = apSoTay(
        applyKsBuaRules(
          resolveAiItems(result, maps, tourDate, aliasMap),
          toKsBuaRules(ruleRows),
        ),
        banDo,
        quyDoiUsdSoTay,
        giuNguyenDongSuaTay,
      );
      // Luật tàu Hạ Long chạy SAU sổ tay: dòng ăn ghi chung chung ("船上自助餐")
      // được sổ tay điền giá con tàu nào đó từng gõ, nhưng tên tàu THẬT nằm ở
      // dòng vé cùng ngày — bằng chứng của chính đoàn này thắng trí nhớ chung.
      const daApTau = apGiaTauHaLong(resolved, maps, tourDate);
      setTen(result.ten_chuong_trinh ?? "");
      setSoNgay(result.so_ngay && result.so_ngay > 0 ? result.so_ngay : 1);
      setRows(daApTau);
      setSelection(defaultHotelSelection(daApTau, hotelChoiceGroups(daApTau)));
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
        // Bucket lịch trình là bucket riêng tư → ký link tạm rồi mới đọc được.
        const buf = await (await fetch(await resolveStorageUrl(f.url))).arrayBuffer();
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
    toast.warning(unsupportedFileInfo(f.ten)?.help ?? "File này chưa đọc được — chuyển sang dán text");
  };

  const handleUpload = async (picked: File[]) => {
    if (!picked.length) return;
    // Báo NGAY lúc tải, không để user phát hiện sau khi file đã nằm im lìm mờ
    // trong danh sách (ca .doc: tải lại 3 lần vẫn không bấm chọn được).
    const unreadable = picked.filter((f) => unsupportedFileInfo(f.name));
    for (const f of unreadable) {
      toast.warning(`${f.name} — ${unsupportedFileInfo(f.name)!.help}`, { duration: 10000 });
    }
    try {
      const next = await upload.mutateAsync({ baoGiaId, files: picked, current: files, uploadedBy: user?.user_id });
      // Chọn sẵn file vừa tải mà đọc được → bấm Phân tích luôn, khỏi đi tìm.
      const justAdded = next.slice(files.length);
      const firstOk = justAdded.find((f) => fileKind(f.ten) !== "other");
      if (firstOk) setSelectedUrl(firstOk.url);
      toast.success(firstOk
        ? "Đã tải file — chọn rồi Phân tích"
        : "Đã tải file (định dạng này AI chưa đọc được)");
    } catch (e: unknown) {
      toast.error(errMsg(e) || "Lỗi tải file");
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const { dragging, dropProps } = useFileDrop(handleUpload, upload.isPending);

  // Danh mục master cho picker đổi/chọn dịch vụ (mọi loại — giống KS).

  /** Nhãn nhỏ cho biết GIÁ trên dòng này ở đâu ra — người nhập cần phân biệt
   *  "sổ tay đã nhớ" với "máy đoán" với "chưa ai điền". Kèm nhãn LỆCH khi bên
   *  mình tính khác mức tiền đối tác ghi trong lịch trình. */
  const nhanNguon = (r: ResolvedItem) => {
    // Dòng ăn đã lấy giá theo tàu thì NHÃN TÀU chính là nguồn giá — thêm nhãn
    // "máy đoán" bên cạnh chỉ làm người nhập không biết tin cái nào.
    const t = r.tau_ha_long;
    const nguonLaTau = !!t?.ten && !t.thieu_gia && !r.sua_tay;
    const chinh = <>{nguonLaTau ? null : nhanNguonChinh(r)}{nhanTau(r)}</>;
    const lech = r.gia_dong_ghi != null && r.don_gia > 0 && r.gia_dong_ghi !== r.don_gia;
    if (!lech) return chinh;
    return (
      <span className="inline-flex items-center gap-1">
        {chinh}
        <span
          className="text-[9px] text-amber-700 border border-amber-300 rounded px-1"
          title={`Đối tác ghi mức ${fmtVnd(r.gia_dong_ghi ?? 0)} trong lịch trình, bên mình đang tính ${fmtVnd(r.don_gia)} theo giá của mình. Muốn theo đối tác thì sửa ô ĐG VND.`}
        >
          ≠ đối tác ghi {fmtVnd(r.gia_dong_ghi ?? 0)}
        </span>
      </span>
    );
  };

  /** Nhãn TÀU HẠ LONG: nói thẳng giá bữa ăn đang theo con tàu nào. Chỗ sai đắt
   *  nhất ở đây là im lặng dùng tàu mặc định — nên ca đó phải là nhãn cam. */
  const nhanTau = (r: ResolvedItem) => {
    const t = r.tau_ha_long;
    if (r.ve_vinh_da_gom) {
      return (
        <span className="ml-1 text-[9px] text-emerald-700 border border-emerald-300 rounded px-1"
          title="Vé vịnh đã nằm trong giá bữa ăn trên tàu cùng ngày — để 0 cho khỏi tính tiền hai lần.">
          đã gồm ở bữa trên tàu
        </span>
      );
    }
    if (!t) return null;
    if (t.thieu_gia || !t.ten) {
      return (
        <span className="ml-1 text-[9px] text-orange-600 border border-orange-300 rounded px-1"
          title={t.ten
            ? `Đọc ra tàu "${t.ten}" nhưng danh mục chưa có giá set cho bữa này — gõ giá vào ô ĐG VND.`
            : "Cả ngày không dòng nào nêu tên tàu — giá đang lấy theo tàu mặc định. Kiểm lại đoàn đi tàu nào."}>
          {t.ten ? `tàu ${t.ten} — chưa có giá set` : "chưa rõ tàu"}
        </span>
      );
    }
    return (
      <span className={`ml-1 text-[9px] border rounded px-1 ${t.doan ? "text-orange-600 border-orange-300" : "text-sky-700 border-sky-300"}`}
        title={`Giá lấy theo tàu ${t.ten}${t.ve_vinh ? ` + vé vịnh ${fmtVnd(t.ve_vinh)}` : " (giá danh mục đã gồm vé vịnh)"}.${t.doan ? " Không thấy tên tàu trong lịch trình — đây là tàu mặc định, kiểm lại." : ""}`}>
        tàu {t.ten}{t.ve_vinh ? " + vé vịnh" : ""}{t.doan ? " (mặc định)" : ""}
      </span>
    );
  };

  const nhanNguonChinh = (r: ResolvedItem) => {
    if (r.sua_tay) {
      return <span className="text-[9px] text-blue-600" title="Bạn vừa sửa — sẽ được ghi vào sổ tay">vừa sửa</span>;
    }
    if (r.nguon_gia === "so_tay") {
      return (
        <span className="text-[9px] text-emerald-700" title="Lấy từ sổ tay — giá do người mình từng gõ">
          sổ tay{r.so_lan_dung ? ` · đã dùng ${r.so_lan_dung} lần` : ""}
        </span>
      );
    }
    if (r.nguon_gia === "dong_ghi") {
      return <span className="text-[9px] text-slate-500" title="Đối tác ghi thẳng mức tiền trong lịch trình">theo mức trong lịch trình</span>;
    }
    if (r.don_gia > 0) {
      return <span className="text-[9px] text-amber-600" title="Máy đoán — kiểm lại trước khi áp dụng">máy đoán</span>;
    }
    return <span className="text-[9px] text-orange-600" title="Chưa có trong sổ tay — gõ giá vào ô ĐG VND">cần điền giá</span>;
  };

  const patchRow = (idx: number, patch: Partial<ResolvedItem>) =>
    setRows((rs) => rs ? rs.map((r, i) => (i === idx ? { ...r, ...patch } : r)) : rs);
  // Đổi/xoá tham chiếu danh mục thì cờ combo phải theo dòng MỚI (nạp lại hoặc
  // xoá). Để cờ cũ bám lại = ẩn oan bữa ăn hoặc bỏ sót combo, cả 2 đều sai tiền.
  const comboPatch = (table: ResolvedItem["match_table"], id: number | null) =>
    comboPatchForRef(maps, table, id);
  // Gõ tên tay → xoá ref danh mục (thành dòng chỉ-giá nhập tay).
  // GIỮ cờ combo: gõ sửa tên hiển thị ("Cáp treo Bà Nà" → "... (khứ hồi)") vẫn là
  // đúng dịch vụ đó. Xoá cờ theo từng ký tự gõ = bữa ăn lặng lẽ bị tính lại 2 lần.
  // Chỉ hạ nguồn về 'user' vì cờ không còn được dòng danh mục nào bảo chứng.
  // sua_tay: gõ tên = DẠY bản dịch. Không đánh dấu thì dòng không giá không ref sẽ
  // không được học, lần sau AI dịch sai y hệt (xem aliasesToLearn).
  // Chọn từ danh mục → fill tên + giá + ref (để học alias). KS lấy giá theo mùa.
  // confidence=1: người chọn tay thì khớp là CHẮC, không còn là phỏng đoán của AI
  // — tắt dấu ⚠ "độ tin cậy thấp" và mở khoá ghi cờ combo vào danh mục.
  // Đổi loại/nhóm dòng (Ăn trưa/tối, Vé, KS, Xe). Giữ tên + giá; xoá ref danh
  // mục (khác loại → ref cũ không còn đúng) → thành dòng tự nhập, chọn lại được.
  // Dòng ăn chưa rõ bữa để value = "meal:" (KHÔNG mặc định "meal:trua"): nếu hiển
  // thị sẵn "Ăn trưa" thì OP bấm đúng "Ăn trưa" sẽ không bắn onChange, cảnh báo
  // "dòng ăn chưa rõ bữa" kẹt vĩnh viễn mà không cách nào sửa.
  const loaiValue = (r: ResolvedItem): string =>
    r.loai === "meal" ? `meal:${r.bua_an ?? ""}` : r.loai;
  const changeLoai = (idx: number, value: string) => {
    if (!rows) return;
    const parsed = value.startsWith("meal:")
      ? { loai: "meal" as const, bua: (value.slice(5) || undefined) as "trua" | "toi" | undefined }
      : { loai: value as ResolvedItem["loai"], bua: undefined };
    const next = rows.map((r, i) => i === idx ? {
      ...r, loai: parsed.loai, bua_an: parsed.bua, sua_tay: true,
      match_table: null, match_id: null, match_set_menu_id: null, match_label: "", from_alias: false,
      // Đổi loại = xoá ref danh mục → cờ combo của dòng cũ không còn đúng. Giữ lại
      // thì dòng Xe/Ăn cũng dính ghi chú "Đã gồm ăn trưa", đổi ngược về Vé lại ẩn bữa.
      ...comboPatch(null, null),
      tinh_rieng: undefined,
      status: (r.don_gia > 0 ? "matched" : "unmatched") as ResolvedItem["status"],
    } : r);
    setRows(next);
    setSelection(defaultHotelSelection(next, hotelChoiceGroups(next)));
  };

  // Quy tắc vừa dạy trong panel chat → áp NGAY vào rows đang review (chỉ đụng
  // dòng hotel của đúng KS đó — sửa tay ở các dòng khác giữ nguyên). Combo/tiền
  // tự tính lại vì analyzeCombo là memo trên rows.
  const handleRuleSaved = (rule: KsBuaRule) =>
    setRows((rs) => (rs ? applyKsBuaRules(rs, [rule]) : rs));

  const setGia = (idx: number, gia: number) =>
    setRows((rs) => rs ? rs.map((r, i) => (i === idx ? { ...r, don_gia: gia, sua_tay: true } : r)) : rs);
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
  // AI đọc sót mục → OP thêm dòng trống ngay tại đây, khỏi phải phân tích lại
  // (phân tích lại = mất sạch phần đã sửa tay). Tên/giá điền inline trên dòng mới.
  // Thêm KS vào đêm đã có KS = thêm PHƯƠNG ÁN → phải dựng lại selection, nếu
  // không đêm đó mất radio mặc định và dòng mới bị loại khỏi báo giá.
  const addRow = (loai: ResolvedItem["loai"], ngay_so: number, bua_an?: "trua" | "toi") =>
    setRows((rs) => {
      const next = [...(rs ?? []), newResolvedItem(loai, ngay_so, bua_an)];
      if (loai === "hotel") setSelection(defaultHotelSelection(next, hotelChoiceGroups(next)));
      return next;
    });

  // ── Combo đã gồm bữa ăn ──
  /** id cảnh điểm được phép GHI cờ combo vào danh mục, hoặc null (chỉ sửa cục bộ).
   *  Chặn ghi khi khớp danh mục còn yếu: AI khớp nhầm sang cảnh điểm khác
   *  (confidence thấp) mà vẫn ghi master thì mọi báo giá sau của mọi OP đều bị
   *  trừ oan bữa ăn — đúng thứ nhánh "nghi ngờ" cố tránh. */
  const canWriteCombo = (r: ResolvedItem): number | null => {
    if (readOnly) return null;
    if (r.match_table !== "canh_diem" || !r.match_id) return null;
    // KHÔNG lấy `bao_gom_nguon === "master"` làm bằng chứng khớp chắc: cờ master
    // được gắn theo match của AI, kể cả match yếu. Nếu tin nó thì đúng ca đáng
    // chặn nhất (AI khớp nhầm "vé trẻ em" sang dòng có cờ) lại được phép GỠ cờ
    // của dòng danh mục đó cho toàn hệ thống.
    const chacChan = r.from_alias || r.confidence >= 0.6;
    return chacChan ? r.match_id : null;
  };

  // OP xác nhận (hoặc gỡ) cờ combo trên 1 dòng vé: áp dụng NGAY cho báo giá đang
  // mở, đồng thời ghi vào DANH MỤC để mọi báo giá sau tự trừ — sửa 1 lần, hết lặp
  // lại. Ghi danh mục hỏng (thiếu quyền / chỉ xem) KHÔNG chặn: báo giá vẫn đúng.
  const setCombo = async (idx: number, bua: BaoGomBuaAn | null) => {
    const r = rows?.[idx];
    if (!r) return;
    // Đổi bữa thì ghi chú mô tả bữa CŨ thành sai ("gồm ăn tối (buffet trưa...)")
    // → xoá, cả ở dòng lẫn ở danh mục.
    const giuGhiChu = bua != null && bua === r.bao_gom_bua_an;
    patchRow(idx, {
      bao_gom_bua_an: bua,
      bao_gom_nguon: "user",
      ...(giuGhiChu ? {} : { bao_gom_ghi_chu: undefined }),
      bo_qua_combo: bua ? undefined : true, // chọn "không gồm" = tắt luôn cảnh báo
    });

    const cdId = canWriteCombo(r);
    if (!cdId) {
      toast.success(bua
        ? `Đã trừ ${BUA_LABEL[bua]} cùng ngày trong báo giá này`
        : "Đã bỏ đánh dấu combo cho báo giá này");
      // Khớp danh mục còn yếu → KHÔNG ghi master, nếu không 1 cú bấm sửa nhầm dòng
      // danh mục sẽ làm mọi báo giá sau tự trừ oan.
      if (r.match_table === "canh_diem" && r.match_id && !readOnly) {
        toast.info("Khớp danh mục chưa chắc chắn nên chỉ áp dụng cho báo giá này — muốn áp dụng lâu dài thì đánh dấu ở trang Cảnh điểm.");
      }
      return;
    }
    try {
      await markCombo.mutateAsync({ id: cdId, bua, xoaGhiChu: !giuGhiChu });
      toast.success(bua
        ? `Đã ghi vào danh mục: "${r.match_label || r.mo_ta}" gồm ${BUA_LABEL[bua]} — báo giá sau tự trừ`
        : `Đã gỡ cờ combo của "${r.match_label || r.mo_ta}" trong danh mục`);
    } catch (e: unknown) {
      toast.warning(`${errMsg(e) || "Không ghi được vào danh mục"} — vẫn áp dụng cho báo giá này.`);
    }
  };
  const setTinhRieng = (idx: number, v: boolean) => patchRow(idx, { tinh_rieng: v || undefined });

  const handleApply = () => {
    if (included.length === 0) return;
    onApply(previewItems, ten, soNgay);
    // Học bộ nhớ khớp từ các dòng đã áp dụng (fire-and-forget) → lần sau tự khớp.
    const toLearn = aliasesToLearn(included, user?.user_id);
    if (toLearn.length) learn.mutate(toLearn);

    // Ghi vào SỔ TAY: cặp (tiếng Trung ↔ tiếng Việt ↔ giá) người nhập vừa chốt.
    // Đây là chỗ sổ tay dày lên. Fire-and-forget như trên — hỏng thì báo giá này
    // vẫn đúng, chỉ là lần sau chưa nhớ.
    // Dòng máy đoán chưa chắc KHÔNG được vào sổ tay: người nhập mới chỉ tick "đã
    // xem", chưa xác nhận là đúng — ghi vào là biến phỏng đoán thành giá chuẩn.
    const chuaChacSet = new Set(chuaChac);
    const deHoc = locDongDeHoc(
      included
        .filter((r) => !chuaChacSet.has(r) && (LOAI_SO_TAY as readonly string[]).includes(r.loai))
        .map((r) => ({
          ten_zh: r.ten_zh,
          mo_ta: r.mo_ta,
          loai: r.loai as LoaiSoTay,
          don_gia: r.don_gia,
          foc_khach: r.foc_khach,
          foc_mien: r.foc_mien,
        })),
    );
    if (deHoc.length) {
      hocSoTay.mutate(deHoc, {
        onError: () => toast.warning("Đã áp dụng, nhưng chưa ghi được vào sổ tay — lần sau có thể phải gõ lại giá."),
      });
    }
    // Giá KS nhập tay + master chưa có giá → ghi ngược vào danh mục (nguồn "báo
    // giá", chỉ chèn mới — không đè giá sẵn có). Fire-and-forget: hỏng (thiếu
    // quyền...) không chặn áp dụng, báo giá này vẫn đúng.
    if (!readOnly && maps) {
      const wb = giaPhongWritebacks(included, maps.khachSanGia);
      if (wb.length) {
        writeGiaPhong.mutate({ items: wb, baoGiaId }, {
          onSuccess: (n) => {
            if (n) toast.info(`Đã lưu giá phòng tham khảo vào danh mục KS: ${wb.map((w) => w.ten).join(", ")} (nguồn: báo giá — sửa được ở trang Khách sạn)`);
          },
        });
      }
    }
    handleClose();
  };

  const handleSaveDraft = () => {
    if (!rows) return;
    onSaveDraft({ items: rows, selection, ten, so_ngay: soNgay, saved_at: new Date().toISOString() });
    // Ghi luôn phần người nhập đã tự tay gõ vào SỔ TAY, không đợi tới lúc Áp
    // dụng: nhiều báo giá dừng ở nháp (chờ đối tác chốt) và giá vừa gõ là thứ
    // tốn công nhất trong cả màn hình này — để nó chết theo bản nháp thì lần
    // sau máy lại đoán ra đúng con số sai cũ.
    const deHoc = dongDeHocKhiLuuNhap(rows);
    if (deHoc.length) {
      hocSoTay.mutate(deHoc, {
        onSuccess: () => toast.success(`Đã lưu nháp · nhớ giá ${deHoc.length} mục vào sổ tay`),
        onError: () => toast.warning("Đã lưu nháp, nhưng chưa ghi được vào sổ tay — lần sau có thể phải gõ lại giá."),
      });
      return;
    }
    toast.success("Đã lưu nháp — lần sau mở lại tiếp tục được");
  };

  // Esc / click ngoài đóng dialog làm input unmount TRƯỚC khi blur kịp chạy →
  // phụ thu / lợi nhuận / tỷ giá vừa gõ hiện trên draft nhưng chưa persist.
  // Flush phần lệch khi đóng (blur đã lưu rồi thì savePatch lặp lại vô hại).
  const handleClose = () => {
    const patch: Partial<BaoGiaRow> = {};
    if ((draft.xe_gia ?? null) !== (row.xe_gia ?? null)) patch.xe_gia = draft.xe_gia ?? null;
    if ((draft.phu_thu ?? 0) !== (row.phu_thu ?? 0)) patch.phu_thu = draft.phu_thu ?? 0;
    if (draft.profit_usd !== row.profit_usd) patch.profit_usd = draft.profit_usd;
    if (draft.exchange_rate !== row.exchange_rate && (draft.exchange_rate ?? 0) > 0) {
      patch.exchange_rate = draft.exchange_rate;
    }
    if (Object.keys(patch).length) savePatch(patch);
    onClose();
  };

  const matched = included.filter((r) => r.don_gia > 0).length;
  const missing = included.filter((r) => r.don_gia <= 0).length;
  const busy = extract.isPending || mapsLoading || extracting;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent className={`${rows ? "sm:max-w-6xl" : "sm:max-w-4xl"} max-h-[90vh] flex flex-col`}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-violet-600" /> AI điền từ lịch trình
          </DialogTitle>
          <DialogDescription>
            AI đọc file lịch trình (PDF/ảnh) hoặc text, lọc hạng mục mất tiền + khớp danh mục; giá lấy từ hệ thống.
            Kiểm tra & điền giá còn thiếu, chọn 1 khách sạn cho đêm có nhiều phương án — giá tour tính sống ngay ở bảng “Tính tiền” bên dưới, không cần Áp dụng mới thấy.
          </DialogDescription>
        </DialogHeader>

        {/* Dải cảnh báo dòng máy đoán không chắc. Đặt NGOÀI vùng cuộn để nó không
            trôi mất khi người nhập kéo xuống xem bảng — cái cần thấy nhất mà cuộn
            là mất thì coi như không có. */}
        {rows && chuaChac.length > 0 && (
          <div className="shrink-0 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 space-y-1.5">
            <div className="flex items-start gap-2 text-xs text-amber-900">
              <HelpCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>
                <b>{chuaChac.length} dòng máy đoán chưa chắc</b> nhưng vẫn điền sẵn một mức giá.
                Đây là chỗ sai khó thấy nhất — số trông như thật. Xem lại tên đã khớp ở cột
                “Khớp danh mục”, sai thì bấm vào đó chọn lại.
              </span>
            </div>
            <ul className="text-[11px] text-amber-800 pl-6 space-y-0.5">
              {chuaChac.slice(0, 4).map((r, i) => (
                <li key={i} className="truncate">
                  Ngày {r.ngay_so} · {r.ten_zh || r.ten_vi} → <b>{r.match_label}</b>
                </li>
              ))}
              {chuaChac.length > 4 && <li>… và {chuaChac.length - 4} dòng nữa</li>}
            </ul>
            <label className="flex items-center gap-1.5 text-xs text-amber-900 cursor-pointer pl-6">
              <input
                type="checkbox"
                checked={!canXacNhan}
                onChange={(e) => setDaXemChuaChac(e.target.checked ? chuKyChuaChac : "")}
              />
              Đã xem các dòng này
            </label>
          </div>
        )}

        <div className="flex-1 min-h-0 flex gap-3">
        <div className="flex-1 min-w-0 overflow-auto">
        {!rows ? (
          <div className="space-y-3">
            {mode === "file" ? (
              // Vùng nhận kéo-thả = cả khu chọn file (thả trúng chỗ nào cũng ăn).
              <div
                {...dropProps}
                className={`space-y-3 rounded-lg border-2 border-dashed p-2 transition-colors ${
                  dragging ? "border-blue-400 bg-blue-50/60" : "border-transparent"
                }`}
              >
                {files.length > 0 ? (
                  <div className="space-y-1.5">
                    <p className="text-xs font-medium text-slate-600">Chọn file lịch trình:</p>
                    <div className="rounded-md border divide-y">
                      {files.map((f) => {
                        const k = fileKind(f.ten);
                        const unsup = unsupportedFileInfo(f.ten);
                        return (
                          <label key={f.url} className={`flex items-center gap-2 px-3 py-2 text-xs cursor-pointer ${unsup ? "opacity-70" : "hover:bg-muted/40"}`}>
                            <input
                              type="radio" name="lt-file" disabled={!!unsup}
                              checked={selectedUrl === f.url}
                              onChange={() => setSelectedUrl(f.url)}
                            />
                            <FileText className="h-4 w-4 text-blue-600 shrink-0" />
                            <span className="flex-1 min-w-0 truncate">{f.ten}</span>
                            {(k === "docx" || k === "xlsx") && <span className="text-[10px] text-slate-400">đọc qua text</span>}
                            {/* Nhãn nói luôn CÁCH CHỮA (hover xem đầy đủ) — "chưa đọc
                                được" trơ trọi thì OP chỉ biết tải lại lần nữa. */}
                            {unsup && (
                              <span
                                className="shrink-0 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-800"
                                title={unsup.help}
                              >
                                {unsup.badge}
                              </span>
                            )}
                          </label>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  <div className="rounded-md border border-dashed p-5 text-center">
                    <FileText className="h-6 w-6 mx-auto text-slate-300 mb-1" />
                    <p className="text-xs text-muted-foreground mb-2">
                      Chưa có file lịch trình đính kèm — <span className="font-medium text-slate-600">kéo thả file vào đây</span> hoặc:
                    </p>
                    <Button size="sm" variant="outline" className="h-8 text-xs gap-1" onClick={() => fileInputRef.current?.click()} disabled={upload.isPending}>
                      {upload.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />} Tải file lên
                    </Button>
                  </div>
                )}
                <div className="flex items-center justify-between">
                  {files.length > 0 ? (
                    <Button size="sm" variant="ghost" className="h-7 text-xs gap-1 text-muted-foreground" onClick={() => fileInputRef.current?.click()} disabled={upload.isPending}>
                      {upload.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Upload className="h-3 w-3" />} Tải thêm file (hoặc kéo thả vào đây)
                    </Button>
                  ) : <span />}
                  <button type="button" className="text-[11px] text-primary hover:underline" onClick={() => setMode("text")}>
                    hoặc dán nội dung text →
                  </button>
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept=".pdf,.png,.jpg,.jpeg,.webp,.gif,.docx,.xlsx,.xls,.doc"
                  className="hidden"
                  onChange={(e) => handleUpload(Array.from(e.target.files ?? []))}
                />
              </div>
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
              {mapsLoading
                ? "Đang tải danh mục..."
                : "AI chỉ chọn dòng danh mục + lấy giá thật; không tự bịa giá. Đọc được: PDF, ảnh, Word .docx, Excel — file Word bản cũ .doc phải lưu lại thành .docx."}
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            <div className="flex items-center gap-3 text-xs">
              <span className="font-medium">{ten || "(chưa có tên)"}</span>
              <span className="text-muted-foreground">{soNgay} ngày · {included.length} mục</span>
              <span className="text-emerald-700 inline-flex items-center gap-1"><Check className="h-3 w-3" />{matched} có giá</span>
              {missing > 0 && <span className="text-amber-700 inline-flex items-center gap-1"><AlertTriangle className="h-3 w-3" />{missing} cần điền giá</span>}
              {combo.suppressed.size > 0 && (
                <span className="text-slate-500" title="Bữa ăn đã nằm trong vé combo — không tính tiền lần 2">
                  ⊂ {combo.suppressed.size} bữa đã gồm trong combo
                </span>
              )}
              {combo.warnings.size > 0 && (
                <span className="text-amber-700" title="Vé nghi đã bao gồm bữa ăn — xác nhận để khỏi tính trùng">
                  ⚠ {combo.warnings.size} vé nghi đã gồm ăn
                </span>
              )}
            </div>
            <div className="rounded-md border overflow-hidden">
              <table className="w-full text-xs border-collapse">
                <thead className="bg-[#E6F1FB] sticky top-0 z-10">
                  <tr>
                    <th className="py-1.5 px-2 text-center font-semibold w-[48px]">Ngày</th>
                    <th className="py-1.5 px-2 text-left font-semibold">中文 (AI đọc được)</th>
                    <th className="py-1.5 px-2 text-left font-semibold">Tên tiếng Việt — lưu vào sổ tay</th>
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
                    // Nhóm rỗng VẪN hiện (trước đây ẩn) — không thì AI bỏ sót cả
                    // nhóm là mất luôn chỗ bấm thêm, đúng ngõ cụt cần gỡ.
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
                          const sup = combo.suppressed.get(idx);   // dòng ăn đã nằm trong combo
                          const warn = combo.warnings.get(idx);    // dòng vé nghi là combo kèm ăn
                          const rowCls = sup ? "bg-slate-50 text-slate-400"
                            : !chosen ? "opacity-50"
                            : ok ? "" : "bg-amber-50/50";
                          return (
                            <tr key={idx} className={`border-t border-slate-100 ${rowCls}`}>
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
                                    {/* Nguyên văn AI đọc được. Hiện ĐẦY ĐỦ, xuống dòng — trước đây
                                        cắt cụt ở 240px nên dòng dài (đa số dòng thật) không đọc hết,
                                        mà đây chính là thứ cần so bằng mắt với sổ tay.
                                        Chỉ tiếng Trung, KHÔNG kèm ô chọn danh mục. */}
                                    <span className="flex items-start gap-1">
                                      <span className="block text-[11px] leading-snug text-slate-700 break-words whitespace-pre-wrap flex-1">
                                        {r.ten_zh || <span className="text-slate-400 italic">(AI không đọc được chữ Trung)</span>}
                                      </span>
                                      {isAltHotel && <span className="text-[9px] text-violet-600 shrink-0">PA</span>}
                                    </span>
                                    <select
                                      value={loaiValue(r)}
                                      onChange={(e) => changeLoai(idx, e.target.value)}
                                      title="Đổi loại/nhóm dòng này"
                                      className="mt-0.5 ml-1 text-[10px] text-slate-500 bg-transparent border border-slate-200 rounded px-1 py-0.5 outline-none focus:border-blue-300 cursor-pointer"
                                    >
                                      {r.loai === "meal" && !r.bua_an && (
                                        <option value="meal:">🍴 Ăn (chưa rõ bữa)</option>
                                      )}
                                      <option value="meal:trua">🍴 Ăn trưa</option>
                                      <option value="meal:toi">🍴 Ăn tối</option>
                                      <option value="ticket">🎫 Vé / Dịch vụ</option>
                                      <option value="hotel">🏨 Khách sạn</option>
                                      <option value="transport">🚗 Xe</option>
                                    </select>
                                    {/* Vé / du thuyền / xe trọn gói: cờ đã xác nhận, cảnh báo nghi ngờ, hoặc
                                        lối vào im lặng cho ca chính (ngày có bữa ăn mà chưa ai đánh dấu gì). */}
                                    {r.loai !== "meal"
                                      && (r.bao_gom_bua_an || warn || (r.loai === "ticket" && daysWithMeal.has(r.ngay_so))) && (
                                      <ComboChooser
                                        current={r.bao_gom_bua_an ?? null}
                                        onPick={(b) => setCombo(idx, b)}
                                        ghiVaoDanhMuc={canWriteCombo(r) ? (r.match_label || r.mo_ta) : null}
                                        label={r.bao_gom_bua_an
                                          ? (warn
                                            // Khai gồm bữa nhưng CHƯA trừ được dòng nào → không được hiện xanh
                                            // như đã trừ, OP sẽ tưởng xong mà tiền vẫn tính đủ.
                                            ? `🍽 đã gồm ${BUA_LABEL[r.bao_gom_bua_an]} · ⚠ chưa trừ được — dòng ăn chưa rõ bữa`
                                            : `🍽 combo · đã gồm ${BUA_LABEL[r.bao_gom_bua_an]}`)
                                          : warn
                                            ? `⚠ có thể đã gồm ${warn.bua ? BUA_LABEL[warn.bua] : "bữa ăn"} — kiểm tra`
                                            : "🍽 vé này có kèm bữa ăn?"}
                                        tone={r.bao_gom_bua_an && !warn ? "ok" : warn ? "warn" : "mo"}
                                        title={warn?.nguon === "khong_ro_bua"
                                          ? "Vé khai đã gồm bữa ăn, nhưng dòng ăn cùng ngày không ghi rõ trưa/tối nên hệ thống chưa trừ được. Chọn trưa/tối cho dòng ăn đó."
                                          : !r.bao_gom_bua_an && !warn
                                          ? "Ngày này có bữa ăn tính tiền riêng. Nếu vé đã bao gồm bữa đó, đánh dấu ở đây để khỏi trả 2 lần."
                                          : r.bao_gom_bua_an
                                            ? `${r.bao_gom_nguon === "master" ? "Danh mục cảnh điểm" : "Bạn vừa xác nhận"}: vé này đã gồm ${BUA_LABEL[r.bao_gom_bua_an]}${r.bao_gom_ghi_chu ? ` (${r.bao_gom_ghi_chu})` : ""}. Bấm để sửa.`
                                            : warn?.nguon === "ai"
                                              ? "AI đọc được trong lịch trình là vé này đã bao gồm bữa ăn. Xác nhận để bỏ tính trùng."
                                              : "Tên dòng có dấu hiệu vé combo kèm ăn. Xác nhận để bỏ tính trùng."}
                                      />
                                    )}
                                    {/* Dòng ăn đang bị nghi tính trùng với combo cùng ngày */}
                                    {!sup && warnedMeals.has(idx) && (
                                      <span
                                        className="mt-0.5 ml-1 block rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-800"
                                        title="Ngày này có vé nghi/khai đã bao gồm bữa ăn. Chọn đúng Ăn trưa / Ăn tối cho dòng này, hoặc xác nhận cờ combo trên dòng vé, để hệ thống trừ đúng."
                                      >
                                        ⚠ có thể trùng với vé combo cùng ngày
                                      </span>
                                    )}
                                    {/* Dòng ăn đã nằm trong combo → không tính tiền */}
                                    {sup && (
                                      <span className="mt-0.5 ml-1 flex flex-wrap items-center gap-1">
                                        <span
                                          className="rounded bg-slate-200 px-1.5 py-0.5 text-[10px] font-medium text-slate-600"
                                          title={`Đã nằm trong "${sup.label}"${sup.ghi_chu ? ` — ${sup.ghi_chu}` : ""}. Không tính tiền để khỏi trùng.`}
                                        >
                                          ⊂ đã gồm trong {sup.label}
                                        </span>
                                        <button
                                          type="button"
                                          onClick={() => setTinhRieng(idx, true)}
                                          className="text-[10px] text-blue-600 hover:underline"
                                          title="Bữa này thực tế ăn riêng, phải trả thêm tiền"
                                        >
                                          vẫn tính riêng
                                        </button>
                                      </span>
                                    )}
                                    {combo.overridden.has(idx) && (
                                      <button
                                        type="button"
                                        onClick={() => setTinhRieng(idx, false)}
                                        className="mt-0.5 ml-1 block text-[10px] text-amber-700 hover:underline"
                                        title="Đang tính riêng dù combo cùng ngày đã gồm bữa này — bấm để trừ lại"
                                      >
                                        ⚠ tính riêng dù combo đã gồm — hoàn tác
                                      </button>
                                    )}
                                  </span>
                                </div>
                              </td>
                              {/* Tên tiếng Việt — SỬA ĐƯỢC, và chính nó được cất vào sổ tay khi
                                  bấm Áp dụng. Trước đây ô này chỉ hiện tên dòng danh mục đã khớp,
                                  không sửa được, nên OP sửa xong là mất. */}
                              <td className="py-1 px-2 align-top">
                                <input
                                  value={r.mo_ta}
                                  onChange={(e) => patchRow(idx, { mo_ta: e.target.value, sua_tay: true })}
                                  placeholder="Gõ tên tiếng Việt…"
                                  title="Tên này được ghi vào sổ tay — lần sau gặp lại chữ Trung bên trái là tự điền"
                                  className="w-full bg-transparent text-xs font-medium text-slate-700 outline-none rounded px-1 py-0.5 border border-transparent hover:border-slate-200 focus:border-blue-300 focus:bg-blue-50/40"
                                />
                                <span className="flex items-center gap-1 px-1 mt-0.5">
                                  {nhanNguon(r)}
                                </span>
                              </td>
                              <td className={`py-1 px-2 text-right text-slate-500 tabular-nums ${sup ? "line-through" : ""}`}>
                                {r.don_gia > 0 ? (r.don_gia / xr).toFixed(2) : "—"}
                              </td>
                              <td className="py-1 px-2">
                                {sup ? (
                                  <span className="block text-right text-[11px] text-slate-400 line-through tabular-nums">
                                    {r.don_gia > 0 ? r.don_gia.toLocaleString("vi-VN") : "—"}
                                  </span>
                                ) : (
                                  <Input
                                    type="text" inputMode="numeric"
                                    value={r.don_gia > 0 ? r.don_gia.toLocaleString("vi-VN") : ""}
                                    onChange={(e) => setGia(idx, parseInt(e.target.value.replace(/[^0-9]/g, ""), 10) || 0)}
                                    placeholder="0"
                                    className={`h-7 text-xs text-right ${chosen && !ok ? "border-amber-400" : ""}`}
                                  />
                                )}
                              </td>
                              <td className="py-1 px-1 text-center">
                                {sup ? (
                                  <span className="text-slate-300">—</span>
                                ) : r.loai === "transport" ? (
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
                        <tr className="border-t border-slate-100">
                          <td colSpan={7} className="py-1 px-2">
                            <AddServiceRow
                              loai={g.key}
                              soNgay={soNgay}
                              onAdd={(ngay, bua) => addRow(g.key, ngay, bua)}
                              disabled={readOnly}
                            />
                          </td>
                        </tr>
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {/* ── Tính tiền xem trước: chi phí chung (xe/phụ thu/lợi nhuận/tỷ giá)
                sửa ở đây LƯU THẲNG vào báo giá (auto-save như trang chính); bảng
                tổng bên dưới = đúng công thức bảng chi phí sau khi Áp dụng. */}
            {previewSheet && (
              <div className="rounded-md border">
                <div className="border-b bg-slate-50/70 p-2.5 space-y-2">
                  <div className="grid grid-cols-12 gap-2">
                    <div className="col-span-6">
                      <span className="block text-[11px] text-slate-600 mb-1">Xe sử dụng (trọn tour)</span>
                      <VehicleSelector
                        xeTen={draft.xe_ten}
                        xeGia={draft.xe_gia}
                        onDraftGia={(xeGia) => updateDraftField("xe_gia", xeGia)}
                        onChange={(xeTen, xeGia) => {
                          if (xeTen === row.xe_ten && xeGia === row.xe_gia) return;
                          savePatch({ xe_ten: xeTen, xe_gia: xeGia });
                        }}
                      />
                    </div>
                    <div className="col-span-2">
                      <span className="block text-[11px] text-slate-600 mb-1" title="Vé cầu đường, xe trung chuyển… — tính 1 lần, không nhân khách">Phụ thu (1 lần)</span>
                      <Input
                        type="text" inputMode="numeric"
                        value={(draft.phu_thu ?? 0) > 0 ? (draft.phu_thu ?? 0).toLocaleString("vi-VN") : ""}
                        onChange={(e) => {
                          const digits = e.target.value.replace(/[^0-9]/g, "");
                          updateDraftField("phu_thu", digits ? parseInt(digits, 10) : 0);
                        }}
                        onBlur={() => {
                          if ((draft.phu_thu ?? 0) !== (row.phu_thu ?? 0)) saveField("phu_thu", draft.phu_thu ?? 0);
                        }}
                        placeholder="0"
                        className="h-9 text-xs text-right"
                      />
                    </div>
                    <div className="col-span-2">
                      <span className="block text-[11px] text-slate-600 mb-1">Lợi nhuận (USD/khách)</span>
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
                        className="h-9 text-xs text-right"
                      />
                    </div>
                    <div className="col-span-2">
                      <span className="block text-[11px] text-slate-600 mb-1">Tỷ giá (VND/USD)</span>
                      <Input
                        type="number"
                        value={draft.exchange_rate ?? TY_GIA_BAO_GIA_MAC_DINH}
                        onChange={(e) => {
                          const v = parseFloat(e.target.value);
                          if (!isNaN(v)) updateDraftField("exchange_rate", v);
                        }}
                        onBlur={() => {
                          const v = draft.exchange_rate;
                          if (v != null && v > 0 && v !== row.exchange_rate) saveField("exchange_rate", v);
                        }}
                        className="h-9 text-xs text-right"
                      />
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-[11px] text-slate-500 mr-1">Cỡ đoàn:</span>
                    {tierGuests.map((g) => (
                      <span key={g} className="inline-flex items-center gap-1 rounded-full border bg-white px-2 py-0.5 text-xs">
                        {g} khách
                        <button
                          type="button"
                          onClick={() => setTierGuests(tierGuests.filter((x) => x !== g))}
                          disabled={tierGuests.length <= 1}
                          className="text-slate-400 hover:text-red-500 disabled:opacity-30"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </span>
                    ))}
                    <Input
                      type="number" min={1} value={newTier}
                      onChange={(e) => setNewTier(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && addTier()}
                      placeholder="Số khách"
                      className="h-7 w-24 text-xs"
                    />
                    <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={addTier}>
                      <Plus className="h-3 w-3" /> Thêm cỡ
                    </Button>
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs border-collapse">
                    <thead>
                      <tr className="bg-[#E6F1FB]">
                        <th className="py-1.5 px-2 text-left font-semibold">Tính tiền (xem trước)</th>
                        {previewSheet.configs.map((c) => (
                          <th key={c.guests} className="py-1 px-2 text-right font-semibold whitespace-nowrap">
                            <div className="text-blue-800">{c.guests} khách</div>
                            <div className="text-[10px] font-normal text-slate-500">{c.rooms} phòng · {c.pax} pax</div>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {previewSheet.groups.map((g) => (
                        <tr key={g.key} className="border-t border-slate-100">
                          <td className="py-0.5 px-2 text-slate-600">Cộng {g.label.toLowerCase()}</td>
                          {g.subtotals.map((v, ti) => (
                            <td key={ti} className="py-0.5 px-2 text-right tabular-nums">{fmtVnd(v)}</td>
                          ))}
                        </tr>
                      ))}
                      {previewSheet.footer.map((f) => {
                        const isTotal = f.kind === "total";
                        const isPrice = f.kind === "price";
                        return (
                          <tr
                            key={f.key}
                            className={`border-t ${
                              isTotal ? "border-t-2 border-slate-300 bg-slate-50 font-bold"
                              : isPrice ? "bg-blue-50/60 font-bold text-blue-800"
                              : "border-slate-100"
                            }`}
                          >
                            <td className={isTotal || isPrice ? "py-1 px-2" : "py-1 px-2 text-slate-600"}>{f.label}</td>
                            {f.values.map((v, ti) => (
                              <td
                                key={ti}
                                className={`py-1 px-2 text-right tabular-nums ${
                                  f.kind === "usd" ? "text-slate-500" : f.kind === "pct" ? "text-emerald-600" : ""
                                }`}
                              >
                                {f.kind === "usd" ? fmtUsd(v) : f.kind === "pct" ? `${v.toFixed(1)}%` : fmtVnd(v)}
                              </td>
                            ))}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
            <p className="text-[11px] text-muted-foreground">
              <b>PA</b> = phương án khách sạn (đêm có nhiều lựa chọn) → chọn 1, chỉ KS được chọn vào báo giá.
              Mục nền cam = chưa có giá → điền tay. <span className="text-violet-700">“đã nhớ”</span> = tự điền từ bộ nhớ đã học (sửa lại được).
              <b> ⚠ có thể đã gồm…</b> = vé nghi là combo kèm ăn → bấm xác nhận, bữa ăn cùng ngày sẽ bị gạch (<b>⊂ đã gồm</b>) và không tính tiền;
              xác nhận cũng được ghi vào danh mục cảnh điểm nên báo giá sau tự trừ.
              Bảng <b>Tính tiền</b> là giá sống theo đúng công thức bảng chi phí — sửa giá/FOC/xe/phụ thu là số nhảy ngay,
              bấm <b>Áp dụng</b> xong số không đổi. Xe, phụ thu, lợi nhuận, tỷ giá, cỡ đoàn sửa ở đây được lưu thẳng vào báo giá.
            </p>
          </div>
        )}
        </div>
        {/* Cột chat "Sửa & dạy quy tắc" — chỉ hiện ở bước review: thấy sai thì
            gõ sửa tại chỗ, quy tắc lưu DB + áp ngay vào rows đang xem. */}
        {rows && (
          <div className="hidden md:block w-[300px] shrink-0 border-l pl-3 min-h-0">
            <BaoGiaRuleChatPanel onRuleSaved={handleRuleSaved} />
          </div>
        )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>Hủy</Button>
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
              <Button
                onClick={handleApply}
                disabled={included.length === 0 || canXacNhan}
                title={canXacNhan ? `Còn ${chuaChac.length} dòng máy đoán chưa chắc — tick "Đã xem" ở dải vàng phía trên` : undefined}
              >
                Áp dụng {included.length} mục
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Chip trên dòng VÉ: khai/gỡ "vé này đã bao gồm bữa ăn". Chọn xong, bữa ăn cùng
// ngày bị trừ khỏi báo giá NGAY, đồng thời ghi vào danh mục cảnh điểm.
const COMBO_OPTIONS: { v: BaoGomBuaAn | null; label: string }[] = [
  { v: "trua", label: "Đã gồm ăn trưa" },
  { v: "toi", label: "Đã gồm ăn tối" },
  { v: "ca_hai", label: "Đã gồm cả trưa + tối" },
  { v: null, label: "Không gồm bữa nào" },
];

function ComboChooser({ current, label, tone, title, ghiVaoDanhMuc, onPick }: {
  current: BaoGomBuaAn | null;
  label: string;
  /** ok = đã trừ · warn = cần kiểm tra · mo = lối vào im lặng, không gây nhiễu. */
  tone: "ok" | "warn" | "mo";
  title: string;
  /** Tên dòng danh mục sẽ bị GHI ĐÈ (null = chỉ sửa trong báo giá này). */
  ghiVaoDanhMuc: string | null;
  onPick: (bua: BaoGomBuaAn | null) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          title={title}
          className={`mt-0.5 ml-1 block rounded px-1.5 py-0.5 text-left text-[10px] font-medium ${
            tone === "ok"
              ? "bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
              : tone === "warn"
                ? "bg-amber-100 text-amber-800 hover:bg-amber-200"
                : "text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          }`}
        >
          {label}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" sideOffset={4} className="w-[220px] p-1">
        <p className="px-2 py-1 text-[10px] text-muted-foreground">
          Vé này đã bao gồm bữa ăn nào?
        </p>
        {COMBO_OPTIONS.map((o) => (
          <button
            key={o.v ?? "khong"}
            type="button"
            onClick={() => { onPick(o.v); setOpen(false); }}
            className={`w-full rounded px-2 py-1.5 text-left text-xs hover:bg-slate-50 ${
              (current ?? null) === o.v ? "font-semibold text-emerald-700" : ""
            }`}
          >
            {o.label}
          </button>
        ))}
        <p className="px-2 py-1 text-[10px] text-muted-foreground border-t mt-1 break-words">
          {ghiVaoDanhMuc
            ? <>Ghi vào danh mục cảnh điểm <b>“{ghiVaoDanhMuc}”</b> → mọi báo giá sau tự trừ.</>
            : <>Chỉ áp dụng cho báo giá này (không đủ điều kiện ghi vào danh mục).</>}
        </p>
      </PopoverContent>
    </Popover>
  );
}
