import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { FileDown } from "lucide-react";

interface Props {
  open: boolean;
  initialText: string;
  onClose: () => void;
  onExport: (text: string) => void;
}

export default function DieuTourWordPreviewModal({ open, initialText, onClose, onExport }: Props) {
  const [text, setText] = useState(initialText);

  useEffect(() => {
    if (open) setText(initialText);
  }, [open, initialText]);

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="text-sm">Ghi chú điều tour — xem trước trước khi xuất</DialogTitle>
        </DialogHeader>
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={12}
          className="text-sm font-mono resize-none"
          placeholder="Nhập ghi chú..."
        />
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose}>Hủy</Button>
          <Button size="sm" className="gap-1.5" onClick={() => { onExport(text); onClose(); }}>
            <FileDown className="h-3.5 w-3.5" />
            Xuất Word
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
