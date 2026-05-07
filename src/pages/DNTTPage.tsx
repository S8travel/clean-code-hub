import { useState, useMemo } from "react";
import { format, startOfMonth, endOfMonth } from "date-fns";
import { useBoPhan } from "@/hooks/use-permissions";
import { AccessDenied, PermissionGate } from "@/components/PermissionGate";
import { useNavigate } from "react-router-dom";
import { Search, RotateCcw, Check, X, Trash2, CreditCard, Ban } from "lucide-react";
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
  useDNTTList, useDoanOptions, useApproveDNTT,
  useRejectDNTT, useMarkPaidDNTT, useDeleteDNTT, useCancelDNTT,
  useCreateAdjustment,
  type DNTTRow,
} from "@/hooks/use-dntt";
import { Textarea } from "@/components/ui/textarea";
import { SlidersHorizontal } from "lucide-react";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";
import { useLogActivity } from "@/hooks/use-activity-log";

const fmt = (n: number) => n.toLocaleString("vi-VN");

const loaiLabel: Record<string, { text: string; color: string }> = {
  khach_san: { text: "KS", color: "bg-blue-100 text-blue-700" },
  nha_hang: { text: "NH", color: "bg-orange-100 text-orange-700" },
  dich_vu: { text: "DV", color: "bg-purple-100 text-purple-700" },
};

const duyetBadge: Record<string, { text: string; cls: string }> = {
  cho_duyet: { text: "Chờ duyệt", cls: "bg-yellow-100 text-yellow-700" },
  da_duyet: { text: "Đã duyệt", cls: "bg-green-100 text-green-700" },
  tu_choi: { text: "Từ chối", cls: "bg-red-100 text-red-700" },
};

const ttBadge: Record<string, { text: string; cls: string }> = {
  chua_tt: { text: "Chờ UNC", cls: "bg-muted text-muted-foreground" },
  da_tt: { text: "Đã TT", cls: "bg-emerald-100 text-emerald-700" },
};

export default function DNTTPage() {
  const canView = useBoPhan("ke_toan");
  if (!canView) return <AccessDenied />;

  const navigate = useNavigate();
  const now = new Date();
  const [doanId, setDoanId] = useState<string>("");
  const [fromDate, setFromDate] = useState<Date | undefined>(startOfMonth(now));
  const [toDate, setToDate] = useState<Date | undefined>(endOfMonth(now));
  const [trangThaiDuyet, setTrangThaiDuyet] = useState("cho_duyet");
  const [trangThaiTT, setTrangThaiTT] = useState("");
  const [loai, setLoai] = useState("");

  const filters = useMemo(() => ({
    doanId: doanId ? Number(doanId) : null,
    fromDate: fromDate ? format(fromDate, "yyyy-MM-dd") : null,
    toDate: toDate ? format(toDate, "yyyy-MM-dd") : null,
    trangThaiDuyet: trangThaiDuyet || null,
    trangThaiTT: trangThaiTT || null,
    loai: loai || null,
  }), [doanId, fromDate, toDate, trangThaiDuyet, trangThaiTT, loai]);

  const { data: rows = [], isLoading } = useDNTTList(filters);
  const { data: doanOpts = [] } = useDoanOptions();
  const approveMut = useApproveDNTT();
  const rejectMut = useRejectDNTT();
  const markPaidMut = useMarkPaidDNTT();
  const deleteMut = useDeleteDNTT();
  const cancelMut = useCancelDNTT();

  const adjustMut = useCreateAdjustment();
  const logActivity = useLogActivity();

  const [rejectId, setRejectId] = useState<number | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [cancelTarget, setCancelTarget] = useState<{ id: number; isPaid: boolean; moTa: string } | null>(null);
  const [cancelMode, setCancelMode] = useState<"cong_no" | "hoan_tien">("hoan_tien");
  const [adjustTarget, setAdjustTarget] = useState<DNTTRow | null>(null);
  const [adjustAmount, setAdjustAmount] = useState("");
  const [adjustReason, setAdjustReason] = useState("");

  // Group cấn trừ satellite rows with their main rows
  const { mainRows, canTruMap } = useMemo(() => {
    const canTruMap: Record<number, DNTTRow> = {};
    const linkedIds = new Set<number>();
    rows.forEach(r => {
      if (r.ref_loai === "can_tru_cong_no" && r.linked_dntt_id) {
        canTruMap[r.linked_dntt_id] = r;
        linkedIds.add(r.id);
      }
    });
    return { mainRows: rows.filter(r => !linkedIds.has(r.id)), canTruMap };
  }, [rows]);

  const metrics = useMemo(() => {
    const total = mainRows.length;
    const choDuyet = mainRows.filter(r => r.trang_thai_duyet === "cho_duyet").length;
    const daDuyetChoTT = mainRows.filter(r => r.trang_thai_duyet === "da_duyet" && r.trang_thai_thanh_toan === "chua_tt").length;
    const daTT = mainRows.filter(r => r.trang_thai_thanh_toan === "da_tt").length;
    return { total, choDuyet, daDuyetChoTT, daTT };
  }, [mainRows]);

  const resetFilters = () => {
    setDoanId("");
    setFromDate(startOfMonth(now));
    setToDate(endOfMonth(now));
    setTrangThaiDuyet("");
    setTrangThaiTT("");
    setLoai("");
  };

  const handleApprove = (id: number) => {
    approveMut.mutate(id, {
      onSuccess: () => {
        toast({ title: "Đã duyệt ĐNTT" });
        logActivity.mutate({ action: "duyet", table_name: "de_nghi_thanh_toan", record_id: id, mo_ta: `Duyệt ĐNTT #${id}` });
      },
    });
  };

  const handleRejectSubmit = () => {
    if (!rejectId) return;
    rejectMut.mutate({ id: rejectId, ghiChu: rejectReason }, {
      onSuccess: () => {
        toast({ title: "Đã từ chối ĐNTT" });
        logActivity.mutate({ action: "tu_choi", table_name: "de_nghi_thanh_toan", record_id: rejectId, mo_ta: `Từ chối ĐNTT #${rejectId}` });
        setRejectId(null);
        setRejectReason("");
      },
    });
  };

  const handleMarkPaid = (id: number) => {
    markPaidMut.mutate(id, {
      onSuccess: () => {
        toast({ title: "Đã xác nhận thanh toán" });
        logActivity.mutate({ action: "thanh_toan", table_name: "de_nghi_thanh_toan", record_id: id, mo_ta: `Xác nhận TT ĐNTT #${id}` });
      },
    });
  };

  const handleCancelSubmit = () => {
    if (!cancelTarget) return;
    cancelMut.mutate(
      { id: cancelTarget.id, mode: cancelTarget.isPaid ? cancelMode : undefined },
      {
        onSuccess: () => {
          toast({ title: cancelTarget.isPaid ? "Đã hủy khoản thanh toán" : "Đã hủy đề nghị" });
          setCancelTarget(null);
        },
        onError: (err: any) => toast({ title: "Lỗi: " + (err?.message || "Không thể hủy"), variant: "destructive" }),
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
      toast({ title: "Số tiền không thay đổi" });
      return;
    }
    adjustMut.mutate(
      { dnttGoc: adjustTarget, soTienThucTe, lyDo: adjustReason || "Điều chỉnh số lượng" },
      {
        onSuccess: (result) => {
          if (!result) return;
          const delta = result.delta;
          if (delta > 0) {
            toast({ title: `Đã tạo ĐNTT bổ sung ${fmt(delta)} VND — chờ duyệt` });
          } else {
            toast({ title: `Đã ghi công nợ ${fmt(Math.abs(delta))} VND — xem tại trang Công nợ` });
          }
          setAdjustTarget(null);
        },
        onError: (err: any) => toast({ title: "Lỗi: " + (err?.message || "Không thể điều chỉnh"), variant: "destructive" }),
      },
    );
  };

  const handleDeleteConfirm = () => {
    if (!deleteId) return;
    deleteMut.mutate(deleteId, {
      onSuccess: () => {
        toast({ title: "Đã xóa ĐNTT" });
        setDeleteId(null);
      },
    });
  };

  const doanSelectOpts = doanOpts.map((d: any) => ({
    value: String(d.id),
    label: d.ten_doan,
  }));

  return (
    <div className="p-6 space-y-4">
      <h1 className="text-2xl font-bold">Đề nghị thanh toán</h1>

      {/* Metrics */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: "Tổng ĐNTT", value: metrics.total, cls: "text-foreground" },
          { label: "Chờ duyệt", value: metrics.choDuyet, cls: "text-yellow-600" },
          { label: "Đã duyệt chờ TT", value: metrics.daDuyetChoTT, cls: "text-blue-600" },
          { label: "Đã thanh toán", value: metrics.daTT, cls: "text-emerald-600" },
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
          <label className="text-xs text-muted-foreground mb-1 block">Từ ngày</label>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className={cn("w-[130px] justify-start text-left font-normal", !fromDate && "text-muted-foreground")}>
                <CalendarIcon className="mr-1 h-4 w-4" />
                {fromDate ? format(fromDate, "dd/MM/yyyy") : "Chọn"}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar mode="single" selected={fromDate} onSelect={setFromDate} className="p-3 pointer-events-auto" />
            </PopoverContent>
          </Popover>
        </div>

        <div>
          <label className="text-xs text-muted-foreground mb-1 block">Đến ngày</label>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className={cn("w-[130px] justify-start text-left font-normal", !toDate && "text-muted-foreground")}>
                <CalendarIcon className="mr-1 h-4 w-4" />
                {toDate ? format(toDate, "dd/MM/yyyy") : "Chọn"}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar mode="single" selected={toDate} onSelect={setToDate} className="p-3 pointer-events-auto" />
            </PopoverContent>
          </Popover>
        </div>

        <div>
          <label className="text-xs text-muted-foreground mb-1 block">Trạng thái duyệt</label>
          <Select value={trangThaiDuyet} onValueChange={v => setTrangThaiDuyet(v === "all" ? "" : v)}>
            <SelectTrigger className="w-[140px]"><SelectValue placeholder="Tất cả" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tất cả</SelectItem>
              <SelectItem value="cho_duyet">Chờ duyệt</SelectItem>
              <SelectItem value="da_duyet">Đã duyệt</SelectItem>
              <SelectItem value="tu_choi">Từ chối</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div>
          <label className="text-xs text-muted-foreground mb-1 block">Thanh toán</label>
          <Select value={trangThaiTT} onValueChange={v => setTrangThaiTT(v === "all" ? "" : v)}>
            <SelectTrigger className="w-[130px]"><SelectValue placeholder="Tất cả" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tất cả</SelectItem>
              <SelectItem value="chua_tt">Chưa TT</SelectItem>
              <SelectItem value="da_tt">Đã TT</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div>
          <label className="text-xs text-muted-foreground mb-1 block">Loại</label>
          <Select value={loai} onValueChange={v => setLoai(v === "all" ? "" : v)}>
            <SelectTrigger className="w-[130px]"><SelectValue placeholder="Tất cả" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tất cả</SelectItem>
              <SelectItem value="khach_san">Khách sạn</SelectItem>
              <SelectItem value="nha_hang">Nhà hàng</SelectItem>
              <SelectItem value="dich_vu">Dịch vụ</SelectItem>
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
              <TableHead className="min-w-[120px]">Mã đoàn</TableHead>
              <TableHead className="w-[60px]">Loại</TableHead>
              <TableHead className="min-w-[180px]">Mô tả</TableHead>
              <TableHead className="min-w-[150px]">Nhà cung cấp</TableHead>
              <TableHead className="min-w-[110px] text-right">Số tiền</TableHead>
              <TableHead className="w-[90px]">Ngày cần TT</TableHead>
              <TableHead className="min-w-[110px]">ĐNTT</TableHead>
              <TableHead className="min-w-[110px]">Thanh toán</TableHead>
              <TableHead className="w-[90px]">Ngày tạo</TableHead>
              <TableHead className="w-[50px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={11} className="text-center py-8 text-muted-foreground">Đang tải...</TableCell></TableRow>
            ) : rows.length === 0 ? (
              <TableRow><TableCell colSpan={11} className="text-center py-8 text-muted-foreground">Không có dữ liệu</TableCell></TableRow>
            ) : mainRows.map((row, idx) => {
              const lt = loaiLabel[row.loai] || { text: row.loai, color: "bg-muted text-muted-foreground" };
              const db = duyetBadge[row.trang_thai_duyet] || duyetBadge.cho_duyet;
              const tb = ttBadge[row.trang_thai_thanh_toan] || ttBadge.chua_tt;
              const canTruRow = canTruMap[row.id];

              return (
                <TableRow key={row.id}>
                  <TableCell className="text-center">{idx + 1}</TableCell>
                  <TableCell>
                    <button
                      className="text-primary hover:underline text-left font-medium"
                      onClick={() => navigate(`/doan/${row.doan_id}`)}
                    >
                      {row.ten_doan}
                    </button>
                  </TableCell>
                  <TableCell>
                    <span className={cn("px-2 py-0.5 rounded text-xs font-medium", lt.color)}>{lt.text}</span>
                  </TableCell>
                  <TableCell className="text-sm">{row.mo_ta}</TableCell>
                  <TableCell className="text-sm">{row.ten_ncc || "—"}</TableCell>
                  <TableCell className="text-right font-medium">
                    {canTruRow ? (
                      <div className="space-y-0.5 text-xs">
                        <div className="text-muted-foreground">Tổng: {fmt(row.so_tien + canTruRow.so_tien)}</div>
                        <div className="text-amber-600">Cấn trừ: −{fmt(canTruRow.so_tien)}</div>
                        <div className="text-sm font-semibold">Cần TT: {fmt(row.so_tien)}</div>
                      </div>
                    ) : (
                      <div>{fmt(row.so_tien)}</div>
                    )}
                    {row.la_coc && row.ty_le_coc && (
                      <span className="text-xs bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded">
                        Cọc {row.ty_le_coc}%
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {row.ngay_can_thanh_toan
                      ? format(new Date(row.ngay_can_thanh_toan), "dd/MM/yyyy")
                      : "—"}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col gap-1">
                      <span className={cn("px-2 py-0.5 rounded text-xs font-medium w-fit", db.cls)}>{db.text}</span>
                      {row.trang_thai_duyet === "cho_duyet" && (
                        <div className="flex gap-1 mt-1">
                          <Button size="sm" variant="outline" className="h-6 px-2 text-xs text-green-600" onClick={() => handleApprove(row.id)}>
                            <Check className="h-3 w-3 mr-1" /> Duyệt
                          </Button>
                          <Button size="sm" variant="outline" className="h-6 px-2 text-xs text-red-600" onClick={() => { setRejectId(row.id); setRejectReason(""); }}>
                            <X className="h-3 w-3 mr-1" /> Từ chối
                          </Button>
                        </div>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    {row.trang_thai_duyet === "da_duyet" ? (
                      <div className="flex flex-col gap-1">
                        <span className={cn("px-2 py-0.5 rounded text-xs font-medium w-fit", tb.cls)}>{tb.text}</span>
                        {row.trang_thai_thanh_toan === "chua_tt" && (
                          <Button size="sm" variant="outline" className="h-6 px-2 text-xs mt-1" onClick={() => handleMarkPaid(row.id)}>
                            <CreditCard className="h-3 w-3 mr-1" /> Đã TT
                          </Button>
                        )}
                        {row.trang_thai_thanh_toan === "da_tt" && row.thanh_toan_luc && (
                          <span className="text-xs text-muted-foreground">
                            {format(new Date(row.thanh_toan_luc), "dd/MM/yyyy")}
                          </span>
                        )}
                      </div>
                    ) : row.trang_thai_duyet === "da_huy" ? (
                      <div className="flex flex-col gap-1">
                        <span className="px-2 py-0.5 rounded text-xs font-medium w-fit bg-gray-100 text-gray-500">Đã hủy</span>
                        {row.trang_thai_thanh_toan === "cong_no" && (
                          <span className="text-xs text-purple-600">Cấn trừ công nợ</span>
                        )}
                        {row.trang_thai_thanh_toan === "hoan_tien" && (
                          <span className="text-xs text-blue-600">Hoàn tiền</span>
                        )}
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </TableCell>
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
                      {row.trang_thai_duyet === "da_duyet" && row.trang_thai_thanh_toan === "chua_tt" && (
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" title="Hủy đề nghị"
                          onClick={() => setCancelTarget({ id: row.id, isPaid: false, moTa: row.mo_ta || "ĐNTT" })}>
                          <Ban className="h-4 w-4" />
                        </Button>
                      )}
                      {row.trang_thai_thanh_toan === "da_tt" && row.trang_thai_duyet !== "da_huy" && (
                        <>
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-blue-500" title="Điều chỉnh sau thanh toán"
                            onClick={() => handleAdjustOpen(row)}>
                            <SlidersHorizontal className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-orange-500" title="Hủy thanh toán"
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

      {/* Reject dialog */}
      <Dialog open={rejectId !== null} onOpenChange={o => { if (!o) setRejectId(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Từ chối ĐNTT</DialogTitle></DialogHeader>
          <div>
            <label className="text-sm font-medium">Lý do từ chối</label>
            <Input
              value={rejectReason}
              onChange={e => setRejectReason(e.target.value)}
              placeholder="Nhập lý do..."
              className="mt-1"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectId(null)}>Hủy</Button>
            <Button variant="destructive" onClick={handleRejectSubmit} disabled={!rejectReason.trim()}>
              Xác nhận từ chối
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <AlertDialog open={deleteId !== null} onOpenChange={o => { if (!o) setDeleteId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Xóa đề nghị thanh toán?</AlertDialogTitle>
            <AlertDialogDescription>Thao tác này không thể hoàn tác.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Hủy</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteConfirm}>Xóa</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Adjustment dialog — điều chỉnh sau khi đã thanh toán */}
      <Dialog open={!!adjustTarget} onOpenChange={o => { if (!o) setAdjustTarget(null); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-sm">Điều chỉnh sau thanh toán</DialogTitle>
          </DialogHeader>
          {adjustTarget && (
            <div className="space-y-3 py-1 text-sm">
              <p className="text-muted-foreground text-xs">{adjustTarget.mo_ta}</p>
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Đã thanh toán:</span>
                <span className="font-semibold">{fmt(adjustTarget.so_tien)} VND</span>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium">Số tiền thực tế</label>
                <Input
                  className="h-8 text-sm"
                  value={adjustAmount}
                  onChange={e => setAdjustAmount(e.target.value.replace(/\D/g, ""))}
                  placeholder="Nhập số tiền..."
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
                      ? `Thiếu ${fmt(delta)} VND → sẽ tạo ĐNTT bổ sung (chờ duyệt)`
                      : `Thừa ${fmt(Math.abs(delta))} VND → sẽ ghi công nợ NCC`
                    }
                  </div>
                );
              })()}
              <div className="space-y-1">
                <label className="text-xs font-medium">Lý do điều chỉnh</label>
                <Textarea
                  className="text-xs min-h-[60px]"
                  value={adjustReason}
                  onChange={e => setAdjustReason(e.target.value)}
                  placeholder="VD: Giảm 2 phòng, khách huỷ..."
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" size="sm" className="text-xs" onClick={() => setAdjustTarget(null)}>Đóng</Button>
            <Button
              size="sm" className="text-xs"
              onClick={handleAdjustSubmit}
              disabled={
                adjustMut.isPending ||
                !adjustAmount ||
                parseInt(adjustAmount.replace(/\D/g, ""), 10) === adjustTarget?.so_tien
              }
            >
              Xác nhận
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Cancel dialog — hủy đề nghị hoặc hủy khoản đã TT */}
      <Dialog open={!!cancelTarget} onOpenChange={o => { if (!o) setCancelTarget(null); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-sm">
              {cancelTarget?.isPaid ? "Hủy khoản thanh toán" : "Hủy đề nghị thanh toán"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-1">
            <p className="text-xs text-muted-foreground">{cancelTarget?.moTa}</p>
            {cancelTarget?.isPaid ? (
              <div className="space-y-2">
                <p className="text-xs font-medium">Hình thức xử lý sau khi hủy:</p>
                <RadioGroup value={cancelMode} onValueChange={v => setCancelMode(v as "cong_no" | "hoan_tien")} className="space-y-2">
                  <div className="flex items-start gap-2">
                    <RadioGroupItem value="hoan_tien" id="hoan" className="mt-0.5" />
                    <Label htmlFor="hoan" className="text-xs cursor-pointer">
                      <span className="font-medium">Hoàn lại tiền</span>
                      <p className="text-muted-foreground font-normal">Không ghi nhận công nợ, hoàn trả đầy đủ</p>
                    </Label>
                  </div>
                  <div className="flex items-start gap-2">
                    <RadioGroupItem value="cong_no" id="cno" className="mt-0.5" />
                    <Label htmlFor="cno" className="text-xs cursor-pointer">
                      <span className="font-medium">Cấn trừ công nợ</span>
                      <p className="text-muted-foreground font-normal">Ghi nhận công nợ cho nhà cung cấp</p>
                    </Label>
                  </div>
                </RadioGroup>
              </div>
            ) : (
              <p className="text-xs">Đề nghị sẽ bị hủy, chi phí sẽ trở về trạng thái chưa gửi duyệt.</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" className="text-xs" onClick={() => setCancelTarget(null)}>Đóng</Button>
            <Button variant="destructive" size="sm" className="text-xs" onClick={handleCancelSubmit} disabled={cancelMut.isPending}>
              Xác nhận hủy
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
