import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Ban, CheckCircle2, ExternalLink } from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { t, useTranslate } from "@/lib/i18n";
import { blockerLabel } from "@/lib/blocker-label";
import type { CancelBlocker } from "@/lib/doan-cancel-check";

/**
 * Màn hủy đoàn. Thay cho toast đỏ cụt đường trước đây: liệt kê từng thứ còn
 * vướng, mỗi dòng có lối nhảy thẳng tới tab xử lý, và bắt nhập lý do hủy.
 */

const NO_AGENT = "__none__"; // Radix SelectItem cấm value=""

export interface AgentOption {
  id: number;
  ten: string | null;
}

interface Props {
  open: boolean;
  doanId: number;
  tenDoan: string;
  blockers: CancelBlocker[];
  agents: AgentOption[];
  isPending: boolean;
  onClose: () => void;
  onConfirm: (lyDoHuy: string, agentHuyId: number | null) => void;
}

export function HuyDoanDialog({
  open, doanId, tenDoan, blockers, agents, isPending, onClose, onConfirm,
}: Props) {
  useTranslate();
  const navigate = useNavigate();
  const [lyDo, setLyDo] = useState("");
  // KHÔNG prefill agent bán tour: `agent_huy_id` nghĩa là "agent BÁO hủy", và
  // bảng đoàn hiển thị "Hủy bởi: {tên}". Điền sẵn agent bán sẽ quy kết sai mỗi
  // lần chính S8 hủy đoàn. Để trống, OP chọn khi đúng là agent báo hủy.
  const [agentId, setAgentId] = useState<string>(NO_AGENT);

  // Reset mỗi lần mở cho một đoàn khác — nếu không, lý do của đoàn trước còn
  // nguyên trong ô và OP bấm nhầm sang đoàn này.
  useEffect(() => {
    if (!open) return;
    setLyDo("");
    setAgentId(NO_AGENT);
  }, [open, doanId]);

  const conVuong = blockers.length > 0;
  const lyDoSach = lyDo.trim();
  const choPhepHuy = !conVuong && lyDoSach.length > 0 && !isPending;

  // Đích có thể là tab của đoàn, hoặc trang khác (ĐNTT định kỳ nằm ngoài đoàn).
  const moDich = (b: CancelBlocker) => {
    onClose();
    navigate(b.tab ? `/doan/${doanId}?tab=${b.tab}` : (b.route ?? "/"));
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-body">
            <span className="p-1.5 rounded-full bg-amber-100 shrink-0">
              <Ban className="h-4 w-4 text-amber-600" />
            </span>
            <span className="break-words min-w-0">{t("Hủy đoàn")} — {tenDoan}</span>
          </DialogTitle>
        </DialogHeader>

        {conVuong ? (
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3">
            <p className="text-xs font-medium text-destructive">
              {t("Chưa hủy được — còn các mục sau chưa xử lý:")}
            </p>
            <ul className="mt-2 space-y-1.5">
              {blockers.map((b) => (
                <li key={b.kind} className="flex items-center justify-between gap-2 text-xs">
                  <span className="break-words min-w-0">
                    <span className="font-semibold">{b.count}</span> {blockerLabel(b.kind)}
                  </span>
                  <Button
                    variant="outline" size="sm"
                    className="h-6 px-2 text-[11px] shrink-0"
                    onClick={() => moDich(b)}
                  >
                    <ExternalLink className="h-3 w-3 mr-1" />
                    {b.tab ? t("Mở tab") : t("Mở trang")}
                  </Button>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-[11px] text-muted-foreground">
              {t("Hủy từng mục ở tab tương ứng, rồi quay lại đây.")}
            </p>
          </div>
        ) : (
          <div className="rounded-lg border border-emerald-300/50 bg-emerald-50 p-3 flex items-start gap-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
            <p className="text-xs text-emerald-900 break-words min-w-0">
              {t("Không còn booking hay ĐNTT nào chưa xử lý. Đoàn sẽ chuyển sang trạng thái Đã hủy, dữ liệu vẫn được giữ.")}
            </p>
          </div>
        )}

        <div className="space-y-3">
          <div>
            <Label className="text-xs font-medium">
              {t("Lý do hủy")} <span className="text-destructive">*</span>
            </Label>
            <Textarea
              value={lyDo}
              onChange={(e) => setLyDo(e.target.value)}
              placeholder={t("Ví dụ: khách hủy tour do bão; agent báo không đủ khách…")}
              rows={2}
              className="mt-1 text-xs"
              disabled={conVuong}
            />
          </div>

          <div>
            <Label className="text-xs font-medium">{t("Agent báo hủy (tùy chọn)")}</Label>
            <Select value={agentId} onValueChange={setAgentId} disabled={conVuong}>
              <SelectTrigger className="mt-1 h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_AGENT}>{t("Không chọn")}</SelectItem>
                {agents.map((a) => (
                  <SelectItem key={a.id} value={String(a.id)}>{a.ten ?? `#${a.id}`}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose}>{t("Đóng")}</Button>
          <Button
            variant="outline" size="sm"
            disabled={!choPhepHuy}
            onClick={() => onConfirm(lyDoSach, agentId === NO_AGENT ? null : Number(agentId))}
            className="border-amber-400 text-amber-700 hover:bg-amber-50"
          >
            {isPending ? t("Đang hủy...") : t("Hủy đoàn")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
