import { useState } from "react";
import { format } from "date-fns";
import { toast } from "sonner";
import { Printer, Ban } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { DeleteDialog } from "@/components/DeleteDialog";
import { useDNTTList, useUpdateDNTT, useDeleteDNTT } from "@/hooks/use-chi-phi";
import { useCancelDNTT } from "@/hooks/use-dntt";
import { externalSupabase } from "@/lib/supabase-external";

const fmt = (n: number) => n.toLocaleString("vi-VN");

const EXTERNAL_URL = "https://lflsbwoqzmbknzdpaequ.supabase.co/functions/v1/xuat-word-dntt-ks";
const PUBLISHABLE_KEY = "sb_publishable_NDWgz5PzI38R-ouTHShYaw_6YhYjOIw";

interface Props {
  doanId: number;
}

async function downloadDNTTWord(doanId: number, dnttIds: number[]) {
  // Edge function xuat-word-dntt-ks có verify_jwt=true → Authorization phải là JWT
  // session thật. Publishable key không phải JWT (gateway từ chối sau khi disable
  // legacy keys) — nó chỉ dùng cho header apikey để định danh project.
  const token = (await externalSupabase.auth.getSession()).data.session?.access_token;
  if (!token) throw new Error("Phiên đăng nhập đã hết hạn — vui lòng đăng nhập lại");
  const res = await fetch(EXTERNAL_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "apikey": PUBLISHABLE_KEY,
      "Authorization": `Bearer ${token}`,
    },
    body: JSON.stringify({ doan_id: doanId, dntt_ids: dnttIds }),
  });
  if (!res.ok) throw new Error(await res.text());
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `DNTT_KS_${doanId}.docx`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export default function DNTTTab({ doanId }: Props) {
  const { data: dnttList = [], isLoading } = useDNTTList(doanId);
  const updateMut = useUpdateDNTT();
  const deleteMut = useDeleteDNTT();
  const cancelMut = useCancelDNTT();

  const [deleteTarget, setDeleteTarget] = useState<{ id: number; refId?: number | null; moTa: string } | null>(null);
  const [cancelTarget, setCancelTarget] = useState<{ id: number; moTa: string } | null>(null);
  const [printingId, setPrintingId] = useState<number | null>(null);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [batchPrinting, setBatchPrinting] = useState(false);

  if (isLoading) return <div className="text-sm text-muted-foreground py-4">Đang tải...</div>;

  if (dnttList.length === 0) {
    return <p className="text-sm text-muted-foreground py-4">Chưa có đề nghị thanh toán nào.</p>;
  }

  const toggleSelect = (id: number) => {
    setSelectedIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
  };

  const selectAll = () => setSelectedIds(dnttList.map((d) => d.id));
  const clearAll = () => setSelectedIds([]);
  const allSelected = selectedIds.length === dnttList.length && dnttList.length > 0;
  const ksSelectedCount = selectedIds.filter((id) => dnttList.find((d) => d.id === id && d.ref_loai === "khach_san")).length;

  const handleResend = (id: number) => {
    updateMut.mutate(
      { id, doanId, trang_thai_duyet: "cho_duyet", ghi_chu: null },
      { onSuccess: () => toast.success("Đã gửi lại đề nghị TT") },
    );
  };

  const handleDeleteConfirm = () => {
    if (!deleteTarget) return;
    deleteMut.mutate(
      { id: deleteTarget.id, doanId, refId: deleteTarget.refId },
      {
        onSuccess: () => {
          toast.success("Đã xóa đề nghị thanh toán");
          setDeleteTarget(null);
        },
      },
    );
  };

  const handleCancelConfirm = () => {
    if (!cancelTarget) return;
    cancelMut.mutate(
      { id: cancelTarget.id },
      {
        onSuccess: () => {
          toast.success("Đã hủy đề nghị thanh toán");
          setCancelTarget(null);
        },
        onError: (err: any) => toast.error(err?.message || "Lỗi khi hủy đề nghị"),
      },
    );
  };

  const handlePrintSingle = async (dnttId: number) => {
    setPrintingId(dnttId);
    try {
      await downloadDNTTWord(doanId, [dnttId]);
      toast.success("Đã xuất file Word");
    } catch (err: any) {
      toast.error("Lỗi xuất file: " + (err?.message || ""));
    } finally {
      setPrintingId(null);
    }
  };

  const handlePrintSelected = async () => {
    const ksIds = selectedIds.filter((id) => dnttList.find((d) => d.id === id && d.ref_loai === "khach_san"));
    if (ksIds.length === 0) {
      toast.error("Không có ĐNTT khách sạn nào được chọn");
      return;
    }
    setBatchPrinting(true);
    try {
      await downloadDNTTWord(doanId, ksIds);
      toast.success("Đã xuất file Word");
    } catch (err: any) {
      toast.error("Lỗi xuất file: " + (err?.message || ""));
    } finally {
      setBatchPrinting(false);
    }
  };

  const canDelete = (d: any) => d.trang_thai_duyet === "tu_choi";
  const isKS = (d: any) => d.ref_loai === "khach_san";

  return (
    <div className="space-y-3">
      {/* Toolbar select all + print */}
      <div className="flex items-center gap-3 py-1">
        <div className="flex items-center gap-2">
          <Checkbox
            checked={allSelected}
            onCheckedChange={(v) => (v ? selectAll() : clearAll())}
            id="select-all-dntt"
          />
          <label htmlFor="select-all-dntt" className="text-xs text-muted-foreground cursor-pointer select-none">
            {selectedIds.length > 0 ? `Đã chọn ${selectedIds.length}/${dnttList.length}` : "Chọn tất cả"}
          </label>
        </div>
        {selectedIds.length > 0 && (
          <>
            <Button
              size="sm"
              className="h-7 text-xs"
              onClick={handlePrintSelected}
              disabled={batchPrinting || ksSelectedCount === 0}
              title={ksSelectedCount === 0 ? "Không có ĐNTT khách sạn nào được chọn" : undefined}
            >
              <Printer className="h-3.5 w-3.5 mr-1" />
              {batchPrinting ? "Đang xuất..." : `In ĐNTT KS${ksSelectedCount > 0 ? ` (${ksSelectedCount})` : ""}`}
            </Button>
            <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={clearAll}>
              Bỏ chọn
            </Button>
          </>
        )}
      </div>

      {/* DNTT cards */}
      <div className="space-y-3">
        {dnttList.map((d) => {
          const selected = selectedIds.includes(d.id);
          const isPaid = d.payment_status === "paid";
          const isHuy = d.trang_thai_duyet === "da_huy";
          return (
            <Card
              key={d.id}
              className={`border-border transition-colors ${selected ? "border-primary/50 bg-primary/5" : ""} ${isPaid || isHuy ? "opacity-75" : ""}`}
            >
              <CardContent className="p-4 space-y-2">
                {/* Header */}
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-start gap-2 min-w-0">
                    <Checkbox
                      checked={selected}
                      onCheckedChange={() => toggleSelect(d.id)}
                      className="mt-0.5 shrink-0"
                    />
                    <div className="space-y-0.5 min-w-0">
                      <p className="text-sm font-medium truncate">{d.mo_ta || "—"}</p>
                      <p className="text-xs text-muted-foreground">
                        {d.ten_nha_cung_cap || "—"}
                        {d.so_tai_khoan && ` · ${d.so_tai_khoan}`}
                        {d.ngan_hang && ` · ${d.ngan_hang}`}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {isKS(d) && !isHuy && (
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-6 w-6 text-muted-foreground hover:text-primary"
                        onClick={() => handlePrintSingle(d.id)}
                        disabled={printingId === d.id}
                        title="In ĐNTT"
                      >
                        <Printer className="h-3.5 w-3.5" />
                      </Button>
                    )}
                    <StatusBadge d={d} />
                    {canDelete(d) && (
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-6 w-6 text-muted-foreground hover:text-destructive"
                        title="Xóa"
                        onClick={() => setDeleteTarget({ id: d.id, refId: d.ref_id, moTa: d.mo_ta || "ĐNTT" })}
                      >
                        <span className="text-[11px]">Xóa</span>
                      </Button>
                    )}
                  </div>
                </div>

                {/* Amounts */}
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                  <div>
                    <span className="text-muted-foreground">{d.la_coc ? "Cọc:" : "Số tiền:"}</span>{" "}
                    <span className="font-semibold text-primary">{fmt(d.so_tien)} VND</span>
                  </div>
                  {d.so_tien > (d.paid_amount || 0) && d.payment_status !== "unpaid" && (
                    <div>
                      <span className="text-muted-foreground">Còn lại:</span>{" "}
                      <span>{fmt(d.so_tien - (d.paid_amount || 0))} VND</span>
                    </div>
                  )}
                </div>

                {/* Date */}
                <p className="text-[11px] text-muted-foreground">
                  {format(new Date(d.created_at), "dd/MM/yyyy HH:mm")}
                </p>

                {/* Footer actions */}
                <DNTTFooter
                  d={d}
                  onResend={handleResend}
                  onCancel={() => setCancelTarget({ id: d.id, moTa: d.mo_ta || "ĐNTT" })}
                />
              </CardContent>
            </Card>
          );
        })}
      </div>

      <DeleteDialog
        open={!!deleteTarget}
        name={deleteTarget?.moTa || ""}
        onConfirm={handleDeleteConfirm}
        onCancel={() => setDeleteTarget(null)}
        isDeleting={deleteMut.isPending}
      />

      <DeleteDialog
        open={!!cancelTarget}
        name={cancelTarget?.moTa || ""}
        onConfirm={handleCancelConfirm}
        onCancel={() => setCancelTarget(null)}
        isDeleting={cancelMut.isPending}
      />
    </div>
  );
}

function StatusBadge({ d }: { d: any }) {
  if (d.trang_thai_duyet === "da_huy") {
    return <Badge variant="secondary" className="text-[10px]">Đã hủy</Badge>;
  }

  if (d.payment_status === "paid") {
    return (
      <div className="text-right">
        <Badge className="text-[10px] bg-emerald-100 text-emerald-800 border-emerald-300">Đã thanh toán</Badge>
        {d.thanh_toan_luc && (
          <p className="text-[10px] text-muted-foreground mt-0.5">
            {format(new Date(d.thanh_toan_luc), "dd/MM/yyyy")}
          </p>
        )}
      </div>
    );
  }

  switch (d.trang_thai_duyet) {
    case "cho_duyet":
      return <Badge className="text-[10px] bg-yellow-100 text-yellow-800 border-yellow-300">Chờ duyệt ĐNTT</Badge>;
    case "da_duyet":
      return <Badge className="text-[10px] bg-teal-100 text-teal-800 border-teal-300">Đã duyệt ĐNTT</Badge>;
    case "tu_choi":
      return <Badge variant="destructive" className="text-[10px]">Từ chối</Badge>;
    default:
      return null;
  }
}

function DNTTFooter({ d, onResend, onCancel }: {
  d: any;
  onResend: (id: number) => void;
  onCancel: (id: number) => void;
}) {
  if (d.trang_thai_duyet === "da_huy") return null;
  if (d.payment_status === "paid") return null;

  switch (d.trang_thai_duyet) {
    case "cho_duyet":
      return (
        <div className="pt-1.5 border-t border-border flex items-center justify-between">
          <p className="text-[11px] text-muted-foreground">Đang chờ kế toán duyệt</p>
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs text-destructive hover:text-destructive"
            onClick={() => onCancel(d.id)}
          >
            <Ban className="h-3 w-3 mr-1" /> Hủy
          </Button>
        </div>
      );
    case "da_duyet":
      return (
        <div className="pt-1.5 border-t border-border flex items-center justify-between">
          <p className="text-[11px] text-muted-foreground">Chờ chuyển khoản (UNC)</p>
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs text-destructive hover:text-destructive"
            onClick={() => onCancel(d.id)}
          >
            <Ban className="h-3 w-3 mr-1" /> Hủy
          </Button>
        </div>
      );
    case "tu_choi":
      return (
        <div className="pt-1.5 border-t border-border space-y-1.5">
          {d.ghi_chu && <p className="text-[11px] text-destructive">Lý do từ chối: {d.ghi_chu}</p>}
          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => onResend(d.id)}>
            Gửi lại
          </Button>
        </div>
      );
    default:
      return null;
  }
}
