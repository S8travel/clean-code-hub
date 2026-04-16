import { useState, useMemo } from "react";
import { format } from "date-fns";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { CalendarIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  useDinhKyChiPhiList,
  useCreateBatchDNTT,
  useNccOptions,
  type DinhKyChiPhiRow,
} from "@/hooks/use-thanh-toan-dinh-ky";

const fmt = (n: number) => n.toLocaleString("vi-VN");

const danhMucLabel: Record<string, string> = {
  khach_san: "Khách sạn",
  nha_hang: "Nhà hàng",
  xe: "Xe",
  dich_vu: "Dịch vụ",
  bao_hiem: "Bảo hiểm",
};

const ttLabel: Record<string, { text: string; cls: string }> = {
  unpaid: { text: "Chưa TT", cls: "bg-muted text-muted-foreground" },
  partial_paid: { text: "Một phần", cls: "bg-amber-100 text-amber-700" },
  paid: { text: "Đã TT", cls: "bg-emerald-100 text-emerald-700" },
};

export default function ThanhToanDinhKyPage() {
  const [filterNcc, setFilterNcc] = useState<string>("all");
  const [tuNgay, setTuNgay] = useState<Date | undefined>();
  const [denNgay, setDenNgay] = useState<Date | undefined>();
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [batchOpen, setBatchOpen] = useState(false);
  const [batchMoTa, setBatchMoTa] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const { data: nccOptions = [] } = useNccOptions();
  const { data: rows = [], isLoading } = useDinhKyChiPhiList({
    nccId: filterNcc !== "all" ? Number(filterNcc) : null,
    tuNgay: tuNgay ? format(tuNgay, "yyyy-MM-dd") : null,
    denNgay: denNgay ? format(denNgay, "yyyy-MM-dd") : null,
  });

  const createBatch = useCreateBatchDNTT();

  // Group by NCC for display
  const grouped = useMemo(() => {
    const map: Record<string, DinhKyChiPhiRow[]> = {};
    rows.forEach((r) => {
      const key = String(r.nha_cung_cap_id ?? "khong_ncc");
      if (!map[key]) map[key] = [];
      map[key].push(r);
    });
    return map;
  }, [rows]);

  const selectedRows = rows.filter((r) => selectedIds.includes(r.id));
  const selectedTotal = selectedRows.reduce((s, r) => {
    const thanhTien = r.thanh_tien_thuc_te ?? r.thanh_tien;
    return s + Math.max(0, thanhTien - r.so_tien_da_tt);
  }, 0);

  // Check if selected rows all belong to same NCC
  const selectedNccIds = [...new Set(selectedRows.map((r) => r.nha_cung_cap_id))];
  const canCreateBatch = selectedIds.length > 0 && selectedNccIds.length === 1;

  const toggleSelect = (id: number) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  const toggleSelectAll = (groupRows: DinhKyChiPhiRow[]) => {
    const groupIds = groupRows.map((r) => r.id);
    const allSelected = groupIds.every((id) => selectedIds.includes(id));
    if (allSelected) {
      setSelectedIds((prev) => prev.filter((id) => !groupIds.includes(id)));
    } else {
      setSelectedIds((prev) => [...new Set([...prev, ...groupIds])]);
    }
  };

  const handleCreateBatch = async () => {
    if (!canCreateBatch) return;
    const nccId = selectedNccIds[0];
    if (!nccId) { toast.error("Chưa có nhà cung cấp cho khoản này"); return; }

    const allocations = selectedRows.map((r) => ({
      chi_phi_id: r.id,
      so_tien: Math.max(0, (r.thanh_tien_thuc_te ?? r.thanh_tien) - r.so_tien_da_tt),
    }));

    const ncc = nccOptions.find((n) => n.id === nccId);
    const defaultMoTa = batchMoTa || `Thanh toán định kỳ – ${ncc?.ten || "NCC"} – ${format(new Date(), "MM/yyyy")}`;

    setSubmitting(true);
    try {
      await createBatch.mutateAsync({
        nccId,
        moTa: defaultMoTa,
        chiPhiIds: selectedRows.map((r) => r.id),
        allocations,
        soTien: selectedTotal,
      });
      toast.success("Đã tạo đề nghị thanh toán định kỳ");
      setBatchOpen(false);
      setBatchMoTa("");
      setSelectedIds([]);
    } catch (err: any) {
      toast.error("Lỗi: " + (err?.message || "Không thể tạo ĐNTT"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="p-6 space-y-5 max-w-6xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">Thanh toán định kỳ</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Tổng hợp chi phí định kỳ theo nhà cung cấp, tạo đề nghị TT gộp
          </p>
        </div>
        {selectedIds.length > 0 && (
          <div className="flex items-center gap-3">
            <span className="text-sm text-muted-foreground">
              Đã chọn {selectedIds.length} khoản · Tổng: <span className="font-semibold text-foreground">{fmt(selectedTotal)} ₫</span>
            </span>
            <Button
              size="sm"
              disabled={!canCreateBatch}
              onClick={() => setBatchOpen(true)}
              title={!canCreateBatch ? "Chỉ chọn cùng 1 nhà cung cấp" : undefined}
            >
              Tạo ĐNTT gộp
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setSelectedIds([])}>
              Bỏ chọn
            </Button>
          </div>
        )}
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <Select value={filterNcc} onValueChange={setFilterNcc}>
          <SelectTrigger className="w-[220px] h-8 text-sm">
            <SelectValue placeholder="Tất cả nhà cung cấp" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tất cả nhà cung cấp</SelectItem>
            {nccOptions.map((n) => (
              <SelectItem key={n.id} value={String(n.id)}>{n.ten}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Từ ngày */}
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="h-8 text-sm gap-2">
              <CalendarIcon className="h-3.5 w-3.5" />
              {tuNgay ? format(tuNgay, "dd/MM/yyyy") : "Từ ngày"}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar mode="single" selected={tuNgay} onSelect={setTuNgay} initialFocus />
          </PopoverContent>
        </Popover>

        {/* Đến ngày */}
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="h-8 text-sm gap-2">
              <CalendarIcon className="h-3.5 w-3.5" />
              {denNgay ? format(denNgay, "dd/MM/yyyy") : "Đến ngày"}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar mode="single" selected={denNgay} onSelect={setDenNgay} initialFocus />
          </PopoverContent>
        </Popover>

        {(tuNgay || denNgay || filterNcc !== "all") && (
          <Button
            variant="ghost"
            size="sm"
            className="h-8 text-sm"
            onClick={() => { setTuNgay(undefined); setDenNgay(undefined); setFilterNcc("all"); }}
          >
            Xóa bộ lọc
          </Button>
        )}
      </div>

      {isLoading && (
        <div className="text-sm text-muted-foreground">Đang tải...</div>
      )}

      {!isLoading && rows.length === 0 && (
        <div className="rounded-lg border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
          Không có chi phí định kỳ nào chưa thanh toán
        </div>
      )}

      {/* Grouped by NCC */}
      {Object.entries(grouped).map(([nccKey, groupRows]) => {
        const firstRow = groupRows[0];
        const nccName = firstRow.ten_ncc || "Chưa có NCC";
        const nccStk = firstRow.ncc_so_tai_khoan;
        const nccNganHang = firstRow.ncc_ngan_hang;
        const groupTotal = groupRows.reduce((s, r) => {
          const tt = r.thanh_tien_thuc_te ?? r.thanh_tien;
          return s + Math.max(0, tt - r.so_tien_da_tt);
        }, 0);
        const groupIds = groupRows.map((r) => r.id);
        const allSelected = groupIds.every((id) => selectedIds.includes(id));

        return (
          <Card key={nccKey}>
            <CardHeader className="py-3 px-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Checkbox
                    checked={allSelected}
                    onCheckedChange={() => toggleSelectAll(groupRows)}
                  />
                  <div>
                    <CardTitle className="text-sm font-semibold">{nccName}</CardTitle>
                    {nccStk && (
                      <p className="text-xs text-muted-foreground mt-0.5">
                        STK: {nccStk} · {nccNganHang || "—"}
                      </p>
                    )}
                  </div>
                </div>
                <div className="text-sm font-semibold text-orange-600">
                  Còn lại: {fmt(groupTotal)} ₫
                </div>
              </div>
            </CardHeader>
            <CardContent className="px-4 pb-3 pt-0">
              <Table>
                <TableHeader>
                  <TableRow className="text-xs">
                    <TableHead className="w-8 py-1" />
                    <TableHead className="py-1">Đoàn</TableHead>
                    <TableHead className="py-1">Ngày đi</TableHead>
                    <TableHead className="py-1">Danh mục</TableHead>
                    <TableHead className="py-1">Mô tả</TableHead>
                    <TableHead className="py-1 text-right">Thành tiền</TableHead>
                    <TableHead className="py-1 text-right">Đã TT</TableHead>
                    <TableHead className="py-1 text-right">Còn lại</TableHead>
                    <TableHead className="py-1 text-center">Trạng thái</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {groupRows.map((r) => {
                    const thanhTien = r.thanh_tien_thuc_te ?? r.thanh_tien;
                    const conLai = Math.max(0, thanhTien - r.so_tien_da_tt);
                    const tt = ttLabel[r.trang_thai_thanh_toan] ?? ttLabel.unpaid;
                    return (
                      <TableRow key={r.id} className={cn("text-xs", selectedIds.includes(r.id) && "bg-primary/5")}>
                        <TableCell className="py-1.5">
                          <Checkbox
                            checked={selectedIds.includes(r.id)}
                            onCheckedChange={() => toggleSelect(r.id)}
                            className="h-3.5 w-3.5"
                          />
                        </TableCell>
                        <TableCell className="py-1.5 font-medium">{r.ten_doan || `Đoàn #${r.doan_id}`}</TableCell>
                        <TableCell className="py-1.5 text-muted-foreground whitespace-nowrap">
                          {r.ngay_kh_di ? format(new Date(r.ngay_kh_di + "T00:00:00"), "dd/MM/yyyy") : "—"}
                        </TableCell>
                        <TableCell className="py-1.5 text-muted-foreground">
                          {danhMucLabel[r.danh_muc] || r.danh_muc}
                        </TableCell>
                        <TableCell className="py-1.5 max-w-[180px] truncate">{r.mo_ta || "—"}</TableCell>
                        <TableCell className="py-1.5 text-right">{fmt(thanhTien)} ₫</TableCell>
                        <TableCell className="py-1.5 text-right text-emerald-600">{fmt(r.so_tien_da_tt)} ₫</TableCell>
                        <TableCell className="py-1.5 text-right font-semibold text-orange-600">{fmt(conLai)} ₫</TableCell>
                        <TableCell className="py-1.5 text-center">
                          <span className={cn("px-1.5 py-0.5 rounded text-[10px] font-medium", tt.cls)}>
                            {tt.text}
                          </span>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        );
      })}

      {/* Batch DNTT dialog */}
      <Dialog open={batchOpen} onOpenChange={setBatchOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Tạo ĐNTT gộp định kỳ</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="rounded-md bg-muted/40 px-4 py-3 space-y-1 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">NCC</span>
                <span className="font-medium">
                  {selectedRows[0]?.ten_ncc || "—"}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Số khoản</span>
                <span className="font-medium">{selectedRows.length}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Tổng tiền</span>
                <span className="font-semibold text-orange-600">{fmt(selectedTotal)} ₫</span>
              </div>
              {selectedRows[0]?.ncc_so_tai_khoan && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Chuyển đến</span>
                  <span>{selectedRows[0].ncc_so_tai_khoan} · {selectedRows[0].ncc_ngan_hang || "—"}</span>
                </div>
              )}
            </div>

            <div className="space-y-1.5">
              <Label className="text-sm">Mô tả ĐNTT</Label>
              <Input
                value={batchMoTa}
                onChange={(e) => setBatchMoTa(e.target.value)}
                placeholder={`Thanh toán định kỳ – ${selectedRows[0]?.ten_ncc || "NCC"} – ${format(new Date(), "MM/yyyy")}`}
                className="text-sm"
              />
            </div>

            <div className="max-h-40 overflow-y-auto text-xs space-y-1">
              {selectedRows.map((r) => (
                <div key={r.id} className="flex justify-between text-muted-foreground">
                  <span className="truncate max-w-[220px]">
                    {r.ten_doan || `Đoàn #${r.doan_id}`} · {r.mo_ta}
                  </span>
                  <span className="ml-2 font-medium text-foreground shrink-0">
                    {fmt(Math.max(0, (r.thanh_tien_thuc_te ?? r.thanh_tien) - r.so_tien_da_tt))} ₫
                  </span>
                </div>
              ))}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBatchOpen(false)}>Hủy</Button>
            <Button onClick={handleCreateBatch} disabled={submitting}>
              {submitting ? "Đang tạo..." : "Tạo ĐNTT"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
