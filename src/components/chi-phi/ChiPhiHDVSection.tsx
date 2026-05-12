import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { Plus, Ban, Trash2, Printer } from "lucide-react";
import HDVPreviewModal from "./HDVPreviewModal";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DecimalInput } from "@/components/ui/decimal-input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  useChiPhiHDVSection,
  useCreateHDVPayment,
  useCancelDNTT,
  type HDVDNTTRow,
  type HDVHoTroItem,
} from "@/hooks/use-chi-phi-hdv";
import { useUpsertChiPhi, useDeleteChiPhi } from "@/hooks/use-chi-phi";
import { cn } from "@/lib/utils";

const fmt = (n: number) => n.toLocaleString("vi-VN");

interface Props {
  doanId: number;
  doan?: any;
}

// Tính "Phải thu HDV" mặc định (giống logic mặc định ChiPhiPhasThuSection)
function computeHdvPhaiThuVND(doan: any | undefined): number {
  if (!doan) return 0;
  const soKhach =
    (doan.so_khach_lon ?? 0) + (doan.so_khach_em1 ?? 0) +
    (doan.so_khach_em2 ?? 0) + (doan.so_khach_tl ?? 0) ||
    doan.so_khach || 0;
  const soNgay = doan.ngay_di && doan.ngay_ve
    ? Math.max(1, Math.ceil((new Date(doan.ngay_ve).getTime() - new Date(doan.ngay_di).getTime()) / 86400000) + 1)
    : 0;
  if (!soKhach || !soNgay) return 0;
  const coTL = (doan.so_khach_tl ?? 0) > 0;
  const tipDonGia = coTL ? 150 : 300;
  const tyGiaStr = typeof window !== "undefined" ? localStorage.getItem("hdv_ty_gia_ndt") : null;
  const tyGia = tyGiaStr ? Number(tyGiaStr) : 800;
  return soKhach * soNgay * tipDonGia * tyGia;
}

export default function ChiPhiHDVSection({ doanId, doan }: Props) {
  const { data, isLoading } = useChiPhiHDVSection(doanId);
  const [showTamUng, setShowTamUng] = useState(false);
  const [showQuyetToan, setShowQuyetToan] = useState(false);
  const [showPreview, setShowPreview] = useState(false);

  const hdvPhaiThuVND = computeHdvPhaiThuVND(doan);
  // Net = (chi vendor + HDV ứng hỗ trợ) − tạm ứng đã trả − phải thu (HDV tự thu tip).
  // > 0: HDV đã chi vượt thu → công ty còn phải trả lại. < 0: HDV thu nhiều hơn chi → HDV trả lại công ty.

  if (isLoading) {
    return <div className="text-sm text-muted-foreground py-4">Đang tải...</div>;
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
      <div className="rounded-lg border border-border overflow-hidden">
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
              <p className="text-xs text-muted-foreground italic">Chưa chỉ định HDV</p>
            )}

            {(tongHdvChi > 0 || tongHoTroHDV > 0 || hdvPhaiThuVND > 0) && (
              <div className="flex gap-4 flex-wrap">
                {tongHdvChi > 0 && (
                  <div>
                    <p className="text-[11px] text-muted-foreground">Tổng HDV chi</p>
                    <p className="text-sm font-semibold">{fmt(tongHdvChi)} ₫</p>
                  </div>
                )}
                {hdvPhaiThuVND > 0 && (
                  <div>
                    <p className="text-[11px] text-muted-foreground">Phải thu HDV</p>
                    <p className="text-sm font-semibold text-amber-600">{fmt(hdvPhaiThuVND)} ₫</p>
                  </div>
                )}
                {tamUngDaTT > 0 && (
                  <div>
                    <p className="text-[11px] text-muted-foreground">Đã tạm ứng</p>
                    <p className="text-sm font-semibold text-emerald-600">{fmt(tamUngDaTT)} ₫</p>
                  </div>
                )}
                <div>
                  <p className="text-[11px] text-muted-foreground">
                    {netConPhaiTra > 0 ? "Công ty còn phải trả" : netConPhaiTra < 0 ? "HDV phải trả lại" : "Đã đủ"}
                  </p>
                  <p className={cn(
                    "text-sm font-semibold",
                    netConPhaiTra > 0 ? "text-orange-600" : netConPhaiTra < 0 ? "text-blue-600" : "text-emerald-600",
                  )}>
                    {fmt(Math.abs(netConPhaiTra))} ₫
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Buttons */}
          <div className="flex gap-2 shrink-0 flex-wrap">
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setShowPreview(true)}>
              <Printer className="h-3 w-3 mr-1" /> In thống kê
            </Button>
            {!daQuyetToan && (
              <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setShowTamUng(true)}>
                <Plus className="h-3 w-3 mr-1" /> Tạm ứng
              </Button>
            )}
            {(tamUngList.length > 0 || tongHdvChi > 0 || tongHoTroHDV > 0) && (
              <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setShowQuyetToan(true)}>
                <Plus className="h-3 w-3 mr-1" /> Quyết toán
              </Button>
            )}
          </div>
        </div>

        {/* Danh sách tạm ứng */}
        {tamUngList.length > 0 && (
          <div className="border-b border-border">
            <div className="px-4 py-1.5 bg-muted/20">
              <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Tạm ứng</p>
            </div>
            <div className="divide-y divide-border">
              {tamUngList.map((d) => (
                <HDVDNTTCard key={d.id} d={d} doanId={doanId} />
              ))}
            </div>
          </div>
        )}

        {/* Danh sách quyết toán */}
        {quyetToanList.length > 0 && (
          <div>
            <div className="px-4 py-1.5 bg-muted/20 border-b border-border">
              <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Quyết toán</p>
            </div>
            <div className="divide-y divide-border">
              {quyetToanList.map((d) => (
                <HDVDNTTCard key={d.id} d={d} doanId={doanId} />
              ))}
            </div>
          </div>
        )}

        {/* Empty state nếu chưa có gì */}
        {tamUngList.length === 0 && quyetToanList.length === 0 && (
          <p className="px-4 py-3 text-sm text-muted-foreground">Chưa có tạm ứng hoặc quyết toán.</p>
        )}
      </div>

      {/* ── Chi phí công ty hỗ trợ HDV ── */}
      <HoTroHDVTable doanId={doanId} hoTroItems={hoTroItems} />

      {/* Modals */}
      {showTamUng && (
        <CreateHDVPaymentModal
          doanId={doanId}
          hdvId={hdv?.id ?? null}
          refLoai="hdv_tam_ung"
          title="Tạo tạm ứng HDV"
          onClose={() => setShowTamUng(false)}
        />
      )}
      {showQuyetToan && (
        <CreateHDVPaymentModal
          doanId={doanId}
          hdvId={hdv?.id ?? null}
          refLoai="hdv_quyet_toan"
          title="Tạo quyết toán HDV"
          defaultSoTien={Math.abs(netConPhaiTra)}
          defaultLaThuHoi={netConPhaiTra < 0}
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

// ── Chi phí công ty hỗ trợ HDV ───────────────────────────────────────────────

function HoTroHDVTable({ doanId, hoTroItems }: {
  doanId: number;
  hoTroItems: HDVHoTroItem[];
}) {
  const qc = useQueryClient();
  const upsertMut = useUpsertChiPhi();
  const deleteMut = useDeleteChiPhi();
  type EditCell = { so_luong: number; don_gia: number; mo_ta: string; nguoi_tt: "cong_ty" | "hdv" };
  const [editRow, setEditRow] = useState<Record<number, EditCell>>({});
  const [addingRow, setAddingRow] = useState(false);

  const invalidate = () => qc.invalidateQueries({ queryKey: ["chi_phi_hdv_section", doanId] });

  // Default người trả: HDV (HDV ứng tiền trước, công ty hoàn lại sau)
  const resolveNguoiTt = (item: HDVHoTroItem): "cong_ty" | "hdv" =>
    item.tien_hdv > 0 ? "hdv" : (item.tien_cong_ty > 0 ? "cong_ty" : "hdv");

  const getLocal = (item: HDVHoTroItem): EditCell =>
    editRow[item.id] ?? {
      so_luong: item.so_luong,
      don_gia: item.don_gia,
      mo_ta: item.mo_ta ?? "",
      nguoi_tt: resolveNguoiTt(item),
    };

  const updateLocal = (id: number, patch: Partial<EditCell>) =>
    setEditRow((prev) => {
      const base = hoTroItems.find((r) => r.id === id);
      const cur = prev[id] ?? (base ? {
        so_luong: base.so_luong, don_gia: base.don_gia,
        mo_ta: base.mo_ta ?? "", nguoi_tt: resolveNguoiTt(base),
      } : { so_luong: 1, don_gia: 0, mo_ta: "", nguoi_tt: "hdv" as const });
      return { ...prev, [id]: { ...cur, ...patch } };
    });

  const handleNumChange = (id: number, field: "so_luong" | "don_gia", val: number) =>
    updateLocal(id, { [field]: val });

  const handleMoTaChange = (id: number, val: string) => updateLocal(id, { mo_ta: val });

  const handleToggleNguoiTt = (item: HDVHoTroItem) => {
    const cur = getLocal(item).nguoi_tt;
    const next: "cong_ty" | "hdv" = cur === "hdv" ? "cong_ty" : "hdv";
    const tien = (getLocal(item).so_luong) * (getLocal(item).don_gia);
    // Save ngay khi toggle để cả số tiền đi đúng cột (tránh user toggle xong quên blur)
    upsertMut.mutate({
      id: item.id, doan_id: doanId,
      tien_cong_ty: next === "cong_ty" ? tien : 0,
      tien_hdv: next === "hdv" ? tien : 0,
    } as any, {
      onSuccess: () => {
        setEditRow((prev) => { const n = { ...prev }; delete n[item.id]; return n; });
        invalidate();
      },
    });
  };

  const handleSave = (item: HDVHoTroItem) => {
    const local = editRow[item.id];
    if (!local) return;
    const itemMoTa = item.mo_ta ?? "";
    const curNguoiTt = resolveNguoiTt(item);
    if (local.so_luong === item.so_luong
        && local.don_gia === item.don_gia
        && local.mo_ta === itemMoTa
        && local.nguoi_tt === curNguoiTt) {
      setEditRow((prev) => { const n = { ...prev }; delete n[item.id]; return n; });
      return;
    }
    const tien = local.so_luong * local.don_gia;
    upsertMut.mutate({
      id: item.id, doan_id: doanId,
      so_luong: local.so_luong, don_gia: local.don_gia,
      mo_ta: local.mo_ta || null,
      tien_cong_ty: local.nguoi_tt === "cong_ty" ? tien : 0,
      tien_hdv: local.nguoi_tt === "hdv" ? tien : 0,
    } as any, {
      onSuccess: () => {
        setEditRow((prev) => { const n = { ...prev }; delete n[item.id]; return n; });
        invalidate();
      },
    });
  };

  const handleDelete = (item: HDVHoTroItem) => {
    deleteMut.mutate({ id: item.id, doanId }, {
      onSuccess: () => { invalidate(); toast.success("Đã xóa"); },
      onError: (e: any) => toast.error(e?.message || "Lỗi xóa"),
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
      } as any);
      invalidate();
    } catch {
      toast.error("Lỗi khi thêm");
    } finally {
      setAddingRow(false);
    }
  };

  return (
    <div className="rounded-lg border border-border overflow-hidden">
      <div className="px-4 py-2 bg-sky-50 border-b border-sky-100 flex items-center justify-between">
        <p className="text-xs font-semibold text-sky-800 uppercase tracking-wide">
          Hướng dẫn viên
        </p>
        <Button size="sm" variant="outline" className="h-6 text-xs" onClick={handleAdd} disabled={addingRow}>
          <Plus className="h-3 w-3 mr-1" /> Thêm
        </Button>
      </div>
      {hoTroItems.length === 0 ? (
        <p className="px-4 py-3 text-sm text-muted-foreground">Chưa có khoản hỗ trợ nào. Nhấn "+ Thêm" để thêm.</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/20">
              <th className="text-left px-4 py-2 text-xs font-medium text-muted-foreground">Loại</th>
              <th className="text-right px-4 py-2 text-xs font-medium text-muted-foreground w-24">SL</th>
              <th className="text-right px-4 py-2 text-xs font-medium text-muted-foreground w-32">Đơn giá</th>
              <th className="text-right px-4 py-2 text-xs font-medium text-muted-foreground w-32">Thành tiền</th>
              <th className="text-center px-2 py-2 text-xs font-medium text-muted-foreground w-20">Ai trả</th>
              <th className="w-8" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {hoTroItems.map((item) => {
              const local = getLocal(item);
              const isDirty = editRow[item.id] !== undefined;
              return (
                <tr key={item.id} className="hover:bg-muted/20">
                  <td className="px-3 py-2">
                    <Input
                      type="text"
                      value={local.mo_ta}
                      onChange={(e) => handleMoTaChange(item.id, e.target.value)}
                      onBlur={() => handleSave(item)}
                      onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLElement).blur(); }}
                      placeholder="VD: Công tác phí, Tiền ngủ, ..."
                      className="h-7 text-xs"
                    />
                  </td>
                  <td className="px-4 py-2 text-right">
                    <Input
                      type="number"
                      value={local.so_luong || ""}
                      onChange={(e) => handleNumChange(item.id, "so_luong", Number(e.target.value) || 0)}
                      onBlur={() => handleSave(item)}
                      onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLElement).blur(); }}
                      className="h-6 text-xs px-1.5 py-0 text-center w-16 ml-auto"
                    />
                  </td>
                  <td className="px-4 py-2 text-right">
                    <DecimalInput
                      value={local.don_gia}
                      onChange={(v) => handleNumChange(item.id, "don_gia", v)}
                      onBlur={() => handleSave(item)}
                      className="h-6 text-xs px-1.5 py-0 text-right w-28 ml-auto"
                    />
                  </td>
                  <td className="px-4 py-2.5 text-right font-medium">
                    {fmt(local.so_luong * local.don_gia)} ₫
                    {isDirty && <span className="ml-1 text-[10px] text-amber-600">*</span>}
                  </td>
                  <td className="px-2 py-2 text-center">
                    <button
                      onClick={() => handleToggleNguoiTt(item)}
                      disabled={upsertMut.isPending}
                      className={cn(
                        "px-1.5 py-0.5 rounded text-[10px] font-medium cursor-pointer transition-colors border",
                        local.nguoi_tt === "cong_ty"
                          ? "bg-blue-50 text-blue-600 hover:bg-blue-100 border-blue-200"
                          : "bg-amber-50 text-amber-600 hover:bg-amber-100 border-amber-200"
                      )}
                    >
                      {local.nguoi_tt === "cong_ty" ? "Công ty" : "HDV"}
                    </button>
                  </td>
                  <td className="px-2 py-2 text-right">
                    <Button
                      size="icon" variant="ghost"
                      className="h-6 w-6 text-muted-foreground hover:text-destructive"
                      onClick={() => handleDelete(item)}
                      disabled={deleteMut.isPending}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

function HDVDNTTCard({ d }: { d: HDVDNTTRow; doanId: number }) {
  const cancelMut = useCancelDNTT();

  const isHuy = d.trang_thai_duyet === "da_huy";
  const isTuChoi = d.trang_thai_duyet === "tu_choi";
  const isDaTT = d.payment_status === "paid";
  const isDaDuyet = d.trang_thai_duyet === "da_duyet";
  const isChoDuyet = d.trang_thai_duyet === "cho_duyet";

  return (
    <div className={cn("px-4 py-2.5 flex items-center justify-between gap-3", (isHuy || isTuChoi) && "opacity-50")}>
      <div className="min-w-0 flex-1">
        <p className="text-sm truncate">
          {d.la_thu_hoi ? "⬅ " : ""}{d.mo_ta || (d.la_thu_hoi ? "Thu hồi tạm ứng" : "—")}
        </p>
        <p className="text-[11px] text-muted-foreground">
          {format(new Date(d.created_at), "dd/MM/yyyy HH:mm")}
          {d.ghi_chu && <span className="ml-2 italic">{d.ghi_chu}</span>}
        </p>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        <span className="text-sm font-semibold">
          {fmt(d.so_tien)} ₫{d.la_thu_hoi && <span className="ml-1 text-xs text-blue-600">(thu hồi)</span>}
        </span>
        <HDVStatusBadge d={d} />

        {!isHuy && !isTuChoi && !isDaTT && (
          <>
            {(isChoDuyet || isDaDuyet) && (
              <Button
                size="sm" variant="ghost"
                className="h-6 text-xs text-destructive hover:text-destructive"
                onClick={() => cancelMut.mutate({ id: d.id }, { onSuccess: () => toast.success("Đã hủy"), onError: (e: any) => toast.error(e?.message) })}
                disabled={cancelMut.isPending}
              >
                <Ban className="h-3 w-3 mr-1" /> Hủy
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
    return <Badge variant="secondary" className="text-[10px]">Đã hủy</Badge>;
  if (d.payment_status === "paid")
    return <Badge className="text-[10px] bg-emerald-100 text-emerald-800 border-emerald-300">Đã thanh toán</Badge>;
  switch (d.trang_thai_duyet) {
    case "cho_duyet":
      return <Badge className="text-[10px] bg-yellow-100 text-yellow-800 border-yellow-300">Chờ duyệt</Badge>;
    case "da_duyet":
      return <Badge className="text-[10px] bg-teal-100 text-teal-800 border-teal-300">Đã duyệt</Badge>;
    case "tu_choi":
      return <Badge variant="destructive" className="text-[10px]">Từ chối</Badge>;
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
  onClose: () => void;
}

function CreateHDVPaymentModal({
  doanId, hdvId, refLoai, title, defaultSoTien, defaultLaThuHoi, onClose,
}: CreateModalProps) {
  const createMut = useCreateHDVPayment();
  const [soTien, setSoTien] = useState(defaultSoTien ?? 0);
  const [moTa, setMoTa] = useState(
    refLoai === "hdv_tam_ung" ? "Tạm ứng cho hướng dẫn viên" : "Quyết toán hướng dẫn viên",
  );
  const [ghiChu, setGhiChu] = useState("");
  const [laThuHoi, setLaThuHoi] = useState(defaultLaThuHoi ?? false);

  const handleSubmit = async () => {
    if (soTien <= 0) { toast.error("Số tiền phải lớn hơn 0"); return; }
    try {
      await createMut.mutateAsync({ doanId, hdvId, refLoai, soTien, laThuHoi, moTa, ghiChu: ghiChu || undefined });
      toast.success("Đã tạo đề nghị thanh toán");
      onClose();
    } catch (e: any) {
      toast.error(e?.message || "Lỗi tạo đề nghị TT");
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>{title}</DialogTitle></DialogHeader>
        <div className="space-y-4 pt-2">
          <div className="space-y-1.5">
            <Label className="text-xs">Mô tả</Label>
            <Input className="h-8 text-sm" value={moTa} onChange={(e) => setMoTa(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Số tiền (VND)</Label>
            <Input
              className="h-8 text-sm" type="number" min={0}
              value={soTien || ""} onChange={(e) => setSoTien(Number(e.target.value))}
              placeholder="VD: 5000000"
            />
            {soTien > 0 && <p className="text-[11px] text-muted-foreground">{fmt(soTien)} ₫</p>}
          </div>
          {refLoai === "hdv_quyet_toan" && (
            <div className="flex items-center gap-2">
              <Checkbox id="la-thu-hoi" checked={laThuHoi} onCheckedChange={(v) => setLaThuHoi(!!v)} />
              <Label htmlFor="la-thu-hoi" className="text-xs cursor-pointer">
                HDV hoàn lại tiền (thu hồi tạm ứng thừa)
              </Label>
            </div>
          )}
          <div className="space-y-1.5">
            <Label className="text-xs">Ghi chú</Label>
            <Textarea
              className="text-sm min-h-[60px] resize-none" value={ghiChu}
              onChange={(e) => setGhiChu(e.target.value)} placeholder="Ghi chú thêm (nếu có)..."
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" size="sm" onClick={onClose}>Hủy</Button>
            <Button size="sm" onClick={handleSubmit} disabled={createMut.isPending}>
              {createMut.isPending ? "Đang tạo..." : "Tạo"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
