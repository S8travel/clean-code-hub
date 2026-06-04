import { useState } from "react";
import { Plus, Search, Pencil, History, Ban, CheckCircle2, Trash2, RotateCcw } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { SearchableSelect } from "@/components/SearchableSelect";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { AccessDenied } from "@/components/PermissionGate";
import { useNhaCungCapList } from "@/hooks/use-nha-cung-cap";
import {
  useVoucherList, useCreateVoucher, useUpdateVoucher, useDeleteVoucher,
  useVoucherRedemptions, useUndoRedemption, type VoucherRow, type VoucherLoai,
} from "@/hooks/use-voucher";
import { t, useTranslate } from "@/lib/i18n";

const fmt = (n: number) => n.toLocaleString("vi-VN");

interface FormState {
  id: number | null;
  nha_cung_cap_id: number | null;
  ten: string;
  so_luong: string;
  ghi_chu: string;
  loai: VoucherLoai;
}
const EMPTY_FORM: FormState = { id: null, nha_cung_cap_id: null, ten: "", so_luong: "", ghi_chu: "", loai: "mua" };

function VoucherPageContent() {
  useTranslate();
  const { data: list = [], isLoading } = useVoucherList();
  const { data: nccList = [] } = useNhaCungCapList();
  const createMut = useCreateVoucher();
  const updateMut = useUpdateVoucher();
  const deleteMut = useDeleteVoucher();

  const [search, setSearch] = useState("");
  const [form, setForm] = useState<FormState | null>(null);
  const [logVoucher, setLogVoucher] = useState<VoucherRow | null>(null);

  const filtered = list.filter((v) => {
    const q = search.toLowerCase();
    return (
      (v.ten ?? "").toLowerCase().includes(q) ||
      (v.ten_ncc ?? "").toLowerCase().includes(q) ||
      (v.ghi_chu ?? "").toLowerCase().includes(q)
    );
  });

  const openCreate = () => setForm({ ...EMPTY_FORM });
  const openEdit = (v: VoucherRow) =>
    setForm({
      id: v.id,
      nha_cung_cap_id: v.nha_cung_cap_id,
      ten: v.ten ?? "",
      so_luong: String(v.so_luong ?? 0),
      ghi_chu: v.ghi_chu ?? "",
      loai: v.loai ?? "mua",
    });

  const handleSave = async () => {
    if (!form) return;
    const ten = form.ten.trim();
    if (!ten) {
      toast.error(t("Nhập tên/mô tả voucher"));
      return;
    }
    const soLuong = parseInt(form.so_luong, 10);
    if (isNaN(soLuong) || soLuong < 0) {
      toast.error(t("Số lượng không hợp lệ"));
      return;
    }
    try {
      if (form.id) {
        await updateMut.mutateAsync({
          id: form.id,
          nha_cung_cap_id: form.nha_cung_cap_id,
          ten,
          so_luong: soLuong,
          ghi_chu: form.ghi_chu.trim() || null,
          loai: form.loai,
        });
        toast.success(t("Đã cập nhật voucher"));
      } else {
        await createMut.mutateAsync({
          nha_cung_cap_id: form.nha_cung_cap_id,
          ten,
          so_luong: soLuong,
          ghi_chu: form.ghi_chu.trim() || null,
          loai: form.loai,
        });
        toast.success(t("Đã tạo voucher"));
      }
      setForm(null);
    } catch {
      toast.error(t("Lỗi lưu voucher"));
    }
  };

  const handleToggleActive = async (v: VoucherRow) => {
    try {
      await updateMut.mutateAsync({ id: v.id, active: !v.active });
    } catch {
      toast.error(t("Lỗi cập nhật"));
    }
  };

  const handleDelete = async (v: VoucherRow) => {
    if (!window.confirm(t("Xóa voucher này?"))) return;
    try {
      await deleteMut.mutateAsync(v.id);
      toast.success(t("Đã xóa voucher"));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("Lỗi xóa voucher"));
    }
  };

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">{t("Voucher")}</h1>
          <p className="text-sm text-muted-foreground">
            {t("Kho voucher đổi bữa ăn / dịch vụ (theo dõi số lượng, giá trị tính khi dùng).")}
          </p>
        </div>
        <Button size="sm" onClick={openCreate}>
          <Plus className="h-4 w-4 mr-1" /> {t("Thêm voucher")}
        </Button>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
        <Input
          placeholder={t("Tìm theo tên / NCC...")}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-8 text-xs pl-7"
        />
      </div>

      <div className="border rounded-md overflow-hidden">
        <table className="w-full text-xs">
          <thead className="bg-[#E6F1FB]">
            <tr className="text-left">
              <th className="py-2 px-3 font-medium">{t("Voucher")}</th>
              <th className="py-2 px-3 font-medium">{t("Nhà cung cấp")}</th>
              <th className="py-2 px-3 font-medium text-right">{t("Tổng")}</th>
              <th className="py-2 px-3 font-medium text-right">{t("Đã dùng")}</th>
              <th className="py-2 px-3 font-medium text-right">{t("Còn lại")}</th>
              <th className="py-2 px-3 font-medium text-right">{t("Đã tiết kiệm")}</th>
              <th className="py-2 px-3 font-medium text-center">{t("Trạng thái")}</th>
              <th className="py-2 px-3 font-medium text-right">{t("Thao tác")}</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              Array.from({ length: 4 }).map((_, i) => (
                <tr key={i} className="border-t">
                  <td className="p-2" colSpan={8}><Skeleton className="h-8 w-full" /></td>
                </tr>
              ))
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={8} className="py-8 text-center text-muted-foreground">
                  {t("Chưa có voucher nào")}
                </td>
              </tr>
            ) : (
              filtered.map((v) => (
                <tr key={v.id} className={cn("border-t hover:bg-muted/30", !v.active && "opacity-50")}>
                  <td className="py-2 px-3">
                    <div className="font-medium flex items-center gap-1.5">
                      {v.ten}
                      <span className={cn(
                        "px-1 py-px rounded text-[9px] font-medium",
                        v.loai === "tang" ? "bg-pink-100 text-pink-700" : "bg-sky-100 text-sky-700",
                      )}>
                        {v.loai === "tang" ? t("Tặng") : t("Mua")}
                      </span>
                    </div>
                    {v.ghi_chu && <div className="text-[11px] text-muted-foreground">{v.ghi_chu}</div>}
                  </td>
                  <td className="py-2 px-3 text-muted-foreground">{v.ten_ncc || "—"}</td>
                  <td className="py-2 px-3 text-right tabular-nums">{v.so_luong ?? 0}</td>
                  <td className="py-2 px-3 text-right tabular-nums">{v.so_luong_da_dung}</td>
                  <td className={cn("py-2 px-3 text-right tabular-nums font-semibold", v.so_luong_con_lai > 0 ? "text-emerald-600" : "text-muted-foreground")}>
                    {v.so_luong_con_lai}
                  </td>
                  <td className="py-2 px-3 text-right tabular-nums text-muted-foreground">
                    {v.tong_gia_tri_da_dung > 0 ? `${fmt(v.tong_gia_tri_da_dung)} ₫` : "—"}
                  </td>
                  <td className="py-2 px-3 text-center">
                    <span className={cn(
                      "px-1.5 py-0.5 rounded text-[10px] font-medium",
                      v.active ? "bg-emerald-100 text-emerald-700" : "bg-gray-100 text-gray-500",
                    )}>
                      {v.active ? t("Đang dùng") : t("Ngưng")}
                    </span>
                  </td>
                  <td className="py-2 px-3">
                    <div className="flex items-center gap-1 justify-end">
                      <Button variant="ghost" size="sm" className="h-7 w-7 p-0" title={t("Lịch sử dùng")}
                        onClick={() => setLogVoucher(v)}>
                        <History className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="sm" className="h-7 w-7 p-0" title={t("Sửa")}
                        onClick={() => openEdit(v)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="sm" className="h-7 w-7 p-0"
                        title={v.active ? t("Ngưng") : t("Bật lại")}
                        onClick={() => handleToggleActive(v)}>
                        {v.active ? <Ban className="h-3.5 w-3.5 text-amber-600" /> : <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />}
                      </Button>
                      <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive" title={t("Xóa")}
                        onClick={() => handleDelete(v)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Create / Edit dialog */}
      <Dialog open={!!form} onOpenChange={(o) => !o && setForm(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{form?.id ? t("Sửa voucher") : t("Thêm voucher")}</DialogTitle>
          </DialogHeader>
          {form && (
            <div className="space-y-3">
              <div className="space-y-1">
                <label className="text-xs font-medium">{t("Nhà cung cấp")}</label>
                <SearchableSelect
                  options={nccList.map((ncc) => ({ value: String(ncc.id), label: ncc.ten }))}
                  value={form.nha_cung_cap_id != null ? String(form.nha_cung_cap_id) : ""}
                  onChange={(val) => setForm({ ...form, nha_cung_cap_id: val ? Number(val) : null })}
                  placeholder={t("Chọn nhà cung cấp")}
                  searchPlaceholder={t("Tìm nhà cung cấp...")}
                  emptyText={t("Không tìm thấy")}
                  className="h-8 text-xs"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium">{t("Tên / mô tả voucher")} *</label>
                <Input
                  value={form.ten}
                  onChange={(e) => setForm({ ...form, ten: e.target.value })}
                  placeholder={t("VD: Voucher ăn — tối 1tr2 / trưa 850k")}
                  className="h-8 text-xs"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium">{t("Số lượng (tổng nhận)")}</label>
                <Input
                  type="number"
                  value={form.so_luong}
                  onChange={(e) => setForm({ ...form, so_luong: e.target.value })}
                  className="h-8 text-xs"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium">{t("Loại voucher")}</label>
                <div className="flex gap-2">
                  {(["mua", "tang"] as VoucherLoai[]).map((lo) => (
                    <button
                      key={lo}
                      type="button"
                      onClick={() => setForm({ ...form, loai: lo })}
                      className={cn(
                        "flex-1 h-8 rounded-md border text-xs font-medium transition-colors",
                        form.loai === lo
                          ? "bg-primary text-primary-foreground border-primary"
                          : "bg-background hover:bg-muted border-border",
                      )}
                    >
                      {lo === "mua" ? t("Mua (có hóa đơn)") : t("Được tặng (không HĐ)")}
                    </button>
                  ))}
                </div>
                <p className="text-[11px] text-muted-foreground">
                  {form.loai === "mua"
                    ? t("Khi dùng sẽ tạo ĐNTT 'đã trả bằng voucher' để nhập hóa đơn.")
                    : t("Voucher tặng — khi dùng không phát sinh hóa đơn.")}
                </p>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium">{t("Ghi chú")}</label>
                <Input
                  value={form.ghi_chu}
                  onChange={(e) => setForm({ ...form, ghi_chu: e.target.value })}
                  className="h-8 text-xs"
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setForm(null)}>{t("Hủy")}</Button>
            <Button size="sm" onClick={handleSave} disabled={createMut.isPending || updateMut.isPending}>
              {t("Lưu")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Redemption log dialog */}
      <VoucherLogDialog voucher={logVoucher} onClose={() => setLogVoucher(null)} />
    </div>
  );
}

function VoucherLogDialog({ voucher, onClose }: { voucher: VoucherRow | null; onClose: () => void }) {
  useTranslate();
  const { data: logs = [], isLoading } = useVoucherRedemptions(voucher?.id);
  const undoMut = useUndoRedemption();

  const handleUndo = async (id: number) => {
    if (!voucher) return;
    if (!window.confirm(t("Hoàn lại lượt dùng này? Tồn voucher sẽ tăng lại."))) return;
    try {
      await undoMut.mutateAsync({ id, voucherId: voucher.id });
      toast.success(t("Đã hoàn lượt dùng"));
    } catch {
      toast.error(t("Lỗi hoàn lượt dùng"));
    }
  };

  return (
    <Dialog open={!!voucher} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("Lịch sử dùng")} — {voucher?.ten}</DialogTitle>
        </DialogHeader>
        {isLoading ? (
          <Skeleton className="h-24 w-full" />
        ) : logs.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">{t("Chưa có lượt dùng nào")}</p>
        ) : (
          <div className="max-h-80 overflow-auto">
            <table className="w-full text-xs">
              <thead className="bg-muted/50">
                <tr className="text-left">
                  <th className="py-1.5 px-2 font-medium">{t("Đoàn")}</th>
                  <th className="py-1.5 px-2 font-medium text-right">{t("Số lượng")}</th>
                  <th className="py-1.5 px-2 font-medium text-right">{t("Giá trị")}</th>
                  <th className="py-1.5 px-2 font-medium">{t("Ngày")}</th>
                  <th className="py-1.5 px-2"></th>
                </tr>
              </thead>
              <tbody>
                {logs.map((r) => (
                  <tr key={r.id} className="border-t">
                    <td className="py-1.5 px-2">{r.ten_doan || (r.doan_id ? `#${r.doan_id}` : "—")}</td>
                    <td className="py-1.5 px-2 text-right tabular-nums">{r.so_luong}</td>
                    <td className="py-1.5 px-2 text-right tabular-nums">{r.gia_tri > 0 ? `${fmt(r.gia_tri)} ₫` : "—"}</td>
                    <td className="py-1.5 px-2 text-muted-foreground">
                      {r.ngay_dung ? new Date(r.ngay_dung).toLocaleDateString("vi-VN") : "—"}
                    </td>
                    <td className="py-1.5 px-2 text-right">
                      <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
                        title={t("Hoàn lượt dùng")} onClick={() => handleUndo(r.id)}>
                        <RotateCcw className="h-3.5 w-3.5" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export default function VoucherPage() {
  const { user, isLoading } = useAuth();
  if (isLoading) return null;
  if (user?.role !== "admin") return <AccessDenied />;
  return <VoucherPageContent />;
}
