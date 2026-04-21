import { useRef, useState } from "react";
import { Upload, FileText, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { BaoGiaKetQua } from "@/hooks/use-bao-gia";
import { useProcessBaoGia } from "@/hooks/use-bao-gia";
import { toast } from "sonner";

interface BaoGiaUploadProps {
  onResult: (ketQua: BaoGiaKetQua, file: File, exchangeRate: number, profitUsd: number) => void;
}

export function BaoGiaUpload({ onResult }: BaoGiaUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [exchangeRate, setExchangeRate] = useState<string>("26000");
  const [profitUsd, setProfitUsd] = useState<string>("200");

  const { mutate: process, isPending } = useProcessBaoGia();

  const handleFile = (f: File) => {
    const allowed = ["application/pdf", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"];
    const extOk = f.name.endsWith(".pdf") || f.name.endsWith(".docx");
    if (!allowed.includes(f.type) && !extOk) {
      toast.error("Chỉ hỗ trợ file .pdf và .docx");
      return;
    }
    setFile(f);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) handleFile(f);
  };

  const handleSubmit = () => {
    if (!file) return;
    const rate = parseFloat(exchangeRate);
    const profit = parseFloat(profitUsd);
    if (!rate || !profit) {
      toast.error("Vui lòng nhập tỷ giá và lợi nhuận");
      return;
    }
    process(
      { file, exchangeRate: rate, profitUsd: profit },
      {
        onSuccess: (ketQua) => {
          onResult(ketQua, file, rate, profit);
          toast.success("Báo giá đã được tạo!");
        },
        onError: (err) => {
          toast.error(err.message ?? "Lỗi xử lý AI");
        },
      }
    );
  };

  return (
    <div className="space-y-4">
      {/* Drag-drop zone */}
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
          accept=".pdf,.docx"
          className="hidden"
          onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
        />
        {file ? (
          <div className="flex items-center justify-center gap-2 text-sm">
            <FileText className="h-5 w-5 text-blue-600" />
            <span className="font-medium text-blue-700">{file.name}</span>
            <span className="text-muted-foreground">({(file.size / 1024).toFixed(0)} KB)</span>
          </div>
        ) : (
          <div className="space-y-1">
            <Upload className="h-8 w-8 mx-auto text-muted-foreground" />
            <p className="text-sm font-medium">Kéo thả hoặc nhấn để chọn file</p>
            <p className="text-xs text-muted-foreground">Hỗ trợ: .docx, .pdf (chương trình tour tiếng Trung)</p>
          </div>
        )}
      </div>

      {/* Parameters */}
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1">
          <Label className="text-xs">Tỷ giá (VND/USD)</Label>
          <Input
            type="number"
            value={exchangeRate}
            onChange={(e) => setExchangeRate(e.target.value)}
            placeholder="26000"
            className="h-8 text-sm"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Lợi nhuận (USD)</Label>
          <Input
            type="number"
            value={profitUsd}
            onChange={(e) => setProfitUsd(e.target.value)}
            placeholder="200"
            className="h-8 text-sm"
          />
        </div>
      </div>

      <Button
        onClick={handleSubmit}
        disabled={!file || isPending}
        className="w-full"
        size="sm"
      >
        {isPending ? (
          <>
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            Đang xử lý AI (~15-20 giây)...
          </>
        ) : (
          "Xử lý AI →"
        )}
      </Button>
    </div>
  );
}
