import { useState, useMemo } from "react";
import { format, startOfMonth, endOfMonth } from "date-fns";
import { proRataInts } from "@/lib/pro-rata";
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
import { CalendarIcon, ChevronDown, ChevronRight, Ban, Eye, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  useDinhKyChiPhiList,
  useCreateBatchDNTT,
  useNccOptions,
  useDinhKyDNTTList,
  useDinhKyDNTTAllocations,
  type DinhKyChiPhiRow,
  type DinhKyDNTTRow,
} from "@/hooks/use-thanh-toan-dinh-ky";
import { useCancelDNTT, type DNTTRow } from "@/hooks/use-dntt";
import { errMsg } from "@/lib/error";

const fmt = (n: number) => n.toLocaleString("vi-VN");

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
        <SelectTrigger className="h-8 text-sm w-[110px]">
          <span>{month == null ? "Tất cả tháng" : `Tháng ${month}`}</span>
        </SelectTrigger>
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
        <SelectTrigger className="h-8 text-sm w-[100px]">
          <span>{year == null ? "Tất cả năm" : String(year)}</span>
        </SelectTrigger>
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

// ── Month helpers ──
function monthKeyFromDate(d?: string | null): string | null {
  if (!d) return null;
  return d.slice(0, 7); // "YYYY-MM"
}
function monthLabelFromKey(monthKey: string): string {
  if (monthKey === "khong_thang") return "Chưa rõ tháng";
  const [y, m] = monthKey.split("-");
  return `Tháng ${parseInt(m, 10)}/${y}`;
}

interface MonthGroup {
  monthKey: string;
  monthLabel: string;
  rows: DinhKyChiPhiRow[];
  dntts: DinhKyDNTTRow[];
  totalThanhTien: number;
  totalDaTT: number;
  totalConLai: number;
  doanCount: number;
}

interface NccGroup {
  nccKey: string;
  nccId: number | null;
  nccTen: string;
  nccStk: string | null;
  nccNganHang: string | null;
  months: MonthGroup[]; // sort theo monthKey ASC
}

interface DialogContext {
  nccId: number;
  nccTen: string;
  monthKey: string;
  monthLabel: string;
  rows: DinhKyChiPhiRow[]; // chi phí của tháng có conLai > 0
}

export default function ThanhToanDinhKyPage() {
  const [filterNcc, setFilterNcc] = useState<string>("all");
  const [filterMonth, setFilterMonth] = useState<number | null>(null);
  const [filterYear, setFilterYear] = useState<number | null>(null);
  const [tuNgay, setTuNgay] = useState<Date | undefined>();
  const [denNgay, setDenNgay] = useState<Date | undefined>();
  const [dialogCtx, setDialogCtx] = useState<DialogContext | null>(null);
  const [batchMoTa, setBatchMoTa] = useState("");
  const [batchMode, setBatchMode] = useState<"full" | "partial">("full");
  const [batchPaidAmount, setBatchPaidAmount] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);

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
    tuNgay: effectiveTuNgay,
    denNgay: effectiveDenNgay,
  });

  const createBatch = useCreateBatchDNTT();

  // Group chi phí + DNTT by NCC → tháng (theo doan.ngay_di / dntt.ngay_di_min)
  const groupedByNccMonth = useMemo<NccGroup[]>(() => {
    type Bucket = { ncc: Pick<NccGroup, "nccTen" | "nccStk" | "nccNganHang"> & { nccId: number | null }; months: Map<string, MonthGroup> };
    const map = new Map<string, Bucket>();

    const ensureNcc = (
      nccKey: string,
      nccId: number | null,
      nccTen: string,
      nccStk: string | null,
      nccNganHang: string | null,
    ): Bucket => {
      const ex = map.get(nccKey);
      if (ex) return ex;
      const fresh: Bucket = {
        ncc: { nccId, nccTen, nccStk, nccNganHang },
        months: new Map(),
      };
      map.set(nccKey, fresh);
      return fresh;
    };

    const ensureMonth = (b: Bucket, monthKey: string): MonthGroup => {
      const ex = b.months.get(monthKey);
      if (ex) return ex;
      const fresh: MonthGroup = {
        monthKey,
        monthLabel: monthLabelFromKey(monthKey),
        rows: [],
        dntts: [],
        totalThanhTien: 0,
        totalDaTT: 0,
        totalConLai: 0,
        doanCount: 0,
      };
      b.months.set(monthKey, fresh);
      return fresh;
    };

    rows.forEach((r) => {
      const nccKey = String(r.nha_cung_cap_id ?? "khong_ncc");
      const monthKey = monthKeyFromDate(r.ngay_kh_di) ?? "khong_thang";
      const bucket = ensureNcc(nccKey, r.nha_cung_cap_id, r.ten_ncc ?? "Chưa có NCC", r.ncc_so_tai_khoan, r.ncc_ngan_hang);
      const mg = ensureMonth(bucket, monthKey);
      mg.rows.push(r);
      const tt = r.thanh_tien_thuc_te ?? r.thanh_tien;
      mg.totalThanhTien += tt;
      mg.totalDaTT += r.so_tien_da_tt;
      mg.totalConLai += Math.max(0, tt - r.so_tien_da_tt);
    });

    dnttList.forEach((d) => {
      // Hook useDinhKyDNTTList join NCC vào row nhưng DinhKyDNTTRow chưa khai
      // báo các field này — narrow cục bộ thay vì `any`.
      const dNcc = d as DinhKyDNTTRow & {
        ten_ncc?: string | null;
        ncc_so_tai_khoan?: string | null;
        ncc_ngan_hang?: string | null;
      };
      const nccKey = String(d.nha_cung_cap_id ?? "khong_ncc");
      const minDate = d.ngay_di_min;
      const monthKey = monthKeyFromDate(minDate ?? null) ?? "khong_thang";
      const bucket = ensureNcc(
        nccKey,
        d.nha_cung_cap_id,
        dNcc.ten_ncc || "Chưa có NCC",
        dNcc.ncc_so_tai_khoan || null,
        dNcc.ncc_ngan_hang || null,
      );
      ensureMonth(bucket, monthKey).dntts.push(d);
    });

    const result: NccGroup[] = [];
    map.forEach((bucket, nccKey) => {
      const monthsArr = [...bucket.months.values()].map((mg) => ({
        ...mg,
        doanCount: new Set(mg.rows.map((r) => r.doan_id)).size,
      }));
      monthsArr.sort((a, b) => a.monthKey.localeCompare(b.monthKey));
      result.push({
        nccKey,
        nccId: bucket.ncc.nccId,
        nccTen: bucket.ncc.nccTen,
        nccStk: bucket.ncc.nccStk,
        nccNganHang: bucket.ncc.nccNganHang,
        months: monthsArr,
      });
    });
    result.sort((a, b) => a.nccTen.localeCompare(b.nccTen));
    return result;
  }, [rows, dnttList]);

  // Số tiền partial (nếu mode='partial'), parse số nguyên — dùng dialogCtx
  const dialogTotalConLai = useMemo(() => {
    if (!dialogCtx) return 0;
    return dialogCtx.rows.reduce((s, r) => {
      const tt = r.thanh_tien_thuc_te ?? r.thanh_tien;
      return s + Math.max(0, tt - r.so_tien_da_tt);
    }, 0);
  }, [dialogCtx]);

  const batchPartialNum = Number((batchPaidAmount || "").replace(/\D/g, "")) || 0;
  const batchEffectiveAmount = batchMode === "full"
    ? dialogTotalConLai
    : Math.min(batchPartialNum, dialogTotalConLai);
  const batchPartialValid = batchMode === "full" || (batchPartialNum > 0 && batchPartialNum <= dialogTotalConLai);

  const openCreateDialogForMonth = (ncc: NccGroup, mg: MonthGroup) => {
    if (!ncc.nccId) { toast.error("Tháng này không có NCC hợp lệ"); return; }
    const eligible = mg.rows.filter((r) => {
      const tt = r.thanh_tien_thuc_te ?? r.thanh_tien;
      return Math.max(0, tt - r.so_tien_da_tt) > 0;
    });
    if (eligible.length === 0) { toast.warning("Tháng này không còn chi phí cần thanh toán"); return; }
    setDialogCtx({
      nccId: ncc.nccId,
      nccTen: ncc.nccTen,
      monthKey: mg.monthKey,
      monthLabel: mg.monthLabel,
      rows: eligible,
    });
    setBatchMode("full");
    setBatchPaidAmount("");
    setBatchMoTa("");
  };

  const closeCreateDialog = () => {
    setDialogCtx(null);
    setBatchMode("full");
    setBatchPaidAmount("");
    setBatchMoTa("");
  };

  const handleCreateBatch = async () => {
    if (!dialogCtx) return;
    if (!batchPartialValid || batchEffectiveAmount <= 0) {
      toast.error("Số tiền không hợp lệ");
      return;
    }

    // Pro-rata phân bổ effectiveAmount theo tỉ lệ "còn lại" mỗi chi phí.
    // Largest-remainder method (proRataInts) → SUM(allocs) === batchEffectiveAmount
    // không cần manual drift fix nữa.
    const conLaiByRow = dialogCtx.rows.map((r) => ({
      id: r.id,
      conLai: Math.max(0, (r.thanh_tien_thuc_te ?? r.thanh_tien) - r.so_tien_da_tt),
    }));
    const allocAmts = proRataInts(batchEffectiveAmount, conLaiByRow.map((x) => x.conLai));
    const allocations = conLaiByRow.map((x, i) => ({
      chi_phi_id: x.id,
      so_tien: allocAmts[i],
    }));

    const cocSuffix = batchMode === "partial" ? " (Cọc)" : "";
    const defaultMoTa = batchMoTa || `Thanh toán định kỳ – ${dialogCtx.nccTen} – ${dialogCtx.monthLabel}${cocSuffix}`;

    setSubmitting(true);
    try {
      await createBatch.mutateAsync({
        nccId: dialogCtx.nccId,
        moTa: defaultMoTa,
        chiPhiIds: dialogCtx.rows.map((r) => r.id),
        allocations,
        soTien: batchEffectiveAmount,
        laCoc: batchMode === "partial",
      });
      toast.success("Đã tạo đề nghị thanh toán định kỳ");
      closeCreateDialog();
    } catch (err: unknown) {
      toast.error("Lỗi: " + (errMsg(err) || "Không thể tạo ĐNTT"));
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

      {!isLoading && groupedByNccMonth.length === 0 && (
        <div className="rounded-lg border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
          Không có chi phí định kỳ và ĐNTT nào trong bộ lọc hiện tại
        </div>
      )}

      {/* Per-NCC card → group by tháng */}
      {groupedByNccMonth.map((ncc) => (
        <Card key={ncc.nccKey}>
          <CardHeader className="py-3 px-4">
            <CardTitle className="text-sm font-semibold">{ncc.nccTen}</CardTitle>
            {ncc.nccStk && (
              <p className="text-xs text-muted-foreground mt-0.5">
                STK: {ncc.nccStk} · {ncc.nccNganHang || "—"}
              </p>
            )}
          </CardHeader>
          <CardContent className="px-4 pb-3 pt-0 space-y-2">
            {ncc.months.map((mg) => (
              <MonthGroupCard
                key={mg.monthKey}
                monthGroup={mg}
                onCreateDNTT={() => openCreateDialogForMonth(ncc, mg)}
              />
            ))}
          </CardContent>
        </Card>
      ))}

      {/* Dialog tạo ĐNTT theo tháng */}
      <Dialog open={!!dialogCtx} onOpenChange={(v) => { if (!v) closeCreateDialog(); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              Tạo ĐNTT định kỳ
              {dialogCtx && <span className="text-xs font-normal text-muted-foreground"> — {dialogCtx.nccTen} · {dialogCtx.monthLabel}</span>}
            </DialogTitle>
          </DialogHeader>
          {dialogCtx && (
            <div className="space-y-4 py-2">
              <div className="rounded-md bg-muted/40 px-4 py-3 space-y-1 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Số khoản</span>
                  <span className="font-medium">{dialogCtx.rows.length}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Tổng còn lại của tháng</span>
                  <span className="font-semibold text-orange-600">{fmt(dialogTotalConLai)} ₫</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Chuyển đến</span>
                  {dialogCtx.rows[0]?.ncc_so_tai_khoan ? (
                    <span>{dialogCtx.rows[0].ncc_so_tai_khoan} · {dialogCtx.rows[0].ncc_ngan_hang || "—"}</span>
                  ) : (
                    <span className="text-amber-700 italic">Chưa có TK — cập nhật trong Quản lý NCC</span>
                  )}
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-sm">Số tiền đề nghị</Label>
                <div className="flex gap-1.5">
                  <button
                    type="button"
                    onClick={() => { setBatchMode("full"); setBatchPaidAmount(""); }}
                    className={cn(
                      "flex-1 px-3 py-1.5 rounded-md border text-xs transition-colors",
                      batchMode === "full"
                        ? "border-primary bg-primary/5 text-primary font-medium"
                        : "border-border hover:bg-muted/40",
                    )}
                  >
                    Toàn bộ ({fmt(dialogTotalConLai)} ₫)
                  </button>
                  <button
                    type="button"
                    onClick={() => setBatchMode("partial")}
                    className={cn(
                      "flex-1 px-3 py-1.5 rounded-md border text-xs transition-colors",
                      batchMode === "partial"
                        ? "border-primary bg-primary/5 text-primary font-medium"
                        : "border-border hover:bg-muted/40",
                    )}
                  >
                    Trả trước 1 phần (cọc)
                  </button>
                </div>
                {batchMode === "partial" && (
                  <div className="space-y-1">
                    <Input
                      type="text"
                      inputMode="numeric"
                      value={batchPaidAmount}
                      onChange={(e) => setBatchPaidAmount(e.target.value.replace(/\D/g, ""))}
                      placeholder={`Nhập số tiền cọc (≤ ${fmt(dialogTotalConLai)} ₫)`}
                      className="text-sm"
                      autoFocus
                    />
                    {batchPaidAmount && !batchPartialValid && (
                      <p className="text-[11px] text-red-600">
                        Số tiền phải lớn hơn 0 và ≤ {fmt(dialogTotalConLai)} ₫
                      </p>
                    )}
                    {batchPartialValid && batchPartialNum > 0 && batchPartialNum < dialogTotalConLai && (
                      <p className="text-[11px] text-muted-foreground">
                        Phần còn lại {fmt(dialogTotalConLai - batchEffectiveAmount)} ₫ → tạo ĐNTT khác sau
                      </p>
                    )}
                  </div>
                )}
              </div>

              <div className="space-y-1.5">
                <Label className="text-sm">Mô tả ĐNTT</Label>
                <Input
                  value={batchMoTa}
                  onChange={(e) => setBatchMoTa(e.target.value)}
                  placeholder={`Thanh toán định kỳ – ${dialogCtx.nccTen} – ${dialogCtx.monthLabel}${batchMode === "partial" ? " (Cọc)" : ""}`}
                  className="text-sm"
                />
              </div>

              <div className="max-h-40 overflow-y-auto text-xs space-y-1">
                {(() => {
                  // Tính alloc preview KHỚP với save logic (proRataInts) — không drift
                  const conLais = dialogCtx.rows.map((r) =>
                    Math.max(0, (r.thanh_tien_thuc_te ?? r.thanh_tien) - r.so_tien_da_tt)
                  );
                  const allocated = batchMode === "partial" && batchPartialValid && batchEffectiveAmount > 0
                    ? proRataInts(batchEffectiveAmount, conLais)
                    : conLais;
                  return dialogCtx.rows.map((r, i) => (
                    <div key={r.id} className="flex justify-between text-muted-foreground">
                      <span className="truncate max-w-[220px]">
                        {r.ten_doan || `Đoàn #${r.doan_id}`} · {r.mo_ta}
                      </span>
                      <span className="ml-2 font-medium text-foreground shrink-0">
                        {fmt(allocated[i])} ₫
                        {batchMode === "partial" && batchPartialValid && batchEffectiveAmount > 0 && allocated[i] < conLais[i] && (
                          <span className="ml-1 text-muted-foreground font-normal">/ {fmt(conLais[i])}</span>
                        )}
                      </span>
                    </div>
                  ));
                })()}
              </div>
              {batchMode === "partial" && batchPartialValid && batchPartialNum > 0 && (
                <div className="rounded-md border border-border px-4 py-2 text-xs space-y-0.5">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Đề nghị thanh toán lần này</span>
                    <span className="font-semibold text-orange-600">{fmt(batchEffectiveAmount)} ₫</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Sau khi tạo, còn lại</span>
                    <span className="font-medium">{fmt(dialogTotalConLai - batchEffectiveAmount)} ₫</span>
                  </div>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={closeCreateDialog}>Hủy</Button>
            <Button
              onClick={handleCreateBatch}
              disabled={submitting || !batchPartialValid || batchEffectiveAmount <= 0}
            >
              {submitting ? "Đang tạo..." : `Tạo ĐNTT${batchMode === "partial" ? " cọc" : ""}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── Month Group Card: 1 tháng của 1 NCC ──
// Header: summary tháng + nút Tạo ĐNTT. Expand: list chi phí theo đoàn + list ĐNTT của tháng.
function MonthGroupCard({
  monthGroup,
  onCreateDNTT,
}: {
  monthGroup: MonthGroup;
  onCreateDNTT: () => void;
}) {
  // Default thu gọn để dễ scan summary; user click để mở.
  const [expanded, setExpanded] = useState(false);
  const [cancelTarget, setCancelTarget] = useState<DNTTRow | null>(null);
  const [viewTarget, setViewTarget] = useState<DNTTRow | null>(null);

  const fmtRange = (min?: string | null, max?: string | null) => {
    if (!min && !max) return null;
    const mm = min ? format(new Date(min + "T00:00:00"), "dd/MM/yy") : "?";
    const mx = max ? format(new Date(max + "T00:00:00"), "dd/MM/yy") : "?";
    return min === max ? mm : `${mm} → ${mx}`;
  };

  const fullyPaid = monthGroup.totalConLai === 0 && monthGroup.totalThanhTien > 0;

  // Group chi phí by đoàn để hiển thị gom
  const byDoan = useMemo(() => {
    const map = new Map<number, { ten_doan: string; ngay_di: string | null; rows: DinhKyChiPhiRow[] }>();
    monthGroup.rows.forEach((r) => {
      const ex = map.get(r.doan_id);
      if (ex) ex.rows.push(r);
      else map.set(r.doan_id, {
        ten_doan: r.ten_doan ?? `Đoàn #${r.doan_id}`,
        ngay_di: r.ngay_kh_di,
        rows: [r],
      });
    });
    return [...map.entries()]
      .map(([doan_id, v]) => ({ doan_id, ...v }))
      .sort((a, b) => (a.ngay_di || "").localeCompare(b.ngay_di || ""));
  }, [monthGroup.rows]);

  return (
    <div className="rounded-md border border-border">
      <div className="px-3 py-2 flex items-center justify-between gap-2 hover:bg-muted/30">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="flex items-center gap-2 flex-1 min-w-0 text-left"
        >
          {expanded ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />}
          <span className="text-sm font-medium">{monthGroup.monthLabel}</span>
          <span className="text-xs text-muted-foreground">
            · {fmt(monthGroup.totalThanhTien)} / Đã TT <span className="text-emerald-600">{fmt(monthGroup.totalDaTT)}</span> /{" "}
            <span className={fullyPaid ? "text-emerald-600 font-medium" : "text-orange-600 font-medium"}>
              Còn {fmt(monthGroup.totalConLai)}
            </span>
            {monthGroup.rows.length > 0 && (
              <> · {monthGroup.rows.length} chi phí · {monthGroup.doanCount} đoàn</>
            )}
            {fullyPaid && <span className="ml-1">✓</span>}
          </span>
        </button>
        {monthGroup.totalConLai > 0 && (
          <Button size="sm" variant="outline" className="h-7 text-xs gap-1 shrink-0" onClick={onCreateDNTT}>
            <Plus className="h-3 w-3" /> Tạo ĐNTT
          </Button>
        )}
      </div>

      {expanded && (
        <div className="border-t border-border px-3 py-2 space-y-3 bg-muted/10">
          {/* Chi phí theo từng đoàn */}
          {byDoan.length > 0 && (
            <div className="space-y-2">
              {byDoan.map((d) => (
                <div key={d.doan_id} className="text-xs">
                  <div className="font-medium">
                    {d.ten_doan}
                    <span className="ml-2 text-muted-foreground font-normal">
                      ({d.ngay_di ? format(new Date(d.ngay_di + "T00:00:00"), "dd/MM/yyyy") : "—"})
                    </span>
                  </div>
                  <div className="pl-3 space-y-0.5">
                    {d.rows.map((r) => {
                      const tt = r.thanh_tien_thuc_te ?? r.thanh_tien;
                      const conLai = Math.max(0, tt - r.so_tien_da_tt);
                      const isPaid = conLai === 0;
                      return (
                        <div key={r.id} className="flex justify-between text-muted-foreground">
                          <span className="truncate max-w-[280px]">
                            • {r.mo_ta || "—"}
                          </span>
                          <span className="ml-2 shrink-0">
                            {fmt(tt)} ₫{" "}
                            {isPaid ? (
                              <span className="text-emerald-600 text-[10px]">✓ Đã TT</span>
                            ) : r.so_tien_da_tt > 0 ? (
                              <span className="text-amber-600 text-[10px]">Còn {fmt(conLai)}</span>
                            ) : (
                              <span className="text-orange-600 text-[10px]">Chưa TT</span>
                            )}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* ĐNTT đã tạo của tháng này */}
          {monthGroup.dntts.length > 0 && (
            <div>
              <div className="text-[11px] font-semibold text-muted-foreground uppercase mb-1">
                ĐNTT của tháng này ({monthGroup.dntts.length})
              </div>
              <div className="space-y-1">
                {monthGroup.dntts.map((d) => {
                  const duyetInfo = duyetLabel[d.trang_thai_duyet] || duyetLabel.cho_duyet;
                  const ttInfo = paymentLabel[d.payment_status] || paymentLabel.unpaid;
                  const canCancel =
                    d.trang_thai_duyet !== "da_huy" && d.trang_thai_duyet !== "tu_choi";
                  const rangeText = fmtRange(d.ngay_di_min, d.ngay_di_max);
                  return (
                    <div key={d.id} className="flex items-center gap-2 text-xs px-2 py-1 rounded hover:bg-background">
                      <span className="font-mono text-muted-foreground shrink-0">#{d.id}</span>
                      <span className="truncate flex-1">
                        {d.mo_ta || "—"}
                        {d.la_coc && <span className="ml-1 px-1 py-0.5 rounded bg-amber-100 text-amber-700 text-[9px]">Cọc</span>}
                      </span>
                      {rangeText && (
                        <span className="px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 text-[10px] shrink-0">
                          📅 {rangeText}
                        </span>
                      )}
                      <span className="font-semibold shrink-0">{fmt(d.so_tien)} ₫</span>
                      <span className="text-emerald-600 text-[10px] shrink-0">
                        +{fmt(d.paid_amount || 0)}
                      </span>
                      <span className={cn("px-1.5 py-0.5 rounded text-[10px] font-medium shrink-0", duyetInfo.cls)}>
                        {duyetInfo.text}
                      </span>
                      <span className={cn("px-1.5 py-0.5 rounded text-[10px] font-medium shrink-0", ttInfo.cls)}>
                        {ttInfo.text}
                      </span>
                      <Button
                        variant="ghost" size="sm"
                        className="h-6 px-1.5 shrink-0"
                        title="Xem chi tiết"
                        onClick={() => setViewTarget(d)}
                      >
                        <Eye className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost" size="sm"
                        className="h-6 px-1.5 text-red-600 hover:text-red-700 shrink-0"
                        title="Hủy ĐNTT"
                        disabled={!canCancel}
                        onClick={() => setCancelTarget(d)}
                      >
                        <Ban className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
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
    } catch (err: unknown) {
      toast.error("Lỗi: " + (errMsg(err) || "Không thể hủy"));
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
                  {allocs.map((a) => (
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
