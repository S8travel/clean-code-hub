import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Search, RotateCcw, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { DatePicker } from "@/components/ui/date-picker";
import { SearchableSelect } from "@/components/SearchableSelect";
import CongNoDetailModal from "@/components/CongNoDetailModal";
import { cn } from "@/lib/utils";
import { useDoanOptions } from "@/hooks/use-dntt";
import { useCongNoList, useUpdateCongNoStatus, useCreatePrepaidDNTT, type CongNoRow } from "@/hooks/use-cong-no";
import { useDoanScope } from "@/hooks/use-doan-scope";
import { useNhaCungCapList } from "@/hooks/use-nha-cung-cap";
import { toast } from "@/hooks/use-toast";
import { errMsg } from "@/lib/error";
import { t, useTranslate } from "@/lib/i18n";

const fmt = (n: number) => n.toLocaleString("vi-VN");

const statusBadgeKeys: Record<string, { textKey: string; cls: string }> = {
  con_du:        { textKey: "Còn dư",          cls: "bg-purple-100 text-purple-700" },
  da_can_tru:    { textKey: "Đã cấn trừ hết",  cls: "bg-green-100 text-green-700" },
  da_hoan_tien:  { textKey: "Đã hoàn tiền",    cls: "bg-blue-100 text-blue-700" },
};

export default function CongNoPage() {
  useTranslate();
  const navigate = useNavigate();
  const [doanId, setDoanId] = useState<string>("");
  const [trangThai, setTrangThai] = useState("all"); // 'all'|'con_du'|'da_can_tru'|'da_hoan_tien'
  const [loai, setLoai] = useState("all"); // 'all'|'tra_truoc'|'phat_sinh'
  const [nccId, setNccId] = useState<string>("");
  const [search, setSearch] = useState("");
  const [detailRow, setDetailRow] = useState<CongNoRow | null>(null);

  // Modal "Tạo quỹ trả trước" (Pha 1)
  const [qtOpen, setQtOpen] = useState(false);
  const [qtNccId, setQtNccId] = useState("");
  const [qtSoTien, setQtSoTien] = useState("");
  const [qtMoTa, setQtMoTa] = useState("");
  const [qtNgay, setQtNgay] = useState<string>("");
  const { data: nccList = [] } = useNhaCungCapList();
  const createPrepaid = useCreatePrepaidDNTT();

  const qtNccOpts = useMemo(
    () => nccList.map((n) => ({ value: String(n.id), label: n.tra_truoc ? `${n.ten} ⭐` : n.ten })),
    [nccList],
  );

  const resetQt = () => {
    setQtNccId(""); setQtSoTien(""); setQtMoTa(""); setQtNgay("");
  };

  const handleCreatePrepaid = () => {
    const ncc = nccList.find((n) => String(n.id) === qtNccId);
    const soTien = parseInt(qtSoTien.replace(/\D/g, ""), 10);
    if (!ncc) { toast({ title: t("Chọn nhà cung cấp"), variant: "destructive" }); return; }
    if (!soTien || soTien <= 0) { toast({ title: t("Nhập số tiền hợp lệ"), variant: "destructive" }); return; }
    createPrepaid.mutate(
      { nccId: ncc.id, tenNcc: ncc.ten, soTien, moTa: qtMoTa.trim(), ngayCanThanhToan: qtNgay || null },
      {
        onSuccess: () => {
          toast({ title: t("Đã tạo ĐNTT trả trước — duyệt & chi tại trang Đề nghị TT để lập quỹ") });
          setQtOpen(false); resetQt();
        },
        onError: (e: unknown) => toast({ title: `${t("Lỗi")}: ${errMsg(e) || t("Không tạo được")}`, variant: "destructive" }),
      },
    );
  };

  const filters = useMemo(() => ({
    doanId: doanId ? Number(doanId) : null,
  }), [doanId]);

  const { data: allRowsRaw = [], isLoading } = useCongNoList(filters);
  const scope = useDoanScope();
  const allRows = useMemo(() => scope.filterByDoanId(allRowsRaw), [scope, allRowsRaw]);
  const { data: doanOpts = [] } = useDoanOptions();
  const changeStatusMut = useUpdateCongNoStatus();

  const handleChangeStatus = (id: number, current: string) => {
    const newStatus = current === "con_du" ? "da_hoan_tien" : "con_du";
    changeStatusMut.mutate({ id, trangThai: newStatus }, {
      onSuccess: () => toast({ title: newStatus === "da_hoan_tien" ? t("Đã chuyển sang Hoàn tiền") : t("Đã chuyển sang Công nợ") }),
      onError: (err: unknown) => toast({ title: `${t("Lỗi")}: ${errMsg(err) || t("Không thể đổi trạng thái")}`, variant: "destructive" }),
    });
  };

  const nccOpts = useMemo(() => {
    const seen = new Map<string, string>();
    allRows.forEach((r) => {
      if (r.nha_cung_cap_id != null && r.ten_ncc) {
        seen.set(String(r.nha_cung_cap_id), r.ten_ncc);
      }
    });
    return [...seen.entries()].map(([value, label]) => ({ value, label }));
  }, [allRows]);

  const rows = useMemo(() => {
    let filtered = allRows;
    if (trangThai !== "all") filtered = filtered.filter((r) => r.trang_thai === trangThai);
    if (loai !== "all") filtered = filtered.filter((r) => (r.loai ?? "phat_sinh") === loai);
    if (nccId) filtered = filtered.filter((r) => String(r.nha_cung_cap_id) === nccId);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      filtered = filtered.filter(
        (r) =>
          r.ten_doan?.toLowerCase().includes(q) ||
          r.ly_do?.toLowerCase().includes(q) ||
          r.ten_ncc?.toLowerCase().includes(q)
      );
    }
    return filtered;
  }, [allRows, trangThai, loai, nccId, search]);

  const metrics = useMemo(() => {
    const conDu = allRows.filter((r) => r.trang_thai === "con_du");
    const hoanTien = allRows.filter((r) => r.trang_thai === "da_hoan_tien");
    const daCanTru = allRows.filter((r) => r.trang_thai === "da_can_tru");
    const quyTraTruoc = conDu.filter((r) => r.loai === "tra_truoc");
    return {
      total: allRows.length,
      tongCongNo: conDu.reduce((s, r) => s + r.so_tien_con_lai, 0),
      tongHoanTien: hoanTien.reduce((s, r) => s + r.so_tien_goc, 0),
      tongQuyTraTruoc: quyTraTruoc.reduce((s, r) => s + r.so_tien_con_lai, 0),
      demCongNo: conDu.length,
      demHoanTien: hoanTien.length,
      demDaCanTru: daCanTru.length,
    };
  }, [allRows]);

  const doanSelectOpts = doanOpts.map((d) => ({
    value: String(d.id),
    label: d.ten_doan ?? "",
  }));

  const resetFilters = () => {
    setDoanId("");
    setTrangThai("all");
    setLoai("all");
    setNccId("");
    setSearch("");
  };

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">{t("Công nợ & Quỹ trả trước")}</h1>
          <p className="text-sm text-muted-foreground">
            {t("Khoản chi thừa/hủy + quỹ ứng trước cho NCC — dùng để cấn trừ dần vào booking sau.")}
          </p>
        </div>
        <Button size="sm" className="gap-1 shrink-0" onClick={() => setQtOpen(true)}>
          <Plus className="h-4 w-4" /> {t("Tạo quỹ trả trước")}
        </Button>
      </div>

      <div className="grid grid-cols-6 gap-4">
        {[
          { label: t("Tổng khoản"), value: metrics.total, cls: "text-foreground", isMoney: false },
          { label: t("Còn dư"), value: metrics.demCongNo, cls: "text-purple-600", isMoney: false },
          { label: t("Đã cấn trừ hết"), value: metrics.demDaCanTru, cls: "text-green-600", isMoney: false },
          { label: t("Tổng còn dư"), value: metrics.tongCongNo, cls: "text-purple-600", isMoney: true },
          { label: t("Quỹ trả trước còn"), value: metrics.tongQuyTraTruoc, cls: "text-amber-600", isMoney: true },
          { label: t("Tổng hoàn tiền"), value: metrics.tongHoanTien, cls: "text-blue-600", isMoney: true },
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

      <div className="flex flex-wrap items-end gap-3">
        <div className="w-56">
          <SearchableSelect
            options={doanSelectOpts}
            value={doanId}
            onChange={setDoanId}
            placeholder={t("Tất cả đoàn")}
            searchPlaceholder={t("Tìm đoàn...")}
          />
        </div>
        <Select value={trangThai} onValueChange={setTrangThai}>
          <SelectTrigger className="w-44">
            <span>{trangThai === "all" ? t("Tất cả") : trangThai === "con_du" ? t("Còn dư") : trangThai === "da_can_tru" ? t("Đã cấn trừ hết") : trangThai === "da_hoan_tien" ? t("Hoàn tiền") : t("Trạng thái")}</span>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("Tất cả")}</SelectItem>
            <SelectItem value="con_du">{t("Còn dư")}</SelectItem>
            <SelectItem value="da_can_tru">{t("Đã cấn trừ hết")}</SelectItem>
            <SelectItem value="da_hoan_tien">{t("Hoàn tiền")}</SelectItem>
          </SelectContent>
        </Select>
        <Select value={loai} onValueChange={setLoai}>
          <SelectTrigger className="w-40">
            <span>{loai === "all" ? t("Tất cả loại") : loai === "tra_truoc" ? t("Trả trước") : t("Phát sinh")}</span>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("Tất cả loại")}</SelectItem>
            <SelectItem value="tra_truoc">{t("Quỹ trả trước")}</SelectItem>
            <SelectItem value="phat_sinh">{t("Phát sinh (chi thừa/hủy)")}</SelectItem>
          </SelectContent>
        </Select>
        <div className="w-56">
          <SearchableSelect
            options={nccOpts}
            value={nccId}
            onChange={setNccId}
            placeholder={t("Tất cả nhà cung cấp")}
            searchPlaceholder={t("Tìm nhà cung cấp...")}
          />
        </div>
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-8 w-56"
            placeholder={t("Tìm đoàn, lý do, NCC...")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Button variant="ghost" size="sm" onClick={resetFilters} className="gap-1">
          <RotateCcw className="h-3.5 w-3.5" />
          {t("Đặt lại")}
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="text-xs">
                <TableHead className="py-2 px-3 w-[180px]">{t("Đoàn nguồn")}</TableHead>
                <TableHead className="py-2 px-3">{t("Lý do")}</TableHead>
                <TableHead className="py-2 px-3 w-[160px] text-right">{t("Còn lại / Gốc")}</TableHead>
                <TableHead className="py-2 px-3 w-[140px]">{t("Trạng thái")}</TableHead>
                <TableHead className="py-2 px-3 w-[180px]">{t("Nhà cung cấp")}</TableHead>
                <TableHead className="py-2 px-3 w-[220px]">{t("Ghi chú")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-muted-foreground text-sm">
                    {t("Đang tải...")}
                  </TableCell>
                </TableRow>
              ) : rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-muted-foreground text-sm">
                    {t("Không có khoản công nợ / hoàn tiền nào.")}
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((row) => {
                  const statusInfo = statusBadgeKeys[row.trang_thai];
                  const statusText = statusInfo ? t(statusInfo.textKey) : row.trang_thai;
                  const statusCls = statusInfo?.cls ?? "bg-muted text-muted-foreground";
                  return (
                    <TableRow
                      key={row.id}
                      className="text-sm cursor-pointer hover:bg-muted/40"
                      onClick={() => setDetailRow(row)}
                    >
                      <TableCell className="py-2 px-3">
                        <button
                          className="text-left hover:underline text-primary font-medium"
                          onClick={(e) => { e.stopPropagation(); row.doan_id && navigate(`/doan/${row.doan_id}`); }}
                        >
                          {row.ten_doan || (row.doan_id ? `${t("Đoàn")} #${row.doan_id}` : "—")}
                        </button>
                      </TableCell>
                      <TableCell className="py-2 px-3 text-muted-foreground">
                        {row.ly_do || "—"}
                      </TableCell>
                      <TableCell className="py-2 px-3 text-right">
                        <span className="font-semibold">{fmt(row.so_tien_con_lai)} ₫</span>
                        {row.so_tien_con_lai !== row.so_tien_goc && (
                          <div className="text-[10px] text-muted-foreground">{t("gốc")} {fmt(row.so_tien_goc)} ₫</div>
                        )}
                      </TableCell>
                      <TableCell className="py-2 px-3">
                        <div className="flex flex-col gap-1">
                          {row.loai === "tra_truoc" && (
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-medium w-fit bg-amber-100 text-amber-700">
                              {t("Quỹ trả trước")}
                            </span>
                          )}
                          <span className={cn("px-1.5 py-0.5 rounded text-[10px] font-medium w-fit", statusCls)}>
                            {statusText}
                          </span>
                          {((row.trang_thai === "con_du" && row.so_tien_con_lai > 0) || row.trang_thai === "da_hoan_tien") && (
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-6 px-2 text-[10px]"
                              disabled={changeStatusMut.isPending}
                              onClick={(e) => { e.stopPropagation(); handleChangeStatus(row.id, row.trang_thai); }}
                            >
                              {row.trang_thai === "con_du" ? `→ ${t("Hoàn tiền")}` : `→ ${t("Công nợ")}`}
                            </Button>
                          )}
                        </div>
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

      <Dialog open={qtOpen} onOpenChange={(o) => { setQtOpen(o); if (!o) resetQt(); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("Tạo quỹ trả trước")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              {t("Tạo ĐNTT trả trước cho NCC. Sau khi duyệt + chi tiền ở trang Đề nghị TT, hệ thống tự lập quỹ (công nợ còn dư) để cấn trừ dần cho các đoàn dùng dịch vụ.")}
            </p>
            <div>
              <Label className="text-xs">{t("Nhà cung cấp *")}</Label>
              <SearchableSelect
                options={qtNccOpts}
                value={qtNccId}
                onChange={setQtNccId}
                placeholder={t("Chọn nhà cung cấp...")}
                searchPlaceholder={t("Tìm NCC... (⭐ = đã đánh dấu trả trước)")}
              />
            </div>
            <div>
              <Label className="text-xs">{t("Số tiền ứng trước (VND) *")}</Label>
              <Input
                inputMode="numeric"
                value={qtSoTien ? Number(qtSoTien.replace(/\D/g, "")).toLocaleString("vi-VN") : ""}
                onChange={(e) => setQtSoTien(e.target.value)}
                placeholder="0"
                className="h-8 text-sm"
              />
            </div>
            <div>
              <Label className="text-xs">{t("Mô tả")}</Label>
              <Input
                value={qtMoTa}
                onChange={(e) => setQtMoTa(e.target.value)}
                placeholder={t("VD: Ứng trước vé tham quan quý 2")}
                className="h-8 text-sm"
              />
            </div>
            <div>
              <Label className="text-xs">{t("Ngày cần thanh toán")}</Label>
              <DatePicker value={qtNgay} onChange={(v) => setQtNgay(v || "")} className="h-8 text-sm w-full" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => { setQtOpen(false); resetQt(); }}>
              {t("Hủy")}
            </Button>
            <Button size="sm" onClick={handleCreatePrepaid} disabled={createPrepaid.isPending}>
              {createPrepaid.isPending ? t("Đang tạo...") : t("Tạo ĐNTT trả trước")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <CongNoDetailModal row={detailRow} onClose={() => setDetailRow(null)} />
    </div>
  );
}
