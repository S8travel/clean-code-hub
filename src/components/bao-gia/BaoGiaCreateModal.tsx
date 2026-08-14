import { useEffect, useRef, useState } from "react";
import { Calculator, Tag, Upload, FileText, X, Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/use-auth";
import { errMsg } from "@/lib/error";
import {
  useCreateBaoGia,
  useUploadLichTrinhFile,
  type LoaiBaoGia,
} from "@/hooks/use-bao-gia";
import { unsupportedFileInfo } from "@/lib/itinerary-file";
import { useFileDrop } from "@/hooks/use-file-drop";
import { emptyBaoGiaKetQua, emptyGiaCuoiKetQua } from "@/components/bao-gia/detail/helpers";
import { AgentSelect, LoaiTourSelect } from "@/components/bao-gia/BaoGiaFields";

export interface BaoGiaCreatePrefill {
  leadId?: number | null;
  tenChuongTrinh?: string;
  soNgay?: number;
  ngayDi?: string | null;
  ngayVe?: string | null;
  agentId?: number | null;
}

interface Props {
  open: boolean;
  onClose: () => void;
  /** Gọi sau khi tạo xong (id báo giá mới). Caller tự điều hướng / đẩy phễu. */
  onCreated: (id: number) => void;
  prefill?: BaoGiaCreatePrefill;
}

// Modal "Tạo báo giá": chọn loại báo giá (tự tính / giá cuối), Agent đối tác,
// loại tour, tên chương trình; mode 'gia_cuoi' cho upload file lịch trình.
export function BaoGiaCreateModal({ open, onClose, onCreated, prefill }: Props) {
  const { user } = useAuth();
  const createBaoGia = useCreateBaoGia();
  const uploadFile = useUploadLichTrinhFile();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [loaiBaoGia, setLoaiBaoGia] = useState<LoaiBaoGia>("tu_tinh");
  const [agentId, setAgentId] = useState<number | null>(null);
  const [loaiTour, setLoaiTour] = useState<string | null>(null);
  const [tenChuongTrinh, setTenChuongTrinh] = useState("");
  const [soNgay, setSoNgay] = useState(1);
  const [file, setFile] = useState<File | null>(null);

  // Reset / nạp prefill mỗi lần mở.
  useEffect(() => {
    if (!open) return;
    setLoaiBaoGia("tu_tinh");
    setAgentId(prefill?.agentId ?? null);
    setLoaiTour(null);
    setTenChuongTrinh(prefill?.tenChuongTrinh ?? "");
    setSoNgay(prefill?.soNgay && prefill.soNgay > 0 ? prefill.soNgay : 1);
    setFile(null);
  }, [open, prefill]);

  const submitting = createBaoGia.isPending || uploadFile.isPending;

  // Chọn / kéo-thả file. Định dạng AI không đọc được vẫn đính kèm bình thường,
  // nhưng báo ngay tại đây — biết sớm còn kịp lưu lại thành .docx trước khi tạo.
  const pickFile = (picked: File[]) => {
    const f = picked[0];
    if (!f) return;
    setFile(f);
    if (picked.length > 1) toast.info("Lúc tạo chỉ nhận 1 file — tải thêm ở trang chi tiết báo giá.");
    const info = unsupportedFileInfo(f.name);
    if (info) toast.warning(`${f.name} — ${info.help}`, { duration: 10000 });
  };
  const { dragging, dropProps } = useFileDrop(pickFile, submitting);
  const fileUnsup = file ? unsupportedFileInfo(file.name) : null;

  const handleSubmit = async () => {
    const ten = tenChuongTrinh.trim();
    const days = soNgay > 0 ? soNgay : 1;
    const ketQua = loaiBaoGia === "gia_cuoi"
      ? emptyGiaCuoiKetQua(days, ten)
      : emptyBaoGiaKetQua(days, ten);
    try {
      const { id } = await createBaoGia.mutateAsync({
        tieu_de: ten,
        ket_qua: ketQua,
        exchange_rate: 26000,
        profit_usd: 15,
        trang_thai: "draft",
        loai_bao_gia: loaiBaoGia,
        agent_id: agentId,
        loai_tour: loaiTour,
        lead_id: prefill?.leadId ?? null,
        ngay_di: prefill?.ngayDi ?? null,
        ngay_ve: prefill?.ngayVe ?? null,
      });
      // Upload file lịch trình (nếu có) — chỉ khi đã có id để tạo path.
      if (file) {
        try {
          await uploadFile.mutateAsync({ baoGiaId: id, files: [file], current: [], uploadedBy: user?.user_id });
        } catch (e: unknown) {
          // Báo giá đã tạo — chỉ cảnh báo phần file, không chặn.
          toast.error("Đã tạo báo giá nhưng lỗi tải file: " + (errMsg(e) || ""));
        }
      }
      onClose();
      onCreated(id);
    } catch (e: unknown) {
      toast.error(errMsg(e) || "Lỗi tạo báo giá");
    }
  };

  const isGiaCuoi = loaiBaoGia === "gia_cuoi";

  return (
    <Dialog open={open} onOpenChange={(o) => !o && !submitting && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Tạo báo giá</DialogTitle>
          <DialogDescription>
            Chọn loại báo giá và điền thông tin cơ bản. Có thể sửa chi tiết sau khi tạo.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-1">
          {/* Loại báo giá — segmented */}
          <div>
            <Label className="text-xs text-slate-600">Loại báo giá</Label>
            <div className="mt-1.5 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setLoaiBaoGia("tu_tinh")}
                className={`flex items-start gap-2 rounded-lg border p-2.5 text-left transition-colors ${
                  !isGiaCuoi ? "border-blue-500 bg-blue-50 ring-1 ring-blue-500" : "border-slate-200 hover:bg-slate-50"
                }`}
              >
                <Calculator className={`h-4 w-4 mt-0.5 shrink-0 ${!isGiaCuoi ? "text-blue-600" : "text-slate-400"}`} />
                <span>
                  <span className="block text-xs font-semibold">Tự tính giá</span>
                  <span className="block text-[11px] text-slate-500 leading-snug">Nhập từng dịch vụ → tính ra giá tour</span>
                </span>
              </button>
              <button
                type="button"
                onClick={() => setLoaiBaoGia("gia_cuoi")}
                className={`flex items-start gap-2 rounded-lg border p-2.5 text-left transition-colors ${
                  isGiaCuoi ? "border-blue-500 bg-blue-50 ring-1 ring-blue-500" : "border-slate-200 hover:bg-slate-50"
                }`}
              >
                <Tag className={`h-4 w-4 mt-0.5 shrink-0 ${isGiaCuoi ? "text-blue-600" : "text-slate-400"}`} />
                <span>
                  <span className="block text-xs font-semibold">Giá cuối</span>
                  <span className="block text-[11px] text-slate-500 leading-snug">Land tour giá đã chốt, nhập thẳng giá</span>
                </span>
              </button>
            </div>
          </div>

          {/* Tên chương trình */}
          <div>
            <Label className="text-xs text-slate-600">Tên chương trình</Label>
            <Input
              value={tenChuongTrinh}
              onChange={(e) => setTenChuongTrinh(e.target.value)}
              placeholder="VD: Hà Nội - Hạ Long 4N3Đ"
              className="h-9 mt-1"
              autoFocus
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            {/* Agent đối tác */}
            <div>
              <Label className="text-xs text-slate-600">Agent (đối tác)</Label>
              <AgentSelect value={agentId} onChange={setAgentId} className="h-9 mt-1" />
            </div>

            {/* Loại tour */}
            <div>
              <Label className="text-xs text-slate-600">Loại tour</Label>
              <LoaiTourSelect value={loaiTour} onChange={setLoaiTour} className="h-9 mt-1" />
            </div>

            {/* Số ngày */}
            <div>
              <Label className="text-xs text-slate-600">Số ngày</Label>
              <Input
                type="number"
                min={1}
                value={soNgay}
                onChange={(e) => {
                  const v = parseInt(e.target.value, 10);
                  setSoNgay(!isNaN(v) && v >= 1 ? v : 1);
                }}
                className="h-9 mt-1"
              />
            </div>
          </div>

          {/* File lịch trình — cả 2 mode (không bắt buộc) */}
          <div {...dropProps}>
            <Label className="text-xs text-slate-600">
              File lịch trình <span className="text-[10px] text-slate-400 font-normal">(không bắt buộc — có thể tải thêm sau)</span>
            </Label>
            {file ? (
              <div className={`mt-1 rounded-md border px-2.5 py-2 ${dragging ? "border-blue-400 border-dashed bg-blue-50" : "border-slate-200 bg-slate-50"}`}>
                <div className="flex items-center gap-2">
                  <FileText className="h-4 w-4 text-blue-600 shrink-0" />
                  <span className="flex-1 min-w-0 truncate text-xs">{file.name}</span>
                  <button
                    type="button"
                    onClick={() => { setFile(null); if (fileInputRef.current) fileInputRef.current.value = ""; }}
                    className="text-slate-400 hover:text-red-500"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
                {fileUnsup && (
                  <p className="mt-1.5 rounded bg-amber-100 px-1.5 py-1 text-[10px] leading-snug text-amber-800">
                    AI chưa đọc được file này — {fileUnsup.help}
                  </p>
                )}
              </div>
            ) : (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className={`mt-1 flex w-full items-center justify-center gap-2 rounded-md border border-dashed px-3 py-3 text-xs transition-colors ${
                  dragging ? "border-blue-400 bg-blue-50 text-blue-700" : "border-slate-300 text-slate-500 hover:bg-slate-50"
                }`}
              >
                <Upload className="h-4 w-4" /> Kéo thả hoặc chọn file (PDF, Word .docx, ảnh...)
              </button>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.png,.jpg,.jpeg,.webp,.gif,.docx,.xlsx,.xls,.doc"
              className="hidden"
              onChange={(e) => pickFile(Array.from(e.target.files ?? []))}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={submitting}>Hủy</Button>
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
            Tạo báo giá
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
