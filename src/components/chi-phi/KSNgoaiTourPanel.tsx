import { useMemo, useRef, useState } from "react";
import { Plus, Trash2, X, Hotel, ArrowRight, Ban, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { SearchableSelect } from "@/components/SearchableSelect";
import { DatePicker } from "@/components/ui/date-picker";
import { toast } from "sonner";
import {
  useChiPhiList, useUpsertChiPhi, useDeleteChiPhi, useDNTTList,
  type ChiPhiRow, type DNTTRow,
} from "@/hooks/use-chi-phi";
import { useCancelDNTT } from "@/hooks/use-dntt";
import { useCurrentUserName } from "@/hooks/use-doan";
import { useKhachSanList } from "@/hooks/use-khach-san";
import { useNhaCungCapList } from "@/hooks/use-nha-cung-cap";
import KSDNTTModal from "./KSDNTTModal";
import DNTTKSPreviewModal from "./DNTTKSPreviewModal";
import type { EdgeFunctionData } from "@/lib/export-dntt-ks-word";
import { buildNgoaiTourSelectedData, REF_LOAI_NGOAI_TOUR } from "@/lib/ks-ngoai-tour-print";
import { type CanTruSelection } from "./KSCongNoPanel";
import { type LocalKSRow, type KSLoaiRow } from "./ks-section-shared";
import {
  buildKsNgoaiTourPayload, nightsBetween, calcKsNgoaiTourThanhTien,
  type KsNgoaiTourLoaiRow,
} from "@/lib/ks-ngoai-tour";
import { errMsg } from "@/lib/error";

const fmt = (n: number) => Math.round(n).toLocaleString("vi-VN");
const onlyDigits = (s: string) => s.replace(/\D/g, "");

const STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  chua_de_nghi:  { label: "Chưa đề nghị", cls: "bg-gray-100 text-gray-600" },
  cho_duyet:     { label: "Chờ duyệt",    cls: "bg-yellow-100 text-yellow-700" },
  da_duyet:      { label: "Đã duyệt",     cls: "bg-teal-100 text-teal-700" },
  da_thanh_toan: { label: "Đã thanh toán", cls: "bg-emerald-100 text-emerald-700" },
};

interface KsOpt { value: string; label: string }
interface KsInfo { ten: string; nccId: number | null }
interface NccInfo { ten: string | null; stk: string | null; bank: string | null }

interface Draft {
  tmpId: number;
  khachSanId: number;
  loaiRow: KsNgoaiTourLoaiRow;
  loaiPhong: string;
  soPhong: string;
  focCount: string;
  ci: string;
  co: string;
  giaPhong: string;
}

interface Props {
  doanId: number;
  tenDoan?: string;
  /** Đoàn đã quyết toán → khóa thêm/sửa/xóa (trừ admin, do lockGuard ở hook). */
  locked?: boolean;
  /** Chọn thẻ để in CHUNG với KS trong tour — state ở ChiPhiKSSection. */
  selectedKsIds: Set<number>;
  onToggleSelect: (ksId: number) => void;
}

export default function KSNgoaiTourPanel({
  doanId, tenDoan = "", locked = false, selectedKsIds, onToggleSelect,
}: Props) {
  const { data: chiPhiRows = [] } = useChiPhiList(doanId);
  const { data: ksList = [] } = useKhachSanList();
  const { data: nccList = [] } = useNhaCungCapList();
  const { data: dnttList = [] } = useDNTTList(doanId);
  const upsert = useUpsertChiPhi();
  const del = useDeleteChiPhi();
  const cancelMut = useCancelDNTT();
  const { data: currentUserName = "" } = useCurrentUserName();

  const ksInfoMap = useMemo(() => {
    const m: Record<number, KsInfo> = {};
    ksList.forEach((k) => { m[k.id] = { ten: k.ten, nccId: k.nha_cung_cap_id ?? null }; });
    return m;
  }, [ksList]);
  const nccInfoMap = useMemo(() => {
    const m: Record<number, NccInfo> = {};
    nccList.forEach((n) => { m[n.id] = { ten: n.ten, stk: n.so_tai_khoan, bank: n.ngan_hang }; });
    return m;
  }, [nccList]);
  const ksOptions: KsOpt[] = useMemo(
    () => ksList.map((k) => ({ value: String(k.id), label: k.ten })),
    [ksList],
  );

  const savedRows = chiPhiRows.filter((r) => r.danh_muc === "khach_san" && r.ngoai_tour);

  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [dinhKyByKs, setDinhKyByKs] = useState<Record<number, boolean>>({});
  const [picking, setPicking] = useState(false);
  const [modalKsId, setModalKsId] = useState<number | null>(null);
  const [canTruByKs, setCanTruByKs] = useState<Record<number, CanTruSelection[]>>({});
  const [previewItems, setPreviewItems] = useState<EdgeFunctionData[] | null>(null);
  const tmpIdRef = useRef(0);
  const savingRef = useRef<Set<number>>(new Set());

  // ── ĐNTT per-thẻ (lọc theo ref_loai riêng) ────────────────────────────────
  const ngoaiTourDntts = useMemo(
    () => dnttList.filter((d) => d.ref_loai === REF_LOAI_NGOAI_TOUR),
    [dnttList],
  );
  const liveDnttsFor = (ksId: number): DNTTRow[] =>
    ngoaiTourDntts.filter((d) => d.ref_id === ksId &&
      d.trang_thai_duyet !== "da_huy" && d.trang_thai_duyet !== "tu_choi");
  const cardStatus = (ksId: number): string => {
    const live = liveDnttsFor(ksId);
    if (live.length === 0) return "chua_de_nghi";
    if (live.every((d) => d.payment_status === "paid")) return "da_thanh_toan";
    if (live.some((d) => d.trang_thai_duyet === "cho_duyet")) return "cho_duyet";
    return "da_duyet";
  };
  const cardDaCoc = (ksId: number): number =>
    liveDnttsFor(ksId).reduce((s, d) => s + Number(d.so_tien || 0), 0);
  const cardDaTT = (ksId: number): number =>
    liveDnttsFor(ksId).reduce((s, d) => s + Number(d.paid_amount || 0), 0);
  const cardNet = (ksId: number): number =>
    savedRows.filter((r) => r.khach_san_id === ksId).reduce((s, r) => s + (Number(r.tien_cong_ty) || 0), 0);
  // Thẻ đã cam kết (có ĐNTT sống) → khóa sửa số liệu các dòng.
  const cardCommitted = (ksId: number): boolean =>
    liveDnttsFor(ksId).length > 0 ||
    savedRows.some((r) => r.khach_san_id === ksId && (Number(r.so_tien_da_dntt) || 0) > 0);

  // Các khách sạn đang có dòng (đã lưu hoặc draft)
  const ksIds = useMemo(() => {
    const s = new Set<number>();
    savedRows.forEach((r) => { if (r.khach_san_id != null) s.add(r.khach_san_id); });
    drafts.forEach((d) => s.add(d.khachSanId));
    return [...s];
  }, [savedRows, drafts]);

  const effectiveDinhKy = (ksId: number): boolean => {
    if (dinhKyByKs[ksId] !== undefined) return dinhKyByKs[ksId];
    const rows = savedRows.filter((r) => r.khach_san_id === ksId);
    // Mặc định TẮT — KS ngoài tour ưu tiên tạo ĐNTT theo đoàn; bật định kỳ thủ công.
    return rows.length > 0 ? rows.every((r) => !!r.thanh_toan_dinh_ky) : false;
  };

  const updateDraft = (tmpId: number, patch: Partial<Draft>) =>
    setDrafts((prev) => prev.map((d) => (d.tmpId === tmpId ? { ...d, ...patch } : d)));
  const removeDraft = (tmpId: number) =>
    setDrafts((prev) => prev.filter((d) => d.tmpId !== tmpId));

  const addDraft = (khachSanId: number, loaiRow: KsNgoaiTourLoaiRow) => {
    tmpIdRef.current += 1;
    setDrafts((prev) => [...prev, {
      tmpId: tmpIdRef.current, khachSanId, loaiRow,
      loaiPhong: "", soPhong: "1", focCount: "0", ci: "", co: "", giaPhong: "",
    }]);
  };

  const trySaveDraft = (d: Draft) => {
    const gia = Number(onlyDigits(d.giaPhong));
    if (!d.loaiPhong.trim() || gia <= 0) return;          // chưa đủ điều kiện lưu
    if (savingRef.current.has(d.tmpId)) return;            // tránh insert trùng
    savingRef.current.add(d.tmpId);
    const info = ksInfoMap[d.khachSanId];
    upsert.mutate(
      buildKsNgoaiTourPayload({
        doanId, khachSanId: d.khachSanId, nccId: info?.nccId ?? null, loaiRow: d.loaiRow,
        loaiPhong: d.loaiPhong, soPhong: Number(onlyDigits(d.soPhong)) || 0,
        focCount: Number(d.focCount) || 0, ci: d.ci || null, co: d.co || null,
        giaPhong: gia, dinhKy: effectiveDinhKy(d.khachSanId),
      }),
      {
        onSuccess: () => { toast.success("Đã thêm dòng KS ngoài tour"); removeDraft(d.tmpId); },
        onError: (e: unknown) => toast.error("Lỗi: " + (errMsg(e) || "")),
        onSettled: () => savingRef.current.delete(d.tmpId),
      },
    );
  };

  const toggleCardDinhKy = (ksId: number, v: boolean) => {
    const rows = savedRows.filter((r) => r.khach_san_id === ksId);
    // 2 đường thanh toán loại trừ: KHÔNG cho ĐỔI cách thanh toán (bật/tắt định kỳ)
    // khi thẻ còn ĐNTT sống. Hủy ĐNTT trước.
    if (cardCommitted(ksId)) {
      toast.error("Thẻ đang có ĐNTT sống — hủy ĐNTT trước khi đổi cách thanh toán.");
      return;
    }
    setDinhKyByKs((prev) => ({ ...prev, [ksId]: v }));
    rows.forEach((r) => {
      upsert.mutate({ id: r.id, doan_id: doanId, thanh_toan_dinh_ky: v });
    });
  };

  const handleDelete = (row: ChiPhiRow) => {
    del.mutate({ id: row.id, doanId, mo_ta: row.mo_ta, danh_muc: "khach_san" }, {
      onSuccess: () => toast.success("Đã xóa"),
    });
  };

  const handleCancelDntt = async (ksId: number) => {
    const toCancel = liveDnttsFor(ksId).filter((d) => (Number(d.paid_amount) || 0) === 0);
    if (toCancel.length === 0) { toast.error("Không có ĐNTT chưa thanh toán để hủy"); return; }
    try {
      for (const d of toCancel) await cancelMut.mutateAsync({ id: d.id, mode: undefined });
      toast.success("Đã hủy ĐNTT");
    } catch (e: unknown) {
      toast.error("Lỗi: " + (errMsg(e) || ""));
    }
  };

  // Map dòng KS ngoài tour → LocalKSRow để KSDNTTModal dựng allocations + mô tả.
  // thanh_tien = NET (tien_cong_ty) — modal chia allocation pro-rata theo field này.
  const toLocalKSRow = (r: ChiPhiRow): LocalKSRow => ({
    id: r.id,
    khach_san_id: r.khach_san_id ?? 0,
    doan_ngay_id: 0,
    ngay_date: r.ngoai_tour_ci ?? "",
    loai_phong: r.mo_ta ?? "",
    so_phong: Number(r.so_luong) || 0,
    ci: r.ngoai_tour_ci ?? "",
    co: r.ngoai_tour_co ?? "",
    so_dem: nightsBetween(r.ngoai_tour_ci, r.ngoai_tour_co),
    gia_phong: Number(r.don_gia) || 0,
    thanh_tien: Math.round(Number(r.tien_cong_ty) || 0),
    loai_row: (r.loai_row as KSLoaiRow) ?? "phong",
    foc_count: Number(r.foc_count) || 0,
    is_hdv: false,
  });

  // Hotels (id, tên, blob NH) cho builder in dùng chung.
  const hotels = useMemo(
    () => ksList.map((k) => ({ id: k.id, ten: k.ten, tai_khoan_thanh_toan: k.tai_khoan_thanh_toan })),
    [ksList],
  );

  // In ĐNTT 1 thẻ (Word) — tái dùng builder chung + DNTTKSPreviewModal.
  const handlePrintCard = (ksId: number) => {
    const data = buildNgoaiTourSelectedData(
      [ksId], chiPhiRows, dnttList, hotels, tenDoan || `#${doanId}`, currentUserName);
    if (data.length === 0) { toast.error("Chưa có ĐNTT để in"); return; }
    setPreviewItems(data);
  };

  const modalKs = modalKsId != null ? savedRows.filter((r) => r.khach_san_id === modalKsId) : [];
  const modalNcc = modalKsId != null && ksInfoMap[modalKsId]?.nccId != null
    ? nccInfoMap[ksInfoMap[modalKsId].nccId!] : null;

  return (
    <div className="mt-2 rounded-md border border-dashed border-blue-200 bg-blue-50/30 p-3 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold text-blue-900">
          🏨 Khách sạn ngoài tour
          <span className="ml-1.5 font-normal text-muted-foreground">
            (KS không nằm trong lịch trình — đêm phụ, KS cho HDV…)
          </span>
        </span>
        {!locked && !picking && (
          <Button size="sm" variant="outline" className="h-7 text-xs gap-1 shrink-0"
            onClick={() => setPicking(true)}>
            <Plus className="h-3 w-3" /> Thêm khách sạn ngoài tour
          </Button>
        )}
      </div>

      {/* (Chọn để in CHUNG với KS trong tour — toolbar ở ChiPhiKSSection; checkbox trên từng thẻ) */}

      {/* Picker: chỉ chọn khách sạn → tạo thẻ + 1 dòng phòng trống để điền */}
      {picking && (
        <div className="flex items-center gap-2 rounded-md border border-blue-200 bg-white px-2 py-1.5">
          <Hotel className="h-3.5 w-3.5 text-blue-700 shrink-0" />
          <SearchableSelect
            options={ksOptions}
            value=""
            autoOpen
            onChange={(v) => { if (v) { addDraft(Number(v), "phong"); setPicking(false); } }}
            onClose={() => setPicking(false)}
            placeholder="Chọn khách sạn…"
            className="w-[280px] h-7 text-xs"
          />
          <button onClick={() => setPicking(false)} className="text-muted-foreground hover:text-foreground p-1" title="Hủy">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {ksIds.length === 0 && !picking && (
        <p className="text-xs text-muted-foreground">Chưa có khách sạn ngoài tour.</p>
      )}

      {/* 1 thẻ / khách sạn */}
      {ksIds.map((ksId) => {
        const hotelName = ksInfoMap[ksId]?.ten ?? `KS #${ksId}`;
        const cardSaved = savedRows.filter((r) => r.khach_san_id === ksId);
        const cardDrafts = drafts.filter((d) => d.khachSanId === ksId);
        const cardDinhKy = effectiveDinhKy(ksId);
        const committed = cardCommitted(ksId);
        const subtotal =
          cardSaved.reduce((s, r) => s + (Number(r.tien_cong_ty) || 0), 0) +
          cardDrafts.reduce((s, d) => s + calcKsNgoaiTourThanhTien(
            Number(onlyDigits(d.soPhong)) || 0, Number(d.focCount) || 0, Number(onlyDigits(d.giaPhong)) || 0,
            d.loaiRow === "phong" ? nightsBetween(d.ci || null, d.co || null) : 1,
          ), 0);
        const status = cardStatus(ksId);
        const daTT = cardDaTT(ksId);
        const daCoc = cardDaCoc(ksId);
        const netVal = cardNet(ksId);
        const remaining = Math.max(0, netVal - daCoc);
        // ĐNTT đã cam kết ≠ net hiện tại (đổi net qua đường khác / cọc đã trả 1 phần) → cảnh báo.
        const lech = committed && daCoc !== netVal;
        const liveCount = liveDnttsFor(ksId).length;
        const hasCancellable = liveDnttsFor(ksId).some((d) => (Number(d.paid_amount) || 0) === 0);
        const badge = STATUS_BADGE[status] ?? STATUS_BADGE.chua_de_nghi;

        return (
          <div key={ksId} className="rounded-md border border-blue-100 bg-white">
            {/* Header thẻ */}
            <div className="flex items-center justify-between gap-2 px-3 py-1.5 bg-blue-50/60 border-b border-blue-100">
              <div className="flex items-center gap-2">
                {!cardDinhKy && liveCount > 0 && (
                  <Checkbox checked={selectedKsIds.has(ksId)}
                    onCheckedChange={() => onToggleSelect(ksId)}
                    title="Chọn để in chung với KS trong tour" />
                )}
                <span className="text-xs font-semibold text-blue-900">{hotelName}</span>
              </div>
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-1 text-[11px] text-muted-foreground cursor-pointer">
                  <Checkbox checked={cardDinhKy} disabled={locked}
                    onCheckedChange={(c) => toggleCardDinhKy(ksId, !!c)} />
                  Định kỳ
                </label>
                <span className="text-xs font-medium text-blue-900 tabular-nums">{fmt(subtotal)} ₫</span>
                {!locked && (
                  <div className="flex items-center gap-1">
                    <Button size="sm" variant="ghost" className="h-6 px-2 text-[11px] text-blue-700"
                      onClick={() => addDraft(ksId, "phong")}>
                      <Plus className="h-3 w-3 mr-0.5" /> Phòng
                    </Button>
                    <Button size="sm" variant="ghost" className="h-6 px-2 text-[11px] text-orange-600"
                      onClick={() => addDraft(ksId, "dich_vu_khac")}>
                      <Plus className="h-3 w-3 mr-0.5" /> Dịch vụ
                    </Button>
                  </div>
                )}
              </div>
            </div>

            <div className="overflow-x-auto">
            <table className="w-full text-xs min-w-[760px]">
              <thead>
                <tr className="text-muted-foreground">
                  <th className="py-1 px-1.5 text-left font-medium">Loại phòng / DV</th>
                  <th className="py-1 px-1.5 text-right font-medium w-[70px]">Số phòng</th>
                  <th className="py-1 px-1.5 text-right font-medium w-[60px]">FOC</th>
                  <th className="py-1 px-1.5 text-left font-medium w-[115px]">C/I</th>
                  <th className="py-1 px-1.5 text-left font-medium w-[115px]">C/O</th>
                  <th className="py-1 px-1.5 text-center font-medium w-[45px]">Đêm</th>
                  <th className="py-1 px-1.5 text-right font-medium w-[110px]">Giá/phòng</th>
                  <th className="py-1 px-1.5 text-right font-medium w-[120px]">Thành tiền</th>
                  <th className="py-1 px-1.5 w-8" />
                </tr>
              </thead>
              <tbody>
                {cardSaved.map((row) => (
                  <SavedRoomRow
                    key={row.id}
                    row={row}
                    doanId={doanId}
                    nccId={ksInfoMap[ksId]?.nccId ?? null}
                    cardDinhKy={cardDinhKy}
                    committed={committed}
                    locked={locked}
                    onDelete={() => handleDelete(row)}
                  />
                ))}
                {cardDrafts.map((d) => {
                  const soDem = d.loaiRow === "phong" ? nightsBetween(d.ci || null, d.co || null) : 1;
                  const tt = calcKsNgoaiTourThanhTien(
                    Number(onlyDigits(d.soPhong)) || 0, Number(d.focCount) || 0, Number(onlyDigits(d.giaPhong)) || 0, soDem);
                  return (
                    <tr key={`d${d.tmpId}`} className="border-t border-blue-100/60 bg-amber-50/40">
                      <td className="py-1 px-1.5">
                        <Input autoFocus value={d.loaiPhong}
                          onChange={(e) => updateDraft(d.tmpId, { loaiPhong: e.target.value })}
                          onBlur={() => trySaveDraft({ ...d })}
                          placeholder={d.loaiRow === "phong" ? "VD: 19 twn 8 dbl" : "Tên dịch vụ"}
                          className="h-7 text-xs" />
                      </td>
                      <td className="py-1 px-1.5">
                        <Input inputMode="numeric" value={d.soPhong}
                          onChange={(e) => updateDraft(d.tmpId, { soPhong: onlyDigits(e.target.value) })}
                          className="h-7 text-xs text-right tabular-nums" />
                      </td>
                      <td className="py-1 px-1.5">
                        <Input inputMode="decimal" value={d.focCount}
                          onChange={(e) => updateDraft(d.tmpId, { focCount: e.target.value.replace(/[^\d.]/g, "") })}
                          className="h-7 text-xs text-right tabular-nums" />
                      </td>
                      <td className="py-1 px-1.5">
                        <DatePicker value={d.ci} onChange={(v) => updateDraft(d.tmpId, { ci: v })}
                          placeholder="C/I" className="w-full h-7 text-xs px-2" disabled={d.loaiRow !== "phong"} />
                      </td>
                      <td className="py-1 px-1.5">
                        <DatePicker value={d.co} onChange={(v) => updateDraft(d.tmpId, { co: v })}
                          placeholder="C/O" className="w-full h-7 text-xs px-2" defaultMonth={d.ci || undefined}
                          disabled={d.loaiRow !== "phong"} />
                      </td>
                      <td className="py-1 px-1.5 text-center tabular-nums">{d.loaiRow === "phong" ? soDem : "—"}</td>
                      <td className="py-1 px-1.5">
                        <Input inputMode="numeric" value={d.giaPhong}
                          onChange={(e) => updateDraft(d.tmpId, { giaPhong: onlyDigits(e.target.value) })}
                          onBlur={() => trySaveDraft({ ...d })}
                          placeholder="0" className="h-7 text-xs text-right tabular-nums" />
                      </td>
                      <td className="py-1 px-1.5 text-right tabular-nums font-medium text-blue-900">{fmt(tt)} ₫</td>
                      <td className="py-1 px-1.5 text-center">
                        <button onClick={() => removeDraft(d.tmpId)} className="text-muted-foreground hover:text-destructive p-1" title="Bỏ dòng">
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            </div>

            {/* Footer ĐNTT mức thẻ (pattern KS trong tour) */}
            <div className="flex items-center justify-between gap-2 px-3 py-1.5 border-t border-blue-100 bg-blue-50/30">
              {cardDinhKy ? (
                <span className="text-[11px] text-muted-foreground italic">→ Thanh toán định kỳ (gộp theo NCC)</span>
              ) : (
                <div className="flex items-center gap-2 text-[11px]">
                  <span className={`px-1.5 py-0.5 rounded font-medium ${badge.cls}`}>{badge.label}</span>
                  {daTT > 0 && <span className="text-emerald-700">Đã TT: {fmt(daTT)} ₫</span>}
                  {daCoc > daTT && <span className="text-amber-600">Tổng đề nghị: {fmt(daCoc)} ₫</span>}
                  {lech && (
                    <span className="px-1.5 py-0.5 rounded bg-red-100 text-red-700 font-medium"
                      title="ĐNTT đã cam kết khác tổng tiền hiện tại — hủy ĐNTT chưa trả & tạo lại, hoặc xử lý ở trang Đề nghị thanh toán">
                      ⚠ ĐNTT lệch {fmt(Math.abs(daCoc - netVal))} ₫
                    </span>
                  )}
                </div>
              )}
              {!cardDinhKy && (
                <div className="flex items-center gap-1">
                  {liveCount > 0 && (
                    <Button size="sm" variant="ghost" className="h-6 px-2 text-[11px] text-blue-700"
                      onClick={() => handlePrintCard(ksId)}>
                      <Printer className="h-3 w-3 mr-0.5" /> In
                    </Button>
                  )}
                  {!locked && hasCancellable && (
                    <Button size="sm" variant="ghost" className="h-6 px-2 text-[11px] text-red-600 hover:text-red-700"
                      disabled={cancelMut.isPending}
                      onClick={() => handleCancelDntt(ksId)}>
                      <Ban className="h-3 w-3 mr-0.5" /> Hủy ĐNTT
                    </Button>
                  )}
                  {!locked && remaining > 0 && cardSaved.length > 0 && (
                    <Button size="sm" variant="outline" className="h-6 px-2 text-[11px]"
                      onClick={() => setModalKsId(ksId)}>
                      <ArrowRight className="h-3 w-3 mr-0.5" /> Đề nghị TT: {fmt(remaining)}
                    </Button>
                  )}
                </div>
              )}
            </div>
          </div>
        );
      })}

      {/* Modal tạo ĐNTT (tái dùng KSDNTTModal, refLoai riêng) */}
      {modalKsId != null && (
        <KSDNTTModal
          open
          onClose={() => setModalKsId(null)}
          doanId={doanId}
          ksId={modalKsId}
          ksName={ksInfoMap[modalKsId]?.ten ?? `KS #${modalKsId}`}
          nccId={ksInfoMap[modalKsId]?.nccId ?? null}
          nccTen={modalNcc?.ten ?? null}
          nccStk={modalNcc?.stk ?? null}
          nccNganHang={modalNcc?.bank ?? null}
          totalKS={cardNet(modalKsId)}
          daCoc={cardDaCoc(modalKsId)}
          localRows={modalKs.map(toLocalKSRow)}
          chiPhiRowIds={modalKs.map((r) => r.id)}
          canTru={canTruByKs[modalKsId] ?? []}
          onCanTruChange={(v) => setCanTruByKs((prev) => ({ ...prev, [modalKsId]: v }))}
          tenDoanMoi={tenDoan}
          serviceDate={modalKs.map((r) => r.ngoai_tour_ci).filter(Boolean).sort()[0] || undefined}
          refLoai={REF_LOAI_NGOAI_TOUR}
        />
      )}

      {/* Xem trước + xuất Word Giấy đề nghị thanh toán KS */}
      <DNTTKSPreviewModal
        open={!!previewItems}
        items={previewItems ?? []}
        onClose={() => setPreviewItems(null)}
      />
    </div>
  );
}

// 1 dòng KS ngoài tour ĐÃ LƯU — local state seed 1 lần (key=row.id), blur-save.
// Khóa sửa khi thẻ đã cam kết ĐNTT (committed) hoặc đoàn quyết toán (locked).
function SavedRoomRow({
  row, doanId, nccId, cardDinhKy, committed, locked, onDelete,
}: {
  row: ChiPhiRow;
  doanId: number;
  nccId: number | null;
  cardDinhKy: boolean;
  committed: boolean;
  locked: boolean;
  onDelete: () => void;
}) {
  const upsert = useUpsertChiPhi();
  const loaiRow: KsNgoaiTourLoaiRow = row.loai_row === "phong" || row.loai_row == null ? "phong" : "dich_vu_khac";
  const [loaiPhong, setLoaiPhong] = useState(row.mo_ta ?? "");
  const [soPhong, setSoPhong] = useState(String(Math.round(Number(row.so_luong) || 0)));
  const [focCount, setFocCount] = useState(String(Number(row.foc_count) || 0));
  const [ci, setCi] = useState(row.ngoai_tour_ci ?? "");
  const [co, setCo] = useState(row.ngoai_tour_co ?? "");
  const [giaPhong, setGiaPhong] = useState(String(Math.round(Number(row.don_gia) || 0)));

  const soDem = loaiRow === "phong" ? nightsBetween(ci || null, co || null) : 1;
  const thanhTien = calcKsNgoaiTourThanhTien(
    Number(onlyDigits(soPhong)) || 0, Number(focCount) || 0, Number(onlyDigits(giaPhong)) || 0, soDem);

  const editLocked = locked || committed;

  const save = (override: Partial<{ loaiPhong: string; soPhong: string; focCount: string; ci: string; co: string; giaPhong: string }> = {}) => {
    if (committed) { toast.error("Thẻ đã có ĐNTT — hủy ĐNTT trước khi sửa số liệu."); return; }
    const next = { loaiPhong, soPhong, focCount, ci, co, giaPhong, ...override };
    if (Number(onlyDigits(next.giaPhong)) <= 0) { toast.error("Giá/phòng phải lớn hơn 0"); return; }
    upsert.mutate(
      buildKsNgoaiTourPayload({
        id: row.id, doanId, khachSanId: row.khach_san_id ?? null, nccId, loaiRow,
        loaiPhong: next.loaiPhong, soPhong: Number(onlyDigits(next.soPhong)) || 0,
        focCount: Number(next.focCount) || 0, ci: next.ci || null, co: next.co || null,
        giaPhong: Number(onlyDigits(next.giaPhong)), dinhKy: cardDinhKy,
      }),
      { onError: (e: unknown) => toast.error("Lỗi lưu: " + (errMsg(e) || "")) },
    );
  };

  const numChanged = (a: string, b: number) => Number(onlyDigits(a)) !== Math.round(b);

  return (
    <tr className="border-t border-blue-100/60">
      <td className="py-1 px-1.5">
        <div className="flex items-center gap-1">
          {committed && (
            <span title="Thẻ đã có ĐNTT — hủy ĐNTT để sửa số liệu" className="shrink-0 text-[11px] leading-none">🔒</span>
          )}
          <Input value={loaiPhong} disabled={editLocked}
            onChange={(e) => setLoaiPhong(e.target.value)}
            onBlur={() => { if (loaiPhong !== (row.mo_ta ?? "")) save(); }}
            className="h-7 text-xs" />
        </div>
      </td>
      <td className="py-1 px-1.5">
        <Input inputMode="numeric" value={soPhong} disabled={editLocked}
          onChange={(e) => setSoPhong(onlyDigits(e.target.value))}
          onBlur={() => { if (numChanged(soPhong, Number(row.so_luong) || 0)) save(); }}
          className="h-7 text-xs text-right tabular-nums" />
      </td>
      <td className="py-1 px-1.5">
        <Input inputMode="decimal" value={focCount} disabled={editLocked}
          onChange={(e) => setFocCount(e.target.value.replace(/[^\d.]/g, ""))}
          onBlur={() => { if ((Number(focCount) || 0) !== (Number(row.foc_count) || 0)) save(); }}
          className="h-7 text-xs text-right tabular-nums" />
      </td>
      <td className="py-1 px-1.5">
        <DatePicker value={ci} onChange={(v) => { setCi(v); save({ ci: v }); }}
          placeholder="C/I" className="w-full h-7 text-xs px-2" disabled={editLocked || loaiRow !== "phong"} />
      </td>
      <td className="py-1 px-1.5">
        <DatePicker value={co} onChange={(v) => { setCo(v); save({ co: v }); }}
          placeholder="C/O" className="w-full h-7 text-xs px-2" defaultMonth={ci || undefined}
          disabled={editLocked || loaiRow !== "phong"} />
      </td>
      <td className="py-1 px-1.5 text-center tabular-nums">{loaiRow === "phong" ? soDem : "—"}</td>
      <td className="py-1 px-1.5">
        <Input inputMode="numeric" value={giaPhong} disabled={editLocked}
          onChange={(e) => setGiaPhong(onlyDigits(e.target.value))}
          onBlur={() => { if (numChanged(giaPhong, Number(row.don_gia) || 0)) save(); }}
          className="h-7 text-xs text-right tabular-nums" />
      </td>
      <td className="py-1 px-1.5 text-right tabular-nums font-medium text-blue-900">{fmt(thanhTien)} ₫</td>
      <td className="py-1 px-1.5 text-center">
        {!locked && !committed && (
          <button onClick={onDelete} className="text-muted-foreground hover:text-destructive p-1" title="Xóa">
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}
      </td>
    </tr>
  );
}
