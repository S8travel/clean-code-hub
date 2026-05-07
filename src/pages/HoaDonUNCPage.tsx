import { useState, useMemo, useRef } from "react";
import { usePermission } from "@/hooks/use-permissions";
import { AccessDenied } from "@/components/PermissionGate";
import { format } from "date-fns";
import { useNavigate } from "react-router-dom";
import {
  RotateCcw, Upload, Eye, Trash2, FileText, FileCheck, FileX, CreditCard, CalendarIcon,
} from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
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
  useHoaDonUNCList, useUpdateDocStatus, useUploadDNTTDoc, useDeleteDNTTDoc,
  type HoaDonUNCRow, type TrangThaiDoc,
} from "@/hooks/use-hoa-don-unc";
import { useDoanOptions, useMarkPaidWithDate } from "@/hooks/use-dntt";
import { toast } from "@/hooks/use-toast";

const fmt = (n: number) => n.toLocaleString("vi-VN");

const loaiLabel: Record<string, { text: string; color: string }> = {
  khach_san: { text: "KS", color: "bg-blue-100 text-blue-700" },
  nha_hang: { text: "NH", color: "bg-orange-100 text-orange-700" },
  dich_vu: { text: "DV", color: "bg-purple-100 text-purple-700" },
  xe: { text: "Xe", color: "bg-green-100 text-green-700" },
  visa: { text: "Visa", color: "bg-indigo-100 text-indigo-700" },
  bao_hiem: { text: "BH", color: "bg-rose-100 text-rose-700" },
};

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

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    uploadMut.mutate(
      { id: row.id, file, loaiDoc },
      {
        onSuccess: () => toast({ title: `Đã tải lên ${loaiDoc === "hoa_don" ? "hóa đơn" : "UNC"}` }),
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
            <SelectValue />
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
    </div>
  );
}

export default function HoaDonUNCPage() {
  const canView = usePermission("hoa_don_unc", "view");
  if (!canView) return <AccessDenied />;

  const navigate = useNavigate();

  const [doanId, setDoanId] = useState<string>("");
  const [loai, setLoai] = useState<string>("");
  const [trangThaiTT, setTrangThaiTT] = useState<string>("");
  const [trangThaiHD, setTrangThaiHD] = useState<string>("");
  const [trangThaiUNC, setTrangThaiUNC] = useState<string>("");
  const [payDateMap, setPayDateMap] = useState<Record<number, Date | undefined>>({});

  const markPaidMut = useMarkPaidWithDate();

  const filters = useMemo(() => ({
    doanId: doanId ? Number(doanId) : null,
    loai: loai || null,
    trangThaiTT: (trangThaiTT || "all") as "chua_tt" | "da_tt" | "all",
    trangThaiHoaDon: (trangThaiHD || "all") as TrangThaiDoc | "all",
    trangThaiUNC: (trangThaiUNC || "all") as TrangThaiDoc | "all",
  }), [doanId, loai, trangThaiTT, trangThaiHD, trangThaiUNC]);

  const { data: rows = [], isLoading } = useHoaDonUNCList(filters);
  const { data: doanOpts = [] } = useDoanOptions();

  const { mainRows, canTruMap } = useMemo(() => {
    const canTruMap: Record<number, HoaDonUNCRow> = {};
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
    const chuaTT = mainRows.filter(r => r.trang_thai_thanh_toan === "chua_tt").length;
    const daTT = mainRows.filter(r => r.trang_thai_thanh_toan === "da_tt").length;
    const thieu_hd = mainRows.filter(r => r.trang_thai_thanh_toan === "da_tt" && r.trang_thai_hoa_don === "chua_co").length;
    const thieu_unc = mainRows.filter(r => r.trang_thai_thanh_toan === "da_tt" && r.trang_thai_unc === "chua_co").length;
    return { chuaTT, daTT, thieu_hd, thieu_unc };
  }, [mainRows]);

  const handleMarkPaid = (id: number) => {
    const date = payDateMap[id] ?? new Date();
    markPaidMut.mutate(
      { id, ngayThanhToan: format(date, "yyyy-MM-dd") },
      {
        onSuccess: () => toast({ title: "Đã xác nhận thanh toán" }),
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

  const doanSelectOpts = (doanOpts as any[]).map((d: any) => ({
    value: String(d.id),
    label: d.ten_doan,
  }));

  return (
    <div className="p-6 space-y-4">
      <h1 className="text-2xl font-bold">Thanh Toán, Hóa Đơn & UNC</h1>

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
            <SelectTrigger className="w-[130px]"><SelectValue placeholder="Tất cả" /></SelectTrigger>
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
            <SelectTrigger className="w-[150px]"><SelectValue placeholder="Tất cả" /></SelectTrigger>
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
            <SelectTrigger className="w-[150px]"><SelectValue placeholder="Tất cả" /></SelectTrigger>
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
            <SelectTrigger className="w-[150px]"><SelectValue placeholder="Tất cả" /></SelectTrigger>
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
              <TableHead className="min-w-[150px]">Nhà cung cấp</TableHead>
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
            ) : mainRows.map((row, idx) => {
              const lt = loaiLabel[row.loai] || { text: row.loai, color: "bg-muted text-muted-foreground" };
              const canTruRow = canTruMap[row.id];
              return (
                <TableRow key={row.id}>
                  <TableCell className="text-center text-sm">{idx + 1}</TableCell>
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
                  <TableCell className="text-sm">{row.ten_nha_cung_cap ?? "—"}</TableCell>
                  <TableCell className="text-right text-sm font-medium">
                    {canTruRow ? (
                      <div className="space-y-0.5 text-xs">
                        <div className="text-muted-foreground">Tổng: {fmt(row.so_tien + canTruRow.so_tien)}</div>
                        <div className="text-amber-600">Cấn trừ: −{fmt(canTruRow.so_tien)}</div>
                        <div className="text-sm font-semibold">Cần TT: {fmt(row.so_tien)}</div>
                      </div>
                    ) : (
                      fmt(row.so_tien)
                    )}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {row.ngay_can_thanh_toan
                      ? format(new Date(row.ngay_can_thanh_toan), "dd/MM/yyyy")
                      : "—"}
                  </TableCell>
                  <TableCell>
                    {row.trang_thai_thanh_toan === "da_tt" ? (
                      <div className="flex flex-col gap-0.5">
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded px-2 py-0.5 w-fit">
                          <CreditCard className="h-3 w-3" /> Đã TT
                        </span>
                        {row.thanh_toan_luc && (
                          <span className="text-xs text-muted-foreground">
                            {format(new Date(row.thanh_toan_luc), "dd/MM/yyyy")}
                          </span>
                        )}
                      </div>
                    ) : (
                      <div className="flex flex-col gap-1">
                        <Popover>
                          <PopoverTrigger asChild>
                            <Button variant="outline" size="sm" className="h-7 px-2 text-xs w-[130px] justify-start">
                              <CalendarIcon className="h-3 w-3 mr-1 shrink-0" />
                              {payDateMap[row.id]
                                ? format(payDateMap[row.id]!, "dd/MM/yyyy")
                                : "Chọn ngày TT"}
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-0" align="start">
                            <Calendar
                              mode="single"
                              selected={payDateMap[row.id]}
                              onSelect={(d) => setPayDateMap(prev => ({ ...prev, [row.id]: d }))}
                              initialFocus
                            />
                          </PopoverContent>
                        </Popover>
                        <Button
                          size="sm"
                          className="h-7 px-2 text-xs"
                          disabled={markPaidMut.isPending}
                          onClick={() => handleMarkPaid(row.id)}
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
    </div>
  );
}
