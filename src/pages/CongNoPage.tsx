import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Search, RotateCcw } from "lucide-react";
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
import { SearchableSelect } from "@/components/SearchableSelect";
import { cn } from "@/lib/utils";
import { useDNTTList, useDoanOptions, type DNTTRow } from "@/hooks/use-dntt";

const fmt = (n: number) => n.toLocaleString("vi-VN");

const loaiLabel: Record<string, { text: string; color: string }> = {
  khach_san: { text: "KS", color: "bg-blue-100 text-blue-700" },
  nha_hang: { text: "NH", color: "bg-orange-100 text-orange-700" },
  dich_vu: { text: "DV", color: "bg-purple-100 text-purple-700" },
};

const statusBadge: Record<string, { text: string; cls: string }> = {
  cong_no: { text: "Công nợ", cls: "bg-purple-100 text-purple-700" },
  hoan_tien: { text: "Hoàn tiền", cls: "bg-blue-100 text-blue-700" },
};

export default function CongNoPage() {
  const navigate = useNavigate();
  const [doanId, setDoanId] = useState<string>("");
  const [loai, setLoai] = useState("");
  const [trangThai, setTrangThai] = useState("all"); // "cong_no" | "hoan_tien" | "all"
  const [nccId, setNccId] = useState<string>("");
  const [search, setSearch] = useState("");

  // Fetch tất cả DNTT đã hủy (không lọc trang_thai_tt ở server để lấy cả cong_no + hoan_tien)
  const filters = useMemo(() => ({
    doanId: doanId ? Number(doanId) : null,
    fromDate: null,
    toDate: null,
    trangThaiDuyet: "da_huy",
    trangThaiTT: null,
    loai: loai || null,
  }), [doanId, loai]);

  const { data: allRows = [], isLoading } = useDNTTList(filters);
  const { data: doanOpts = [] } = useDoanOptions();

  // Build NCC options từ data đã load
  const nccOpts = useMemo(() => {
    const base = allRows.filter((r) =>
      r.trang_thai_thanh_toan === "cong_no" || r.trang_thai_thanh_toan === "hoan_tien"
    );
    const seen = new Map<string, string>(); // nha_cung_cap_id → ten
    base.forEach((r) => {
      if (r.nha_cung_cap_id != null && r.ten_ncc) {
        seen.set(String(r.nha_cung_cap_id), r.ten_ncc);
      }
    });
    return [...seen.entries()].map(([value, label]) => ({ value, label }));
  }, [allRows]);

  // Lọc client-side: chỉ lấy cong_no và hoan_tien
  const rows = useMemo(() => {
    let filtered = allRows.filter((r) =>
      r.trang_thai_thanh_toan === "cong_no" || r.trang_thai_thanh_toan === "hoan_tien"
    );
    if (trangThai && trangThai !== "all") filtered = filtered.filter((r) => r.trang_thai_thanh_toan === trangThai);
    if (nccId) filtered = filtered.filter((r) => String(r.nha_cung_cap_id) === nccId);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      filtered = filtered.filter(
        (r) =>
          r.ten_doan?.toLowerCase().includes(q) ||
          r.mo_ta?.toLowerCase().includes(q) ||
          r.ten_ncc?.toLowerCase().includes(q)
      );
    }
    return filtered;
  }, [allRows, trangThai, nccId, search]);

  const metrics = useMemo(() => {
    const congNo = rows.filter((r) => r.trang_thai_thanh_toan === "cong_no");
    const hoanTien = rows.filter((r) => r.trang_thai_thanh_toan === "hoan_tien");
    // so_tien_con_lai = null khi mới hủy (useCancelDNTT reset), được set khi cấn trừ một phần
    const conLai = (r: any) => r.so_tien_con_lai ?? r.so_tien;
    return {
      total: rows.length,
      tongCongNo: congNo.reduce((s, r) => s + conLai(r), 0),
      tongHoanTien: hoanTien.reduce((s, r) => s + conLai(r), 0),
      demCongNo: congNo.length,
      demHoanTien: hoanTien.length,
    };
  }, [rows]);

  const doanSelectOpts = doanOpts.map((d: any) => ({
    value: String(d.id),
    label: d.ten_doan,
  }));

  const resetFilters = () => {
    setDoanId("");
    setLoai("");
    setTrangThai("all");
    setNccId("");
    setSearch("");
  };

  return (
    <div className="p-6 space-y-4">
      <h1 className="text-2xl font-bold">Công nợ & Hoàn tiền</h1>
      <p className="text-sm text-muted-foreground">
        Danh sách các khoản đã thanh toán nhưng bị hủy — dùng để cấn trừ vào booking sau.
      </p>

      {/* Metrics */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: "Tổng khoản", value: metrics.total, cls: "text-foreground", isMoney: false },
          { label: "Công nợ", value: metrics.demCongNo, cls: "text-purple-600", isMoney: false },
          { label: "Tổng công nợ", value: metrics.tongCongNo, cls: "text-purple-600", isMoney: true },
          { label: "Tổng hoàn tiền", value: metrics.tongHoanTien, cls: "text-blue-600", isMoney: true },
        ].map((m) => (
          <Card key={m.label}>
            <CardContent className="p-4">
              <p className="text-sm text-muted-foreground">{m.label}</p>
              <p className={cn("text-xl font-bold", m.cls)}>
                {m.isMoney ? `${fmt(m.value)} ₫` : m.value}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-end gap-3">
        <div className="w-56">
          <SearchableSelect
            options={doanSelectOpts}
            value={doanId}
            onChange={setDoanId}
            placeholder="Tất cả đoàn"
            searchPlaceholder="Tìm đoàn..."
          />
        </div>
        <Select value={trangThai} onValueChange={setTrangThai}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Trạng thái" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tất cả</SelectItem>
            <SelectItem value="cong_no">Công nợ</SelectItem>
            <SelectItem value="hoan_tien">Hoàn tiền</SelectItem>
          </SelectContent>
        </Select>
        <div className="w-56">
          <SearchableSelect
            options={nccOpts}
            value={nccId}
            onChange={setNccId}
            placeholder="Tất cả nhà cung cấp"
            searchPlaceholder="Tìm nhà cung cấp..."
          />
        </div>
        <Select value={loai || "all"} onValueChange={(v) => setLoai(v === "all" ? "" : v)}>
          <SelectTrigger className="w-36">
            <SelectValue placeholder="Loại" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tất cả loại</SelectItem>
            <SelectItem value="khach_san">Khách sạn</SelectItem>
            <SelectItem value="nha_hang">Nhà hàng</SelectItem>
            <SelectItem value="dich_vu">Dịch vụ</SelectItem>
          </SelectContent>
        </Select>
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-8 w-56"
            placeholder="Tìm đoàn, mô tả, NCC..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Button variant="ghost" size="sm" onClick={resetFilters} className="gap-1">
          <RotateCcw className="h-3.5 w-3.5" />
          Đặt lại
        </Button>
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="text-xs">
                <TableHead className="py-2 px-3 w-[180px]">Đoàn</TableHead>
                <TableHead className="py-2 px-3 w-[50px]">Loại</TableHead>
                <TableHead className="py-2 px-3">Mô tả</TableHead>
                <TableHead className="py-2 px-3 w-[160px] text-right">Còn lại / Gốc</TableHead>
                <TableHead className="py-2 px-3 w-[110px]">Trạng thái</TableHead>
                <TableHead className="py-2 px-3 w-[160px]">Nhà cung cấp</TableHead>
                <TableHead className="py-2 px-3 w-[200px]">Ghi chú</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-muted-foreground text-sm">
                    Đang tải...
                  </TableCell>
                </TableRow>
              ) : rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-muted-foreground text-sm">
                    Không có khoản công nợ / hoàn tiền nào.
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((row) => {
                  const loaiInfo = loaiLabel[row.loai] || { text: row.loai, color: "bg-muted text-muted-foreground" };
                  const statusInfo = statusBadge[row.trang_thai_thanh_toan] || { text: row.trang_thai_thanh_toan, cls: "bg-muted text-muted-foreground" };
                  return (
                    <TableRow key={row.id} className="text-sm">
                      <TableCell className="py-2 px-3">
                        <button
                          className="text-left hover:underline text-primary font-medium"
                          onClick={() => row.doan_id && navigate(`/doan/${row.doan_id}`)}
                        >
                          {row.ten_doan || `Đoàn #${row.doan_id}`}
                        </button>
                      </TableCell>
                      <TableCell className="py-2 px-3">
                        <span className={cn("px-1.5 py-0.5 rounded text-[10px] font-medium", loaiInfo.color)}>
                          {loaiInfo.text}
                        </span>
                      </TableCell>
                      <TableCell className="py-2 px-3 text-muted-foreground">
                        {row.mo_ta || "—"}
                      </TableCell>
                      <TableCell className="py-2 px-3 text-right">
                        <span className="font-semibold">{fmt(row.so_tien_con_lai ?? row.so_tien)} ₫</span>
                        {row.so_tien_con_lai != null && row.so_tien_con_lai < row.so_tien && (
                          <div className="text-[10px] text-muted-foreground">gốc {fmt(row.so_tien)} ₫</div>
                        )}
                      </TableCell>
                      <TableCell className="py-2 px-3">
                        <span className={cn("px-1.5 py-0.5 rounded text-[10px] font-medium", statusInfo.cls)}>
                          {statusInfo.text}
                        </span>
                      </TableCell>
                      <TableCell className="py-2 px-3 text-muted-foreground text-xs">
                        {row.ten_ncc || "—"}
                      </TableCell>
                      <TableCell className="py-2 px-3 text-muted-foreground text-xs">
                        {row.ghi_chu || "—"}
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
