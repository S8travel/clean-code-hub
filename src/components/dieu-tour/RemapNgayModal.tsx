import { useEffect, useMemo, useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { ArrowRight, CalendarCog, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { errMsg } from "@/lib/error";
import { cn } from "@/lib/utils";
import { useRemapNhData, useRemapNhaHang } from "@/hooks/use-remap-nha-hang";
import {
  validateReassignment, buildMappingPayload, buaLabel,
  type Assignment, type BuaAn,
} from "@/lib/remap-nha-hang";

interface Props {
  doanId: number;
  open: boolean;
  onClose: () => void;
}

const slotKey = (dnId: number, bua: BuaAn) => `${dnId}|${bua}`;

export default function RemapNgayModal({ doanId, open, onClose }: Props) {
  const { data, isLoading } = useRemapNhData(doanId, open);
  const remap = useRemapNhaHang();

  // assignments: booking_id → {to_doan_ngay_id, to_bua_an}. Khởi tạo = vị trí hiện tại.
  const [assignMap, setAssignMap] = useState<Record<number, { dn: number; bua: BuaAn }>>({});

  useEffect(() => {
    if (!data) return;
    const init: Record<number, { dn: number; bua: BuaAn }> = {};
    for (const b of data.movable) init[b.booking_id] = { dn: b.from_doan_ngay_id, bua: b.from_bua };
    setAssignMap(init);
  }, [data]);

  const assignments: Assignment[] = useMemo(
    () =>
      Object.entries(assignMap).map(([bid, v]) => ({
        booking_id: Number(bid),
        to_doan_ngay_id: v.dn,
        to_bua_an: v.bua,
      })),
    [assignMap],
  );

  const { valid, errors } = useMemo(() => {
    if (!data) return { valid: false, errors: [] as string[] };
    return validateReassignment(data.movable, data.slots, assignments);
  }, [data, assignments]);

  const payload = useMemo(
    () => (data ? buildMappingPayload(data.movable, assignments) : []),
    [data, assignments],
  );

  // Option đích: mọi ô (ngày × bữa) — value = "dnId|bua"
  const slotOptions = useMemo(() => {
    if (!data) return [];
    return [...data.slots]
      .sort((a, b) => a.ngay_so - b.ngay_so || (a.bua === "trua" ? -1 : 1))
      .map((s) => ({
        key: slotKey(s.doan_ngay_id, s.bua),
        label: `Ngày ${s.ngay_so} · ${buaLabel(s.bua)}`,
      }));
  }, [data]);

  const handleApply = () => {
    if (payload.length === 0) {
      toast.info("Chưa có thay đổi nào");
      return;
    }
    remap.mutate(
      { doanId, mapping: payload },
      {
        onSuccess: (res) => {
          toast.success(`Đã xếp lại ${res.moved} nhà hàng sang ngày mới`);
          onClose();
        },
        onError: (e) => toast.error(errMsg(e) || "Lỗi xếp lại nhà hàng"),
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <CalendarCog className="h-4 w-4 text-primary" />
            Xếp lại nhà hàng theo ngày
          </DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <p className="text-sm text-muted-foreground py-6 text-center">Đang tải…</p>
        ) : !data ? null : data.multiNhom ? (
          <div className="rounded-lg border bg-amber-50 border-amber-200 px-4 py-6 text-center">
            <AlertTriangle className="h-5 w-5 text-amber-600 mx-auto mb-1" />
            <p className="text-sm text-amber-700 font-medium">Đoàn nhiều nhóm — chưa hỗ trợ ở phiên bản này</p>
          </div>
        ) : data.movable.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">Đoàn chưa có nhà hàng nào để xếp lại</p>
        ) : (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Dời nhà hàng đã đặt sang ngày/bữa khác — <span className="font-medium">giữ nguyên booking, email
              và thanh toán</span>. Nhớ gửi lại mail báo ngày mới cho nhà hàng sau khi xếp.
            </p>

            <div className="rounded-lg border overflow-hidden">
              <div className="grid grid-cols-[1fr_auto_auto] gap-2 bg-[#E6F1FB] px-3 py-1.5 text-xs font-semibold">
                <span>Nhà hàng</span>
                <span className="text-center">Hiện tại</span>
                <span className="text-center">Xếp sang</span>
              </div>
              {data.movable.map((b) => {
                const cur = assignMap[b.booking_id];
                return (
                  <div
                    key={b.booking_id}
                    className="grid grid-cols-[1fr_auto_auto] gap-2 items-center px-3 py-1.5 border-t text-xs"
                  >
                    <span className="min-w-0 truncate">
                      {b.nha_hang_ten}
                      {b.has_extras && (
                        <span className="ml-1.5 inline-flex items-center gap-0.5 text-[10px] text-red-600">
                          <AlertTriangle className="h-3 w-3" /> có phát sinh
                        </span>
                      )}
                    </span>
                    <span className="text-muted-foreground whitespace-nowrap flex items-center gap-1">
                      Ngày {b.from_ngay_so} · {buaLabel(b.from_bua)}
                      <ArrowRight className="h-3 w-3" />
                    </span>
                    <Select
                      value={cur ? slotKey(cur.dn, cur.bua) : ""}
                      onValueChange={(v) => {
                        const [dn, bua] = v.split("|");
                        setAssignMap((prev) => ({
                          ...prev,
                          [b.booking_id]: { dn: Number(dn), bua: bua as BuaAn },
                        }));
                      }}
                    >
                      <SelectTrigger className="h-7 w-36 text-xs">
                        <SelectValue placeholder="Chọn ngày" />
                      </SelectTrigger>
                      <SelectContent>
                        {slotOptions.map((o) => (
                          <SelectItem key={o.key} value={o.key} className="text-xs">
                            {o.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                );
              })}
            </div>

            {errors.length > 0 && (
              <div className="rounded-md bg-red-50 border border-red-200 px-3 py-2 space-y-0.5">
                {errors.map((e, i) => (
                  <p key={i} className="text-xs text-red-600">• {e}</p>
                ))}
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose} disabled={remap.isPending}>
            Hủy
          </Button>
          <Button
            size="sm"
            onClick={handleApply}
            disabled={!data || data.multiNhom || !valid || payload.length === 0 || remap.isPending}
            className={cn(remap.isPending && "opacity-70")}
          >
            {remap.isPending ? "Đang xếp…" : `Áp dụng${payload.length ? ` (${payload.length})` : ""}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
