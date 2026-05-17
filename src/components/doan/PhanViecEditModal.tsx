import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Users } from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { externalSupabase } from "@/lib/supabase-external";
import { useUserListForAssign } from "@/hooks/use-cong-viec";
import {
  PHAN_VIEC_ITEMS, useDoanPhanViecMatrix, useAssignPvItem,
  useSetPvKhongCan, useResolvePhanCong, type PvKey,
} from "@/hooks/use-phan-viec";

const KC = "__khong_can__";
const NONE = "_none";

interface Props {
  open: boolean;
  onClose: () => void;
  doanId: number | null;
  onDone?: () => void;
}

// Modal phân việc chế độ SỬA — mở từ thông báo pv_phancong cho điều phối.
// Nạp trạng thái phân việc hiện tại; phân nốt mục trống → xác nhận.
export function PhanViecEditModal({ open, onClose, doanId, onDone }: Props) {
  const { data: users = [] } = useUserListForAssign();
  const { data: matrix } = useDoanPhanViecMatrix(doanId ? [doanId] : []);
  const assignMut = useAssignPvItem();
  const kcMut = useSetPvKhongCan();
  const resolveMut = useResolvePhanCong();
  const [sel, setSel] = useState<Record<PvKey, string>>({} as Record<PvKey, string>);
  const [saving, setSaving] = useState(false);

  const { data: doan } = useQuery({
    queryKey: ["doan_info_pv", doanId],
    enabled: open && !!doanId,
    queryFn: async () => {
      const { data, error } = await externalSupabase
        .from("doan")
        .select("id, ten_doan, so_khach, ngay_di, ngay_ve, loai_tour, agents:agent_id(ten), dia_diem:dia_diem_id(ten)")
        .eq("id", doanId!)
        .single();
      if (error) throw error;
      return data as any;
    },
  });

  const cells = doanId ? matrix?.get(doanId) : undefined;

  const original = useMemo(() => {
    const o = {} as Record<PvKey, string>;
    for (const it of PHAN_VIEC_ITEMS) {
      const c = cells?.[it.key];
      if (!c) o[it.key] = NONE;
      else if (c.trang_thai === "khong_can") o[it.key] = KC;
      else o[it.key] = c.user_id;
    }
    return o;
  }, [cells]);

  useEffect(() => {
    if (open) setSel({ ...original });
  }, [open, original]);

  if (!doanId) return null;

  const setRow = (k: PvKey, v: string) => setSel((p) => ({ ...p, [k]: v }));

  const submit = async () => {
    const did = doanId;
    if (!doan || did == null) return;
    setSaving(true);
    try {
      for (const it of PHAN_VIEC_ITEMS) {
        const v = sel[it.key];
        if (!v || v === original[it.key]) continue; // không đổi
        if (v === NONE) continue;                    // để trống → không xử lý
        const base = { doanId: did, doanTen: doan.ten_doan, ngayDi: doan.ngay_di ?? null, key: it.key };
        if (v === KC) await kcMut.mutateAsync(base);
        else await assignMut.mutateAsync({ ...base, userId: v });
      }
      // Còn mục để trống → giữ pv_phancong mở (điều phối sẽ được nhắc lại); hết → đóng
      const stillMissing = PHAN_VIEC_ITEMS.some((it) => (sel[it.key] ?? NONE) === NONE);
      if (!stillMissing) await resolveMut.mutateAsync(did);
      toast.success(
        stillMissing
          ? "Đã phân — vẫn còn mục trống, điều phối sẽ được nhắc lại"
          : "Đã phân việc xong",
      );
      onDone?.();
      onClose();
    } catch (e: any) {
      toast.error(e?.message ?? "Lỗi phân việc");
    } finally {
      setSaving(false);
    }
  };

  const dateStr = doan?.ngay_di
    ? `${doan.ngay_di}${doan.ngay_ve ? ` → ${doan.ngay_ve}` : ""}`
    : "—";

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-sm flex items-center gap-2">
            <Users className="h-4 w-4" /> Phân việc — {doan?.ten_doan ?? `Đoàn #${doanId}`}
          </DialogTitle>
        </DialogHeader>

        <div className="rounded-lg border border-border bg-muted/30 px-3 py-2 text-xs space-y-0.5">
          <div className="flex justify-between gap-2">
            <span className="text-muted-foreground">Agent</span>
            <span>{doan?.agents?.ten ?? "—"}</span>
          </div>
          <div className="flex justify-between gap-2">
            <span className="text-muted-foreground">Địa điểm</span>
            <span>{doan?.dia_diem?.ten ?? "—"}</span>
          </div>
          <div className="flex justify-between gap-2">
            <span className="text-muted-foreground">Số khách</span>
            <span>{doan?.so_khach ?? "—"}</span>
          </div>
          <div className="flex justify-between gap-2">
            <span className="text-muted-foreground">Ngày đi → về</span>
            <span className="tabular-nums">{dateStr}</span>
          </div>
        </div>

        <p className="text-xs text-muted-foreground">
          Chọn người cho mục còn trống. Để trống = chưa phân (sẽ nhắc lại). Admin = Không cần.
        </p>

        <div className="space-y-2 py-1">
          {PHAN_VIEC_ITEMS.map((it) => (
            <div key={it.key} className="flex items-center gap-2">
              <Label className="text-sm w-32 shrink-0">{it.label}</Label>
              <Select value={sel[it.key] ?? NONE} onValueChange={(v) => setRow(it.key, v)}>
                <SelectTrigger className="h-8 text-xs flex-1">
                  <SelectValue placeholder="— Chưa phân —" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE} className="text-xs">— Chưa phân —</SelectItem>
                  {users.map((u) => (
                    <SelectItem key={u.user_id} value={u.user_id} className="text-xs">
                      {u.ho_ten}
                    </SelectItem>
                  ))}
                  <SelectItem value={KC} className="text-xs font-medium">⊘ Không cần</SelectItem>
                </SelectContent>
              </Select>
            </div>
          ))}
        </div>

        <DialogFooter>
          <Button size="sm" onClick={submit} disabled={saving || !doan}>
            {saving ? "Đang lưu..." : "Xác nhận phân việc"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
