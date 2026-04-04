import { useEffect, useState } from "react";
import { Check, Pencil, X, Ban, SlidersHorizontal, Trash2 } from "lucide-react";
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
import {
  useChiPhiList, useDNTTList, useInsertDNTT, useUpsertChiPhi, useDeleteChiPhi,
} from "@/hooks/use-chi-phi";
import type { DNTTRow } from "@/hooks/use-chi-phi";
import { useCancelDNTT, useUpdateDNTT, useCreateAdjustment } from "@/hooks/use-dntt";
import type { DNTTRow as DNTTRowDntt } from "@/hooks/use-dntt";
import { useDonViVisaList, useLoaiVisaList } from "@/hooks/use-visa";
import { SearchableSelect } from "@/components/SearchableSelect";

const fmt = (n: number) => n.toLocaleString("vi-VN");

const STATUS_LABEL: Record<string, { text: string; cls: string }> = {
  cho_duyet: { text: "Chờ duyệt ĐNTT", cls: "bg-yellow-100 text-yellow-700" },
  da_duyet:  { text: "Đã duyệt ĐNTT",  cls: "bg-teal-100 text-teal-700" },
  tu_choi:   { text: "Từ chối",         cls: "bg-red-100 text-red-700" },
};

interface CancelTarget { dnttId: number; isPaid: boolean }

interface Props {
  doanId: number;
}

// ── Add visa row form ──────────────────────────────────────────────────────────

function AddVisaRow({ doanId, onAdded }: { doanId: number; onAdded: () => void }) {
  const { data: donViList = [] } = useDonViVisaList();
  const [donViId, setDonViId] = useState("");
  const [loaiVisaId, setLoaiVisaId] = useState("");
  const { data: loaiVisaList = [] } = useLoaiVisaList(donViId ? Number(donViId) : null);
  const upsertMut = useUpsertChiPhi();

  const donViOptions = donViList.map((d) => ({ value: String(d.id), label: d.ten }));
  const loaiOptions = loaiVisaList.map((l) => ({
    value: String(l.id),
    label: [l.quoc_gia, l.loai, l.thoi_han].filter(Boolean).join(" · "),
  }));

  const selectedLoai = loaiVisaList.find((l) => String(l.id) === loaiVisaId);
  const selectedDonVi = donViList.find((d) => String(d.id) === donViId);

  const handleAdd = async () => {
    if (!loaiVisaId) { toast.warning("Vui lòng chọn loại visa"); return; }
    const moTa = [
      selectedDonVi?.ten,
      selectedLoai?.quoc_gia,
      selectedLoai?.loai,
      selectedLoai?.thoi_han,
    ].filter(Boolean).join(" · ");

    await upsertMut.mutateAsync({
      doan_id: doanId,
      danh_muc: "visa",
      loai: "visa",
      mo_ta: moTa,
      don_gia: selectedLoai?.gia ?? 0,
      so_luong: 1,
      tien_cong_ty: selectedLoai?.gia ?? 0,
      tien_hdv: 0,
      nha_cung_cap_id: selectedDonVi?.nha_cung_cap_id ?? null,
    } as any, {
      onSuccess: () => { toast.success("Đã thêm visa"); onAdded(); },
    });
  };

  return (
    <div className="px-4 py-3 border-t border-border bg-muted/10 space-y-2">
      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label className="text-xs">Đơn vị visa</Label>
          <SearchableSelect
            options={donViOptions}
            value={donViId}
            onChange={(v) => { setDonViId(v); setLoaiVisaId(""); }}
            placeholder="Chọn đơn vị"
            className="h-7 text-xs"
          />
        </div>
        <div>
          <Label className="text-xs">Loại visa *</Label>
          <SearchableSelect
            options={loaiOptions}
            value={loaiVisaId}
            onChange={setLoaiVisaId}
            placeholder="Chọn loại visa"
            className="h-7 text-xs"
          />
        </div>
      </div>
      <div className="flex justify-end gap-2">
        <Button size="sm" className="h-7 text-xs" onClick={handleAdd} disabled={upsertMut.isPending}>
          Thêm
        </Button>
      </div>
    </div>
  );
}

// ── Main section ───────────────────────────────────────────────────────────────

export default function ChiPhiVisaSection({ doanId }: Props) {
  const { data: chiPhiRows = [] } = useChiPhiList(doanId);
  const { data: dnttList = [] } = useDNTTList(doanId);
  const insertDNTT = useInsertDNTT();
  const updateDNTT = useUpdateDNTT();
  const upsertMut = useUpsertChiPhi();
  const deleteMut = useDeleteChiPhi();
  const cancelMut = useCancelDNTT();
  const adjustMut = useCreateAdjustment();

  const [showAdd, setShowAdd] = useState(false);

  // Inline edit ĐNTT amount
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editAmount, setEditAmount] = useState("");

  // ĐNTT modal
  interface VisaModalTarget { chiPhiId: number; thanhTien: number; moTa: string; nccId: number | null }
  const [modal, setModal] = useState<VisaModalTarget | null>(null);
  const [modalMode, setModalMode] = useState<"full" | "deposit">("full");
  const [depositAmount, setDepositAmount] = useState(0);
  const [ngayCan, setNgayCan] = useState("");

  // Adjust dialog
  const [adjustTarget, setAdjustTarget] = useState<DNTTRowDntt | null>(null);
  const [adjustAmount, setAdjustAmount] = useState("");
  const [adjustReason, setAdjustReason] = useState("");

  // Resend dialog
  const [resendTarget, setResendTarget] = useState<DNTTRow | null>(null);
  const [resendMode, setResendMode] = useState<"full" | "partial">("full");
  const [resendAmount, setResendAmount] = useState(0);

  // Cancel dialog
  const [cancelTarget, setCancelTarget] = useState<CancelTarget | null>(null);
  const [cancelMode, setCancelMode] = useState<"cong_no" | "hoan_tien">("hoan_tien");

  const visaRows = chiPhiRows.filter((r) => r.danh_muc === "visa");
  const total = visaRows.reduce((s, r) => s + r.tien_cong_ty, 0);

  // ── Inline row edit (so_luong, don_gia) ──────────────────────────────────
  const [editRow, setEditRow] = useState<Record<number, { so_luong: number; don_gia: number }>>({});

  const getRowEdit = (row: typeof visaRows[0]) =>
    editRow[row.id] ?? { so_luong: row.so_luong, don_gia: row.don_gia };

  const handleRowChange = (id: number, field: "so_luong" | "don_gia", val: number) => {
    setEditRow((prev) => {
      const base = visaRows.find((r) => r.id === id);
      const existing = prev[id] ?? { so_luong: base?.so_luong ?? 0, don_gia: base?.don_gia ?? 0 };
      return { ...prev, [id]: { ...existing, [field]: val } };
    });
  };

  const handleRowSave = (row: typeof visaRows[0]) => {
    const local = editRow[row.id];
    if (!local) return;
    if (local.so_luong === row.so_luong && local.don_gia === row.don_gia) return;
    upsertMut.mutate({
      id: row.id,
      doan_id: doanId,
      so_luong: local.so_luong,
      don_gia: local.don_gia,
      tien_cong_ty: local.so_luong * local.don_gia,
    } as any, {
      onSuccess: () => setEditRow((prev) => { const next = { ...prev }; delete next[row.id]; return next; }),
    });
  };

  // ── Định kỳ toggle ────────────────────────────────────────────────────────
  const handleToggleDinhKy = (row: typeof visaRows[0]) => {
    const newVal = !row.thanh_toan_dinh_ky;
    upsertMut.mutate({ id: row.id, doan_id: doanId, thanh_toan_dinh_ky: newVal } as any, {
      onSuccess: () => toast.success(newVal ? "Đã bật thanh toán định kỳ" : "Đã tắt thanh toán định kỳ"),
    });
  };

  // ── ĐNTT handlers ─────────────────────────────────────────────────────────
  const openModal = (chiPhiId: number, thanhTien: number, moTa: string, nccId: number | null) => {
    setModal({ chiPhiId, thanhTien, moTa, nccId });
    setModalMode("full");
    setDepositAmount(0);
    setNgayCan("");
  };

  const handleModalSubmit = () => {
    if (!modal) return;
    const { chiPhiId, thanhTien, moTa, nccId } = modal;
    const soTien = modalMode === "full" ? thanhTien : depositAmount;
    if (soTien <= 0) { toast.error("Số tiền phải lớn hơn 0"); return; }
    if (modalMode === "deposit" && soTien >= thanhTien) { toast.error("Số tiền cọc phải nhỏ hơn tổng tiền"); return; }
    insertDNTT.mutate({
      doan_id: doanId,
      loai: "visa",
      mo_ta: moTa || "Visa",
      nha_cung_cap_id: nccId,
      so_tien: soTien,
      la_coc: modalMode === "deposit",
      trang_thai_duyet: "cho_duyet",
      trang_thai_thanh_toan: "chua_tt",
      ref_loai: "doan_chi_phi",
      ref_id: chiPhiId,
      so_tien_con_lai: modalMode === "deposit" ? thanhTien - soTien : 0,
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

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-indigo-100 bg-indigo-50">
        <span className="text-sm font-semibold text-indigo-900">🛂 Visa</span>
        <div className="flex items-center gap-3">
          {total > 0 && <span className="text-xs text-muted-foreground">Tổng: {fmt(total)} ₫</span>}
          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setShowAdd(!showAdd)}>
            + Thêm
          </Button>
        </div>
      </div>

      {visaRows.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse">
            <colgroup>
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
                <th className="text-left px-4 py-2.5">Loại visa</th>
                <th className="text-center px-2 py-2.5">SL</th>
                <th className="text-center px-3 py-2.5">Đơn giá</th>
                <th className="text-right px-3 py-2.5">Thành tiền</th>
                <th className="text-center px-3 py-2.5">TT ĐNTT</th>
                <th className="text-center px-3 py-2.5">TT Thanh toán</th>
                <th className="px-2 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {visaRows.map((row) => {
                const local = getRowEdit(row);
                const thanhTienLocal = local.so_luong * local.don_gia;

                const allDntts = dnttList.filter(
                  (d) => d.ref_loai === "doan_chi_phi" && d.ref_id === row.id,
                );
                const activeDntts = allDntts.filter(
                  (d) => d.trang_thai_duyet !== "da_huy" && d.trang_thai_duyet !== "tu_choi",
                );
                const rejectedDntts = allDntts.filter((d) => d.trang_thai_duyet === "tu_choi");
                const paidDntts = activeDntts.filter((d) => d.trang_thai_thanh_toan === "da_tt");
                const pendingDntts = activeDntts.filter((d) => d.trang_thai_thanh_toan !== "da_tt");
                const daTT = paidDntts.reduce((s, d) => s + d.so_tien, 0);
                const daDeNghi = pendingDntts.reduce((s, d) => s + d.so_tien, 0);
                const thanhTien = row.tien_cong_ty;
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

                return (
                  <tr key={row.id} className="hover:bg-muted/20">
                    {/* Loại visa */}
                    <td className="px-4 py-2.5 font-medium">{row.mo_ta || "—"}</td>

                    {/* SL */}
                    <td className="px-2 py-2.5">
                      <div className="flex justify-center">
                        <Input
                          type="number"
                          value={local.so_luong || ""}
                          onChange={(e) => handleRowChange(row.id, "so_luong", Number(e.target.value) || 0)}
                          onBlur={() => handleRowSave(row)}
                          onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLElement).blur(); }}
                          className="h-6 text-xs px-1.5 py-0 text-center w-[44px]"
                        />
                      </div>
                    </td>

                    {/* Đơn giá */}
                    <td className="px-3 py-2.5">
                      <div className="flex justify-center">
                        <Input
                          type="number"
                          value={local.don_gia || ""}
                          onChange={(e) => handleRowChange(row.id, "don_gia", Number(e.target.value) || 0)}
                          onBlur={() => handleRowSave(row)}
                          onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLElement).blur(); }}
                          className="h-6 text-xs px-1.5 py-0 text-center w-[90px]"
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
                          {shownDntts.map((d) => {
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
                                      onChange={(e) => setEditAmount(e.target.value)}
                                      onKeyDown={(e) => {
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
                        {activeDntts.map((d) => (
                          <div key={d.id}>
                            {d.trang_thai_thanh_toan === "da_tt" ? (
                              <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-emerald-100 text-emerald-700 whitespace-nowrap">
                                Đã TT{d.ngay_thanh_toan ? ` ${new Date(d.ngay_thanh_toan).toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit" })}` : ""}
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
                        {!row.thanh_toan_dinh_ky && activeDntts.length === 0 && thanhTien > 0 && (
                          <Button variant="outline" size="sm" className="h-6 text-[10px] px-2"
                            onClick={() => openModal(row.id!, thanhTien, row.mo_ta || "", row.nha_cung_cap_id)}>
                            ĐNTT
                          </Button>
                        )}
                        {activeDntts.length > 0 && daDeNghi === 0 && (
                          <Button variant="outline" size="sm" className="h-6 text-[10px] px-2 border-amber-400 text-amber-700 hover:bg-amber-50"
                            onClick={() => openModal(row.id!, conLai > 0 ? conLai : thanhTien, row.mo_ta || "", row.nha_cung_cap_id)}>
                            {conLai > 0 ? "ĐNTT còn lại" : "ĐNTT bổ sung"}
                          </Button>
                        )}
                        <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
                          onClick={() => deleteMut.mutate({ id: row.id, doanId }, { onSuccess: () => toast.success("Đã xóa") })}
                          disabled={deleteMut.isPending}>
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {visaRows.length === 0 && !showAdd && (
        <p className="px-4 py-3 text-sm text-muted-foreground">Bấm "+ Thêm" để thêm chi phí visa.</p>
      )}

      {showAdd && (
        <AddVisaRow doanId={doanId} onAdded={() => setShowAdd(false)} />
      )}

      {/* ĐNTT Modal */}
      <Dialog open={!!modal} onOpenChange={(v) => { if (!v) setModal(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-sm">Tạo đề nghị thanh toán — {modal?.moTa || "Visa"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2 text-xs">
            <p>Tổng tiền: <span className="font-semibold">{fmt(modal?.thanhTien ?? 0)} VND</span></p>
            <RadioGroup value={modalMode} onValueChange={(v) => setModalMode(v as "full" | "deposit")} className="space-y-2">
              <div className="flex items-center gap-2">
                <RadioGroupItem value="full" id="visa-full" />
                <Label htmlFor="visa-full" className="text-xs cursor-pointer">
                  Toàn bộ — {fmt(modal?.thanhTien ?? 0)} VND
                </Label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem value="deposit" id="visa-dep" />
                <Label htmlFor="visa-dep" className="text-xs cursor-pointer">1 phần (cọc)</Label>
              </div>
            </RadioGroup>
            {modalMode === "deposit" && (
              <div className="space-y-1">
                <Label className="text-xs">Số tiền cọc</Label>
                <Input type="number" className="h-8 text-xs"
                  value={depositAmount || ""}
                  onChange={(e) => setDepositAmount(Number(e.target.value) || 0)}
                  max={modal?.thanhTien} />
                {depositAmount > 0 && modal && (
                  <p className="text-[11px] text-muted-foreground">Còn lại: {fmt(modal.thanhTien - depositAmount)} VND</p>
                )}
              </div>
            )}
            <div className="space-y-1">
              <Label className="text-xs">Ngày cần thanh toán</Label>
              <Input type="date" className="h-8 text-xs"
                value={ngayCan}
                onChange={(e) => setNgayCan(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" className="text-xs" onClick={() => setModal(null)}>Hủy</Button>
            <Button size="sm" className="text-xs" onClick={handleModalSubmit} disabled={insertDNTT.isPending}>
              Tạo đề nghị TT
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Adjust Dialog */}
      <Dialog open={!!adjustTarget} onOpenChange={(o) => { if (!o) setAdjustTarget(null); }}>
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
                  onChange={(e) => setAdjustAmount(e.target.value.replace(/\D/g, ""))}
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
                  onChange={(e) => setAdjustReason(e.target.value)}
                  placeholder="VD: Thay đổi số lượng..."
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" size="sm" className="text-xs" onClick={() => setAdjustTarget(null)}>Đóng</Button>
            <Button
              size="sm" className="text-xs"
              disabled={
                adjustMut.isPending || !adjustAmount ||
                parseInt(adjustAmount.replace(/\D/g, ""), 10) === adjustTarget?.so_tien
              }
              onClick={() => {
                if (!adjustTarget) return;
                const soTienThucTe = parseInt(adjustAmount.replace(/\D/g, ""), 10);
                if (isNaN(soTienThucTe)) return;
                adjustMut.mutate(
                  { dnttGoc: adjustTarget, soTienThucTe, lyDo: adjustReason || "Điều chỉnh" },
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
      <Dialog open={!!resendTarget} onOpenChange={(v) => { if (!v) setResendTarget(null); }}>
        <DialogContent className="sm:max-w-[360px]">
          <DialogHeader><DialogTitle className="text-sm">Gửi lại ĐNTT</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">Số tiền gốc: {fmt(resendTarget?.so_tien ?? 0)} VND</p>
            <RadioGroup value={resendMode} onValueChange={(v) => setResendMode(v as any)} className="flex gap-4">
              <div className="flex items-center gap-1.5">
                <RadioGroupItem value="full" id="visa-resend-full" />
                <Label htmlFor="visa-resend-full" className="text-xs">Toàn bộ</Label>
              </div>
              <div className="flex items-center gap-1.5">
                <RadioGroupItem value="partial" id="visa-resend-partial" />
                <Label htmlFor="visa-resend-partial" className="text-xs">1 phần</Label>
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
                  <RadioGroupItem value="hoan_tien" id="visa-cancel-ht" />
                  <Label htmlFor="visa-cancel-ht" className="text-xs">Hoàn tiền</Label>
                </div>
                <div className="flex items-center gap-1.5">
                  <RadioGroupItem value="cong_no" id="visa-cancel-cn" />
                  <Label htmlFor="visa-cancel-cn" className="text-xs">Ghi công nợ</Label>
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
