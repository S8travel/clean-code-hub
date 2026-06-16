import { useEffect, useMemo, useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { ArrowRight, CalendarCog, AlertTriangle, Utensils, MapPin } from "lucide-react";
import { toast } from "sonner";
import { errMsg } from "@/lib/error";
import { cn } from "@/lib/utils";
import { useRemapNhData, useRemapNhaHang } from "@/hooks/use-remap-nha-hang";
import { useRemapCdData, useRemapCanhDiem } from "@/hooks/use-remap-canh-diem";
import {
  validateReassignment, buildMappingPayload, buaLabel,
  type Assignment, type BuaAn,
} from "@/lib/remap-nha-hang";
import {
  validateCdReassignment, buildCdMappingPayload, hasMovedDv,
  type CdAssignment,
} from "@/lib/remap-canh-diem";

interface Props {
  doanId: number;
  open: boolean;
  onClose: () => void;
}

const slotKey = (dnId: number, bua: BuaAn) => `${dnId}|${bua}`;

export default function RemapNgayModal({ doanId, open, onClose }: Props) {
  const { data: nh, isLoading: nhLoading } = useRemapNhData(doanId, open);
  const { data: cd, isLoading: cdLoading } = useRemapCdData(doanId, open);
  const remapNh = useRemapNhaHang();
  const remapCd = useRemapCanhDiem();
  const [applying, setApplying] = useState(false);

  // ── NH state: booking_id → {dn, bua} ──────────────────────────────────────
  const [nhMap, setNhMap] = useState<Record<number, { dn: number; bua: BuaAn }>>({});
  // ── CD state: item_id → to_doan_ngay_id ───────────────────────────────────
  const [cdMap, setCdMap] = useState<Record<number, number>>({});

  useEffect(() => {
    if (nh) {
      const init: Record<number, { dn: number; bua: BuaAn }> = {};
      for (const b of nh.movable) init[b.booking_id] = { dn: b.from_doan_ngay_id, bua: b.from_bua };
      setNhMap(init);
    }
  }, [nh]);
  useEffect(() => {
    if (cd) {
      const init: Record<number, number> = {};
      for (const it of cd.movable) init[it.item_id] = it.from_doan_ngay_id;
      setCdMap(init);
    }
  }, [cd]);

  const nhAssignments: Assignment[] = useMemo(
    () => Object.entries(nhMap).map(([id, v]) => ({ booking_id: Number(id), to_doan_ngay_id: v.dn, to_bua_an: v.bua })),
    [nhMap],
  );
  const cdAssignments: CdAssignment[] = useMemo(
    () => Object.entries(cdMap).map(([id, dn]) => ({ item_id: Number(id), to_doan_ngay_id: dn })),
    [cdMap],
  );

  const nhVal = useMemo(
    () => (nh ? validateReassignment(nh.movable, nh.slots, nhAssignments) : { valid: true, errors: [] as string[] }),
    [nh, nhAssignments],
  );
  const cdVal = useMemo(
    () => (cd ? validateCdReassignment(cd.movable, cd.allItems, cd.days, cdAssignments) : { valid: true, errors: [] as string[] }),
    [cd, cdAssignments],
  );

  const nhPayload = useMemo(() => (nh ? buildMappingPayload(nh.movable, nhAssignments) : []), [nh, nhAssignments]);
  const cdPayload = useMemo(() => (cd ? buildCdMappingPayload(cd.movable, cdAssignments) : []), [cd, cdAssignments]);

  const slotOptions = useMemo(() => {
    if (!nh) return [];
    return [...nh.slots]
      .sort((a, b) => a.ngay_so - b.ngay_so || (a.bua === "trua" ? -1 : 1))
      .map((s) => ({ key: slotKey(s.doan_ngay_id, s.bua), label: `Ngày ${s.ngay_so} · ${buaLabel(s.bua)}` }));
  }, [nh]);

  const dayOptions = useMemo(() => {
    if (!cd) return [];
    return [...cd.days].sort((a, b) => a.ngay_so - b.ngay_so).map((d) => ({ id: d.doan_ngay_id, label: `Ngày ${d.ngay_so}` }));
  }, [cd]);

  const isLoading = nhLoading || cdLoading;
  const multiNhom = !!(nh?.multiNhom || cd?.multiNhom);
  const nothingMovable = (nh?.movable.length ?? 0) === 0 && (cd?.movable.length ?? 0) === 0;
  const totalChanges = nhPayload.length + cdPayload.length;
  const canApply = !isLoading && !multiNhom && nhVal.valid && cdVal.valid && totalChanges > 0 && !applying;

  const handleApply = async () => {
    if (totalChanges === 0) { toast.info("Chưa có thay đổi nào"); return; }
    setApplying(true);
    // NH chạy trước CD (2 RPC riêng, không atomic xuyên-loại) — track để báo đúng nếu lệch.
    let movedNh = 0, movedCd = 0;
    try {
      if (nhPayload.length) movedNh = (await remapNh.mutateAsync({ doanId, mapping: nhPayload })).moved;
      if (cdPayload.length) movedCd = (await remapCd.mutateAsync({ doanId, mapping: cdPayload })).moved;
      const parts = [movedNh > 0 ? `${movedNh} nhà hàng` : "", movedCd > 0 ? `${movedCd} cảnh điểm` : ""].filter(Boolean);
      toast.success(`Đã xếp lại ${parts.join(" + ")} sang ngày mới`);
      if (cd && hasMovedDv(cd.movable, cdPayload)) {
        toast.info("Có dịch vụ đã book — nhớ báo NCC ngày mới / lưu lại điều tour để đồng bộ danh sách dịch vụ.", { duration: 7000 });
      }
      onClose();
    } catch (e) {
      if (movedNh > 0) {
        // Nhà hàng ĐÃ xếp xong, chỉ phần cảnh điểm lỗi → báo rõ tránh hiểu lầm "không có gì đổi".
        toast.warning(`Đã xếp ${movedNh} nhà hàng, nhưng phần cảnh điểm lỗi: ${errMsg(e) || "không rõ"}. Kiểm tra lại danh sách cảnh điểm.`, { duration: 8000 });
      } else {
        toast.error(errMsg(e) || "Lỗi xếp lại");
      }
    } finally {
      setApplying(false);
    }
  };

  const allErrors = [...nhVal.errors, ...cdVal.errors];

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <CalendarCog className="h-4 w-4 text-primary" />
            Xếp lại theo ngày
          </DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <p className="text-sm text-muted-foreground py-6 text-center">Đang tải…</p>
        ) : multiNhom ? (
          <div className="rounded-lg border bg-amber-50 border-amber-200 px-4 py-6 text-center">
            <AlertTriangle className="h-5 w-5 text-amber-600 mx-auto mb-1" />
            <p className="text-sm text-amber-700 font-medium">Đoàn nhiều nhóm — chưa hỗ trợ ở phiên bản này</p>
          </div>
        ) : nothingMovable ? (
          <p className="text-sm text-muted-foreground py-6 text-center">Đoàn chưa có nhà hàng / cảnh điểm nào để xếp lại</p>
        ) : (
          <div className="space-y-4">
            <p className="text-xs text-muted-foreground">
              Dời sang ngày khác — <span className="font-medium">giữ nguyên booking, thanh toán và ĐNTT</span>.
              Nhớ gửi lại mail báo ngày mới cho nhà cung cấp sau khi xếp.
            </p>

            {/* ── Nhà hàng ─────────────────────────────────────────────── */}
            {nh && nh.movable.length > 0 && (
              <div className="rounded-lg border overflow-hidden">
                <div className="grid grid-cols-[1fr_auto_auto] gap-2 bg-[#E6F1FB] px-3 py-1.5 text-xs font-semibold items-center">
                  <span className="flex items-center gap-1"><Utensils className="h-3 w-3" /> Nhà hàng</span>
                  <span className="text-center">Hiện tại</span>
                  <span className="text-center">Xếp sang</span>
                </div>
                {nh.movable.map((b) => {
                  const cur = nhMap[b.booking_id];
                  return (
                    <div key={b.booking_id} className="grid grid-cols-[1fr_auto_auto] gap-2 items-center px-3 py-1.5 border-t text-xs">
                      <span className="min-w-0 truncate">
                        {b.nha_hang_ten}
                        {b.has_extras && <span className="ml-1.5 inline-flex items-center gap-0.5 text-[10px] text-red-600"><AlertTriangle className="h-3 w-3" /> có phát sinh</span>}
                      </span>
                      <span className="text-muted-foreground whitespace-nowrap flex items-center gap-1">
                        Ngày {b.from_ngay_so} · {buaLabel(b.from_bua)} <ArrowRight className="h-3 w-3" />
                      </span>
                      <Select
                        value={cur ? slotKey(cur.dn, cur.bua) : ""}
                        onValueChange={(v) => {
                          const [dn, bua] = v.split("|");
                          setNhMap((p) => ({ ...p, [b.booking_id]: { dn: Number(dn), bua: bua as BuaAn } }));
                        }}
                      >
                        <SelectTrigger className="h-7 w-36 text-xs"><SelectValue placeholder="Chọn ngày" /></SelectTrigger>
                        <SelectContent>
                          {slotOptions.map((o) => <SelectItem key={o.key} value={o.key} className="text-xs">{o.label}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  );
                })}
              </div>
            )}

            {/* ── Cảnh điểm / Dịch vụ ──────────────────────────────────── */}
            {cd && cd.movable.length > 0 && (
              <div className="rounded-lg border overflow-hidden">
                <div className="grid grid-cols-[1fr_auto_auto] gap-2 bg-[#E6F1FB] px-3 py-1.5 text-xs font-semibold items-center">
                  <span className="flex items-center gap-1"><MapPin className="h-3 w-3" /> Cảnh điểm / Dịch vụ</span>
                  <span className="text-center">Hiện tại</span>
                  <span className="text-center">Xếp sang</span>
                </div>
                {cd.movable.map((it) => (
                  <div key={it.item_id} className="grid grid-cols-[1fr_auto_auto] gap-2 items-center px-3 py-1.5 border-t text-xs">
                    <span className="min-w-0 truncate">
                      {it.canh_diem_ten}
                      {it.is_dv && <span className="ml-1.5 text-[10px] text-purple-600">DV</span>}
                      {it.has_extras && <span className="ml-1.5 inline-flex items-center gap-0.5 text-[10px] text-red-600"><AlertTriangle className="h-3 w-3" /> có phát sinh</span>}
                    </span>
                    <span className="text-muted-foreground whitespace-nowrap flex items-center gap-1">
                      Ngày {it.from_ngay_so} <ArrowRight className="h-3 w-3" />
                    </span>
                    <Select
                      value={cdMap[it.item_id] != null ? String(cdMap[it.item_id]) : ""}
                      onValueChange={(v) => setCdMap((p) => ({ ...p, [it.item_id]: Number(v) }))}
                    >
                      <SelectTrigger className="h-7 w-36 text-xs"><SelectValue placeholder="Chọn ngày" /></SelectTrigger>
                      <SelectContent>
                        {dayOptions.map((o) => <SelectItem key={o.id} value={String(o.id)} className="text-xs">{o.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                ))}
              </div>
            )}

            {allErrors.length > 0 && (
              <div className="rounded-md bg-red-50 border border-red-200 px-3 py-2 space-y-0.5">
                {allErrors.map((e, i) => <p key={i} className="text-xs text-red-600">• {e}</p>)}
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose} disabled={applying}>Hủy</Button>
          <Button size="sm" onClick={handleApply} disabled={!canApply} className={cn(applying && "opacity-70")}>
            {applying ? "Đang xếp…" : `Áp dụng${totalChanges ? ` (${totalChanges})` : ""}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
