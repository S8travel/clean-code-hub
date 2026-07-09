import { Fragment, useState, useMemo, useEffect } from "react";
import { format } from "date-fns";
import { errMsg } from "@/lib/error";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DecimalInput } from "@/components/ui/decimal-input";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { useUpdateChiPhiActual } from "@/hooks/use-chi-phi";
import { type LocalKSRow } from "./ks-section-shared";
import { isKSRoomRow } from "@/lib/foc-calc";
import { t, useTranslate } from "@/lib/i18n";

const fmt = (n: number) => Math.round(n).toLocaleString("vi-VN");

interface Props {
  open: boolean;
  onClose: () => void;
  doanId: number;
  ksName: string;
  /** Tất cả row của KS (rooms + services), đã filter theo ksId trước khi truyền vào. */
  rows: LocalKSRow[];
  /** Snapshot FOC config của KS (đã resolve từ row.foc_*_snapshot hoặc master). */
  focKhach: number | null;
  focMien: number | null;
  /** Số tiền đã TT (sumPaid) để hiển thị preview delta. */
  sumPaid: number;
}

// Local state per row trong modal — chỉ track field user edit.
interface DraftRow {
  id: number;                  // chi_phi.id (chỉ row đã save mới hiện trong modal)
  ngay_date: string;
  loai_phong: string;
  loai_row: "phong" | "dich_vu_an" | "dich_vu_ve" | "dich_vu_khac";
  so_phong: number;
  gia_phong: number;
  foc_count: number;
  is_room: boolean;
  // FOC pro-rata (rooms) — tính lại sau khi user edit.
  rowFocDeduction: number;
}

/** Option A: foc_count manual cho mọi row. rowFocDeduction = foc_count × gia_phong. */
function recomputeFocForDrafts(
  drafts: DraftRow[],
  _focKhach: number | null,
  _focMien: number | null,
): DraftRow[] {
  return drafts.map((d) => ({
    ...d,
    rowFocDeduction: Math.round((d.foc_count || 0) * (d.gia_phong || 0)),
  }));
}

/** Gợi ý FOC theo 16免1 cho 1 ngày (info-only, OP tự gán vào row phòng giá thấp nhất). */
function calcDaySuggestion(
  dayDrafts: DraftRow[],
  focKhach: number | null,
  focMien: number | null,
): { totalRooms: number; suggestedFoc: number } {
  const totalRooms = dayDrafts.reduce((s, d) => s + (Number(d.so_phong) || 0), 0);
  if (!focKhach || !focMien || focKhach <= 0 || focMien <= 0) return { totalRooms, suggestedFoc: 0 };
  if (totalRooms < focKhach) return { totalRooms, suggestedFoc: 0 };
  return { totalRooms, suggestedFoc: Math.floor(totalRooms / focKhach) * focMien };
}

/** Tính tien_cong_ty (thực tế) cho 1 draft row — cùng formula cho room + service. */
function calcRowActual(d: DraftRow): number {
  const billed = Math.max(0, (d.so_phong || 0) - (d.foc_count || 0));
  return billed * (d.gia_phong || 0);
}

export default function KSAdjustModal({
  open, onClose, doanId, ksName, rows, focKhach, focMien, sumPaid,
}: Props) {
  useTranslate();
  const updateActualMut = useUpdateChiPhiActual();
  const [saving, setSaving] = useState(false);

  // Build initial drafts từ rows. Chỉ include row đã có id (đã save vào DB).
  const initialDrafts = useMemo<DraftRow[]>(() => {
    const drafts: DraftRow[] = rows
      .filter((r) => r.id != null)
      .map((r) => ({
        id: r.id!,
        ngay_date: r.ngay_date,
        loai_phong: r.loai_phong,
        loai_row: (r.loai_row ?? "phong") as DraftRow["loai_row"],
        so_phong: r.so_phong || 0,
        gia_phong: r.gia_phong || 0,
        foc_count: r.foc_count || 0,
        is_room: isKSRoomRow(r),
        rowFocDeduction: 0,
      }));
    return recomputeFocForDrafts(drafts, focKhach, focMien);
  }, [rows, focKhach, focMien]);

  const [drafts, setDrafts] = useState<DraftRow[]>(initialDrafts);

  // Reset khi modal mở lại (rows thay đổi)
  useEffect(() => {
    if (open) setDrafts(initialDrafts);
  }, [open, initialDrafts]);

  const updateDraft = (id: number, field: "so_phong" | "gia_phong" | "foc_count", value: number) => {
    setDrafts((prev) => {
      const next = prev.map((d) => (d.id === id ? { ...d, [field]: value } : d));
      // Recompute FOC pro-rata nếu là room
      return recomputeFocForDrafts(next, focKhach, focMien);
    });
  };

  const roomDrafts = drafts.filter((d) => d.is_room);
  const serviceDrafts = drafts.filter((d) => !d.is_room);

  // Group rooms by date for display
  const roomsByDay = useMemo(() => {
    const byDay: Record<string, DraftRow[]> = {};
    roomDrafts.forEach((d) => {
      (byDay[d.ngay_date] = byDay[d.ngay_date] || []).push(d);
    });
    return Object.entries(byDay).sort(([a], [b]) => a.localeCompare(b));
  }, [roomDrafts]);

  const sumActualNew = useMemo(
    () => drafts.reduce((s, d) => s + calcRowActual(d), 0),
    [drafts],
  );
  const delta = sumActualNew - sumPaid;

  const handleSave = async () => {
    // Filter chỉ row có thay đổi so với gốc để giảm số call
    const origMap = new Map(initialDrafts.map((d) => [d.id, d]));
    const changed = drafts.filter((d) => {
      const o = origMap.get(d.id);
      if (!o) return true;
      return (
        o.so_phong !== d.so_phong ||
        o.gia_phong !== d.gia_phong ||
        o.foc_count !== d.foc_count
      );
    });
    if (changed.length === 0) {
      toast.info(t("Chưa có thay đổi"));
      return;
    }
    setSaving(true);
    try {
      // Batch update từng row
      await Promise.all(
        changed.map((d) =>
          updateActualMut.mutateAsync({
            id: d.id,
            doan_id: doanId,
            so_luong: d.so_phong,
            don_gia: d.gia_phong,
            foc_count: d.foc_count,
            total_override: calcRowActual(d),
          }),
        ),
      );
      toast.success(`${t("Đã điều chỉnh")} ${changed.length} ${t("dòng")}`);
      onClose();
    } catch (err: unknown) {
      toast.error(t("Lỗi điều chỉnh") + ": " + (errMsg(err) || t("Vui lòng thử lại")));
    } finally {
      setSaving(false);
    }
  };

  const fmtDay = (d: string) => {
    try { return format(new Date(d + "T00:00:00"), "dd/MM/yyyy"); } catch { return d; }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="text-base">
            {t("Điều chỉnh khách sạn")} — {ksName}
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-y-auto space-y-4 py-1">
          <p className="text-xs text-muted-foreground">
            {t("Sửa số phòng / giá thực tế sau khi đã thanh toán. Sau khi lưu, hệ thống sẽ hiển thị chênh lệch (thiếu/thừa) ở dưới card KS để bạn xử lý (tạo ĐNTT bổ sung hoặc ghi nhận công nợ).")}
          </p>

          {/* Room table */}
          {roomDrafts.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-1.5">
                <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  🛏️ {t("Phòng")}
                </span>
              </div>
              <div className="rounded-md border border-border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="text-xs bg-muted/30">
                      <TableHead className="w-[100px] h-auto py-1.5 px-2">{t("Ngày")}</TableHead>
                      <TableHead className="h-auto py-1.5 px-2">{t("Loại phòng")}</TableHead>
                      <TableHead className="w-[80px] h-auto py-1.5 px-2 text-center">{t("Số phòng")}</TableHead>
                      <TableHead className="w-[70px] h-auto py-1.5 px-2 text-center" title={t("Số phòng miễn phí (OP tự nhập). Gợi ý 16免1 hiện ở header ngày.")}>FOC</TableHead>
                      <TableHead className="w-[120px] h-auto py-1.5 px-2 text-right">{t("Giá phòng")}</TableHead>
                      <TableHead className="w-[90px] h-auto py-1.5 px-2 text-right">{t("FOC trừ")}</TableHead>
                      <TableHead className="w-[120px] h-auto py-1.5 px-2 text-right">{t("Thành tiền")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {roomsByDay.map(([date, dayDrafts]) => {
                      const suggest = calcDaySuggestion(dayDrafts, focKhach, focMien);
                      const assignedFoc = dayDrafts.reduce((s, d) => s + (Number(d.foc_count) || 0), 0);
                      return (
                      <Fragment key={date}>
                        <TableRow className="bg-[#E6F1FB] hover:bg-[#E6F1FB]">
                          <TableCell colSpan={7} className="py-1 px-2 text-xs font-medium">
                            <span>{fmtDay(date)}</span>
                            {focKhach && focMien && suggest.totalRooms > 0 && (
                              <span className="ml-2 text-[10px] font-normal text-muted-foreground">
                                · {focKhach}免{focMien}:{" "}
                                <span className={
                                  assignedFoc === suggest.suggestedFoc
                                    ? "font-medium text-emerald-700"
                                    : "font-medium text-orange-700"
                                }>
                                  {t("gợi ý")} {suggest.suggestedFoc} / {t("đã gán")} {assignedFoc}
                                </span>
                              </span>
                            )}
                          </TableCell>
                        </TableRow>
                        {dayDrafts.map((d) => (
                          <TableRow key={d.id} className="text-xs">
                            <TableCell className="py-1 px-2 text-xs text-muted-foreground">
                              {fmtDay(d.ngay_date)}
                            </TableCell>
                            <TableCell className="py-1 px-2 text-xs">{d.loai_phong || "—"}</TableCell>
                            <TableCell className="py-1 px-2">
                              <Input
                                type="number"
                                min={0}
                                value={d.so_phong}
                                onChange={(e) => updateDraft(d.id, "so_phong", Number(e.target.value) || 0)}
                                className="h-7 text-xs text-center w-full [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                              />
                            </TableCell>
                            <TableCell className="py-1 px-2">
                              <Input
                                type="number"
                                min={0}
                                step="0.5"
                                value={d.foc_count}
                                onChange={(e) => updateDraft(d.id, "foc_count", Number(e.target.value) || 0)}
                                className="h-7 text-xs text-center w-full [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                              />
                            </TableCell>
                            <TableCell className="py-1 px-2">
                              <DecimalInput
                                value={d.gia_phong}
                                onChange={(v) => updateDraft(d.id, "gia_phong", v ?? 0)}
                                placeholder="0"
                                className="h-7 text-xs w-full text-right"
                              />
                            </TableCell>
                            <TableCell className="py-1 px-2 text-right text-xs text-orange-700 tabular-nums">
                              {d.rowFocDeduction > 0 ? `−${fmt(d.rowFocDeduction)}` : "—"}
                            </TableCell>
                            <TableCell className="py-1 px-2 text-right text-xs font-medium tabular-nums">
                              {fmt(calcRowActual(d))}
                            </TableCell>
                          </TableRow>
                        ))}
                      </Fragment>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}

          {/* Service table */}
          {serviceDrafts.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-1.5">
                <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  🍽️ {t("Dịch vụ KS")}
                </span>
              </div>
              <div className="rounded-md border border-border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="text-xs bg-muted/30">
                      <TableHead className="w-[100px] h-auto py-1.5 px-2">{t("Ngày")}</TableHead>
                      <TableHead className="h-auto py-1.5 px-2">{t("Tên dịch vụ")}</TableHead>
                      <TableHead className="w-[60px] h-auto py-1.5 px-2 text-center">{t("SL")}</TableHead>
                      <TableHead className="w-[60px] h-auto py-1.5 px-2 text-center">FOC</TableHead>
                      <TableHead className="w-[120px] h-auto py-1.5 px-2 text-right">{t("Đơn giá")}</TableHead>
                      <TableHead className="w-[120px] h-auto py-1.5 px-2 text-right">{t("Thành tiền")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {serviceDrafts.map((d) => (
                      <TableRow key={d.id} className="text-xs">
                        <TableCell className="py-1 px-2 text-xs text-muted-foreground">
                          {fmtDay(d.ngay_date)}
                        </TableCell>
                        <TableCell className="py-1 px-2 text-xs">{d.loai_phong || "—"}</TableCell>
                        <TableCell className="py-1 px-2">
                          <Input
                            type="number"
                            min={0}
                            value={d.so_phong}
                            onChange={(e) => updateDraft(d.id, "so_phong", Number(e.target.value) || 0)}
                            className="h-7 text-xs text-center w-full [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                          />
                        </TableCell>
                        <TableCell className="py-1 px-2">
                          <Input
                            type="number"
                            min={0}
                            value={d.foc_count}
                            onChange={(e) => updateDraft(d.id, "foc_count", Number(e.target.value) || 0)}
                            className="h-7 text-xs text-center w-full [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                          />
                        </TableCell>
                        <TableCell className="py-1 px-2">
                          <DecimalInput
                            value={d.gia_phong}
                            onChange={(v) => updateDraft(d.id, "gia_phong", v ?? 0)}
                            placeholder="0"
                            className="h-7 text-xs w-full text-right"
                          />
                        </TableCell>
                        <TableCell className="py-1 px-2 text-right text-xs font-medium tabular-nums">
                          {fmt(calcRowActual(d))}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}

          {drafts.length === 0 && (
            <p className="text-sm text-muted-foreground py-6 text-center">
              {t("Không có dòng chi phí nào để điều chỉnh.")}
            </p>
          )}
        </div>

        {/* Preview summary */}
        {drafts.length > 0 && (
          <div className="border-t border-border pt-3 space-y-1.5 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">{t("Thực tế mới")}:</span>
              <span className="font-semibold tabular-nums">{fmt(sumActualNew)} ₫</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">{t("Đã thanh toán")}:</span>
              <span className="tabular-nums">{fmt(sumPaid)} ₫</span>
            </div>
            <div className="flex items-center justify-between font-medium">
              <span className="text-muted-foreground">{t("Chênh lệch")}:</span>
              <span
                className={
                  delta > 0 ? "text-orange-700 tabular-nums"
                  : delta < 0 ? "text-purple-700 tabular-nums"
                  : "text-muted-foreground tabular-nums"
                }
              >
                {delta > 0 ? "+" : delta < 0 ? "−" : ""}
                {fmt(Math.abs(delta))} ₫
                {delta > 0 && ` (${t("thiếu — cần TT bổ sung")})`}
                {delta < 0 && ` (${t("thừa — cần ghi nhận CN/HT")})`}
              </span>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>{t("Hủy")}</Button>
          <Button onClick={handleSave} disabled={saving || drafts.length === 0}>
            {saving ? t("Đang lưu...") : t("Lưu điều chỉnh")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
