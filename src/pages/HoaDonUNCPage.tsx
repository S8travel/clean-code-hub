import { useState, useMemo, useRef, useEffect } from "react";
import { usePermission } from "@/hooks/use-permissions";
import { AccessDenied } from "@/components/PermissionGate";
import { format } from "date-fns";
import { useNavigate } from "react-router-dom";
import {
  RotateCcw, Upload, Eye, Trash2, FileText, FileCheck, FileX, CreditCard,
  ChevronLeft, ChevronRight, Loader2, ScanText, Share2,
} from "lucide-react";
import { ocrInvoiceAmount, isAmountMatch } from "@/lib/ocr-invoice";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { SearchableSelect } from "@/components/SearchableSelect";
import {
  useHoaDonUNCList, useHoaDonUNCSummary, useUpdateDocStatus, useUploadDNTTDoc, useDeleteDNTTDoc,
  type HoaDonUNCRow, type TrangThaiDoc,
} from "@/hooks/use-hoa-don-unc";
import UncEmailModal from "@/components/hoa-don-unc/UncEmailModal";
import { useDoanOptions, useMarkPaidWithDate } from "@/hooks/use-dntt";
import { useQuery } from "@tanstack/react-query";
import { externalSupabase } from "@/lib/supabase-external";
import { toast } from "@/hooks/use-toast";

const fmt = (n: number) => n.toLocaleString("vi-VN");

// Danh sách nguồn thanh toán (tài khoản công ty). Thêm option ở đây để xuất hiện trong dropdown.
const PAYMENT_SOURCES: string[] = [
  "MB-6612388123 (Cá nhân)",
  "TECH-1231236868 (Công ty)",
  "VTB-111600925668 (Công ty)",
  "TCB-1902 0186 4550 12 (Cá nhân)",
];

const loaiLabel: Record<string, { text: string; color: string }> = {
  khach_san: { text: "KS", color: "bg-blue-100 text-blue-700" },
  nha_hang: { text: "NH", color: "bg-orange-100 text-orange-700" },
  dich_vu: { text: "DV", color: "bg-purple-100 text-purple-700" },
  xe: { text: "Xe", color: "bg-green-100 text-green-700" },
  visa: { text: "Visa", color: "bg-indigo-100 text-indigo-700" },
  bao_hiem: { text: "BH", color: "bg-rose-100 text-rose-700" },
};

// Loại viết tắt cho nội dung thanh toán (chữ thường, copy vào UNC)
const LOAI_SHORT: Record<string, string> = {
  khach_san: "ks",
  nha_hang: "nh",
  dich_vu: "dv",
  xe: "xe",
  visa: "visa",
  bao_hiem: "bh",
  hdv: "hdv",
  dinh_ky: "dk",
};

// Bỏ dấu tiếng Việt — ngân hàng yêu cầu nội dung không dấu
function noDiacritics(s: string): string {
  return s.normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D");
}

// Bỏ prefix "{từ khoá} " ở đầu chuỗi nếu có (tránh trùng lặp khi data có sẵn keyword)
function stripPrefix(s: string, prefix: string): string {
  const trimmed = (s || "").trim();
  const p = prefix.toLowerCase();
  return trimmed.toLowerCase().startsWith(p) ? trimmed.slice(prefix.length).trim() : trimmed;
}

// Tách tên NCC nếu có dạng "{KS|NH|...} XXX - {Company}" — lấy phần Company
const NCC_PREFIX_RE = /^(ks|nh|hotel|khach\s*san|nha\s*hang|dv|dich\s*vu|xe|visa)\s/i;
function cleanNccName(raw: string | null | undefined): string {
  const s = (raw || "").trim();
  if (!s) return "";
  const parts = s.split(" - ");
  if (parts.length >= 2 && NCC_PREFIX_RE.test(parts[0].trim())) {
    return parts.slice(1).join(" - ").trim();
  }
  return s;
}

// Build "S8 tt {NCC} - {loai} {tên dịch vụ} {ngày} doan {tên đoàn}" — không dấu
function buildPaymentContent(row: HoaDonUNCRow): string {
  const ncc = cleanNccName(row.ten_nha_cung_cap);
  const loaiShort = LOAI_SHORT[row.loai] || row.loai;
  const moTa = row.mo_ta || "";

  // Tên dịch vụ: phần trước " - " hoặc " (" đầu tiên
  let tenDichVu = moTa.split(" - ")[0] || moTa;
  // Bỏ ghi chú "(trưa)/(tối)" trong tên NH nếu có
  tenDichVu = tenDichVu.replace(/\s*\([^)]*\)\s*$/, "").trim();

  // Trích ngày dd/MM hoặc dd/M từ mo_ta. Hỗ trợ "(20/05)", "(20/5)", "20/05"
  const dates: { d: number; mo: number }[] = [];
  const re = /(\d{1,2})\/(\d{1,2})(?!\d)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(moTa))) {
    const d = +m[1];
    const mo = +m[2];
    if (d >= 1 && d <= 31 && mo >= 1 && mo <= 12) dates.push({ d, mo });
  }
  dates.sort((a, b) => a.mo - b.mo || a.d - b.d);

  let dateRange = "";
  if (dates.length === 1) {
    dateRange = `${dates[0].d}/${dates[0].mo}`;
  } else if (dates.length >= 2) {
    const first = dates[0];
    const last = dates[dates.length - 1];
    if (row.loai === "khach_san") {
      // Check-out = đêm cuối + 1 (vd: ngủ 19,20,21 → check-out 22)
      const year = new Date().getFullYear();
      const co = new Date(year, last.mo - 1, last.d);
      co.setDate(co.getDate() + 1);
      dateRange = `${first.d}/${first.mo}-${co.getDate()}/${co.getMonth() + 1}`;
    } else {
      dateRange = first.d === last.d && first.mo === last.mo
        ? `${first.d}/${first.mo}`
        : `${first.d}/${first.mo}-${last.d}/${last.mo}`;
    }
  }

  // Bỏ "doan " prefix nếu ten_doan đã chứa sẵn (tránh "doan doan XXX")
  const doan = stripPrefix(row.ten_doan || "", "doan ");
  // Sentinel "code doan" / "code đoàn" → OP báo dùng tên đoàn làm code → bỏ qua insert
  const rawCode = noDiacritics((row.code_ncc || "").trim()).toLowerCase();
  const codeIsDoanSentinel = rawCode === "code doan" || rawCode === "doan";
  // Bỏ "code " prefix nếu code_ncc đã chứa sẵn (tránh "code code XXX")
  const codeNcc = codeIsDoanSentinel ? "" : stripPrefix(row.code_ncc || "", "code ");
  // Nếu code NCC trùng với tên đoàn → bỏ qua (tránh trùng lặp với "doan XXX")
  const showCode = codeNcc && codeNcc.toLowerCase() !== doan.toLowerCase();
  const parts: string[] = [`S8 tt ${ncc}`.trim()];
  const svPart = [loaiShort, tenDichVu].filter(Boolean).join(" ").trim();
  if (svPart) parts.push(`- ${svPart}`);
  if (dateRange) parts.push(dateRange);
  if (showCode) parts.push(`code ${codeNcc}`);
  if (doan) parts.push(`doan ${doan}`);

  return noDiacritics(parts.join(" "));
}

const docStatusConfig: Record<TrangThaiDoc, { text: string; icon: React.ElementType; cls: string }> = {
  chua_co: { text: "Chưa có", icon: FileX, cls: "bg-red-50 text-red-600 border border-red-200" },
  da_co: { text: "Đã có", icon: FileCheck, cls: "bg-green-50 text-green-700 border border-green-200" },
  khong_can: { text: "Không cần", icon: FileText, cls: "bg-gray-100 text-gray-500 border border-gray-200" },
};

function DocCell({
  row,
  loaiDoc,
}: {
  row: HoaDonUNCRow;
  loaiDoc: "hoa_don" | "unc";
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploadMut = useUploadDNTTDoc();
  const deleteMut = useDeleteDNTTDoc();
  const updateMut = useUpdateDocStatus();

  const status: TrangThaiDoc = loaiDoc === "hoa_don" ? row.trang_thai_hoa_don : row.trang_thai_unc;
  const url = loaiDoc === "hoa_don" ? row.hoa_don_url : row.unc_url;
  const statusField = loaiDoc === "hoa_don" ? "trang_thai_hoa_don" : "trang_thai_unc";

  const cfg = docStatusConfig[status];
  const Icon = cfg.icon;

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [emailRow, setEmailRow] = useState<HoaDonUNCRow | null>(null);
  // OCR result chỉ áp dụng cho hóa đơn — gợi ý số tiền có lệch không.
  const [ocrState, setOcrState] = useState<
    | { status: "idle" }
    | { status: "running" }
    | { status: "done"; detected: number | null; matched: boolean }
    | { status: "error" }
  >({ status: "idle" });

  const runOcr = async (file: File) => {
    if (loaiDoc !== "hoa_don") return;
    if (file.type === "application/pdf") return; // Tesseract.js không parse PDF native
    setOcrState({ status: "running" });
    try {
      const result = await ocrInvoiceAmount(file);
      // Log để debug khi OCR fail — mở DevTools (F12) → Console.
      // eslint-disable-next-line no-console
      console.log("[OCR HÓA ĐƠN #" + row.id + "]", {
        detected: result.detected,
        candidates: result.candidates,
        expected: row.so_tien,
      });
      // rawText log riêng để hiện full không bị truncate. Copy bằng:
      // (right-click block → Copy string contents)
      // eslint-disable-next-line no-console
      console.log("[OCR RAWTEXT #" + row.id + "]\n" + result.rawText);
      const matched = isAmountMatch(result.detected, row.so_tien);
      setOcrState({ status: "done", detected: result.detected, matched });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("[OCR ERROR]", err);
      setOcrState({ status: "error" });
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    uploadMut.mutate(
      { id: row.id, file, loaiDoc },
      {
        onSuccess: (publicUrl) => {
          toast({ title: `Đã tải lên ${loaiDoc === "hoa_don" ? "hóa đơn" : "UNC"}` });
          if (loaiDoc === "unc") {
            setEmailRow({ ...row, unc_url: publicUrl, trang_thai_unc: "da_co" });
          }
          // Chạy OCR sau khi upload xong (background, không block toast).
          runOcr(file);
        },
        onError: (err: any) => toast({ title: "Lỗi: " + (err?.message || "Không thể tải lên"), variant: "destructive" }),
      },
    );
    e.target.value = "";
  };

  const handleDeleteConfirm = () => {
    deleteMut.mutate(
      { id: row.id, loaiDoc },
      {
        onSuccess: () => toast({ title: "Đã xóa file" }),
        onError: (err: any) => toast({ title: "Lỗi: " + err?.message, variant: "destructive" }),
      },
    );
    setDeleteOpen(false);
  };

  const handleStatusChange = (value: TrangThaiDoc) => {
    updateMut.mutate(
      { id: row.id, field: statusField, value },
      {
        onError: (err: any) => toast({ title: "Lỗi: " + err?.message, variant: "destructive" }),
      },
    );
  };

  const isPending = uploadMut.isPending || deleteMut.isPending || updateMut.isPending;

  return (
    <div className="flex flex-col gap-1.5 min-w-[140px]">
      {/* Status badge + dropdown */}
      <div className="flex items-center gap-1">
        <Select value={status} onValueChange={handleStatusChange} disabled={isPending}>
          <SelectTrigger className={cn("h-6 text-xs px-2 py-0 w-auto gap-1 border-0 shadow-none", cfg.cls)}>
            <Icon className="h-3 w-3 shrink-0" />
            <span>{cfg.text}</span>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="chua_co">Chưa có</SelectItem>
            <SelectItem value="da_co">Đã có</SelectItem>
            <SelectItem value="khong_can">Không cần</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1">
        {url ? (
          <>
            <Button
              variant="outline"
              size="sm"
              className="h-6 px-2 text-xs"
              onClick={() => window.open(url, "_blank")}
            >
              <Eye className="h-3 w-3 mr-1" /> Xem
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 text-destructive"
              onClick={() => setDeleteOpen(true)}
              disabled={isPending}
            >
              <Trash2 className="h-3 w-3" />
            </Button>
          </>
        ) : status !== "khong_can" ? (
          <>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,.pdf"
              className="hidden"
              onChange={handleFileChange}
            />
            <Button
              variant="outline"
              size="sm"
              className="h-6 px-2 text-xs"
              onClick={() => fileInputRef.current?.click()}
              disabled={isPending}
            >
              <Upload className="h-3 w-3 mr-1" />
              {isPending ? "Đang tải..." : "Tải lên"}
            </Button>
          </>
        ) : null}
      </div>

      {/* OCR badge — chỉ cho hóa đơn, hint khớp số tiền */}
      {loaiDoc === "hoa_don" && ocrState.status !== "idle" && (
        <div className="text-[10px] leading-tight">
          {ocrState.status === "running" && (
            <span className="inline-flex items-center gap-1 text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" /> Đang quét hóa đơn...
            </span>
          )}
          {ocrState.status === "error" && (
            <span className="inline-flex items-center gap-1 text-muted-foreground" title="Tesseract lỗi — kiểm tra thủ công">
              <ScanText className="h-3 w-3" /> Không quét được
            </span>
          )}
          {ocrState.status === "done" && ocrState.detected == null && (
            <span className="inline-flex items-center gap-1 text-muted-foreground" title="OCR không nhận ra số tiền — kiểm tra thủ công">
              <ScanText className="h-3 w-3" /> Không đoán được số tiền
            </span>
          )}
          {ocrState.status === "done" && ocrState.detected != null && ocrState.matched && (
            <span className="inline-flex items-center gap-1 text-emerald-600 font-medium" title={`Đoán: ${ocrState.detected.toLocaleString("vi-VN")} ₫`}>
              ✓ Khớp số tiền
            </span>
          )}
          {ocrState.status === "done" && ocrState.detected != null && !ocrState.matched && (
            <span className="inline-flex items-center gap-1 text-amber-600 font-medium" title={`Hóa đơn: ${ocrState.detected.toLocaleString("vi-VN")} ₫ vs ĐNTT: ${row.so_tien.toLocaleString("vi-VN")} ₫`}>
              ⚠ Lệch {Math.abs(ocrState.detected - row.so_tien).toLocaleString("vi-VN")} ₫
            </span>
          )}
        </div>
      )}

      {/* Delete confirm */}
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Xóa file?</AlertDialogTitle>
            <AlertDialogDescription>
              File sẽ bị xóa và trạng thái sẽ trở về "Chưa có".
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Hủy</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteConfirm}>Xóa</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* UNC email modal — chỉ mở sau khi upload UNC thành công */}
      {emailRow && (
        <UncEmailModal
          row={emailRow}
          open={!!emailRow}
          onClose={() => setEmailRow(null)}
        />
      )}
    </div>
  );
}

function HoaDonUNCPageContent() {
  const navigate = useNavigate();

  const [doanId, setDoanId] = useState<string>("");
  const [loai, setLoai] = useState<string>("");
  const [trangThaiTT, setTrangThaiTT] = useState<string>("");
  const [trangThaiHD, setTrangThaiHD] = useState<string>("");
  const [trangThaiUNC, setTrangThaiUNC] = useState<string>("");
  const [nguonMap, setNguonMap] = useState<Record<number, string>>({});

  const markPaidMut = useMarkPaidWithDate();

  const filters = useMemo(() => ({
    doanId: doanId ? Number(doanId) : null,
    loai: loai || null,
    trangThaiTT: (trangThaiTT || "all") as "chua_tt" | "da_tt" | "all",
    trangThaiHoaDon: (trangThaiHD || "all") as TrangThaiDoc | "all",
    trangThaiUNC: (trangThaiUNC || "all") as TrangThaiDoc | "all",
  }), [doanId, loai, trangThaiTT, trangThaiHD, trangThaiUNC]);

  const { data: rows = [], isLoading } = useHoaDonUNCList(filters);
  const { data: summary } = useHoaDonUNCSummary();
  const { data: doanOpts = [] } = useDoanOptions();

  const mainRows = rows;
  const canTruMap: Record<number, HoaDonUNCRow> = {};

  // Pagination — 20 row/trang, reset về 1 khi filter đổi
  const PAGE_SIZE = 20;
  const [page, setPage] = useState(1);
  useEffect(() => { setPage(1); }, [doanId, loai, trangThaiTT, trangThaiHD, trangThaiUNC]);
  const totalPages = Math.max(1, Math.ceil(mainRows.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageRows = mainRows.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  // Load can_tru payments per visible DNTT
  const visibleDnttIds = useMemo(() => mainRows.map((r) => r.id), [mainRows]);
  const { data: canTruByDntt = {} as Record<number, number> } = useQuery({
    queryKey: ["hoadon-unc-can-tru", visibleDnttIds.join(",")],
    enabled: visibleDnttIds.length > 0,
    queryFn: async () => {
      const { data } = await externalSupabase
        .from("payments")
        .select("dntt_id, so_tien")
        .eq("method", "can_tru")
        .in("dntt_id", visibleDnttIds);
      const m: Record<number, number> = {};
      (data || []).forEach((p: any) => {
        m[p.dntt_id] = (m[p.dntt_id] || 0) + Number(p.so_tien);
      });
      return m;
    },
  });

  // Load nguồn TT (cash payment có nguon != null) per visible DNTT.
  // Key share prefix với "hoa-don-unc" để tự refetch khi mutation invalidate.
  const { data: nguonByDntt = {} as Record<number, string> } = useQuery({
    queryKey: ["hoa-don-unc", "nguon", visibleDnttIds.join(",")],
    enabled: visibleDnttIds.length > 0,
    queryFn: async () => {
      const { data } = await externalSupabase
        .from("payments")
        .select("dntt_id, nguon, ngay_thanh_toan")
        .eq("method", "cash")
        .in("dntt_id", visibleDnttIds)
        .not("nguon", "is", null)
        .order("ngay_thanh_toan", { ascending: false });
      const m: Record<number, string> = {};
      // Lấy nguồn của payment mới nhất per dntt_id
      (data || []).forEach((p: any) => { if (!m[p.dntt_id] && p.nguon) m[p.dntt_id] = p.nguon; });
      return m;
    },
  });

  // Load các ĐNTT cọc cùng ref (để hiển thị "Đã cọc: X")
  const refPairs = useMemo(() => {
    const set = new Set<string>();
    mainRows.forEach((r) => {
      if (r.ref_loai && r.ref_id != null) set.add(`${r.ref_loai}|${r.ref_id}`);
    });
    return [...set];
  }, [mainRows]);

  const { data: cocDntts = [] as any[] } = useQuery({
    queryKey: ["hoadon-unc-coc-siblings", refPairs.join(",")],
    enabled: refPairs.length > 0,
    queryFn: async () => {
      const refLoais = [...new Set(refPairs.map((p) => p.split("|")[0]))];
      const refIds = [...new Set(refPairs.map((p) => Number(p.split("|")[1])).filter(Number.isFinite))];
      if (refLoais.length === 0 || refIds.length === 0) return [];
      const { data } = await externalSupabase
        .from("dntt_with_payment_status")
        .select("id, ref_loai, ref_id, paid_amount")
        .eq("la_coc", true)
        .in("ref_loai", refLoais)
        .in("ref_id", refIds)
        .not("trang_thai_duyet", "eq", "da_huy")
        .not("trang_thai_duyet", "eq", "tu_choi");
      const validKeys = new Set(refPairs);
      return (data || []).filter((d: any) => validKeys.has(`${d.ref_loai}|${d.ref_id}`));
    },
  });
  const cocByRef = useMemo(() => {
    const m: Record<string, number> = {};
    cocDntts.forEach((d: any) => {
      const k = `${d.ref_loai}|${d.ref_id}`;
      m[k] = (m[k] || 0) + (d.paid_amount || 0);
    });
    return m;
  }, [cocDntts]);

  // Metric cards luôn hiển thị tổng toàn DB, không phụ thuộc filter của list bên dưới.
  const metrics = {
    chuaTT: summary?.chuaTT ?? 0,
    daTT: summary?.daTT ?? 0,
    thieu_hd: summary?.thieu_hd ?? 0,
    thieu_unc: summary?.thieu_unc ?? 0,
  };

  const handleMarkPaid = (id: number, nguon?: string) => {
    markPaidMut.mutate(
      { id, ngayThanhToan: format(new Date(), "yyyy-MM-dd"), nguon: nguon ?? null },
      {
        onSuccess: () => toast({ title: nguon ? `Đã xác nhận TT — ${nguon}` : "Đã xác nhận thanh toán" }),
        onError: (err: any) => toast({ title: "Lỗi: " + (err?.message || "Không thể xác nhận"), variant: "destructive" }),
      },
    );
  };

  const resetFilters = () => {
    setDoanId("");
    setLoai("");
    setTrangThaiTT("");
    setTrangThaiHD("");
    setTrangThaiUNC("");
  };

  // Sync sang Google Sheet — gọi edge function sync-dntt-to-sheet
  const [syncing, setSyncing] = useState(false);
  const handleSyncSheet = async () => {
    setSyncing(true);
    try {
      const { data, error } = await externalSupabase.functions.invoke("sync-dntt-to-sheet");
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      const n = data?.synced ?? 0;
      toast({
        title: n > 0 ? `Đã đồng bộ ${n} DNTT sang Sheet` : "Không có DNTT mới cần sync",
      });
    } catch (err: any) {
      toast({
        title: "Lỗi đồng bộ Sheet: " + (err?.message || "Vui lòng thử lại"),
        variant: "destructive",
      });
    } finally {
      setSyncing(false);
    }
  };

  const doanSelectOpts = (doanOpts as any[]).map((d: any) => ({
    value: String(d.id),
    label: d.ten_doan,
  }));

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h1 className="text-2xl font-bold">Thanh Toán, Hóa Đơn & UNC</h1>
        <Button
          variant="outline"
          size="sm"
          onClick={handleSyncSheet}
          disabled={syncing}
          className="gap-1.5"
          title="Đồng bộ các DNTT đã thanh toán nhưng chưa export sang Google Sheet"
        >
          {syncing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Share2 className="h-3.5 w-3.5" />}
          {syncing ? "Đang đồng bộ..." : "Đồng bộ Sheet"}
        </Button>
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: "Chờ thanh toán", value: metrics.chuaTT, cls: "text-amber-600" },
          { label: "Đã thanh toán", value: metrics.daTT, cls: "text-emerald-600" },
          { label: "Thiếu hóa đơn", value: metrics.thieu_hd, cls: "text-red-600" },
          { label: "Thiếu UNC", value: metrics.thieu_unc, cls: "text-orange-600" },
        ].map(m => (
          <Card key={m.label}>
            <CardContent className="p-4">
              <p className="text-sm text-muted-foreground">{m.label}</p>
              <p className={cn("text-2xl font-bold", m.cls)}>{m.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-end gap-3">
        <div className="w-[200px]">
          <label className="text-xs text-muted-foreground mb-1 block">Đoàn</label>
          <SearchableSelect
            options={doanSelectOpts}
            value={doanId}
            onChange={setDoanId}
            placeholder="Tất cả đoàn"
            searchPlaceholder="Tìm đoàn..."
          />
        </div>

        <div>
          <label className="text-xs text-muted-foreground mb-1 block">Loại</label>
          <Select value={loai} onValueChange={v => setLoai(v === "all" ? "" : v)}>
            <SelectTrigger className="w-[130px]">
              <span>{!loai ? "Tất cả" : loai === "khach_san" ? "Khách sạn" : loai === "nha_hang" ? "Nhà hàng" : loai === "dich_vu" ? "Dịch vụ" : loai === "xe" ? "Xe" : loai === "visa" ? "Visa" : "Bảo hiểm"}</span>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tất cả</SelectItem>
              <SelectItem value="khach_san">Khách sạn</SelectItem>
              <SelectItem value="nha_hang">Nhà hàng</SelectItem>
              <SelectItem value="dich_vu">Dịch vụ</SelectItem>
              <SelectItem value="xe">Xe</SelectItem>
              <SelectItem value="visa">Visa</SelectItem>
              <SelectItem value="bao_hiem">Bảo hiểm</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div>
          <label className="text-xs text-muted-foreground mb-1 block">Trạng thái hóa đơn</label>
          <Select value={trangThaiHD} onValueChange={v => setTrangThaiHD(v === "all" ? "" : v)}>
            <SelectTrigger className="w-[150px]">
              <span>{!trangThaiHD ? "Tất cả" : trangThaiHD === "chua_co" ? "Chưa có" : trangThaiHD === "da_co" ? "Đã có" : "Không cần"}</span>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tất cả</SelectItem>
              <SelectItem value="chua_co">Chưa có</SelectItem>
              <SelectItem value="da_co">Đã có</SelectItem>
              <SelectItem value="khong_can">Không cần</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div>
          <label className="text-xs text-muted-foreground mb-1 block">Trạng thái UNC</label>
          <Select value={trangThaiUNC} onValueChange={v => setTrangThaiUNC(v === "all" ? "" : v)}>
            <SelectTrigger className="w-[150px]">
              <span>{!trangThaiUNC ? "Tất cả" : trangThaiUNC === "chua_co" ? "Chưa có" : trangThaiUNC === "da_co" ? "Đã có" : "Không cần"}</span>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tất cả</SelectItem>
              <SelectItem value="chua_co">Chưa có</SelectItem>
              <SelectItem value="da_co">Đã có</SelectItem>
              <SelectItem value="khong_can">Không cần</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div>
          <label className="text-xs text-muted-foreground mb-1 block">Trạng thái TT</label>
          <Select value={trangThaiTT} onValueChange={v => setTrangThaiTT(v === "all" ? "" : v)}>
            <SelectTrigger className="w-[150px]">
              <span>{!trangThaiTT ? "Tất cả" : trangThaiTT === "chua_tt" ? "Chờ thanh toán" : "Đã thanh toán"}</span>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tất cả</SelectItem>
              <SelectItem value="chua_tt">Chờ thanh toán</SelectItem>
              <SelectItem value="da_tt">Đã thanh toán</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <Button variant="ghost" size="sm" onClick={resetFilters}>
          <RotateCcw className="h-4 w-4 mr-1" /> Reset
        </Button>
      </div>

      {/* Table */}
      <div className="border rounded-lg overflow-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[50px]">STT</TableHead>
              <TableHead className="min-w-[130px]">Đoàn</TableHead>
              <TableHead className="w-[60px]">Loại</TableHead>
              <TableHead className="min-w-[180px]">Mô tả</TableHead>
              <TableHead className="min-w-[280px]">Nội dung thanh toán</TableHead>
              <TableHead className="min-w-[110px] text-right">Số tiền</TableHead>
              <TableHead className="w-[100px]">Ngày cần TT</TableHead>
              <TableHead className="min-w-[180px]">Thanh toán</TableHead>
              <TableHead className="min-w-[160px]">Hóa đơn</TableHead>
              <TableHead className="min-w-[160px]">UNC</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={10} className="text-center py-8 text-muted-foreground">
                  Đang tải...
                </TableCell>
              </TableRow>
            ) : rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={10} className="text-center py-8 text-muted-foreground">
                  Không có dữ liệu
                </TableCell>
              </TableRow>
            ) : pageRows.map((row, idx) => {
              const lt = loaiLabel[row.loai] || { text: row.loai, color: "bg-muted text-muted-foreground" };
              const canTruRow = canTruMap[row.id];
              return (
                <TableRow key={row.id}>
                  <TableCell className="text-center text-sm">{(currentPage - 1) * PAGE_SIZE + idx + 1}</TableCell>
                  <TableCell>
                    <button
                      className="text-primary hover:underline text-left text-sm font-medium"
                      onClick={() => navigate(`/doan/${row.doan_id}`)}
                    >
                      {row.ten_doan ?? "—"}
                    </button>
                  </TableCell>
                  <TableCell>
                    <span className={cn("px-2 py-0.5 rounded text-xs font-medium", lt.color)}>
                      {lt.text}
                    </span>
                  </TableCell>
                  <TableCell className="text-sm">{row.mo_ta ?? "—"}</TableCell>
                  <TableCell className="text-xs font-mono">
                    <button
                      type="button"
                      className="text-left hover:bg-muted/50 px-1 -mx-1 rounded transition"
                      onClick={() => {
                        const content = buildPaymentContent(row);
                        navigator.clipboard.writeText(content);
                        toast({ title: "Đã sao chép nội dung TT" });
                      }}
                      title="Click để sao chép"
                    >
                      {buildPaymentContent(row)}
                    </button>
                  </TableCell>
                  <TableCell className="text-right text-sm font-medium">
                    {(() => {
                      const ct = canTruByDntt[row.id] || 0;
                      const thucTT = Math.max(0, row.so_tien - ct);
                      const refKey = row.ref_loai && row.ref_id != null ? `${row.ref_loai}|${row.ref_id}` : null;
                      const cocSibling = refKey
                        ? Math.max(0, (cocByRef[refKey] || 0) - (row.la_coc ? (row.paid_amount || 0) : 0))
                        : 0;
                      const isThuHoi = (row.ghi_chu || "").includes("[Thu hồi]");
                      const sign = isThuHoi ? "-" : "";
                      const amountCls = isThuHoi ? "text-blue-600" : "";
                      return (
                        <div className="space-y-0.5">
                          {ct > 0 ? (
                            <div className="text-xs space-y-0.5">
                              <div className="text-muted-foreground">Tổng: <span className={amountCls}>{sign}{fmt(row.so_tien)}</span></div>
                              <div className="text-amber-600">Cấn trừ: −{fmt(ct)}</div>
                              <div className={cn("text-sm font-semibold", amountCls)}>Thực TT: {sign}{fmt(thucTT)}</div>
                            </div>
                          ) : (
                            <div className={amountCls}>{sign}{fmt(row.so_tien)}</div>
                          )}
                          {isThuHoi && (
                            <span className="inline-block text-[10px] bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded font-medium">
                              Thu hồi
                            </span>
                          )}
                          {row.la_coc && (
                            <span className="inline-block text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded font-medium">
                              Cọc
                            </span>
                          )}
                          {!row.la_coc && cocSibling > 0 && (
                            <div className="text-[11px] text-muted-foreground font-normal">
                              Đã cọc: <span className="text-amber-600 font-medium">{fmt(cocSibling)}</span>
                            </div>
                          )}
                        </div>
                      );
                    })()}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {row.ngay_can_thanh_toan
                      ? format(new Date(row.ngay_can_thanh_toan), "dd/MM/yyyy")
                      : "—"}
                  </TableCell>
                  <TableCell>
                    {row.payment_status === "paid" ? (
                      <div className="flex flex-col gap-0.5">
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded px-2 py-0.5 w-fit">
                          <CreditCard className="h-3 w-3" /> Đã TT
                        </span>
                        {row.thanh_toan_luc && (
                          <span className="text-xs text-muted-foreground">
                            {format(new Date(row.thanh_toan_luc), "dd/MM/yyyy")}
                          </span>
                        )}
                        {nguonByDntt[row.id] && (
                          <span className="text-xs font-medium text-blue-700">
                            {nguonByDntt[row.id]}
                          </span>
                        )}
                      </div>
                    ) : (
                      <div className="flex flex-col gap-1">
                        <Select
                          value={nguonMap[row.id] ?? ""}
                          onValueChange={(v) => setNguonMap(prev => ({ ...prev, [row.id]: v }))}
                        >
                          <SelectTrigger className="h-7 px-2 text-xs w-[160px]">
                            <span>{nguonMap[row.id] || "Chọn nguồn"}</span>
                          </SelectTrigger>
                          <SelectContent>
                            {PAYMENT_SOURCES.map((src) => (
                              <SelectItem key={src} value={src}>{src}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Button
                          size="sm"
                          className="h-7 px-2 text-xs"
                          disabled={markPaidMut.isPending || !nguonMap[row.id]}
                          onClick={() => handleMarkPaid(row.id, nguonMap[row.id])}
                        >
                          Xác nhận TT
                        </Button>
                      </div>
                    )}
                  </TableCell>
                  <TableCell>
                    <DocCell row={row} loaiDoc="hoa_don" />
                  </TableCell>
                  <TableCell>
                    <DocCell row={row} loaiDoc="unc" />
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {!isLoading && mainRows.length > 0 && (
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">
            Hiển thị {(currentPage - 1) * PAGE_SIZE + 1}–{Math.min(currentPage * PAGE_SIZE, mainRows.length)} / {mainRows.length}
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={currentPage <= 1}
              className="h-7 px-2 inline-flex items-center gap-1 border rounded text-xs disabled:opacity-40 disabled:cursor-not-allowed hover:bg-muted"
            >
              <ChevronLeft className="h-3 w-3" />
              Trước
            </button>
            <span className="px-2 text-muted-foreground">Trang {currentPage} / {totalPages}</span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage >= totalPages}
              className="h-7 px-2 inline-flex items-center gap-1 border rounded text-xs disabled:opacity-40 disabled:cursor-not-allowed hover:bg-muted"
            >
              Sau
              <ChevronRight className="h-3 w-3" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function HoaDonUNCPage() {
  const canView = usePermission("hoa_don_unc", "view");
  if (!canView) return <AccessDenied />;
  return <HoaDonUNCPageContent />;
}
