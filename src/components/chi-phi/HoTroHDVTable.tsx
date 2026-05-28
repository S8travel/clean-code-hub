import { useState, useEffect, useMemo } from "react";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { externalSupabase } from "@/lib/supabase-external";
import { errMsg } from "@/lib/error";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { DatePicker } from "@/components/ui/date-picker";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  useUpsertChiPhi, useDeleteChiPhi,
  useDNTTList, useInsertDNTT,
} from "@/hooks/use-chi-phi";
import { useUpdateDNTT } from "@/hooks/use-dntt";
import { usePaymentsByChiPhi } from "@/hooks/use-payments";
import { useCongNoList } from "@/hooks/use-cong-no";
import { exportDnttKhacHoanUngWord } from "@/lib/export-dntt-khac-word";
import { t } from "@/lib/i18n";
import { useCancelDNTT, type HDVHoTroItem } from "@/hooks/use-chi-phi-hdv";
import type { HDVDoanInfo, KhacModalItem, KhacModalTarget, KhacCancelTarget } from "./hdv-shared";
import { HDVHoTroRow } from "./HDVHoTroRow";

const fmt = (n: number) => n.toLocaleString("vi-VN");

// ── Chi phí "Khác" (cũ: Hướng dẫn viên) ─────────────────────────────────────
// Mỗi row độc lập: SL × Đơn giá. Nguồn = "Công ty" → có thể tạo ĐNTT cho NCC
// (template tương tự nhà hàng: full/cọc + ngày cần TT). Nguồn = "HDV" → HDV
// tự ứng, không cần ĐNTT.
export function HoTroHDVTable({ doanId, doan, hoTroItems }: {
  doanId: number;
  doan?: HDVDoanInfo;
  hoTroItems: HDVHoTroItem[];
}) {
  const qc = useQueryClient();
  const upsertMut = useUpsertChiPhi();
  const deleteMut = useDeleteChiPhi();
  const insertDNTT = useInsertDNTT();
  const updateDNTT = useUpdateDNTT();
  const cancelMut = useCancelDNTT();
  const { data: dnttList = [] } = useDNTTList(doanId);
  const { data: paymentsList = [] } = usePaymentsByChiPhi(doanId);
  const { data: congNoList = [] } = useCongNoList({ doanId });
  const [addingRow, setAddingRow] = useState(false);

  // Allocations cho mọi ĐNTT của đoàn — map chi_phi_id → dntt_id[].
  // Cần thiết vì ĐNTT gộp có ref_id trỏ về 1 row nhưng allocations cover N rows.
  // Lookup theo ref_id thuần (như NH/DV) chỉ thấy DNTT trên row primary → các row
  // còn lại trong nhóm gộp mất badge. Allocations là nguồn truth duy nhất.
  const dnttIdsKey = useMemo(
    () => dnttList.map((d) => d.id).sort((a, b) => a - b).join(","),
    [dnttList],
  );
  const { data: allocsList = [] } = useQuery({
    queryKey: ["dntt_allocations_for_khac", doanId, dnttIdsKey],
    enabled: dnttList.length > 0,
    queryFn: async () => {
      const ids = dnttList.map((d) => d.id);
      if (ids.length === 0) return [];
      const { data, error } = await externalSupabase
        .from("dntt_allocations")
        .select("dntt_id, chi_phi_id, so_tien")
        .in("dntt_id", ids);
      if (error) throw error;
      return (data ?? []) as { dntt_id: number; chi_phi_id: number; so_tien: number }[];
    },
  });
  const dnttsByChiPhi = useMemo(() => {
    const m: Record<number, number[]> = {};
    allocsList.forEach((a) => {
      if (!m[a.chi_phi_id]) m[a.chi_phi_id] = [];
      m[a.chi_phi_id].push(a.dntt_id);
    });
    return m;
  }, [allocsList]);

  // Cấn trừ payments đã ghi nhận per DNTT (hiển thị "CT X → TT Y")
  const canTruByDnttId = useMemo(() => {
    const m: Record<number, number> = {};
    paymentsList.forEach((p) => {
      if (p.method !== "can_tru") return;
      m[p.dntt_id] = (m[p.dntt_id] || 0) + p.payment_so_tien;
    });
    return m;
  }, [paymentsList]);

  // Multi-select cho ĐNTT gộp
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  // Cleanup selectedIds khi row trở thành non-selectable (vừa tạo ĐNTT, đổi sang HDV...)
  useEffect(() => {
    setSelectedIds((prev) => {
      const validIds = new Set(hoTroItems.map((i) => i.id));
      const next = prev.filter((id) => {
        if (!validIds.has(id)) return false;
        const item = hoTroItems.find((i) => i.id === id);
        if (!item || item.tien_cong_ty <= 0) return false;
        const rIds = dnttsByChiPhi[id] || [];
        const hasActive = rIds.some((dId) => {
          const d = dnttList.find((x) => x.id === dId);
          return d && d.trang_thai_duyet !== "da_huy" && d.trang_thai_duyet !== "tu_choi";
        });
        return !hasActive;
      });
      return next.length === prev.length ? prev : next;
    });
  }, [hoTroItems, dnttsByChiPhi, dnttList]);

  // Row được phép chọn để ĐNTT gộp: Nguồn = Công ty, có tiền > 0, chưa có DNTT
  // còn hiệu lực (hoặc gốc cũ chưa thanh toán) — dùng dnttsByChiPhi để xét.
  const isSelectable = (item: HDVHoTroItem): boolean => {
    if (item.tien_cong_ty <= 0) return false;
    const rowDnttIds = dnttsByChiPhi[item.id] || [];
    const hasActive = rowDnttIds.some((id) => {
      const d = dnttList.find((x) => x.id === id);
      return d && d.trang_thai_duyet !== "da_huy" && d.trang_thai_duyet !== "tu_choi";
    });
    return !hasActive;
  };
  const selectableIds = useMemo(
    () => hoTroItems.filter(isSelectable).map((i) => i.id),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [hoTroItems, dnttsByChiPhi, dnttList],
  );
  const selectedItems = useMemo(
    () => selectedIds.map((id) => hoTroItems.find((i) => i.id === id)).filter(Boolean) as HDVHoTroItem[],
    [selectedIds, hoTroItems],
  );
  const selectedTotal = selectedItems.reduce((s, i) => s + i.tien_cong_ty, 0);

  // Modal ĐNTT — items "Khác" là hoàn ứng cho cá nhân, KHÔNG có NCC. User nhập
  // tên người nhận + STK/ngân hàng (tùy chọn cho chuyển khoản). Bulk chỉ full.
  const [modal, setModal] = useState<KhacModalTarget | null>(null);
  const [modalMode, setModalMode] = useState<"full" | "deposit">("full");
  const [depositAmount, setDepositAmount] = useState(0);
  const [ngayCan, setNgayCan] = useState("");
  const [payeeName, setPayeeName] = useState("");
  const [payeeStk, setPayeeStk] = useState("");
  const [payeeBank, setPayeeBank] = useState("");
  const [payeeLyDo, setPayeeLyDo] = useState("");

  // Inline edit số tiền ĐNTT đang chờ duyệt
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editAmount, setEditAmount] = useState("");

  // Hủy ĐNTT
  const [cancelTarget, setCancelTarget] = useState<KhacCancelTarget | null>(null);
  const [cancelMode, setCancelMode] = useState<"cong_no" | "hoan_tien">("hoan_tien");

  const invalidate = () => qc.invalidateQueries({ queryKey: ["chi_phi_hdv_section", doanId] });

  // Default người trả: HDV (HDV ứng tiền trước, công ty hoàn lại sau)
  const resolveNguoiTt = (item: HDVHoTroItem): "cong_ty" | "hdv" =>
    item.tien_hdv > 0 ? "hdv" : (item.tien_cong_ty > 0 ? "cong_ty" : "hdv");

  // Save handler — row component pass full payload sync via ref → đảm bảo
  // value mới nhất, không bị stale closure khi user blur xong chuyển tab.
  const handleSaveRow = (
    id: number,
    payload: { mo_ta: string; so_luong: number; don_gia: number; nguoi_tt: "cong_ty" | "hdv" },
  ) => {
    const item = hoTroItems.find((r) => r.id === id);
    if (!item) return;
    const itemMoTa = item.mo_ta ?? "";
    const curNguoiTt = resolveNguoiTt(item);
    if (payload.so_luong === item.so_luong
        && payload.don_gia === item.don_gia
        && payload.mo_ta === itemMoTa
        && payload.nguoi_tt === curNguoiTt) {
      return; // no change
    }
    const tien = payload.so_luong * payload.don_gia;
    upsertMut.mutate({
      id, doan_id: doanId,
      so_luong: payload.so_luong, don_gia: payload.don_gia,
      mo_ta: payload.mo_ta || null,
      tien_cong_ty: payload.nguoi_tt === "cong_ty" ? tien : 0,
      tien_hdv: payload.nguoi_tt === "hdv" ? tien : 0,
    }, { onSuccess: () => invalidate() });
  };

  const handleDelete = (id: number) => {
    deleteMut.mutate({ id, doanId }, {
      onSuccess: () => { invalidate(); toast.success(t("Đã xóa")); },
      onError: (e: unknown) => toast.error(errMsg(e) || t("Lỗi xóa")),
    });
  };

  const handleAdd = async () => {
    setAddingRow(true);
    try {
      await upsertMut.mutateAsync({
        doan_id: doanId,
        danh_muc: "hdv_ho_tro",
        loai: "khac",
        mo_ta: "",
        so_luong: 1,
        don_gia: 0,
        tien_cong_ty: 0,
        tien_hdv: 0,
      });
      invalidate();
    } catch {
      toast.error(t("Lỗi khi thêm"));
    } finally {
      setAddingRow(false);
    }
  };

  // ── ĐNTT handlers ────────────────────────────────────────────────────────
  const resetPayeeFields = () => {
    setPayeeName("");
    setPayeeStk("");
    setPayeeBank("");
    setPayeeLyDo("");
  };

  const openModal = (item: HDVHoTroItem) => {
    if (item.tien_cong_ty <= 0) {
      toast.error(t("Chỉ tạo ĐNTT cho khoản công ty trả. Đổi Nguồn sang \"Công ty\" trước."));
      return;
    }
    setModal({
      type: "single",
      item: {
        chiPhiId: item.id,
        thanhTien: item.tien_cong_ty,
        moTa: item.mo_ta || t("Khác"),
        nccId: item.nha_cung_cap_id,
      },
    });
    setModalMode("full");
    setDepositAmount(0);
    setNgayCan("");
    resetPayeeFields();
  };

  const openBulkModal = () => {
    if (selectedItems.length === 0) return;
    const items: KhacModalItem[] = selectedItems.map((it) => ({
      chiPhiId: it.id,
      thanhTien: it.tien_cong_ty,
      moTa: it.mo_ta || t("Khác"),
      nccId: it.nha_cung_cap_id,
    }));
    setModal({
      type: "bulk",
      items,
      thanhTien: items.reduce((s, i) => s + i.thanhTien, 0),
      defaultNccId: null,
    });
    setModalMode("full");
    setDepositAmount(0);
    setNgayCan("");
    resetPayeeFields();
  };

  const handleModalSubmit = () => {
    if (!modal) return;
    const tenNguoiNhan = payeeName.trim();
    if (!tenNguoiNhan) {
      toast.error(t("Vui lòng nhập tên người nhận hoàn ứng"));
      return;
    }
    const stk = payeeStk.trim() || null;
    const bank = payeeBank.trim() || null;
    const lyDo = payeeLyDo.trim() || null;

    if (modal.type === "bulk") {
      // Bulk: 1 ĐNTT, allocations per row (full tien_cong_ty), không hỗ trợ cọc
      const items = modal.items;
      const soTien = items.reduce((s, i) => s + i.thanhTien, 0);
      if (soTien <= 0) { toast.error(t("Số tiền phải lớn hơn 0")); return; }
      const labelMoTa = items.length === 1
        ? `Hoàn ứng ${tenNguoiNhan}: ${items[0].moTa}`
        : `Hoàn ứng ${tenNguoiNhan} (${items.length} khoản)`;
      insertDNTT.mutate({
        doan_id: doanId,
        loai: "khac",
        mo_ta: labelMoTa.slice(0, 200),
        nha_cung_cap_id: null,
        ten_nha_cung_cap: tenNguoiNhan,
        so_tai_khoan: stk,
        ngan_hang: bank,
        so_tien: soTien,
        la_coc: false,
        trang_thai_duyet: "cho_duyet",
        ref_loai: "doan_chi_phi",
        // ref_id trỏ về row đầu để view back-compat hiển thị; nguồn truth thật
        // sự = allocations (hiển thị qua dnttsByChiPhi map).
        ref_id: items[0].chiPhiId,
        ngay_can_thanh_toan: ngayCan || null,
        ghi_chu: lyDo,
        allocations: items.map((i) => ({ chi_phi_id: i.chiPhiId, so_tien: i.thanhTien })),
      }, {
        onSuccess: () => {
          toast.success(t("Đã gửi ĐNTT gộp"));
          setModal(null);
          setSelectedIds([]);
          qc.invalidateQueries({ queryKey: ["dntt_allocations_for_khac", doanId] });
        },
      });
      return;
    }

    // Single
    const it = modal.item;
    const soTien = modalMode === "full" ? it.thanhTien : depositAmount;
    if (soTien <= 0) { toast.error(t("Số tiền phải lớn hơn 0")); return; }
    if (modalMode === "deposit" && soTien >= it.thanhTien) {
      toast.error(t("Số tiền cọc phải nhỏ hơn tổng tiền"));
      return;
    }
    insertDNTT.mutate({
      doan_id: doanId,
      loai: "khac",
      mo_ta: `Hoàn ứng ${tenNguoiNhan}: ${it.moTa}`.slice(0, 200),
      nha_cung_cap_id: null,
      ten_nha_cung_cap: tenNguoiNhan,
      so_tai_khoan: stk,
      ngan_hang: bank,
      so_tien: soTien,
      la_coc: modalMode === "deposit",
      trang_thai_duyet: "cho_duyet",
      ref_loai: "doan_chi_phi",
      ref_id: it.chiPhiId,
      ngay_can_thanh_toan: ngayCan || null,
      ghi_chu: lyDo,
      allocations: [{ chi_phi_id: it.chiPhiId, so_tien: soTien }],
    }, {
      onSuccess: () => {
        toast.success(t("Đã gửi ĐNTT"));
        setModal(null);
        qc.invalidateQueries({ queryKey: ["dntt_allocations_for_khac", doanId] });
      },
    });
  };

  // ── In Giấy đề nghị hoàn ứng (Excel) ────────────────────────────────────
  const handlePrintDntt = (dnttId: number) => {
    const dntt = dnttList.find((d) => d.id === dnttId);
    if (!dntt) { toast.error(t("Không tìm thấy ĐNTT")); return; }
    // Items = allocations của ĐNTT này, join với hoTroItems để lấy mô tả + SL + giá
    const dnttAllocs = allocsList.filter((a) => a.dntt_id === dnttId);
    const items = dnttAllocs.map((a) => {
      const cp = hoTroItems.find((i) => i.id === a.chi_phi_id);
      return {
        mo_ta: cp?.mo_ta || "—",
        so_luong: cp?.so_luong ?? 1,
        don_gia: cp?.don_gia ?? 0,
        thanh_tien: a.so_tien,
      };
    });
    if (items.length === 0) {
      toast.error(t("ĐNTT chưa có allocation — không in được"));
      return;
    }
    exportDnttKhacHoanUngWord({
      maDoan: doan?.ten_doan || `#${doanId}`,
      tenDoan: doan?.ten_doan || undefined,
      tenNguoiNhan: dntt.ten_nha_cung_cap || "—",
      soTaiKhoan: dntt.so_tai_khoan,
      nganHang: dntt.ngan_hang,
      lyDo: dntt.ghi_chu,
      items,
      ngayLap: dntt.created_at,
      ngayCanThanhToan: dntt.ngay_can_thanh_toan,
    }).then(
      () => toast.success(t("Đã xuất Giấy đề nghị hoàn ứng")),
      (e: unknown) => toast.error(t("Lỗi xuất Word: ") + (errMsg(e) || "")),
    );
  };

  const handleEditSave = (id: number) => {
    const v = parseInt(editAmount.replace(/\D/g, ""), 10);
    if (!v || v <= 0) { toast.error(t("Số tiền không hợp lệ")); return; }
    updateDNTT.mutate({ id, soTien: v }, {
      onSuccess: () => { toast.success(t("Đã cập nhật")); setEditingId(null); },
    });
  };

  const handleCancelSubmit = () => {
    if (!cancelTarget) return;
    cancelMut.mutate(
      { id: cancelTarget.dnttId, mode: cancelTarget.isPaid ? cancelMode : undefined },
      {
        onSuccess: () => { toast.success(t("Đã hủy")); setCancelTarget(null); },
        onError: (err: unknown) => toast.error(errMsg(err) || t("Lỗi khi hủy")),
      },
    );
  };

  const allSelected = selectableIds.length > 0 && selectedIds.length === selectableIds.length;
  const someSelected = selectedIds.length > 0 && !allSelected;

  return (
    <div className="rounded-lg border border-border overflow-hidden">
      <div className="px-4 py-2 bg-sky-50 border-b border-sky-100 flex items-center justify-between gap-2 flex-wrap">
        <p className="text-xs font-semibold text-sky-800 uppercase tracking-wide">
          {t("Khác")}
        </p>
        <div className="flex items-center gap-2">
          {selectedIds.length > 0 && (
            <Button
              size="sm"
              className="h-6 text-xs bg-sky-600 hover:bg-sky-700 text-white"
              onClick={openBulkModal}
              disabled={insertDNTT.isPending}
            >
              {t("ĐNTT gộp")} ({selectedIds.length} · {fmt(selectedTotal)} ₫)
            </Button>
          )}
          <Button size="sm" variant="outline" className="h-6 text-xs" onClick={handleAdd} disabled={addingRow}>
            <Plus className="h-3 w-3 mr-1" /> {t("Thêm")}
          </Button>
        </div>
      </div>
      {hoTroItems.length === 0 ? (
        <p className="px-4 py-3 text-sm text-muted-foreground">{t("Chưa có khoản hỗ trợ nào. Nhấn \"+ Thêm\" để thêm.")}</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/20">
              <th className="px-2 py-2 w-8 text-center">
                <Checkbox
                  checked={allSelected ? true : someSelected ? "indeterminate" : false}
                  disabled={selectableIds.length === 0}
                  onCheckedChange={(v) => {
                    if (v) setSelectedIds(selectableIds);
                    else setSelectedIds([]);
                  }}
                  className="h-3.5 w-3.5"
                />
              </th>
              <th className="text-left px-4 py-2 text-xs font-medium text-muted-foreground">{t("Loại")}</th>
              <th className="text-right px-4 py-2 text-xs font-medium text-muted-foreground w-24">{t("SL")}</th>
              <th className="text-right px-4 py-2 text-xs font-medium text-muted-foreground w-32">{t("Đơn giá")}</th>
              <th className="text-right px-4 py-2 text-xs font-medium text-muted-foreground w-32">{t("Thành tiền")}</th>
              <th className="text-center px-2 py-2 text-xs font-medium text-muted-foreground w-20">{t("Nguồn")}</th>
              <th className="text-center px-3 py-2 text-xs font-medium text-muted-foreground w-44">{t("TT ĐNTT")}</th>
              <th className="text-center px-3 py-2 text-xs font-medium text-muted-foreground w-32">{t("TT Thanh toán")}</th>
              <th className="px-2 py-2 w-32" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {hoTroItems.map((item) => (
              <HDVHoTroRow
                key={item.id}
                item={item}
                dnttList={dnttList}
                congNoList={congNoList}
                canTruByDnttId={canTruByDnttId}
                rowDnttIds={dnttsByChiPhi[item.id] || []}
                isSelectable={isSelectable(item)}
                isSelected={selectedIds.includes(item.id)}
                onToggleSelect={(checked) => {
                  setSelectedIds((prev) =>
                    checked ? [...prev, item.id] : prev.filter((id) => id !== item.id),
                  );
                }}
                editingId={editingId}
                editAmount={editAmount}
                pending={upsertMut.isPending || deleteMut.isPending}
                onSave={handleSaveRow}
                onDelete={handleDelete}
                onOpenModal={() => openModal(item)}
                onStartEdit={(id, soTien) => { setEditingId(id); setEditAmount(String(soTien)); }}
                onCancelEdit={() => setEditingId(null)}
                onEditAmountChange={setEditAmount}
                onSaveEdit={handleEditSave}
                onOpenCancel={(target) => { setCancelMode("hoan_tien"); setCancelTarget(target); }}
                onPrintDntt={handlePrintDntt}
                updatePending={updateDNTT.isPending}
              />
            ))}
          </tbody>
        </table>
      )}

      {/* ĐNTT Modal — single hoặc bulk */}
      <Dialog open={!!modal} onOpenChange={(v) => { if (!v) setModal(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-sm">
              {modal?.type === "bulk"
                ? `${t("Tạo đề nghị thanh toán gộp")} (${modal.items.length})`
                : `${t("Tạo đề nghị thanh toán")} — ${modal?.item.moTa || t("Khác")}`}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2 text-xs">
            {modal?.type === "bulk" && (
              <div className="rounded border border-border bg-muted/30 max-h-40 overflow-y-auto">
                <table className="w-full text-[11px]">
                  <tbody className="divide-y divide-border">
                    {modal.items.map((it) => (
                      <tr key={it.chiPhiId}>
                        <td className="px-2 py-1 truncate">{it.moTa}</td>
                        <td className="px-2 py-1 text-right whitespace-nowrap tabular-nums">{fmt(it.thanhTien)} ₫</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <p>
              {t("Tổng tiền:")}{" "}
              <span className="font-semibold">
                {fmt(modal?.type === "bulk" ? modal.thanhTien : (modal?.item.thanhTien ?? 0))} VND
              </span>
            </p>
            <div className="space-y-1">
              <Label className="text-xs">{t("Tên người nhận hoàn ứng")} <span className="text-destructive">*</span></Label>
              <Input
                className="h-8 text-xs"
                value={payeeName}
                onChange={(e) => setPayeeName(e.target.value)}
                placeholder={t("VD: Nguyễn Văn A")}
                autoFocus
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-xs">{t("Số tài khoản")}</Label>
                <Input
                  className="h-8 text-xs"
                  value={payeeStk}
                  onChange={(e) => setPayeeStk(e.target.value)}
                  placeholder={t("Để trống nếu trả tiền mặt")}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">{t("Ngân hàng")}</Label>
                <Input
                  className="h-8 text-xs"
                  value={payeeBank}
                  onChange={(e) => setPayeeBank(e.target.value)}
                  placeholder={t("VD: Vietcombank")}
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">{t("Lý do (tùy chọn)")}</Label>
              <Input
                className="h-8 text-xs"
                value={payeeLyDo}
                onChange={(e) => setPayeeLyDo(e.target.value)}
                placeholder={t("VD: Hoàn ứng chi phí phát sinh đoàn")}
              />
            </div>
            {modal?.type === "single" && (
              <>
                <RadioGroup
                  value={modalMode}
                  onValueChange={(v) => setModalMode(v as "full" | "deposit")}
                  className="space-y-2"
                >
                  <div className="flex items-center gap-2">
                    <RadioGroupItem value="full" id="khac-full" />
                    <Label htmlFor="khac-full" className="text-xs cursor-pointer">
                      {t("Toàn bộ")} — {fmt(modal.item.thanhTien)} VND
                    </Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <RadioGroupItem value="deposit" id="khac-dep" />
                    <Label htmlFor="khac-dep" className="text-xs cursor-pointer">{t("1 phần (cọc)")}</Label>
                  </div>
                </RadioGroup>
                {modalMode === "deposit" && (
                  <div className="space-y-1">
                    <Label className="text-xs">{t("Số tiền cọc")}</Label>
                    <Input
                      type="number" className="h-8 text-xs"
                      value={depositAmount || ""}
                      onChange={(e) => setDepositAmount(Number(e.target.value) || 0)}
                      max={modal.item.thanhTien}
                    />
                    {depositAmount > 0 && (
                      <p className="text-[11px] text-muted-foreground">
                        {t("Còn lại:")} {fmt(modal.item.thanhTien - depositAmount)} VND
                      </p>
                    )}
                  </div>
                )}
              </>
            )}
            <div className="space-y-1">
              <Label className="text-xs">{t("Ngày cần thanh toán")}</Label>
              <DatePicker className="h-8 text-xs w-full" value={ngayCan} onChange={setNgayCan} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" className="text-xs" onClick={() => setModal(null)}>{t("Hủy")}</Button>
            <Button size="sm" className="text-xs" onClick={handleModalSubmit} disabled={insertDNTT.isPending}>
              {t("Tạo đề nghị TT")}
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
                  <RadioGroupItem value="hoan_tien" id="khac-cancel-ht" />
                  <Label htmlFor="khac-cancel-ht" className="text-xs">{t("Hoàn tiền")}</Label>
                </div>
                <div className="flex items-center gap-1.5">
                  <RadioGroupItem value="cong_no" id="khac-cancel-cn" />
                  <Label htmlFor="khac-cancel-cn" className="text-xs">{t("Ghi công nợ")}</Label>
                </div>
              </RadioGroup>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setCancelTarget(null)}>{t("Đóng")}</Button>
            <Button variant="destructive" size="sm" onClick={handleCancelSubmit} disabled={cancelMut.isPending}>
              {t("Xác nhận hủy")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
