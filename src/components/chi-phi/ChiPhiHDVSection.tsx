import { useState, useEffect, useRef, useMemo } from "react";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { externalSupabase } from "@/lib/supabase-external";
import { errMsg } from "@/lib/error";
import { format, addDays } from "date-fns";
import { Plus, Ban, Trash2, Printer, FileText, FileDown, Check, Pencil, X } from "lucide-react";
import HDVPreviewModal from "./HDVPreviewModal";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DecimalInput } from "@/components/ui/decimal-input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
  useChiPhiHDVSection,
  useCreateHDVPayment,
  useCancelDNTT,
  type HDVDNTTRow,
  type HDVHoTroItem,
  type HDVInfo,
} from "@/hooks/use-chi-phi-hdv";
import {
  useUpsertChiPhi, useDeleteChiPhi,
  useDNTTList, useInsertDNTT,
} from "@/hooks/use-chi-phi";
import { useUpdateDNTT } from "@/hooks/use-dntt";
import { usePaymentsByChiPhi } from "@/hooks/use-payments";
import { useCongNoList } from "@/hooks/use-cong-no";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";
import { exportHDVQuyetToanExcel } from "@/lib/export-hdv-quyet-toan-excel";
import { exportDnttKhacHoanUngWord } from "@/lib/export-dntt-khac-word";
import { t, useTranslate } from "@/lib/i18n";

const fmt = (n: number) => n.toLocaleString("vi-VN");

// Subset thông tin đoàn mà section HDV cần (số khách + ngày + tên + tip overrides).
export interface HDVDoanInfo {
  ten_doan?: string | null;
  so_khach?: number | null;
  so_khach_lon?: number | null;
  so_khach_em1?: number | null;
  so_khach_em2?: number | null;
  so_khach_tl?: number | null;
  ngay_di?: string | null;
  ngay_ve?: string | null;
  tip_rate?: number | null;
  tip_so_khach_override?: number | null;
  tip_so_ngay_override?: number | null;
  tip_lump_sum?: number | null;
  dau_khach_rate?: number | null;
  dau_khach_currency?: string | null;
  dau_khach_ty_gia?: number | null;
  dau_khach_nguoi_thu?: string | null;
  dau_khach_so_khach_override?: number | null;
  quy_vp_amount?: number | null;
  quy_vp_currency?: string | null;
  quy_vp_ty_gia?: number | null;
  quy_vp_nguoi_thu?: string | null;
}

interface Props {
  doanId: number;
  doan?: HDVDoanInfo;
}

// Tính "Phải thu HDV" — tổng các khoản HDV thu hộ công ty:
//   1. Tip (NDT × tỷ giá) — chỉ tính khi tip người thu = HDV (mặc định HDV thu)
//   2. Thu tiền đầu khách (VND, pax × rate) — chỉ khi dau_khach_nguoi_thu='hdv'
//   3. Thu tiền quỹ VP (VND lump-sum) — chỉ khi quy_vp_nguoi_thu='hdv'
// Default cho 2 khoản mới: nguoi_thu='hdv'. Sync với ChiPhiPhasThuSection.
function computeHdvPhaiThuVND(doan: HDVDoanInfo | undefined): number {
  if (!doan) return 0;
  const soKhachTotal =
    (doan.so_khach_lon ?? 0) + (doan.so_khach_em1 ?? 0) +
    (doan.so_khach_em2 ?? 0) + (doan.so_khach_tl ?? 0) ||
    doan.so_khach || 0;
  const soKhachTl = doan.so_khach_tl ?? 0;
  const autoSoKhach = Math.max(0, soKhachTotal - soKhachTl); // T/L không đóng tip
  const autoSoNgay = doan.ngay_di && doan.ngay_ve
    ? Math.max(1, Math.ceil((new Date(doan.ngay_ve).getTime() - new Date(doan.ngay_di).getTime()) / 86400000) + 1)
    : 0;
  const coTL = soKhachTl > 0;
  const autoRate = coTL ? 150 : 300;

  // (1) Tip — default nguoi_thu = "hdv" (UI ChiPhiPhasThuSection)
  let tipVND = 0;
  const effSoKhach = doan.tip_so_khach_override ?? autoSoKhach;
  const effSoNgay = doan.tip_so_ngay_override ?? autoSoNgay;
  const effRate = doan.tip_rate ?? autoRate;
  if (effSoKhach && effSoNgay) {
    const tyGiaStr = typeof window !== "undefined" ? localStorage.getItem("hdv_ty_gia_ndt") : null;
    const tyGia = tyGiaStr ? Number(tyGiaStr) : 800;
    const tongNDT = doan.tip_lump_sum ?? (effSoKhach * effSoNgay * effRate);
    tipVND = tongNDT * tyGia;
  }

  // (2) Thu tiền đầu khách — default 0 pax × 200.000 = 0. Currency hardcode VND.
  const DK_DEFAULT_RATE = 200_000;
  const dkNguoiThu = doan.dau_khach_nguoi_thu ?? "hdv";
  const dkSoKhach = doan.dau_khach_so_khach_override ?? 0;
  const dkRate = doan.dau_khach_rate ?? DK_DEFAULT_RATE;
  const dkVND = dkNguoiThu === "hdv" ? dkSoKhach * dkRate : 0;

  // (3) Thu tiền quỹ VP — default 200.000 VND lump-sum.
  const VP_DEFAULT_AMOUNT = 200_000;
  const vpNguoiThu = doan.quy_vp_nguoi_thu ?? "hdv";
  const vpAmount = doan.quy_vp_amount ?? VP_DEFAULT_AMOUNT;
  const vpVND = vpNguoiThu === "hdv" ? vpAmount : 0;

  return tipVND + dkVND + vpVND;
}

export default function ChiPhiHDVSection({ doanId, doan }: Props) {
  useTranslate();
  const { data, isLoading } = useChiPhiHDVSection(doanId);
  const [showTamUng, setShowTamUng] = useState(false);
  const [showQuyetToan, setShowQuyetToan] = useState(false);
  const [showPreview, setShowPreview] = useState(false);

  const hdvPhaiThuVND = computeHdvPhaiThuVND(doan);
  // Net = (chi vendor + HDV ứng hỗ trợ) − tạm ứng đã trả − phải thu (HDV tự thu tip).
  // > 0: HDV đã chi vượt thu → công ty còn phải trả lại. < 0: HDV thu nhiều hơn chi → HDV trả lại công ty.

  if (isLoading) {
    return <div className="text-sm text-muted-foreground py-4">{t("Đang tải...")}</div>;
  }

  const hdv = data?.hdv ?? null;
  const hoTroItems = data?.hoTroItems ?? [];
  const tongHdvChi = data?.tongHdvChi ?? 0;
  const tongHoTroHDV = data?.tongHoTroHDV ?? 0;
  const tamUngList = data?.tamUngList ?? [];
  const quyetToanList = data?.quyetToanList ?? [];
  const tamUngDaTT = data?.tamUngDaTT ?? 0;
  const soConPhaiTra = data?.soConPhaiTra ?? 0;
  const daQuyetToan = data?.daQuyetToan ?? false;
  // Net thực tế cần thanh toán/trả lại: tính cả khoản HDV tự thu (tip) → HDV đã có tiền sẵn.
  const netConPhaiTra = soConPhaiTra - hdvPhaiThuVND;

  return (
    <div className="space-y-4">
      {/* ── Top card: HDV info + tóm tắt + tạm ứng/quyết toán ── */}
      <div className="rounded-lg border border-border bg-card overflow-hidden">
        {/* HDV info + summary */}
        <div className="px-4 py-3 bg-muted/40 border-b border-border flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-4 flex-wrap">
            {hdv ? (
              <div>
                <p className="text-sm font-semibold">{hdv.ten}</p>
                {(hdv.so_tai_khoan || hdv.ngan_hang) && (
                  <p className="text-xs text-muted-foreground">
                    {[hdv.so_tai_khoan, hdv.ngan_hang].filter(Boolean).join(" · ")}
                  </p>
                )}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground italic">{t("Chưa chỉ định HDV")}</p>
            )}

            {(tongHdvChi > 0 || tongHoTroHDV > 0 || hdvPhaiThuVND > 0) && (
              <div className="flex gap-4 flex-wrap">
                {tongHdvChi > 0 && (
                  <div>
                    <p className="text-[11px] text-muted-foreground">{t("Tổng HDV chi")}</p>
                    <p className="text-sm font-semibold">{fmt(tongHdvChi)} ₫</p>
                  </div>
                )}
                {hdvPhaiThuVND > 0 && (
                  <div>
                    <p className="text-[11px] text-muted-foreground">{t("Phải thu HDV")}</p>
                    <p className="text-sm font-semibold text-amber-600">{fmt(hdvPhaiThuVND)} ₫</p>
                  </div>
                )}
                {tamUngDaTT > 0 && (
                  <div>
                    <p className="text-[11px] text-muted-foreground">{t("Đã tạm ứng")}</p>
                    <p className="text-sm font-semibold text-emerald-600">{fmt(tamUngDaTT)} ₫</p>
                  </div>
                )}
                <div>
                  <p className="text-[11px] text-muted-foreground">
                    {netConPhaiTra > 0 ? t("Công ty còn phải trả") : netConPhaiTra < 0 ? t("HDV phải trả lại") : t("Đã đủ")}
                  </p>
                  <p className={cn(
                    "text-sm font-semibold",
                    netConPhaiTra > 0 ? "text-orange-600" : netConPhaiTra < 0 ? "text-blue-600" : "text-emerald-600",
                  )}>
                    {netConPhaiTra < 0 ? "-" : ""}{fmt(Math.abs(netConPhaiTra))} ₫
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Buttons */}
          <div className="flex gap-2 shrink-0 flex-wrap">
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setShowPreview(true)}>
              <Printer className="h-3 w-3 mr-1" /> {t("In thống kê")}
            </Button>
            {!daQuyetToan && (
              <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setShowTamUng(true)}>
                <Plus className="h-3 w-3 mr-1" /> {t("Tạm ứng")}
              </Button>
            )}
            {(tamUngList.length > 0 || tongHdvChi > 0 || tongHoTroHDV > 0) && (
              <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setShowQuyetToan(true)}>
                <Plus className="h-3 w-3 mr-1" /> {t("Quyết toán")}
              </Button>
            )}
          </div>
        </div>

        {/* Danh sách tạm ứng */}
        {tamUngList.length > 0 && (
          <div className="border-b border-border">
            <div className="px-4 py-1.5 bg-muted/20">
              <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">{t("Tạm ứng")}</p>
            </div>
            <div className="divide-y divide-border">
              {tamUngList.map((d) => (
                <HDVDNTTCard key={d.id} d={d} doanId={doanId} hdv={hdv} />
              ))}
            </div>
          </div>
        )}

        {/* Danh sách quyết toán */}
        {quyetToanList.length > 0 && (
          <div>
            <div className="px-4 py-1.5 bg-muted/20 border-b border-border">
              <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">{t("Quyết toán")}</p>
            </div>
            <div className="divide-y divide-border">
              {quyetToanList.map((d) => (
                <HDVDNTTCard key={d.id} d={d} doanId={doanId} hdv={hdv} />
              ))}
            </div>
          </div>
        )}

        {/* Empty state nếu chưa có gì */}
        {tamUngList.length === 0 && quyetToanList.length === 0 && (
          <p className="px-4 py-3 text-sm text-muted-foreground">{t("Chưa có tạm ứng hoặc quyết toán.")}</p>
        )}
      </div>

      {/* ── Chi phí công ty hỗ trợ HDV ── */}
      <HoTroHDVTable doanId={doanId} doan={doan} hoTroItems={hoTroItems} />

      {/* Modals */}
      {showTamUng && (
        <CreateHDVPaymentModal
          doanId={doanId}
          hdvId={hdv?.id ?? null}
          refLoai="hdv_tam_ung"
          title={t("Tạo tạm ứng HDV")}
          onClose={() => setShowTamUng(false)}
        />
      )}
      {showQuyetToan && (
        <CreateHDVPaymentModal
          doanId={doanId}
          hdvId={hdv?.id ?? null}
          refLoai="hdv_quyet_toan"
          title={t("Tạo quyết toán HDV")}
          defaultSoTien={Math.abs(netConPhaiTra)}
          defaultLaThuHoi={netConPhaiTra < 0}
          doan={doan}
          tongHdvChi={tongHdvChi}
          hdv={hdv}
          onClose={() => setShowQuyetToan(false)}
        />
      )}
      <HDVPreviewModal
        open={showPreview}
        onClose={() => setShowPreview(false)}
        doan={doan}
        data={data ?? null}
        hdvPhaiThuVND={hdvPhaiThuVND}
      />
    </div>
  );
}

// ── Chi phí "Khác" (cũ: Hướng dẫn viên) ─────────────────────────────────────
// Mỗi row độc lập: SL × Đơn giá. Nguồn = "Công ty" → có thể tạo ĐNTT cho NCC
// (template tương tự nhà hàng: full/cọc + ngày cần TT). Nguồn = "HDV" → HDV
// tự ứng, không cần ĐNTT.

const STATUS_LABEL: Record<string, { textKey: string; cls: string }> = {
  cho_duyet: { textKey: "Chờ duyệt ĐNTT", cls: "bg-yellow-100 text-yellow-700" },
  da_duyet:  { textKey: "Đã duyệt ĐNTT",  cls: "bg-teal-100 text-teal-700" },
  tu_choi:   { textKey: "Từ chối",         cls: "bg-red-100 text-red-700" },
};

interface KhacModalItem {
  chiPhiId: number;
  thanhTien: number;
  moTa: string;
  nccId: number | null;
}
type KhacModalTarget =
  | { type: "single"; item: KhacModalItem }
  | { type: "bulk"; items: KhacModalItem[]; thanhTien: number; defaultNccId: number | null };
interface KhacCancelTarget { dnttId: number; isPaid: boolean }

function HoTroHDVTable({ doanId, doan, hoTroItems }: {
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

// ─────────────────────────────────────────────────────────────────────────────

// Shape tối thiểu — chỉ field row đụng tới (tránh import deep types).
interface DnttLite {
  id: number;
  ref_loai: string | null;
  ref_id: number | null;
  so_tien: number;
  la_coc: boolean | null;
  trang_thai_duyet: string;
  payment_status: "unpaid" | "partial" | "paid";
  paid_amount: number;
  thanh_toan_luc: string | null;
}
interface CongNoLite {
  dntt_goc_id: number | null;
  trang_thai: string;
  so_tien_goc: number;
  so_tien_con_lai: number;
}

// Row hỗ trợ HDV — local state với ref mirror.
// Lift state vào row giúp keystroke không re-render bảng. Ref mirror đảm bảo
// triggerSave (gọi qua setTimeout từ DecimalInput.onBlur) đọc value mới nhất,
// không bị stale closure khi user blur xong chuyển tab.
function HDVHoTroRow({
  item, pending, onSave, onDelete,
  dnttList, congNoList, canTruByDnttId, rowDnttIds,
  isSelectable, isSelected, onToggleSelect,
  editingId, editAmount, updatePending,
  onOpenModal, onStartEdit, onCancelEdit, onEditAmountChange, onSaveEdit, onOpenCancel, onPrintDntt,
}: {
  item: HDVHoTroItem;
  pending: boolean;
  onSave: (
    id: number,
    payload: { mo_ta: string; so_luong: number; don_gia: number; nguoi_tt: "cong_ty" | "hdv" },
  ) => void;
  onDelete: (id: number) => void;
  dnttList: DnttLite[];
  congNoList: CongNoLite[];
  canTruByDnttId: Record<number, number>;
  rowDnttIds: number[];
  isSelectable: boolean;
  isSelected: boolean;
  onToggleSelect: (checked: boolean) => void;
  editingId: number | null;
  editAmount: string;
  updatePending: boolean;
  onOpenModal: () => void;
  onStartEdit: (id: number, soTien: number) => void;
  onCancelEdit: () => void;
  onEditAmountChange: (v: string) => void;
  onSaveEdit: (id: number) => void;
  onOpenCancel: (target: KhacCancelTarget) => void;
  onPrintDntt: (dnttId: number) => void;
}) {
  const initialNguoiTt = (it: HDVHoTroItem): "cong_ty" | "hdv" =>
    it.tien_hdv > 0 ? "hdv" : it.tien_cong_ty > 0 ? "cong_ty" : "hdv";

  const [moTa, setMoTaState] = useState(item.mo_ta ?? "");
  const [soLuong, setSoLuongState] = useState(item.so_luong);
  const [donGia, setDonGiaState] = useState(item.don_gia);
  const [nguoiTt, setNguoiTtState] = useState<"cong_ty" | "hdv">(initialNguoiTt(item));

  // Ref mirror — sync update để triggerSave luôn đọc giá trị mới nhất.
  const stateRef = useRef({ moTa, soLuong, donGia, nguoiTt });

  const setMoTa = (v: string) => { stateRef.current.moTa = v; setMoTaState(v); };
  const setSoLuong = (v: number) => { stateRef.current.soLuong = v; setSoLuongState(v); };
  const setDonGia = (v: number) => { stateRef.current.donGia = v; setDonGiaState(v); };
  const setNguoiTt = (v: "cong_ty" | "hdv") => { stateRef.current.nguoiTt = v; setNguoiTtState(v); };

  // Re-sync khi item.id đổi (row bị thay) hoặc external update từ refetch.
  // Dùng JSON.stringify để chỉ sync khi data thực sự khác — tránh đè edit chưa save.
  const externalKey = `${item.id}|${item.mo_ta ?? ""}|${item.so_luong}|${item.don_gia}|${item.tien_cong_ty}|${item.tien_hdv}`;
  const lastSyncedKeyRef = useRef(externalKey);
  useEffect(() => {
    if (lastSyncedKeyRef.current !== externalKey) {
      lastSyncedKeyRef.current = externalKey;
      const newNguoi = initialNguoiTt(item);
      stateRef.current = {
        moTa: item.mo_ta ?? "",
        soLuong: item.so_luong,
        donGia: item.don_gia,
        nguoiTt: newNguoi,
      };
      setMoTaState(item.mo_ta ?? "");
      setSoLuongState(item.so_luong);
      setDonGiaState(item.don_gia);
      setNguoiTtState(newNguoi);
    }
  }, [externalKey, item]);

  const triggerSave = () => {
    const s = stateRef.current;
    onSave(item.id, { mo_ta: s.moTa, so_luong: s.soLuong, don_gia: s.donGia, nguoi_tt: s.nguoiTt });
  };

  const handleToggleNguoiTt = () => {
    const next: "cong_ty" | "hdv" = stateRef.current.nguoiTt === "hdv" ? "cong_ty" : "hdv";
    setNguoiTt(next);
    triggerSave();
  };

  const itemMoTa = item.mo_ta ?? "";
  const curNguoiTt = initialNguoiTt(item);
  const isDirty =
    soLuong !== item.so_luong ||
    donGia !== item.don_gia ||
    moTa !== itemMoTa ||
    nguoiTt !== curNguoiTt;
  const thanhTien = soLuong * donGia;

  // ── DNTT derived (chỉ tính cho row nguoi_tt = cong_ty) ───────────────────
  // Lookup theo allocations map (rowDnttIds) — bao gồm cả ĐNTT gộp có ref_id
  // trỏ về row khác trong nhóm.
  const allDntts = dnttList.filter((d) => rowDnttIds.includes(d.id));
  const activeDntts = allDntts.filter(
    (d) => d.trang_thai_duyet !== "da_huy" && d.trang_thai_duyet !== "tu_choi",
  );
  const rejectedDntts = allDntts.filter((d) => d.trang_thai_duyet === "tu_choi");
  const paidDntts = activeDntts.filter((d) => d.payment_status === "paid");
  const pendingDntts = activeDntts.filter((d) => d.payment_status !== "paid");
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

  return (
    <tr className={cn("hover:bg-muted/20", isSelected && "bg-sky-50/60")}>
      <td className="px-2 py-2 text-center align-middle">
        <Checkbox
          checked={isSelected}
          disabled={!isSelectable}
          onCheckedChange={(v) => onToggleSelect(!!v)}
          className="h-3.5 w-3.5"
        />
      </td>
      <td className="px-3 py-2">
        <Input
          type="text"
          value={moTa}
          onChange={(e) => setMoTa(e.target.value)}
          onBlur={triggerSave}
          onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLElement).blur(); }}
          placeholder={t("VD: Công tác phí, Tiền ngủ, ...")}
          className="h-7 text-xs"
        />
      </td>
      <td className="px-4 py-2 text-right">
        <Input
          type="number"
          value={soLuong || ""}
          onChange={(e) => setSoLuong(Number(e.target.value) || 0)}
          onBlur={triggerSave}
          onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLElement).blur(); }}
          className="h-6 text-xs px-1.5 py-0 text-center w-16 ml-auto"
        />
      </td>
      <td className="px-4 py-2 text-right">
        <DecimalInput
          value={donGia}
          onChange={setDonGia}
          onBlur={triggerSave}
          className="h-6 text-xs px-1.5 py-0 text-right w-28 ml-auto"
        />
      </td>
      <td className="px-4 py-2.5 text-right font-medium">
        {fmt(thanhTien)} ₫
        {isDirty && <span className="ml-1 text-[10px] text-amber-600">*</span>}
      </td>
      <td className="px-2 py-2 text-center">
        <button
          onClick={handleToggleNguoiTt}
          disabled={pending}
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
      <td className="px-3 py-2 align-top">
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
                        onChange={(e) => onEditAmountChange(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") onSaveEdit(d.id);
                          if (e.key === "Escape") onCancelEdit();
                        }}
                        className="h-6 w-20 text-xs px-2 py-0" />
                      <Button variant="ghost" size="sm" className="h-5 w-5 p-0 text-emerald-600"
                        disabled={updatePending}
                        onClick={() => onSaveEdit(d.id)}>
                        <Check className="h-3 w-3" />
                      </Button>
                      <Button variant="ghost" size="sm" className="h-5 w-5 p-0 text-muted-foreground"
                        onClick={onCancelEdit}>
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
                      {d.trang_thai_duyet === "cho_duyet" && (
                        <Button variant="ghost" size="sm" className="h-5 w-5 p-0 text-blue-500"
                          title={t("Sửa số tiền")}
                          onClick={() => onStartEdit(d.id, d.so_tien)}>
                          <Pencil className="h-3 w-3" />
                        </Button>
                      )}
                      <Button variant="ghost" size="sm" className="h-5 w-5 p-0 text-emerald-600 hover:text-emerald-700"
                        title={t("In Giấy đề nghị hoàn ứng (Word)")}
                        onClick={() => onPrintDntt(d.id)}>
                        <Printer className="h-3 w-3" />
                      </Button>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </td>

      {/* TT Thanh toán */}
      <td className="px-3 py-2 align-top">
        {nguoiTt === "hdv" ? (
          <span className="text-[10px] text-muted-foreground flex justify-center">—</span>
        ) : (
          <div className="space-y-1.5 flex flex-col items-center">
            {activeDntts.map((d) => (
              <div key={d.id}>
                {d.payment_status === "paid" ? (
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-emerald-100 text-emerald-700 whitespace-nowrap">
                    {t("Đã TT")}
                    {d.thanh_toan_luc ? ` ${new Date(d.thanh_toan_luc).toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit" })}` : ""}
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
      <td className="px-2 py-2">
        <div className="flex items-center gap-1 justify-end">
          {nguoiTt === "cong_ty" && canCancel && activeDntt && (
            <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-destructive hover:text-destructive"
              title={t("Hủy ĐNTT")}
              onClick={() => onOpenCancel({ dnttId: activeDntt.id, isPaid: activeDntt.payment_status === "paid" })}>
              <Ban className="h-3 w-3" />
            </Button>
          )}
          {nguoiTt === "cong_ty" && activeDntts.length === 0 && thanhTien > 0 && (
            <Button variant="outline" size="sm" className="h-6 text-[10px] px-2"
              onClick={onOpenModal}>
              {t("ĐNTT")}
            </Button>
          )}
          <Button
            size="icon" variant="ghost"
            className="h-6 w-6 text-muted-foreground hover:text-destructive"
            onClick={() => onDelete(item.id)}
            disabled={pending}
          >
            <Trash2 className="h-3 w-3" />
          </Button>
        </div>
      </td>
    </tr>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

function HDVDNTTCard({ d, hdv }: { d: HDVDNTTRow; doanId: number; hdv: HDVInfo | null }) {
  const cancelMut = useCancelDNTT();
  const { user } = useAuth();

  const isHuy = d.trang_thai_duyet === "da_huy";
  const isTuChoi = d.trang_thai_duyet === "tu_choi";
  const isDaTT = d.payment_status === "paid";
  const isDaDuyet = d.trang_thai_duyet === "da_duyet";
  const isChoDuyet = d.trang_thai_duyet === "cho_duyet";
  const isQuyetToan = d.ref_loai === "hdv_quyet_toan";

  const handlePrintQuyetToan = async () => {
    if (!d.quyet_toan_data) {
      toast.error(t("Chưa có chi tiết quyết toán. Tạo lại quyết toán với form chi tiết để xuất Excel."));
      return;
    }
    try {
      await exportHDVQuyetToanExcel({
        data: d.quyet_toan_data,
        hdv,
        nguoiDeNghi: user?.ho_ten ?? "",
        ngayLap: d.created_at,
      });
    } catch (e: unknown) {
      toast.error(t("Lỗi xuất Excel: ") + (errMsg(e) || ""));
    }
  };

  return (
    <div className={cn("px-4 py-2.5 flex items-center justify-between gap-3", (isHuy || isTuChoi) && "opacity-50")}>
      <div className="min-w-0 flex-1">
        <p className="text-sm truncate">
          {d.la_thu_hoi ? "⬅ " : ""}{d.mo_ta || (d.la_thu_hoi ? t("Thu hồi tạm ứng") : "—")}
        </p>
        <p className="text-[11px] text-muted-foreground">
          {format(new Date(d.created_at), "dd/MM/yyyy HH:mm")}
          {d.ghi_chu && <span className="ml-2 italic">{d.ghi_chu}</span>}
        </p>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        <span className={cn("text-sm font-semibold", d.la_thu_hoi && "text-blue-600")}>
          {d.la_thu_hoi ? "-" : ""}{fmt(d.so_tien)} ₫{d.la_thu_hoi && <span className="ml-1 text-xs">({t("thu hồi")})</span>}
        </span>
        <HDVStatusBadge d={d} />

        {isQuyetToan && !isHuy && !isTuChoi && (
          <Button
            size="sm" variant="ghost"
            className="h-6 text-xs"
            onClick={handlePrintQuyetToan}
            title={t("In Giấy đề nghị quyết toán (Excel)")}
          >
            <FileText className="h-3 w-3 mr-1" /> {t("In")}
          </Button>
        )}

        {!isHuy && !isTuChoi && !isDaTT && (
          <>
            {(isChoDuyet || isDaDuyet) && (
              <Button
                size="sm" variant="ghost"
                className="h-6 text-xs text-destructive hover:text-destructive"
                onClick={() => cancelMut.mutate({ id: d.id }, { onSuccess: () => toast.success(t("Đã hủy")), onError: (e: unknown) => toast.error(errMsg(e)) })}
                disabled={cancelMut.isPending}
              >
                <Ban className="h-3 w-3 mr-1" /> {t("Hủy")}
              </Button>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function HDVStatusBadge({ d }: { d: HDVDNTTRow }) {
  if (d.trang_thai_duyet === "da_huy")
    return <Badge variant="secondary" className="text-[10px]">{t("Đã hủy")}</Badge>;
  if (d.payment_status === "paid")
    return <Badge className="text-[10px] bg-emerald-100 text-emerald-800 border-emerald-300">{t("Đã thanh toán")}</Badge>;
  switch (d.trang_thai_duyet) {
    case "cho_duyet":
      return <Badge className="text-[10px] bg-yellow-100 text-yellow-800 border-yellow-300">{t("Chờ duyệt")}</Badge>;
    case "da_duyet":
      return <Badge className="text-[10px] bg-teal-100 text-teal-800 border-teal-300">{t("Đã duyệt")}</Badge>;
    case "tu_choi":
      return <Badge variant="destructive" className="text-[10px]">{t("Từ chối")}</Badge>;
    default:
      return null;
  }
}

interface CreateModalProps {
  doanId: number;
  hdvId: number | null;
  refLoai: "hdv_tam_ung" | "hdv_quyet_toan";
  title: string;
  defaultSoTien?: number;
  defaultLaThuHoi?: boolean;
  // Quyết toán context — chỉ dùng cho hdv_quyet_toan
  doan?: HDVDoanInfo;
  tongHdvChi?: number;
  hdv?: HDVInfo | null;  // full info để in file (cần STK + ngân hàng)
  onClose: () => void;
}

function CreateHDVPaymentModal({
  doanId, hdvId, refLoai, title, defaultSoTien, defaultLaThuHoi,
  doan, tongHdvChi, hdv,
  onClose,
}: CreateModalProps) {
  const hdvName = hdv?.ten ?? "";
  const createMut = useCreateHDVPayment();
  const { user } = useAuth();
  const isQT = refLoai === "hdv_quyet_toan";

  // Defaults từ doan
  const soKhachDefault =
    (doan?.so_khach_lon ?? 0) + (doan?.so_khach_em1 ?? 0) +
    (doan?.so_khach_em2 ?? 0) + (doan?.so_khach_tl ?? 0) ||
    doan?.so_khach || 0;
  const soNgayDefault = doan?.ngay_di && doan?.ngay_ve
    ? Math.max(1, Math.ceil((new Date(doan.ngay_ve).getTime() - new Date(doan.ngay_di).getTime()) / 86400000) + 1)
    : 0;
  const coTL = (doan?.so_khach_tl ?? 0) > 0;
  const tipDonGiaDefault = coTL ? 150 : 300;
  const tyGiaDefault = (() => {
    const s = typeof window !== "undefined" ? localStorage.getItem("hdv_ty_gia_ndt") : null;
    return s ? Number(s) : 800;
  })();
  const tongHdvChiVal = tongHdvChi ?? 0;

  // Common state
  const [soTien, setSoTien] = useState(defaultSoTien ?? 0);
  const [moTa, setMoTa] = useState(
    isQT
      ? `${t("Quyết toán HDV")} ${hdvName} ${soKhachDefault}p ${soNgayDefault}`.replace(/\s+/g, " ").trim()
      : t("Tạm ứng cho hướng dẫn viên"),
  );
  const [ghiChu, setGhiChu] = useState("");
  const [laThuHoi, setLaThuHoi] = useState(defaultLaThuHoi ?? false);
  // Default = hôm nay + 2 ngày; null sort xuống cuối list ĐNTT page → user dễ bỏ sót.
  const [ngayCanTT, setNgayCanTT] = useState(format(addDays(new Date(), 2), "yyyy-MM-dd"));

  // Pre-fill từ ChiPhiPhasThuSection (bảng chi phí "Phải thu") — đồng bộ
  // với UI mà OP đã nhập. Tip skip T/L; đầu khách + quỹ VP dùng VND default
  // 200k khi NULL.
  const soKhachTl = doan?.so_khach_tl ?? 0;
  const autoSoKhachKhongTL = Math.max(0, soKhachDefault - soKhachTl);
  const tipSoKhachDefault = doan?.tip_so_khach_override ?? autoSoKhachKhongTL;
  const tipDonGiaResolved = doan?.tip_rate ?? tipDonGiaDefault;
  const dauKhachSoKhachDefault = doan?.dau_khach_so_khach_override ?? 0;
  const dauKhachDonGiaDefault = doan?.dau_khach_rate ?? 200_000;
  const quyVpDonGiaDefault = doan?.quy_vp_amount ?? 200_000;

  // Quyết toán state (7 fields theo form S8 BM02.1-20)
  const [tamUng, setTamUng] = useState(0);
  const [thuTrachNhiem, setThuTrachNhiem] = useState(0);
  const [tipSoKhach, setTipSoKhach] = useState(tipSoKhachDefault);
  const [tipDonGia, setTipDonGia] = useState(tipDonGiaResolved);
  const [tipTyGia, setTipTyGia] = useState(tyGiaDefault);
  const [dauKhachSoKhach, setDauKhachSoKhach] = useState(dauKhachSoKhachDefault);
  const [dauKhachDonGia, setDauKhachDonGia] = useState(dauKhachDonGiaDefault);
  const [quyVpSoLuong, setQuyVpSoLuong] = useState(1);
  const [quyVpDonGia, setQuyVpDonGia] = useState(quyVpDonGiaDefault);
  const [thuBanOp, setThuBanOp] = useState(0);
  const [thuKhac, setThuKhac] = useState(0);

  // Auto-compute
  // Tip = số khách × đơn giá NT/khách/ngày × số ngày × tỷ giá
  const thuTipVnd = tipSoKhach * tipDonGia * soNgayDefault * tipTyGia;
  const thuDauKhachVnd = dauKhachSoKhach * dauKhachDonGia;
  const thuQuyVpVnd = quyVpSoLuong * quyVpDonGia;
  const tongThu = tamUng + thuTrachNhiem + thuTipVnd + thuDauKhachVnd + thuQuyVpVnd + thuBanOp + thuKhac;
  const conPhaiThanhToan = tongHdvChiVal - tongThu;

  // Auto-sync ĐNTT với |conPhaiThanhToan| trong QT mode. Mỗi khi quyết toán field
  // đổi (tongHdvChi/tip/đầu khách/...), soTien + laThuHoi tự cập nhật. User vẫn
  // có thể sửa ĐNTT tay — override stick cho tới khi field QT đổi tiếp.
  useEffect(() => {
    if (!isQT) return;
    setSoTien(Math.abs(conPhaiThanhToan));
    setLaThuHoi(conPhaiThanhToan < 0);
  }, [conPhaiThanhToan, isQT]);

  const buildQuyetToanData = () => ({
    tam_ung: tamUng,
    thu_trach_nhiem: thuTrachNhiem,
    thu_tip: { so_khach: tipSoKhach, don_gia_nt: tipDonGia, ty_gia: tipTyGia },
    thu_dau_khach: { so_khach: dauKhachSoKhach, don_gia: dauKhachDonGia },
    thu_quy_vp: { so_luong: quyVpSoLuong, don_gia: quyVpDonGia },
    thu_ban_op: thuBanOp,
    thu_khac: thuKhac,
    tong_hdv_chi: tongHdvChiVal,
    ma_doan: doan?.ten_doan ?? "",
    ten_hdv: hdvName,
    so_khach_doan: soKhachDefault,
    so_ngay_doan: soNgayDefault,
    ten_nguoi_de_nghi: hdvName,
  });

  const handleSubmit = async () => {
    if (soTien <= 0) { toast.error(t("Số tiền phải lớn hơn 0")); return; }
    try {
      await createMut.mutateAsync({
        doanId, hdvId, refLoai, soTien, laThuHoi, moTa,
        ghiChu: ghiChu || undefined,
        quyetToanData: isQT ? buildQuyetToanData() : null,
        ngayCanThanhToan: ngayCanTT || null,
      });
      toast.success(t("Đã tạo đề nghị thanh toán"));
      onClose();
    } catch (e: unknown) {
      toast.error(errMsg(e) || t("Lỗi tạo đề nghị TT"));
    }
  };

  const handleExport = async () => {
    if (!isQT) return;
    try {
      await exportHDVQuyetToanExcel({
        data: buildQuyetToanData(),
        hdv: hdv ?? null,
        nguoiDeNghi: user?.ho_ten ?? "",
      });
      toast.success(t("Đã xuất file Excel"));
    } catch (e: unknown) {
      toast.error(t("Lỗi xuất Excel: ") + (errMsg(e) || ""));
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className={cn(isQT ? "max-w-2xl max-h-[90vh] overflow-y-auto" : "max-w-md")}>
        <DialogHeader><DialogTitle>{title}</DialogTitle></DialogHeader>
        <div className="space-y-4 pt-2">
          {/* Chi tiết quyết toán (form S8 BM02.1-20) */}
          {isQT && (
            <div className="border border-border rounded-lg p-3 space-y-3 bg-muted/30">
              <p className="text-xs font-semibold text-muted-foreground uppercase">
                {t("Chi tiết quyết toán (Form S8)")}
              </p>

              <div className="grid grid-cols-2 gap-3 text-xs">
                <div>
                  <Label className="text-[11px] text-muted-foreground">{t("Mã đoàn")}</Label>
                  <p className="font-medium">{doan?.ten_doan || "—"}</p>
                </div>
                <div>
                  <Label className="text-[11px] text-muted-foreground">HDV</Label>
                  <p className="font-medium">{hdvName || "—"}</p>
                </div>
                <div>
                  <Label className="text-[11px] text-muted-foreground">{t("Số khách")}</Label>
                  <p className="font-medium">{soKhachDefault}</p>
                </div>
                <div>
                  <Label className="text-[11px] text-muted-foreground">{t("Số ngày")}</Label>
                  <p className="font-medium">{soNgayDefault}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs">
                <NumberField label={t("Tạm ứng")} value={tamUng} onChange={setTamUng} />
                <NumberField label={t("Thu tiền trách nhiệm")} value={thuTrachNhiem} onChange={setThuTrachNhiem} />
              </div>

              {/* Tip — NT/khách/ngày × số khách × số ngày × tỷ giá */}
              <div className="space-y-1.5">
                <Label className="text-[11px] text-muted-foreground">{t("Thu tiền tip")}</Label>
                <div className="grid grid-cols-4 gap-1.5">
                  <Input
                    type="number" min={0} className="h-7 text-xs"
                    value={tipSoKhach || ""} onChange={(e) => setTipSoKhach(Number(e.target.value) || 0)}
                    placeholder={t("SL khách")}
                  />
                  <Input
                    type="number" min={0} className="h-7 text-xs"
                    value={tipDonGia || ""} onChange={(e) => setTipDonGia(Number(e.target.value) || 0)}
                    placeholder={t("ĐG NT/khách/ngày")}
                  />
                  <Input
                    type="number" min={0} className="h-7 text-xs"
                    value={tipTyGia || ""} onChange={(e) => setTipTyGia(Number(e.target.value) || 0)}
                    placeholder={t("Tỷ giá")}
                  />
                  <p className="h-7 text-xs flex items-center justify-end font-semibold text-emerald-700">
                    {fmt(thuTipVnd)} ₫
                  </p>
                </div>
                <p className="text-[10px] text-muted-foreground">
                  {tipSoKhach} × {tipDonGia} NT × {soNgayDefault} {t("ngày")} × {tipTyGia} = {fmt(thuTipVnd)} ₫
                </p>
              </div>

              {/* Đầu khách */}
              <div className="space-y-1.5">
                <Label className="text-[11px] text-muted-foreground">{t("Thu tiền đầu khách")}</Label>
                <div className="grid grid-cols-3 gap-1.5">
                  <Input
                    type="number" min={0} className="h-7 text-xs"
                    value={dauKhachSoKhach || ""} onChange={(e) => setDauKhachSoKhach(Number(e.target.value) || 0)}
                    placeholder={t("SL khách")}
                  />
                  <Input
                    type="number" min={0} className="h-7 text-xs"
                    value={dauKhachDonGia || ""} onChange={(e) => setDauKhachDonGia(Number(e.target.value) || 0)}
                    placeholder={t("ĐG")}
                  />
                  <p className="h-7 text-xs flex items-center justify-end font-semibold text-emerald-700">
                    {fmt(thuDauKhachVnd)} ₫
                  </p>
                </div>
              </div>

              {/* Quỹ VP */}
              <div className="space-y-1.5">
                <Label className="text-[11px] text-muted-foreground">{t("Thu tiền quỹ văn phòng")}</Label>
                <div className="grid grid-cols-3 gap-1.5">
                  <Input
                    type="number" min={0} className="h-7 text-xs"
                    value={quyVpSoLuong || ""} onChange={(e) => setQuyVpSoLuong(Number(e.target.value) || 0)}
                    placeholder={t("SL")}
                  />
                  <Input
                    type="number" min={0} className="h-7 text-xs"
                    value={quyVpDonGia || ""} onChange={(e) => setQuyVpDonGia(Number(e.target.value) || 0)}
                    placeholder={t("ĐG")}
                  />
                  <p className="h-7 text-xs flex items-center justify-end font-semibold text-emerald-700">
                    {fmt(thuQuyVpVnd)} ₫
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs">
                <NumberField label={t("Thu tiền bán OP")} value={thuBanOp} onChange={setThuBanOp} />
                <NumberField label={t("Thu khác")} value={thuKhac} onChange={setThuKhac} />
              </div>

              {/* Tổng + Còn phải thanh toán */}
              <div className="border-t border-border pt-2 space-y-1 text-xs">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{t("Tổng quyết toán (HDV chi):")}</span>
                  <span className="font-semibold">{fmt(tongHdvChiVal)} ₫</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{t("Tổng thu:")}</span>
                  <span className="font-semibold text-emerald-700">{fmt(tongThu)} ₫</span>
                </div>
                <div className="flex justify-between border-t border-border pt-1">
                  <span className="font-semibold">
                    {conPhaiThanhToan >= 0 ? t("Công ty còn phải trả HDV:") : t("HDV phải trả lại công ty:")}
                  </span>
                  <span className={cn(
                    "font-bold",
                    conPhaiThanhToan > 0 ? "text-orange-600" : conPhaiThanhToan < 0 ? "text-blue-600" : "",
                  )}>
                    {conPhaiThanhToan < 0 ? "-" : ""}{fmt(Math.abs(conPhaiThanhToan))} ₫
                  </span>
                </div>
                <p className="text-[10px] text-muted-foreground italic">
                  {t("Số tiền ĐNTT bên dưới tự đồng bộ với giá trị này.")}
                </p>
              </div>
            </div>
          )}

          <div className="space-y-1.5">
            <Label className="text-xs">{t("Mô tả")}</Label>
            <Input className="h-8 text-sm" value={moTa} onChange={(e) => setMoTa(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">{t("Số tiền ĐNTT (VND)")}</Label>
            <Input
              className="h-8 text-sm" type="number" min={0}
              value={soTien || ""} onChange={(e) => setSoTien(Number(e.target.value))}
              placeholder={t("VD: 5000000")}
            />
            {soTien > 0 && <p className="text-[11px] text-muted-foreground">{fmt(soTien)} ₫</p>}
          </div>
          {isQT && (
            <>
              <div className="space-y-1.5">
                <Label className="text-xs">{t("Ngày cần thanh toán")}</Label>
                <Input
                  className="h-8 text-sm" type="date"
                  value={ngayCanTT} onChange={(e) => setNgayCanTT(e.target.value)}
                />
              </div>
              <div className="flex items-center gap-2">
                <Checkbox id="la-thu-hoi" checked={laThuHoi} onCheckedChange={(v) => setLaThuHoi(!!v)} />
                <Label htmlFor="la-thu-hoi" className="text-xs cursor-pointer">
                  {t("HDV hoàn lại tiền (thu hồi tạm ứng thừa)")}
                </Label>
              </div>
            </>
          )}
          <div className="space-y-1.5">
            <Label className="text-xs">{t("Ghi chú")}</Label>
            <Textarea
              className="text-sm min-h-[60px] resize-none" value={ghiChu}
              onChange={(e) => setGhiChu(e.target.value)} placeholder={t("Ghi chú thêm (nếu có)...")}
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" size="sm" onClick={onClose}>{t("Hủy")}</Button>
            {isQT && (
              <Button variant="outline" size="sm" onClick={handleExport} className="gap-1">
                <FileDown className="h-3.5 w-3.5" />
                {t("In file Excel")}
              </Button>
            )}
            <Button size="sm" onClick={handleSubmit} disabled={createMut.isPending}>
              {createMut.isPending ? t("Đang tạo...") : t("Tạo")}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function NumberField({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div className="space-y-1">
      <Label className="text-[11px] text-muted-foreground">{label}</Label>
      <Input
        type="number" min={0} className="h-7 text-xs"
        value={value || ""}
        onChange={(e) => onChange(Number(e.target.value) || 0)}
        placeholder="0"
      />
    </div>
  );
}
