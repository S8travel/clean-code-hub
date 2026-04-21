import { useState } from "react";
import { format } from "date-fns";
import { vi } from "date-fns/locale";
import { Plus, Trash2, FileDown, Printer, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
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
import { BaoGiaResultTable } from "@/components/bao-gia/BaoGiaResultTable";
import {
  useBaoGiaList,
  useCreateBaoGia,
  useUpdateBaoGia,
  useDeleteBaoGia,
  type BaoGiaKetQua,
  type BaoGiaRow,
} from "@/hooks/use-bao-gia";
import { exportBaoGiaWord } from "@/lib/export-bao-gia-word";
import { toast } from "sonner";

type ViewState =
  | { mode: "list" }
  | { mode: "new-result"; ketQua: BaoGiaKetQua; fileName: string; exchangeRate: number; profitUsd: number }
  | { mode: "view"; row: BaoGiaRow };

const fmt = (n: number) => Math.round(n).toLocaleString("vi-VN");
const fmtUsd = (n: number) => n.toFixed(2);

export default function BaoGiaPage() {
  const { data: list = [], isLoading } = useBaoGiaList();
  const createMutation = useCreateBaoGia();
  const updateMutation = useUpdateBaoGia();
  const deleteMutation = useDeleteBaoGia();

  const [view, setView] = useState<ViewState>({ mode: "list" });
  const [showUpload, setShowUpload] = useState(false);

  // ── New result from AI ───────────────────────────────────────────────────
  const handleNewResult = (ketQua: BaoGiaKetQua, file: File, exchangeRate: number, profitUsd: number) => {
    setShowUpload(false);
    setView({ mode: "new-result", ketQua, fileName: file.name, exchangeRate, profitUsd });
  };

  const handleSave = async (trangThai: "draft" | "final") => {
    if (view.mode !== "new-result") return;
    const { ketQua, exchangeRate, profitUsd } = view;
    createMutation.mutate(
      {
        tieu_de: ketQua.ten_chuong_trinh,
        ket_qua: ketQua as any,
        exchange_rate: exchangeRate,
        profit_usd: profitUsd,
        trang_thai: trangThai,
      },
      {
        onSuccess: () => {
          toast.success(trangThai === "final" ? "Đã lưu chính thức!" : "Đã lưu bản nháp!");
          setView({ mode: "list" });
        },
        onError: () => toast.error("Lỗi lưu báo giá"),
      }
    );
  };

  const handleFinalize = (row: BaoGiaRow) => {
    updateMutation.mutate(
      { id: row.id, trang_thai: "final" },
      {
        onSuccess: () => toast.success("Đã lưu chính thức!"),
        onError: () => toast.error("Lỗi cập nhật"),
      }
    );
  };

  const handleDelete = (id: number) => {
    deleteMutation.mutate(id, {
      onSuccess: () => toast.success("Đã xóa báo giá"),
      onError: () => toast.error("Lỗi xóa"),
    });
  };

  const handleExportWord = async (ketQua: BaoGiaKetQua, exchangeRate: number, profitUsd: number) => {
    try {
      await exportBaoGiaWord(ketQua, exchangeRate, profitUsd);
      toast.success("Đã xuất file Word!");
    } catch {
      toast.error("Lỗi xuất Word");
    }
  };

  const handlePrint = () => window.print();

  // ── Render ────────────────────────────────────────────────────────────────
  if (view.mode === "new-result" || view.mode === "view") {
    const ketQua = view.mode === "new-result" ? view.ketQua : view.row.ket_qua!;
    const exchangeRate = view.mode === "new-result" ? view.exchangeRate : (view.row.exchange_rate ?? 26000);
    const profitUsd = view.mode === "new-result" ? view.profitUsd : (view.row.profit_usd ?? 0);
    const isNew = view.mode === "new-result";
    const isSaving = createMutation.isPending;

    return (
      <div className="p-4 max-w-5xl mx-auto space-y-4">
        {/* Toolbar */}
        <div className="flex items-center justify-between">
          <Button variant="ghost" size="sm" onClick={() => setView({ mode: "list" })}>
            ← Quay lại danh sách
          </Button>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleExportWord(ketQua, exchangeRate, profitUsd)}
            >
              <FileDown className="h-4 w-4 mr-1" />
              Export Word
            </Button>
            <Button variant="outline" size="sm" onClick={handlePrint}>
              <Printer className="h-4 w-4 mr-1" />
              In / PDF
            </Button>
            {isNew && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleSave("draft")}
                  disabled={isSaving}
                >
                  Lưu nháp
                </Button>
                <Button
                  size="sm"
                  onClick={() => handleSave("final")}
                  disabled={isSaving}
                >
                  Lưu chính thức
                </Button>
              </>
            )}
            {view.mode === "view" && view.row.trang_thai === "draft" && (
              <Button size="sm" onClick={() => handleFinalize(view.row)}>
                Lưu chính thức
              </Button>
            )}
          </div>
        </div>

        {/* Result */}
        <div className="border rounded-lg p-4 print:border-0">
          <BaoGiaResultTable ketQua={ketQua} />
        </div>

        <style>{`@media print { .no-print { display: none !important; } }`}</style>
      </div>
    );
  }

  // ── List view ─────────────────────────────────────────────────────────────
  return (
    <div className="p-4 max-w-5xl mx-auto space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold">Báo Giá Tour</h1>
        <Button size="sm" onClick={() => setShowUpload(true)}>
          <Plus className="h-4 w-4 mr-1" />
          Tạo báo giá mới
        </Button>
      </div>

      {/* Upload Dialog */}
      <Dialog open={showUpload} onOpenChange={setShowUpload}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Tạo báo giá từ file chương trình</DialogTitle>
          </DialogHeader>
          <BaoGiaUpload onResult={handleNewResult} />
        </DialogContent>
      </Dialog>

      {/* List */}
      {isLoading ? (
        <p className="text-sm text-muted-foreground">Đang tải...</p>
      ) : list.length === 0 ? (
        <div className="border-2 border-dashed rounded-lg p-12 text-center">
          <FileText className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
          <p className="text-sm font-medium">Chưa có báo giá nào</p>
          <p className="text-xs text-muted-foreground mt-1">Nhấn "Tạo báo giá mới" để bắt đầu</p>
        </div>
      ) : (
        <div className="border rounded-lg overflow-hidden">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-[#E6F1FB]">
                <th className="py-2 px-3 text-left font-semibold">Tên chương trình</th>
                <th className="py-2 px-3 text-right font-semibold">Giá TB (VND)</th>
                <th className="py-2 px-3 text-right font-semibold">Giá TB (USD)</th>
                <th className="py-2 px-3 text-center font-semibold">Trạng thái</th>
                <th className="py-2 px-3 text-right font-semibold">Ngày tạo</th>
                <th className="py-2 px-3 text-center font-semibold">Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {list.map((row) => {
                const kq = row.ket_qua;
                return (
                  <tr
                    key={row.id}
                    className="border-t hover:bg-muted/20 cursor-pointer"
                    onClick={() => setView({ mode: "view", row })}
                  >
                    <td className="py-2 px-3">
                      <span className="font-medium">{row.tieu_de || "(chưa có tên)"}</span>
                      {kq && (
                        <span className="ml-2 text-muted-foreground">{kq.so_ngay} ngày</span>
                      )}
                    </td>
                    <td className="py-2 px-3 text-right font-medium text-blue-700">
                      {kq ? fmt(kq.gia_trung_binh_vnd) : "—"}
                    </td>
                    <td className="py-2 px-3 text-right text-blue-700">
                      {kq ? fmtUsd(kq.gia_trung_binh_usd) : "—"}
                    </td>
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
                        {kq && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6"
                            title="Export Word"
                            onClick={() => handleExportWord(kq, row.exchange_rate ?? 26000, row.profit_usd ?? 0)}
                          >
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
                              <AlertDialogDescription>
                                Hành động này không thể hoàn tác.
                              </AlertDialogDescription>
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
    </div>
  );
}
