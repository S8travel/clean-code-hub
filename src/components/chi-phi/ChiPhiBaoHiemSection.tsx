import { useEffect, useMemo, useRef, useState } from "react";
import { differenceInDays, parseISO } from "date-fns";
import { Check, X, Ban, SlidersHorizontal } from "lucide-react";
import { Input } from "@/components/ui/input";
import { DatePicker } from "@/components/ui/date-picker";
import { DecimalInput } from "@/components/ui/decimal-input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  useChiPhiList, useDNTTList, useInsertDNTT, useUpsertChiPhi,
} from "@/hooks/use-chi-phi";
import type { DNTTRow } from "@/hooks/use-chi-phi";
import { errMsg } from "@/lib/error";
import { useCancelDNTT, useUpdateDNTT, useCreateAdjustment } from "@/hooks/use-dntt";
import { usePaymentsByChiPhi } from "@/hooks/use-payments";
import { useCongNoList } from "@/hooks/use-cong-no";
import type { DNTTRow as DNTTRowDntt } from "@/hooks/use-dntt";
import { useCanhDiemList } from "@/hooks/use-canh-diem";
import { t, useTranslate } from "@/lib/i18n";

const fmt = (n: number) => n.toLocaleString("vi-VN");

const STATUS_LABEL: Record<string, { textKey: string; cls: string }> = {
  cho_duyet: { textKey: "Chờ duyệt ĐNTT", cls: "bg-yellow-100 text-yellow-700" },
  da_duyet:  { textKey: "Đã duyệt ĐNTT",  cls: "bg-teal-100 text-teal-700" },
  tu_choi:   { textKey: "Từ chối",         cls: "bg-red-100 text-red-700" },
};

interface CancelTarget { dnttId: number; isPaid: boolean }

interface Props {
  doanId: number;
  soKhach: number;
  ngayDi: string | null;
  ngayVe: string | null;
}

export default function ChiPhiBaoHiemSection({ doanId, soKhach, ngayDi, ngayVe }: Props) {
  useTranslate();
  const { data: chiPhiRows = [], isLoading: chiPhiLoading } = useChiPhiList(doanId);
  const { data: dnttList = [] } = useDNTTList(doanId);
  const { data: paymentsList = [] } = usePaymentsByChiPhi(doanId);
  const { data: congNoList = [] } = useCongNoList({ doanId });

  const canTruByDnttId = useMemo(() => {
    // payment_so_tien đã pro-rate per-allocation trong usePaymentsByChiPhi.
    // KHÔNG dedupe theo payment_id (sẽ mất share của các allocs còn lại).
    const m: Record<number, number> = {};
    paymentsList.forEach((p) => {
      if (p.method !== "can_tru") return;
      m[p.dntt_id] = (m[p.dntt_id] || 0) + p.payment_so_tien;
    });
    return m;
  }, [paymentsList]);
  const { data: canhDiemList = [] } = useCanhDiemList();
  const upsertMut = useUpsertChiPhi();
  const insertDNTT = useInsertDNTT();
  const updateDNTT = useUpdateDNTT();
  const cancelMut = useCancelDNTT();
  const adjustMut = useCreateAdjustment();

  const baoHiemCD = canhDiemList.find(
    (cd) => cd.loai === "dich_vu" && cd.ten.toLowerCase().includes("bảo hiểm")
  );
  const nccId = baoHiemCD?.nha_cung_cap_id ?? null;
  const giaMacDinh = baoHiemCD?.gia_mac_dinh ?? 0;

  const soNgay = ngayDi && ngayVe
    ? Math.max(1, differenceInDays(parseISO(ngayVe), parseISO(ngayDi)) + 1)
    : 0;

  const existing = chiPhiRows.find((r) => r.danh_muc === "bao_hiem");
  const [donGia, setDonGia] = useState<number>(0);
  // SL có thể edit thủ công — default = soKhach × soNgay nhưng user override được.
  const [soLuong, setSoLuong] = useState<number>(0);
  const [saving, setSaving] = useState(false);
  const autoSaved = useRef(false);

  // Re-sync từ DB (snapshot tour) khi giá trị existing đổi — kể cả CÙNG id
  // (vd máy khác sửa don_gia/so_luong). externalKey theo VALUE; bỏ qua khi
  // user đang gõ dở (dirtyRef) để không reset.
  const externalKey = existing
    ? `${existing.id}|${existing.don_gia ?? 0}|${existing.so_luong ?? 0}`
    : `none|${giaMacDinh ?? 0}`;
  const lastSyncedKeyRef = useRef<string | null>(null);
  const dirtyRef = useRef(false);
  useEffect(() => {
    if (lastSyncedKeyRef.current === externalKey) return;
    if (dirtyRef.current) return; // đang gõ dở → không đè
    lastSyncedKeyRef.current = externalKey;
    if (existing) {
      setDonGia(existing.don_gia ?? 0);
      setSoLuong(existing.so_luong ?? 0);
      autoSaved.current = true;
    } else if (giaMacDinh) {
      setDonGia(giaMacDinh);
    }
  }, [externalKey, existing, giaMacDinh]);

  // Khi chưa có record + soKhach/soNgay đổi → seed soLuong = soKhach × soNgay.
  useEffect(() => {
    if (existing) return;
    setSoLuong(soKhach * soNgay);
  }, [existing, soKhach, soNgay]);

  // Auto-save với giá mặc định khi chưa có record và đủ dữ liệu
  useEffect(() => {
    if (chiPhiLoading || existing || autoSaved.current) return;
    if (!giaMacDinh || !soKhach || !soNgay) return;
    autoSaved.current = true;
    upsertMut.mutate({
      doan_id: doanId,
      danh_muc: "bao_hiem",
      loai: "bao_hiem",
      // mo_ta ghi vào DB — giữ tiếng Việt độc lập ngôn ngữ UI
      mo_ta: baoHiemCD ? `Bảo hiểm - ${baoHiemCD.ten}` : "Bảo hiểm",
      don_gia: giaMacDinh,
      so_luong: soKhach * soNgay,
      tien_cong_ty: soKhach * soNgay * giaMacDinh,
      tien_hdv: 0,
      nha_cung_cap_id: nccId,
      thanh_toan_dinh_ky: true,
      // KHÔNG set trang_thai_thanh_toan: DB default = 'unpaid', RPC recalc quản lý.
    }, {
      onError: () => { autoSaved.current = false; },
    });
  }, [chiPhiLoading, existing, giaMacDinh, soKhach, soNgay]); // eslint-disable-line react-hooks/exhaustive-deps

  const thanhTien = soLuong * donGia;

  const nguoiTt = (existing?.tien_hdv ?? 0) > 0 ? "hdv" : "cong_ty";

  const handleToggleNguoiTt = () => {
    if (!existing) return;
    const next = nguoiTt === "cong_ty" ? "hdv" : "cong_ty";
    upsertMut.mutate({
      id: existing.id,
      doan_id: doanId,
      tien_cong_ty: next === "cong_ty" ? thanhTien : 0,
      tien_hdv: next === "hdv" ? thanhTien : 0,
    });
  };

  const handleSave = async () => {
    if (!soLuong) {
      toast.warning(t("Số lượng phải lớn hơn 0"));
      return;
    }
    setSaving(true);
    try {
      const isHDV = nguoiTt === "hdv";
      await upsertMut.mutateAsync({
        ...(existing ? { id: existing.id } : {}),
        doan_id: doanId,
        danh_muc: "bao_hiem",
        loai: "bao_hiem",
        // mo_ta ghi vào DB — giữ tiếng Việt độc lập ngôn ngữ UI
        mo_ta: baoHiemCD ? `Bảo hiểm - ${baoHiemCD.ten}` : "Bảo hiểm",
        don_gia: donGia,
        so_luong: soLuong,
        tien_cong_ty: isHDV ? 0 : thanhTien,
        tien_hdv: isHDV ? thanhTien : 0,
        nha_cung_cap_id: nccId,
        thanh_toan_dinh_ky: true,
        // KHÔNG set trang_thai_thanh_toan: DB default + RPC recalc quản lý.
      });
      dirtyRef.current = false; // đã lưu → cho phép reconcile tiếp
      toast.success(t("Đã lưu bảo hiểm"));
    } catch {
      toast.error(t("Lỗi khi lưu bảo hiểm"));
    } finally {
      setSaving(false);
    }
  };

  // ── ĐNTT state ─────────────────────────────────────────────────────────────
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editAmount, setEditAmount] = useState("");

  interface BHModalTarget { chiPhiId: number; thanhTien: number; moTa: string; nccId: number | null }
  const [modal, setModal] = useState<BHModalTarget | null>(null);
  const [modalMode, setModalMode] = useState<"full" | "deposit">("full");
  const [depositAmount, setDepositAmount] = useState(0);
  const [ngayCan, setNgayCan] = useState("");

  const [adjustTarget, setAdjustTarget] = useState<DNTTRowDntt | null>(null);
  const [adjustAmount, setAdjustAmount] = useState("");
  const [adjustReason, setAdjustReason] = useState("");

  const [cancelTarget, setCancelTarget] = useState<CancelTarget | null>(null);
  const [cancelMode, setCancelMode] = useState<"cong_no" | "hoan_tien">("hoan_tien");

  // ── ĐNTT computed ─────────────────────────────────────────────────────────
  const rowId = existing?.id;
  const allDntts = rowId ? dnttList.filter((d) => d.ref_loai === "doan_chi_phi" && d.ref_id === rowId) : [];
  const activeDntts = allDntts.filter((d) => d.trang_thai_duyet !== "da_huy" && d.trang_thai_duyet !== "tu_choi");
  const rejectedDntts = allDntts.filter((d) => d.trang_thai_duyet === "tu_choi");
  const paidDntts = activeDntts.filter((d) => d.payment_status === "paid");
  const pendingDntts = activeDntts.filter((d) => d.payment_status !== "paid");
  const daTT = activeDntts.reduce((s, d) => s + (d.paid_amount || 0), 0);
  const daDeNghi = pendingDntts.reduce((s, d) => s + (d.so_tien - (d.paid_amount || 0)), 0);
  const isDaTT = thanhTien > 0 && daTT >= thanhTien;
  const conLai = Math.max(0, thanhTien - daTT);
  const dnttIds = allDntts.map((d) => d.id);
  const congNoAmount = congNoList
    .filter((c) => c.dntt_goc_id != null && dnttIds.includes(c.dntt_goc_id) && c.trang_thai === "con_du")
    .reduce((s, c) => s + c.so_tien_con_lai, 0);
  const hoanTienAmount = congNoList
    .filter((c) => c.dntt_goc_id != null && dnttIds.includes(c.dntt_goc_id) && c.trang_thai === "da_hoan_tien")
    .reduce((s, c) => s + c.so_tien_goc, 0);
  const activeDntt = pendingDntts[0] ?? paidDntts[0] ?? null;
  const canCancel = activeDntt && (
    activeDntt.trang_thai_duyet === "cho_duyet" ||
    activeDntt.trang_thai_duyet === "da_duyet" ||
    activeDntt.payment_status === "paid"
  );
  const shownDntts = [...activeDntts, ...rejectedDntts];

  // ── ĐNTT handlers ──────────────────────────────────────────────────────────
  const openModal = () => {
    if (!existing) { toast.warning(t("Hãy nhập giá bảo hiểm trước")); return; }
    setModal({ chiPhiId: existing.id, thanhTien, moTa: existing.mo_ta || t("Bảo hiểm"), nccId });
    setModalMode("full");
    setDepositAmount(0);
    setNgayCan("");
  };

  const handleModalSubmit = () => {
    if (!modal) return;
    const soTien = modalMode === "full" ? modal.thanhTien : depositAmount;
    if (soTien <= 0) { toast.error(t("Số tiền phải lớn hơn 0")); return; }
    if (modalMode === "deposit" && soTien >= modal.thanhTien) { toast.error(t("Số tiền cọc phải nhỏ hơn tổng tiền")); return; }
    insertDNTT.mutate({
      doan_id: doanId,
      loai: "bao_hiem",
      mo_ta: modal.moTa,
      nha_cung_cap_id: modal.nccId,
      so_tien: soTien,
      la_coc: modalMode === "deposit",
      trang_thai_duyet: "cho_duyet",
      ref_loai: "doan_chi_phi",
      ref_id: modal.chiPhiId,
      ngay_can_thanh_toan: ngayCan || null,
      allocations: [{ chi_phi_id: modal.chiPhiId, so_tien: soTien }],
    }, {
      onSuccess: () => { toast.success(t("Đã gửi ĐNTT")); setModal(null); },
    });
  };

  const handleEditSave = (id: number) => {
    const v = parseInt(editAmount.replace(/\D/g, ""), 10);
    if (!v || v <= 0) { toast.error(t("Số tiền không hợp lệ")); return; }
    updateDNTT.mutate({ id, soTien: v }, {
      onSuccess: () => { toast.success(t("Đã cập nhật")); setEditingId(null); },
    });
  };

  const handleCancel = () => {
    if (!cancelTarget) return;
    cancelMut.mutate(
      { id: cancelTarget.dnttId, mode: cancelTarget.isPaid ? cancelMode : undefined },
      {
        onSuccess: () => { toast.success(t("Đã hủy")); setCancelTarget(null); },
        onError: (err: unknown) => toast.error(errMsg(err) || t("Lỗi khi hủy")),
      },
    );
  };

  const handleToggleDinhKy = () => {
    if (!existing) return;
    const newVal = !existing.thanh_toan_dinh_ky;
    upsertMut.mutate({ id: existing.id, doan_id: doanId, thanh_toan_dinh_ky: newVal }, {
      onSuccess: () => toast.success(newVal ? t("Đã bật thanh toán định kỳ") : t("Đã tắt thanh toán định kỳ")),
    });
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  // Hoàn tiền → ẩn khỏi tab Chi phí của đoàn, chỉ giữ record ở sidebar Thanh toán/UNC
  if (hoanTienAmount > 0) return null;
  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-rose-100 bg-rose-50">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-semibold text-rose-900">🛡️ {t("Bảo hiểm")}</span>
          {baoHiemCD && <span className="text-xs text-muted-foreground">· {baoHiemCD.ten}</span>}
        </div>
        {thanhTien > 0 && (
          <span className="text-xs text-muted-foreground">{t("Tổng:")} {fmt(thanhTien)} ₫</span>
        )}
      </div>

      {/* Table — cùng layout với Xe / Visa / DV */}
      <div className="overflow-x-auto">
        <table className="w-full text-xs border-collapse">
          <colgroup>
            <col />
            <col style={{ width: "80px" }} />
            <col style={{ width: "110px" }} />
            <col style={{ width: "120px" }} />
            <col style={{ width: "76px" }} />
            <col style={{ width: "180px" }} />
            <col style={{ width: "140px" }} />
            <col style={{ width: "130px" }} />
          </colgroup>
          <thead>
            <tr className="border-b border-border bg-muted/20 text-[11px] font-medium text-muted-foreground">
              <th className="text-left px-4 py-2.5">{t("Mô tả")}</th>
              <th className="text-center px-2 py-2.5">{t("SL")}</th>
              <th className="text-center px-3 py-2.5">{t("Giá/người/ngày")}</th>
              <th className="text-right px-3 py-2.5">{t("Thành tiền")}</th>
              <th className="text-center px-2 py-2.5">{t("Nguồn")}</th>
              <th className="text-center px-3 py-2.5">{t("TT ĐNTT")}</th>
              <th className="text-center px-3 py-2.5">{t("TT Thanh toán")}</th>
              <th className="px-2 py-2.5" />
            </tr>
          </thead>
          <tbody>
            <tr className="hover:bg-muted/20">
              {/* Mô tả */}
              <td className="px-4 py-2.5">
                <div className="font-medium">{baoHiemCD ? baoHiemCD.ten : t("Bảo hiểm")}</div>
                <div className="text-[10px] text-muted-foreground mt-0.5">
                  {soKhach} {t("khách")} × {soNgay} {t("ngày")}
                </div>
              </td>

              {/* SL — editable, default = soKhach × soNgay */}
              <td className="px-2 py-2.5">
                <div className="flex justify-center">
                  <Input
                    type="number"
                    value={soLuong || ""}
                    onChange={(e) => { dirtyRef.current = true; setSoLuong(Number(e.target.value) || 0); }}
                    onBlur={handleSave}
                    onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLElement).blur(); }}
                    disabled={saving}
                    className="h-6 text-xs px-1.5 py-0 text-center w-[64px] [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  />
                </div>
              </td>

              {/* Giá/người/ngày — editable */}
              <td className="px-3 py-2.5">
                <div className="flex justify-center">
                  <DecimalInput
                    value={donGia}
                    onChange={(v) => { dirtyRef.current = true; setDonGia(v); }}
                    onBlur={handleSave}
                    placeholder="0"
                    disabled={saving}
                    className="h-6 text-xs px-1.5 py-0 text-right w-[112px]"
                  />
                </div>
              </td>

              {/* Thành tiền */}
              <td className="px-3 py-2.5 text-right font-semibold text-primary whitespace-nowrap">
                {thanhTien > 0 ? `${fmt(thanhTien)} ₫` : "—"}
              </td>

              {/* Ai trả — badge */}
              <td className="px-2 py-2.5 text-center">
                <button
                  onClick={handleToggleNguoiTt}
                  disabled={upsertMut.isPending || !existing}
                  className={cn(
                    "px-1.5 py-0.5 rounded text-[10px] font-medium cursor-pointer transition-colors border",
                    nguoiTt === "cong_ty"
                      ? "bg-blue-50 text-blue-600 hover:bg-blue-100 border-blue-200"
                      : "bg-amber-50 text-amber-600 hover:bg-amber-100 border-amber-200"
                  )}
                >
                  {nguoiTt === "cong_ty" ? t("Công ty") : "HDV"}
                </button>
              </td>

              {/* TT ĐNTT */}
              <td className="px-3 py-2.5">
                {nguoiTt === "hdv" ? (
                  <span className="text-[10px] text-muted-foreground flex justify-center">—</span>
                ) : shownDntts.length === 0 ? (
                  <span className="text-[10px] text-muted-foreground flex justify-center">—</span>
                ) : (
                  <div className="flex flex-wrap items-center gap-1 justify-center">
                    {shownDntts.map((d) => {
                      const isRejected = d.trang_thai_duyet === "tu_choi";
                      const statusInfo = STATUS_LABEL[d.trang_thai_duyet] ?? STATUS_LABEL.cho_duyet;
                      return (
                        <div key={d.id} className="flex items-center gap-1">
                          {isRejected ? (
                            <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium whitespace-nowrap ${statusInfo.cls}`}>
                              {t(statusInfo.textKey)} · {fmt(d.so_tien)}
                            </span>
                          ) : editingId === d.id ? (
                            <>
                              <Input autoFocus type="number" value={editAmount}
                                onChange={(e) => setEditAmount(e.target.value)}
                                onKeyDown={(e) => { if (e.key === "Enter") handleEditSave(d.id); if (e.key === "Escape") setEditingId(null); }}
                                className="h-6 w-20 text-xs px-2 py-0" />
                              <Button variant="ghost" size="sm" className="h-5 w-5 p-0 text-emerald-600" disabled={updateDNTT.isPending} onClick={() => handleEditSave(d.id)}>
                                <Check className="h-3 w-3" />
                              </Button>
                              <Button variant="ghost" size="sm" className="h-5 w-5 p-0 text-muted-foreground" onClick={() => setEditingId(null)}>
                                <X className="h-3 w-3" />
                              </Button>
                            </>
                          ) : (
                            <>
                              {(() => {
                                const ct = canTruByDnttId[d.id] || 0;
                                const thucTT = Math.max(0, d.so_tien - ct);
                                return (
                                  <div className="inline-flex flex-col items-start gap-0.5">
                                    <span className={`px-1 py-px rounded text-[10px] leading-tight font-medium whitespace-nowrap ${statusInfo.cls}`}>
                                      {t(statusInfo.textKey)} · {fmt(d.so_tien)}
                                      {d.la_coc && <span className="ml-1 opacity-70">·{t("Cọc")}</span>}
                                    </span>
                                    {ct > 0 && (
                                      <span className="text-[9px] text-amber-700 leading-tight whitespace-nowrap">
                                        CT {fmt(ct)} → TT {fmt(thucTT)}
                                      </span>
                                    )}
                                  </div>
                                );
                              })()}
                              {/* ĐNTT sai → hủy, KHÔNG sửa inline (gỡ pencil 2026-05-26) */}
                            </>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </td>

              {/* TT Thanh toán */}
              <td className="px-3 py-2.5">
                {nguoiTt === "hdv" ? (
                  <span className="text-[10px] text-muted-foreground flex justify-center">—</span>
                ) : (
                <div className="flex flex-wrap items-center gap-1 justify-center">
                  {activeDntts.map((d) => (
                    <span key={d.id} className={`px-1.5 py-0.5 rounded text-[10px] font-medium whitespace-nowrap ${
                      d.payment_status === "paid"
                        ? "bg-emerald-100 text-emerald-700"
                        : "bg-yellow-100 text-yellow-800"
                    }`}>
                      {d.payment_status === "paid"
                        ? `${t("Đã TT")}${d.thanh_toan_luc ? ` ${new Date(d.thanh_toan_luc).toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit" })}` : ""}`
                        : `${t("Chờ UNC")} · ${fmt(d.so_tien - (d.paid_amount || 0))}`}
                    </span>
                  ))}
                  {congNoAmount > 0 && <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-purple-100 text-purple-700 whitespace-nowrap">CN: {fmt(congNoAmount)}</span>}
                  {hoanTienAmount > 0 && <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-100 text-blue-700 whitespace-nowrap">HT: {fmt(hoanTienAmount)}</span>}
                  {activeDntts.length === 0 && congNoAmount === 0 && hoanTienAmount === 0 && (
                    <span className="text-[10px] text-muted-foreground">—</span>
                  )}
                </div>
                )}
              </td>

              {/* Actions */}
              <td className="px-2 py-2.5">
                {existing && (
                  <div className="flex items-center gap-1 justify-end">
                    {nguoiTt === "cong_ty" && isDaTT && paidDntts.length > 0 && (
                      <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-blue-500 hover:text-blue-600"
                        title={t("Điều chỉnh sau thanh toán")}
                        onClick={() => {
                          const lastPaid = paidDntts[paidDntts.length - 1];
                          setAdjustTarget(lastPaid as unknown as DNTTRowDntt);
                          setAdjustAmount(String(lastPaid.so_tien));
                          setAdjustReason("");
                        }}>
                        <SlidersHorizontal className="h-3 w-3" />
                      </Button>
                    )}
                    {nguoiTt === "cong_ty" && canCancel && activeDntt && (
                      <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-destructive hover:text-destructive"
                        title={t("Hủy ĐNTT")}
                        onClick={() => {
                          setCancelMode("hoan_tien");
                          setCancelTarget({ dnttId: activeDntt.id, isPaid: activeDntt.payment_status === "paid" });
                        }}>
                        <Ban className="h-3 w-3" />
                      </Button>
                    )}
                    <Button variant="ghost" size="sm"
                      className={cn("h-6 text-[10px] px-1.5", existing.thanh_toan_dinh_ky ? "text-indigo-600 hover:text-indigo-700" : "text-muted-foreground hover:text-foreground")}
                      title={existing.thanh_toan_dinh_ky ? t("Đang định kỳ — bấm để tắt") : t("Đặt thanh toán định kỳ")}
                      disabled={upsertMut.isPending}
                      onClick={handleToggleDinhKy}>
                      ⏱
                    </Button>
                    {existing.thanh_toan_dinh_ky && activeDntts.length === 0 && (
                      <span className="text-[10px] text-indigo-500 italic">{t("Định kỳ")}</span>
                    )}
                    {nguoiTt === "cong_ty" && !existing.thanh_toan_dinh_ky && activeDntts.length === 0 && thanhTien > 0 && (
                      <Button variant="outline" size="sm" className="h-6 text-[10px] px-2" onClick={openModal}>
                        {t("ĐNTT")}
                      </Button>
                    )}
                    {nguoiTt === "cong_ty" && activeDntts.length > 0 && daDeNghi === 0 && (
                      <Button variant="outline" size="sm" className="h-6 text-[10px] px-2 border-amber-400 text-amber-700 hover:bg-amber-50"
                        onClick={() => {
                          setModal({ chiPhiId: existing.id, thanhTien: conLai > 0 ? conLai : thanhTien, moTa: existing.mo_ta || t("Bảo hiểm"), nccId });
                          setModalMode("full"); setDepositAmount(0); setNgayCan("");
                        }}>
                        {conLai > 0 ? t("ĐNTT còn lại") : t("ĐNTT bổ sung")}
                      </Button>
                    )}
                  </div>
                )}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* ĐNTT Modal */}
      <Dialog open={!!modal} onOpenChange={(v) => { if (!v) setModal(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-sm">{t("Tạo đề nghị thanh toán")} — {modal?.moTa || t("Bảo hiểm")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2 text-xs">
            <p>{t("Tổng tiền:")} <span className="font-semibold">{fmt(modal?.thanhTien ?? 0)} VND</span></p>
            <RadioGroup value={modalMode} onValueChange={(v) => setModalMode(v as "full" | "deposit")} className="space-y-2">
              <div className="flex items-center gap-2">
                <RadioGroupItem value="full" id="bh-full" />
                <Label htmlFor="bh-full" className="text-xs cursor-pointer">{t("Toàn bộ")} — {fmt(modal?.thanhTien ?? 0)} VND</Label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem value="deposit" id="bh-dep" />
                <Label htmlFor="bh-dep" className="text-xs cursor-pointer">{t("1 phần (cọc)")}</Label>
              </div>
            </RadioGroup>
            {modalMode === "deposit" && (
              <div className="space-y-1">
                <Label className="text-xs">{t("Số tiền cọc")}</Label>
                <Input type="number" className="h-8 text-xs" value={depositAmount || ""}
                  onChange={(e) => setDepositAmount(Number(e.target.value) || 0)} max={modal?.thanhTien} />
                {depositAmount > 0 && modal && (
                  <p className="text-[11px] text-muted-foreground">{t("Còn lại:")} {fmt(modal.thanhTien - depositAmount)} VND</p>
                )}
              </div>
            )}
            <div className="space-y-1">
              <Label className="text-xs">{t("Ngày cần thanh toán")}</Label>
              <DatePicker className="h-8 text-xs w-full" value={ngayCan} onChange={setNgayCan} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" className="text-xs" onClick={() => setModal(null)}>{t("Hủy")}</Button>
            <Button size="sm" className="text-xs" onClick={handleModalSubmit} disabled={insertDNTT.isPending}>{t("Tạo đề nghị TT")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Adjust Dialog */}
      <Dialog open={!!adjustTarget} onOpenChange={(o) => { if (!o) setAdjustTarget(null); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle className="text-sm">{t("Điều chỉnh sau thanh toán")}</DialogTitle></DialogHeader>
          {adjustTarget && (
            <div className="space-y-3 py-1 text-sm">
              <p className="text-xs text-muted-foreground">{adjustTarget.mo_ta}</p>
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">{t("Đã thanh toán:")}</span>
                <span className="font-semibold">{fmt(adjustTarget.so_tien)} ₫</span>
              </div>
              <div className="space-y-1">
                <Label className="text-xs font-medium">{t("Số tiền thực tế")}</Label>
                <Input className="h-8 text-sm" value={adjustAmount}
                  onChange={(e) => setAdjustAmount(e.target.value.replace(/\D/g, ""))} placeholder={t("Nhập số tiền...")} />
              </div>
              {(() => {
                const actual = parseInt(adjustAmount.replace(/\D/g, ""), 10);
                if (isNaN(actual) || actual === adjustTarget.so_tien) return null;
                const delta = actual - adjustTarget.so_tien;
                return (
                  <div className={cn("rounded px-3 py-2 text-xs font-medium",
                    delta > 0 ? "bg-yellow-50 text-yellow-700" : "bg-purple-50 text-purple-700")}>
                    {delta > 0 ? `${t("Thiếu")} ${fmt(delta)} ₫ → ${t("tạo ĐNTT bổ sung")}` : `${t("Thừa")} ${fmt(Math.abs(delta))} ₫ → ${t("ghi công nợ NCC")}`}
                  </div>
                );
              })()}
              <div className="space-y-1">
                <Label className="text-xs font-medium">{t("Lý do")}</Label>
                <Textarea className="text-xs min-h-[56px]" value={adjustReason}
                  onChange={(e) => setAdjustReason(e.target.value)} placeholder={t("VD: Thay đổi số lượng...")} />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" size="sm" className="text-xs" onClick={() => setAdjustTarget(null)}>{t("Đóng")}</Button>
            <Button size="sm" className="text-xs"
              disabled={adjustMut.isPending || !adjustAmount || parseInt(adjustAmount.replace(/\D/g, ""), 10) === adjustTarget?.so_tien}
              onClick={() => {
                if (!adjustTarget) return;
                const soTienThucTe = parseInt(adjustAmount.replace(/\D/g, ""), 10);
                if (isNaN(soTienThucTe)) return;
                // lyDo ghi vào ghi_chu/ly_do của DB — giữ tiếng Việt độc lập ngôn ngữ UI
                adjustMut.mutate({ dnttGoc: adjustTarget, soTienThucTe, lyDo: adjustReason || "Điều chỉnh" }, {
                  onSuccess: (result) => {
                    if (!result) return;
                    if (result.delta > 0) toast.success(`${t("Đã tạo ĐNTT bổ sung")} ${fmt(result.delta)} ₫`);
                    else toast.success(`${t("Đã ghi công nợ")} ${fmt(Math.abs(result.delta))} ₫`);
                    setAdjustTarget(null);
                  },
                  onError: (err: unknown) => toast.error(errMsg(err) || t("Lỗi điều chỉnh")),
                });
              }}>
              {t("Xác nhận")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Cancel Dialog */}
      <Dialog open={!!cancelTarget} onOpenChange={(v) => { if (!v) setCancelTarget(null); }}>
        <DialogContent className="sm:max-w-[340px]">
          <DialogHeader><DialogTitle className="text-sm">{t("Hủy đề nghị thanh toán")}</DialogTitle></DialogHeader>
          {cancelTarget?.isPaid && (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">{t("Đã thanh toán — chọn cách xử lý:")}</p>
              <RadioGroup value={cancelMode} onValueChange={(v) => setCancelMode(v as "cong_no" | "hoan_tien")} className="flex gap-4">
                <div className="flex items-center gap-1.5">
                  <RadioGroupItem value="hoan_tien" id="bh-cancel-ht" />
                  <Label htmlFor="bh-cancel-ht" className="text-xs">{t("Hoàn tiền")}</Label>
                </div>
                <div className="flex items-center gap-1.5">
                  <RadioGroupItem value="cong_no" id="bh-cancel-cn" />
                  <Label htmlFor="bh-cancel-cn" className="text-xs">{t("Ghi công nợ")}</Label>
                </div>
              </RadioGroup>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setCancelTarget(null)}>{t("Đóng")}</Button>
            <Button variant="destructive" size="sm" onClick={handleCancel} disabled={cancelMut.isPending}>{t("Xác nhận hủy")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
