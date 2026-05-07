import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { format } from "date-fns";
import { vi } from "date-fns/locale";
import { useRoleAtLeast } from "@/hooks/use-permissions";
import { AccessDenied } from "@/components/PermissionGate";
import { useAuth } from "@/hooks/use-auth";
import { useDoanList, useAgents, useDiaDiem } from "@/hooks/use-doan";
import {
  useChiPhiSummaryMap,
  useDoanInvoiceData,
  useDoanInvoiceSummaryMap,
  useUpsertDoanInvoice,
  useUploadInvoiceFile,
  useDeleteInvoiceFile,
} from "@/hooks/use-doan-invoice";
import { useDoanLogList, useToggleResolved } from "@/hooks/use-doan-log";
import {
  useCanhDiem,
  useNhaHang,
  useKhachSan,
  useDoanNgayList,
  useDoanNgayItems,
  generateDays,
  mergeDaysWithDB,
  type DayLocal,
} from "@/hooks/use-dieu-tour";
import type { DieuTourExportData } from "@/lib/export-dieu-tour-word";
import DieuTourWordPreviewModal from "@/components/dieu-tour/DieuTourWordPreviewModal";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { FileText, Upload, X, ReceiptText, MapPin, Users, TrendingUp, CheckCircle2, Circle } from "lucide-react";
import { cn } from "@/lib/utils";

// ── Local types ───────────────────────────────────────────────────────────────

interface DoanWithRel {
  id: number;
  ten_doan: string;
  agent_id: number | null;
  dia_diem_id: number | null;
  so_khach: number | null;
  so_khach_lon: number | null;
  so_khach_em1: number | null;
  so_khach_em2: number | null;
  so_khach_tl: number | null;
  ngay_di: string | null;
  ngay_ve: string | null;
  trang_thai: string | null;
  chuyen_bay_don: string | null;
  chuyen_bay_tien: string | null;
  ghi_chu_dieu_tour: string | null;
  agents?: { id: number; ten: string } | null;
  dia_diem?: { ten: string } | null;
  huong_dan_vien?: { id: number; ten: string } | null;
  xe?: any | null;
  // Extra DB fields not in the Doan interface
  bang_don?: string | null;
  truong_doan?: string | null;
  tang_pham?: string[] | null;
  chu_thich_khach?: string | null;
  shopping?: boolean | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const fmtVND = (n: number) => n.toLocaleString("vi-VN");
const fmtDate = (d: string | null) => {
  if (!d) return "—";
  try { return format(new Date(d), "dd/MM/yyyy", { locale: vi }); } catch { return d; }
};

const TRANG_THAI_LABEL: Record<string, string> = {
  dang_chay: "Đang chạy",
  hoan_thanh: "Hoàn thành",
  huy: "Đã hủy",
};

const CURRENCIES = ["VND", "USD", "CNY", "EUR", "JPY", "KRW", "TWD", "THB", "AUD"];

// ── InvoiceDieuTourSection ────────────────────────────────────────────────────

function InvoiceDieuTourSection({ doan }: { doan: DoanWithRel }) {
  const { data: canhDiemList = [] } = useCanhDiem();
  const { data: nhaHangList = [] } = useNhaHang();
  const { data: khachSanList = [] } = useKhachSan();
  const { data: dbNgayRows = [] } = useDoanNgayList(doan.id);
  const { data: dbNgayItems = [] } = useDoanNgayItems(doan.id);
  const [showPreview, setShowPreview] = useState(false);

  const days = useMemo<DayLocal[]>(() => {
    const gen = generateDays(doan.ngay_di, doan.ngay_ve);
    return mergeDaysWithDB(gen, dbNgayRows, dbNgayItems);
  }, [doan.ngay_di, doan.ngay_ve, dbNgayRows, dbNgayItems]);

  const exportData = useMemo((): DieuTourExportData => {
    const soKhachLon = doan.so_khach_lon ?? 0;
    const soKhachEm1 = doan.so_khach_em1 ?? 0;
    const soKhachEm2 = doan.so_khach_em2 ?? 0;
    const soKhachTl = doan.so_khach_tl ?? 0;
    const totalKhach = soKhachLon + soKhachEm1 + soKhachEm2 + soKhachTl;
    return {
      days,
      canhDiemList,
      nhaHangList,
      khachSanList,
      tenDoan: doan.ten_doan,
      hdv: doan.huong_dan_vien?.ten ?? "",
      xe: doan.xe ?? null,
      ngayDi: doan.ngay_di ?? null,
      ngayVe: doan.ngay_ve ?? null,
      bangDon: doan.bang_don || "",
      shopping: doan.shopping ?? false,
      truongDoan: doan.truong_doan || "",
      chuyenBayDon: doan.chuyen_bay_don || "",
      chuyenBayTien: doan.chuyen_bay_tien || "",
      soKhachLon,
      soKhachEm1,
      soKhachEm2,
      soKhachTl,
      totalKhach: doan.so_khach ?? totalKhach,
      chuThichKhach: doan.chu_thich_khach || "",
      gifts: Array.isArray(doan.tang_pham) ? doan.tang_pham : [],
      ghiChuDieuTour: doan.ghi_chu_dieu_tour || "",
    };
  }, [doan, days, canhDiemList, nhaHangList, khachSanList]);

  return (
    <div className="space-y-3">
      <Button
        size="sm"
        variant="outline"
        onClick={() => setShowPreview(true)}
        className="gap-1.5"
      >
        <FileText className="h-3.5 w-3.5" />
        Xem / Xuất Word
      </Button>
      <DieuTourWordPreviewModal
        open={showPreview}
        data={exportData}
        onClose={() => setShowPreview(false)}
        onGhiChuSave={() => {}}
      />
    </div>
  );
}

// ── InvoiceDrawer ─────────────────────────────────────────────────────────────

function InvoiceDrawer({
  doan,
  open,
  onClose,
}: {
  doan: DoanWithRel | null;
  open: boolean;
  onClose: () => void;
}) {
  const { user } = useAuth();
  const { data: allLogs = [] } = useDoanLogList(doan?.id);
  const giaLogs = allLogs.filter((l) => l.loai === "gia");
  const confirmMut = useToggleResolved();

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-[560px] overflow-y-auto">
        {doan && (
          <>
            <SheetHeader className="mb-4">
              <SheetTitle className="text-base leading-snug">{doan.ten_doan}</SheetTitle>
            </SheetHeader>

            {/* Phát sinh giá */}
            <section className="mb-6">
              <h3 className="text-sm font-semibold mb-2 flex items-center gap-1.5">
                <ReceiptText className="h-4 w-4 text-amber-600" />
                Phát sinh giá
              </h3>
              {giaLogs.length === 0 ? (
                <p className="text-xs text-muted-foreground italic">Không có phát sinh giá.</p>
              ) : (
                <div className="space-y-2">
                  {giaLogs.map((log) => (
                    <div
                      key={log.id}
                      className={cn(
                        "border rounded p-2.5 text-xs space-y-0.5",
                        log.is_resolved ? "bg-muted/30 opacity-70" : "bg-amber-50/50",
                      )}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="space-y-0.5 flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="font-medium">{log.tieu_de}</span>
                            {log.is_resolved && (
                              <Badge variant="outline" className="text-[10px] text-green-700 border-green-300 py-0 gap-0.5">
                                <CheckCircle2 className="h-3 w-3" />
                                {log.resolved_by_ten ?? "Đã xác nhận"}
                              </Badge>
                            )}
                          </div>
                          {log.so_tien != null && (
                            <p className="font-semibold text-amber-700">{fmtVND(log.so_tien)} VND</p>
                          )}
                          {log.noi_dung && (
                            <p className="text-muted-foreground whitespace-pre-wrap">{log.noi_dung}</p>
                          )}
                          <p className="text-muted-foreground">{log.created_by_ten ?? "—"} · {fmtDate(log.created_at)}</p>
                        </div>
                        {!log.is_resolved && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs px-2 shrink-0 border-green-300 text-green-700 hover:bg-green-50"
                            disabled={confirmMut.isPending}
                            onClick={() => confirmMut.mutate({
                              id: log.id,
                              doan_id: doan!.id,
                              loai: log.loai,
                              is_resolved: true,
                              user_id: user?.user_id ?? null,
                              user_ten: user?.ho_ten ?? null,
                            })}
                          >
                            <Circle className="h-3 w-3 mr-1" />
                            Xác nhận
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* Lịch trình điều tour */}
            <section>
              <h3 className="text-sm font-semibold mb-3 flex items-center gap-1.5">
                <FileText className="h-4 w-4 text-blue-600" />
                Lịch trình điều tour
              </h3>
              <InvoiceDieuTourSection doan={doan} />
            </section>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

// ── InvoiceDoanCard ───────────────────────────────────────────────────────────

function InvoiceDoanCard({
  doan,
  chiPhiThucTe,
  onCardClick,
}: {
  doan: DoanWithRel;
  chiPhiThucTe: number;
  onCardClick: () => void;
}) {
  const { data: invoiceData, isLoading: invLoading } = useDoanInvoiceData(doan.id);
  const upsert = useUpsertDoanInvoice();
  const upload = useUploadInvoiceFile();
  const deleteFile = useDeleteInvoiceFile();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [rawValue, setRawValue] = useState("");
  const [isFocused, setIsFocused] = useState(false);
  const [currency, setCurrency] = useState("VND");

  useEffect(() => {
    if (!isFocused) {
      setRawValue(
        invoiceData?.so_tien_thu != null ? String(invoiceData.so_tien_thu) : "",
      );
    }
  }, [invoiceData?.so_tien_thu, isFocused]);

  useEffect(() => {
    setCurrency(invoiceData?.currency ?? "VND");
  }, [invoiceData?.currency]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setRawValue(e.target.value.replace(/[^0-9]/g, ""));
  };

  const handleCurrencyChange = (val: string) => {
    setCurrency(val);
    upsert.mutate(
      { doan_id: doan.id, currency: val },
      { onError: () => toast.error("Lỗi lưu") },
    );
  };

  const handleBlur = useCallback(() => {
    setIsFocused(false);
    const num = rawValue ? Number(rawValue) : null;
    const prev = invoiceData?.so_tien_thu ?? null;
    if (num !== prev) {
      upsert.mutate(
        { doan_id: doan.id, so_tien_thu: num, currency },
        {
          onSuccess: () => toast.success("Đã lưu số tiền thu"),
          onError: () => toast.error("Lỗi lưu số tiền thu"),
        },
      );
    }
  }, [rawValue, currency, invoiceData?.so_tien_thu, doan.id, upsert]);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;
    const currentFiles = invoiceData?.invoice_files ?? [];
    for (const file of files) {
      try {
        await upload.mutateAsync({ doanId: doan.id, file, currentFiles });
        toast.success(`Đã upload ${file.name}`);
      } catch {
        toast.error(`Lỗi upload ${file.name}`);
      }
    }
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleDeleteFile = (fileUrl: string) => {
    const currentFiles = invoiceData?.invoice_files ?? [];
    deleteFile.mutate(
      { doanId: doan.id, fileUrl, currentFiles },
      {
        onSuccess: () => toast.success("Đã xóa file"),
        onError: () => toast.error("Lỗi xóa file"),
      },
    );
  };

  const soKhachDisplay = useMemo(() => {
    const lon = doan.so_khach_lon ?? 0;
    const em1 = doan.so_khach_em1 ?? 0;
    const em2 = doan.so_khach_em2 ?? 0;
    const tl = doan.so_khach_tl ?? 0;
    const total = lon + em1 + em2 + tl || doan.so_khach || 0;
    const parts: string[] = [];
    if (lon > 0) parts.push(`${lon} NL`);
    if (em1 > 0) parts.push(`${em1} E1`);
    if (em2 > 0) parts.push(`${em2} E2`);
    if (tl > 0) parts.push(`${tl} TL`);
    return parts.length > 0 ? `${total} (${parts.join(" + ")})` : `${total ?? 0}`;
  }, [doan]);

  const files = invoiceData?.invoice_files ?? [];

  return (
    <div className="border rounded-lg bg-white px-3 py-2.5 flex items-center gap-3 hover:bg-muted/10 transition-colors">
      {/* Tour info — clickable for drawer */}
      <button
        className="flex-1 min-w-0 text-left"
        onClick={onCardClick}
      >
        <div className="flex items-center gap-2 mb-0.5">
          <span className="font-medium text-sm truncate">{doan.ten_doan}</span>
          {doan.trang_thai && (
            <Badge
              variant="outline"
              className={cn(
                "text-[10px] shrink-0",
                doan.trang_thai === "hoan_thanh" && "text-green-700 border-green-300",
                doan.trang_thai === "huy" && "text-red-700 border-red-300",
              )}
            >
              {TRANG_THAI_LABEL[doan.trang_thai] ?? doan.trang_thai}
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
          <span>{doan.agents?.ten ?? "—"}</span>
          {doan.dia_diem?.ten && (
            <>
              <span className="text-muted-foreground/30">·</span>
              <MapPin className="h-3 w-3 shrink-0" />
              <span>{doan.dia_diem.ten}</span>
            </>
          )}
          <span className="text-muted-foreground/30">·</span>
          <span>{fmtDate(doan.ngay_di)} → {fmtDate(doan.ngay_ve)}</span>
          <span className="text-muted-foreground/30">·</span>
          <Users className="h-3 w-3 shrink-0" />
          <span>{soKhachDisplay}</span>
        </div>
      </button>

      {/* Chi phí TT */}
      <div className="shrink-0 text-right w-36">
        <div className="text-[10px] text-muted-foreground">Chi phí TT</div>
        <div className="text-sm font-semibold text-blue-700">{fmtVND(chiPhiThucTe)} đ</div>
      </div>

      {/* Số tiền thu + ngoại tệ */}
      <div className="shrink-0 w-60">
        <div className="text-[10px] text-muted-foreground mb-0.5">Số tiền thu</div>
        {invLoading ? (
          <Skeleton className="h-8 w-full" />
        ) : (
          <div className="flex gap-1">
            <Select value={currency} onValueChange={handleCurrencyChange}>
              <SelectTrigger className="h-8 w-20 text-xs shrink-0 px-2">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CURRENCIES.map((c) => (
                  <SelectItem key={c} value={c} className="text-xs">{c}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              className="h-8 text-sm flex-1 min-w-0"
              placeholder="Số tiền..."
              value={isFocused ? rawValue : rawValue ? fmtVND(Number(rawValue)) : ""}
              onFocus={() => setIsFocused(true)}
              onChange={handleChange}
              onBlur={handleBlur}
              disabled={upsert.isPending}
            />
          </div>
        )}
      </div>

      {/* Files + upload */}
      <div className="shrink-0 flex items-center gap-1 flex-wrap max-w-[200px]">
        {files.map((f) => (
          <div
            key={f.url}
            className="flex items-center gap-1 text-[11px] bg-muted/60 rounded px-1.5 py-0.5 max-w-[180px]"
          >
            <a
              href={f.url}
              target="_blank"
              rel="noopener noreferrer"
              className="truncate text-blue-600 hover:underline max-w-[130px]"
            >
              {f.name}
            </a>
            <button
              onClick={() => handleDeleteFile(f.url)}
              className="text-muted-foreground hover:text-destructive shrink-0"
              disabled={deleteFile.isPending}
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        ))}
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          accept="image/*,.pdf"
          multiple
          onChange={handleUpload}
        />
        <Button
          size="sm"
          variant="ghost"
          className="h-7 px-2 text-xs gap-1 text-muted-foreground hover:text-foreground shrink-0"
          onClick={() => fileInputRef.current?.click()}
          disabled={upload.isPending}
        >
          <Upload className="h-3 w-3" />
          {upload.isPending ? "Đang upload..." : "Upload"}
        </Button>
      </div>
    </div>
  );
}

// ── InvoicePage ───────────────────────────────────────────────────────────────

export default function InvoicePage() {
  const canView = useRoleAtLeast("giam_doc");
  const { user } = useAuth();
  const vanPhongId = user?.role !== "admin" ? (user?.van_phong_id ?? null) : null;

  const { data: allDoan = [], isLoading } = useDoanList(vanPhongId);
  const { data: agents = [] } = useAgents();
  const { data: diaDiems = [] } = useDiaDiem();

  const [agentFilter, setAgentFilter] = useState("all");
  const [diadiemFilter, setDiadiemFilter] = useState("all");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [selectedDoan, setSelectedDoan] = useState<DoanWithRel | null>(null);

  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);

  const endedDoan = useMemo(
    () => (allDoan as DoanWithRel[]).filter((d) => d.ngay_ve && d.ngay_ve < today),
    [allDoan, today],
  );

  const endedDoanIds = useMemo(() => endedDoan.map((d) => d.id), [endedDoan]);

  const { data: chiPhiMap } = useChiPhiSummaryMap(endedDoanIds);
  const { data: invoiceSummaryMap } = useDoanInvoiceSummaryMap(endedDoanIds);

  const filteredDoan = useMemo(
    () =>
      endedDoan.filter((d) => {
        if (agentFilter !== "all" && d.agent_id !== Number(agentFilter)) return false;
        if (diadiemFilter !== "all" && d.dia_diem_id !== Number(diadiemFilter)) return false;
        if (fromDate && d.ngay_ve && d.ngay_ve < fromDate) return false;
        if (toDate && d.ngay_ve && d.ngay_ve > toDate) return false;
        return true;
      }),
    [endedDoan, agentFilter, diadiemFilter, fromDate, toDate],
  );

  const totalCPTT = useMemo(
    () => filteredDoan.reduce((s, d) => s + (chiPhiMap?.get(d.id)?.thucTe ?? 0), 0),
    [filteredDoan, chiPhiMap],
  );

  const totalDaThuVND = useMemo(
    () =>
      filteredDoan.reduce((s, d) => {
        const inv = invoiceSummaryMap?.get(d.id);
        return inv && (inv.currency === "VND" || !inv.currency) ? s + inv.amount : s;
      }, 0),
    [filteredDoan, invoiceSummaryMap],
  );

  const foreignCurrencyCount = useMemo(
    () =>
      filteredDoan.filter((d) => {
        const inv = invoiceSummaryMap?.get(d.id);
        return inv && inv.amount > 0 && inv.currency && inv.currency !== "VND";
      }).length,
    [filteredDoan, invoiceSummaryMap],
  );

  const pendingCount = useMemo(
    () => filteredDoan.filter((d) => !invoiceSummaryMap?.get(d.id)?.amount).length,
    [filteredDoan, invoiceSummaryMap],
  );

  const hasFilter = agentFilter !== "all" || diadiemFilter !== "all" || !!fromDate || !!toDate;

  if (!canView) return <AccessDenied />;

  return (
    <div className="p-4 max-w-7xl mx-auto space-y-4">
      {/* Header */}
      <div className="flex items-center gap-2 flex-wrap">
        <TrendingUp className="h-5 w-5 text-blue-600 shrink-0" />
        <h1 className="text-lg font-semibold">Đối soát chi phí</h1>
        {pendingCount > 0 && (
          <Badge variant="outline" className="text-amber-700 border-amber-300 text-xs">
            {pendingCount} chưa có số tiền thu
          </Badge>
        )}
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-2">
        <Select value={agentFilter} onValueChange={setAgentFilter}>
          <SelectTrigger className="w-40 h-8 text-xs">
            <SelectValue placeholder="Agent" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tất cả agent</SelectItem>
            {agents.map((a) => (
              <SelectItem key={a.id} value={String(a.id)}>
                {a.ten}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={diadiemFilter} onValueChange={setDiadiemFilter}>
          <SelectTrigger className="w-40 h-8 text-xs">
            <SelectValue placeholder="Địa điểm" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tất cả địa điểm</SelectItem>
            {diaDiems.map((d) => (
              <SelectItem key={d.id} value={String(d.id)}>
                {d.ten}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="flex items-center gap-1.5">
          <span className="text-xs text-muted-foreground">Ngày về</span>
          <input
            type="date"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
            className="border rounded px-2 py-1 text-xs h-8"
          />
          <span className="text-xs text-muted-foreground">—</span>
          <input
            type="date"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
            className="border rounded px-2 py-1 text-xs h-8"
          />
        </div>

        {hasFilter && (
          <Button
            size="sm"
            variant="ghost"
            className="h-8 text-xs"
            onClick={() => {
              setAgentFilter("all");
              setDiadiemFilter("all");
              setFromDate("");
              setToDate("");
            }}
          >
            Xóa lọc
          </Button>
        )}
      </div>

      {/* Summary strip */}
      <div className="flex flex-wrap gap-4 text-sm bg-muted/30 rounded-lg px-4 py-2.5">
        <span>
          <span className="font-semibold">{filteredDoan.length}</span>{" "}
          <span className="text-muted-foreground">đoàn</span>
        </span>
        <span>
          Tổng CPTT:{" "}
          <span className="font-semibold text-blue-700">{fmtVND(totalCPTT)} đ</span>
        </span>
        <span>
          Đã thu VND:{" "}
          <span className="font-semibold text-green-700">{fmtVND(totalDaThuVND)} đ</span>
          {foreignCurrencyCount > 0 && (
            <span className="text-muted-foreground text-xs ml-1">
              (+ {foreignCurrencyCount} ngoại tệ)
            </span>
          )}
        </span>
      </div>

      {/* Loading skeletons */}
      {isLoading && (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-14 rounded-lg" />
          ))}
        </div>
      )}

      {/* Empty state */}
      {!isLoading && filteredDoan.length === 0 && (
        <p className="text-sm text-muted-foreground italic text-center py-12">
          Không có đoàn nào kết thúc phù hợp với bộ lọc.
        </p>
      )}

      {/* List */}
      {!isLoading && filteredDoan.length > 0 && (
        <div className="space-y-2">
          {filteredDoan.map((doan) => (
            <InvoiceDoanCard
              key={doan.id}
              doan={doan}
              chiPhiThucTe={chiPhiMap?.get(doan.id)?.thucTe ?? 0}
              onCardClick={() => setSelectedDoan(doan)}
            />
          ))}
        </div>
      )}

      {/* Drawer */}
      <InvoiceDrawer
        doan={selectedDoan}
        open={selectedDoan !== null}
        onClose={() => setSelectedDoan(null)}
      />
    </div>
  );
}
