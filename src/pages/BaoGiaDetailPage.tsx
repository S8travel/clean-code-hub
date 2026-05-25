import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { useBaoGia } from "@/hooks/use-bao-gia";
import { exportBaoGiaWord } from "@/lib/export-bao-gia-word";
import { BaoGiaHeader } from "@/components/bao-gia/detail/BaoGiaHeader";
import { ThongTinTourSection } from "@/components/bao-gia/detail/ThongTinTourSection";
import { ChuongTrinhTourSection } from "@/components/bao-gia/detail/ChuongTrinhTourSection";
import { TongHopChiPhiPanel } from "@/components/bao-gia/detail/TongHopChiPhiPanel";
import { BaoGiaFooter } from "@/components/bao-gia/detail/BaoGiaFooter";

// Trang chi tiết Báo giá theo layout mới (P1 shell — wire current ket_qua
// jsonb shape, chưa đụng schema). Sub-actions (Lưu nháp / Gửi khách hàng /
// Tạo booking) hiện toast placeholder cho đến khi P2 wire DB.
export default function BaoGiaDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const bgId = Number(id);
  const { data: row, isLoading, error } = useBaoGia(bgId);

  if (isLoading) {
    return (
      <div className="p-8 text-center text-sm text-muted-foreground">
        Đang tải báo giá...
      </div>
    );
  }
  if (error || !row || !row.ket_qua) {
    return (
      <div className="p-8 text-center">
        <p className="text-sm text-muted-foreground mb-3">
          Không tìm thấy báo giá hoặc dữ liệu bị thiếu.
        </p>
        <button
          onClick={() => navigate("/bao-gia")}
          className="text-sm text-blue-600 hover:underline"
        >
          ← Quay lại danh sách
        </button>
      </div>
    );
  }

  const handleExportPdf = async () => {
    try {
      await exportBaoGiaWord(row.ket_qua!, row.exchange_rate ?? 26000, row.profit_usd ?? 0);
      toast.success("Đã xuất file Word!");
    } catch {
      toast.error("Lỗi xuất file");
    }
  };
  const todo = (label: string) => toast.info(`${label}: tính năng đang phát triển (P2)`);

  return (
    <div className="flex flex-col min-h-[calc(100vh-3rem)] bg-slate-50">
      <BaoGiaHeader
        row={row}
        onSaveDraft={() => todo("Lưu nháp")}
        onExportPdf={handleExportPdf}
        onSendCustomer={() => todo("Gửi khách hàng")}
      />
      <div className="flex-1 px-4 py-4">
        <div className="max-w-[1400px] mx-auto grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_300px] gap-4">
          <div className="space-y-4 min-w-0">
            <ThongTinTourSection row={row} />
            <ChuongTrinhTourSection row={row} />
          </div>
          <TongHopChiPhiPanel row={row} />
        </div>
      </div>
      <BaoGiaFooter
        onSaveDraft={() => todo("Lưu nháp")}
        onCreateBooking={() => todo("Tạo booking")}
        onExportPdf={handleExportPdf}
      />
    </div>
  );
}
