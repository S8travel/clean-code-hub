import { useState } from "react";
import { format, subDays, parseISO, addDays } from "date-fns";
import { Check, Pencil, Printer, X, Ban, SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useChiPhiList, useDNTTList, useInsertDNTT, useUpsertChiPhi } from "@/hooks/use-chi-phi";
import type { DNTTRow } from "@/hooks/use-chi-phi";
import { useCancelDNTT, useUpdateDNTT, useCreateAdjustment } from "@/hooks/use-dntt";
import type { DNTTRow as DNTTRowDntt } from "@/hooks/use-dntt";
import { exportDNTTNHWordFromData, type NHDocEntry } from "@/lib/export-dntt-nh-word";
import { useCurrentUserName } from "@/hooks/use-doan";

const fmt = (n: number) => n.toLocaleString("vi-VN");

const STATUS_LABEL: Record<string, { text: string; cls: string }> = {
  cho_duyet: { text: "Chờ duyệt ĐNTT", cls: "bg-yellow-100 text-yellow-700" },
  da_duyet:  { text: "Đã duyệt ĐNTT",  cls: "bg-teal-100 text-teal-700" },
  tu_choi:   { text: "Từ chối",         cls: "bg-red-100 text-red-700" },
};

interface CancelTarget { dnttId: number; isPaid: boolean }

interface Props {
  doanId: number;
  tenDoan?: string;
  ngayBatDau?: string;
}

// Small inline number input (like NH's NHInput)
function DVInput({ value, onChange, onBlur, width = "w-[60px]" }: {
  value: number;
  onChange: (v: number) => void;
  onBlur: () => void;
  width?: string;
}) {
  return (
    <Input
      type="number"
      value={value || ""}
      onChange={e => onChange(Number(e.target.value) || 0)}
      onBlur={onBlur}
      onKeyDown={e => { if (e.key === "Enter") (e.target as HTMLElement).blur(); }}
      className={cn("h-6 text-xs px-1.5 py-0 text-center", width)}
    />
  );
}

export default function ChiPhiDVSection({ doanId, tenDoan, ngayBatDau }: Props) {
  const { data: chiPhiRows = [] } = useChiPhiList(doanId);
  const { data: dnttList = [] } = useDNTTList(doanId);
  const { data: currentUserName = "" } = useCurrentUserName();
  const insertDNTT = useInsertDNTT();
  const updateDNTT = useUpdateDNTT();
  const upsertMut = useUpsertChiPhi();
  const cancelMut = useCancelDNTT();
  const adjustMut = useCreateAdjustment();
  const [batchPrinting, setBatchPrinting] = useState(false);

  // Inline edit state for DNTT amount
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editAmount, setEditAmount] = useState("");

  // Inline edit for row fields (so_luong, don_gia)
  const [editRow, setEditRow] = useState<Record<number, { so_luong: number; don_gia: number }>>({});

  // ĐNTT modal
  interface DVModalTarget { chiPhiId: number; thanhTien: number; moTa: string; nccId: number | null; nhaySo: number | null }
  const [dvModal, setDvModal] = useState<DVModalTarget | null>(null);
  const [dvModalMode, setDvModalMode] = useState<"full" | "deposit">("full");
  const [dvDepositAmount, setDvDepositAmount] = useState(0);
  const [dvNgayCan, setDvNgayCan] = useState("");

  // Adjust dialog (after payment)
  const [adjustTarget, setAdjustTarget] = useState<DNTTRowDntt | null>(null);
  const [adjustAmount, setAdjustAmount] = useState("");
  const [adjustReason, setAdjustReason] = useState("");

  // Resend dialog (rejected)
  const [resendTarget, setResendTarget] = useState<DNTTRow | null>(null);
  const [resendMode, setResendMode] = useState<"full" | "partial">("full");
  const [resendAmount, setResendAmount] = useState(0);

  // Cancel dialog
  const [cancelTarget, setCancelTarget] = useState<CancelTarget | null>(null);
  const [cancelMode, setCancelMode] = useState<"cong_no" | "hoan_tien">("hoan_tien");

  const dvRows = chiPhiRows.filter(
    (r) => r.danh_muc === "canh_diem" && r.tien_cong_ty > 0,
  );

  if (dvRows.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
        🎫 Chưa có dịch vụ nào (có phí, công ty trả) trong chương trình.
        <br />
        <span className="text-xs">Vào mục Điều Tour → thêm dịch vụ có phí vào chương trình ngày.</span>
      </div>
    );
  }

  // Nhóm theo ngày
  const byDay = new Map<number, typeof dvRows>();
  for (const row of dvRows) {
    const day = row.ngay_so ?? 0;
    if (!byDay.has(day)) byDay.set(day, []);
    byDay.get(day)!.push(row);
  }
  const sortedDays = [...byDay.entries()].sort((a, b) => a[0] - b[0]);
  const total = dvRows.reduce((s, r) => s + r.tien_cong_ty, 0);

  // ── Row field helpers ─────────────────────────────────────────────────────

  const getRowEdit = (row: typeof dvRows[0]) =>
    editRow[row.id] ?? { so_luong: row.so_luong, don_gia: row.don_gia };

  const handleRowChange = (id: number, field: "so_luong" | "don_gia", val: number) => {
    setEditRow(prev => {
      const base = dvRows.find(r => r.id === id);
      const existing = prev[id] ?? { so_luong: base?.so_luong ?? 0, don_gia: base?.don_gia ?? 0 };
      return { ...prev, [id]: { ...existing, [field]: val } };
    });
  };

  const handleRowSave = (row: typeof dvRows[0]) => {
    const local = editRow[row.id];
    if (!local) return;
    if (local.so_luong === row.so_luong && local.don_gia === row.don_gia) return;
    upsertMut.mutate({
      id: row.id,
      doan_id: doanId,
      so_luong: local.so_luong,
      don_gia: local.don_gia,
    } as any, {
      onSuccess: () => setEditRow(prev => { const next = { ...prev }; delete next[row.id]; return next; }),
    });
  };

  // ── Date label ────────────────────────────────────────────────────────────

  const getDateLabel = (ngaySo: number | null): string => {
    if (!ngaySo || ngaySo <= 0) return "—";
    if (!ngayBatDau) return `Ngày ${ngaySo}`;
    try {
      const d = addDays(parseISO(ngayBatDau), ngaySo - 1);
      return `N${ngaySo} · ${format(d, "d/M")}`;
    } catch {
      return `Ngày ${ngaySo}`;
    }
  };

  // ── Định kỳ toggle ────────────────────────────────────────────────────────

  const handleToggleDinhKy = (row: typeof dvRows[0]) => {
    const newVal = !row.thanh_toan_dinh_ky;
    upsertMut.mutate({ id: row.id, doan_id: doanId, thanh_toan_dinh_ky: newVal } as any, {
      onSuccess: () => toast.success(newVal ? "Đã bật thanh toán định kỳ" : "Đã tắt thanh toán định kỳ"),
    });
  };

  // ── ĐNTT handlers ─────────────────────────────────────────────────────────

  const openDvModal = (chiPhiId: number, thanhTien: number, moTa: string, nccId: number | null, ngaySo: number | null) => {
    let ngayCan = "";
    if (ngayBatDau && ngaySo != null && ngaySo > 0) {
      try {
        const serviceDate = new Date(parseISO(ngayBatDau));
        serviceDate.setDate(serviceDate.getDate() + ngaySo - 1);
        ngayCan = format(subDays(serviceDate, 1), "yyyy-MM-dd");
      } catch { /* ignore */ }
    }
    setDvModal({ chiPhiId, thanhTien, moTa, nccId, nhaySo: ngaySo });
    setDvModalMode("full");
    setDvDepositAmount(0);
    setDvNgayCan(ngayCan);
  };

  const handleDvModalSubmit = () => {
    if (!dvModal) return;
    const { chiPhiId, thanhTien, moTa, nccId } = dvModal;
    const soTien = dvModalMode === "full" ? thanhTien : dvDepositAmount;
    if (soTien <= 0) { toast.error("Số tiền phải lớn hơn 0"); return; }
    if (dvModalMode === "deposit" && soTien >= thanhTien) { toast.error("Số tiền cọc phải nhỏ hơn tổng tiền"); return; }
    insertDNTT.mutate({
      doan_id: doanId,
      loai: "dich_vu",
      mo_ta: moTa || tenDoan || "Dịch vụ",
      nha_cung_cap_id: nccId,
      so_tien: soTien,
      la_coc: dvModalMode === "deposit",
      trang_thai_duyet: "cho_duyet",
      trang_thai_thanh_toan: "chua_tt",
      ref_loai: "doan_chi_phi",
      ref_id: chiPhiId,
      so_tien_con_lai: dvModalMode === "deposit" ? thanhTien - soTien : 0,
      ngay_can_thanh_toan: dvNgayCan || null,
    } as any, {
      onSuccess: () => { toast.success("Đã gửi ĐNTT"); setDvModal(null); },
    });
  };

  const handleResendSubmit = () => {
    if (!resendTarget) return;
    const soTien = resendMode === "full" ? resendTarget.so_tien : resendAmount;
    if (soTien <= 0) { toast.error("Số tiền không hợp lệ"); return; }
    updateDNTT.mutate({
      id: resendTarget.id,
      doanId,
      so_tien: soTien,
      trang_thai_duyet: "cho_duyet",
      trang_thai_thanh_toan: "chua_tt",
      so_tien_con_lai: 0,
      duyet_boi: null,
      duyet_luc: null,
      ghi_chu: null,
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

  // ── Print handler ─────────────────────────────────────────────────────────

  const handlePrint = async () => {
    if (sortedDays.length === 0) return;
    setBatchPrinting(true);
    try {
      const entries: NHDocEntry[] = [];
      const canTruShownByNcc: Record<number, boolean> = {};

      for (const [day, rows] of sortedDays) {
        for (const row of rows) {
          const chiPhiId = row.id;
          if (!chiPhiId) continue;

          const allDntts = dnttList.filter(
            (d) => d.ref_loai === "doan_chi_phi" && d.ref_id === chiPhiId,
          );
          const activeDntts = allDntts.filter(
            (d) => d.trang_thai_duyet !== "da_huy" && d.trang_thai_duyet !== "tu_choi",
          );
          if (activeDntts.length === 0) continue;

          const activeDntt = activeDntts[0];
          const thanhTien = row.tien_cong_ty;

          const soCoc = allDntts
            .filter((d) => d.la_coc && d.trang_thai_duyet !== "da_huy" && d.trang_thai_thanh_toan === "da_tt")
            .reduce((s, d) => s + d.so_tien, 0);

          const nccId = row.nha_cung_cap_id ?? null;
          let canTruAmount = 0;
          if (nccId && !canTruShownByNcc[nccId]) {
            canTruAmount = dnttList
              .filter(
                (d) =>
                  d.trang_thai_thanh_toan === "can_tru" &&
                  d.trang_thai_duyet === "da_duyet" &&
                  d.nha_cung_cap_id === nccId,
              )
              .reduce((s, d) => s + d.so_tien, 0);
            if (canTruAmount > 0) canTruShownByNcc[nccId] = true;
          }

          const soTienConTT = Math.max(0, thanhTien - soCoc - canTruAmount);
          const ngayDisplay = getDateLabel(day > 0 ? day : null);

          entries.push({
            ngay_date: ngayDisplay,
            ten_nh: row.mo_ta || "Dịch vụ",
            so_khach: row.so_luong,
            foc: null,
            items: [{ so_luong: row.so_luong, don_gia: row.don_gia, ghi_chu: "" }],
            ncc: activeDntt.ten_nha_cung_cap
              ? {
                  ten: activeDntt.ten_nha_cung_cap || undefined,
                  so_tai_khoan: activeDntt.so_tai_khoan || undefined,
                  ngan_hang: activeDntt.ngan_hang || undefined,
                }
              : null,
            so_tien_coc: soCoc,
            can_tru: canTruAmount,
            so_tien_con_tt: soTienConTT,
          });
        }
      }

      if (entries.length === 0) {
        toast.error("Không có dịch vụ nào có ĐNTT để xuất");
        return;
      }

      await exportDNTTNHWordFromData({
        doan: { ten_doan: tenDoan || String(doanId) },
        entries,
        nguoiDeNghi: currentUserName,
      });
      toast.success("Đã xuất file Word");
    } catch (err: any) {
      toast.error("Lỗi xuất file: " + (err?.message || ""));
    } finally {
      setBatchPrinting(false);
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="rounded-lg border border-border overflow-hidden">
      <div className="px-4 py-2.5 bg-purple-50 border-b border-purple-100 flex items-center justify-between">
        <p className="text-sm font-semibold text-purple-900">🎫 Dịch vụ</p>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Tổng: {fmt(total)} ₫</span>
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs gap-1"
            onClick={handlePrint}
            disabled={batchPrinting}
          >
            <Printer className="h-3 w-3" />
            {batchPrinting ? "Đang xuất..." : "In ĐNTT"}
          </Button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-xs border-collapse">
          <colgroup>
            <col style={{ width: "60px" }} />
            <col />
            <col style={{ width: "60px" }} />
            <col style={{ width: "110px" }} />
            <col style={{ width: "120px" }} />
            <col style={{ width: "180px" }} />
            <col style={{ width: "140px" }} />
            <col style={{ width: "130px" }} />
          </colgroup>
          <thead>
            <tr className="border-b border-border bg-muted/20 text-[11px] font-medium text-muted-foreground">
              <th className="text-left px-3 py-2.5">Ngày</th>
              <th className="text-left px-3 py-2.5">Dịch vụ</th>
              <th className="text-center px-2 py-2.5">SL</th>
              <th className="text-center px-3 py-2.5">Đơn giá</th>
              <th className="text-right px-3 py-2.5">Thành tiền</th>
              <th className="text-center px-3 py-2.5">TT ĐNTT</th>
              <th className="text-center px-3 py-2.5">TT Thanh toán</th>
              <th className="px-2 py-2.5" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {sortedDays.map(([day, rows]) =>
              rows.map((row, i) => {
                const local = getRowEdit(row);
                const thanhTienLocal = local.so_luong * local.don_gia;

                const allDntts = dnttList.filter(
                  d => d.ref_loai === "doan_chi_phi" && d.ref_id === row.id,
                );
                const activeDntts = allDntts.filter(
                  d => d.trang_thai_duyet !== "da_huy" && d.trang_thai_duyet !== "tu_choi",
                );
                const rejectedDntts = allDntts.filter(d => d.trang_thai_duyet === "tu_choi");
                const paidDntts = activeDntts.filter(d => d.trang_thai_thanh_toan === "da_tt");
                const pendingDntts = activeDntts.filter(d => d.trang_thai_thanh_toan !== "da_tt");
                const daTT = paidDntts.reduce((s, d) => s + d.so_tien, 0);
                const daDeNghi = pendingDntts.reduce((s, d) => s + d.so_tien, 0);
                const thanhTien = row.tien_cong_ty;
                const isDaTT = thanhTien > 0 && daTT >= thanhTien;
                const conLai = Math.max(0, thanhTien - daTT);
                const congNoAmount = allDntts.filter(
                  d => d.trang_thai_duyet === "da_huy" && d.trang_thai_thanh_toan === "cong_no",
                ).reduce((s, d) => s + d.so_tien, 0);
                const hoanTienAmount = allDntts.filter(
                  d => d.trang_thai_duyet === "da_huy" && d.trang_thai_thanh_toan === "hoan_tien",
                ).reduce((s, d) => s + d.so_tien, 0);
                const activeDntt = pendingDntts[0] ?? paidDntts[0] ?? null;
                const canCancel = activeDntt && (
                  activeDntt.trang_thai_duyet === "cho_duyet" ||
                  activeDntt.trang_thai_duyet === "da_duyet" ||
                  activeDntt.trang_thai_thanh_toan === "da_tt"
                );
                const shownDntts = [...activeDntts, ...rejectedDntts];

                return (
                  <tr key={row.id} className="hover:bg-muted/20">
                    {/* Ngày */}
                    {i === 0 && (
                      <td className="px-3 py-2.5 text-muted-foreground align-top whitespace-nowrap text-[11px]" rowSpan={rows.length}>
                        {getDateLabel(day > 0 ? day : null)}
                      </td>
                    )}

                    {/* Dịch vụ */}
                    <td className="px-3 py-2.5 font-medium">{row.mo_ta || "—"}</td>

                    {/* SL — editable */}
                    <td className="px-2 py-2.5">
                      <div className="flex justify-center">
                        <DVInput
                          value={local.so_luong}
                          onChange={v => handleRowChange(row.id, "so_luong", v)}
                          onBlur={() => handleRowSave(row)}
                          width="w-[44px]"
                        />
                      </div>
                    </td>

                    {/* Đơn giá — editable */}
                    <td className="px-3 py-2.5">
                      <div className="flex justify-center">
                        <DVInput
                          value={local.don_gia}
                          onChange={v => handleRowChange(row.id, "don_gia", v)}
                          onBlur={() => handleRowSave(row)}
                          width="w-[90px]"
                        />
                      </div>
                    </td>

                    {/* Thành tiền */}
                    <td className="px-3 py-2.5 text-right font-semibold text-primary whitespace-nowrap">
                      {fmt(thanhTienLocal)} ₫
                    </td>

                    {/* TT ĐNTT */}
                    <td className="px-3 py-2.5 align-top">
                      {shownDntts.length === 0 ? (
                        <span className="text-[10px] text-muted-foreground flex justify-center">—</span>
                      ) : (
                        <div className="space-y-1.5 flex flex-col items-center">
                          {shownDntts.map(d => {
                            const isRejected = d.trang_thai_duyet === "tu_choi";
                            const statusInfo = STATUS_LABEL[d.trang_thai_duyet] ?? STATUS_LABEL.cho_duyet;
                            return (
                              <div key={d.id} className="flex items-center gap-1.5 flex-wrap justify-center">
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
                                      onChange={e => setEditAmount(e.target.value)}
                                      onKeyDown={e => {
                                        if (e.key === "Enter") handleEditSave(d.id);
                                        if (e.key === "Escape") setEditingId(null);
                                      }}
                                      className="h-6 w-20 text-xs px-2 py-0" />
                                    <Button variant="ghost" size="sm" className="h-5 w-5 p-0 text-emerald-600"
                                      disabled={updateDNTT.isPending}
                                      onClick={() => handleEditSave(d.id)}>
                                      <Check className="h-3 w-3" />
                                    </Button>
                                    <Button variant="ghost" size="sm" className="h-5 w-5 p-0 text-muted-foreground"
                                      onClick={() => setEditingId(null)}>
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
                    <td className="px-3 py-2.5 align-top">
                      <div className="space-y-1.5 flex flex-col items-center">
                        {activeDntts.map(d => (
                          <div key={d.id}>
                            {d.trang_thai_thanh_toan === "da_tt" ? (
                              <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-emerald-100 text-emerald-700 whitespace-nowrap">
                                Đã TT{d.ngay_thanh_toan ? ` ${format(new Date(d.ngay_thanh_toan), "dd/MM")}` : ""}
                              </span>
                            ) : (
                              <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-yellow-100 text-yellow-800 whitespace-nowrap">
                                Chờ UNC · {fmt(d.so_tien)}
                              </span>
                            )}
                          </div>
                        ))}
                        {congNoAmount > 0 && (
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-purple-100 text-purple-700 whitespace-nowrap">
                            CN: {fmt(congNoAmount)}
                          </span>
                        )}
                        {hoanTienAmount > 0 && (
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-100 text-blue-700 whitespace-nowrap">
                            HT: {fmt(hoanTienAmount)}
                          </span>
                        )}
                        {activeDntts.length === 0 && congNoAmount === 0 && hoanTienAmount === 0 && (
                          <span className="text-[10px] text-muted-foreground">—</span>
                        )}
                      </div>
                    </td>

                    {/* Actions */}
                    <td className="px-2 py-2.5">
                      <div className="flex items-center gap-1 justify-end">
                        {isDaTT && paidDntts.length > 0 && (
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
                        {canCancel && activeDntt && (
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
                          className={cn("h-6 text-[10px] px-1.5", row.thanh_toan_dinh_ky ? "text-indigo-600 hover:text-indigo-700" : "text-muted-foreground hover:text-foreground")}
                          title={row.thanh_toan_dinh_ky ? "Đang định kỳ — bấm để tắt" : "Đặt thanh toán định kỳ"}
                          disabled={upsertMut.isPending}
                          onClick={() => handleToggleDinhKy(row)}>
                          ⏱
                        </Button>
                        {row.thanh_toan_dinh_ky && activeDntts.length === 0 && (
                          <span className="text-[10px] text-indigo-500 italic">Định kỳ</span>
                        )}
                        {!row.thanh_toan_dinh_ky && activeDntts.length === 0 && thanhTien > 0 && (
                          <Button variant="outline" size="sm" className="h-6 text-[10px] px-2"
                            onClick={() => openDvModal(row.id!, thanhTien, row.mo_ta || "", row.nha_cung_cap_id, row.ngay_so)}>
                            ĐNTT
                          </Button>
                        )}
                        {activeDntts.length > 0 && daDeNghi === 0 && (
                          <Button variant="outline" size="sm" className="h-6 text-[10px] px-2 border-amber-400 text-amber-700 hover:bg-amber-50"
                            onClick={() => openDvModal(row.id!, conLai > 0 ? conLai : thanhTien, row.mo_ta || "", row.nha_cung_cap_id, row.ngay_so)}>
                            {conLai > 0 ? "ĐNTT còn lại" : "ĐNTT bổ sung"}
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              }),
            )}
          </tbody>
        </table>
      </div>

      {/* ĐNTT Modal */}
      <Dialog open={!!dvModal} onOpenChange={v => { if (!v) setDvModal(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-sm">Tạo đề nghị thanh toán — {dvModal?.moTa || "Dịch vụ"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2 text-xs">
            <p>Tổng tiền: <span className="font-semibold">{fmt(dvModal?.thanhTien ?? 0)} VND</span></p>
            <RadioGroup value={dvModalMode} onValueChange={v => setDvModalMode(v as "full" | "deposit")} className="space-y-2">
              <div className="flex items-center gap-2">
                <RadioGroupItem value="full" id="dv-full" />
                <Label htmlFor="dv-full" className="text-xs cursor-pointer">
                  Toàn bộ — {fmt(dvModal?.thanhTien ?? 0)} VND
                </Label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem value="deposit" id="dv-dep" />
                <Label htmlFor="dv-dep" className="text-xs cursor-pointer">1 phần (cọc)</Label>
              </div>
            </RadioGroup>
            {dvModalMode === "deposit" && (
              <div className="space-y-1">
                <Label className="text-xs">Số tiền cọc</Label>
                <Input type="number" className="h-8 text-xs"
                  value={dvDepositAmount || ""}
                  onChange={e => setDvDepositAmount(Number(e.target.value) || 0)}
                  max={dvModal?.thanhTien} />
                {dvDepositAmount > 0 && dvModal && (
                  <p className="text-[11px] text-muted-foreground">Còn lại: {fmt(dvModal.thanhTien - dvDepositAmount)} VND</p>
                )}
              </div>
            )}
            <div className="space-y-1">
              <Label className="text-xs">Ngày cần thanh toán</Label>
              <Input type="date" className="h-8 text-xs"
                value={dvNgayCan}
                onChange={e => setDvNgayCan(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" className="text-xs" onClick={() => setDvModal(null)}>Hủy</Button>
            <Button size="sm" className="text-xs" onClick={handleDvModalSubmit} disabled={insertDNTT.isPending}>
              Tạo đề nghị TT
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Adjust Dialog */}
      <Dialog open={!!adjustTarget} onOpenChange={o => { if (!o) setAdjustTarget(null); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-sm">Điều chỉnh sau thanh toán</DialogTitle>
          </DialogHeader>
          {adjustTarget && (
            <div className="space-y-3 py-1 text-sm">
              <p className="text-xs text-muted-foreground">{adjustTarget.mo_ta}</p>
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Đã thanh toán:</span>
                <span className="font-semibold">{fmt(adjustTarget.so_tien)} ₫</span>
              </div>
              <div className="space-y-1">
                <Label className="text-xs font-medium">Số tiền thực tế</Label>
                <Input
                  className="h-8 text-sm"
                  value={adjustAmount}
                  onChange={e => setAdjustAmount(e.target.value.replace(/\D/g, ""))}
                  placeholder="Nhập số tiền..."
                />
              </div>
              {(() => {
                const actual = parseInt(adjustAmount.replace(/\D/g, ""), 10);
                if (isNaN(actual) || actual === adjustTarget.so_tien) return null;
                const delta = actual - adjustTarget.so_tien;
                return (
                  <div className={cn(
                    "rounded px-3 py-2 text-xs font-medium",
                    delta > 0 ? "bg-yellow-50 text-yellow-700" : "bg-purple-50 text-purple-700",
                  )}>
                    {delta > 0
                      ? `Thiếu ${fmt(delta)} ₫ → tạo ĐNTT bổ sung (chờ duyệt)`
                      : `Thừa ${fmt(Math.abs(delta))} ₫ → ghi công nợ NCC`
                    }
                  </div>
                );
              })()}
              <div className="space-y-1">
                <Label className="text-xs font-medium">Lý do</Label>
                <Textarea
                  className="text-xs min-h-[56px]"
                  value={adjustReason}
                  onChange={e => setAdjustReason(e.target.value)}
                  placeholder="VD: Thay đổi số lượng..."
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" size="sm" className="text-xs" onClick={() => setAdjustTarget(null)}>Đóng</Button>
            <Button
              size="sm"
              className="text-xs"
              disabled={
                adjustMut.isPending ||
                !adjustAmount ||
                parseInt(adjustAmount.replace(/\D/g, ""), 10) === adjustTarget?.so_tien
              }
              onClick={() => {
                if (!adjustTarget) return;
                const soTienThucTe = parseInt(adjustAmount.replace(/\D/g, ""), 10);
                if (isNaN(soTienThucTe)) return;
                adjustMut.mutate(
                  { dnttGoc: adjustTarget, soTienThucTe, lyDo: adjustReason || "Điều chỉnh số lượng" },
                  {
                    onSuccess: (result) => {
                      if (!result) return;
                      if (result.delta > 0) toast.success(`Đã tạo ĐNTT bổ sung ${fmt(result.delta)} ₫`);
                      else toast.success(`Đã ghi công nợ ${fmt(Math.abs(result.delta))} ₫`);
                      setAdjustTarget(null);
                    },
                    onError: (err: any) => toast.error(err?.message || "Lỗi điều chỉnh"),
                  },
                );
              }}
            >
              Xác nhận
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Resend Dialog */}
      <Dialog open={!!resendTarget} onOpenChange={v => { if (!v) setResendTarget(null); }}>
        <DialogContent className="sm:max-w-[360px]">
          <DialogHeader><DialogTitle className="text-sm">Gửi lại ĐNTT</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">Số tiền gốc: {fmt(resendTarget?.so_tien ?? 0)} VND</p>
            <RadioGroup value={resendMode} onValueChange={v => setResendMode(v as any)} className="flex gap-4">
              <div className="flex items-center gap-1.5">
                <RadioGroupItem value="full" id="dv-resend-full" />
                <Label htmlFor="dv-resend-full" className="text-xs">Toàn bộ</Label>
              </div>
              <div className="flex items-center gap-1.5">
                <RadioGroupItem value="partial" id="dv-resend-partial" />
                <Label htmlFor="dv-resend-partial" className="text-xs">1 phần</Label>
              </div>
            </RadioGroup>
            {resendMode === "partial" && (
              <Input type="number" value={resendAmount || ""}
                onChange={e => setResendAmount(Number(e.target.value) || 0)}
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
      <Dialog open={!!cancelTarget} onOpenChange={v => { if (!v) setCancelTarget(null); }}>
        <DialogContent className="sm:max-w-[340px]">
          <DialogHeader><DialogTitle className="text-sm">Hủy đề nghị thanh toán</DialogTitle></DialogHeader>
          {cancelTarget?.isPaid && (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">Đã thanh toán — chọn cách xử lý:</p>
              <RadioGroup value={cancelMode} onValueChange={v => setCancelMode(v as any)} className="flex gap-4">
                <div className="flex items-center gap-1.5">
                  <RadioGroupItem value="hoan_tien" id="dv-cancel-ht" />
                  <Label htmlFor="dv-cancel-ht" className="text-xs">Hoàn tiền</Label>
                </div>
                <div className="flex items-center gap-1.5">
                  <RadioGroupItem value="cong_no" id="dv-cancel-cn" />
                  <Label htmlFor="dv-cancel-cn" className="text-xs">Ghi công nợ</Label>
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
