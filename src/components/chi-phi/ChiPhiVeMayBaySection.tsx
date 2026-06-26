import React, { useState, useMemo, useRef } from "react";
import { errMsg } from "@/lib/error";
import { Check, X, Ban, SlidersHorizontal, Trash2, CalendarClock, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DatePicker } from "@/components/ui/date-picker";
import { DecimalInput } from "@/components/ui/decimal-input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
// Vé máy bay nhập theo ngoại tệ giống visa → quy đổi VND bằng cùng công thức.
import { computeVisaVnd as computeVeVnd } from "@/lib/visa-calc";
import { toast } from "sonner";
import {
  useChiPhiList, useDNTTList, useInsertDNTT, useUpsertChiPhi, useDeleteChiPhi,
} from "@/hooks/use-chi-phi";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import type { DNTTRow as DNTTRowDntt } from "@/hooks/use-dntt";
import { useCancelDNTT, useUpdateDNTT, useCreateAdjustment } from "@/hooks/use-dntt";
import { usePaymentsByChiPhi } from "@/hooks/use-payments";
import { useCongNoList } from "@/hooks/use-cong-no";
import { useCurrentUserName } from "@/hooks/use-doan";
import { useNhaCungCapList } from "@/hooks/use-nha-cung-cap";
import { SearchableSelect } from "@/components/SearchableSelect";
import { externalSupabase } from "@/lib/supabase-external";
import DNTTNHPreviewModal from "./DNTTNHPreviewModal";
import type { NHDocData, NHDocEntry } from "@/lib/export-dntt-nh-word";
import { t, useTranslate } from "@/lib/i18n";

// Loại tiền cho vé máy bay (giống visa). VND → tỷ giá khóa = 1.
const CURRENCIES = ["VND", "USD", "RMB", "NT"] as const;
type Currency = (typeof CURRENCIES)[number];

const fmt = (n: number) => Math.round(n).toLocaleString("vi-VN");

const STATUS_LABEL: Record<string, { textKey: string; cls: string }> = {
  cho_duyet: { textKey: "Chờ duyệt ĐNTT", cls: "bg-yellow-100 text-yellow-700" },
  da_duyet:  { textKey: "Đã duyệt ĐNTT",  cls: "bg-teal-100 text-teal-700" },
  tu_choi:   { textKey: "Từ chối",         cls: "bg-red-100 text-red-700" },
};

interface CancelTarget { dnttId: number; isPaid: boolean }

interface Props {
  doanId: number;
  tenDoan?: string;
  /** Ngày bắt đầu đoàn (YYYY-MM-DD) — dùng làm ngày mặc định trên ĐNTT in. */
  ngayBatDau?: string;
  /** Đoàn đã quyết toán → khóa sửa con số chi phí (trừ admin). */
  locked?: boolean;
}

// ── Add row form ────────────────────────────────────────────────────────────
function AddVeRow({ doanId, onAdded, locked = false }: { doanId: number; onAdded: () => void; locked?: boolean }) {
  const upsertMut = useUpsertChiPhi();
  const [moTa, setMoTa] = useState("");
  const [currency, setCurrency] = useState<Currency>("VND");
  const [soLuong, setSoLuong] = useState(1);
  const [donGiaRaw, setDonGiaRaw] = useState(0);
  const [tyGia, setTyGia] = useState(1);
  const [ckVnd, setCkVnd] = useState(0);

  const previewVnd = computeVeVnd(soLuong, donGiaRaw, tyGia, ckVnd);

  const handleAdd = async () => {
    if (!moTa.trim()) { toast.warning(t("Nhập chặng / mô tả vé")); return; }
    if (previewVnd <= 0) { toast.warning(t("Đơn giá phải lớn hơn 0")); return; }
    await upsertMut.mutateAsync({
      doan_id: doanId,
      danh_muc: "ve_may_bay",
      loai: "ve_may_bay",
      mo_ta: moTa.trim(),
      don_gia: computeVeVnd(1, donGiaRaw, tyGia, ckVnd), // VND/đơn vị (net)
      don_gia_raw: donGiaRaw || null,
      so_luong: soLuong,
      tien_cong_ty: previewVnd,
      tien_hdv: 0,
      tien_te_loai: currency,
      ty_gia: tyGia || null,
      chiet_khau_pct: ckVnd || null, // cột giữ tên cũ; với vé/visa giá trị là VND/đơn vị
      thanh_toan_dinh_ky: true,      // vé máy bay mặc định thanh toán định kỳ (theo NCC)
    }, {
      onSuccess: () => { toast.success(t("Đã thêm vé máy bay")); onAdded(); },
    });
  };

  return (
    <div className="rounded-lg border border-border bg-card p-4 space-y-2">
      <div>
        <Label className="text-xs">{t("Chặng / Mô tả *")}</Label>
        <Input
          value={moTa}
          onChange={(e) => setMoTa(e.target.value)}
          placeholder={t("VD: HAN-NRT khứ hồi, vé đoàn 20 khách")}
          className="h-7 text-xs"
          disabled={locked}
        />
      </div>
      <div className="grid grid-cols-5 gap-2">
        <div>
          <Label className="text-xs">{t("SL")}</Label>
          <Input
            type="number" min={0} disabled={locked}
            value={soLuong || ""}
            onChange={(e) => setSoLuong(e.target.value === "" ? 0 : Number(e.target.value))}
            className="h-7 text-xs text-center [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
          />
        </div>
        <div>
          <Label className="text-xs">{t("Đơn giá")} ({currency})</Label>
          <div className="flex gap-1">
            <Select
              value={currency}
              onValueChange={(v) => { setCurrency(v as Currency); if (v === "VND") setTyGia(1); }}
              disabled={locked}
            >
              <SelectTrigger className="h-7 text-xs w-[64px]"><SelectValue /></SelectTrigger>
              <SelectContent>{CURRENCIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
            </Select>
            <DecimalInput value={donGiaRaw} onChange={setDonGiaRaw} disabled={locked} className="h-7 text-xs flex-1 text-right" />
          </div>
        </div>
        <div>
          <Label className="text-xs">{t("Tỷ giá")}</Label>
          <DecimalInput value={tyGia} onChange={setTyGia} disabled={locked || currency === "VND"} className="h-7 text-xs text-right" />
        </div>
        <div>
          <Label className="text-xs">{t("Chiết khấu (VND)")}</Label>
          <DecimalInput value={ckVnd} onChange={setCkVnd} disabled={locked} className="h-7 text-xs text-right" />
        </div>
        <div>
          <Label className="text-xs">{t("Thành tiền (VND)")}</Label>
          <div className="h-7 text-xs flex items-center justify-end font-semibold text-primary">{fmt(previewVnd)} ₫</div>
        </div>
      </div>
      <div className="flex justify-end">
        <Button size="sm" className="h-7 text-xs" onClick={handleAdd} disabled={upsertMut.isPending || locked}>{t("Thêm")}</Button>
      </div>
    </div>
  );
}

// ── Main section ─────────────────────────────────────────────────────────────
export default function ChiPhiVeMayBaySection({ doanId, tenDoan, ngayBatDau, locked = false }: Props) {
  useTranslate();
  const { data: chiPhiRows = [] } = useChiPhiList(doanId);
  const { data: dnttList = [] } = useDNTTList(doanId);
  const { data: paymentsList = [] } = usePaymentsByChiPhi(doanId);
  const { data: congNoList = [] } = useCongNoList({ doanId });
  const { data: nccList = [] } = useNhaCungCapList();
  const { data: currentUserName = "" } = useCurrentUserName();
  const nccOptions = useMemo(
    () => nccList.map((n) => ({ value: String(n.id), label: n.ten })),
    [nccList],
  );

  const canTruByDnttId = useMemo(() => {
    const m: Record<number, number> = {};
    paymentsList.forEach((p) => {
      if (p.method !== "can_tru") return;
      m[p.dntt_id] = (m[p.dntt_id] || 0) + p.payment_so_tien;
    });
    return m;
  }, [paymentsList]);

  const insertDNTT = useInsertDNTT();
  const updateDNTT = useUpdateDNTT();
  const upsertMut = useUpsertChiPhi();
  const deleteMut = useDeleteChiPhi();
  const cancelMut = useCancelDNTT();
  const adjustMut = useCreateAdjustment();

  const [showAdd, setShowAdd] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editAmount, setEditAmount] = useState("");

  interface ModalTarget { chiPhiId: number; thanhTien: number; moTa: string; nccId: number | null }
  const [modal, setModal] = useState<ModalTarget | null>(null);
  const [modalMode, setModalMode] = useState<"full" | "deposit">("full");
  const [modalNccId, setModalNccId] = useState<number | null>(null);
  const [depositAmount, setDepositAmount] = useState(0);
  const [ngayCan, setNgayCan] = useState("");

  const [adjustTarget, setAdjustTarget] = useState<DNTTRowDntt | null>(null);
  const [adjustAmount, setAdjustAmount] = useState("");
  const [adjustReason, setAdjustReason] = useState("");

  const [cancelTarget, setCancelTarget] = useState<CancelTarget | null>(null);
  const [cancelMode, setCancelMode] = useState<"cong_no" | "hoan_tien">("hoan_tien");

  // In ĐNTT (Word) — preview modal dùng chung mẫu với Dịch vụ/Xe.
  const [previewData, setPreviewData] = useState<NHDocData | null>(null);

  const veRows = chiPhiRows.filter((r) => r.danh_muc === "ve_may_bay");
  const total = veRows.reduce((s, r) => s + r.tien_cong_ty + r.tien_hdv, 0);
  // Dòng vé công ty trả → mới in được ĐNTT (HDV trả thì không qua flow này).
  const companyVeRows = veRows.filter((r) => r.tien_cong_ty > 0);

  // ── In ĐNTT (Word) ────────────────────────────────────────────────────────
  // Bê mẫu của Dịch vụ/Xe: build entries từ dòng vé công ty trả (gộp theo NCC),
  // mở DNTTNHPreviewModal để xem/sửa rồi xuất Word. STK/ngân hàng lấy live từ
  // nha_cung_cap (vé máy bay không có TK riêng kiểu nhà xe).
  const handlePrintDNTT = async () => {
    if (companyVeRows.length === 0) {
      toast.warning(t("Không có dòng vé công ty trả để in ĐNTT"));
      return;
    }
    try {
      const nccIds = Array.from(
        new Set(companyVeRows.map((r) => r.nha_cung_cap_id).filter((x): x is number => x != null)),
      );
      const nccMap: Record<number, { ten: string; so_tai_khoan?: string; ngan_hang?: string }> = {};
      if (nccIds.length > 0) {
        const { data: nccs } = await externalSupabase
          .from("nha_cung_cap")
          .select("id, ten, so_tai_khoan, ngan_hang")
          .in("id", nccIds);
        for (const ncc of nccs ?? []) {
          nccMap[ncc.id] = {
            ten: ncc.ten,
            so_tai_khoan: ncc.so_tai_khoan ?? undefined,
            ngan_hang: ncc.ngan_hang ?? undefined,
          };
        }
      }
      const ngayLabel = ngayBatDau && /^\d{4}-\d{2}-\d{2}/.test(ngayBatDau)
        ? ngayBatDau.slice(0, 10).split("-").reverse().join("/")
        : "";

      // Gộp các dòng vé theo NCC (null → key 0) → 1 entry/NCC.
      const groups = new Map<number, typeof companyVeRows>();
      for (const r of companyVeRows) {
        const key = r.nha_cung_cap_id ?? 0;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key)!.push(r);
      }

      const entries: NHDocEntry[] = [];
      for (const [key, grows] of groups) {
        const isGop = grows.length > 1;
        const ncc = key !== 0 ? (nccMap[key] ?? null) : null;
        // don_gia đã là VND net (computeVeVnd, đã trừ CK) → so_luong*don_gia = tiền vé.
        const items = grows.map((r) => ({
          so_luong: r.so_luong,
          don_gia: r.don_gia,
          ghi_chu: isGop ? (r.mo_ta || t("Vé máy bay")) : "",
        }));
        const totalCty = grows.reduce((s, r) => s + r.tien_cong_ty, 0);
        entries.push({
          ngay_date: ngayLabel,
          ten_nh: ncc?.ten ?? grows[0].mo_ta ?? t("Vé máy bay"),
          so_khach: grows.reduce((s, r) => s + r.so_luong, 0),
          foc_khach: null,
          foc: null,
          items,
          ncc,
          tai_khoan_thanh_toan: null,
          so_tien_coc: 0,
          can_tru: 0,
          so_tien_con_tt: totalCty,
          la_coc: false,
          multi_service: isGop,
        });
      }

      setPreviewData({
        doan: { ten_doan: tenDoan || String(doanId) },
        entries,
        nguoiDeNghi: currentUserName,
      });
    } catch (err: unknown) {
      toast.error(t("Lỗi") + ": " + (errMsg(err) || ""));
    }
  };

  // ── Inline row edit (mô tả + currency-aware số liệu) ───────────────────────
  type RowEdit = { mo_ta: string; so_luong: number; don_gia_raw: number; tien_te_loai: Currency; ty_gia: number; chiet_khau_pct: number };
  const editRowRef = useRef<Record<number, RowEdit>>({});
  const [editRow, setEditRow] = useState<Record<number, RowEdit>>({});
  const commitEditRow = (next: Record<number, RowEdit>) => { editRowRef.current = next; setEditRow(next); };

  const initialEdit = (row: typeof veRows[0]): RowEdit => ({
    mo_ta: row.mo_ta ?? "",
    so_luong: row.so_luong,
    don_gia_raw: row.don_gia_raw ?? row.don_gia ?? 0,
    tien_te_loai: (row.tien_te_loai as Currency) || "VND",
    ty_gia: row.ty_gia ?? (row.tien_te_loai && row.tien_te_loai !== "VND" ? 0 : 1),
    chiet_khau_pct: row.chiet_khau_pct ?? 0,
  });
  const getRowEdit = (row: typeof veRows[0]): RowEdit => editRow[row.id] ?? initialEdit(row);
  const handleRowChange = (id: number, patch: Partial<RowEdit>) => {
    const base = veRows.find((r) => r.id === id);
    const existing = editRowRef.current[id] ?? (base ? initialEdit(base) : { mo_ta: "", so_luong: 0, don_gia_raw: 0, tien_te_loai: "VND" as Currency, ty_gia: 1, chiet_khau_pct: 0 });
    commitEditRow({ ...editRowRef.current, [id]: { ...existing, ...patch } });
  };
  const handleRowSave = (row: typeof veRows[0]) => {
    const local = editRowRef.current[row.id];
    if (!local) return;
    const initial = initialEdit(row);
    const unchanged =
      local.mo_ta === initial.mo_ta &&
      local.so_luong === initial.so_luong &&
      local.don_gia_raw === initial.don_gia_raw &&
      local.tien_te_loai === initial.tien_te_loai &&
      local.ty_gia === initial.ty_gia &&
      local.chiet_khau_pct === initial.chiet_khau_pct;
    if (unchanged) return;
    const donGiaVnd = computeVeVnd(1, local.don_gia_raw, local.ty_gia, local.chiet_khau_pct);
    const totalRow = local.so_luong * donGiaVnd;
    const isHDV = row.tien_hdv > 0;
    upsertMut.mutate({
      id: row.id,
      doan_id: doanId,
      mo_ta: local.mo_ta.trim(),
      so_luong: local.so_luong,
      don_gia: donGiaVnd,
      don_gia_raw: local.don_gia_raw || null,
      tien_cong_ty: isHDV ? 0 : totalRow,
      tien_hdv: isHDV ? totalRow : 0,
      tien_te_loai: local.tien_te_loai,
      ty_gia: local.ty_gia || null,
      chiet_khau_pct: local.chiet_khau_pct || null,
    }, {
      onSuccess: () => { const next = { ...editRowRef.current }; delete next[row.id]; commitEditRow(next); },
    });
  };

  const handleToggleNguoiTt = (row: typeof veRows[0]) => {
    const totalRow = row.so_luong * row.don_gia;
    const next = row.tien_hdv > 0 ? "cong_ty" : "hdv";
    upsertMut.mutate({
      id: row.id, doan_id: doanId,
      tien_cong_ty: next === "cong_ty" ? totalRow : 0,
      tien_hdv: next === "hdv" ? totalRow : 0,
    });
  };

  const handleToggleDinhKy = (row: typeof veRows[0]) => {
    const newVal = !row.thanh_toan_dinh_ky;
    upsertMut.mutate({ id: row.id, doan_id: doanId, thanh_toan_dinh_ky: newVal }, {
      onSuccess: () => toast.success(newVal ? t("Đã bật thanh toán định kỳ") : t("Đã tắt thanh toán định kỳ")),
    });
  };

  // ── ĐNTT handlers ─────────────────────────────────────────────────────────
  const openModal = (chiPhiId: number, thanhTien: number, moTa: string, nccId: number | null) => {
    setModal({ chiPhiId, thanhTien, moTa, nccId });
    setModalMode("full");
    setModalNccId(nccId);
    setDepositAmount(0);
    setNgayCan("");
  };
  const handleModalSubmit = () => {
    if (!modal) return;
    const { chiPhiId, thanhTien, moTa, nccId } = modal;
    const soTien = modalMode === "full" ? thanhTien : depositAmount;
    if (soTien <= 0) { toast.error(t("Số tiền phải lớn hơn 0")); return; }
    if (modalMode === "deposit" && soTien >= thanhTien) { toast.error(t("Số tiền cọc phải nhỏ hơn tổng tiền")); return; }
    // Lưu NCC chọn trong modal ngược lại vào dòng vé (vé máy bay không có master
    // mang sẵn NCC) → in ĐNTT + định kỳ + ĐNTT lần sau dùng lại.
    if (modalNccId !== nccId) {
      upsertMut.mutate({ id: chiPhiId, doan_id: doanId, nha_cung_cap_id: modalNccId });
    }
    insertDNTT.mutate({
      doan_id: doanId,
      loai: "ve_may_bay",
      mo_ta: moTa || "Vé máy bay",
      nha_cung_cap_id: modalNccId,
      so_tien: soTien,
      la_coc: modalMode === "deposit",
      trang_thai_duyet: "cho_duyet",
      ref_loai: "doan_chi_phi",
      ref_id: chiPhiId,
      ngay_can_thanh_toan: ngayCan || null,
      allocations: [{ chi_phi_id: chiPhiId, so_tien: soTien }],
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

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-sky-100 bg-sky-50">
        <span className="text-sm font-semibold text-sky-900">✈️ {t("Vé máy bay")}</span>
        <div className="flex items-center gap-3">
          {total > 0 && <span className="text-xs text-muted-foreground">{t("Tổng:")} {fmt(total)} ₫</span>}
          {companyVeRows.length > 0 && (
            <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={handlePrintDNTT}>
              <Printer className="h-3.5 w-3.5" />
              {t("In ĐNTT")}
            </Button>
          )}
          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setShowAdd(!showAdd)} disabled={locked}>
            + {t("Thêm")}
          </Button>
        </div>
      </div>

      {veRows.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse">
            <colgroup>
              <col />
              <col style={{ width: "60px" }} />
              <col style={{ width: "180px" }} />
              <col style={{ width: "100px" }} />
              <col style={{ width: "90px" }} />
              <col style={{ width: "120px" }} />
              <col style={{ width: "76px" }} />
              <col style={{ width: "180px" }} />
              <col style={{ width: "140px" }} />
              <col style={{ width: "100px" }} />
            </colgroup>
            <thead>
              <tr className="border-b border-border bg-muted/20 text-[11px] font-medium text-muted-foreground">
                <th className="text-left px-4 py-2.5">{t("Chặng / Mô tả")}</th>
                <th className="text-center px-2 py-2.5">{t("SL")}</th>
                <th className="text-center px-3 py-2.5">{t("Đơn giá")}</th>
                <th className="text-center px-2 py-2.5">{t("Tỷ giá")}</th>
                <th className="text-center px-2 py-2.5">{t("CK (VND)")}</th>
                <th className="text-right px-3 py-2.5">{t("Thành tiền")}</th>
                <th className="text-center px-2 py-2.5">{t("Nguồn")}</th>
                <th className="text-center px-3 py-2.5">{t("TT ĐNTT")}</th>
                <th className="text-center px-3 py-2.5">{t("TT Thanh toán")}</th>
                <th className="px-2 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {veRows.map((row) => {
                const local = getRowEdit(row);
                const thanhTienLocal = computeVeVnd(local.so_luong, local.don_gia_raw, local.ty_gia, local.chiet_khau_pct);

                const allDntts = dnttList.filter((d) => d.ref_loai === "doan_chi_phi" && d.ref_id === row.id);
                const activeDntts = allDntts.filter((d) => d.trang_thai_duyet !== "da_huy" && d.trang_thai_duyet !== "tu_choi");
                const rejectedDntts = allDntts.filter((d) => d.trang_thai_duyet === "tu_choi");
                const paidDntts = activeDntts.filter((d) => d.payment_status === "paid");
                const pendingDntts = activeDntts.filter((d) => d.payment_status !== "paid");
                const daTT = activeDntts.reduce((s, d) => s + (d.paid_amount || 0), 0);
                const daDeNghi = pendingDntts.reduce((s, d) => s + (d.so_tien - (d.paid_amount || 0)), 0);
                const thanhTien = row.tien_cong_ty;
                const isDaTT = thanhTien > 0 && daTT >= thanhTien;
                const conLai = Math.max(0, thanhTien - daTT);
                const dnttIds = allDntts.map((d) => d.id);
                const congNoAmount = congNoList
                  .filter((c) => c.dntt_goc_id != null && dnttIds.includes(c.dntt_goc_id) && c.trang_thai === "con_du")
                  .reduce((s, c) => s + c.so_tien_con_lai, 0);
                const hoanTienAmount = congNoList
                  .filter((c) => c.dntt_goc_id != null && dnttIds.includes(c.dntt_goc_id) && c.trang_thai === "da_hoan_tien")
                  .reduce((s, c) => s + c.so_tien_goc, 0);
                if (hoanTienAmount > 0) return null;
                const activeDntt = pendingDntts[0] ?? paidDntts[0] ?? null;
                const canCancel = activeDntt && (
                  activeDntt.trang_thai_duyet === "cho_duyet" ||
                  activeDntt.trang_thai_duyet === "da_duyet" ||
                  activeDntt.payment_status === "paid"
                );
                const shownDntts = [...activeDntts, ...rejectedDntts];
                const nguoiTt = row.tien_hdv > 0 ? "hdv" : "cong_ty";

                return (
                  <React.Fragment key={row.id}>
                  <tr className="hover:bg-muted/20">
                    {/* Chặng / Mô tả (editable) */}
                    <td className="px-4 py-2.5">
                      <Input
                        value={local.mo_ta}
                        disabled={locked}
                        onChange={(e) => handleRowChange(row.id, { mo_ta: e.target.value })}
                        onBlur={() => handleRowSave(row)}
                        onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLElement).blur(); }}
                        className="h-6 text-xs px-1.5 py-0"
                        placeholder={t("Chặng / Mô tả")}
                      />
                    </td>

                    {/* SL */}
                    <td className="px-2 py-2.5">
                      <div className="flex justify-center">
                        <Input
                          type="number" min={0} disabled={locked}
                          value={local.so_luong ?? ""}
                          onChange={(e) => handleRowChange(row.id, { so_luong: e.target.value === "" ? 0 : Number(e.target.value) })}
                          onBlur={() => handleRowSave(row)}
                          onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLElement).blur(); }}
                          className="h-6 text-xs px-1.5 py-0 text-center w-[44px] [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                        />
                      </div>
                    </td>

                    {/* Đơn giá + dropdown loại tiền */}
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-1 justify-center">
                        <Select
                          value={local.tien_te_loai}
                          disabled={locked}
                          onValueChange={(v) => {
                            handleRowChange(row.id, v === "VND" ? { tien_te_loai: v as Currency, ty_gia: 1 } : { tien_te_loai: v as Currency });
                            handleRowSave({ ...row, tien_te_loai: v });
                          }}
                        >
                          <SelectTrigger className="h-6 text-[10px] px-1.5 py-0 w-[58px]"><SelectValue /></SelectTrigger>
                          <SelectContent>{CURRENCIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                        </Select>
                        <DecimalInput
                          value={local.don_gia_raw}
                          disabled={locked}
                          onChange={(v) => handleRowChange(row.id, { don_gia_raw: v })}
                          onBlur={() => handleRowSave(row)}
                          className="h-6 text-xs px-1.5 py-0 text-right w-[100px]"
                        />
                      </div>
                    </td>

                    {/* Tỷ giá */}
                    <td className="px-2 py-2.5">
                      <div className="flex justify-center">
                        <DecimalInput
                          value={local.ty_gia}
                          disabled={locked || local.tien_te_loai === "VND"}
                          onChange={(v) => handleRowChange(row.id, { ty_gia: v })}
                          onBlur={() => handleRowSave(row)}
                          className="h-6 text-xs px-1.5 py-0 text-right w-[88px]"
                        />
                      </div>
                    </td>

                    {/* Chiết khấu (VND) */}
                    <td className="px-2 py-2.5">
                      <div className="flex justify-center">
                        <Input
                          type="number" min={0} step="any" disabled={locked}
                          value={local.chiet_khau_pct || ""}
                          onChange={(e) => handleRowChange(row.id, { chiet_khau_pct: Number(e.target.value) || 0 })}
                          onBlur={() => handleRowSave(row)}
                          onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLElement).blur(); }}
                          className="h-6 text-xs px-1.5 py-0 text-center w-[72px] [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                        />
                      </div>
                    </td>

                    {/* Thành tiền (VND) */}
                    <td className="px-3 py-2.5 text-right font-semibold text-primary whitespace-nowrap">{fmt(thanhTienLocal)} ₫</td>

                    {/* Ai trả — badge */}
                    <td className="px-2 py-2.5 text-center">
                      <button
                        onClick={() => handleToggleNguoiTt(row)}
                        disabled={upsertMut.isPending || locked}
                        className={cn(
                          "px-1.5 py-0.5 rounded text-[10px] font-medium cursor-pointer transition-colors border",
                          nguoiTt === "cong_ty"
                            ? "bg-blue-50 text-blue-600 hover:bg-blue-100 border-blue-200"
                            : "bg-amber-50 text-amber-600 hover:bg-amber-100 border-amber-200",
                        )}
                      >
                        {nguoiTt === "cong_ty" ? t("Công ty") : "HDV"}
                      </button>
                    </td>

                    {/* TT ĐNTT */}
                    <td className="px-3 py-2.5 align-top">
                      {nguoiTt === "hdv" ? (
                        <span className="text-[10px] text-muted-foreground flex justify-center">—</span>
                      ) : shownDntts.length === 0 ? (
                        <span className="text-[10px] text-muted-foreground flex justify-center">—</span>
                      ) : (
                        <div className="space-y-1.5 flex flex-col items-center">
                          {shownDntts.map((d) => {
                            const isRejected = d.trang_thai_duyet === "tu_choi";
                            const statusInfo = STATUS_LABEL[d.trang_thai_duyet] ?? STATUS_LABEL.cho_duyet;
                            return (
                              <div key={d.id} className="flex items-center gap-1.5 flex-wrap justify-center">
                                {isRejected ? (
                                  <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium whitespace-nowrap ${statusInfo.cls}`}>
                                    {t(statusInfo.textKey)} · {fmt(d.so_tien)}
                                  </span>
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
                                      disabled={updateDNTT.isPending} onClick={() => handleEditSave(d.id)}>
                                      <Check className="h-3 w-3" />
                                    </Button>
                                    <Button variant="ghost" size="sm" className="h-5 w-5 p-0 text-muted-foreground" onClick={() => setEditingId(null)}>
                                      <X className="h-3 w-3" />
                                    </Button>
                                  </>
                                ) : (
                                  (() => {
                                    const ct = canTruByDnttId[d.id] || 0;
                                    const thucTT = Math.max(0, d.so_tien - ct);
                                    return (
                                      <div className="inline-flex flex-col items-start gap-0.5">
                                        <span className={`px-1 py-px rounded text-[10px] leading-tight font-medium whitespace-nowrap ${statusInfo.cls}`}>
                                          {t(statusInfo.textKey)} · {fmt(d.so_tien)}
                                          {d.la_coc && <span className="ml-1 opacity-70">·{t("Cọc")}</span>}
                                        </span>
                                        {ct > 0 && (
                                          <span className="text-[9px] text-amber-700 leading-tight whitespace-nowrap">CT {fmt(ct)} → TT {fmt(thucTT)}</span>
                                        )}
                                      </div>
                                    );
                                  })()
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </td>

                    {/* TT Thanh toán */}
                    <td className="px-3 py-2.5 align-top">
                      {nguoiTt === "hdv" ? (
                        <span className="text-[10px] text-muted-foreground flex justify-center">—</span>
                      ) : (
                      <div className="space-y-1.5 flex flex-col items-center">
                        {activeDntts.map((d) => (
                          <div key={d.id}>
                            {d.payment_status === "paid" ? (
                              <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-emerald-100 text-emerald-700 whitespace-nowrap">
                                {t("Đã TT")}{d.thanh_toan_luc ? ` ${new Date(d.thanh_toan_luc).toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit" })}` : ""}
                              </span>
                            ) : (
                              <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-yellow-100 text-yellow-800 whitespace-nowrap">
                                {t("Chờ UNC")} · {fmt(d.so_tien - (d.paid_amount || 0))}
                              </span>
                            )}
                          </div>
                        ))}
                        {congNoAmount > 0 && (
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-purple-100 text-purple-700 whitespace-nowrap">CN: {fmt(congNoAmount)}</span>
                        )}
                        {activeDntts.length === 0 && congNoAmount === 0 && (
                          <span className="text-[10px] text-muted-foreground">—</span>
                        )}
                      </div>
                      )}
                    </td>

                    {/* Actions */}
                    <td className="px-2 py-2.5">
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
                          className={cn("h-7 text-xs px-2 gap-1", row.thanh_toan_dinh_ky ? "text-indigo-700 hover:text-indigo-800" : "text-muted-foreground hover:text-foreground")}
                          title={row.thanh_toan_dinh_ky ? t("Đang định kỳ — bấm để tắt") : t("Đặt thanh toán định kỳ")}
                          disabled={upsertMut.isPending}
                          onClick={() => handleToggleDinhKy(row)}>
                          <CalendarClock className="h-3.5 w-3.5" />
                          {row.thanh_toan_dinh_ky && t("Định kỳ")}
                        </Button>
                        {nguoiTt === "cong_ty" && !row.thanh_toan_dinh_ky && activeDntts.length === 0 && thanhTien > 0 && (
                          <Button variant="outline" size="sm" className="h-6 text-[10px] px-2"
                            onClick={() => openModal(row.id, thanhTien, row.mo_ta || "", row.nha_cung_cap_id)}>
                            {t("ĐNTT")}
                          </Button>
                        )}
                        {nguoiTt === "cong_ty" && activeDntts.length > 0 && daDeNghi === 0 && conLai > 0 && (
                          <Button variant="outline" size="sm" className="h-6 text-[10px] px-2 border-amber-400 text-amber-700 hover:bg-amber-50"
                            onClick={() => openModal(row.id, conLai, row.mo_ta || "", row.nha_cung_cap_id)}>
                            {t("ĐNTT còn lại")}
                          </Button>
                        )}
                        <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
                          onClick={() => deleteMut.mutate({ id: row.id, doanId }, { onSuccess: () => toast.success(t("Đã xóa")) })}
                          disabled={deleteMut.isPending || locked}>
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {veRows.length === 0 && !showAdd && (
        <p className="px-4 py-3 text-sm text-muted-foreground">{t("Bấm \"+ Thêm\" để thêm chi phí vé máy bay.")}</p>
      )}

      {showAdd && <AddVeRow doanId={doanId} onAdded={() => setShowAdd(false)} locked={locked} />}

      {/* In ĐNTT (Word) — preview + xuất, dùng chung modal với Dịch vụ/Xe */}
      <DNTTNHPreviewModal
        open={!!previewData}
        data={previewData}
        onClose={() => setPreviewData(null)}
      />

      {/* ĐNTT Modal */}
      <Dialog open={!!modal} onOpenChange={(v) => { if (!v) setModal(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-sm">{t("Tạo đề nghị thanh toán")} — {modal?.moTa || t("Vé máy bay")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2 text-xs">
            <p>{t("Tổng tiền:")} <span className="font-semibold">{fmt(modal?.thanhTien ?? 0)} VND</span></p>
            <div className="space-y-1">
              <Label className="text-xs">{t("Nhà cung cấp")}</Label>
              <SearchableSelect
                options={nccOptions}
                value={modalNccId != null ? String(modalNccId) : ""}
                onChange={(v) => setModalNccId(v ? Number(v) : null)}
                placeholder={t("Chọn nhà cung cấp")}
                searchPlaceholder={t("Tìm nhà cung cấp...")}
                emptyText={t("Không tìm thấy")}
                className="h-8 text-xs w-full"
              />
            </div>
            <RadioGroup value={modalMode} onValueChange={(v) => setModalMode(v as "full" | "deposit")} className="space-y-2">
              <div className="flex items-center gap-2">
                <RadioGroupItem value="full" id="ve-full" />
                <Label htmlFor="ve-full" className="text-xs cursor-pointer">{t("Toàn bộ")} — {fmt(modal?.thanhTien ?? 0)} VND</Label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem value="deposit" id="ve-dep" />
                <Label htmlFor="ve-dep" className="text-xs cursor-pointer">{t("1 phần (cọc)")}</Label>
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
                  <div className={cn("rounded px-3 py-2 text-xs font-medium", delta > 0 ? "bg-yellow-50 text-yellow-700" : "bg-purple-50 text-purple-700")}>
                    {delta > 0
                      ? `${t("Thiếu")} ${fmt(delta)} ₫ → ${t("tạo ĐNTT bổ sung (chờ duyệt)")}`
                      : `${t("Thừa")} ${fmt(Math.abs(delta))} ₫ → ${t("ghi công nợ NCC")}`}
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
                adjustMut.mutate(
                  { dnttGoc: adjustTarget, soTienThucTe, lyDo: adjustReason || "Điều chỉnh" },
                  {
                    onSuccess: (result) => {
                      if (!result) return;
                      if (result.delta > 0) toast.success(`${t("Đã tạo ĐNTT bổ sung")} ${fmt(result.delta)} ₫`);
                      else toast.success(`${t("Đã ghi công nợ")} ${fmt(Math.abs(result.delta))} ₫`);
                      setAdjustTarget(null);
                    },
                    onError: (err: unknown) => toast.error(errMsg(err) || t("Lỗi điều chỉnh")),
                  },
                );
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
                  <RadioGroupItem value="hoan_tien" id="ve-cancel-ht" />
                  <Label htmlFor="ve-cancel-ht" className="text-xs">{t("Hoàn tiền")}</Label>
                </div>
                <div className="flex items-center gap-1.5">
                  <RadioGroupItem value="cong_no" id="ve-cancel-cn" />
                  <Label htmlFor="ve-cancel-cn" className="text-xs">{t("Ghi công nợ")}</Label>
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
