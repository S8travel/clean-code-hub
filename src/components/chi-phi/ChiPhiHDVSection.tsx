import { useState } from "react";
import { format, differenceInDays, parseISO } from "date-fns";
import { Plus, Ban, CheckCircle, CreditCard, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  useApproveDNTT,
  useMarkPaidDNTT,
  useCancelDNTT,
  type HDVDNTTRow,
} from "@/hooks/use-chi-phi-hdv";
import { useUpsertChiPhi } from "@/hooks/use-chi-phi";
import { cn } from "@/lib/utils";

const NDT_TIP_CO_TL = 150;
const NDT_TIP_KHONG_TL = 300;

const fmt = (n: number) => n.toLocaleString("vi-VN");

interface Props {
  doanId: number;
  doan?: any;
}

export default function ChiPhiHDVSection({ doanId, doan }: Props) {
  const { data, isLoading } = useChiPhiHDVSection(doanId);
  const [showTamUng, setShowTamUng] = useState(false);
  const [showQuyetToan, setShowQuyetToan] = useState(false);
  const [showThemChiPhi, setShowThemChiPhi] = useState(false);

  // Tip state
  const [tyGia, setTyGia] = useState<number>(3500);

  if (isLoading) {
    return <div className="text-sm text-muted-foreground py-4">Đang tải...</div>;
  }

  const hdv = data?.hdv ?? null;
  const chiPhiItems = data?.chiPhiItems ?? [];
  const tongHdvChi = data?.tongHdvChi ?? 0;
  const tamUngList = data?.tamUngList ?? [];
  const quyetToanList = data?.quyetToanList ?? [];
  const tamUngDaTT = data?.tamUngDaTT ?? 0;
  const soConPhaiTra = data?.soConPhaiTra ?? 0;
  const daQuyetToan = data?.daQuyetToan ?? false;

  const activeTamUng = tamUngList.filter(
    (d) => d.trang_thai_duyet !== "da_huy" && d.trang_thai_duyet !== "tu_choi",
  );
  const activeQuyetToan = quyetToanList.filter(
    (d) => d.trang_thai_duyet !== "da_huy" && d.trang_thai_duyet !== "tu_choi",
  );

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

            {tongHdvChi > 0 && (
              <div className="flex gap-4">
                <div>
                  <p className="text-[11px] text-muted-foreground">Tổng HDV chi</p>
                  <p className="text-sm font-semibold">{fmt(tongHdvChi)} ₫</p>
                </div>
                {tamUngDaTT > 0 && (
                  <div>
                    <p className="text-[11px] text-muted-foreground">Đã tạm ứng</p>
                    <p className="text-sm font-semibold text-emerald-600">{fmt(tamUngDaTT)} ₫</p>
                  </div>
                )}
                <div>
                  <p className="text-[11px] text-muted-foreground">
                    {soConPhaiTra > 0 ? "Còn phải trả" : soConPhaiTra < 0 ? "HDV hoàn lại" : "Đã đủ"}
                  </p>
                  <p className={cn(
                    "text-sm font-semibold",
                    soConPhaiTra > 0 ? "text-orange-600" : soConPhaiTra < 0 ? "text-blue-600" : "text-emerald-600",
                  )}>
                    {fmt(Math.abs(soConPhaiTra))} ₫
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Buttons */}
          <div className="flex gap-2 shrink-0 flex-wrap">
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setShowThemChiPhi(true)}>
              <Plus className="h-3 w-3 mr-1" /> Thêm chi phí
            </Button>
            {!daQuyetToan && (
              <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setShowTamUng(true)}>
                <Plus className="h-3 w-3 mr-1" /> Tạm ứng
              </Button>
            )}
            {(tamUngList.length > 0 || tongHdvChi > 0) && (
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

      {/* ── Chi phí HDV ứng (bảng) ── */}
      {chiPhiItems.length > 0 && (
        <div className="rounded-lg border border-border overflow-hidden">
          <div className="px-4 py-2 bg-muted/40 border-b border-border">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Chi phí HDV ứng
            </p>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/20">
                <th className="text-left px-4 py-2 text-xs font-medium text-muted-foreground">Dịch vụ</th>
                <th className="text-right px-4 py-2 text-xs font-medium text-muted-foreground w-16">SL</th>
                <th className="text-right px-4 py-2 text-xs font-medium text-muted-foreground">Đơn giá</th>
                <th className="text-right px-4 py-2 text-xs font-medium text-muted-foreground">Thành tiền</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {chiPhiItems.map((item) => (
                <tr key={item.id} className="hover:bg-muted/20">
                  <td className="px-4 py-2.5 font-medium">{item.mo_ta || item.danh_muc}</td>
                  <td className="px-4 py-2.5 text-right text-xs text-muted-foreground">{item.so_luong}</td>
                  <td className="px-4 py-2.5 text-right text-xs text-muted-foreground">{fmt(item.don_gia)} ₫</td>
                  <td className="px-4 py-2.5 text-right font-medium">{fmt(item.tien_hdv)} ₫</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Phải thu ── */}
      <TipSection doan={doan} tyGia={tyGia} onTyGiaChange={setTyGia} />

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
          defaultSoTien={Math.abs(soConPhaiTra)}
          defaultLaThuHoi={soConPhaiTra < 0}
          onClose={() => setShowQuyetToan(false)}
        />
      )}
      {showThemChiPhi && (
        <ThemChiPhiHDVModal doanId={doanId} onClose={() => setShowThemChiPhi(false)} />
      )}
    </div>
  );
}

// ── Tip section ───────────────────────────────────────────────────────────────

interface ExtraRow { id: number; moTa: string; soNDT: number; tyGia: number }

function TipSection({ doan, tyGia, onTyGiaChange }: {
  doan?: any;
  tyGia: number;
  onTyGiaChange: (v: number) => void;
}) {
  const soKhach = (doan?.so_khach_lon ?? 0) + (doan?.so_khach_em1 ?? 0) +
    (doan?.so_khach_em2 ?? 0) + (doan?.so_khach_tl ?? 0) || doan?.so_khach || 0;

  const soNgay = doan?.ngay_di && doan?.ngay_ve
    ? Math.max(1, differenceInDays(parseISO(doan.ngay_ve), parseISO(doan.ngay_di)) + 1)
    : 0;

  const coTL = (doan?.so_khach_tl ?? 0) > 0;
  const ndtPerNgay = coTL ? NDT_TIP_CO_TL : NDT_TIP_KHONG_TL;
  const tongNDT = soKhach * soNgay * ndtPerNgay;
  const tongVND = tongNDT * tyGia;

  const [extraRows, setExtraRows] = useState<ExtraRow[]>([]);
  const nextId = () => Date.now();

  const addRow = () => setExtraRows((prev) => [...prev, { id: nextId(), moTa: "", soNDT: 0, tyGia }]);
  const removeRow = (id: number) => setExtraRows((prev) => prev.filter((r) => r.id !== id));
  const updateRow = (id: number, field: keyof Omit<ExtraRow, "id">, val: string | number) =>
    setExtraRows((prev) => prev.map((r) => r.id === id ? { ...r, [field]: val } : r));

  const totalVND = tongVND + extraRows.reduce((s, r) => s + r.soNDT * r.tyGia, 0);

  if (!soKhach || !soNgay) return null;

  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      <div className="px-4 py-2.5 bg-muted/30 border-b border-border flex items-center justify-between">
        <p className="text-sm font-semibold">💰 Phải thu</p>
        <div className="flex items-center gap-3">
          {totalVND > 0 && (
            <span className="text-xs text-muted-foreground">Tổng: {fmt(totalVND)} ₫</span>
          )}
          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={addRow}>
            <Plus className="h-3 w-3 mr-1" /> Thêm
          </Button>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="border-b border-border bg-muted/20 text-[11px] font-medium text-muted-foreground">
              <th className="text-left px-4 py-2.5">Mục</th>
              <th className="text-center px-3 py-2.5">Khách</th>
              <th className="text-center px-3 py-2.5">Ngày</th>
              <th className="text-center px-3 py-2.5">NDT/khách/ngày</th>
              <th className="text-right px-3 py-2.5">Tổng NDT</th>
              <th className="text-center px-3 py-2.5">Tỷ giá</th>
              <th className="text-right px-4 py-2.5">Thành tiền VND</th>
              <th className="w-8" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {/* Tip row — cố định */}
            <tr className="hover:bg-muted/20">
              <td className="px-4 py-2.5 font-medium">
                Tip
                <span className={cn(
                  "ml-2 px-1.5 py-0.5 rounded text-[10px] font-medium",
                  coTL ? "bg-green-100 text-green-700" : "bg-orange-100 text-orange-700",
                )}>
                  {coTL ? "Có T/L" : "Không T/L"}
                </span>
              </td>
              <td className="px-3 py-2.5 text-center text-muted-foreground">{soKhach}</td>
              <td className="px-3 py-2.5 text-center text-muted-foreground">{soNgay}</td>
              <td className="px-3 py-2.5 text-center font-medium">{ndtPerNgay} NDT</td>
              <td className="px-3 py-2.5 text-right font-semibold whitespace-nowrap">{fmt(tongNDT)} NDT</td>
              <td className="px-3 py-2.5">
                <div className="flex justify-center">
                  <Input
                    type="number"
                    value={tyGia || ""}
                    onChange={(e) => onTyGiaChange(Number(e.target.value) || 0)}
                    className="h-6 text-xs px-1.5 py-0 text-center w-[72px]"
                    placeholder="3500"
                  />
                </div>
              </td>
              <td className="px-4 py-2.5 text-right font-semibold text-primary whitespace-nowrap">
                {tyGia > 0 ? `${fmt(tongVND)} ₫` : "—"}
              </td>
              <td />
            </tr>

            {/* Extra rows */}
            {extraRows.map((row) => (
              <tr key={row.id} className="hover:bg-muted/20">
                <td className="px-4 py-2">
                  <Input
                    value={row.moTa}
                    onChange={(e) => updateRow(row.id, "moTa", e.target.value)}
                    className="h-6 text-xs px-1.5"
                    placeholder="Mô tả khoản thu..."
                    autoFocus
                  />
                </td>
                <td className="px-3 py-2 text-center text-muted-foreground">—</td>
                <td className="px-3 py-2 text-center text-muted-foreground">—</td>
                <td className="px-3 py-2">
                  <div className="flex justify-center">
                    <Input
                      type="number"
                      value={row.soNDT || ""}
                      onChange={(e) => updateRow(row.id, "soNDT", Number(e.target.value) || 0)}
                      className="h-6 text-xs px-1.5 py-0 text-center w-[72px]"
                      placeholder="0"
                    />
                  </div>
                </td>
                <td className="px-3 py-2 text-right font-semibold whitespace-nowrap">
                  {row.soNDT > 0 ? `${fmt(row.soNDT)} NDT` : "—"}
                </td>
                <td className="px-3 py-2">
                  <div className="flex justify-center">
                    <Input
                      type="number"
                      value={row.tyGia || ""}
                      onChange={(e) => updateRow(row.id, "tyGia", Number(e.target.value) || 0)}
                      className="h-6 text-xs px-1.5 py-0 text-center w-[72px]"
                      placeholder="3500"
                    />
                  </div>
                </td>
                <td className="px-4 py-2 text-right font-semibold text-primary whitespace-nowrap">
                  {row.soNDT > 0 && row.tyGia > 0 ? `${fmt(row.soNDT * row.tyGia)} ₫` : "—"}
                </td>
                <td className="px-2 py-2">
                  <Button
                    size="icon" variant="ghost"
                    className="h-6 w-6 text-muted-foreground hover:text-destructive"
                    onClick={() => removeRow(row.id)}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

function HDVDNTTCard({ d, doanId }: { d: HDVDNTTRow; doanId: number }) {
  const approveMut = useApproveDNTT();
  const markPaidMut = useMarkPaidDNTT();
  const cancelMut = useCancelDNTT();

  const isHuy = d.trang_thai_duyet === "da_huy";
  const isTuChoi = d.trang_thai_duyet === "tu_choi";
  const isDaTT = d.trang_thai_thanh_toan === "da_tt";
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
            {isChoDuyet && (
              <Button
                size="sm" variant="outline"
                className="h-6 text-xs text-emerald-700 border-emerald-300 hover:bg-emerald-50"
                onClick={() => approveMut.mutate(d.id, { onSuccess: () => toast.success("Đã duyệt"), onError: (e: any) => toast.error(e?.message) })}
                disabled={approveMut.isPending}
              >
                <CheckCircle className="h-3 w-3 mr-1" /> Duyệt
              </Button>
            )}
            {isDaDuyet && (
              <Button
                size="sm" variant="outline"
                className="h-6 text-xs text-teal-700 border-teal-300 hover:bg-teal-50"
                onClick={() => markPaidMut.mutate(d.id, { onSuccess: () => toast.success("Đã TT"), onError: (e: any) => toast.error(e?.message) })}
                disabled={markPaidMut.isPending}
              >
                <CreditCard className="h-3 w-3 mr-1" /> Đã TT
              </Button>
            )}
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
  if (d.trang_thai_thanh_toan === "da_tt")
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

function ThemChiPhiHDVModal({ doanId, onClose }: { doanId: number; onClose: () => void }) {
  const upsertMut = useUpsertChiPhi();
  const [moTa, setMoTa] = useState("");
  const [soLuong, setSoLuong] = useState(1);
  const [donGia, setDonGia] = useState(0);

  const thanhTien = soLuong * donGia;

  const handleSubmit = async () => {
    if (!moTa.trim()) { toast.error("Vui lòng nhập mô tả"); return; }
    if (donGia <= 0) { toast.error("Đơn giá phải lớn hơn 0"); return; }
    try {
      await upsertMut.mutateAsync({
        doan_id: doanId,
        danh_muc: "canh_diem",
        loai: "hdv_phat_sinh",
        mo_ta: moTa.trim(),
        don_gia: donGia,
        so_luong: soLuong,
        tien_cong_ty: 0,
        tien_hdv: thanhTien,
      } as any);
      toast.success("Đã thêm chi phí");
      onClose();
    } catch {
      toast.error("Lỗi khi thêm");
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Thêm chi phí phát sinh HDV</DialogTitle></DialogHeader>
        <div className="space-y-3 pt-2">
          <div>
            <Label className="text-xs">Mô tả *</Label>
            <Input className="h-8 text-sm" value={moTa} onChange={(e) => setMoTa(e.target.value)} placeholder="VD: Phí cầu đường, tiền tip..." autoFocus />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Số lượng</Label>
              <Input className="h-8 text-sm" type="number" min={1} value={soLuong} onChange={(e) => setSoLuong(Number(e.target.value) || 1)} />
            </div>
            <div>
              <Label className="text-xs">Đơn giá (VND)</Label>
              <Input className="h-8 text-sm" type="number" min={0} value={donGia || ""} onChange={(e) => setDonGia(Number(e.target.value) || 0)} />
            </div>
          </div>
          {thanhTien > 0 && (
            <p className="text-xs text-muted-foreground">Thành tiền: <span className="font-semibold text-foreground">{fmt(thanhTien)} ₫</span></p>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" size="sm" onClick={onClose}>Hủy</Button>
            <Button size="sm" onClick={handleSubmit} disabled={upsertMut.isPending}>Thêm</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
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
