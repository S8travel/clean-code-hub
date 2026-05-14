import { useState, useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { format, addDays } from "date-fns";
import { Plus, Ban, Trash2, Printer, FileText, FileDown } from "lucide-react";
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
  type HDVInfo,
} from "@/hooks/use-chi-phi-hdv";
import { useUpsertChiPhi, useDeleteChiPhi } from "@/hooks/use-chi-phi";
import { cn } from "@/lib/utils";
import { exportHDVQuyetToanExcel } from "@/lib/export-hdv-quyet-toan-excel";

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
                    {netConPhaiTra < 0 ? "-" : ""}{fmt(Math.abs(netConPhaiTra))} ₫
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
                <HDVDNTTCard key={d.id} d={d} doanId={doanId} hdv={hdv} />
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
                <HDVDNTTCard key={d.id} d={d} doanId={doanId} hdv={hdv} />
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

// ── Chi phí công ty hỗ trợ HDV ───────────────────────────────────────────────

function HoTroHDVTable({ doanId, hoTroItems }: {
  doanId: number;
  hoTroItems: HDVHoTroItem[];
}) {
  const qc = useQueryClient();
  const upsertMut = useUpsertChiPhi();
  const deleteMut = useDeleteChiPhi();
  const [addingRow, setAddingRow] = useState(false);

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
    } as any, { onSuccess: () => invalidate() });
  };

  const handleDelete = (id: number) => {
    deleteMut.mutate({ id, doanId }, {
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
              <th className="text-center px-2 py-2 text-xs font-medium text-muted-foreground w-20">Nguồn</th>
              <th className="w-8" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {hoTroItems.map((item) => (
              <HDVHoTroRow
                key={item.id}
                item={item}
                pending={upsertMut.isPending || deleteMut.isPending}
                onSave={handleSaveRow}
                onDelete={handleDelete}
              />
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

// Row hỗ trợ HDV — local state với ref mirror.
// Lift state vào row giúp keystroke không re-render bảng. Ref mirror đảm bảo
// triggerSave (gọi qua setTimeout từ DecimalInput.onBlur) đọc value mới nhất,
// không bị stale closure khi user blur xong chuyển tab.
function HDVHoTroRow({
  item, pending, onSave, onDelete,
}: {
  item: HDVHoTroItem;
  pending: boolean;
  onSave: (
    id: number,
    payload: { mo_ta: string; so_luong: number; don_gia: number; nguoi_tt: "cong_ty" | "hdv" },
  ) => void;
  onDelete: (id: number) => void;
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

  return (
    <tr className="hover:bg-muted/20">
      <td className="px-3 py-2">
        <Input
          type="text"
          value={moTa}
          onChange={(e) => setMoTa(e.target.value)}
          onBlur={triggerSave}
          onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLElement).blur(); }}
          placeholder="VD: Công tác phí, Tiền ngủ, ..."
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
          {nguoiTt === "cong_ty" ? "Công ty" : "HDV"}
        </button>
      </td>
      <td className="px-2 py-2 text-right">
        <Button
          size="icon" variant="ghost"
          className="h-6 w-6 text-muted-foreground hover:text-destructive"
          onClick={() => onDelete(item.id)}
          disabled={pending}
        >
          <Trash2 className="h-3 w-3" />
        </Button>
      </td>
    </tr>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

function HDVDNTTCard({ d, hdv }: { d: HDVDNTTRow; doanId: number; hdv: HDVInfo | null }) {
  const cancelMut = useCancelDNTT();

  const isHuy = d.trang_thai_duyet === "da_huy";
  const isTuChoi = d.trang_thai_duyet === "tu_choi";
  const isDaTT = d.payment_status === "paid";
  const isDaDuyet = d.trang_thai_duyet === "da_duyet";
  const isChoDuyet = d.trang_thai_duyet === "cho_duyet";
  const isQuyetToan = d.ref_loai === "hdv_quyet_toan";

  const handlePrintQuyetToan = () => {
    if (!d.quyet_toan_data) {
      toast.error("Chưa có chi tiết quyết toán. Tạo lại quyết toán với form chi tiết để xuất Excel.");
      return;
    }
    try {
      exportHDVQuyetToanExcel({
        data: d.quyet_toan_data,
        hdv,
        ngayLap: d.created_at,
      });
    } catch (e: any) {
      toast.error("Lỗi xuất Excel: " + (e?.message || ""));
    }
  };

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
        <span className={cn("text-sm font-semibold", d.la_thu_hoi && "text-blue-600")}>
          {d.la_thu_hoi ? "-" : ""}{fmt(d.so_tien)} ₫{d.la_thu_hoi && <span className="ml-1 text-xs">(thu hồi)</span>}
        </span>
        <HDVStatusBadge d={d} />

        {isQuyetToan && !isHuy && !isTuChoi && (
          <Button
            size="sm" variant="ghost"
            className="h-6 text-xs"
            onClick={handlePrintQuyetToan}
            title="In Giấy đề nghị quyết toán (Excel)"
          >
            <FileText className="h-3 w-3 mr-1" /> In
          </Button>
        )}

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
  // Quyết toán context — chỉ dùng cho hdv_quyet_toan
  doan?: any;
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
    isQT ? "Quyết toán hướng dẫn viên" : "Tạm ứng cho hướng dẫn viên",
  );
  const [ghiChu, setGhiChu] = useState("");
  const [laThuHoi, setLaThuHoi] = useState(defaultLaThuHoi ?? false);
  // Default = hôm nay + 2 ngày; null sort xuống cuối list ĐNTT page → user dễ bỏ sót.
  const [ngayCanTT, setNgayCanTT] = useState(format(addDays(new Date(), 2), "yyyy-MM-dd"));

  // Quyết toán state (7 fields theo form S8 BM02.1-20)
  const [tamUng, setTamUng] = useState(0);
  const [thuTrachNhiem, setThuTrachNhiem] = useState(0);
  const [tipSoKhach, setTipSoKhach] = useState(soKhachDefault);
  const [tipDonGia, setTipDonGia] = useState(tipDonGiaDefault);
  const [tipTyGia, setTipTyGia] = useState(tyGiaDefault);
  const [dauKhachSoKhach, setDauKhachSoKhach] = useState(soKhachDefault);
  const [dauKhachDonGia, setDauKhachDonGia] = useState(0);
  const [quyVpSoLuong, setQuyVpSoLuong] = useState(1);
  const [quyVpDonGia, setQuyVpDonGia] = useState(0);
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
    if (soTien <= 0) { toast.error("Số tiền phải lớn hơn 0"); return; }
    try {
      await createMut.mutateAsync({
        doanId, hdvId, refLoai, soTien, laThuHoi, moTa,
        ghiChu: ghiChu || undefined,
        quyetToanData: isQT ? buildQuyetToanData() : null,
        ngayCanThanhToan: ngayCanTT || null,
      });
      toast.success("Đã tạo đề nghị thanh toán");
      onClose();
    } catch (e: any) {
      toast.error(e?.message || "Lỗi tạo đề nghị TT");
    }
  };

  const handleExport = () => {
    if (!isQT) return;
    try {
      exportHDVQuyetToanExcel({
        data: buildQuyetToanData(),
        hdv: hdv ?? null,
      });
      toast.success("Đã xuất file Excel");
    } catch (e: any) {
      toast.error("Lỗi xuất Excel: " + (e?.message || ""));
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
                Chi tiết quyết toán (Form S8)
              </p>

              <div className="grid grid-cols-2 gap-3 text-xs">
                <div>
                  <Label className="text-[11px] text-muted-foreground">Mã đoàn</Label>
                  <p className="font-medium">{doan?.ten_doan || "—"}</p>
                </div>
                <div>
                  <Label className="text-[11px] text-muted-foreground">HDV</Label>
                  <p className="font-medium">{hdvName || "—"}</p>
                </div>
                <div>
                  <Label className="text-[11px] text-muted-foreground">Số khách</Label>
                  <p className="font-medium">{soKhachDefault}</p>
                </div>
                <div>
                  <Label className="text-[11px] text-muted-foreground">Số ngày</Label>
                  <p className="font-medium">{soNgayDefault}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs">
                <NumberField label="Tạm ứng" value={tamUng} onChange={setTamUng} />
                <NumberField label="Thu tiền trách nhiệm" value={thuTrachNhiem} onChange={setThuTrachNhiem} />
              </div>

              {/* Tip — NT/khách/ngày × số khách × số ngày × tỷ giá */}
              <div className="space-y-1.5">
                <Label className="text-[11px] text-muted-foreground">Thu tiền tip</Label>
                <div className="grid grid-cols-4 gap-1.5">
                  <Input
                    type="number" min={0} className="h-7 text-xs"
                    value={tipSoKhach || ""} onChange={(e) => setTipSoKhach(Number(e.target.value) || 0)}
                    placeholder="SL khách"
                  />
                  <Input
                    type="number" min={0} className="h-7 text-xs"
                    value={tipDonGia || ""} onChange={(e) => setTipDonGia(Number(e.target.value) || 0)}
                    placeholder="ĐG NT/khách/ngày"
                  />
                  <Input
                    type="number" min={0} className="h-7 text-xs"
                    value={tipTyGia || ""} onChange={(e) => setTipTyGia(Number(e.target.value) || 0)}
                    placeholder="Tỷ giá"
                  />
                  <p className="h-7 text-xs flex items-center justify-end font-semibold text-emerald-700">
                    {fmt(thuTipVnd)} ₫
                  </p>
                </div>
                <p className="text-[10px] text-muted-foreground">
                  {tipSoKhach} × {tipDonGia} NT × {soNgayDefault} ngày × {tipTyGia} = {fmt(thuTipVnd)} ₫
                </p>
              </div>

              {/* Đầu khách */}
              <div className="space-y-1.5">
                <Label className="text-[11px] text-muted-foreground">Thu tiền đầu khách</Label>
                <div className="grid grid-cols-3 gap-1.5">
                  <Input
                    type="number" min={0} className="h-7 text-xs"
                    value={dauKhachSoKhach || ""} onChange={(e) => setDauKhachSoKhach(Number(e.target.value) || 0)}
                    placeholder="SL khách"
                  />
                  <Input
                    type="number" min={0} className="h-7 text-xs"
                    value={dauKhachDonGia || ""} onChange={(e) => setDauKhachDonGia(Number(e.target.value) || 0)}
                    placeholder="ĐG"
                  />
                  <p className="h-7 text-xs flex items-center justify-end font-semibold text-emerald-700">
                    {fmt(thuDauKhachVnd)} ₫
                  </p>
                </div>
              </div>

              {/* Quỹ VP */}
              <div className="space-y-1.5">
                <Label className="text-[11px] text-muted-foreground">Thu tiền quỹ văn phòng</Label>
                <div className="grid grid-cols-3 gap-1.5">
                  <Input
                    type="number" min={0} className="h-7 text-xs"
                    value={quyVpSoLuong || ""} onChange={(e) => setQuyVpSoLuong(Number(e.target.value) || 0)}
                    placeholder="SL"
                  />
                  <Input
                    type="number" min={0} className="h-7 text-xs"
                    value={quyVpDonGia || ""} onChange={(e) => setQuyVpDonGia(Number(e.target.value) || 0)}
                    placeholder="ĐG"
                  />
                  <p className="h-7 text-xs flex items-center justify-end font-semibold text-emerald-700">
                    {fmt(thuQuyVpVnd)} ₫
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs">
                <NumberField label="Thu tiền bán OP" value={thuBanOp} onChange={setThuBanOp} />
                <NumberField label="Thu khác" value={thuKhac} onChange={setThuKhac} />
              </div>

              {/* Tổng + Còn phải thanh toán */}
              <div className="border-t border-border pt-2 space-y-1 text-xs">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Tổng quyết toán (HDV chi):</span>
                  <span className="font-semibold">{fmt(tongHdvChiVal)} ₫</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Tổng thu:</span>
                  <span className="font-semibold text-emerald-700">{fmt(tongThu)} ₫</span>
                </div>
                <div className="flex justify-between border-t border-border pt-1">
                  <span className="font-semibold">
                    {conPhaiThanhToan >= 0 ? "Công ty còn phải trả HDV:" : "HDV phải trả lại công ty:"}
                  </span>
                  <span className={cn(
                    "font-bold",
                    conPhaiThanhToan > 0 ? "text-orange-600" : conPhaiThanhToan < 0 ? "text-blue-600" : "",
                  )}>
                    {conPhaiThanhToan < 0 ? "-" : ""}{fmt(Math.abs(conPhaiThanhToan))} ₫
                  </span>
                </div>
                <p className="text-[10px] text-muted-foreground italic">
                  Số tiền ĐNTT bên dưới tự đồng bộ với giá trị này.
                </p>
              </div>
            </div>
          )}

          <div className="space-y-1.5">
            <Label className="text-xs">Mô tả</Label>
            <Input className="h-8 text-sm" value={moTa} onChange={(e) => setMoTa(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Số tiền ĐNTT (VND)</Label>
            <Input
              className="h-8 text-sm" type="number" min={0}
              value={soTien || ""} onChange={(e) => setSoTien(Number(e.target.value))}
              placeholder="VD: 5000000"
            />
            {soTien > 0 && <p className="text-[11px] text-muted-foreground">{fmt(soTien)} ₫</p>}
          </div>
          {isQT && (
            <>
              <div className="space-y-1.5">
                <Label className="text-xs">Ngày cần thanh toán</Label>
                <Input
                  className="h-8 text-sm" type="date"
                  value={ngayCanTT} onChange={(e) => setNgayCanTT(e.target.value)}
                />
              </div>
              <div className="flex items-center gap-2">
                <Checkbox id="la-thu-hoi" checked={laThuHoi} onCheckedChange={(v) => setLaThuHoi(!!v)} />
                <Label htmlFor="la-thu-hoi" className="text-xs cursor-pointer">
                  HDV hoàn lại tiền (thu hồi tạm ứng thừa)
                </Label>
              </div>
            </>
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
            {isQT && (
              <Button variant="outline" size="sm" onClick={handleExport} className="gap-1">
                <FileDown className="h-3.5 w-3.5" />
                In file Excel
              </Button>
            )}
            <Button size="sm" onClick={handleSubmit} disabled={createMut.isPending}>
              {createMut.isPending ? "Đang tạo..." : "Tạo"}
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
