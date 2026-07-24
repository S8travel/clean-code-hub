import { useState, useMemo } from "react";
import { format, startOfMonth, endOfMonth } from "date-fns";
import { proRataInts } from "@/lib/pro-rata";
import { netPhaiTra } from "@/lib/dinh-ky-amounts";
import { kyHieuLuc, kyMacDinh, daDoiKy, kyKeTiep, coTheDoiKy } from "@/lib/ky-thanh-toan";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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
import { CalendarIcon, ChevronDown, ChevronRight, Ban, Eye, Plus, Printer, FileSpreadsheet, CornerDownRight, Undo2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  useDinhKyChiPhiList,
  useCreateBatchDNTT,
  useNccOptions,
  useDinhKyDNTTList,
  useDinhKyDNTTAllocations,
  useSetKyThanhToan,
  type DinhKyChiPhiRow,
  type DinhKyDNTTRow,
} from "@/hooks/use-thanh-toan-dinh-ky";
import { useCancelDNTT, type DNTTRow } from "@/hooks/use-dntt";
import { exportDnttKhacHoanUngWord } from "@/lib/export-dntt-khac-word";
import { exportDinhKyExcel } from "@/lib/export-dinh-ky-excel";
import { resolveNccTaiKhoanText } from "@/lib/ncc-tai-khoan";
import { errMsg } from "@/lib/error";
import { t, useTranslate } from "@/lib/i18n";

const fmt = (n: number) => n.toLocaleString("vi-VN");

const duyetLabel: Record<string, { textKey: string; cls: string }> = {
  cho_duyet: { textKey: "Chờ duyệt", cls: "bg-yellow-100 text-yellow-700" },
  da_duyet: { textKey: "Đã duyệt", cls: "bg-teal-100 text-teal-700" },
  tu_choi: { textKey: "Từ chối", cls: "bg-red-100 text-red-700" },
  da_huy: { textKey: "Đã hủy", cls: "bg-gray-100 text-gray-600" },
};

const paymentLabel: Record<string, { textKey: string; cls: string }> = {
  unpaid: { textKey: "Chưa TT", cls: "bg-muted text-muted-foreground" },
  partial: { textKey: "Một phần", cls: "bg-amber-100 text-amber-700" },
  paid: { textKey: "Đã TT", cls: "bg-emerald-100 text-emerald-700" },
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
  useTranslate();
  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 5 }, (_, i) => currentYear - 2 + i);
  return (
    <div className="flex items-center gap-1">
      <Select
        value={month != null ? String(month) : "all"}
        onValueChange={(v) => onChange(v === "all" ? null : Number(v), year)}
      >
        <SelectTrigger className="h-8 text-sm w-[110px]">
          <span>{month == null ? t("Tất cả tháng") : `${t("Tháng")} ${month}`}</span>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">{t("Tất cả tháng")}</SelectItem>
          {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
            <SelectItem key={m} value={String(m)}>{t("Tháng")} {m}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select
        value={year != null ? String(year) : "all"}
        onValueChange={(v) => onChange(month, v === "all" ? null : Number(v))}
      >
        <SelectTrigger className="h-8 text-sm w-[100px]">
          <span>{year == null ? t("Tất cả năm") : String(year)}</span>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">{t("Tất cả năm")}</SelectItem>
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
  if (monthKey === "khong_thang") return t("Chưa rõ tháng");
  const [y, m] = monthKey.split("-");
  return `${t("Tháng")} ${parseInt(m, 10)}/${y}`;
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
  nccTaiKhoanBlob: string | null; // ô "tài khoản thanh toán" (blob nhiều dòng)
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
  useTranslate();
  const [filterNcc, setFilterNcc] = useState<string>("all");
  const [filterMonth, setFilterMonth] = useState<number | null>(null);
  const [filterYear, setFilterYear] = useState<number | null>(null);
  const [tuNgay, setTuNgay] = useState<Date | undefined>();
  const [denNgay, setDenNgay] = useState<Date | undefined>();
  const [dialogCtx, setDialogCtx] = useState<DialogContext | null>(null);
  const [batchMoTa, setBatchMoTa] = useState("");
  const [batchMode, setBatchMode] = useState<"full" | "partial">("full");
  const [batchPaidAmount, setBatchPaidAmount] = useState<string>("");
  // TK nhận tiền nhập tay khi NCC chưa có (lưu ngược vào nha_cung_cap khi tạo)
  const [manualAcct, setManualAcct] = useState("");
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
    type Bucket = { ncc: Pick<NccGroup, "nccTen" | "nccStk" | "nccNganHang" | "nccTaiKhoanBlob"> & { nccId: number | null }; months: Map<string, MonthGroup> };
    const map = new Map<string, Bucket>();

    const ensureNcc = (
      nccKey: string,
      nccId: number | null,
      nccTen: string,
      nccStk: string | null,
      nccNganHang: string | null,
      nccTaiKhoanBlob: string | null,
    ): Bucket => {
      const ex = map.get(nccKey);
      if (ex) return ex;
      const fresh: Bucket = {
        ncc: { nccId, nccTen, nccStk, nccNganHang, nccTaiKhoanBlob },
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
      // Kỳ hiệu lực = override ky_thanh_toan (nếu kế toán đã đẩy) ?? tháng ngày đi.
      const monthKey = kyHieuLuc(r);
      const bucket = ensureNcc(nccKey, r.nha_cung_cap_id, r.ten_ncc ?? t("Chưa có NCC"), r.ncc_so_tai_khoan, r.ncc_ngan_hang, r.ncc_tai_khoan_thanh_toan);
      const mg = ensureMonth(bucket, monthKey);
      mg.rows.push(r);
      const tt = netPhaiTra(r);
      mg.totalThanhTien += tt;
      mg.totalDaTT += r.so_tien_da_tt;
      // "Còn" = còn CẦN ĐỀ NGHỊ = NET − đã đề nghị (so_tien_da_dntt, gồm ĐNTT chưa
      // trả). KHÔNG dùng so_tien_da_tt (đã trả) — kẻo phần đã đề nghị chưa trả bị
      // batch lại → đề nghị trùng/trả dư cho NCC.
      mg.totalConLai += Math.max(0, tt - r.so_tien_da_dntt);
    });

    dnttList.forEach((d) => {
      // Hook useDinhKyDNTTList join NCC vào row nhưng DinhKyDNTTRow chưa khai
      // báo các field này — narrow cục bộ thay vì `any`.
      const dNcc = d as DinhKyDNTTRow & {
        ten_ncc?: string | null;
        ncc_so_tai_khoan?: string | null;
        ncc_ngan_hang?: string | null;
        ncc_tai_khoan_thanh_toan?: string | null;
      };
      const nccKey = String(d.nha_cung_cap_id ?? "khong_ncc");
      const minDate = d.ngay_di_min;
      // ky_hieu_luc tính từ chính chi phí phiếu này phân bổ (đã tính override) →
      // phiếu luôn nằm cùng cụm với chi phí, kể cả khi chi phí bị đẩy tháng.
      const monthKey = d.ky_hieu_luc ?? monthKeyFromDate(minDate ?? null) ?? "khong_thang";
      const bucket = ensureNcc(
        nccKey,
        d.nha_cung_cap_id,
        dNcc.ten_ncc || t("Chưa có NCC"),
        dNcc.ncc_so_tai_khoan || null,
        dNcc.ncc_ngan_hang || null,
        dNcc.ncc_tai_khoan_thanh_toan || null,
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
        nccTaiKhoanBlob: bucket.ncc.nccTaiKhoanBlob,
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
      const tt = netPhaiTra(r);
      return s + Math.max(0, tt - r.so_tien_da_dntt);
    }, 0);
  }, [dialogCtx]);

  const batchPartialNum = Number((batchPaidAmount || "").replace(/\D/g, "")) || 0;
  const batchEffectiveAmount = batchMode === "full"
    ? dialogTotalConLai
    : Math.min(batchPartialNum, dialogTotalConLai);
  const batchPartialValid = batchMode === "full" || (batchPartialNum > 0 && batchPartialNum <= dialogTotalConLai);

  // TK nhận tiền hiện có của NCC trong dialog (null = chưa có → hiện ô nhập tay)
  const dialogAcct = dialogCtx
    ? resolveNccTaiKhoanText({
        so_tai_khoan: dialogCtx.rows[0]?.ncc_so_tai_khoan,
        ngan_hang: dialogCtx.rows[0]?.ncc_ngan_hang,
        tai_khoan_thanh_toan: dialogCtx.rows[0]?.ncc_tai_khoan_thanh_toan,
      })
    : null;

  const openCreateDialogForMonth = (ncc: NccGroup, mg: MonthGroup) => {
    if (!ncc.nccId) { toast.error(t("Tháng này không có NCC hợp lệ")); return; }
    const eligible = mg.rows.filter((r) => {
      const tt = netPhaiTra(r);
      return Math.max(0, tt - r.so_tien_da_dntt) > 0;
    });
    if (eligible.length === 0) { toast.warning(t("Tháng này không còn chi phí cần thanh toán")); return; }
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
    setManualAcct("");
  };

  const closeCreateDialog = () => {
    setDialogCtx(null);
    setBatchMode("full");
    setBatchPaidAmount("");
    setBatchMoTa("");
    setManualAcct("");
  };

  const handleCreateBatch = async () => {
    if (!dialogCtx) return;
    if (!batchPartialValid || batchEffectiveAmount <= 0) {
      toast.error(t("Số tiền không hợp lệ"));
      return;
    }

    // Pro-rata phân bổ effectiveAmount theo tỉ lệ "còn lại" mỗi chi phí.
    // Largest-remainder method (proRataInts) → SUM(allocs) === batchEffectiveAmount
    // không cần manual drift fix nữa.
    const conLaiByRow = dialogCtx.rows.map((r) => ({
      id: r.id,
      conLai: Math.max(0, netPhaiTra(r) - r.so_tien_da_dntt),
    }));
    const allocAmts = proRataInts(batchEffectiveAmount, conLaiByRow.map((x) => x.conLai));
    const allocations = conLaiByRow.map((x, i) => ({
      chi_phi_id: x.id,
      so_tien: allocAmts[i],
    }));

    const cocSuffix = batchMode === "partial" ? " (Cọc)" : "";
    const defaultMoTa = batchMoTa || `Thanh toán định kỳ – ${dialogCtx.nccTen} – ${dialogCtx.monthLabel}${cocSuffix}`;

    // Snapshot tài khoản nhận tiền: ưu tiên ô "tài khoản thanh toán" (blob gộp
    // sẵn tên+STK+ngân hàng) → gộp thành 1 dòng lưu vào so_tai_khoan, ngan_hang
    // để null. Fallback 2 cột cấu trúc. NCC chưa có TK → dùng blob user vừa
    // nhập trong dialog (đồng thời lưu ngược vào nha_cung_cap).
    const acctRow = dialogCtx.rows[0];
    const manualBlob = !dialogAcct ? manualAcct.trim() : "";
    const blob = manualBlob || acctRow?.ncc_tai_khoan_thanh_toan?.trim();
    const snapshotStk = blob
      ? resolveNccTaiKhoanText({ tai_khoan_thanh_toan: blob })
      : (acctRow?.ncc_so_tai_khoan ?? null);
    const snapshotBank = blob ? null : (acctRow?.ncc_ngan_hang ?? null);

    setSubmitting(true);
    try {
      await createBatch.mutateAsync({
        nccId: dialogCtx.nccId,
        moTa: defaultMoTa,
        chiPhiIds: dialogCtx.rows.map((r) => r.id),
        allocations,
        soTien: batchEffectiveAmount,
        laCoc: batchMode === "partial",
        tenNcc: dialogCtx.nccTen,
        soTaiKhoan: snapshotStk,
        nganHang: snapshotBank,
        capNhatNccTaiKhoan: manualBlob || null,
      });
      toast.success(t("Đã tạo đề nghị thanh toán định kỳ"));
      closeCreateDialog();
    } catch (err: unknown) {
      toast.error(t("Lỗi: ") + (errMsg(err) || t("Không thể tạo ĐNTT")));
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
          <h1 className="text-lg font-semibold">{t("Thanh toán định kỳ")}</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {t("NCC cho nợ → tổng hợp chi phí → tạo ĐNTT gộp → duyệt → thanh toán")}
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <SearchableSelect
          options={[
            { value: "all", label: t("Tất cả nhà cung cấp") },
            ...nccOptions.map((n) => ({ value: String(n.id), label: n.ten })),
          ]}
          value={filterNcc}
          onChange={setFilterNcc}
          placeholder={t("Tất cả nhà cung cấp")}
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
              {tuNgay ? format(tuNgay, "dd/MM/yyyy") : t("Từ ngày")}
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
              {denNgay ? format(denNgay, "dd/MM/yyyy") : t("Đến ngày")}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar mode="single" selected={denNgay} onSelect={setDenNgay} initialFocus />
          </PopoverContent>
        </Popover>

        {hasActiveFilter && (
          <Button variant="ghost" size="sm" className="h-8 text-sm" onClick={clearFilters}>
            {t("Xóa bộ lọc")}
          </Button>
        )}
      </div>

      {effectiveTuNgay || effectiveDenNgay ? (
        <p className="text-xs text-muted-foreground -mt-2">
          {t("Lọc đoàn khởi hành:")} {effectiveTuNgay || "—"} → {effectiveDenNgay || "—"} {t("(theo `doan.ngay_di`)")}
        </p>
      ) : null}

      {isLoading && (
        <div className="text-sm text-muted-foreground">{t("Đang tải...")}</div>
      )}

      {!isLoading && groupedByNccMonth.length === 0 && (
        <div className="rounded-lg border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
          {t("Không có chi phí định kỳ và ĐNTT nào trong bộ lọc hiện tại")}
        </div>
      )}

      {/* Per-NCC card → group by tháng */}
      {groupedByNccMonth.map((ncc) => {
        const nccAcct = resolveNccTaiKhoanText({
          so_tai_khoan: ncc.nccStk,
          ngan_hang: ncc.nccNganHang,
          tai_khoan_thanh_toan: ncc.nccTaiKhoanBlob,
        });
        return (
        <Card key={ncc.nccKey}>
          <CardHeader className="py-3 px-4">
            <CardTitle className="text-sm font-semibold">{ncc.nccTen}</CardTitle>
            {nccAcct && (
              <p className="text-xs text-muted-foreground mt-0.5">
                {t("STK:")} {nccAcct}
              </p>
            )}
          </CardHeader>
          <CardContent className="px-4 pb-3 pt-0 space-y-2">
            {ncc.months.map((mg) => (
              <MonthGroupCard
                key={mg.monthKey}
                monthGroup={mg}
                nccTen={ncc.nccTen}
                nccStk={ncc.nccStk}
                nccNganHang={ncc.nccNganHang}
                nccTaiKhoanBlob={ncc.nccTaiKhoanBlob}
                onCreateDNTT={() => openCreateDialogForMonth(ncc, mg)}
              />
            ))}
          </CardContent>
        </Card>
        );
      })}

      {/* Dialog tạo ĐNTT theo tháng */}
      <Dialog open={!!dialogCtx} onOpenChange={(v) => { if (!v) closeCreateDialog(); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {t("Tạo ĐNTT định kỳ")}
              {dialogCtx && <span className="text-xs font-normal text-muted-foreground"> — {dialogCtx.nccTen} · {dialogCtx.monthLabel}</span>}
            </DialogTitle>
          </DialogHeader>
          {dialogCtx && (
            <div className="space-y-4 py-2">
              <div className="rounded-md bg-muted/40 px-4 py-3 space-y-1 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{t("Số khoản")}</span>
                  <span className="font-medium">{dialogCtx.rows.length}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{t("Tổng còn lại của tháng")}</span>
                  <span className="font-semibold text-orange-600">{fmt(dialogTotalConLai)} ₫</span>
                </div>
                <div className="flex justify-between gap-3">
                  <span className="text-muted-foreground shrink-0">{t("Chuyển đến")}</span>
                  {dialogAcct ? (
                    <span className="text-right">{dialogAcct}</span>
                  ) : (
                    <span className="text-amber-700 italic text-right">{t("Chưa có TK — nhập bên dưới")}</span>
                  )}
                </div>
              </div>

              {!dialogAcct && (
                <div className="space-y-1.5">
                  <Label className="text-sm">{t("Tài khoản nhận tiền của NCC")}</Label>
                  <Textarea
                    value={manualAcct}
                    onChange={(e) => setManualAcct(e.target.value)}
                    placeholder={t("Tên chủ TK, số tài khoản, ngân hàng — mỗi dòng 1 mục")}
                    rows={3}
                    className="text-sm"
                  />
                  <p className="text-[11px] text-muted-foreground">
                    {t("Sẽ lưu vào hồ sơ NCC và in trên ĐNTT này")}
                  </p>
                </div>
              )}

              <div className="space-y-1.5">
                <Label className="text-sm">{t("Số tiền đề nghị")}</Label>
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
                    {t("Toàn bộ")} ({fmt(dialogTotalConLai)} ₫)
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
                    {t("Trả trước 1 phần (cọc)")}
                  </button>
                </div>
                {batchMode === "partial" && (
                  <div className="space-y-1">
                    <Input
                      type="text"
                      inputMode="numeric"
                      value={batchPaidAmount}
                      onChange={(e) => setBatchPaidAmount(e.target.value.replace(/\D/g, ""))}
                      placeholder={`${t("Nhập số tiền cọc (≤")} ${fmt(dialogTotalConLai)} ₫)`}
                      className="text-sm"
                      autoFocus
                    />
                    {batchPaidAmount && !batchPartialValid && (
                      <p className="text-[11px] text-red-600">
                        {t("Số tiền phải lớn hơn 0 và ≤")} {fmt(dialogTotalConLai)} ₫
                      </p>
                    )}
                    {batchPartialValid && batchPartialNum > 0 && batchPartialNum < dialogTotalConLai && (
                      <p className="text-[11px] text-muted-foreground">
                        {t("Phần còn lại")} {fmt(dialogTotalConLai - batchEffectiveAmount)} ₫ {t("→ tạo ĐNTT khác sau")}
                      </p>
                    )}
                  </div>
                )}
              </div>

              <div className="space-y-1.5">
                <Label className="text-sm">{t("Mô tả ĐNTT")}</Label>
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
                    Math.max(0, netPhaiTra(r) - r.so_tien_da_dntt)
                  );
                  const allocated = batchMode === "partial" && batchPartialValid && batchEffectiveAmount > 0
                    ? proRataInts(batchEffectiveAmount, conLais)
                    : conLais;
                  return dialogCtx.rows.map((r, i) => (
                    <div key={r.id} className="flex justify-between text-muted-foreground">
                      <span className="truncate max-w-[220px]">
                        {r.ten_doan || `${t("Đoàn")} #${r.doan_id}`} · {r.mo_ta}
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
                    <span className="text-muted-foreground">{t("Đề nghị thanh toán lần này")}</span>
                    <span className="font-semibold text-orange-600">{fmt(batchEffectiveAmount)} ₫</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">{t("Sau khi tạo, còn lại")}</span>
                    <span className="font-medium">{fmt(dialogTotalConLai - batchEffectiveAmount)} ₫</span>
                  </div>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={closeCreateDialog}>{t("Hủy")}</Button>
            <Button
              onClick={handleCreateBatch}
              disabled={submitting || !batchPartialValid || batchEffectiveAmount <= 0}
            >
              {submitting ? t("Đang tạo...") : `${t("Tạo ĐNTT")}${batchMode === "partial" ? ` ${t("cọc")}` : ""}`}
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
  nccTen,
  nccStk,
  nccNganHang,
  nccTaiKhoanBlob,
  onCreateDNTT,
}: {
  monthGroup: MonthGroup;
  nccTen: string;
  nccStk: string | null;
  nccNganHang: string | null;
  nccTaiKhoanBlob: string | null;
  onCreateDNTT: () => void;
}) {
  useTranslate();
  // Default thu gọn để dễ scan summary; user click để mở.
  const [expanded, setExpanded] = useState(false);
  const [cancelTarget, setCancelTarget] = useState<DNTTRow | null>(null);
  const [viewTarget, setViewTarget] = useState<DNTTRow | null>(null);
  const [printingId, setPrintingId] = useState<number | null>(null);
  const setKy = useSetKyThanhToan();
  // Kỳ đích khi bấm "Đẩy sang". Cụm "Chưa rõ tháng" không có kỳ kế hợp lệ
  // (kyKeTiep trả về chính nó) → ẩn nút, tránh ghi giá trị vi phạm CHECK ở DB.
  const kyDich = kyKeTiep(monthGroup.monthKey);
  const dayDuoc = kyDich !== monthGroup.monthKey;

  // Đẩy chi phí của 1 đoàn sang kỳ khác (ky = null → trả về kỳ gốc theo ngày đi).
  const handleDoiKy = (chiPhiIds: number[], ky: string | null) => {
    setKy.mutate(
      { chiPhiIds, ky },
      {
        onSuccess: () => toast.success(ky ? t("Đã đẩy sang kỳ sau") : t("Đã trả về kỳ gốc")),
        onError: (e: unknown) => toast.error(errMsg(e) || t("Không đổi được kỳ thanh toán")),
      },
    );
  };

  // In Giấy đề nghị thanh toán cho NCC (Word) — reuse mẫu ĐNTT khác.
  // NCC = đơn vị thụ hưởng (chủ tài khoản); ô "Người đề nghị" để trống cho NV ký.
  // Nội dung gọn 1 dòng "Thanh toán công nợ tháng .." (KHÔNG liệt kê từng đoàn),
  // số tiền = tổng ĐNTT (d.so_tien). Tháng lấy từ monthKey (luôn tiếng Việt,
  // KHÔNG dùng monthLabel vì label phụ thuộc locale t("Tháng")).
  const handlePrint = async (d: DinhKyDNTTRow) => {
    setPrintingId(d.id);
    try {
      let noiDung = "Thanh toán công nợ";
      if (monthGroup.monthKey !== "khong_thang") {
        const [y, m] = monthGroup.monthKey.split("-");
        noiDung = `Thanh toán công nợ tháng ${parseInt(m, 10)}/${y}`;
      }
      // Ưu tiên ô "tài khoản thanh toán" (blob nhiều dòng) → in nguyên khối,
      // KHÔNG dùng 2 cột STK/ngân hàng riêng (có thể trống với NCC này).
      const blob = nccTaiKhoanBlob?.trim();
      await exportDnttKhacHoanUngWord({
        maDoan: "",
        tenNguoiNhan: nccTen || d.ten_nha_cung_cap || "—",
        soTaiKhoan: blob ? null : nccStk,
        nganHang: blob ? null : nccNganHang,
        taiKhoanBlob: blob || null,
        lyDo: d.mo_ta || t("Thanh toán định kỳ"),
        nhanLabel: "Đơn vị thụ hưởng",
        tenNguoiDeNghi: "",
        hinhThuc: "chuyen_khoan", // trả NCC định kỳ luôn là chuyển khoản
        items: [{ mo_ta: noiDung, so_luong: 1, don_gia: d.so_tien, thanh_tien: d.so_tien }],
        ngayLap: d.created_at,
        ngayCanThanhToan: d.ngay_can_thanh_toan,
      });
      toast.success(t("Đã xuất Giấy đề nghị thanh toán"));
    } catch (e: unknown) {
      toast.error(t("Lỗi xuất Word: ") + (errMsg(e) || ""));
    } finally {
      // Chỉ nhả nút của chính ĐNTT này — tránh bật lại nút ĐNTT khác đang in.
      setPrintingId((prev) => (prev === d.id ? null : prev));
    }
  };

  // Excel tổng hợp cụm này: 1 dòng / đoàn (mã đoàn, ngày đi, số khách, tiền).
  // Số tiền dùng CHUNG công thức với header card — xem lib/export-dinh-ky-excel.
  const handleExportExcel = () => {
    try {
      exportDinhKyExcel({
        rows: monthGroup.rows,
        nccTen,
        monthLabel: monthGroup.monthLabel,
      });
      toast.success(t("Đã xuất Excel tổng hợp"));
    } catch (e: unknown) {
      toast.error(t("Lỗi xuất Excel: ") + (errMsg(e) || ""));
    }
  };

  const fmtRange = (min?: string | null, max?: string | null) => {
    if (!min && !max) return null;
    const mm = min ? format(new Date(min + "T00:00:00"), "dd/MM/yy") : "?";
    const mx = max ? format(new Date(max + "T00:00:00"), "dd/MM/yy") : "?";
    return min === max ? mm : `${mm} → ${mx}`;
  };

  // "Còn" = còn cần ĐỀ NGHỊ (totalConLai theo so_tien_da_dntt). fullyProposed = đã
  // đề nghị hết (ẩn nút Tạo ĐNTT + tô xanh "Còn 0"). fullyPaid = đã TRẢ đủ (totalDaTT)
  // → CHỈ khi này mới hiện ✓ "hoàn tất", tránh hiểu nhầm đề-nghị-hết là đã-trả.
  const fullyProposed = monthGroup.totalConLai === 0 && monthGroup.totalThanhTien > 0;
  const fullyPaid = monthGroup.totalDaTT >= monthGroup.totalThanhTien && monthGroup.totalThanhTien > 0;

  // Group chi phí by đoàn để hiển thị gom.
  // Kèm trạng thái "đẩy kỳ": hóa đơn NCC xuất khi đoàn kết thúc, nên đoàn khởi
  // hành cuối tháng thường phải trả ở kỳ sau — kế toán đẩy cả cụm đoàn × NCC này.
  const byDoan = useMemo(() => {
    const map = new Map<number, { ten_doan: string; ngay_di: string | null; rows: DinhKyChiPhiRow[] }>();
    monthGroup.rows.forEach((r) => {
      const ex = map.get(r.doan_id);
      if (ex) ex.rows.push(r);
      else map.set(r.doan_id, {
        ten_doan: r.ten_doan ?? `${t("Đoàn")} #${r.doan_id}`,
        ngay_di: r.ngay_kh_di,
        rows: [r],
      });
    });
    return [...map.entries()]
      .map(([doan_id, v]) => ({
        doan_id,
        ...v,
        // Đã đẩy khỏi kỳ gốc → hiện badge + cho trả về.
        daDay: v.rows.some(daDoiKy),
        kyGoc: kyMacDinh({ ngay_kh_di: v.ngay_di }),
        // Dòng đã nằm trong ĐNTT thì không đổi kỳ được (chi phí và phiếu sẽ lệch cụm).
        doiKyDuoc: v.rows.every(coTheDoiKy),
        chiPhiIds: v.rows.map((r) => r.id),
      }))
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
            · {fmt(monthGroup.totalThanhTien)} / {t("Đã TT")} <span className="text-emerald-600">{fmt(monthGroup.totalDaTT)}</span> /{" "}
            <span className={fullyProposed ? "text-emerald-600 font-medium" : "text-orange-600 font-medium"}>
              {t("Còn")} {fmt(monthGroup.totalConLai)}
            </span>
            {monthGroup.rows.length > 0 && (
              <> · {monthGroup.rows.length} {t("chi phí")} · {monthGroup.doanCount} {t("đoàn")}</>
            )}
            {fullyPaid && <span className="ml-1">✓</span>}
          </span>
        </button>
        <div className="flex items-center gap-1.5 shrink-0">
          {/* Excel tổng hợp: đoàn nào dùng bao nhiêu + bao nhiêu khách. Hiện cả khi
              đã đề nghị/trả hết — kế toán vẫn cần bản đối chiếu gửi NCC. */}
          {monthGroup.rows.length > 0 && (
            <Button
              size="sm" variant="outline" className="h-7 text-xs gap-1"
              title={t("Tải Excel tổng hợp theo đoàn")}
              onClick={handleExportExcel}
            >
              <FileSpreadsheet className="h-3 w-3" /> {t("Excel")}
            </Button>
          )}
          {monthGroup.totalConLai > 0 && (
            <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={onCreateDNTT}>
              <Plus className="h-3 w-3" /> {t("Tạo ĐNTT")}
            </Button>
          )}
        </div>
      </div>

      {expanded && (
        <div className="border-t border-border px-3 py-2 space-y-3 bg-muted/10">
          {/* Chi phí theo từng đoàn */}
          {byDoan.length > 0 && (
            <div className="space-y-2">
              {byDoan.map((d) => (
                <div key={d.doan_id} className="text-xs">
                  <div className="font-medium flex items-center gap-2 flex-wrap">
                    <span>
                      {d.ten_doan}
                      <span className="ml-2 text-muted-foreground font-normal">
                        ({d.ngay_di ? format(new Date(d.ngay_di + "T00:00:00"), "dd/MM/yyyy") : "—"})
                      </span>
                    </span>
                    {d.daDay && (
                      <span
                        className="text-[10px] font-normal px-1.5 py-0.5 rounded bg-violet-100 text-violet-700"
                        title={t("Chi phí đoàn này đã được đẩy sang kỳ hiện tại")}
                      >
                        {t("đẩy từ")} {monthLabelFromKey(d.kyGoc)}
                      </span>
                    )}
                    {d.doiKyDuoc ? (
                      d.daDay ? (
                        <button
                          type="button"
                          className="text-[10px] font-normal text-muted-foreground hover:text-foreground inline-flex items-center gap-0.5 disabled:opacity-50"
                          disabled={setKy.isPending}
                          title={t("Trả chi phí đoàn này về kỳ gốc")}
                          onClick={() => handleDoiKy(d.chiPhiIds, null)}
                        >
                          <Undo2 className="h-3 w-3" /> {t("Trả về kỳ gốc")}
                        </button>
                      ) : dayDuoc ? (
                        <button
                          type="button"
                          className="text-[10px] font-normal text-muted-foreground hover:text-foreground inline-flex items-center gap-0.5 disabled:opacity-50"
                          disabled={setKy.isPending}
                          title={t("Hóa đơn NCC xuất khi đoàn kết thúc → đẩy khoản này sang kỳ sau")}
                          onClick={() => handleDoiKy(d.chiPhiIds, kyDich)}
                        >
                          <CornerDownRight className="h-3 w-3" /> {t("Đẩy sang")} {monthLabelFromKey(kyDich)}
                        </button>
                      ) : null
                    ) : (
                      <span
                        className="text-[10px] font-normal text-muted-foreground"
                        title={t("Chi phí đã nằm trong ĐNTT — hủy ĐNTT trước nếu muốn đổi kỳ")}
                      >
                        {t("(đã có ĐNTT — không đổi kỳ được)")}
                      </span>
                    )}
                  </div>
                  <div className="pl-3 space-y-0.5">
                    {d.rows.map((r) => {
                      const tt = netPhaiTra(r);
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
                              <span className="text-emerald-600 text-[10px]">✓ {t("Đã TT")}</span>
                            ) : r.so_tien_da_tt > 0 ? (
                              <span className="text-amber-600 text-[10px]">{t("Còn")} {fmt(conLai)}</span>
                            ) : (
                              <span className="text-orange-600 text-[10px]">{t("Chưa TT")}</span>
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
                {t("ĐNTT của tháng này")} ({monthGroup.dntts.length})
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
                        {d.la_coc && <span className="ml-1 px-1 py-0.5 rounded bg-amber-100 text-amber-700 text-[9px]">{t("Cọc")}</span>}
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
                        {t(duyetInfo.textKey)}
                      </span>
                      <span className={cn("px-1.5 py-0.5 rounded text-[10px] font-medium shrink-0", ttInfo.cls)}>
                        {t(ttInfo.textKey)}
                      </span>
                      <Button
                        variant="ghost" size="sm"
                        className="h-6 px-1.5 shrink-0"
                        title={t("In đề nghị thanh toán")}
                        disabled={printingId === d.id}
                        onClick={() => handlePrint(d)}
                      >
                        <Printer className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost" size="sm"
                        className="h-6 px-1.5 shrink-0"
                        title={t("Xem chi tiết")}
                        onClick={() => setViewTarget(d)}
                      >
                        <Eye className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost" size="sm"
                        className="h-6 px-1.5 text-red-600 hover:text-red-700 shrink-0"
                        title={t("Hủy ĐNTT")}
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
  useTranslate();
  const cancelMut = useCancelDNTT();
  const [mode, setMode] = useState<"cong_no" | "hoan_tien" | undefined>(undefined);
  const paid = dntt.paid_amount || 0;
  const needsMode = paid > 0;

  const handleConfirm = async () => {
    try {
      await cancelMut.mutateAsync({ id: dntt.id, mode: needsMode ? mode : undefined });
      toast.success(t("Đã hủy ĐNTT"));
      onClose();
    } catch (err: unknown) {
      toast.error(t("Lỗi: ") + (errMsg(err) || t("Không thể hủy")));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t("Hủy ĐNTT")} #{dntt.id}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2 text-sm">
          <p className="text-muted-foreground">
            {needsMode
              ? `${t("Đã có")} ${fmt(paid)} ${t("₫ được thanh toán. Chọn cách xử lý:")}`
              : t("ĐNTT chưa có thanh toán nào — sẽ được đánh dấu đã hủy.")}
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
                  <div className="font-medium">{t("Tạo công nợ với NCC")}</div>
                  <div className="text-xs text-muted-foreground">
                    {t("Số tiền đã trả thành công nợ, dùng cấn trừ ĐNTT khác sau.")}
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
                  <div className="font-medium">{t("NCC hoàn tiền")}</div>
                  <div className="text-xs text-muted-foreground">
                    {t("NCC đã trả lại tiền mặt, không cần cấn trừ.")}
                  </div>
                </div>
              </label>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>{t("Đóng")}</Button>
          <Button
            variant="destructive"
            onClick={handleConfirm}
            disabled={cancelMut.isPending || (needsMode && !mode)}
          >
            {cancelMut.isPending ? t("Đang hủy...") : t("Xác nhận hủy")}
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
  useTranslate();
  const { data: allocs = [], isLoading } = useDinhKyDNTTAllocations(dntt.id);

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t("Chi tiết ĐNTT")} #{dntt.id}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2 text-sm">
          <div className="rounded-md bg-muted/40 px-4 py-2 space-y-0.5 text-xs">
            <div><span className="text-muted-foreground">{t("Mô tả:")} </span>{dntt.mo_ta || "—"}</div>
            <div>
              <span className="text-muted-foreground">{t("Tổng:")} </span>
              <span className="font-semibold">{fmt(dntt.so_tien)} ₫</span>
              {" · "}
              <span className="text-muted-foreground">{t("Đã TT:")} </span>
              <span className="text-emerald-600">{fmt(dntt.paid_amount || 0)} ₫</span>
            </div>
          </div>
          <div className="text-xs font-semibold uppercase text-muted-foreground">
            {allocs.length} {t("chi phí được phân bổ")}
          </div>
          {isLoading ? (
            <div className="text-xs text-muted-foreground">{t("Đang tải...")}</div>
          ) : (
            <div className="border border-border rounded-md overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="text-xs">
                    <TableHead className="py-1">{t("Đoàn")}</TableHead>
                    <TableHead className="py-1">{t("Ngày đi")}</TableHead>
                    <TableHead className="py-1">{t("Mô tả")}</TableHead>
                    <TableHead className="py-1 text-right">{t("Số tiền")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {allocs.map((a) => (
                    <TableRow key={a.chi_phi_id} className="text-xs">
                      <TableCell className="py-1.5 font-medium">
                        {a.chi_phi?.doan?.ten_doan || `${t("Đoàn")} #${a.chi_phi?.doan_id}`}
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
          <Button variant="outline" onClick={onClose}>{t("Đóng")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
