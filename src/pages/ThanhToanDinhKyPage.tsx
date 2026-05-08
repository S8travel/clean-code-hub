import { useState, useMemo } from "react";
import { format, startOfMonth, endOfMonth } from "date-fns";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SearchableSelect } from "@/components/SearchableSelect";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { CalendarIcon, ChevronDown, ChevronRight, Wallet, Ban, Eye } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  useDinhKyChiPhiList,
  useCreateBatchDNTT,
  useNccOptions,
  useDinhKyDNTTList,
  useDinhKyDNTTAllocations,
  type DinhKyChiPhiRow,
} from "@/hooks/use-thanh-toan-dinh-ky";
import { useCancelDNTT, type DNTTRow } from "@/hooks/use-dntt";
import { useCreatePayment } from "@/hooks/use-payments";
import { useCongNoByNCC, type CongNoRow } from "@/hooks/use-cong-no";

const fmt = (n: number) => n.toLocaleString("vi-VN");

const danhMucLabel: Record<string, string> = {
  khach_san: "Khách sạn",
  nha_hang: "Nhà hàng",
  xe: "Xe",
  dich_vu: "Dịch vụ",
  bao_hiem: "Bảo hiểm",
  canh_diem: "Cảnh điểm",
  phi_visa: "Visa",
  hdv: "HDV",
};

const ttLabel: Record<string, { text: string; cls: string }> = {
  unpaid: { text: "Chưa TT", cls: "bg-muted text-muted-foreground" },
  partial_paid: { text: "Một phần", cls: "bg-amber-100 text-amber-700" },
  paid: { text: "Đã TT", cls: "bg-emerald-100 text-emerald-700" },
};

const duyetLabel: Record<string, { text: string; cls: string }> = {
  cho_duyet: { text: "Chờ duyệt", cls: "bg-yellow-100 text-yellow-700" },
  da_duyet: { text: "Đã duyệt", cls: "bg-teal-100 text-teal-700" },
  tu_choi: { text: "Từ chối", cls: "bg-red-100 text-red-700" },
  da_huy: { text: "Đã hủy", cls: "bg-gray-100 text-gray-600" },
};

const paymentLabel: Record<string, { text: string; cls: string }> = {
  unpaid: { text: "Chưa TT", cls: "bg-muted text-muted-foreground" },
  partial: { text: "Một phần", cls: "bg-amber-100 text-amber-700" },
  paid: { text: "Đã TT", cls: "bg-emerald-100 text-emerald-700" },
};

// ── Quick month picker: 2 dropdowns Tháng + Năm
function MonthPicker({
  month,
  year,
  onChange,
}: {
  month: number | null;
  year: number | null;
  onChange: (m: number | null, y: number | null) => void;
}) {
  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 5 }, (_, i) => currentYear - 2 + i);
  return (
    <div className="flex items-center gap-1">
      <Select
        value={month != null ? String(month) : "all"}
        onValueChange={(v) => onChange(v === "all" ? null : Number(v), year)}
      >
        <SelectTrigger className="h-8 text-sm w-[110px]"><SelectValue placeholder="Tháng" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Tất cả tháng</SelectItem>
          {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
            <SelectItem key={m} value={String(m)}>Tháng {m}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select
        value={year != null ? String(year) : "all"}
        onValueChange={(v) => onChange(month, v === "all" ? null : Number(v))}
      >
        <SelectTrigger className="h-8 text-sm w-[100px]"><SelectValue placeholder="Năm" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Tất cả năm</SelectItem>
          {years.map((y) => (
            <SelectItem key={y} value={String(y)}>{y}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

export default function ThanhToanDinhKyPage() {
  const [filterNcc, setFilterNcc] = useState<string>("all");
  const [filterMonth, setFilterMonth] = useState<number | null>(null);
  const [filterYear, setFilterYear] = useState<number | null>(null);
  const [tuNgay, setTuNgay] = useState<Date | undefined>();
  const [denNgay, setDenNgay] = useState<Date | undefined>();
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [batchOpen, setBatchOpen] = useState(false);
  const [batchMoTa, setBatchMoTa] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [collapsedNccs, setCollapsedNccs] = useState<Set<string>>(new Set());

  // Range tự động tính từ tháng quick picker (override range tự chọn nếu chưa set)
  const effectiveTuNgay = useMemo(() => {
    if (tuNgay) return format(tuNgay, "yyyy-MM-dd");
    if (filterMonth != null && filterYear != null) {
      return format(startOfMonth(new Date(filterYear, filterMonth - 1, 1)), "yyyy-MM-dd");
    }
    if (filterYear != null && filterMonth == null) {
      return format(startOfMonth(new Date(filterYear, 0, 1)), "yyyy-MM-dd");
    }
    return null;
  }, [tuNgay, filterMonth, filterYear]);
  const effectiveDenNgay = useMemo(() => {
    if (denNgay) return format(denNgay, "yyyy-MM-dd");
    if (filterMonth != null && filterYear != null) {
      return format(endOfMonth(new Date(filterYear, filterMonth - 1, 1)), "yyyy-MM-dd");
    }
    if (filterYear != null && filterMonth == null) {
      return format(endOfMonth(new Date(filterYear, 11, 31)), "yyyy-MM-dd");
    }
    return null;
  }, [denNgay, filterMonth, filterYear]);

  const { data: nccOptions = [] } = useNccOptions();
  const { data: rows = [], isLoading } = useDinhKyChiPhiList({
    nccId: filterNcc !== "all" ? Number(filterNcc) : null,
    tuNgay: effectiveTuNgay,
    denNgay: effectiveDenNgay,
  });
  const { data: dnttList = [] } = useDinhKyDNTTList({
    nccId: filterNcc !== "all" ? Number(filterNcc) : null,
  });

  const createBatch = useCreateBatchDNTT();

  // Group chi phí by NCC
  const grouped = useMemo(() => {
    const map: Record<string, DinhKyChiPhiRow[]> = {};
    rows.forEach((r) => {
      const key = String(r.nha_cung_cap_id ?? "khong_ncc");
      if (!map[key]) map[key] = [];
      map[key].push(r);
    });
    return map;
  }, [rows]);

  // Group DNTT by NCC
  const dnttByNcc = useMemo(() => {
    const map: Record<string, DNTTRow[]> = {};
    dnttList.forEach((d) => {
      const key = String(d.nha_cung_cap_id ?? "khong_ncc");
      if (!map[key]) map[key] = [];
      map[key].push(d);
    });
    return map;
  }, [dnttList]);

  // Tổng hợp NCC keys (kết hợp từ cả 2 nguồn)
  const allNccKeys = useMemo(() => {
    const keys = new Set([...Object.keys(grouped), ...Object.keys(dnttByNcc)]);
    return [...keys];
  }, [grouped, dnttByNcc]);

  const selectedRows = rows.filter((r) => selectedIds.includes(r.id));
  const selectedTotal = selectedRows.reduce((s, r) => {
    const thanhTien = r.thanh_tien_thuc_te ?? r.thanh_tien;
    return s + Math.max(0, thanhTien - r.so_tien_da_tt);
  }, 0);

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

  const toggleCollapse = (key: string) => {
    setCollapsedNccs((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
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
    const monthLabel = filterMonth != null && filterYear != null
      ? `${String(filterMonth).padStart(2, "0")}/${filterYear}`
      : format(new Date(), "MM/yyyy");
    const defaultMoTa = batchMoTa || `Thanh toán định kỳ – ${ncc?.ten || "NCC"} – ${monthLabel}`;

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

  const clearFilters = () => {
    setTuNgay(undefined);
    setDenNgay(undefined);
    setFilterNcc("all");
    setFilterMonth(null);
    setFilterYear(null);
  };

  const hasActiveFilter = !!(tuNgay || denNgay || filterNcc !== "all" || filterMonth != null || filterYear != null);

  return (
    <div className="p-6 space-y-5 max-w-6xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">Thanh toán định kỳ</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            NCC cho nợ → tổng hợp chi phí → tạo ĐNTT gộp → duyệt → thanh toán
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
        <SearchableSelect
          options={[
            { value: "all", label: "Tất cả nhà cung cấp" },
            ...nccOptions.map((n) => ({ value: String(n.id), label: n.ten })),
          ]}
          value={filterNcc}
          onChange={setFilterNcc}
          placeholder="Tất cả nhà cung cấp"
          className="w-[220px] h-8 text-sm"
        />

        <MonthPicker
          month={filterMonth}
          year={filterYear}
          onChange={(m, y) => { setFilterMonth(m); setFilterYear(y); }}
        />

        {/* Range tự chọn (override quick month) */}
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

        {hasActiveFilter && (
          <Button variant="ghost" size="sm" className="h-8 text-sm" onClick={clearFilters}>
            Xóa bộ lọc
          </Button>
        )}
      </div>

      {effectiveTuNgay || effectiveDenNgay ? (
        <p className="text-xs text-muted-foreground -mt-2">
          Lọc đoàn khởi hành: {effectiveTuNgay || "—"} → {effectiveDenNgay || "—"} (theo `doan.ngay_di`)
        </p>
      ) : null}

      {isLoading && (
        <div className="text-sm text-muted-foreground">Đang tải...</div>
      )}

      {!isLoading && allNccKeys.length === 0 && (
        <div className="rounded-lg border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
          Không có chi phí định kỳ và ĐNTT nào trong bộ lọc hiện tại
        </div>
      )}

      {/* Per-NCC card: Section 1 (chi phí) + Section 2 (ĐNTT đã tạo) */}
      {allNccKeys.map((nccKey) => {
        const groupRows = grouped[nccKey] || [];
        const nccDntts = dnttByNcc[nccKey] || [];
        const firstRow = groupRows[0] || nccDntts[0];
        const nccName = (firstRow as any)?.ten_ncc || "Chưa có NCC";
        const nccStk = (firstRow as any)?.ncc_so_tai_khoan || (firstRow as any)?.so_tai_khoan;
        const nccNganHang = (firstRow as any)?.ncc_ngan_hang || (firstRow as any)?.ngan_hang;
        const groupTotal = groupRows.reduce((s, r) => {
          const tt = r.thanh_tien_thuc_te ?? r.thanh_tien;
          return s + Math.max(0, tt - r.so_tien_da_tt);
        }, 0);
        const groupIds = groupRows.map((r) => r.id);
        const allSelected = groupIds.length > 0 && groupIds.every((id) => selectedIds.includes(id));
        const isCollapsed = collapsedNccs.has(nccKey);

        return (
          <Card key={nccKey}>
            <CardHeader className="py-3 px-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {groupRows.length > 0 && (
                    <Checkbox
                      checked={allSelected}
                      onCheckedChange={() => toggleSelectAll(groupRows)}
                    />
                  )}
                  <button
                    type="button"
                    onClick={() => toggleCollapse(nccKey)}
                    className="flex items-start gap-2 text-left"
                  >
                    {isCollapsed ? <ChevronRight className="h-4 w-4 mt-0.5" /> : <ChevronDown className="h-4 w-4 mt-0.5" />}
                    <div>
                      <CardTitle className="text-sm font-semibold">{nccName}</CardTitle>
                      {nccStk && (
                        <p className="text-xs text-muted-foreground mt-0.5">
                          STK: {nccStk} · {nccNganHang || "—"}
                        </p>
                      )}
                    </div>
                  </button>
                </div>
                <div className="flex items-center gap-3 text-xs">
                  {groupRows.length > 0 && (
                    <span className="text-orange-600 font-semibold">
                      Còn lại: {fmt(groupTotal)} ₫
                    </span>
                  )}
                  {nccDntts.length > 0 && (
                    <span className="px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 font-medium">
                      {nccDntts.length} ĐNTT đang xử lý
                    </span>
                  )}
                </div>
              </div>
            </CardHeader>
            {!isCollapsed && (
              <CardContent className="px-4 pb-3 pt-0 space-y-3">
                {/* Section 1: Chi phí chờ ĐNTT */}
                {groupRows.length > 0 && (
                  <div>
                    <h4 className="text-xs font-semibold text-muted-foreground uppercase mb-1.5">
                      Chi phí chờ ĐNTT ({groupRows.length})
                    </h4>
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
                  </div>
                )}

                {/* Section 2: ĐNTT đã tạo */}
                {nccDntts.length > 0 && (
                  <DnttSection nccDntts={nccDntts} />
                )}
              </CardContent>
            )}
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
                placeholder={`Thanh toán định kỳ – ${selectedRows[0]?.ten_ncc || "NCC"} – ${
                  filterMonth != null && filterYear != null
                    ? `${String(filterMonth).padStart(2, "0")}/${filterYear}`
                    : format(new Date(), "MM/yyyy")
                }`}
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

// ── Section 2: list ĐNTT đã tạo của 1 NCC, kèm action mark paid / hủy / xem chi tiết ──
function DnttSection({ nccDntts }: { nccDntts: DNTTRow[] }) {
  const [payTarget, setPayTarget] = useState<DNTTRow | null>(null);
  const [cancelTarget, setCancelTarget] = useState<DNTTRow | null>(null);
  const [viewTarget, setViewTarget] = useState<DNTTRow | null>(null);

  return (
    <div>
      <h4 className="text-xs font-semibold text-muted-foreground uppercase mb-1.5">
        ĐNTT đang xử lý ({nccDntts.length})
      </h4>
      <Table>
        <TableHeader>
          <TableRow className="text-xs">
            <TableHead className="py-1">#</TableHead>
            <TableHead className="py-1">Mô tả</TableHead>
            <TableHead className="py-1">Tạo</TableHead>
            <TableHead className="py-1 text-right">Số tiền</TableHead>
            <TableHead className="py-1 text-right">Đã TT</TableHead>
            <TableHead className="py-1 text-center">Duyệt</TableHead>
            <TableHead className="py-1 text-center">TT</TableHead>
            <TableHead className="py-1 text-right">Hành động</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {nccDntts.map((d) => {
            const conLai = Math.max(0, d.so_tien - (d.paid_amount || 0));
            const duyetInfo = duyetLabel[d.trang_thai_duyet] || duyetLabel.cho_duyet;
            const ttInfo = paymentLabel[d.payment_status] || paymentLabel.unpaid;
            const canPay = d.trang_thai_duyet === "da_duyet" && conLai > 0;
            const canCancel =
              d.trang_thai_duyet !== "da_huy" && d.trang_thai_duyet !== "tu_choi";
            return (
              <TableRow key={d.id} className="text-xs">
                <TableCell className="py-1.5 font-mono text-muted-foreground">#{d.id}</TableCell>
                <TableCell className="py-1.5 max-w-[260px] truncate">{d.mo_ta || "—"}</TableCell>
                <TableCell className="py-1.5 text-muted-foreground whitespace-nowrap">
                  {d.tao_luc ? format(new Date(d.tao_luc), "dd/MM/yyyy") : "—"}
                </TableCell>
                <TableCell className="py-1.5 text-right">{fmt(d.so_tien)} ₫</TableCell>
                <TableCell className="py-1.5 text-right text-emerald-600">
                  {fmt(d.paid_amount || 0)} ₫
                </TableCell>
                <TableCell className="py-1.5 text-center">
                  <span className={cn("px-1.5 py-0.5 rounded text-[10px] font-medium", duyetInfo.cls)}>
                    {duyetInfo.text}
                  </span>
                </TableCell>
                <TableCell className="py-1.5 text-center">
                  <span className={cn("px-1.5 py-0.5 rounded text-[10px] font-medium", ttInfo.cls)}>
                    {ttInfo.text}
                  </span>
                </TableCell>
                <TableCell className="py-1.5 text-right">
                  <div className="flex items-center justify-end gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 px-1.5"
                      title="Xem chi tiết"
                      onClick={() => setViewTarget(d)}
                    >
                      <Eye className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-6 text-[11px] px-2 gap-1"
                      disabled={!canPay}
                      title={!canPay ? "Cần duyệt trước khi thanh toán" : "Đánh dấu đã thanh toán"}
                      onClick={() => setPayTarget(d)}
                    >
                      <Wallet className="h-3 w-3" />
                      Mark paid
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 px-1.5 text-red-600 hover:text-red-700"
                      title="Hủy ĐNTT"
                      disabled={!canCancel}
                      onClick={() => setCancelTarget(d)}
                    >
                      <Ban className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>

      {payTarget && (
        <MarkPaidDialog
          dntt={payTarget}
          open={!!payTarget}
          onClose={() => setPayTarget(null)}
        />
      )}
      {cancelTarget && (
        <CancelDialog
          dntt={cancelTarget}
          open={!!cancelTarget}
          onClose={() => setCancelTarget(null)}
        />
      )}
      {viewTarget && (
        <DnttDetailDialog
          dntt={viewTarget}
          open={!!viewTarget}
          onClose={() => setViewTarget(null)}
        />
      )}
    </div>
  );
}

// ── Mark paid dialog: cấn trừ + cash ──
function MarkPaidDialog({
  dntt,
  open,
  onClose,
}: {
  dntt: DNTTRow;
  open: boolean;
  onClose: () => void;
}) {
  const conLai = Math.max(0, dntt.so_tien - (dntt.paid_amount || 0));
  const [ngayTT, setNgayTT] = useState<Date>(new Date());
  const [selectedCongNoIds, setSelectedCongNoIds] = useState<number[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const { data: congNoList = [] } = useCongNoByNCC(dntt.nha_cung_cap_id);
  const createPayment = useCreatePayment();

  const congNoSelected = congNoList.filter((c) => selectedCongNoIds.includes(c.id));
  const totalCanTru = congNoSelected.reduce((s, c) => s + Math.min(c.so_tien_con_lai, conLai), 0);
  const cashRemaining = Math.max(0, conLai - totalCanTru);

  const toggleCongNo = (id: number) => {
    setSelectedCongNoIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      // 1. Apply cấn trừ payments first
      let remaining = conLai;
      for (const cn of congNoSelected) {
        const apply = Math.min(cn.so_tien_con_lai, remaining);
        if (apply <= 0) break;
        await createPayment.mutateAsync({
          dnttId: dntt.id,
          method: "can_tru",
          soTien: apply,
          ngayThanhToan: format(ngayTT, "yyyy-MM-dd"),
          congNoId: cn.id,
        });
        remaining -= apply;
      }
      // 2. Cash phần còn lại
      if (remaining > 0) {
        await createPayment.mutateAsync({
          dnttId: dntt.id,
          method: "cash",
          soTien: remaining,
          ngayThanhToan: format(ngayTT, "yyyy-MM-dd"),
        });
      }
      toast.success("Đã ghi nhận thanh toán");
      onClose();
    } catch (err: any) {
      toast.error("Lỗi: " + (err?.message || "Không thể ghi nhận"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Đánh dấu đã thanh toán</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2 text-sm">
          <div className="rounded-md bg-muted/40 px-4 py-3 space-y-1">
            <div className="flex justify-between">
              <span className="text-muted-foreground">ĐNTT</span>
              <span className="font-mono">#{dntt.id}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Cần thanh toán</span>
              <span className="font-semibold text-orange-600">{fmt(conLai)} ₫</span>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-sm">Ngày thanh toán</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="w-full justify-start gap-2">
                  <CalendarIcon className="h-3.5 w-3.5" />
                  {format(ngayTT, "dd/MM/yyyy")}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0">
                <Calendar mode="single" selected={ngayTT} onSelect={(d) => d && setNgayTT(d)} initialFocus />
              </PopoverContent>
            </Popover>
          </div>

          {congNoList.length > 0 && (
            <div className="space-y-1.5">
              <Label className="text-sm">Cấn trừ công nợ NCC ({congNoList.length})</Label>
              <div className="border border-border rounded-md max-h-44 overflow-y-auto divide-y divide-border">
                {congNoList.map((cn) => {
                  const willApply = Math.min(cn.so_tien_con_lai, Math.max(0, conLai - totalCanTru + (selectedCongNoIds.includes(cn.id) ? Math.min(cn.so_tien_con_lai, conLai) : 0)));
                  return (
                    <label
                      key={cn.id}
                      className="flex items-center gap-2 px-2.5 py-1.5 text-xs hover:bg-muted/40 cursor-pointer"
                    >
                      <Checkbox
                        checked={selectedCongNoIds.includes(cn.id)}
                        onCheckedChange={() => toggleCongNo(cn.id)}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="truncate">
                          {(cn as any).ten_doan || `Đoàn #${cn.doan_id}`} · {cn.ly_do || cn.ghi_chu || "—"}
                        </div>
                        <div className="text-muted-foreground">
                          Còn {fmt(cn.so_tien_con_lai)} ₫
                          {selectedCongNoIds.includes(cn.id) && willApply > 0 && (
                            <span className="ml-1 text-amber-700">→ áp dụng {fmt(willApply)} ₫</span>
                          )}
                        </div>
                      </div>
                    </label>
                  );
                })}
              </div>
            </div>
          )}

          <div className="rounded-md border border-border px-4 py-3 space-y-1 text-xs">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Cấn trừ</span>
              <span className="text-amber-700">{fmt(totalCanTru)} ₫</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Cash</span>
              <span className="font-semibold">{fmt(cashRemaining)} ₫</span>
            </div>
            <div className="flex justify-between border-t border-border pt-1 mt-1">
              <span className="font-medium">Tổng</span>
              <span className="font-semibold">{fmt(totalCanTru + cashRemaining)} ₫</span>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Hủy</Button>
          <Button onClick={handleSubmit} disabled={submitting || conLai <= 0}>
            {submitting ? "Đang lưu..." : "Xác nhận thanh toán"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Cancel dntt dialog ──
function CancelDialog({
  dntt,
  open,
  onClose,
}: {
  dntt: DNTTRow;
  open: boolean;
  onClose: () => void;
}) {
  const cancelMut = useCancelDNTT();
  const [mode, setMode] = useState<"cong_no" | "hoan_tien" | undefined>(undefined);
  const paid = dntt.paid_amount || 0;
  const needsMode = paid > 0;

  const handleConfirm = async () => {
    try {
      await cancelMut.mutateAsync({ id: dntt.id, mode: needsMode ? mode : undefined });
      toast.success("Đã hủy ĐNTT");
      onClose();
    } catch (err: any) {
      toast.error("Lỗi: " + (err?.message || "Không thể hủy"));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Hủy ĐNTT #{dntt.id}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2 text-sm">
          <p className="text-muted-foreground">
            {needsMode
              ? `Đã có ${fmt(paid)} ₫ được thanh toán. Chọn cách xử lý:`
              : "ĐNTT chưa có thanh toán nào — sẽ được đánh dấu đã hủy."}
          </p>
          {needsMode && (
            <div className="space-y-1.5">
              <label className="flex items-start gap-2 cursor-pointer">
                <input
                  type="radio"
                  className="mt-0.5"
                  checked={mode === "cong_no"}
                  onChange={() => setMode("cong_no")}
                />
                <div>
                  <div className="font-medium">Tạo công nợ với NCC</div>
                  <div className="text-xs text-muted-foreground">
                    Số tiền đã trả thành công nợ, dùng cấn trừ ĐNTT khác sau.
                  </div>
                </div>
              </label>
              <label className="flex items-start gap-2 cursor-pointer">
                <input
                  type="radio"
                  className="mt-0.5"
                  checked={mode === "hoan_tien"}
                  onChange={() => setMode("hoan_tien")}
                />
                <div>
                  <div className="font-medium">NCC hoàn tiền</div>
                  <div className="text-xs text-muted-foreground">
                    NCC đã trả lại tiền mặt, không cần cấn trừ.
                  </div>
                </div>
              </label>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Đóng</Button>
          <Button
            variant="destructive"
            onClick={handleConfirm}
            disabled={cancelMut.isPending || (needsMode && !mode)}
          >
            {cancelMut.isPending ? "Đang hủy..." : "Xác nhận hủy"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── View detail: list allocations + chi phí + đoàn ──
function DnttDetailDialog({
  dntt,
  open,
  onClose,
}: {
  dntt: DNTTRow;
  open: boolean;
  onClose: () => void;
}) {
  const { data: allocs = [], isLoading } = useDinhKyDNTTAllocations(dntt.id);

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Chi tiết ĐNTT #{dntt.id}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2 text-sm">
          <div className="rounded-md bg-muted/40 px-4 py-2 space-y-0.5 text-xs">
            <div><span className="text-muted-foreground">Mô tả: </span>{dntt.mo_ta || "—"}</div>
            <div>
              <span className="text-muted-foreground">Tổng: </span>
              <span className="font-semibold">{fmt(dntt.so_tien)} ₫</span>
              {" · "}
              <span className="text-muted-foreground">Đã TT: </span>
              <span className="text-emerald-600">{fmt(dntt.paid_amount || 0)} ₫</span>
            </div>
          </div>
          <div className="text-xs font-semibold uppercase text-muted-foreground">
            {allocs.length} chi phí được phân bổ
          </div>
          {isLoading ? (
            <div className="text-xs text-muted-foreground">Đang tải...</div>
          ) : (
            <div className="border border-border rounded-md overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="text-xs">
                    <TableHead className="py-1">Đoàn</TableHead>
                    <TableHead className="py-1">Ngày đi</TableHead>
                    <TableHead className="py-1">Mô tả</TableHead>
                    <TableHead className="py-1 text-right">Số tiền</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {allocs.map((a: any) => (
                    <TableRow key={a.chi_phi_id} className="text-xs">
                      <TableCell className="py-1.5 font-medium">
                        {a.chi_phi?.doan?.ten_doan || `Đoàn #${a.chi_phi?.doan_id}`}
                      </TableCell>
                      <TableCell className="py-1.5 text-muted-foreground whitespace-nowrap">
                        {a.chi_phi?.doan?.ngay_di
                          ? format(new Date(a.chi_phi.doan.ngay_di + "T00:00:00"), "dd/MM/yyyy")
                          : "—"}
                      </TableCell>
                      <TableCell className="py-1.5 max-w-[260px] truncate">
                        {a.chi_phi?.mo_ta || "—"}
                      </TableCell>
                      <TableCell className="py-1.5 text-right">{fmt(a.so_tien)} ₫</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Đóng</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
