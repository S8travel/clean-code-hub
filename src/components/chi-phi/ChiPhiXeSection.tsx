import React, { useState, useMemo, useRef } from "react";
import { Check, X, Ban, SlidersHorizontal, Trash2, CalendarClock, Plus, Printer } from "lucide-react";
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
import { toast } from "sonner";
import { errMsg } from "@/lib/error";
import {
  useChiPhiList, useDNTTList, useInsertDNTT, useUpsertChiPhi, useDeleteChiPhi,
} from "@/hooks/use-chi-phi";
import type { DNTTRow } from "@/hooks/use-chi-phi";
import { useCancelDNTT, useUpdateDNTT, useCreateAdjustment } from "@/hooks/use-dntt";
import { usePaymentsByChiPhi } from "@/hooks/use-payments";
import { useCongNoList } from "@/hooks/use-cong-no";
import { useCurrentUserName } from "@/hooks/use-doan";
import type { DNTTRow as DNTTRowDntt } from "@/hooks/use-dntt";
import { applyVat, calcXeThanhTien, XE_VAT_DEFAULT } from "@/lib/xe-calc";
import { externalSupabase } from "@/lib/supabase-external";
import DNTTNHPreviewModal from "./DNTTNHPreviewModal";
import type { NHDocData, NHDocEntry } from "@/lib/export-dntt-nh-word";
import { t, useTranslate } from "@/lib/i18n";

const fmt = (n: number) => Math.round(n).toLocaleString("vi-VN");

const STATUS_LABEL: Record<string, { textKey: string; cls: string }> = {
  cho_duyet: { textKey: "Chờ duyệt ĐNTT", cls: "bg-yellow-100 text-yellow-700" },
  da_duyet:  { textKey: "Đã duyệt ĐNTT",  cls: "bg-teal-100 text-teal-700" },
  tu_choi:   { textKey: "Từ chối",         cls: "bg-red-100 text-red-700" },
};

interface CancelTarget { dnttId: number; isPaid: boolean }

/** Loại xe (joined) — chỉ các field section đọc. */
interface XeInfo {
  /** id của nha_xe_loai_xe (= doan.xe_id / xe_id_2) → tag doan_chi_phi.xe_id. */
  id?: number | null;
  ten_xe?: string | null;
  so_cho?: number | null;
  nha_xe?: {
    ten?: string | null;
    nha_cung_cap_id?: number | null;
    /** Thông tin TK ngân hàng nhà xe (multi-line) → in vào ĐNTT. */
    tai_khoan_thanh_toan?: string | null;
  } | null;
}

interface Props {
  doanId: number;
  xe: XeInfo | null;
  /** Xe phụ (nhà xe thứ 2) — đoàn dùng 2 xe. */
  xe2?: XeInfo | null;
  tenDoan?: string;
  /** Ngày bắt đầu đoàn (YYYY-MM-DD) — dùng làm ngày mặc định trên ĐNTT in. */
  ngayBatDau?: string;
  /** Đoàn đã quyết toán → khóa sửa con số chi phí (trừ admin). */
  locked?: boolean;
}

function mkXeLabel(x: XeInfo | null | undefined, t: (s: string) => string): string | null {
  if (!x) return null;
  return [x.nha_xe?.ten, x.ten_xe, x.so_cho ? `${x.so_cho} ${t("chỗ")}` : ""].filter(Boolean).join(" · ") || null;
}

export default function ChiPhiXeSection({ doanId, xe, xe2 = null, tenDoan, ngayBatDau, locked = false }: Props) {
  useTranslate();
  const { data: chiPhiRows = [] } = useChiPhiList(doanId);
  const { data: dnttList = [] } = useDNTTList(doanId);
  const { data: paymentsList = [] } = usePaymentsByChiPhi(doanId);
  const { data: congNoList = [] } = useCongNoList({ doanId });
  const { data: currentUserName = "" } = useCurrentUserName();

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
  const insertDNTT = useInsertDNTT();
  const updateDNTT = useUpdateDNTT();
  const upsertMut = useUpsertChiPhi();
  const deleteMut = useDeleteChiPhi();
  const cancelMut = useCancelDNTT();
  const adjustMut = useCreateAdjustment();

  // Inline row edit. editRowRef = source-of-truth cho blur callback; editRow (state)
  // chỉ để render. DecimalInput commit onChange + gọi onBlur qua setTimeout, nên đọc
  // editRow từ closure trong handleRowSave sẽ lấy giá trị CŨ (chưa có giá vừa gõ) →
  // phải đọc qua ref đồng bộ. (Xem decimal-input.tsx onBlur.)
  // don_gia_raw = đơn giá CHƯA VAT (ô nhập); vat_pct = % VAT. Thành tiền = applyVat(raw,vat)*SL.
  type XeRowEdit = { so_luong: number; don_gia_raw: number; vat_pct: number };
  const editRowRef = useRef<Record<number, XeRowEdit>>({});
  const [editRow, setEditRow] = useState<Record<number, XeRowEdit>>({});
  const commitEditRow = (next: Record<number, XeRowEdit>) => {
    editRowRef.current = next;
    setEditRow(next);
  };

  // Inline edit ĐNTT amount
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editAmount, setEditAmount] = useState("");

  // ĐNTT modal
  interface XeModalTarget { chiPhiId: number; thanhTien: number; moTa: string; nccId: number | null }
  const [modal, setModal] = useState<XeModalTarget | null>(null);
  const [modalMode, setModalMode] = useState<"full" | "deposit">("full");
  const [depositAmount, setDepositAmount] = useState(0);
  const [ngayCan, setNgayCan] = useState("");

  // Adjust dialog
  const [adjustTarget, setAdjustTarget] = useState<DNTTRowDntt | null>(null);
  const [adjustAmount, setAdjustAmount] = useState("");
  const [adjustReason, setAdjustReason] = useState("");


  // Cancel dialog
  const [cancelTarget, setCancelTarget] = useState<CancelTarget | null>(null);
  const [cancelMode, setCancelMode] = useState<"cong_no" | "hoan_tien">("hoan_tien");

  // Add extra (phụ phí) inline form
  const [addExtraForId, setAddExtraForId] = useState<number | null>(null);
  const [extraFields, setExtraFields] = useState({ mo_ta: "", so_luong: 1, don_gia_raw: 0, vat_pct: XE_VAT_DEFAULT });

  // In ĐNTT (Word) — preview modal dùng chung mẫu với Dịch vụ
  const [previewData, setPreviewData] = useState<NHDocData | null>(null);

  const xeRows = chiPhiRows.filter((r) => r.danh_muc === "xe");
  const total = xeRows.reduce((s, r) => s + r.tien_cong_ty + r.tien_hdv, 0);
  // Dòng xe công ty trả → mới in được ĐNTT (HDV trả thì không qua flow này).
  const companyXeRows = xeRows.filter((r) => r.tien_cong_ty > 0);

  const xeLabel = mkXeLabel(xe, t);
  const xe2Label = mkXeLabel(xe2, t);
  // Map nha_cung_cap_id → TK ngân hàng nhà xe, gom CẢ 2 xe. ĐNTT in lấy STK theo
  // đúng NCC của từng nhóm (trước đây chỉ lấy xe 1 → xe 2 NCC khác thiếu STK).
  const xeTkttByNcc = useMemo(() => {
    const m: Record<number, string> = {};
    for (const x of [xe, xe2]) {
      const ncc = x?.nha_xe?.nha_cung_cap_id;
      const tk = x?.nha_xe?.tai_khoan_thanh_toan?.trim();
      if (ncc != null && tk) m[ncc] = tk;
    }
    return m;
  }, [xe, xe2]);

  // ── Row edit helpers ──────────────────────────────────────────────────────
  // Dòng cũ: don_gia_raw null → fallback don_gia (giá cũ); vat_pct null → 0 (không VAT,
  // tiền giữ nguyên). Dòng mới handleAddXe set vat_pct = XE_VAT_DEFAULT.
  const rowEditInit = (row: typeof xeRows[0]): XeRowEdit => ({
    so_luong: row.so_luong,
    don_gia_raw: row.don_gia_raw ?? row.don_gia,
    vat_pct: row.vat_pct ?? 0,
  });
  const getRowEdit = (row: typeof xeRows[0]) => editRow[row.id] ?? rowEditInit(row);

  const handleRowChange = (id: number, field: keyof XeRowEdit, val: number) => {
    const base = xeRows.find((r) => r.id === id);
    const existing = editRowRef.current[id] ?? (base ? rowEditInit(base) : { so_luong: 0, don_gia_raw: 0, vat_pct: 0 });
    commitEditRow({ ...editRowRef.current, [id]: { ...existing, [field]: val } });
  };

  const handleRowSave = (row: typeof xeRows[0]) => {
    // Đọc qua ref, KHÔNG đọc editRow closure: DecimalInput commit onChange rồi gọi
    // onBlur qua setTimeout → closure editRow lúc render chưa có giá vừa gõ → bỏ save.
    const local = editRowRef.current[row.id];
    if (!local) return;
    const init = rowEditInit(row);
    if (local.so_luong === init.so_luong && local.don_gia_raw === init.don_gia_raw && local.vat_pct === init.vat_pct) return;
    // don_gia lưu DB = giá đã gồm VAT → thanh_tien (generated) + tien_cong_ty đều gồm VAT.
    const donGia = applyVat(local.don_gia_raw, local.vat_pct);
    const total = calcXeThanhTien(local.so_luong, local.don_gia_raw, local.vat_pct);
    const isHDV = row.tien_hdv > 0;
    upsertMut.mutate({
      id: row.id,
      doan_id: doanId,
      so_luong: local.so_luong,
      don_gia: donGia,
      don_gia_raw: local.don_gia_raw,
      vat_pct: local.vat_pct,
      tien_cong_ty: isHDV ? 0 : total,
      tien_hdv: isHDV ? total : 0,
    }, {
      onSuccess: () => { const next = { ...editRowRef.current }; delete next[row.id]; commitEditRow(next); },
    });
  };

  const handleToggleNguoiTt = (row: typeof xeRows[0]) => {
    // don_gia đã gồm VAT → total = SL × don_gia. (Giữ nguyên tổng khi đổi nguồn.)
    const total = row.tien_cong_ty + row.tien_hdv;
    const next = row.tien_hdv > 0 ? "cong_ty" : "hdv";
    upsertMut.mutate({
      id: row.id,
      doan_id: doanId,
      tien_cong_ty: next === "cong_ty" ? total : 0,
      tien_hdv: next === "hdv" ? total : 0,
    });
  };

  // ── Định kỳ toggle ────────────────────────────────────────────────────────
  const handleToggleDinhKy = (row: typeof xeRows[0]) => {
    const newVal = !row.thanh_toan_dinh_ky;
    upsertMut.mutate({ id: row.id, doan_id: doanId, thanh_toan_dinh_ky: newVal }, {
      onSuccess: () => toast.success(newVal ? t("Đã bật thanh toán định kỳ") : t("Đã tắt thanh toán định kỳ")),
    });
  };

  // ── Extra (phụ phí) ───────────────────────────────────────────────────────
  const openAddExtra = (rowId: number) => {
    setAddExtraForId(rowId);
    setExtraFields({ mo_ta: "", so_luong: 1, don_gia_raw: 0, vat_pct: XE_VAT_DEFAULT });
  };

  const handleSaveExtra = () => {
    if (!addExtraForId) return;
    const parent = xeRows.find((r) => r.id === addExtraForId);
    if (!extraFields.mo_ta.trim()) { toast.warning(t("Nhập mô tả phụ phí")); return; }
    if (extraFields.don_gia_raw <= 0) { toast.warning(t("Đơn giá phải lớn hơn 0")); return; }
    const donGia = applyVat(extraFields.don_gia_raw, extraFields.vat_pct);
    const total = calcXeThanhTien(extraFields.so_luong, extraFields.don_gia_raw, extraFields.vat_pct);
    upsertMut.mutate({
      doan_id: doanId,
      danh_muc: "xe",
      loai: "xe",
      mo_ta: extraFields.mo_ta.trim(),
      don_gia: donGia,
      don_gia_raw: extraFields.don_gia_raw,
      vat_pct: extraFields.vat_pct,
      so_luong: extraFields.so_luong,
      tien_cong_ty: total,
      tien_hdv: 0,
      nha_cung_cap_id: parent?.nha_cung_cap_id ?? null,
      xe_id: parent?.xe_id ?? null,
      thanh_toan_dinh_ky: true,
    }, {
      onSuccess: () => {
        setAddExtraForId(null);
        toast.success(t("Đã thêm phụ phí xe"));
      },
    });
  };

  // ── Add xe row ────────────────────────────────────────────────────────────
  // slot 1 = xe chính, 2 = xe phụ. Gán đúng NCC + tag xe_id của xe được chọn
  // (trước đây luôn gán xe 1 → thêm dòng cho xe 2 bị sai nhà cung cấp).
  const handleAddXe = (slot: 1 | 2) => {
    const chosen = slot === 1 ? xe : xe2;
    const label = mkXeLabel(chosen, t);
    if (!label) { toast.warning(t("Đoàn chưa chọn xe trong phần điều tour")); return; }
    upsertMut.mutate({
      doan_id: doanId,
      danh_muc: "xe",
      loai: "xe",
      mo_ta: label,
      don_gia: 0,
      don_gia_raw: 0,
      vat_pct: XE_VAT_DEFAULT,
      so_luong: 1,
      tien_cong_ty: 0,
      tien_hdv: 0,
      nha_cung_cap_id: chosen?.nha_xe?.nha_cung_cap_id ?? null,
      xe_id: chosen?.id ?? null,
      thanh_toan_dinh_ky: true,
    }, {
      onSuccess: () => toast.success(t("Đã thêm dòng xe")),
    });
  };

  // ── In ĐNTT (Word) ────────────────────────────────────────────────────────
  // Lấy mẫu của Dịch vụ: build entries từ các dòng xe công ty trả (gộp theo NCC),
  // mở DNTTNHPreviewModal để xem/sửa rồi xuất Word. Dùng cho đoàn thanh toán xe
  // trực tiếp (cần tờ ĐNTT giấy, không bắt buộc qua flow duyệt).
  const handlePrintDNTT = async () => {
    if (companyXeRows.length === 0) {
      toast.warning(t("Không có dòng xe công ty trả để in ĐNTT"));
      return;
    }
    try {
      const nccIds = Array.from(
        new Set(companyXeRows.map((r) => r.nha_cung_cap_id).filter((x): x is number => x != null)),
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
      // Ngày bắt đầu đoàn (YYYY-MM-DD) → DD/MM/YYYY làm ngày mặc định (user sửa được).
      const ngayLabel = ngayBatDau && /^\d{4}-\d{2}-\d{2}/.test(ngayBatDau)
        ? ngayBatDau.slice(0, 10).split("-").reverse().join("/")
        : "";

      // Gộp các dòng xe theo NCC (null → key 0) → 1 entry/NCC.
      const groups = new Map<number, typeof companyXeRows>();
      for (const r of companyXeRows) {
        const key = r.nha_cung_cap_id ?? 0;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key)!.push(r);
      }

      const entries: NHDocEntry[] = [];
      for (const [key, grows] of groups) {
        const isGop = grows.length > 1;
        const ncc = key !== 0 ? (nccMap[key] ?? null) : null;
        // don_gia đã gồm VAT → so_luong*don_gia = tien_cong_ty (Word không áp CK cho xe).
        const items = grows.map((r) => ({
          so_luong: r.so_luong,
          don_gia: r.don_gia,
          ghi_chu: isGop ? (r.mo_ta || t("Xe")) : "",
        }));
        const totalCty = grows.reduce((s, r) => s + r.tien_cong_ty, 0);
        entries.push({
          ngay_date: ngayLabel,
          ten_nh: ncc?.ten ?? xeLabel ?? grows[0].mo_ta ?? t("Xe"),
          so_khach: grows.reduce((s, r) => s + r.so_luong, 0),
          foc_khach: null,
          foc: null,
          items,
          ncc,
          // TK nhà xe theo đúng NCC của nhóm (gom cả 2 xe); không có → Word fallback ncc.
          tai_khoan_thanh_toan: xeTkttByNcc[key] ?? null,
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
    if (soTien <= 0) { toast.error(t("Số tiền phải lớn hơn 0")); return; }
    if (modalMode === "deposit" && soTien >= thanhTien) { toast.error(t("Số tiền cọc phải nhỏ hơn tổng tiền")); return; }
    insertDNTT.mutate({
      doan_id: doanId,
      loai: "xe",
      mo_ta: moTa || "Xe",
      nha_cung_cap_id: nccId,
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
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-green-100 bg-green-50">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-semibold text-green-900">🚌 {t("Xe")}</span>
          {xeLabel && <span className="text-xs text-muted-foreground">· {[xeLabel, xe2Label].filter(Boolean).join("  |  ")}</span>}
        </div>
        <div className="flex items-center gap-3">
          {total > 0 && <span className="text-xs text-muted-foreground">{t("Tổng:")} {fmt(total)} ₫</span>}
          {companyXeRows.length > 0 && (
            <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={handlePrintDNTT}>
              <Printer className="h-3.5 w-3.5" />
              {t("In ĐNTT")}
            </Button>
          )}
          {xe2Label ? (
            <>
              <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => handleAddXe(1)} disabled={upsertMut.isPending || locked}>
                + {t("Xe 1")}
              </Button>
              <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => handleAddXe(2)} disabled={upsertMut.isPending || locked}>
                + {t("Xe 2")}
              </Button>
            </>
          ) : (
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => handleAddXe(1)} disabled={upsertMut.isPending || locked}>
              + {t("Thêm")}
            </Button>
          )}
        </div>
      </div>

      {xeRows.length === 0 ? (
        <p className="px-4 py-3 text-sm text-muted-foreground">
          {xeLabel ? t("Bấm \"+ Thêm\" để ghi nhận chi phí xe.") : t("Chưa có xe trong điều tour. Vào tab Điều Tour để chọn xe.")}
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse">
            <colgroup>
              <col />
              <col style={{ width: "60px" }} />
              <col style={{ width: "110px" }} />
              <col style={{ width: "64px" }} />
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
                <th className="text-center px-3 py-2.5">{t("Đơn giá")}</th>
                <th className="text-center px-2 py-2.5">{t("VAT %")}</th>
                <th className="text-right px-3 py-2.5">{t("Thành tiền")}</th>
                <th className="text-center px-2 py-2.5">{t("Nguồn")}</th>
                <th className="text-center px-3 py-2.5">{t("TT ĐNTT")}</th>
                <th className="text-center px-3 py-2.5">{t("TT Thanh toán")}</th>
                <th className="px-2 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {xeRows.map((row) => {
                const local = getRowEdit(row);
                const thanhTienLocal = calcXeThanhTien(local.so_luong, local.don_gia_raw, local.vat_pct);

                const allDntts = dnttList.filter(
                  (d) => d.ref_loai === "doan_chi_phi" && d.ref_id === row.id,
                );
                const activeDntts = allDntts.filter(
                  (d) => d.trang_thai_duyet !== "da_huy" && d.trang_thai_duyet !== "tu_choi",
                );
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
                // Hoàn tiền → ẩn khỏi tab Chi phí của đoàn, chỉ giữ record ở sidebar Thanh toán/UNC
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
                    {/* Mô tả (+ badge thuộc xe nào khi đoàn có 2 xe) */}
                    <td className="px-4 py-2.5 font-medium">
                      {xe2Label && row.xe_id != null && (
                        <span className="mr-1.5 px-1 py-px rounded text-[9px] font-medium bg-green-100 text-green-700 align-middle">
                          {row.xe_id === (xe2?.id ?? -1) ? t("Xe 2") : t("Xe 1")}
                        </span>
                      )}
                      {row.mo_ta || "—"}
                    </td>

                    {/* SL */}
                    <td className="px-2 py-2.5">
                      <div className="flex justify-center">
                        <Input
                          type="number"
                          min={0}
                          value={local.so_luong ?? ""}
                          disabled={locked}
                          onChange={(e) => handleRowChange(row.id, "so_luong", e.target.value === "" ? 0 : Number(e.target.value))}
                          onBlur={() => handleRowSave(row)}
                          onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLElement).blur(); }}
                          className="h-6 text-xs px-1.5 py-0 text-center w-[44px]"
                        />
                      </div>
                    </td>

                    {/* Đơn giá (chưa VAT) */}
                    <td className="px-3 py-2.5">
                      <div className="flex justify-center">
                        <DecimalInput
                          value={local.don_gia_raw}
                          onChange={(v) => handleRowChange(row.id, "don_gia_raw", v)}
                          onBlur={() => handleRowSave(row)}
                          disabled={locked}
                          className="h-6 text-xs px-1.5 py-0 text-right w-[112px]"
                        />
                      </div>
                    </td>

                    {/* VAT % */}
                    <td className="px-2 py-2.5">
                      <div className="flex justify-center">
                        <Input
                          type="number"
                          min={0}
                          value={local.vat_pct ?? ""}
                          disabled={locked}
                          onChange={(e) => handleRowChange(row.id, "vat_pct", e.target.value === "" ? 0 : Number(e.target.value))}
                          onBlur={() => handleRowSave(row)}
                          onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLElement).blur(); }}
                          className="h-6 text-xs px-1.5 py-0 text-center w-[48px]"
                        />
                      </div>
                    </td>

                    {/* Thành tiền */}
                    <td className="px-3 py-2.5 text-right font-semibold text-primary whitespace-nowrap">
                      {fmt(thanhTienLocal)} ₫
                    </td>

                    {/* Ai trả — badge */}
                    <td className="px-2 py-2.5 text-center">
                      <button
                        onClick={() => handleToggleNguoiTt(row)}
                        disabled={upsertMut.isPending || locked}
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
                            onClick={() => openModal(row.id!, thanhTien, row.mo_ta || "", row.nha_cung_cap_id)}>
                            {t("ĐNTT")}
                          </Button>
                        )}
                        {nguoiTt === "cong_ty" && activeDntts.length > 0 && daDeNghi === 0 && (
                          <Button variant="outline" size="sm" className="h-6 text-[10px] px-2 border-amber-400 text-amber-700 hover:bg-amber-50"
                            onClick={() => openModal(row.id!, conLai > 0 ? conLai : thanhTien, row.mo_ta || "", row.nha_cung_cap_id)}>
                            {conLai > 0 ? t("ĐNTT còn lại") : t("ĐNTT bổ sung")}
                          </Button>
                        )}
                        <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-muted-foreground hover:text-primary"
                          title={t("Thêm phụ phí")}
                          disabled={locked}
                          onClick={() => openAddExtra(row.id)}>
                          <Plus className="h-3 w-3" />
                        </Button>
                        <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
                          onClick={() => deleteMut.mutate({ id: row.id, doanId }, { onSuccess: () => toast.success(t("Đã xóa")) })}
                          disabled={deleteMut.isPending || locked}>
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                  {addExtraForId === row.id && (
                    <tr className="bg-amber-50/60 border-b border-dashed border-amber-200">
                      <td colSpan={9} className="px-4 py-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-[10px] text-amber-700 font-medium shrink-0">↳ {t("Phụ phí")}</span>
                          <Input
                            autoFocus
                            placeholder={t("Mô tả (vd: Xe trung chuyển)")}
                            className="h-6 text-xs flex-1 min-w-[160px]"
                            value={extraFields.mo_ta}
                            onChange={(e) => setExtraFields((p) => ({ ...p, mo_ta: e.target.value }))}
                            onKeyDown={(e) => { if (e.key === "Enter") handleSaveExtra(); if (e.key === "Escape") setAddExtraForId(null); }}
                          />
                          <Input
                            type="number"
                            min={0}
                            placeholder={t("SL")}
                            className="h-6 text-xs w-14 text-center"
                            value={extraFields.so_luong ?? ""}
                            onChange={(e) => setExtraFields((p) => ({ ...p, so_luong: e.target.value === "" ? 0 : Number(e.target.value) }))}
                          />
                          <span className="text-[10px] text-muted-foreground shrink-0">×</span>
                          <DecimalInput
                            value={extraFields.don_gia_raw}
                            onChange={(v) => setExtraFields((p) => ({ ...p, don_gia_raw: v }))}
                            placeholder={t("Đơn giá")}
                            className="h-6 text-xs w-28 text-right"
                          />
                          <span className="text-[10px] text-muted-foreground shrink-0">+VAT</span>
                          <Input
                            type="number"
                            min={0}
                            placeholder={t("VAT %")}
                            className="h-6 text-xs w-14 text-center"
                            value={extraFields.vat_pct ?? ""}
                            onChange={(e) => setExtraFields((p) => ({ ...p, vat_pct: e.target.value === "" ? 0 : Number(e.target.value) }))}
                          />
                          {extraFields.don_gia_raw > 0 && (
                            <span className="text-xs font-semibold text-primary shrink-0">
                              = {fmt(calcXeThanhTien(extraFields.so_luong, extraFields.don_gia_raw, extraFields.vat_pct))} ₫
                            </span>
                          )}
                          <Button size="sm" className="h-6 text-xs px-2" onClick={handleSaveExtra} disabled={upsertMut.isPending || locked}>{t("Lưu")}</Button>
                          <Button size="sm" variant="ghost" className="h-6 text-xs px-2" onClick={() => setAddExtraForId(null)}>{t("Hủy")}</Button>
                        </div>
                      </td>
                    </tr>
                  )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* In ĐNTT (Word) — preview + xuất, dùng chung modal với Dịch vụ */}
      <DNTTNHPreviewModal
        open={!!previewData}
        data={previewData}
        onClose={() => setPreviewData(null)}
      />

      {/* ĐNTT Modal */}
      <Dialog open={!!modal} onOpenChange={(v) => { if (!v) setModal(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-sm">{t("Tạo đề nghị thanh toán")} — {modal?.moTa || t("Xe")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2 text-xs">
            <p>{t("Tổng tiền:")} <span className="font-semibold">{fmt(modal?.thanhTien ?? 0)} VND</span></p>
            <RadioGroup value={modalMode} onValueChange={(v) => setModalMode(v as "full" | "deposit")} className="space-y-2">
              <div className="flex items-center gap-2">
                <RadioGroupItem value="full" id="xe-full" />
                <Label htmlFor="xe-full" className="text-xs cursor-pointer">
                  {t("Toàn bộ")} — {fmt(modal?.thanhTien ?? 0)} VND
                </Label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem value="deposit" id="xe-dep" />
                <Label htmlFor="xe-dep" className="text-xs cursor-pointer">{t("1 phần (cọc)")}</Label>
              </div>
            </RadioGroup>
            {modalMode === "deposit" && (
              <div className="space-y-1">
                <Label className="text-xs">{t("Số tiền cọc")}</Label>
                <Input type="number" className="h-8 text-xs"
                  value={depositAmount || ""}
                  onChange={(e) => setDepositAmount(Number(e.target.value) || 0)}
                  max={modal?.thanhTien} />
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
            <Button size="sm" className="text-xs" onClick={handleModalSubmit} disabled={insertDNTT.isPending}>
              {t("Tạo đề nghị TT")}
            </Button>
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
                  onChange={(e) => setAdjustAmount(e.target.value.replace(/\D/g, ""))}
                  placeholder={t("Nhập số tiền...")} />
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
                  <RadioGroupItem value="hoan_tien" id="xe-cancel-ht" />
                  <Label htmlFor="xe-cancel-ht" className="text-xs">{t("Hoàn tiền")}</Label>
                </div>
                <div className="flex items-center gap-1.5">
                  <RadioGroupItem value="cong_no" id="xe-cancel-cn" />
                  <Label htmlFor="xe-cancel-cn" className="text-xs">{t("Ghi công nợ")}</Label>
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
