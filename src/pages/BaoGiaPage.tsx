import { useState } from "react";
import { format } from "date-fns";
import { vi } from "date-fns/locale";
import { Plus, Trash2, FileDown, Printer, FileText, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { BaoGiaUpload } from "@/components/bao-gia/BaoGiaUpload";
import { BaoGiaManual } from "@/components/bao-gia/BaoGiaManual";
import { BaoGiaResultTable } from "@/components/bao-gia/BaoGiaResultTable";
import { BangGiaImport } from "@/components/bao-gia/BangGiaImport";
import {
  useBaoGiaList,
  useCreateBaoGia,
  useUpdateBaoGia,
  useDeleteBaoGia,
  type BaoGiaKetQua,
  type BaoGiaRow,
} from "@/hooks/use-bao-gia";
import { useBangGiaDichVu } from "@/hooks/use-bang-gia-dich-vu";
import { exportBaoGiaWord } from "@/lib/export-bao-gia-word";
import { toast } from "sonner";
import { t, useTranslate } from "@/lib/i18n";

type ViewState =
  | { mode: "list" }
  | { mode: "new-result"; ketQua: BaoGiaKetQua; fileName: string; exchangeRate: number; profitUsd: number }
  | { mode: "view"; row: BaoGiaRow };

const fmt = (n: number) => Math.round(n).toLocaleString("vi-VN");
const fmtUsd = (n: number) => n.toFixed(2);

const LOAI_COLOR: Record<string, string> = {
  hotel: "bg-blue-100 text-blue-700",
  nha_hang: "bg-green-100 text-green-700",
  dich_vu: "bg-orange-100 text-orange-700",
};
// Label tiếng Việt = key i18n — bọc t() tại nơi render.
const LOAI_LABEL: Record<string, string> = {
  hotel: "Khách sạn",
  nha_hang: "Nhà hàng",
  dich_vu: "Dịch vụ",
};

export default function BaoGiaPage() {
  useTranslate();
  const { data: list = [], isLoading } = useBaoGiaList();
  const { data: bangGia = [] } = useBangGiaDichVu();
  const createMutation = useCreateBaoGia();
  const updateMutation = useUpdateBaoGia();
  const deleteMutation = useDeleteBaoGia();

  const [view, setView] = useState<ViewState>({ mode: "list" });
  const [showUpload, setShowUpload] = useState(false);
  const [showManual, setShowManual] = useState(false);

  // ── New result from AI ───────────────────────────────────────────────────
  const handleNewResult = (ketQua: BaoGiaKetQua, file: File, exchangeRate: number, profitUsd: number) => {
    setShowUpload(false);
    setView({ mode: "new-result", ketQua, fileName: file.name, exchangeRate, profitUsd });
  };

  const handleSave = async (trangThai: "draft" | "final") => {
    if (view.mode !== "new-result") return;
    const { ketQua, exchangeRate, profitUsd } = view;
    createMutation.mutate(
      { tieu_de: ketQua.ten_chuong_trinh, ket_qua: ketQua, exchange_rate: exchangeRate, profit_usd: profitUsd, trang_thai: trangThai },
      {
        onSuccess: () => { toast.success(trangThai === "final" ? t("Đã lưu chính thức!") : t("Đã lưu bản nháp!")); setView({ mode: "list" }); },
        onError: () => toast.error(t("Lỗi lưu báo giá")),
      }
    );
  };

  const handleFinalize = (row: BaoGiaRow) => {
    updateMutation.mutate({ id: row.id, trang_thai: "final" }, {
      onSuccess: () => toast.success(t("Đã lưu chính thức!")),
      onError: () => toast.error(t("Lỗi cập nhật")),
    });
  };

  const handleDelete = (id: number) => {
    deleteMutation.mutate(id, {
      onSuccess: () => toast.success(t("Đã xóa báo giá")),
      onError: () => toast.error(t("Lỗi xóa")),
    });
  };

  const handleExportWord = async (ketQua: BaoGiaKetQua, exchangeRate: number, profitUsd: number) => {
    try { await exportBaoGiaWord(ketQua, exchangeRate, profitUsd); toast.success(t("Đã xuất file Word!")); }
    catch { toast.error(t("Lỗi xuất Word")); }
  };

  // ── Detail view ──────────────────────────────────────────────────────────
  if (view.mode === "new-result" || view.mode === "view") {
    const ketQua = view.mode === "new-result" ? view.ketQua : view.row.ket_qua!;
    const exchangeRate = view.mode === "new-result" ? view.exchangeRate : (view.row.exchange_rate ?? 26000);
    const profitUsd = view.mode === "new-result" ? view.profitUsd : (view.row.profit_usd ?? 0);
    const isNew = view.mode === "new-result";

    return (
      <div className="p-4 max-w-5xl mx-auto space-y-4">
        <div className="flex items-center justify-between no-print">
          <Button variant="ghost" size="sm" onClick={() => setView({ mode: "list" })}>{t("← Quay lại danh sách")}</Button>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => handleExportWord(ketQua, exchangeRate, profitUsd)}>
              <FileDown className="h-4 w-4 mr-1" />{t("Export Word")}
            </Button>
            <Button variant="outline" size="sm" onClick={() => window.print()}>
              <Printer className="h-4 w-4 mr-1" />{t("In / PDF")}
            </Button>
            {isNew && (
              <>
                <Button variant="outline" size="sm" onClick={() => handleSave("draft")} disabled={createMutation.isPending}>{t("Lưu nháp")}</Button>
                <Button size="sm" onClick={() => handleSave("final")} disabled={createMutation.isPending}>{t("Lưu chính thức")}</Button>
              </>
            )}
            {view.mode === "view" && view.row.trang_thai === "draft" && (
              <Button size="sm" onClick={() => handleFinalize(view.row)}>{t("Lưu chính thức")}</Button>
            )}
          </div>
        </div>
        <div className="border rounded-lg p-4 print:border-0">
          <BaoGiaResultTable ketQua={ketQua} />
        </div>
        <style>{`@media print { .no-print { display: none !important; } }`}</style>
      </div>
    );
  }

  // ── List + Management tabs ────────────────────────────────────────────────
  return (
    <div className="p-4 max-w-5xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold">{t("Báo Giá Tour")}</h1>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setShowManual(true)}>
            <Plus className="h-4 w-4 mr-1" />{t("Thủ công")}
          </Button>
          <Button size="sm" onClick={() => setShowUpload(true)}>
            <Plus className="h-4 w-4 mr-1" />{t("Tự động (từ file)")}
          </Button>
        </div>
      </div>

      <Dialog open={showUpload} onOpenChange={setShowUpload}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{t("Tạo báo giá từ file chương trình")}</DialogTitle>
          </DialogHeader>
          {bangGia.length === 0 && (
            <div className="text-xs bg-orange-50 border border-orange-200 rounded p-2 text-orange-700">
              {t('⚠ Chưa có bảng giá nội bộ. Vui lòng import bảng giá trước (tab "Bảng Giá") để AI tra cứu đúng giá.')}
            </div>
          )}
          <BaoGiaUpload onResult={handleNewResult} />
        </DialogContent>
      </Dialog>

      <Dialog open={showManual} onOpenChange={setShowManual}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t("Báo giá thủ công")}</DialogTitle>
          </DialogHeader>
          <BaoGiaManual
            onSave={(ketQua, exchangeRate, profitUsd, trangThai) => {
              createMutation.mutate(
                { tieu_de: ketQua.ten_chuong_trinh, ket_qua: ketQua, exchange_rate: exchangeRate, profit_usd: profitUsd, trang_thai: trangThai },
                {
                  onSuccess: () => {
                    toast.success(trangThai === "final" ? t("Đã lưu chính thức!") : t("Đã lưu bản nháp!"));
                    setShowManual(false);
                    setView({ mode: "list" });
                  },
                  onError: () => toast.error(t("Lỗi lưu báo giá")),
                }
              );
            }}
          />
        </DialogContent>
      </Dialog>

      <Tabs defaultValue="bao-gia">
        <TabsList>
          <TabsTrigger value="bao-gia">
            <FileText className="h-4 w-4 mr-1" />{t("Danh sách báo giá")}
            {list.length > 0 && <span className="ml-1.5 text-[10px] bg-primary/10 text-primary rounded-full px-1.5">{list.length}</span>}
          </TabsTrigger>
          <TabsTrigger value="bang-gia">
            <Settings className="h-4 w-4 mr-1" />{t("Bảng Giá")}
            {bangGia.length > 0 && <span className="ml-1.5 text-[10px] bg-primary/10 text-primary rounded-full px-1.5">{bangGia.length}</span>}
          </TabsTrigger>
        </TabsList>

        {/* ── Tab: Danh sách báo giá ─────────────────────────────────── */}
        <TabsContent value="bao-gia" className="mt-3">
          {isLoading ? (
            <p className="text-sm text-muted-foreground">{t("Đang tải...")}</p>
          ) : list.length === 0 ? (
            <div className="border-2 border-dashed rounded-lg p-12 text-center">
              <FileText className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
              <p className="text-sm font-medium">{t("Chưa có báo giá nào")}</p>
              <p className="text-xs text-muted-foreground mt-1">{t('Nhấn "Tạo báo giá mới" để bắt đầu')}</p>
            </div>
          ) : (
            <div className="border rounded-lg overflow-hidden">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-[#E6F1FB]">
                    <th className="py-2 px-3 text-left font-semibold">{t("Tên chương trình")}</th>
                    <th className="py-2 px-3 text-right font-semibold">{t("Giá TB (VND)")}</th>
                    <th className="py-2 px-3 text-right font-semibold">{t("Giá TB (USD)")}</th>
                    <th className="py-2 px-3 text-center font-semibold">{t("Trạng thái")}</th>
                    <th className="py-2 px-3 text-right font-semibold">{t("Ngày tạo")}</th>
                    <th className="py-2 px-3 text-center font-semibold">{t("Thao tác")}</th>
                  </tr>
                </thead>
                <tbody>
                  {list.map((row) => {
                    const kq = row.ket_qua;
                    return (
                      <tr key={row.id} className="border-t hover:bg-muted/20 cursor-pointer" onClick={() => setView({ mode: "view", row })}>
                        <td className="py-2 px-3">
                          <span className="font-medium">{row.tieu_de || t("(chưa có tên)")}</span>
                          {kq && <span className="ml-2 text-muted-foreground">{kq.so_ngay} {t("ngày")}</span>}
                        </td>
                        <td className="py-2 px-3 text-right font-medium text-blue-700">{kq ? fmt(kq.gia_trung_binh_vnd) : "—"}</td>
                        <td className="py-2 px-3 text-right text-blue-700">{kq ? fmtUsd(kq.gia_trung_binh_usd) : "—"}</td>
                        <td className="py-2 px-3 text-center">
                          <Badge variant={row.trang_thai === "final" ? "default" : "secondary"}>
                            {row.trang_thai === "final" ? t("Chính thức") : t("Nháp")}
                          </Badge>
                        </td>
                        <td className="py-2 px-3 text-right text-muted-foreground">
                          {format(new Date(row.created_at), "dd/MM/yyyy HH:mm", { locale: vi })}
                        </td>
                        <td className="py-2 px-3 text-center" onClick={(e) => e.stopPropagation()}>
                          <div className="flex gap-1 justify-center">
                            {kq && (
                              <Button variant="ghost" size="icon" className="h-6 w-6" title={t("Export Word")}
                                onClick={() => handleExportWord(kq, row.exchange_rate ?? 26000, row.profit_usd ?? 0)}>
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
                                  <AlertDialogTitle>{t("Xóa báo giá?")}</AlertDialogTitle>
                                  <AlertDialogDescription>{t("Hành động này không thể hoàn tác.")}</AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>{t("Hủy")}</AlertDialogCancel>
                                  <AlertDialogAction onClick={() => handleDelete(row.id)}>{t("Xóa")}</AlertDialogAction>
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
                {t("Bảng giá hiện tại: ")}<strong>{bangGia.length}</strong>{t(" dịch vụ")}
                <span className="ml-3">
                  {" "}({t("KS")}: {bangGia.filter((r) => r.loai === "hotel").length}
                  {" • "}{t("Ăn uống")}: {bangGia.filter((r) => r.loai === "nha_hang").length}
                  {" • "}{t("Dịch vụ")}: {bangGia.filter((r) => r.loai === "dich_vu").length})
                </span>
              </p>
              <div className="border rounded-lg overflow-hidden max-h-96 overflow-y-auto">
                <table className="w-full text-xs">
                  <thead className="bg-[#E6F1FB] sticky top-0">
                    <tr>
                      <th className="py-1.5 px-2 text-left font-semibold">{t("Tên dịch vụ")}</th>
                      <th className="py-1.5 px-2 text-center font-semibold">{t("Loại")}</th>
                      <th className="py-1.5 px-2 text-right font-semibold">{t("Giá (VND)")}</th>
                      <th className="py-1.5 px-2 text-center font-semibold">{t("FOC")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bangGia.map((row) => (
                      <tr key={row.id} className="border-t hover:bg-muted/20">
                        <td className="py-1 px-2">{row.ten}</td>
                        <td className="py-1 px-2 text-center">
                          <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${LOAI_COLOR[row.loai] ?? ""}`}>
                            {t(LOAI_LABEL[row.loai] ?? row.loai)}
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
