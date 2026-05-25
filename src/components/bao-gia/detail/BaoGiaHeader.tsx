import { Link } from "react-router-dom";
import { ChevronRight, Save, FileDown, Send, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { BaoGiaRow } from "@/hooks/use-bao-gia";
import { baoGiaCode, STATUS_INFO } from "./helpers";

interface Props {
  row: BaoGiaRow;
  onSaveDraft?: () => void;
  onExportPdf?: () => void;
  onSendCustomer?: () => void;
}

export function BaoGiaHeader({ row, onSaveDraft, onExportPdf, onSendCustomer }: Props) {
  const status = STATUS_INFO[row.trang_thai] ?? STATUS_INFO.draft;
  return (
    <div className="bg-white border-b border-slate-200 px-4 py-3">
      <div className="max-w-[1400px] mx-auto flex items-center justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-lg font-semibold text-slate-900">Báo giá tour</h1>
          <nav className="flex items-center text-xs text-slate-500 mt-0.5">
            <Link to="/" className="hover:text-slate-700">Trang chủ</Link>
            <ChevronRight className="h-3 w-3 mx-1" />
            <Link to="/bao-gia" className="hover:text-slate-700">Báo giá</Link>
            <ChevronRight className="h-3 w-3 mx-1" />
            <span className="text-slate-700 font-medium">{baoGiaCode(row.id)}</span>
          </nav>
        </div>
        <div className="flex items-center gap-3">
          <span className="inline-flex items-center gap-1.5 text-xs font-medium">
            <span className={`h-1.5 w-1.5 rounded-full ${status.dotCls}`} />
            <span className={status.textCls}>{status.label}</span>
          </span>
          <span className="text-xs text-slate-500">
            Mã báo giá: <span className="font-semibold text-slate-700">{baoGiaCode(row.id)}</span>
          </span>
          <span className="text-xs text-slate-500 inline-flex items-center gap-1">
            <Clock className="h-3 w-3" />
            Hiệu lực: <span className="font-medium text-slate-700">7 ngày</span>
          </span>
          <Button variant="outline" size="sm" onClick={onSaveDraft} className="h-8 gap-1.5">
            <Save className="h-3.5 w-3.5" />
            Lưu nháp
          </Button>
          <Button variant="outline" size="sm" onClick={onExportPdf} className="h-8 gap-1.5">
            <FileDown className="h-3.5 w-3.5" />
            Xuất PDF
          </Button>
          <Button size="sm" onClick={onSendCustomer} className="h-8 gap-1.5 bg-blue-600 hover:bg-blue-700">
            <Send className="h-3.5 w-3.5" />
            Gửi khách hàng
          </Button>
        </div>
      </div>
    </div>
  );
}
