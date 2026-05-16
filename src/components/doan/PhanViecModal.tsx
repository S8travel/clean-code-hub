import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Users } from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useUserListForAssign } from "@/hooks/use-cong-viec";
import {
  defaultPhanViec, useCreatePhanViec, type PvKey,
} from "@/hooks/use-phan-viec";

interface Props {
  open: boolean;
  onClose: () => void;
  doan: { id: number; ten_doan: string; loai_tour: string | null; ngay_di: string | null } | null;
  creator: { id: string; name: string };
}

interface RowState { key: PvKey; label: string; checked: boolean; assignedTo: string }

export function PhanViecModal({ open, onClose, doan, creator }: Props) {
  const { data: users = [] } = useUserListForAssign();
  const createPv = useCreatePhanViec();
  const [rows, setRows] = useState<RowState[]>([]);

  useEffect(() => {
    if (open && doan) {
      setRows(
        defaultPhanViec(doan.loai_tour).map((d) => ({
          key: d.key,
          label: d.label,
          checked: d.checked,
          // KS mặc định = người tạo đoàn
          assignedTo: d.key === "pv_ks" ? creator.id : "",
        })),
      );
    }
  }, [open, doan, creator.id]);

  if (!doan) return null;

  const setRow = (key: PvKey, patch: Partial<RowState>) =>
    setRows((p) => p.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  const submit = () => {
    const assignments = rows
      .filter((r) => r.checked)
      .map((r) => ({ key: r.key, assignedTo: r.assignedTo || null }));
    if (assignments.length === 0) { toast.error("Chọn ít nhất 1 đầu việc"); return; }
    createPv.mutate(
      { doan, creatorId: creator.id, creatorName: creator.name, assignments },
      {
        onSuccess: (r) => {
          toast.success(
            `Đã phân việc đoàn ${doan.ten_doan}` +
            (r.missingCount > 0 ? ` · ${r.missingCount} mục thiếu người → đã báo điều phối` : ""),
          );
          onClose();
        },
        onError: (e: any) => toast.error(e?.message ?? "Lỗi phân việc"),
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-sm flex items-center gap-2">
            <Users className="h-4 w-4" /> Phân việc — {doan.ten_doan}
          </DialogTitle>
        </DialogHeader>

        <p className="text-xs text-muted-foreground -mt-1">
          Người được chọn sẽ nhận thông báo. Mục để trống → báo điều phối phân người.
          Giám đốc nhận thông tin đoàn.
        </p>

        <div className="space-y-2 py-1">
          {rows.map((r) => (
            <div key={r.key} className="flex items-center gap-2">
              <Checkbox
                checked={r.checked}
                onCheckedChange={(v) => setRow(r.key, { checked: !!v })}
                className="shrink-0"
              />
              <Label className="text-sm w-32 shrink-0">{r.label}</Label>
              <Select
                value={r.assignedTo || "_none"}
                onValueChange={(v) => setRow(r.key, { assignedTo: v === "_none" ? "" : v })}
                disabled={!r.checked}
              >
                <SelectTrigger className="h-8 text-xs flex-1">
                  <SelectValue placeholder="— Chưa phân —" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="_none" className="text-xs">— Chưa phân —</SelectItem>
                  {users.map((u) => (
                    <SelectItem key={u.user_id} value={u.user_id} className="text-xs">
                      {u.ho_ten}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ))}
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose}>Bỏ qua</Button>
          <Button size="sm" onClick={submit} disabled={createPv.isPending}>
            {createPv.isPending ? "Đang phân..." : "Xác nhận phân việc"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
