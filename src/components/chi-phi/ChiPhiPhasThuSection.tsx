import { useState, useEffect, useRef } from "react";
import { differenceInDays, parseISO } from "date-fns";
import { Plus, Trash2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { DecimalInput } from "@/components/ui/decimal-input";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { shouldCollectTip } from "@/lib/tip-calc";
import { parsePhaiThuExtras, type PhaiThuExtra } from "@/lib/phai-thu-calc";
import { t, useTranslate } from "@/lib/i18n";
import { useUpdateDoanTip } from "@/hooks/use-doan";
import type { HDVDoanInfo } from "./ChiPhiHDVSection";

// Default đơn giá NDT/khách/ngày khi không có override + theo có/không T/L.
const NDT_TIP_CO_TL = 150;
const NDT_TIP_KHONG_TL = 300;
const fmt = (n: number) => n.toLocaleString("vi-VN");

type LoaiTien = "NDT" | "NT$" | "US$" | "USD" | "VND";
type NguoiThu = "cong_ty" | "hdv";
interface ExtraRow { id: number; moTa: string; soTien: number; loaiTien: LoaiTien; tyGia: number; nguoiThu: NguoiThu }
const LOAI_TIEN_LABEL: Record<LoaiTien, string> = { NDT: "NDT", "NT$": "NT$", "US$": "US$", USD: "USD", VND: "VND" };

interface Props {
  doanId: number;
  doan?: HDVDoanInfo;
  /** Đoàn đã quyết toán → khóa sửa con số chi phí (trừ admin). */
  locked?: boolean;
}

export default function ChiPhiPhasThuSection({ doanId, doan, locked = false }: Props) {
  useTranslate();
  const updateTip = useUpdateDoanTip();

  // ── Tính auto từ doan ─────────────────────────────────────────────────────
  const soKhachTotal =
    (doan?.so_khach_lon ?? 0) + (doan?.so_khach_em1 ?? 0) +
    (doan?.so_khach_em2 ?? 0) + (doan?.so_khach_tl ?? 0) ||
    doan?.so_khach || 0;
  const soKhachTl = doan?.so_khach_tl ?? 0;
  const autoSoKhach = Math.max(0, soKhachTotal - soKhachTl); // T/L không đóng tip
  const autoSoNgay = doan?.ngay_di && doan?.ngay_ve
    ? Math.max(1, differenceInDays(parseISO(doan.ngay_ve), parseISO(doan.ngay_di)) + 1)
    : 0;
  const coTL = soKhachTl > 0;
  const autoRate = coTL ? NDT_TIP_CO_TL : NDT_TIP_KHONG_TL;

  // ── Effective = override ?? auto (sync 2 chiều với Điều tour > TipSection) ─
  const effSoKhach = doan?.tip_so_khach_override ?? autoSoKhach;
  const effSoNgay = doan?.tip_so_ngay_override ?? autoSoNgay;
  const effRate = doan?.tip_rate ?? autoRate;

  // ── Local input state (cho gõ mượt, sync khi doan đổi) ────────────────────
  const [localSoKhach, setLocalSoKhach] = useState(String(effSoKhach || ""));
  const [localSoNgay, setLocalSoNgay] = useState(String(effSoNgay || ""));
  const [localRate, setLocalRate] = useState(effRate);
  useEffect(() => { setLocalSoKhach(String(effSoKhach || "")); }, [effSoKhach]);
  useEffect(() => { setLocalSoNgay(String(effSoNgay || "")); }, [effSoNgay]);
  useEffect(() => { setLocalRate(effRate); }, [effRate]);

  // Save handler: nếu giá trị mới = auto → set NULL (revert override),
  // ngược lại lưu override. Tránh save khi không đổi.
  const saveOverride = (field: "tip_so_khach_override" | "tip_so_ngay_override", val: number, autoVal: number, currentOverride: number | null | undefined) => {
    const next = val === autoVal ? null : val;
    if (next === (currentOverride ?? null)) return;
    updateTip.mutate({ id: doanId, [field]: next });
  };
  const saveRate = (val: number) => {
    const next = val === autoRate ? null : val;
    if (next === (doan?.tip_rate ?? null)) return;
    updateTip.mutate({ id: doanId, tip_rate: next });
  };

  // ── Tip currency (persist doan.tip_currency) ──────────────────────────────
  const effTipCurrency = (doan?.tip_currency ?? "NDT") as LoaiTien;
  const [tipLoaiTien, setTipLoaiTien] = useState<LoaiTien>(effTipCurrency);
  useEffect(() => { setTipLoaiTien(effTipCurrency); }, [effTipCurrency]);
  const handleTipCurrencyChange = (v: LoaiTien) => {
    setTipLoaiTien(v);
    if (v !== (doan?.tip_currency ?? "NDT")) updateTip.mutate({ id: doanId, tip_currency: v });
  };

  // ── Tip tỷ giá (persist doan.tip_ty_gia; localStorage chỉ làm default cho đoàn mới) ─
  const effTyGia = doan?.tip_ty_gia ?? (Number(localStorage.getItem("hdv_ty_gia_ndt")) || 800);
  const [tyGia, setTyGia] = useState<number>(effTyGia || 800);
  useEffect(() => { setTyGia(effTyGia || 800); }, [effTyGia]);
  const handleTyGiaChange = (v: number) => {
    setTyGia(v);
    localStorage.setItem("hdv_ty_gia_ndt", String(v)); // seed default cho đoàn mới
  };
  const saveTyGia = (v: number) => {
    if (v !== (doan?.tip_ty_gia ?? null)) updateTip.mutate({ id: doanId, tip_ty_gia: v || null });
  };

  // ── Người thu tip (persist doan.tip_nguoi_thu) ────────────────────────────
  const tipNguoiThu = (doan?.tip_nguoi_thu ?? "hdv") as NguoiThu;
  const toggleTipNguoiThu = () =>
    updateTip.mutate({ id: doanId, tip_nguoi_thu: tipNguoiThu === "cong_ty" ? "hdv" : "cong_ty" });

  // ── Có thu tip không (bỏ tích "Thu tiền tip" ở Điều tour → ẩn dòng tip) ────
  const showTipRow = shouldCollectTip(doan?.thu_tip, effSoKhach, effSoNgay);

  // ── Tổng tip (NDT + VND) — respect tip_lump_sum override (set ở TipSection) ─
  const computedTip = effSoKhach * effSoNgay * effRate;
  const tongTip = showTipRow ? (doan?.tip_lump_sum ?? computedTip) : 0;
  const tongVND = tongTip * tyGia;

  // ── "Thu tiền đầu khách" — per-pax × đơn giá. Currency luôn VND (tỷ giá = 1).
  //    Default rate = 200.000. Số khách default = autoSoKhach (skip T/L) —
  //    OP có thể override qua dau_khach_so_khach_override.
  const DK_DEFAULT_RATE = 200_000;
  const VP_DEFAULT_AMOUNT = 200_000;
  const dkRate = doan?.dau_khach_rate ?? DK_DEFAULT_RATE;
  const dkNguoiThu = (doan?.dau_khach_nguoi_thu ?? "hdv") as NguoiThu;
  // Default = 0 — user phải nhập số khách thật khi muốn thu (không auto theo pax đoàn).
  const dkAutoSoKhach = 0;
  const dkEffSoKhach = doan?.dau_khach_so_khach_override ?? dkAutoSoKhach;
  const [dkLocalRate, setDkLocalRate] = useState(dkRate);
  const [dkLocalSoKhach, setDkLocalSoKhach] = useState(String(dkEffSoKhach || ""));
  useEffect(() => { setDkLocalRate(dkRate); }, [dkRate]);
  useEffect(() => { setDkLocalSoKhach(String(dkEffSoKhach || "")); }, [dkEffSoKhach]);
  const dkTong = dkEffSoKhach * dkLocalRate;
  const saveDk = (patch: Partial<{ dau_khach_rate: number | null; dau_khach_nguoi_thu: string | null; dau_khach_so_khach_override: number | null }>) =>
    updateTip.mutate({ id: doanId, ...patch });
  const saveDkSoKhach = (val: number) => {
    const next = val === dkAutoSoKhach ? null : val;
    if (next === (doan?.dau_khach_so_khach_override ?? null)) return;
    saveDk({ dau_khach_so_khach_override: next });
  };

  // ── "Thu tiền quỹ VP" — lump-sum cho cả đoàn. Currency luôn VND. Default 200k.
  const vpAmount = doan?.quy_vp_amount ?? VP_DEFAULT_AMOUNT;
  const vpNguoiThu = (doan?.quy_vp_nguoi_thu ?? "hdv") as NguoiThu;
  const [vpLocalAmount, setVpLocalAmount] = useState(vpAmount);
  useEffect(() => { setVpLocalAmount(vpAmount); }, [vpAmount]);
  const saveVp = (patch: Partial<{ quy_vp_amount: number | null; quy_vp_nguoi_thu: string | null }>) =>
    updateTip.mutate({ id: doanId, ...patch });

  // ── Extras (persist doan.phai_thu_extras) ─────────────────────────────────
  // Local state cho gõ mượt; persist toàn mảng xuống DB khi blur/đổi/thêm/xóa.
  // lastSavedRef = JSON đã lưu gần nhất → phân biệt thay đổi external (tab khác)
  // với chính ta vừa lưu, tránh clobber khi đang gõ.
  const extrasFromDoan = (): ExtraRow[] =>
    parsePhaiThuExtras(doan?.phai_thu_extras).map((e, i) => ({ id: i + 1, ...e }));
  const serverExtrasJson = JSON.stringify(parsePhaiThuExtras(doan?.phai_thu_extras));
  const lastSavedRef = useRef(serverExtrasJson);
  const [extraRows, setExtraRows] = useState<ExtraRow[]>(extrasFromDoan);
  useEffect(() => {
    // Chỉ re-sync khi server đổi do nguồn khác (không phải lần lưu của chính ta).
    if (serverExtrasJson !== lastSavedRef.current) {
      lastSavedRef.current = serverExtrasJson;
      setExtraRows(parsePhaiThuExtras(doan?.phai_thu_extras).map((e, i) => ({ id: i + 1, ...e })));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverExtrasJson]);

  const persistExtras = (rows: ExtraRow[]) => {
    const payload: PhaiThuExtra[] = rows.map(({ id: _id, ...r }) => r);
    const json = JSON.stringify(payload);
    if (json === lastSavedRef.current) return;
    lastSavedRef.current = json;
    updateTip.mutate({ id: doanId, phai_thu_extras: payload });
  };

  const addRow = () => {
    const next: ExtraRow = { id: Date.now(), moTa: "", soTien: 0, loaiTien: "NDT", tyGia, nguoiThu: "hdv" };
    setExtraRows((prev) => [...prev, next]);
  };
  const removeRow = (id: number) =>
    setExtraRows((prev) => {
      const next = prev.filter((r) => r.id !== id);
      persistExtras(next);
      return next;
    });
  // updateRow: chỉ cập nhật local (persist qua onBlur / commit riêng).
  const updateRow = <K extends keyof Omit<ExtraRow, "id">>(id: number, field: K, val: ExtraRow[K]) =>
    setExtraRows((prev) => prev.map((r) => (r.id === id ? { ...r, [field]: val } : r)));
  // commitRow: persist toàn mảng (gọi onBlur input / sau khi đổi select/toggle).
  const commitRow = (id: number, patch: Partial<Omit<ExtraRow, "id">>) =>
    setExtraRows((prev) => {
      const next = prev.map((r) => (r.id === id ? { ...r, ...patch } : r));
      persistExtras(next);
      return next;
    });
  const handleLoaiTienChange = (id: number, val: LoaiTien) =>
    commitRow(id, { loaiTien: val, ...(val === "VND" ? { tyGia: 1 } : {}) });

  const extraTotalVND = extraRows.reduce((s, r) => s + r.soTien * r.tyGia, 0);
  // dkVND/vpVND đã = VND (currency hardcode VND → tỷ giá = 1)
  const dkVND = dkTong;
  const vpVND = vpLocalAmount;
  const totalVND = tongVND + dkVND + vpVND + extraTotalVND;

  const hdvTotalVND =
    (showTipRow && tipNguoiThu === "hdv" ? tongVND : 0) +
    (dkNguoiThu === "hdv" ? dkVND : 0) +
    (vpNguoiThu === "hdv" ? vpVND : 0) +
    extraRows.filter((r) => r.nguoiThu === "hdv").reduce((s, r) => s + r.soTien * r.tyGia, 0);
  const ctTotalVND = totalVND - hdvTotalVND;

  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      <div className="px-4 py-2.5 bg-muted/30 border-b border-border flex items-center justify-between flex-wrap gap-2">
        <p className="text-sm font-semibold">💰 {t("Phải thu")}</p>
        <div className="flex items-center gap-3 flex-wrap">
          {totalVND > 0 && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              {ctTotalVND > 0 && (
                <span className="px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 font-medium">CT: {fmt(ctTotalVND)} ₫</span>
              )}
              {hdvTotalVND > 0 && (
                <span className="px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 font-medium">HDV: {fmt(hdvTotalVND)} ₫</span>
              )}
            </div>
          )}
          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={addRow} disabled={locked}>
            <Plus className="h-3 w-3 mr-1" /> {t("Thêm")}
          </Button>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="border-b border-border bg-muted/20 text-[11px] font-medium text-muted-foreground">
              <th className="text-left px-4 py-2.5">{t("Mục")}</th>
              <th className="text-center px-3 py-2.5">{t("Khách")}</th>
              <th className="text-center px-3 py-2.5">{t("Ngày")}</th>
              <th className="text-center px-3 py-2.5">{t("Đơn giá/khách/ngày")}</th>
              <th className="text-right px-3 py-2.5">{t("Tổng")}</th>
              <th className="text-center px-3 py-2.5">{t("Tỷ giá")}</th>
              <th className="text-right px-4 py-2.5">{t("Thành tiền VND")}</th>
              <th className="w-8" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {/* Tip row — ẩn khi bỏ tích "Thu tiền tip" ở Điều tour */}
            {showTipRow && (
            <tr className="hover:bg-muted/20">
              <td className="px-4 py-2.5 font-medium">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span>Tip</span>
                  <span className={cn(
                    "px-1.5 py-0.5 rounded text-[10px] font-medium",
                    coTL ? "bg-green-100 text-green-700" : "bg-orange-100 text-orange-700",
                  )}>
                    {coTL ? t("Có T/L") : t("Không T/L")}
                  </span>
                  <button
                    onClick={toggleTipNguoiThu}
                    disabled={locked}
                    className={cn(
                      "px-1.5 py-0.5 rounded text-[10px] font-medium border transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed",
                      tipNguoiThu === "hdv"
                        ? "bg-amber-50 text-amber-700 border-amber-200"
                        : "bg-blue-50 text-blue-700 border-blue-200",
                    )}
                  >
                    {tipNguoiThu === "hdv" ? t("HDV thu") : t("Công ty thu")}
                  </button>
                </div>
              </td>
              <td className="px-2 py-2 text-center">
                <Input
                  type="text"
                  inputMode="numeric"
                  value={localSoKhach}
                  onChange={(e) => setLocalSoKhach(e.target.value.replace(/\D/g, ""))}
                  onBlur={() => {
                    const v = localSoKhach ? Number(localSoKhach) : 0;
                    saveOverride("tip_so_khach_override", v, autoSoKhach, doan?.tip_so_khach_override);
                  }}
                  disabled={locked}
                  className={cn(
                    "h-6 text-xs px-1.5 py-0 text-center w-[48px] mx-auto",
                    doan?.tip_so_khach_override != null && "border-amber-300 text-amber-700",
                  )}
                  title={doan?.tip_so_khach_override != null ? `${t("Override")} (auto = ${autoSoKhach})` : t("Tự tính")}
                />
              </td>
              <td className="px-2 py-2 text-center">
                <Input
                  type="text"
                  inputMode="numeric"
                  value={localSoNgay}
                  onChange={(e) => setLocalSoNgay(e.target.value.replace(/\D/g, ""))}
                  onBlur={() => {
                    const v = localSoNgay ? Number(localSoNgay) : 0;
                    saveOverride("tip_so_ngay_override", v, autoSoNgay, doan?.tip_so_ngay_override);
                  }}
                  disabled={locked}
                  className={cn(
                    "h-6 text-xs px-1.5 py-0 text-center w-[48px] mx-auto",
                    doan?.tip_so_ngay_override != null && "border-amber-300 text-amber-700",
                  )}
                  title={doan?.tip_so_ngay_override != null ? `${t("Override")} (auto = ${autoSoNgay})` : t("Tự tính")}
                />
              </td>
              <td className="px-3 py-2 text-center">
                <div className="flex items-center gap-1 justify-center">
                  <DecimalInput
                    value={localRate}
                    onChange={(v) => { setLocalRate(v); saveRate(v); }}
                    disabled={locked}
                    className={cn(
                      "h-6 text-xs px-1.5 py-0 text-right w-[80px]",
                      doan?.tip_rate != null && "border-amber-300 text-amber-700",
                    )}
                  />
                  <Select value={tipLoaiTien} onValueChange={(v) => handleTipCurrencyChange(v as LoaiTien)} disabled={locked}>
                    <SelectTrigger className="h-6 text-xs px-1.5 w-[52px]">
                      <SelectValue>{tipLoaiTien}</SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="NDT">NDT</SelectItem>
                      <SelectItem value="NT$">NT$</SelectItem>
                      <SelectItem value="US$">US$</SelectItem>
                      <SelectItem value="USD">USD</SelectItem>
                      <SelectItem value="VND">VND</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </td>
              <td className="px-3 py-2.5 text-right font-semibold whitespace-nowrap">
                {tongTip > 0 ? `${fmt(tongTip)} ${LOAI_TIEN_LABEL[tipLoaiTien]}` : "—"}
              </td>
              <td className="px-3 py-2.5">
                <div className="flex justify-center">
                  <Input
                    type="number"
                    value={tyGia || ""}
                    onChange={(e) => handleTyGiaChange(Number(e.target.value) || 0)}
                    onBlur={() => saveTyGia(tyGia)}
                    disabled={locked}
                    className="h-6 text-xs px-1.5 py-0 text-center w-[72px]"
                  />
                </div>
              </td>
              <td className="px-4 py-2.5 text-right font-semibold text-primary whitespace-nowrap">
                {tyGia > 0 ? `${fmt(tongVND)} ₫` : "—"}
              </td>
              <td />
            </tr>
            )}

            {/* Thu tiền đầu khách — pax × đơn giá VND (no nhân ngày, no tỷ giá) */}
            <tr className="hover:bg-muted/20">
              <td className="px-4 py-2.5 font-medium">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span>{t("Thu tiền đầu khách")}</span>
                  <button
                    onClick={() => saveDk({ dau_khach_nguoi_thu: dkNguoiThu === "cong_ty" ? "hdv" : "cong_ty" })}
                    disabled={locked}
                    className={cn(
                      "px-1.5 py-0.5 rounded text-[10px] font-medium border transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed",
                      dkNguoiThu === "hdv"
                        ? "bg-amber-50 text-amber-700 border-amber-200"
                        : "bg-blue-50 text-blue-700 border-blue-200",
                    )}
                  >
                    {dkNguoiThu === "hdv" ? t("HDV thu") : t("Công ty thu")}
                  </button>
                </div>
              </td>
              <td className="px-2 py-2 text-center">
                <Input
                  type="text"
                  inputMode="numeric"
                  value={dkLocalSoKhach}
                  onChange={(e) => setDkLocalSoKhach(e.target.value.replace(/\D/g, ""))}
                  onBlur={() => saveDkSoKhach(dkLocalSoKhach ? Number(dkLocalSoKhach) : 0)}
                  disabled={locked}
                  className={cn(
                    "h-6 text-xs px-1.5 py-0 text-center w-[48px] mx-auto",
                    doan?.dau_khach_so_khach_override != null && "border-amber-300 text-amber-700",
                  )}
                  title={doan?.dau_khach_so_khach_override != null ? `${t("Đã chỉnh tay")}` : t("Mặc định 0 — nhập số khách muốn thu")}
                />
              </td>
              <td className="px-2 py-2 text-center text-muted-foreground">—</td>
              <td className="px-3 py-2 text-center">
                <div className="flex items-center gap-1 justify-center">
                  <DecimalInput
                    value={dkLocalRate}
                    onChange={(v) => { setDkLocalRate(v); saveDk({ dau_khach_rate: v }); }}
                    disabled={locked}
                    className="h-6 text-xs px-1.5 py-0 text-right w-[80px]"
                  />
                  <span className="text-[11px] text-muted-foreground w-[36px]">VND</span>
                </div>
              </td>
              <td className="px-3 py-2.5 text-right font-semibold whitespace-nowrap">
                {dkTong > 0 ? `${fmt(dkTong)} VND` : "—"}
              </td>
              <td className="px-3 py-2.5 text-center text-muted-foreground text-[11px]">—</td>
              <td className="px-4 py-2.5 text-right font-semibold text-primary whitespace-nowrap">
                {dkVND > 0 ? `${fmt(dkVND)} ₫` : "—"}
              </td>
              <td />
            </tr>

            {/* Thu tiền quỹ VP — lump-sum VND (no tỷ giá) */}
            <tr className="hover:bg-muted/20">
              <td className="px-4 py-2.5 font-medium">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span>{t("Thu tiền quỹ VP")}</span>
                  <button
                    onClick={() => saveVp({ quy_vp_nguoi_thu: vpNguoiThu === "cong_ty" ? "hdv" : "cong_ty" })}
                    disabled={locked}
                    className={cn(
                      "px-1.5 py-0.5 rounded text-[10px] font-medium border transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed",
                      vpNguoiThu === "hdv"
                        ? "bg-amber-50 text-amber-700 border-amber-200"
                        : "bg-blue-50 text-blue-700 border-blue-200",
                    )}
                  >
                    {vpNguoiThu === "hdv" ? t("HDV thu") : t("Công ty thu")}
                  </button>
                </div>
              </td>
              <td className="px-2 py-2 text-center text-muted-foreground">—</td>
              <td className="px-2 py-2 text-center text-muted-foreground">—</td>
              <td className="px-3 py-2 text-center">
                <div className="flex items-center gap-1 justify-center">
                  <Input
                    type="text"
                    inputMode="numeric"
                    value={vpLocalAmount || ""}
                    onChange={(e) => setVpLocalAmount(Number(e.target.value.replace(/\D/g, "")) || 0)}
                    onBlur={() => {
                      // Lưu cả 0 (đã xóa → không thu). KHÔNG lưu null khi xóa trống:
                      // null nghĩa là "chưa nhập" → computePhaiThu rơi về mặc định
                      // 200k → Excel in lại khoản user vừa xóa (bug 2026-06-12).
                      if (vpLocalAmount !== vpAmount) saveVp({ quy_vp_amount: vpLocalAmount });
                    }}
                    disabled={locked}
                    className="h-6 text-xs px-1.5 py-0 text-right w-[80px] [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    placeholder={t("Số tiền")}
                  />
                  <span className="text-[11px] text-muted-foreground w-[36px]">VND</span>
                </div>
              </td>
              <td className="px-3 py-2.5 text-right font-semibold whitespace-nowrap">
                {vpLocalAmount > 0 ? `${fmt(vpLocalAmount)} VND` : "—"}
              </td>
              <td className="px-3 py-2.5 text-center text-muted-foreground text-[11px]">—</td>
              <td className="px-4 py-2.5 text-right font-semibold text-primary whitespace-nowrap">
                {vpVND > 0 ? `${fmt(vpVND)} ₫` : "—"}
              </td>
              <td />
            </tr>

            {/* Extra rows */}
            {extraRows.map((row) => {
              const isVND = row.loaiTien === "VND";
              const thanhTienVND = row.soTien * row.tyGia;
              return (
                <tr key={row.id} className="hover:bg-muted/20">
                  <td className="px-4 py-2">
                    <div className="flex items-center gap-1.5">
                      <Input
                        value={row.moTa}
                        onChange={(e) => updateRow(row.id, "moTa", e.target.value)}
                        onBlur={() => commitRow(row.id, { moTa: row.moTa })}
                        disabled={locked}
                        className="h-6 text-xs px-1.5"
                        placeholder={t("Mô tả khoản thu...")}
                        autoFocus
                      />
                      <button
                        onClick={() => commitRow(row.id, { nguoiThu: row.nguoiThu === "cong_ty" ? "hdv" : "cong_ty" })}
                        disabled={locked}
                        className={cn(
                          "shrink-0 px-1.5 py-0.5 rounded text-[10px] font-medium border transition-colors cursor-pointer whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed",
                          row.nguoiThu === "hdv"
                            ? "bg-amber-50 text-amber-700 border-amber-200"
                            : "bg-blue-50 text-blue-700 border-blue-200",
                        )}
                      >
                        {row.nguoiThu === "hdv" ? t("HDV thu") : t("Công ty thu")}
                      </button>
                    </div>
                  </td>
                  <td className="px-3 py-2 text-center text-muted-foreground">—</td>
                  <td className="px-3 py-2 text-center text-muted-foreground">—</td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-1 justify-center">
                      <Input
                        type="number"
                        value={row.soTien || ""}
                        onChange={(e) => updateRow(row.id, "soTien", Number(e.target.value) || 0)}
                        onBlur={() => commitRow(row.id, { soTien: row.soTien })}
                        disabled={locked}
                        className="h-6 text-xs px-1.5 py-0 text-center w-[72px]"
                        placeholder="0"
                      />
                      <Select value={row.loaiTien} onValueChange={(v) => handleLoaiTienChange(row.id, v as LoaiTien)} disabled={locked}>
                        <SelectTrigger className="h-6 text-xs px-1.5 w-[56px]">
                          <SelectValue>{row.loaiTien}</SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="NDT">NDT</SelectItem>
                          <SelectItem value="NT$">NT$</SelectItem>
                          <SelectItem value="US$">US$</SelectItem>
                          <SelectItem value="USD">USD</SelectItem>
                          <SelectItem value="VND">VND</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </td>
                  <td className="px-3 py-2 text-right font-semibold whitespace-nowrap">
                    {row.soTien > 0 ? `${fmt(row.soTien)} ${LOAI_TIEN_LABEL[row.loaiTien]}` : "—"}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex justify-center">
                      <Input
                        type="number"
                        value={isVND ? 1 : (row.tyGia || "")}
                        onChange={(e) => !isVND && updateRow(row.id, "tyGia", Number(e.target.value) || 0)}
                        onBlur={() => !isVND && commitRow(row.id, { tyGia: row.tyGia })}
                        disabled={isVND || locked}
                        className="h-6 text-xs px-1.5 py-0 text-center w-[72px] disabled:opacity-50"
                      />
                    </div>
                  </td>
                  <td className="px-4 py-2 text-right font-semibold text-primary whitespace-nowrap">
                    {row.soTien > 0 && row.tyGia > 0 ? `${fmt(thanhTienVND)} ₫` : "—"}
                  </td>
                  <td className="px-2 py-2">
                    <Button
                      size="icon" variant="ghost"
                      className="h-6 w-6 text-muted-foreground hover:text-destructive"
                      onClick={() => removeRow(row.id)}
                      disabled={locked}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
