import { useEffect, useRef, useState } from "react";
import { differenceInDays, parseISO } from "date-fns";
import { Check, Pencil, X, Ban, SlidersHorizontal } from "lucide-react";
import { Input } from "@/components/ui/input";
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
import { useCancelDNTT, useUpdateDNTT, useCreateAdjustment } from "@/hooks/use-dntt";
import type { DNTTRow as DNTTRowDntt } from "@/hooks/use-dntt";
import { useCanhDiemList } from "@/hooks/use-canh-diem";

const fmt = (n: number) => n.toLocaleString("vi-VN");

const STATUS_LABEL: Record<string, { text: string; cls: string }> = {
  cho_duyet: { text: "Chờ duyệt ĐNTT", cls: "bg-yellow-100 text-yellow-700" },
  da_duyet:  { text: "Đã duyệt ĐNTT",  cls: "bg-teal-100 text-teal-700" },
  tu_choi:   { text: "Từ chối",         cls: "bg-red-100 text-red-700" },
};

interface CancelTarget { dnttId: number; isPaid: boolean }

interface Props {
  doanId: number;
  soKhach: number;
  ngayDi: string | null;
  ngayVe: string | null;
}

export default function ChiPhiBaoHiemSection({ doanId, soKhach, ngayDi, ngayVe }: Props) {
  const { data: chiPhiRows = [], isLoading: chiPhiLoading } = useChiPhiList(doanId);
  const { data: dnttList = [] } = useDNTTList(doanId);
  const { data: canhDiemList = [] } = useCanhDiemList();
  const upsertMut = useUpsertChiPhi();
  const insertDNTT = useInsertDNTT();
  const updateDNTT = useUpdateDNTT();
  const cancelMut = useCancelDNTT();
  const adjustMut = useCreateAdjustment();

  const baoHiemCD = canhDiemList.find(
    (cd) => cd.loai === "dich_vu" && cd.ten.toLowerCase().includes("bảo hiểm")
  );
  const nccId = (baoHiemCD as any)?.nha_cung_cap_id ?? null;
  const giaMacDinh = baoHiemCD?.gia_mac_dinh ?? 0;

  const soNgay = ngayDi && ngayVe
    ? Math.max(1, differenceInDays(parseISO(ngayVe), parseISO(ngayDi)) + 1)
    : 0;

  const existing = chiPhiRows.find((r) => r.danh_muc === "bao_hiem");
  const [donGia, setDonGia] = useState<number>(0);
  const [saving, setSaving] = useState(false);
  const autoSaved = useRef(false);

  useEffect(() => {
    if (existing) {
      setDonGia(existing.don_gia ?? 0);
      autoSaved.current = true;
    } else if (giaMacDinh) {
      setDonGia(giaMacDinh);
    }
  }, [existing?.id, giaMacDinh]);

  // Auto-save với giá mặc định khi chưa có record và đủ dữ liệu
  useEffect(() => {
    if (chiPhiLoading || existing || autoSaved.current) return;
    if (!giaMacDinh || !soKhach || !soNgay) return;
    autoSaved.current = true;
    upsertMut.mutate({
      doan_id: doanId,
      danh_muc: "bao_hiem",
      loai: "bao_hiem",
      mo_ta: baoHiemCD ? `Bảo hiểm - ${baoHiemCD.ten}` : "Bảo hiểm",
      don_gia: giaMacDinh,
      so_luong: soKhach * soNgay,
      tien_cong_ty: soKhach * soNgay * giaMacDinh,
      tien_hdv: 0,
      nha_cung_cap_id: nccId,
      thanh_toan_dinh_ky: true,
      trang_thai_dntt: "chua_de_nghi",
      trang_thai_thanh_toan: "unpaid",
    } as any, {
      onError: () => { autoSaved.current = false; },
    });
  }, [chiPhiLoading, existing, giaMacDinh, soKhach, soNgay]); // eslint-disable-line react-hooks/exhaustive-deps

  const thanhTien = soKhach * soNgay * donGia;

  const nguoiTt = (existing?.tien_hdv ?? 0) > 0 ? "hdv" : "cong_ty";

  const handleToggleNguoiTt = () => {
    if (!existing) return;
    const next = nguoiTt === "cong_ty" ? "hdv" : "cong_ty";
    upsertMut.mutate({
      id: existing.id,
      doan_id: doanId,
      tien_cong_ty: next === "cong_ty" ? thanhTien : 0,
      tien_hdv: next === "hdv" ? thanhTien : 0,
    } as any);
  };

  const handleSave = async () => {
    if (!soKhach || !soNgay) {
      toast.warning("Đoàn chưa có số khách hoặc ngày đi/về");
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
        mo_ta: baoHiemCD ? `Bảo hiểm - ${baoHiemCD.ten}` : "Bảo hiểm",
        don_gia: donGia,
        so_luong: soKhach * soNgay,
        tien_cong_ty: isHDV ? 0 : thanhTien,
        tien_hdv: isHDV ? thanhTien : 0,
        nha_cung_cap_id: nccId,
        thanh_toan_dinh_ky: true,
        ...(!existing && {
          trang_thai_dntt: "chua_de_nghi",
          trang_thai_thanh_toan: "unpaid",
        }),
      } as any);
      toast.success("Đã lưu bảo hiểm");
    } catch {
      toast.error("Lỗi khi lưu bảo hiểm");
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

  const [resendTarget, setResendTarget] = useState<DNTTRow | null>(null);
  const [resendMode, setResendMode] = useState<"full" | "partial">("full");
  const [resendAmount, setResendAmount] = useState(0);

  const [cancelTarget, setCancelTarget] = useState<CancelTarget | null>(null);
  const [cancelMode, setCancelMode] = useState<"cong_no" | "hoan_tien">("hoan_tien");

  // ── ĐNTT computed ─────────────────────────────────────────────────────────
  const rowId = existing?.id;
  const allDntts = rowId ? dnttList.filter((d) => d.ref_loai === "doan_chi_phi" && d.ref_id === rowId) : [];
  const activeDntts = allDntts.filter((d) => d.trang_thai_duyet !== "da_huy" && d.trang_thai_duyet !== "tu_choi");
  const rejectedDntts = allDntts.filter((d) => d.trang_thai_duyet === "tu_choi");
  const paidDntts = activeDntts.filter((d) => d.trang_thai_thanh_toan === "da_tt");
  const pendingDntts = activeDntts.filter((d) => d.trang_thai_thanh_toan !== "da_tt");
  const daTT = paidDntts.reduce((s, d) => s + d.so_tien, 0);
  const daDeNghi = pendingDntts.reduce((s, d) => s + d.so_tien, 0);
  const isDaTT = thanhTien > 0 && daTT >= thanhTien;
  const conLai = Math.max(0, thanhTien - daTT);
  const congNoAmount = allDntts
    .filter((d) => d.trang_thai_duyet === "da_huy" && d.trang_thai_thanh_toan === "cong_no")
    .reduce((s, d) => s + d.so_tien, 0);
  const hoanTienAmount = allDntts
    .filter((d) => d.trang_thai_duyet === "da_huy" && d.trang_thai_thanh_toan === "hoan_tien")
    .reduce((s, d) => s + d.so_tien, 0);
  const activeDntt = pendingDntts[0] ?? paidDntts[0] ?? null;
  const canCancel = activeDntt && (
    activeDntt.trang_thai_duyet === "cho_duyet" ||
    activeDntt.trang_thai_duyet === "da_duyet" ||
    activeDntt.trang_thai_thanh_toan === "da_tt"
  );
  const shownDntts = [...activeDntts, ...rejectedDntts];

  // ── ĐNTT handlers ──────────────────────────────────────────────────────────
  const openModal = () => {
    if (!existing) { toast.warning("Hãy nhập giá bảo hiểm trước"); return; }
    setModal({ chiPhiId: existing.id, thanhTien, moTa: existing.mo_ta || "Bảo hiểm", nccId });
    setModalMode("full");
    setDepositAmount(0);
    setNgayCan("");
  };

  const handleModalSubmit = () => {
    if (!modal) return;
    const soTien = modalMode === "full" ? modal.thanhTien : depositAmount;
    if (soTien <= 0) { toast.error("Số tiền phải lớn hơn 0"); return; }
    if (modalMode === "deposit" && soTien >= modal.thanhTien) { toast.error("Số tiền cọc phải nhỏ hơn tổng tiền"); return; }
    insertDNTT.mutate({
      doan_id: doanId,
      loai: "bao_hiem",
      mo_ta: modal.moTa,
      nha_cung_cap_id: modal.nccId,
      so_tien: soTien,
      la_coc: modalMode === "deposit",
      trang_thai_duyet: "cho_duyet",
      trang_thai_thanh_toan: "chua_tt",
      ref_loai: "doan_chi_phi",
      ref_id: modal.chiPhiId,
      so_tien_con_lai: modalMode === "deposit" ? modal.thanhTien - soTien : 0,
      ngay_can_thanh_toan: ngayCan || null,
    } as any, {
      onSuccess: () => { toast.success("Đã gửi ĐNTT"); setModal(null); },
    });
  };

  const handleResendSubmit = () => {
    if (!resendTarget) return;
    const soTien = resendMode === "full" ? resendTarget.so_tien : resendAmount;
    if (soTien <= 0) { toast.error("Số tiền không hợp lệ"); return; }
    updateDNTT.mutate({
      id: resendTarget.id, doanId, so_tien: soTien,
      trang_thai_duyet: "cho_duyet", trang_thai_thanh_toan: "chua_tt",
      so_tien_con_lai: 0, duyet_boi: null, duyet_luc: null, ghi_chu: null,
    } as any, {
      onSuccess: () => { toast.success("Đã gửi lại ĐNTT"); setResendTarget(null); },
    });
  };

  const handleEditSave = (id: number) => {
    const v = parseInt(editAmount.replace(/\D/g, ""), 10);
    if (!v || v <= 0) { toast.error("Số tiền không hợp lệ"); return; }
    updateDNTT.mutate({ id, doanId, so_tien: v } as any, {
      onSuccess: () => { toast.success("Đã cập nhật"); setEditingId(null); },
    });
  };

  const handleCancel = () => {
    if (!cancelTarget) return;
    cancelMut.mutate(
      { id: cancelTarget.dnttId, mode: cancelTarget.isPaid ? cancelMode : undefined },
      {
        onSuccess: () => { toast.success("Đã hủy"); setCancelTarget(null); },
        onError: (err: any) => toast.error(err?.message || "Lỗi khi hủy"),
      },
    );
  };

  const handleToggleDinhKy = () => {
    if (!existing) return;
    const newVal = !existing.thanh_toan_dinh_ky;
    upsertMut.mutate({ id: existing.id, doan_id: doanId, thanh_toan_dinh_ky: newVal } as any, {
      onSuccess: () => toast.success(newVal ? "Đã bật thanh toán định kỳ" : "Đã tắt thanh toán định kỳ"),
    });
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-rose-100 bg-rose-50">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-semibold text-rose-900">🛡️ Bảo hiểm</span>
          {baoHiemCD && <span className="text-xs text-muted-foreground">· {baoHiemCD.ten}</span>}
        </div>
        {thanhTien > 0 && (
          <span className="text-xs text-muted-foreground">Tổng: {fmt(thanhTien)} ₫</span>
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
              <th className="text-left px-4 py-2.5">Mô tả</th>
              <th className="text-center px-2 py-2.5">SL</th>
              <th className="text-center px-3 py-2.5">Giá/người/ngày</th>
              <th className="text-right px-3 py-2.5">Thành tiền</th>
              <th className="text-center px-2 py-2.5">Ai trả</th>
              <th className="text-center px-3 py-2.5">TT ĐNTT</th>
              <th className="text-center px-3 py-2.5">TT Thanh toán</th>
              <th className="px-2 py-2.5" />
            </tr>
          </thead>
          <tbody>
            <tr className="hover:bg-muted/20">
              {/* Mô tả */}
              <td className="px-4 py-2.5">
                <div className="font-medium">{baoHiemCD ? baoHiemCD.ten : "Bảo hiểm"}</div>
                <div className="text-[10px] text-muted-foreground mt-0.5">
                  {soKhach} khách × {soNgay} ngày
                </div>
              </td>

              {/* SL (computed) */}
              <td className="px-2 py-2.5 text-center text-muted-foreground">
                {soKhach * soNgay}
              </td>

              {/* Giá/người/ngày — editable */}
              <td className="px-3 py-2.5">
                <div className="flex justify-center">
                  <Input
                    type="number"
                    value={donGia || ""}
                    onChange={(e) => setDonGia(Number(e.target.value) || 0)}
                    onBlur={handleSave}
                    onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLElement).blur(); }}
                    className="h-6 text-xs px-1.5 py-0 text-center w-[90px]"
                    placeholder="0"
                    disabled={saving}
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
                  {nguoiTt === "cong_ty" ? "Công ty" : "HDV"}
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
                            <>
                              <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium whitespace-nowrap ${statusInfo.cls}`}>
                                {statusInfo.text} · {fmt(d.so_tien)}
                              </span>
                              <Button variant="outline" size="sm" className="h-5 text-[10px] px-1.5"
                                onClick={() => { setResendTarget(d); setResendMode("full"); setResendAmount(d.so_tien); }}>
                                Gửi lại
                              </Button>
                            </>
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
                              <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium whitespace-nowrap ${statusInfo.cls}`}>
                                {statusInfo.text} · {fmt(d.so_tien)}
                              </span>
                              {d.la_coc && <span className="text-[9px] text-muted-foreground">(Cọc)</span>}
                              {d.trang_thai_duyet === "cho_duyet" && (
                                <Button variant="ghost" size="sm" className="h-5 w-5 p-0 text-blue-500"
                                  onClick={() => { setEditingId(d.id); setEditAmount(String(d.so_tien)); }}>
                                  <Pencil className="h-3 w-3" />
                                </Button>
                              )}
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
                      d.trang_thai_thanh_toan === "da_tt"
                        ? "bg-emerald-100 text-emerald-700"
                        : "bg-yellow-100 text-yellow-800"
                    }`}>
                      {d.trang_thai_thanh_toan === "da_tt"
                        ? `Đã TT${d.ngay_thanh_toan ? ` ${new Date(d.ngay_thanh_toan).toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit" })}` : ""}`
                        : `Chờ UNC · ${fmt(d.so_tien)}`}
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
                        title="Điều chỉnh sau thanh toán"
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
                        title="Hủy ĐNTT"
                        onClick={() => {
                          setCancelMode("hoan_tien");
                          setCancelTarget({ dnttId: activeDntt.id, isPaid: activeDntt.trang_thai_thanh_toan === "da_tt" });
                        }}>
                        <Ban className="h-3 w-3" />
                      </Button>
                    )}
                    <Button variant="ghost" size="sm"
                      className={cn("h-6 text-[10px] px-1.5", existing.thanh_toan_dinh_ky ? "text-indigo-600 hover:text-indigo-700" : "text-muted-foreground hover:text-foreground")}
                      title={existing.thanh_toan_dinh_ky ? "Đang định kỳ — bấm để tắt" : "Đặt thanh toán định kỳ"}
                      disabled={upsertMut.isPending}
                      onClick={handleToggleDinhKy}>
                      ⏱
                    </Button>
                    {existing.thanh_toan_dinh_ky && activeDntts.length === 0 && (
                      <span className="text-[10px] text-indigo-500 italic">Định kỳ</span>
                    )}
                    {nguoiTt === "cong_ty" && !existing.thanh_toan_dinh_ky && activeDntts.length === 0 && thanhTien > 0 && (
                      <Button variant="outline" size="sm" className="h-6 text-[10px] px-2" onClick={openModal}>
                        ĐNTT
                      </Button>
                    )}
                    {nguoiTt === "cong_ty" && activeDntts.length > 0 && daDeNghi === 0 && (
                      <Button variant="outline" size="sm" className="h-6 text-[10px] px-2 border-amber-400 text-amber-700 hover:bg-amber-50"
                        onClick={() => {
                          setModal({ chiPhiId: existing.id, thanhTien: conLai > 0 ? conLai : thanhTien, moTa: existing.mo_ta || "Bảo hiểm", nccId });
                          setModalMode("full"); setDepositAmount(0); setNgayCan("");
                        }}>
                        {conLai > 0 ? "ĐNTT còn lại" : "ĐNTT bổ sung"}
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
            <DialogTitle className="text-sm">Tạo đề nghị thanh toán — {modal?.moTa || "Bảo hiểm"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2 text-xs">
            <p>Tổng tiền: <span className="font-semibold">{fmt(modal?.thanhTien ?? 0)} VND</span></p>
            <RadioGroup value={modalMode} onValueChange={(v) => setModalMode(v as "full" | "deposit")} className="space-y-2">
              <div className="flex items-center gap-2">
                <RadioGroupItem value="full" id="bh-full" />
                <Label htmlFor="bh-full" className="text-xs cursor-pointer">Toàn bộ — {fmt(modal?.thanhTien ?? 0)} VND</Label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem value="deposit" id="bh-dep" />
                <Label htmlFor="bh-dep" className="text-xs cursor-pointer">1 phần (cọc)</Label>
              </div>
            </RadioGroup>
            {modalMode === "deposit" && (
              <div className="space-y-1">
                <Label className="text-xs">Số tiền cọc</Label>
                <Input type="number" className="h-8 text-xs" value={depositAmount || ""}
                  onChange={(e) => setDepositAmount(Number(e.target.value) || 0)} max={modal?.thanhTien} />
                {depositAmount > 0 && modal && (
                  <p className="text-[11px] text-muted-foreground">Còn lại: {fmt(modal.thanhTien - depositAmount)} VND</p>
                )}
              </div>
            )}
            <div className="space-y-1">
              <Label className="text-xs">Ngày cần thanh toán</Label>
              <Input type="date" className="h-8 text-xs" value={ngayCan} onChange={(e) => setNgayCan(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" className="text-xs" onClick={() => setModal(null)}>Hủy</Button>
            <Button size="sm" className="text-xs" onClick={handleModalSubmit} disabled={insertDNTT.isPending}>Tạo đề nghị TT</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Adjust Dialog */}
      <Dialog open={!!adjustTarget} onOpenChange={(o) => { if (!o) setAdjustTarget(null); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle className="text-sm">Điều chỉnh sau thanh toán</DialogTitle></DialogHeader>
          {adjustTarget && (
            <div className="space-y-3 py-1 text-sm">
              <p className="text-xs text-muted-foreground">{adjustTarget.mo_ta}</p>
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Đã thanh toán:</span>
                <span className="font-semibold">{fmt(adjustTarget.so_tien)} ₫</span>
              </div>
              <div className="space-y-1">
                <Label className="text-xs font-medium">Số tiền thực tế</Label>
                <Input className="h-8 text-sm" value={adjustAmount}
                  onChange={(e) => setAdjustAmount(e.target.value.replace(/\D/g, ""))} placeholder="Nhập số tiền..." />
              </div>
              {(() => {
                const actual = parseInt(adjustAmount.replace(/\D/g, ""), 10);
                if (isNaN(actual) || actual === adjustTarget.so_tien) return null;
                const delta = actual - adjustTarget.so_tien;
                return (
                  <div className={cn("rounded px-3 py-2 text-xs font-medium",
                    delta > 0 ? "bg-yellow-50 text-yellow-700" : "bg-purple-50 text-purple-700")}>
                    {delta > 0 ? `Thiếu ${fmt(delta)} ₫ → tạo ĐNTT bổ sung` : `Thừa ${fmt(Math.abs(delta))} ₫ → ghi công nợ NCC`}
                  </div>
                );
              })()}
              <div className="space-y-1">
                <Label className="text-xs font-medium">Lý do</Label>
                <Textarea className="text-xs min-h-[56px]" value={adjustReason}
                  onChange={(e) => setAdjustReason(e.target.value)} placeholder="VD: Thay đổi số lượng..." />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" size="sm" className="text-xs" onClick={() => setAdjustTarget(null)}>Đóng</Button>
            <Button size="sm" className="text-xs"
              disabled={adjustMut.isPending || !adjustAmount || parseInt(adjustAmount.replace(/\D/g, ""), 10) === adjustTarget?.so_tien}
              onClick={() => {
                if (!adjustTarget) return;
                const soTienThucTe = parseInt(adjustAmount.replace(/\D/g, ""), 10);
                if (isNaN(soTienThucTe)) return;
                adjustMut.mutate({ dnttGoc: adjustTarget, soTienThucTe, lyDo: adjustReason || "Điều chỉnh" }, {
                  onSuccess: (result) => {
                    if (!result) return;
                    if (result.delta > 0) toast.success(`Đã tạo ĐNTT bổ sung ${fmt(result.delta)} ₫`);
                    else toast.success(`Đã ghi công nợ ${fmt(Math.abs(result.delta))} ₫`);
                    setAdjustTarget(null);
                  },
                  onError: (err: any) => toast.error(err?.message || "Lỗi điều chỉnh"),
                });
              }}>
              Xác nhận
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Resend Dialog */}
      <Dialog open={!!resendTarget} onOpenChange={(v) => { if (!v) setResendTarget(null); }}>
        <DialogContent className="sm:max-w-[360px]">
          <DialogHeader><DialogTitle className="text-sm">Gửi lại ĐNTT</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">Số tiền gốc: {fmt(resendTarget?.so_tien ?? 0)} VND</p>
            <RadioGroup value={resendMode} onValueChange={(v) => setResendMode(v as any)} className="flex gap-4">
              <div className="flex items-center gap-1.5">
                <RadioGroupItem value="full" id="bh-resend-full" />
                <Label htmlFor="bh-resend-full" className="text-xs">Toàn bộ</Label>
              </div>
              <div className="flex items-center gap-1.5">
                <RadioGroupItem value="partial" id="bh-resend-partial" />
                <Label htmlFor="bh-resend-partial" className="text-xs">1 phần</Label>
              </div>
            </RadioGroup>
            {resendMode === "partial" && (
              <Input type="number" value={resendAmount || ""}
                onChange={(e) => setResendAmount(Number(e.target.value) || 0)}
                placeholder="Nhập số tiền" className="h-8 text-xs" />
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setResendTarget(null)}>Hủy</Button>
            <Button size="sm" onClick={handleResendSubmit} disabled={updateDNTT.isPending}>Gửi lại</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Cancel Dialog */}
      <Dialog open={!!cancelTarget} onOpenChange={(v) => { if (!v) setCancelTarget(null); }}>
        <DialogContent className="sm:max-w-[340px]">
          <DialogHeader><DialogTitle className="text-sm">Hủy đề nghị thanh toán</DialogTitle></DialogHeader>
          {cancelTarget?.isPaid && (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">Đã thanh toán — chọn cách xử lý:</p>
              <RadioGroup value={cancelMode} onValueChange={(v) => setCancelMode(v as any)} className="flex gap-4">
                <div className="flex items-center gap-1.5">
                  <RadioGroupItem value="hoan_tien" id="bh-cancel-ht" />
                  <Label htmlFor="bh-cancel-ht" className="text-xs">Hoàn tiền</Label>
                </div>
                <div className="flex items-center gap-1.5">
                  <RadioGroupItem value="cong_no" id="bh-cancel-cn" />
                  <Label htmlFor="bh-cancel-cn" className="text-xs">Ghi công nợ</Label>
                </div>
              </RadioGroup>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setCancelTarget(null)}>Đóng</Button>
            <Button variant="destructive" size="sm" onClick={handleCancel} disabled={cancelMut.isPending}>Xác nhận hủy</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
