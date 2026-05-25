import { useState } from "react";
import { Calendar, FileDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";

interface Props {
  onSaveDraft?: () => void;
  onCreateBooking?: () => void;
  onExportPdf?: () => void;
}

export function BaoGiaFooter({ onSaveDraft, onCreateBooking, onExportPdf }: Props) {
  const [autoCalc, setAutoCalc] = useState(true);
  return (
    <div className="sticky bottom-0 z-10 bg-white border-t border-slate-200">
      <div className="max-w-[1400px] mx-auto px-4 py-2 flex items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
            <Switch checked={autoCalc} onCheckedChange={setAutoCalc} />
            <span>Tự động tính giá</span>
          </label>
          <Button variant="ghost" size="sm" className="h-8 text-xs gap-1.5 text-slate-700">
            <Calendar className="h-3.5 w-3.5" />
            Xem lịch trình
          </Button>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={onSaveDraft} className="h-8">
            Lưu nháp
          </Button>
          <Button variant="outline" size="sm" onClick={onCreateBooking} className="h-8">
            Tạo booking
          </Button>
          <Button size="sm" onClick={onExportPdf} className="h-8 bg-blue-600 hover:bg-blue-700 gap-1.5">
            <FileDown className="h-3.5 w-3.5" />
            Xuất PDF
          </Button>
        </div>
      </div>
    </div>
  );
}
