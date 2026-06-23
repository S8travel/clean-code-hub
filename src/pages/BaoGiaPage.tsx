import { useNavigate } from "react-router-dom";
import { format } from "date-fns";
import { vi } from "date-fns/locale";
import { Plus, Trash2, FileDown, FileText, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { BangGiaImport } from "@/components/bao-gia/BangGiaImport";
import {
  useBaoGiaList,
  useCreateBaoGia,
  useDeleteBaoGia,
  type BaoGiaCase,
  type BaoGiaKetQua,
} from "@/hooks/use-bao-gia";
import { useBangGiaDichVu } from "@/hooks/use-bang-gia-dich-vu";
import { useLeadsList } from "@/hooks/use-leads";
import { exportBaoGiaWord } from "@/lib/export-bao-gia-word";
import { costBreakdown, liveKetQua, defaultDayItems } from "@/components/bao-gia/detail/helpers";
import { toast } from "sonner";

const fmt = (n: number) => Math.round(n).toLocaleString("vi-VN");
const fmtUsd = (n: number) => n.toFixed(2);

const LOAI_COLOR: Record<string, string> = {
  hotel: "bg-blue-100 text-blue-700",
  nha_hang: "bg-green-100 text-green-700",
  xe: "bg-cyan-100 text-cyan-700",
  dich_vu: "bg-orange-100 text-orange-700",
};
const LOAI_LABEL: Record<string, string> = {
  hotel: "Khách sạn",
  nha_hang: "Nhà hàng",
  xe: "Xe",
  dich_vu: "Dịch vụ",
};

// Skeleton BaoGiaKetQua trống cho báo giá vừa tạo — user điền tại detail page.
function emptyCase(guests: number): BaoGiaCase {
  return {
    guests,
    pax: 0, rooms: 0,
    hotel: 0, meal: 0, ticket: 0, transport: 0,
    insurance: 0, guide: 0, tips: 0,
    total_cost: 0, profit_vnd: 0,
    final_price_vnd: 0, final_price_usd: 0,
  };
}
function emptyKetQua(): BaoGiaKetQua {
  return {
    ten_chuong_trinh: "",
    so_ngay: 1,
    items: defaultDayItems(1),
    case_16: emptyCase(16),
    case_20: emptyCase(20),
    gia_trung_binh_vnd: 0,
    gia_trung_binh_usd: 0,
  };
}

export default function BaoGiaPage() {
  const navigate = useNavigate();
  const { data: list = [], isLoading } = useBaoGiaList();
  const { data: bangGia = [] } = useBangGiaDichVu();
  const { data: leads = [] } = useLeadsList();
  const createMutation = useCreateBaoGia();
  const deleteMutation = useDeleteBaoGia();

  // Map lead_id → tên khách (hiển thị cột "Khách" trong list báo giá).
  const leadName: Record<number, string> = {};
  leads.forEach((l) => { leadName[l.id] = l.ho_ten; });

  const handleCreate = () => {
    createMutation.mutate(
      {
        tieu_de: "",
        ket_qua: emptyKetQua(),
        exchange_rate: 26000,
        profit_usd: 15,
        trang_thai: "draft",
      },
      {
        onSuccess: ({ id }) => navigate(`/bao-gia/${id}`),
        onError: () => toast.error("Lỗi tạo báo giá"),
      },
    );
  };

  const handleDelete = (id: number) => {
    deleteMutation.mutate(id, {
      onSuccess: () => toast.success("Đã xóa báo giá"),
      onError: () => toast.error("Lỗi xóa"),
    });
  };

  const handleExportWord = async (ketQua: BaoGiaKetQua, exchangeRate: number, profitUsd: number) => {
    try { await exportBaoGiaWord(ketQua, exchangeRate, profitUsd); toast.success("Đã xuất file Word!"); }
    catch { toast.error("Lỗi xuất Word"); }
  };

  return (
    <div className="p-4 max-w-5xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold">Báo Giá Tour</h1>
        <Button size="sm" onClick={handleCreate} disabled={createMutation.isPending}>
          <Plus className="h-4 w-4 mr-1" />Tạo báo giá
        </Button>
      </div>

      <Tabs defaultValue="bao-gia">
        <TabsList>
          <TabsTrigger value="bao-gia">
            <FileText className="h-4 w-4 mr-1" />Danh sách báo giá
            {list.length > 0 && <span className="ml-1.5 text-[10px] bg-primary/10 text-primary rounded-full px-1.5">{list.length}</span>}
          </TabsTrigger>
          <TabsTrigger value="bang-gia">
            <Settings className="h-4 w-4 mr-1" />Bảng Giá
            {bangGia.length > 0 && <span className="ml-1.5 text-[10px] bg-primary/10 text-primary rounded-full px-1.5">{bangGia.length}</span>}
          </TabsTrigger>
        </TabsList>

        {/* ── Tab: Danh sách báo giá ─────────────────────────────────── */}
        <TabsContent value="bao-gia" className="mt-3">
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Đang tải...</p>
          ) : list.length === 0 ? (
            <div className="border-2 border-dashed rounded-lg p-12 text-center">
              <FileText className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
              <p className="text-sm font-medium">Chưa có báo giá nào</p>
              <p className="text-xs text-muted-foreground mt-1">Nhấn "Tạo báo giá" để bắt đầu</p>
            </div>
          ) : (
            <div className="border rounded-lg overflow-hidden">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-[#E6F1FB]">
                    <th className="py-2 px-3 text-left font-semibold">Tên chương trình</th>
                    <th className="py-2 px-3 text-left font-semibold">Khách (Lead)</th>
                    <th className="py-2 px-3 text-right font-semibold">Giá TB / pax (VND)</th>
                    <th className="py-2 px-3 text-right font-semibold">Giá TB / pax (USD)</th>
                    <th className="py-2 px-3 text-center font-semibold">Trạng thái</th>
                    <th className="py-2 px-3 text-right font-semibold">Ngày tạo</th>
                    <th className="py-2 px-3 text-center font-semibold">Thao tác</th>
                  </tr>
                </thead>
                <tbody>
                  {list.map((row) => {
                    // Live recompute giá TB 2 phương án (16+20 khách) — match
                    // DETAIL panel "GIÁ BÁN TOUR (TB 2 phương án)", KHÔNG đọc
                    // gia_trung_binh frozen từ AI extract.
                    const xr = row.exchange_rate ?? 26000;
                    const breakdown = costBreakdown({
                      ket: row.ket_qua,
                      exchangeRate: xr,
                      profitUsd: row.profit_usd ?? 0,
                      xeGia: row.xe_gia,
                      phuThu: row.phu_thu,
                      vcbRate: row.vcb_rate,
                    });
                    const giaPaxVnd = breakdown?.gia_ban_tb_per_pax ?? null;
                    const giaPaxUsd = breakdown?.gia_ban_tb_per_pax_usd ?? null;
                    return (
                      <tr key={row.id} className="border-t hover:bg-muted/20 cursor-pointer" onClick={() => navigate(`/bao-gia/${row.id}`)}>
                        <td className="py-2 px-3">
                          <span className="font-medium">{row.tieu_de || "(chưa có tên)"}</span>
                          {row.ket_qua && <span className="ml-2 text-muted-foreground">{row.ket_qua.so_ngay} ngày</span>}
                        </td>
                        <td className="py-2 px-3 text-muted-foreground">
                          {row.lead_id != null ? (leadName[row.lead_id] ?? `Lead #${row.lead_id}`) : "—"}
                        </td>
                        <td className="py-2 px-3 text-right font-medium text-blue-700">{giaPaxVnd != null ? fmt(giaPaxVnd) : "—"}</td>
                        <td className="py-2 px-3 text-right text-blue-700">{giaPaxUsd != null ? fmtUsd(giaPaxUsd) : "—"}</td>
                        <td className="py-2 px-3 text-center">
                          <Badge variant={row.trang_thai === "final" ? "default" : "secondary"}>
                            {row.trang_thai === "final" ? "Chính thức" : "Nháp"}
                          </Badge>
                        </td>
                        <td className="py-2 px-3 text-right text-muted-foreground">
                          {format(new Date(row.created_at), "dd/MM/yyyy HH:mm", { locale: vi })}
                        </td>
                        <td className="py-2 px-3 text-center" onClick={(e) => e.stopPropagation()}>
                          <div className="flex gap-1 justify-center">
                            {row.ket_qua && (
                              <Button variant="ghost" size="icon" className="h-6 w-6" title="Export Word"
                                onClick={() => {
                                  // Export với ket_qua live (case totals recompute) — match DETAIL
                                  const fresh = liveKetQua(row) ?? row.ket_qua;
                                  if (fresh) handleExportWord(fresh, row.exchange_rate ?? 26000, row.profit_usd ?? 0);
                                }}>
                                <FileDown className="h-3.5 w-3.5" />
                              </Button>
                            )}
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive hover:text-destructive">
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Xóa báo giá?</AlertDialogTitle>
                                  <AlertDialogDescription>Hành động này không thể hoàn tác.</AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Hủy</AlertDialogCancel>
                                  <AlertDialogAction onClick={() => handleDelete(row.id)}>Xóa</AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </TabsContent>

        {/* ── Tab: Bảng Giá ─────────────────────────────────────────── */}
        <TabsContent value="bang-gia" className="mt-3 space-y-4">
          <BangGiaImport />

          {bangGia.length > 0 && (
            <div>
              <p className="text-xs text-muted-foreground mb-2">
                Bảng giá hiện tại: <strong>{bangGia.length}</strong> dịch vụ
                <span className="ml-3">
                  (KS: {bangGia.filter(r => r.loai === "hotel").length} •
                  Ăn uống: {bangGia.filter(r => r.loai === "nha_hang").length} •
                  Xe: {bangGia.filter(r => r.loai === "xe").length} •
                  Dịch vụ: {bangGia.filter(r => r.loai === "dich_vu").length})
                </span>
              </p>
              <div className="border rounded-lg overflow-hidden max-h-96 overflow-y-auto">
                <table className="w-full text-xs">
                  <thead className="bg-[#E6F1FB] sticky top-0">
                    <tr>
                      <th className="py-1.5 px-2 text-left font-semibold">Tên dịch vụ</th>
                      <th className="py-1.5 px-2 text-center font-semibold">Loại</th>
                      <th className="py-1.5 px-2 text-right font-semibold">Giá (VND)</th>
                      <th className="py-1.5 px-2 text-center font-semibold">FOC</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bangGia.map((row) => (
                      <tr key={row.id} className="border-t hover:bg-muted/20">
                        <td className="py-1 px-2">{row.ten}</td>
                        <td className="py-1 px-2 text-center">
                          <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${LOAI_COLOR[row.loai] ?? ""}`}>
                            {LOAI_LABEL[row.loai] ?? row.loai}
                          </span>
                        </td>
                        <td className="py-1 px-2 text-right font-mono">
                          {row.gia ? row.gia.toLocaleString("vi-VN") : "—"}
                        </td>
                        <td className="py-1 px-2 text-center text-muted-foreground">{row.foc || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
