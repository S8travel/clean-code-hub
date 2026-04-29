import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { Plus, Ban, CheckCircle, CreditCard, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
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
  type HDVHoTroItem,
} from "@/hooks/use-chi-phi-hdv";
import { useUpsertChiPhi, useDeleteChiPhi } from "@/hooks/use-chi-phi";
import { cn } from "@/lib/utils";

const fmt = (n: number) => n.toLocaleString("vi-VN");

interface Props {
  doanId: number;
}

export default function ChiPhiHDVSection({ doanId }: Props) {
  const { data, isLoading } = useChiPhiHDVSection(doanId);
  const [showTamUng, setShowTamUng] = useState(false);
  const [showQuyetToan, setShowQuyetToan] = useState(false);
  const [showThemChiPhi, setShowThemChiPhi] = useState(false);

  if (isLoading) {
    return <div className="text-sm text-muted-foreground py-4">Đang tải...</div>;
  }

  const hdv = data?.hdv ?? null;
  const chiPhiItems = data?.chiPhiItems ?? [];
  const hoTroItems = data?.hoTroItems ?? [];
  const tongHdvChi = data?.tongHdvChi ?? 0;
  const tongHoTroHDV = data?.tongHoTroHDV ?? 0;
  const tamUngList = data?.tamUngList ?? [];
  const quyetToanList = data?.quyetToanList ?? [];
  const tamUngDaTT = data?.tamUngDaTT ?? 0;
  const soConPhaiTra = data?.soConPhaiTra ?? 0;
  const daQuyetToan = data?.daQuyetToan ?? false;

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

            {(tongHdvChi > 0 || tongHoTroHDV > 0) && (
              <div className="flex gap-4 flex-wrap">
                {tongHdvChi > 0 && (
                  <div>
                    <p className="text-[11px] text-muted-foreground">Tổng HDV chi</p>
                    <p className="text-sm font-semibold">{fmt(tongHdvChi)} ₫</p>
                  </div>
                )}
                {tongHoTroHDV > 0 && (
                  <div>
                    <p className="text-[11px] text-muted-foreground">Hỗ trợ HDV</p>
                    <p className="text-sm font-semibold text-blue-600">+{fmt(tongHoTroHDV)} ₫</p>
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

      {/* ── Chi phí HDV ứng (bảng) ── */}
      <ChiPhiUngTable doanId={doanId} chiPhiItems={chiPhiItems} />

      {/* ── Nút thêm chi phí HDV ứng ── */}
      <div>
        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setShowThemChiPhi(true)}>
          <Plus className="h-3 w-3 mr-1" /> Thêm chi phí HDV ứng
        </Button>
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

// ── Chi phí HDV ứng table with inline edit + delete ───────────────────────────

function ChiPhiUngTable({ doanId, chiPhiItems }: {
  doanId: number;
  chiPhiItems: import("@/hooks/use-chi-phi-hdv").HDVChiPhiItem[];
}) {
  const qc = useQueryClient();
  const upsertMut = useUpsertChiPhi();
  const deleteMut = useDeleteChiPhi();
  const [editRow, setEditRow] = useState<Record<number, { so_luong: number; don_gia: number }>>({});

  const getLocal = (item: typeof chiPhiItems[0]) =>
    editRow[item.id] ?? { so_luong: item.so_luong, don_gia: item.don_gia };

  const handleChange = (id: number, field: "so_luong" | "don_gia", val: number) =>
    setEditRow((prev) => {
      const base = chiPhiItems.find((r) => r.id === id);
      const cur = prev[id] ?? { so_luong: base?.so_luong ?? 0, don_gia: base?.don_gia ?? 0 };
      return { ...prev, [id]: { ...cur, [field]: val } };
    });

  const invalidateHDV = () => qc.invalidateQueries({ queryKey: ["chi_phi_hdv_section", doanId] });

  const handleSave = (item: typeof chiPhiItems[0]) => {
    const local = editRow[item.id];
    if (!local) return;
    if (local.so_luong === item.so_luong && local.don_gia === item.don_gia) {
      setEditRow((prev) => { const n = { ...prev }; delete n[item.id]; return n; });
      return;
    }
    upsertMut.mutate({ id: item.id, doan_id: doanId, so_luong: local.so_luong, don_gia: local.don_gia } as any, {
      onSuccess: () => {
        setEditRow((prev) => { const n = { ...prev }; delete n[item.id]; return n; });
        invalidateHDV();
      },
    });
  };

  const handleDelete = (item: typeof chiPhiItems[0]) => {
    deleteMut.mutate({ id: item.id, doanId }, {
      onSuccess: () => { invalidateHDV(); toast.success("Đã xóa chi phí"); },
      onError: (e: any) => toast.error(e?.message || "Lỗi xóa"),
    });
  };

  if (chiPhiItems.length === 0) return null;

  return (
    <div className="rounded-lg border border-border overflow-hidden">
      <div className="px-4 py-2 bg-amber-50 border-b border-amber-100">
        <p className="text-xs font-semibold text-amber-800 uppercase tracking-wide">
          Chi phí HDV ứng
        </p>
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border bg-muted/20">
            <th className="text-left px-4 py-2 text-xs font-medium text-muted-foreground">Dịch vụ</th>
            <th className="text-right px-4 py-2 text-xs font-medium text-muted-foreground w-24">SL</th>
            <th className="text-right px-4 py-2 text-xs font-medium text-muted-foreground w-32">Đơn giá</th>
            <th className="text-right px-4 py-2 text-xs font-medium text-muted-foreground w-32">Thành tiền</th>
            <th className="w-8" />
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {chiPhiItems.map((item) => {
            const local = getLocal(item);
            const isDirty = editRow[item.id] !== undefined;
            return (
              <tr key={item.id} className="hover:bg-muted/20">
                <td className="px-4 py-2.5 font-medium">{item.mo_ta || item.danh_muc}</td>
                <td className="px-4 py-2 text-right">
                  <Input
                    type="number"
                    value={local.so_luong || ""}
                    onChange={(e) => handleChange(item.id, "so_luong", Number(e.target.value) || 0)}
                    onBlur={() => handleSave(item)}
                    onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLElement).blur(); }}
                    className="h-6 text-xs px-1.5 py-0 text-center w-16 ml-auto"
                  />
                </td>
                <td className="px-4 py-2 text-right">
                  <Input
                    type="number"
                    value={local.don_gia || ""}
                    onChange={(e) => handleChange(item.id, "don_gia", Number(e.target.value) || 0)}
                    onBlur={() => handleSave(item)}
                    onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLElement).blur(); }}
                    className="h-6 text-xs px-1.5 py-0 text-right w-28 ml-auto"
                  />
                </td>
                <td className="px-4 py-2.5 text-right font-medium">
                  {fmt(local.so_luong * local.don_gia)} ₫
                  {isDirty && (
                    <span className="ml-1 text-[10px] text-amber-600">*</span>
                  )}
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
    </div>
  );
}

// ── Chi phí công ty hỗ trợ HDV ───────────────────────────────────────────────

const HO_TRO_LOAI: { value: string; label: string }[] = [
  { value: "cong_tac_phi", label: "Công tác phí" },
  { value: "tien_ngu_nb", label: "Tiền ngủ nội bộ" },
  { value: "ho_tro_nuoc", label: "Hỗ trợ nước" },
  { value: "khac", label: "Khác" },
];

function getLoaiLabel(loai: string) {
  return HO_TRO_LOAI.find((l) => l.value === loai)?.label ?? loai;
}

function HoTroHDVTable({ doanId, hoTroItems }: {
  doanId: number;
  hoTroItems: HDVHoTroItem[];
}) {
  const qc = useQueryClient();
  const upsertMut = useUpsertChiPhi();
  const deleteMut = useDeleteChiPhi();
  const [editRow, setEditRow] = useState<Record<number, { so_luong: number; don_gia: number }>>({});
  const [addingRow, setAddingRow] = useState(false);

  const invalidate = () => qc.invalidateQueries({ queryKey: ["chi_phi_hdv_section", doanId] });

  const getLocal = (item: HDVHoTroItem) =>
    editRow[item.id] ?? { so_luong: item.so_luong, don_gia: item.don_gia };

  const handleNumChange = (id: number, field: "so_luong" | "don_gia", val: number) =>
    setEditRow((prev) => {
      const base = hoTroItems.find((r) => r.id === id);
      const cur = prev[id] ?? { so_luong: base?.so_luong ?? 1, don_gia: base?.don_gia ?? 0 };
      return { ...prev, [id]: { ...cur, [field]: val } };
    });

  const handleSave = (item: HDVHoTroItem) => {
    const local = editRow[item.id];
    if (!local) return;
    if (local.so_luong === item.so_luong && local.don_gia === item.don_gia) {
      setEditRow((prev) => { const n = { ...prev }; delete n[item.id]; return n; });
      return;
    }
    upsertMut.mutate({
      id: item.id, doan_id: doanId,
      so_luong: local.so_luong, don_gia: local.don_gia,
      tien_cong_ty: local.so_luong * local.don_gia,
    } as any, {
      onSuccess: () => {
        setEditRow((prev) => { const n = { ...prev }; delete n[item.id]; return n; });
        invalidate();
      },
    });
  };

  const handleLoaiChange = (item: HDVHoTroItem, newLoai: string) => {
    const newMoTa = newLoai !== "khac" ? getLoaiLabel(newLoai) : (item.mo_ta ?? "Khác");
    upsertMut.mutate({ id: item.id, doan_id: doanId, loai: newLoai, mo_ta: newMoTa } as any, {
      onSuccess: () => invalidate(),
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
        loai: "cong_tac_phi",
        mo_ta: "Công tác phí",
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
          Chi phí công ty hỗ trợ HDV
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
                    <Select value={item.loai} onValueChange={(v) => handleLoaiChange(item, v)}>
                      <SelectTrigger className="h-7 text-xs w-44">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {HO_TRO_LOAI.map((l) => (
                          <SelectItem key={l.value} value={l.value}>{l.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
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
                    <Input
                      type="number"
                      value={local.don_gia || ""}
                      onChange={(e) => handleNumChange(item.id, "don_gia", Number(e.target.value) || 0)}
                      onBlur={() => handleSave(item)}
                      onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLElement).blur(); }}
                      className="h-6 text-xs px-1.5 py-0 text-right w-28 ml-auto"
                    />
                  </td>
                  <td className="px-4 py-2.5 text-right font-medium">
                    {fmt(local.so_luong * local.don_gia)} ₫
                    {isDirty && <span className="ml-1 text-[10px] text-amber-600">*</span>}
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
  const qc = useQueryClient();
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
      qc.invalidateQueries({ queryKey: ["chi_phi_hdv_section", doanId] });
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
