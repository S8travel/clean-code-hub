import { Fragment, useState, useMemo } from "react";
import { format } from "date-fns";
import { Plus, Wallet, Trash2, Clock, CheckCircle2, FileText, ChevronRight, ChevronDown, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import { errMsg } from "@/lib/error";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import {
  useHoanUngList, useDeleteHoanUng, LOAI_CHI_HOAN_UNG_OPTS,
  type HoanUngRow,
} from "@/hooks/use-hoan-ung";
import { exportDnttKhacHoanUngWord } from "@/lib/export-dntt-khac-word";
import HoanUngForm from "@/components/hoan-ung/HoanUngForm";

const fmt = (n: number) => Math.round(n).toLocaleString("vi-VN");

const TRANG_THAI_OPTS = [
  { value: "",          label: "Tất cả" },
  { value: "cho_duyet", label: "Chờ duyệt" },
  { value: "da_duyet",  label: "Đã duyệt" },
  { value: "tu_choi",   label: "Từ chối" },
];

const TRANG_THAI_BADGE: Record<string, { label: string; cls: string }> = {
  cho_duyet: { label: "Chờ duyệt", cls: "bg-amber-100 text-amber-700" },
  da_duyet:  { label: "Đã duyệt",  cls: "bg-blue-100 text-blue-700" },
  tu_choi:   { label: "Từ chối",   cls: "bg-red-100 text-red-700" },
  da_huy:    { label: "Đã hủy",    cls: "bg-muted text-muted-foreground" },
};

const PAYMENT_BADGE: Record<string, { label: string; cls: string }> = {
  unpaid:  { label: "Chưa thanh toán", cls: "bg-muted text-muted-foreground" },
  partial: { label: "Thanh toán 1 phần", cls: "bg-yellow-100 text-yellow-700" },
  paid:    { label: "Đã thanh toán", cls: "bg-emerald-100 text-emerald-700" },
};

export default function HoanUngPage() {
  const { user } = useAuth();
  const [filterLoaiChi, setFilterLoaiChi] = useState("");
  const [filterTrangThai, setFilterTrangThai] = useState("");
  const [filterMine, setFilterMine] = useState(false);
  const [search, setSearch] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<number | null>(null);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const toggleExpanded = (id: number) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const { data: rows = [], isLoading } = useHoanUngList({
    loai_chi:     filterLoaiChi || null,
    trang_thai:   filterTrangThai || null,
    nguoi_ung_id: filterMine ? user?.user_id ?? null : null,
  });
  const deleteMut = useDeleteHoanUng();

  const filtered = useMemo(() => {
    if (!search.trim()) return rows;
    const k = search.toLowerCase();
    return rows.filter((r) =>
      (r.mo_ta ?? "").toLowerCase().includes(k) ||
      (r.ten_nha_cung_cap ?? "").toLowerCase().includes(k) ||
      (r.nguoi_ung_ho_ten ?? "").toLowerCase().includes(k),
    );
  }, [rows, search]);

  // Stats
  const totalCho = rows.filter((r) => r.trang_thai_duyet === "cho_duyet").length;
  const totalDuyet = rows.filter((r) => r.trang_thai_duyet === "da_duyet").length;
  const totalPaid = rows.filter((r) => r.payment_status === "paid").length;
  const tongTien = rows
    .filter((r) => r.trang_thai_duyet !== "tu_choi" && r.trang_thai_duyet !== "da_huy")
    .reduce((s, r) => s + Number(r.so_tien), 0);

  // In Giấy đề nghị thanh toán (Word) — reuse mẫu ĐNTT khác/hoàn ứng
  const handlePrint = (r: HoanUngRow) => {
    const srcItems = r.hoan_ung_items && r.hoan_ung_items.length > 0
      ? r.hoan_ung_items
      : [{ loai_chi: r.loai_chi_hoan_ung ?? "khac", mo_ta: r.mo_ta ?? "", so_tien: Number(r.so_tien), ngay: null }];
    const items = srcItems.map((it) => {
      const lc = LOAI_CHI_HOAN_UNG_OPTS.find((o) => o.value === it.loai_chi)?.label ?? it.loai_chi;
      const datePrefix = it.ngay ? `${format(new Date(it.ngay), "dd/MM/yyyy")} · ` : "";
      const noiDung = `${datePrefix}${lc ? `${lc}: ` : ""}${it.mo_ta ?? ""}`.trim();
      return {
        mo_ta: noiDung || "—",
        so_luong: 1,
        don_gia: Number(it.so_tien),
        thanh_tien: Number(it.so_tien),
      };
    });
    exportDnttKhacHoanUngWord({
      maDoan: "",
      tenNguoiNhan: r.nguoi_ung_ho_ten || r.ten_nha_cung_cap || "—",
      soTaiKhoan: r.so_tai_khoan,
      nganHang: r.ngan_hang,
      lyDo: `Hoàn ứng chi phí văn phòng${r.mo_ta ? ` — ${r.mo_ta}` : ""}`,
      items,
      ngayLap: r.tao_luc ?? undefined,
      ngayCanThanhToan: r.ngay_can_thanh_toan,
    }).then(
      () => toast.success("Đã xuất Giấy đề nghị thanh toán"),
      (e: unknown) => toast.error("Lỗi xuất Word: " + (errMsg(e) || "")),
    );
  };

  const handleDelete = () => {
    if (deleteTarget == null) return;
    deleteMut.mutate(deleteTarget, {
      onSuccess: () => { toast.success("Đã xóa yêu cầu"); setDeleteTarget(null); },
      onError: (e: unknown) => toast.error("Lỗi: " + (errMsg(e) || "Không xóa được")),
    });
  };

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="shrink-0 flex items-center justify-between px-6 py-4 border-b bg-background">
        <div className="flex items-center gap-2">
          <Wallet className="h-5 w-5 text-primary" />
          <h1 className="text-xl font-bold">Chi phí văn phòng</h1>
          {!isLoading && (
            <span className="text-sm text-muted-foreground ml-1">({rows.length})</span>
          )}
        </div>
        <Button onClick={() => setFormOpen(true)} className="gap-1.5">
          <Plus className="h-4 w-4" /> Tạo yêu cầu
        </Button>
      </div>

      {/* Stats */}
      {rows.length > 0 && (
        <div className="shrink-0 px-6 pt-3 pb-1 grid grid-cols-4 gap-3">
          {[
            { icon: FileText,     label: "Tổng yêu cầu",   value: rows.length,   cls: "text-foreground" },
            { icon: Clock,        label: "Chờ duyệt",       value: totalCho,      cls: "text-amber-600" },
            { icon: CheckCircle2, label: "Đã duyệt",        value: totalDuyet,    cls: "text-blue-600" },
            { icon: Wallet,       label: "Đã thanh toán",   value: totalPaid,     cls: "text-emerald-600" },
          ].map(({ icon: Icon, label, value, cls }) => (
            <div key={label} className="rounded-lg border border-border bg-card p-3">
              <div className="flex items-center gap-1.5 mb-1">
                <Icon className={cn("h-3.5 w-3.5", cls)} />
                <span className="text-xs text-muted-foreground">{label}</span>
              </div>
              <p className={cn("text-2xl font-bold", cls)}>{value}</p>
            </div>
          ))}
        </div>
      )}

      {/* Toolbar */}
      <div className="shrink-0 px-6 py-3 border-b bg-muted/20 flex flex-wrap items-center gap-2">
        <Input
          placeholder="Tìm mô tả, người ứng..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-8 text-xs w-[220px]"
        />

        <Select value={filterLoaiChi || "_all"} onValueChange={(v) => setFilterLoaiChi(v === "_all" ? "" : v)}>
          <SelectTrigger className="h-8 text-xs w-[160px]">
            <SelectValue placeholder="Loại chi" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="_all" className="text-xs">Tất cả loại chi</SelectItem>
            {LOAI_CHI_HOAN_UNG_OPTS.map((o) => (
              <SelectItem key={o.value} value={o.value} className="text-xs">{o.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={filterTrangThai || "_all"} onValueChange={(v) => setFilterTrangThai(v === "_all" ? "" : v)}>
          <SelectTrigger className="h-8 text-xs w-[140px]">
            <SelectValue placeholder="Trạng thái" />
          </SelectTrigger>
          <SelectContent>
            {TRANG_THAI_OPTS.map((o) => (
              <SelectItem key={o.value || "_all"} value={o.value || "_all"} className="text-xs">{o.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <button
          type="button"
          onClick={() => setFilterMine((v) => !v)}
          className={cn(
            "h-8 px-2.5 rounded-md text-xs font-medium border transition-colors",
            filterMine
              ? "bg-primary text-primary-foreground border-primary"
              : "border-border hover:bg-muted",
          )}
        >
          Của tôi
        </button>

        {rows.length > 0 && (
          <span className="ml-auto text-xs text-muted-foreground">
            Tổng (chờ + duyệt): <strong className="text-foreground tabular-nums">{fmt(tongTien)} ₫</strong>
          </span>
        )}
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        {isLoading ? (
          <p className="text-center text-sm text-muted-foreground py-20">Đang tải...</p>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
            <Wallet className="h-10 w-10 mb-3 opacity-30" />
            <p className="text-sm">Chưa có yêu cầu hoàn ứng nào</p>
            <p className="text-xs text-muted-foreground/60 mt-1">Bấm "Tạo yêu cầu" để bắt đầu</p>
          </div>
        ) : (
          <table className="w-full text-xs">
            <thead className="bg-[#E6F1FB] sticky top-0">
              <tr>
                <th className="py-1.5 px-2 w-6" />
                <th className="py-1.5 px-2 text-left font-medium">Người ứng</th>
                <th className="py-1.5 px-2 text-left font-medium">Mô tả</th>
                <th className="py-1.5 px-2 text-center font-medium">Mục</th>
                <th className="py-1.5 px-2 text-right font-medium">Tổng tiền</th>
                <th className="py-1.5 px-2 text-center font-medium">Trạng thái</th>
                <th className="py-1.5 px-2 text-center font-medium">Thanh toán</th>
                <th className="py-1.5 px-2 text-center font-medium">Ngày tạo</th>
                <th className="py-1.5 px-2 w-16" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => {
                const ttBadge = TRANG_THAI_BADGE[r.trang_thai_duyet] ?? TRANG_THAI_BADGE.cho_duyet;
                const payBadge = PAYMENT_BADGE[r.payment_status] ?? PAYMENT_BADGE.unpaid;
                const isMine = r.nguoi_ung_id === user?.user_id;
                const canDelete = r.trang_thai_duyet === "tu_choi" && isMine;
                const items = r.hoan_ung_items ?? [];
                const isMulti = items.length > 1;
                const isOpen = expanded.has(r.id);
                return (
                  <Fragment key={r.id}>
                    <tr
                      className={cn(
                        "border-b border-border/40 hover:bg-muted/30",
                        items.length > 0 && "cursor-pointer",
                      )}
                      onClick={() => items.length > 0 && toggleExpanded(r.id)}
                    >
                      <td className="py-1.5 px-2 text-center">
                        {items.length > 0 && (
                          isOpen ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground inline" />
                                 : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground inline" />
                        )}
                      </td>
                      <td className="py-1.5 px-2">
                        <p className="font-medium truncate max-w-[160px]">{r.nguoi_ung_ho_ten ?? r.ten_nha_cung_cap ?? "—"}</p>
                        {r.so_tai_khoan && (
                          <p className="text-[11px] text-muted-foreground truncate max-w-[180px]">
                            {r.so_tai_khoan}{r.ngan_hang ? ` · ${r.ngan_hang}` : ""}
                          </p>
                        )}
                      </td>
                      <td className="py-1.5 px-2 max-w-[320px]">
                        <p className="truncate">{r.mo_ta ?? "—"}</p>
                      </td>
                      <td className="py-1.5 px-2 text-center">
                        {items.length > 0 ? (
                          <Badge variant="outline" className="text-[10px] font-normal">
                            {items.length} mục
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="py-1.5 px-2 text-right tabular-nums font-medium">
                        {fmt(Number(r.so_tien))} ₫
                      </td>
                      <td className="py-1.5 px-2 text-center">
                        <span className={cn("inline-block px-2 py-0.5 rounded-full text-[10px] font-medium", ttBadge.cls)}>
                          {ttBadge.label}
                        </span>
                      </td>
                      <td className="py-1.5 px-2 text-center">
                        <span className={cn("inline-block px-2 py-0.5 rounded-full text-[10px] font-medium", payBadge.cls)}>
                          {payBadge.label}
                        </span>
                      </td>
                      <td className="py-1.5 px-2 text-center text-muted-foreground whitespace-nowrap">
                        {r.tao_luc ? format(new Date(r.tao_luc), "dd/MM/yyyy") : "—"}
                      </td>
                      <td className="py-1.5 px-2 text-center">
                        <div className="flex items-center justify-center gap-0.5">
                          <button
                            onClick={(e) => { e.stopPropagation(); handlePrint(r); }}
                            className="text-muted-foreground hover:text-primary p-1"
                            title="In đề nghị thanh toán"
                          >
                            <Printer className="h-3.5 w-3.5" />
                          </button>
                          {canDelete && (
                            <button
                              onClick={(e) => { e.stopPropagation(); setDeleteTarget(r.id); }}
                              className="text-muted-foreground hover:text-destructive p-1"
                              title="Xóa (chỉ khi đã bị từ chối)"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                    {isOpen && items.length > 0 && (
                      <tr className="border-b border-border/40 bg-muted/20">
                        <td />
                        <td colSpan={8} className="py-2 px-2">
                          <div className="space-y-1.5">
                            {items.map((it, idx) => {
                              const lcLabel = LOAI_CHI_HOAN_UNG_OPTS.find((o) => o.value === it.loai_chi)?.label ?? it.loai_chi;
                              return (
                                <div key={idx} className="flex items-center gap-2 text-[11px] py-1 border-b border-border/30 last:border-0">
                                  <span className="text-muted-foreground w-4 shrink-0">{idx + 1}.</span>
                                  {it.ngay && (
                                    <span className="text-muted-foreground tabular-nums shrink-0">
                                      {format(new Date(it.ngay), "dd/MM/yyyy")}
                                    </span>
                                  )}
                                  <Badge variant="outline" className="text-[10px] font-normal shrink-0">{lcLabel}</Badge>
                                  <span className="flex-1 truncate">{it.mo_ta}</span>
                                  {it.hoa_don_url && (
                                    <a
                                      href={it.hoa_don_url}
                                      target="_blank"
                                      rel="noreferrer"
                                      onClick={(e) => e.stopPropagation()}
                                      className="text-blue-600 hover:underline inline-flex items-center gap-0.5 shrink-0"
                                    >
                                      <FileText className="h-3 w-3" /> Hóa đơn
                                    </a>
                                  )}
                                  <span className="tabular-nums font-medium w-[100px] text-right shrink-0">
                                    {fmt(Number(it.so_tien))} ₫
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Form modal */}
      <HoanUngForm open={formOpen} onClose={() => setFormOpen(false)} />

      {/* Delete confirm */}
      <AlertDialog open={deleteTarget != null} onOpenChange={(v) => !v && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Xóa yêu cầu hoàn ứng?</AlertDialogTitle>
            <AlertDialogDescription>
              Yêu cầu đã từ chối sẽ bị xóa vĩnh viễn. Hành động này không thể hoàn tác.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Hủy</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleteMut.isPending}
              className="bg-destructive hover:bg-destructive/90"
            >
              Xóa
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
