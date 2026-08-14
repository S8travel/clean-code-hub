import { useRef, useState } from "react";
import { Upload, Loader2, CheckCircle, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  useImportBangGia, parsePricingFile, parseExcelFile,
  type ParsedBangGia,
} from "@/hooks/use-bang-gia-dich-vu";
import { toast } from "sonner";

const LOAI_LABEL: Record<string, string> = {
  hotel: "Khách sạn",
  nha_hang: "Nhà hàng / DV ăn uống",
  xe: "Xe / Vận chuyển",
  dich_vu: "Dịch vụ khác",
};

const LOAI_COLOR: Record<string, string> = {
  hotel: "bg-blue-100 text-blue-700",
  nha_hang: "bg-green-100 text-green-700",
  xe: "bg-cyan-100 text-cyan-700",
  dich_vu: "bg-orange-100 text-orange-700",
};

export function BangGiaImport() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<ParsedBangGia | null>(null);
  const [dragging, setDragging] = useState(false);
  const { mutate: importRows, isPending } = useImportBangGia();

  const handleFile = (file: File) => {
    const isExcel = /\.(xlsx|xls)$/i.test(file.name);
    const reader = new FileReader();
    if (isExcel) {
      reader.onload = (e) => {
        const parsed = parseExcelFile(e.target?.result as ArrayBuffer);
        setPreview(parsed);
        if (parsed.skippedBadPrice > 0) {
          toast.warning(`Bỏ qua ${parsed.skippedBadPrice} dòng do giá không hợp lệ (>10 tỷ hoặc cell lỗi)`);
        }
      };
      reader.readAsArrayBuffer(file);
    } else {
      reader.onload = (e) => {
        const parsed = parsePricingFile(e.target?.result as string);
        setPreview(parsed);
        if (parsed.skippedBadPrice > 0) {
          toast.warning(`Bỏ qua ${parsed.skippedBadPrice} dòng do giá không hợp lệ`);
        }
      };
      reader.readAsText(file, "utf-8");
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) handleFile(f);
  };

  const handleImport = () => {
    if (!preview) return;
    importRows(preview.rows, {
      onSuccess: (count) => {
        toast.success(`Đã import ${count} dịch vụ vào bảng giá!`);
        setPreview(null);
      },
      onError: (err) => toast.error(err.message ?? "Lỗi import"),
    });
  };

  const stats = preview
    ? {
        hotel: preview.rows.filter((r) => r.loai === "hotel").length,
        nha_hang: preview.rows.filter((r) => r.loai === "nha_hang").length,
        xe: preview.rows.filter((r) => r.loai === "xe").length,
        dich_vu: preview.rows.filter((r) => r.loai === "dich_vu").length,
      }
    : null;

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        Upload file bảng giá định dạng <span className="font-medium text-foreground">Excel (.xlsx)</span> hoặc .txt/.tsv phân cách Tab. Hệ thống tự phân tích và lưu vào database.
        <br />
        <span className="font-medium text-foreground">Excel:</span> 1 sheet, hàng 1 là tiêu đề, cột: <span className="font-medium text-foreground">Loại | Tên | FOC | Giá</span> (Loại: KS / NH / XE / DV).
        <br />
        <span className="font-medium text-foreground">Lưu ý:</span> Import mới sẽ thay thế <span className="font-medium text-foreground">toàn bộ</span> bảng giá hiện tại — kể cả những dòng vừa sửa hoặc thêm tay ở bảng bên dưới.
      </p>

      {!preview ? (
        <div
          className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors
            ${dragging ? "border-blue-400 bg-blue-50" : "border-border hover:border-blue-300 hover:bg-muted/30"}`}
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
        >
          <input
            ref={inputRef}
            type="file"
            accept=".xlsx,.xls,.txt,.tsv,.csv"
            className="hidden"
            onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
          />
          <Upload className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
          <p className="text-sm font-medium">Kéo thả hoặc nhấn để chọn file bảng giá</p>
          <p className="text-xs text-muted-foreground mt-1">Excel (.xlsx) hoặc file .txt/.tsv phân cách Tab</p>
        </div>
      ) : (
        <div className="space-y-3">
          {/* Stats */}
          <div className="flex gap-3 flex-wrap">
            {stats && Object.entries(stats).map(([loai, count]) => (
              <div key={loai} className="flex items-center gap-1.5">
                <span className={`px-2 py-0.5 rounded text-[11px] font-medium ${LOAI_COLOR[loai]}`}>
                  {LOAI_LABEL[loai]}
                </span>
                <span className="text-xs font-semibold">{count} mục</span>
              </div>
            ))}
            <span className="text-xs text-muted-foreground ml-auto">
              Tổng: <strong>{preview.rows.length}</strong> dịch vụ
            </span>
          </div>

          {/* Skipped warning */}
          {preview.skippedBadPrice > 0 && (
            <div className="flex items-center gap-2 px-3 py-2 rounded bg-amber-50 border border-amber-200 text-amber-800 text-xs">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span>
                Bỏ qua <strong>{preview.skippedBadPrice}</strong> dòng do giá không hợp lệ
                (giá &gt; 10 tỷ VND/dòng hoặc cell chứa nhiều giá trị nối nhau).
                Kiểm tra lại file gốc nếu cần.
              </span>
            </div>
          )}

          {/* Preview table */}
          <div className="border rounded max-h-64 overflow-y-auto">
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
                {preview.rows.map((row, i) => (
                  <tr key={i} className="border-t hover:bg-muted/20">
                    <td className="py-1 px-2">{row.ten}</td>
                    <td className="py-1 px-2 text-center">
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${LOAI_COLOR[row.loai]}`}>
                        {LOAI_LABEL[row.loai]}
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

          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setPreview(null)}>
              Hủy
            </Button>
            <Button size="sm" onClick={handleImport} disabled={isPending}>
              {isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                  Đang import...
                </>
              ) : (
                <>
                  <CheckCircle className="h-4 w-4 mr-1" />
                  Xác nhận import {preview.rows.length} mục
                </>
              )}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
