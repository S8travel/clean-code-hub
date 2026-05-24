import { useState, useMemo, useEffect } from "react";
import { format, startOfMonth, endOfMonth } from "date-fns";
import { useBoPhan, useRoleAtLeast } from "@/hooks/use-permissions";
import { AccessDenied, PermissionGate } from "@/components/PermissionGate";
import { useNavigate } from "react-router-dom";
import { RotateCcw, Check, X, Trash2, Ban, ChevronLeft, ChevronRight, Loader2, Share2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { SearchableSelect } from "@/components/SearchableSelect";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { CalendarIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  useDNTTList, useDNTTSummary, useDoanOptions, useApproveDNTT,
  useRejectDNTT, useDeleteDNTT, useCancelDNTT,
  useCreateAdjustment,
  canApproveLevel,
  type DNTTRow, type ApprovalLevel,
} from "@/hooks/use-dntt";
import { useAuth } from "@/hooks/use-auth";
import { useUserRoles } from "@/hooks/use-doan";
import { useQuery } from "@tanstack/react-query";
import { externalSupabase } from "@/lib/supabase-external";
import { Textarea } from "@/components/ui/textarea";
import { SlidersHorizontal } from "lucide-react";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";
import { useLogActivity } from "@/hooks/use-activity-log";
import { errMsg } from "@/lib/error";
import { t, useTranslate } from "@/lib/i18n";

const fmt = (n: number) => n.toLocaleString("vi-VN");

const loaiLabel: Record<string, { text: string; color: string }> = {
  khach_san: { text: "KS", color: "bg-blue-100 text-blue-700" },
  nha_hang: { text: "NH", color: "bg-orange-100 text-orange-700" },
  dich_vu: { text: "DV", color: "bg-purple-100 text-purple-700" },
  tra_truoc: { text: "Trả trước", color: "bg-amber-100 text-amber-700" },
};

// Shape của ĐNTT cọc sibling đọc từ dntt_with_payment_status (subset cột).
interface CocSiblingRow {
  doan_id: number | null;
  ref_loai: string | null;
  ref_id: number | null;
  paid_amount: number | null;
}



// Cell duyệt 1 cấp — sequential gate ở UI: cấp X chỉ enable khi cấp X-1 đã duyệt.
// Hiển thị tên người duyệt + thời gian khi đã duyệt; nút Duyệt/Từ chối khi đang chờ.
function ApprovalCell({
  row, level, user, userMap, onApprove, onReject,
}: {
  row: DNTTRow;
  level: ApprovalLevel;
  user: { user_id?: string; role?: string | null; bo_phan?: string | null } | null | undefined;
  userMap: Map<string, string>;
  onApprove: (id: number, level: ApprovalLevel) => void;
  onReject: (id: number, level: ApprovalLevel) => void;
}) {
  const fields = level === 1
    ? { boi: row.tp_dh_duyet_boi, luc: row.tp_dh_duyet_luc, prevLuc: null as string | null }
    : level === 2
    ? { boi: row.kttt_duyet_boi, luc: row.kttt_duyet_luc, prevLuc: row.tp_dh_duyet_luc }
    : { boi: row.ktt_duyet_boi,  luc: row.ktt_duyet_luc,  prevLuc: row.kttt_duyet_luc };

  // Hủy ƯU TIÊN trước check "đã duyệt" — vì ĐNTT da_huy có thể đã duyệt full
  // trước đó (ktt_duyet_luc != null) nhưng giờ đã bị hủy → cần show "Đã hủy".
  if (row.trang_thai_duyet === "da_huy") {
    const ten = row.huy_boi ? (userMap.get(row.huy_boi) ?? "—") : null;
    return (
      <TableCell className="text-xs">
        <div className="text-gray-600 font-medium leading-tight">{t("✗ Đã hủy")}{ten ? ` · ${ten}` : ""}</div>
        {row.huy_luc && (
          <div className="text-muted-foreground">{format(new Date(row.huy_luc), "dd/MM HH:mm")}</div>
        )}
      </TableCell>
    );
  }

  // Đã duyệt → hiện tên + thời gian (giữ nguyên kể cả khi sau đó bị reject ở cấp khác)
  if (fields.luc) {
    const ten = fields.boi ? (userMap.get(fields.boi) ?? "—") : "—";
    return (
      <TableCell className="text-xs">
        <div className="text-emerald-700 font-medium leading-tight">✓ {ten}</div>
        <div className="text-muted-foreground">{format(new Date(fields.luc), "dd/MM HH:mm")}</div>
      </TableCell>
    );
  }

  // ĐNTT bị từ chối — chỉ ô của cấp đã reject mới hiện info, các cấp khác hiện "—"
  if (row.trang_thai_duyet === "tu_choi") {
    if (row.tu_choi_cap === level) {
      const ten = row.tu_choi_boi ? (userMap.get(row.tu_choi_boi) ?? "—") : "—";
      return (
        <TableCell className="text-xs">
          <div className="text-red-600 font-medium leading-tight">{t("✗ Từ chối")} · {ten}</div>
          {row.tu_choi_luc && (
            <div className="text-muted-foreground">{format(new Date(row.tu_choi_luc), "dd/MM HH:mm")}</div>
          )}
        </TableCell>
      );
    }
    // Legacy: ĐNTT cũ tu_choi không có tu_choi_cap → hiện ở cấp đầu chưa duyệt
    if (row.tu_choi_cap == null && level === 1) {
      return <TableCell className="text-xs text-red-600 italic">{t("Từ chối")}</TableCell>;
    }
    return <TableCell className="text-xs text-muted-foreground">—</TableCell>;
  }

  // Bị chặn vì cấp trước chưa duyệt
  const blocked = level > 1 && !fields.prevLuc;
  if (blocked) {
    return <TableCell className="text-xs text-muted-foreground italic">{t("Chờ cấp trước")}</TableCell>;
  }

  // Cấp đang chờ — kiểm tra quyền
  const canApprove = canApproveLevel(user, level);
  if (!canApprove) {
    return <TableCell className="text-xs text-muted-foreground">{t("Chờ duyệt")}</TableCell>;
  }

  return (
    <TableCell>
      <div className="flex flex-col gap-1">
        <Button
          size="sm" variant="outline"
          className="h-6 px-2 text-xs text-green-600"
          onClick={() => onApprove(row.id, level)}
        >
          <Check className="h-3 w-3 mr-1" /> {t("Duyệt")}
        </Button>
        <Button
          size="sm" variant="outline"
          className="h-6 px-2 text-xs text-red-600"
          onClick={() => onReject(row.id, level)}
        >
          <X className="h-3 w-3 mr-1" /> {t("Từ chối")}
        </Button>
      </div>
    </TableCell>
  );
}

function DNTTPageContent() {
  useTranslate();
  const navigate = useNavigate();
  const now = new Date();
  const [doanId, setDoanId] = useState<string>("");
  const [fromDate, setFromDate] = useState<Date | undefined>(startOfMonth(now));
  const [toDate, setToDate] = useState<Date | undefined>(endOfMonth(now));
  const [trangThaiDuyet, setTrangThaiDuyet] = useState("cho_duyet");
  const [loai, setLoai] = useState("");

  const filters = useMemo(() => ({
    doanId: doanId ? Number(doanId) : null,
    fromDate: fromDate ? format(fromDate, "yyyy-MM-dd") : null,
    toDate: toDate ? format(toDate, "yyyy-MM-dd") : null,
    trangThaiDuyet: trangThaiDuyet || null,
    trangThaiTT: null,
    loai: loai || null,
  }), [doanId, fromDate, toDate, trangThaiDuyet, loai]);

  const { data: rows = [], isLoading } = useDNTTList(filters);
  const { data: summary } = useDNTTSummary();
  const { data: doanOpts = [] } = useDoanOptions();
  const { user } = useAuth();
  const { data: userRoles = [] } = useUserRoles();
  const userMap = useMemo(
    () => new Map(userRoles.map((u) => [u.user_id, u.ho_ten ?? ""])),
    [userRoles],
  );
  const approveMut = useApproveDNTT();
  const rejectMut = useRejectDNTT();
  const deleteMut = useDeleteDNTT();
  const cancelMut = useCancelDNTT();

  const adjustMut = useCreateAdjustment();
  const logActivity = useLogActivity();

  const [rejectId, setRejectId] = useState<number | null>(null);
  const [rejectLevel, setRejectLevel] = useState<ApprovalLevel | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [cancelTarget, setCancelTarget] = useState<{ id: number; isPaid: boolean; moTa: string } | null>(null);
  const [cancelMode, setCancelMode] = useState<"cong_no" | "hoan_tien">("hoan_tien");
  const [adjustTarget, setAdjustTarget] = useState<DNTTRow | null>(null);
  const [adjustAmount, setAdjustAmount] = useState("");
  const [adjustReason, setAdjustReason] = useState("");

  // Trong model mới: can_tru là payment record, không còn là DNTT row
  const mainRows = rows;

  // Pagination — 20 row/trang, reset về 1 khi filter đổi
  const PAGE_SIZE = 20;
  const [page, setPage] = useState(1);
  useEffect(() => { setPage(1); }, [doanId, fromDate, toDate, trangThaiDuyet, loai]);
  const totalPages = Math.max(1, Math.ceil(mainRows.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageRows = mainRows.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const canTruMap: Record<number, DNTTRow> = {};

  // Load các ĐNTT cọc cùng (doan_id, ref) — để hiển thị "Đã cọc: X" trên dòng còn lại.
  // Phải filter cả doan_id: 1 KS có thể được nhiều đoàn cọc → không cross-đoàn.
  const refTriples = useMemo(() => {
    const set = new Set<string>();
    rows.forEach((r) => {
      if (r.doan_id != null && r.ref_loai && r.ref_id != null) {
        set.add(`${r.doan_id}|${r.ref_loai}|${r.ref_id}`);
      }
    });
    return [...set];
  }, [rows]);

  const { data: cocDntts = [] } = useQuery({
    queryKey: ["dntt-coc-siblings", refTriples.join(",")],
    enabled: refTriples.length > 0,
    queryFn: async () => {
      const doanIds = [...new Set(refTriples.map((p) => Number(p.split("|")[0])).filter(Number.isFinite))];
      const refLoais = [...new Set(refTriples.map((p) => p.split("|")[1]))];
      const refIds = [...new Set(refTriples.map((p) => Number(p.split("|")[2])).filter(Number.isFinite))];
      if (doanIds.length === 0 || refLoais.length === 0 || refIds.length === 0) return [];
      const { data } = await externalSupabase
        .from("dntt_with_payment_status")
        .select("id, doan_id, ref_loai, ref_id, so_tien, paid_amount, la_coc, payment_status, trang_thai_duyet")
        .eq("la_coc", true)
        .in("doan_id", doanIds)
        .in("ref_loai", refLoais)
        .in("ref_id", refIds)
        .not("trang_thai_duyet", "eq", "da_huy")
        .not("trang_thai_duyet", "eq", "tu_choi");
      // Lọc đúng cặp (doan_id, ref_loai, ref_id) — tránh cross-product
      const validKeys = new Set(refTriples);
      return ((data || []) as CocSiblingRow[]).filter(
        (d) => validKeys.has(`${d.doan_id}|${d.ref_loai}|${d.ref_id}`),
      );
    },
  });

  // Map (doan_id|ref) → tổng cọc đã thanh toán (paid_amount của cọc DNTTs)
  const cocByRef = useMemo(() => {
    const m: Record<string, number> = {};
    cocDntts.forEach((d) => {
      const k = `${d.doan_id}|${d.ref_loai}|${d.ref_id}`;
      m[k] = (m[k] || 0) + (d.paid_amount || 0);
    });
    return m;
  }, [cocDntts]);

  // Load can_tru payments của các DNTT visible — để hiển thị "Cấn trừ" / "Thực TT"
  const visibleDnttIds = useMemo(() => rows.map((r) => r.id), [rows]);
  const { data: canTruByDntt = {} as Record<number, number> } = useQuery({
    queryKey: ["dntt-can-tru-payments", visibleDnttIds.join(",")],
    enabled: visibleDnttIds.length > 0,
    queryFn: async () => {
      const { data } = await externalSupabase
        .from("payments")
        .select("dntt_id, so_tien")
        .eq("method", "can_tru")
        .in("dntt_id", visibleDnttIds);
      const m: Record<number, number> = {};
      (data || []).forEach((p) => {
        m[p.dntt_id] = (m[p.dntt_id] || 0) + Number(p.so_tien);
      });
      return m;
    },
  });

  // Metric cards luôn hiển thị tổng toàn DB, không phụ thuộc filter của list bên dưới.
  const metrics = {
    total: summary?.total ?? 0,
    choDuyet: summary?.choDuyet ?? 0,
    daDuyet: summary?.daDuyet ?? 0,
    tongTien: summary?.tongTien ?? 0,
    choDuyet7dTien: summary?.choDuyet7dTien ?? 0,
    daDuyet7dTien: summary?.daDuyet7dTien ?? 0,
  };

  const resetFilters = () => {
    setDoanId("");
    setFromDate(startOfMonth(now));
    setToDate(endOfMonth(now));
    setTrangThaiDuyet("");
    setLoai("");
  };

  const handleApprove = (id: number, level: ApprovalLevel) => {
    if (!user?.user_id) {
      toast({ title: t("Chưa đăng nhập"), variant: "destructive" });
      return;
    }
    approveMut.mutate({ id, level, userId: user.user_id }, {
      onSuccess: () => {
        toast({ title: level === 3 ? t("Đã duyệt cuối — ĐNTT chuyển sang đã duyệt") : `${t("Đã duyệt cấp")} ${level}` });
        logActivity.mutate({ action: "duyet", table_name: "de_nghi_thanh_toan", record_id: id, mo_ta: `Duyệt cấp ${level} ĐNTT #${id}` });
      },
      onError: (e: unknown) => toast({ title: errMsg(e) || t("Lỗi duyệt"), variant: "destructive" }),
    });
  };

  const handleRejectSubmit = () => {
    if (!rejectId || !rejectLevel) return;
    if (!user?.user_id) {
      toast({ title: t("Chưa đăng nhập"), variant: "destructive" });
      return;
    }
    rejectMut.mutate({ id: rejectId, ghiChu: rejectReason, level: rejectLevel, userId: user.user_id }, {
      onSuccess: () => {
        toast({ title: t("Đã từ chối ĐNTT") });
        logActivity.mutate({ action: "tu_choi", table_name: "de_nghi_thanh_toan", record_id: rejectId, mo_ta: `Từ chối cấp ${rejectLevel} ĐNTT #${rejectId}` });
        setRejectId(null);
        setRejectLevel(null);
        setRejectReason("");
      },
    });
  };

  const handleCancelSubmit = () => {
    if (!cancelTarget) return;
    cancelMut.mutate(
      { id: cancelTarget.id, mode: cancelTarget.isPaid ? cancelMode : undefined, userId: user?.user_id ?? null },
      {
        onSuccess: () => {
          toast({ title: cancelTarget.isPaid ? t("Đã hủy khoản thanh toán") : t("Đã hủy đề nghị") });
          setCancelTarget(null);
        },
        onError: (err: unknown) => toast({ title: t("Lỗi") + ": " + (errMsg(err) || t("Không thể hủy")), variant: "destructive" }),
      },
    );
  };

  const handleAdjustOpen = (row: DNTTRow) => {
    setAdjustTarget(row);
    setAdjustAmount(String(row.so_tien));
    setAdjustReason("");
  };

  const handleAdjustSubmit = () => {
    if (!adjustTarget) return;
    const soTienThucTe = parseInt(adjustAmount.replace(/\D/g, ""), 10);
    if (isNaN(soTienThucTe) || soTienThucTe < 0) return;
    if (soTienThucTe === adjustTarget.so_tien) {
      toast({ title: t("Số tiền không thay đổi") });
      return;
    }
    adjustMut.mutate(
      { dnttGoc: adjustTarget, soTienThucTe, lyDo: adjustReason || "Điều chỉnh số lượng" },
      {
        onSuccess: (result) => {
          if (!result) return;
          const delta = result.delta;
          if (delta > 0) {
            toast({ title: `${t("Đã tạo ĐNTT bổ sung")} ${fmt(delta)} VND — ${t("chờ duyệt")}` });
          } else {
            toast({ title: `${t("Đã ghi công nợ")} ${fmt(Math.abs(delta))} VND — ${t("xem tại trang Công nợ")}` });
          }
          setAdjustTarget(null);
        },
        onError: (err: unknown) => toast({ title: t("Lỗi") + ": " + (errMsg(err) || t("Không thể điều chỉnh")), variant: "destructive" }),
      },
    );
  };

  const handleDeleteConfirm = () => {
    if (!deleteId) return;
    deleteMut.mutate(deleteId, {
      onSuccess: () => {
        toast({ title: t("Đã xóa ĐNTT") });
        setDeleteId(null);
      },
    });
  };

  const doanSelectOpts = doanOpts.map((d) => ({
    value: String(d.id),
    label: d.ten_doan ?? "",
  }));

  // Sync sang Google Sheet (tab "Du chi") — theo filter hiện tại
  const [syncing, setSyncing] = useState(false);
  const handleSyncSheet = async () => {
    setSyncing(true);
    try {
      const { data, error } = await externalSupabase.functions.invoke(
        "sync-dntt-du-chi-to-sheet",
        { body: filters },
      );
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      const total = data?.total ?? 0;
      const inserted = data?.inserted ?? 0;
      const updated = data?.updated ?? 0;
      toast({
        title: total > 0
          ? `${t("Đã đồng bộ")} ${total} ${t("ĐNTT sang Sheet")} (${inserted} ${t("mới")}, ${updated} ${t("cập nhật")})`
          : t("Không có ĐNTT nào trong bộ lọc hiện tại"),
      });
    } catch (err: unknown) {
      toast({
        title: t("Lỗi đồng bộ Sheet") + ": " + (errMsg(err) || t("Vui lòng thử lại")),
        variant: "destructive",
      });
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h1 className="text-2xl font-bold">{t("Đề nghị thanh toán")}</h1>
        <Button
          variant="outline"
          size="sm"
          onClick={handleSyncSheet}
          disabled={syncing}
          className="gap-1.5"
          title={t("Đồng bộ các ĐNTT theo bộ lọc hiện tại sang Google Sheet — tab Du chi")}
        >
          {syncing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Share2 className="h-3.5 w-3.5" />}
          {syncing ? t("Đang đồng bộ...") : t("Đồng bộ Sheet")}
        </Button>
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: "Tổng ĐNTT", value: metrics.total, cls: "text-foreground",
            sub: `${fmt(metrics.tongTien)} ${t("đ")}` },
          { label: "Chờ duyệt", value: metrics.choDuyet, cls: "text-yellow-600",
            sub: `${t("7 ngày tới")}: ${fmt(metrics.choDuyet7dTien)} ${t("đ")}` },
          { label: "Đã duyệt", value: metrics.daDuyet, cls: "text-blue-600",
            sub: `${t("7 ngày qua")}: ${fmt(metrics.daDuyet7dTien)} ${t("đ")}` },
        ].map(m => (
          <Card key={m.label}>
            <CardContent className="p-4">
              <p className="text-sm text-muted-foreground">{t(m.label)}</p>
              <p className={cn("text-2xl font-bold", m.cls)}>{m.value}</p>
              <p className={cn("text-sm font-bold mt-0.5", m.cls)}>{m.sub}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-end gap-3">
        <div className="w-[200px]">
          <label className="text-xs text-muted-foreground mb-1 block">{t("Đoàn")}</label>
          <SearchableSelect
            options={doanSelectOpts}
            value={doanId}
            onChange={setDoanId}
            placeholder={t("Tất cả đoàn")}
            searchPlaceholder={t("Tìm đoàn...")}
          />
        </div>

        <div>
          <label className="text-xs text-muted-foreground mb-1 block">{t("Từ ngày")}</label>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className={cn("w-[130px] justify-start text-left font-normal", !fromDate && "text-muted-foreground")}>
                <CalendarIcon className="mr-1 h-4 w-4" />
                {fromDate ? format(fromDate, "dd/MM/yyyy") : t("Chọn")}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar mode="single" selected={fromDate} onSelect={setFromDate} className="p-3 pointer-events-auto" />
            </PopoverContent>
          </Popover>
        </div>

        <div>
          <label className="text-xs text-muted-foreground mb-1 block">{t("Đến ngày")}</label>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className={cn("w-[130px] justify-start text-left font-normal", !toDate && "text-muted-foreground")}>
                <CalendarIcon className="mr-1 h-4 w-4" />
                {toDate ? format(toDate, "dd/MM/yyyy") : t("Chọn")}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar mode="single" selected={toDate} onSelect={setToDate} className="p-3 pointer-events-auto" />
            </PopoverContent>
          </Popover>
        </div>

        <div>
          <label className="text-xs text-muted-foreground mb-1 block">{t("Trạng thái duyệt")}</label>
          <Select value={trangThaiDuyet} onValueChange={v => setTrangThaiDuyet(v === "all" ? "" : v)}>
            <SelectTrigger className="w-[140px]">
              <span>{!trangThaiDuyet ? t("Tất cả") : trangThaiDuyet === "cho_duyet" ? t("Chờ duyệt") : trangThaiDuyet === "da_duyet" ? t("Đã duyệt") : t("Từ chối")}</span>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("Tất cả")}</SelectItem>
              <SelectItem value="cho_duyet">{t("Chờ duyệt")}</SelectItem>
              <SelectItem value="da_duyet">{t("Đã duyệt")}</SelectItem>
              <SelectItem value="tu_choi">{t("Từ chối")}</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div>
          <label className="text-xs text-muted-foreground mb-1 block">{t("Loại")}</label>
          <Select value={loai} onValueChange={v => setLoai(v === "all" ? "" : v)}>
            <SelectTrigger className="w-[130px]">
              <span>{!loai ? t("Tất cả") : loai === "khach_san" ? t("Khách sạn") : loai === "nha_hang" ? t("Nhà hàng") : loai === "tra_truoc" ? t("Trả trước") : t("Dịch vụ")}</span>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("Tất cả")}</SelectItem>
              <SelectItem value="khach_san">{t("Khách sạn")}</SelectItem>
              <SelectItem value="nha_hang">{t("Nhà hàng")}</SelectItem>
              <SelectItem value="dich_vu">{t("Dịch vụ")}</SelectItem>
              <SelectItem value="tra_truoc">{t("Trả trước")}</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <Button variant="ghost" size="sm" onClick={resetFilters}>
          <RotateCcw className="h-4 w-4 mr-1" /> {t("Reset")}
        </Button>
      </div>

      {/* Table */}
      <div className="border rounded-lg overflow-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[50px]">{t("STT")}</TableHead>
              <TableHead className="min-w-[120px]">{t("Mã đoàn")}</TableHead>
              <TableHead className="w-[60px]">{t("Loại")}</TableHead>
              <TableHead className="min-w-[180px]">{t("Mô tả")}</TableHead>
              <TableHead className="min-w-[110px] text-right">{t("Số tiền")}</TableHead>
              <TableHead className="w-[90px]">{t("Ngày cần TT")}</TableHead>
              <TableHead className="min-w-[140px]">{t("Đề nghị")}</TableHead>
              <TableHead className="min-w-[140px]">{t("Kế toán trưởng")}</TableHead>
              <TableHead className="w-[90px]">{t("Ngày tạo")}</TableHead>
              <TableHead className="w-[50px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={10} className="text-center py-8 text-muted-foreground">{t("Đang tải...")}</TableCell></TableRow>
            ) : rows.length === 0 ? (
              <TableRow><TableCell colSpan={10} className="text-center py-8 text-muted-foreground">{t("Không có dữ liệu")}</TableCell></TableRow>
            ) : pageRows.map((row, idx) => {
              const lt = loaiLabel[row.loai] || { text: row.loai, color: "bg-muted text-muted-foreground" };
              const canTruRow = canTruMap[row.id];

              return (
                <TableRow key={row.id}>
                  <TableCell className="text-center">{(currentPage - 1) * PAGE_SIZE + idx + 1}</TableCell>
                  <TableCell>
                    <button
                      className="text-primary hover:underline text-left font-medium"
                      onClick={() => navigate(`/doan/${row.doan_id}`)}
                    >
                      {row.ten_doan}
                    </button>
                  </TableCell>
                  <TableCell>
                    <span className={cn("px-2 py-0.5 rounded text-xs font-medium", lt.color)}>{t(lt.text)}</span>
                  </TableCell>
                  <TableCell className="text-sm">{row.mo_ta}</TableCell>
                  <TableCell className="text-right font-medium">
                    {(() => {
                      const refKey = row.doan_id != null && row.ref_loai && row.ref_id != null
                        ? `${row.doan_id}|${row.ref_loai}|${row.ref_id}`
                        : null;
                      const cocSibling = refKey
                        ? Math.max(0, (cocByRef[refKey] || 0) - (row.la_coc ? (row.paid_amount || 0) : 0))
                        : 0;
                      const canTru = canTruByDntt[row.id] || 0;
                      const thucTT = Math.max(0, row.so_tien - canTru);
                      const isThuHoi = (row.ghi_chu || "").includes("[Thu hồi]");
                      const sign = isThuHoi ? "-" : "";
                      const amountCls = isThuHoi ? "text-blue-600" : "";
                      return (
                        <div className="space-y-0.5">
                          {canTru > 0 ? (
                            <div className="text-xs space-y-0.5">
                              <div className="text-muted-foreground">{t("Tổng:")} <span className={amountCls}>{sign}{fmt(row.so_tien)}</span></div>
                              <div className="text-amber-600">{t("Cấn trừ:")} −{fmt(canTru)}</div>
                              <div className={cn("text-sm font-semibold", amountCls)}>{t("Thực TT:")} {sign}{fmt(thucTT)}</div>
                            </div>
                          ) : (
                            <div className={amountCls}>{sign}{fmt(row.so_tien)}</div>
                          )}
                          {isThuHoi && (
                            <span className="inline-block text-[10px] bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded font-medium">
                              {t("Thu hồi")}
                            </span>
                          )}
                          {row.la_coc && (
                            <span className="inline-block text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded font-medium">
                              {row.ty_le_coc ? `${t("Cọc")} ${row.ty_le_coc}%` : t("Cọc")}
                            </span>
                          )}
                          {!row.la_coc && cocSibling > 0 && (
                            <div className="text-[11px] text-muted-foreground font-normal">
                              {t("Đã cọc:")} <span className="text-amber-600 font-medium">{fmt(cocSibling)}</span>
                            </div>
                          )}
                        </div>
                      );
                    })()}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {row.ngay_can_thanh_toan
                      ? format(new Date(row.ngay_can_thanh_toan), "dd/MM/yyyy")
                      : "—"}
                  </TableCell>
                  <TableCell className="text-xs">
                    {row.tao_boi_ho_ten || row.tao_luc ? (
                      <div className="flex flex-col gap-0.5">
                        <span className="font-medium">{row.tao_boi_ho_ten || "—"}</span>
                        {row.tao_luc && (
                          <span className="text-muted-foreground">
                            {format(new Date(row.tao_luc), "HH:mm dd/MM")}
                          </span>
                        )}
                      </div>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  {/* Cấp 1 (TP ĐH) + cấp 2 (Kế toán TT) tạm ẩn — DB trigger auto-stamp khi INSERT */}
                  {([3] as ApprovalLevel[]).map((lv) => (
                    <ApprovalCell
                      key={lv}
                      row={row} level={lv}
                      user={user} userMap={userMap}
                      onApprove={handleApprove}
                      onReject={(id, l) => { setRejectId(id); setRejectLevel(l); setRejectReason(""); }}
                    />
                  ))}
                  <TableCell className="text-xs text-muted-foreground">
                    {format(new Date(row.created_at), "dd/MM/yyyy")}
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      {row.trang_thai_duyet === "cho_duyet" && (
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => setDeleteId(row.id)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                      {row.trang_thai_duyet === "da_duyet" && row.payment_status === "unpaid" && (
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" title={t("Hủy đề nghị")}
                          onClick={() => setCancelTarget({ id: row.id, isPaid: false, moTa: row.mo_ta || "ĐNTT" })}>
                          <Ban className="h-4 w-4" />
                        </Button>
                      )}
                      {row.payment_status === "paid" && row.trang_thai_duyet !== "da_huy" && (
                        <>
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-blue-500" title={t("Điều chỉnh sau thanh toán")}
                            onClick={() => handleAdjustOpen(row)}>
                            <SlidersHorizontal className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-orange-500" title={t("Hủy thanh toán")}
                            onClick={() => { setCancelMode("hoan_tien"); setCancelTarget({ id: row.id, isPaid: true, moTa: row.mo_ta || "ĐNTT" }); }}>
                            <Ban className="h-4 w-4" />
                          </Button>
                        </>
                      )}
                    </div>
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
            {t("Hiển thị")} {(currentPage - 1) * PAGE_SIZE + 1}–{Math.min(currentPage * PAGE_SIZE, mainRows.length)} / {mainRows.length}
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={currentPage <= 1}
              className="h-7 px-2 inline-flex items-center gap-1 border rounded text-xs disabled:opacity-40 disabled:cursor-not-allowed hover:bg-muted"
            >
              <ChevronLeft className="h-3 w-3" />
              {t("Trước")}
            </button>
            <span className="px-2 text-muted-foreground">{t("Trang")} {currentPage} / {totalPages}</span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage >= totalPages}
              className="h-7 px-2 inline-flex items-center gap-1 border rounded text-xs disabled:opacity-40 disabled:cursor-not-allowed hover:bg-muted"
            >
              {t("Sau")}
              <ChevronRight className="h-3 w-3" />
            </button>
          </div>
        </div>
      )}

      {/* Reject dialog */}
      <Dialog open={rejectId !== null} onOpenChange={o => { if (!o) { setRejectId(null); setRejectLevel(null); } }}>
        <DialogContent>
          <DialogHeader><DialogTitle>{t("Từ chối ĐNTT")}</DialogTitle></DialogHeader>
          <div>
            <label className="text-sm font-medium">{t("Lý do từ chối")}</label>
            <Input
              value={rejectReason}
              onChange={e => setRejectReason(e.target.value)}
              placeholder={t("Nhập lý do...")}
              className="mt-1"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setRejectId(null); setRejectLevel(null); }}>{t("Hủy")}</Button>
            <Button variant="destructive" onClick={handleRejectSubmit} disabled={!rejectReason.trim()}>
              {t("Xác nhận từ chối")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <AlertDialog open={deleteId !== null} onOpenChange={o => { if (!o) setDeleteId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("Xóa đề nghị thanh toán?")}</AlertDialogTitle>
            <AlertDialogDescription>{t("Thao tác này không thể hoàn tác.")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("Hủy")}</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteConfirm}>{t("Xóa")}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Adjustment dialog — điều chỉnh sau khi đã thanh toán */}
      <Dialog open={!!adjustTarget} onOpenChange={o => { if (!o) setAdjustTarget(null); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-sm">{t("Điều chỉnh sau thanh toán")}</DialogTitle>
          </DialogHeader>
          {adjustTarget && (
            <div className="space-y-3 py-1 text-sm">
              <p className="text-muted-foreground text-xs">{adjustTarget.mo_ta}</p>
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">{t("Đã thanh toán:")}</span>
                <span className="font-semibold">{fmt(adjustTarget.so_tien)} VND</span>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium">{t("Số tiền thực tế")}</label>
                <Input
                  className="h-8 text-sm"
                  value={adjustAmount}
                  onChange={e => setAdjustAmount(e.target.value.replace(/\D/g, ""))}
                  placeholder={t("Nhập số tiền...")}
                />
              </div>
              {(() => {
                const actual = parseInt(adjustAmount.replace(/\D/g, ""), 10);
                if (isNaN(actual) || actual === adjustTarget.so_tien) return null;
                const delta = actual - adjustTarget.so_tien;
                return (
                  <div className={cn(
                    "rounded px-3 py-2 text-xs font-medium",
                    delta > 0 ? "bg-yellow-50 text-yellow-700" : "bg-purple-50 text-purple-700"
                  )}>
                    {delta > 0
                      ? `${t("Thiếu")} ${fmt(delta)} VND → ${t("sẽ tạo ĐNTT bổ sung (chờ duyệt)")}`
                      : `${t("Thừa")} ${fmt(Math.abs(delta))} VND → ${t("sẽ ghi công nợ NCC")}`
                    }
                  </div>
                );
              })()}
              <div className="space-y-1">
                <label className="text-xs font-medium">{t("Lý do điều chỉnh")}</label>
                <Textarea
                  className="text-xs min-h-[60px]"
                  value={adjustReason}
                  onChange={e => setAdjustReason(e.target.value)}
                  placeholder={t("VD: Giảm 2 phòng, khách huỷ...")}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" size="sm" className="text-xs" onClick={() => setAdjustTarget(null)}>{t("Đóng")}</Button>
            <Button
              size="sm" className="text-xs"
              onClick={handleAdjustSubmit}
              disabled={
                adjustMut.isPending ||
                !adjustAmount ||
                parseInt(adjustAmount.replace(/\D/g, ""), 10) === adjustTarget?.so_tien
              }
            >
              {t("Xác nhận")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Cancel dialog — hủy đề nghị hoặc hủy khoản đã TT */}
      <Dialog open={!!cancelTarget} onOpenChange={o => { if (!o) setCancelTarget(null); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-sm">
              {cancelTarget?.isPaid ? t("Hủy khoản thanh toán") : t("Hủy đề nghị thanh toán")}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-1">
            <p className="text-xs text-muted-foreground">{cancelTarget?.moTa}</p>
            {cancelTarget?.isPaid ? (
              <div className="space-y-2">
                <p className="text-xs font-medium">{t("Hình thức xử lý sau khi hủy:")}</p>
                <RadioGroup value={cancelMode} onValueChange={v => setCancelMode(v as "cong_no" | "hoan_tien")} className="space-y-2">
                  <div className="flex items-start gap-2">
                    <RadioGroupItem value="hoan_tien" id="hoan" className="mt-0.5" />
                    <Label htmlFor="hoan" className="text-xs cursor-pointer">
                      <span className="font-medium">{t("Hoàn lại tiền")}</span>
                      <p className="text-muted-foreground font-normal">{t("Không ghi nhận công nợ, hoàn trả đầy đủ")}</p>
                    </Label>
                  </div>
                  <div className="flex items-start gap-2">
                    <RadioGroupItem value="cong_no" id="cno" className="mt-0.5" />
                    <Label htmlFor="cno" className="text-xs cursor-pointer">
                      <span className="font-medium">{t("Cấn trừ công nợ")}</span>
                      <p className="text-muted-foreground font-normal">{t("Ghi nhận công nợ cho nhà cung cấp")}</p>
                    </Label>
                  </div>
                </RadioGroup>
              </div>
            ) : (
              <p className="text-xs">{t("Đề nghị sẽ bị hủy, chi phí sẽ trở về trạng thái chưa gửi duyệt.")}</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" className="text-xs" onClick={() => setCancelTarget(null)}>{t("Đóng")}</Button>
            <Button variant="destructive" size="sm" className="text-xs" onClick={handleCancelSubmit} disabled={cancelMut.isPending}>
              {t("Xác nhận hủy")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function DNTTPage() {
  // Mở cho bộ phận kế toán + toàn bộ giám đốc trở lên (giam_doc, admin).
  // Gọi cả 2 hook vô điều kiện — KHÔNG dùng `||` trực tiếp vì short-circuit sẽ
  // bỏ qua hook thứ 2 khi hook thứ 1 truthy (vi phạm Rules of Hooks).
  const isKeToan = useBoPhan("ke_toan");
  const isGiamDoc = useRoleAtLeast("giam_doc");
  if (!isKeToan && !isGiamDoc) return <AccessDenied />;
  return <DNTTPageContent />;
}
