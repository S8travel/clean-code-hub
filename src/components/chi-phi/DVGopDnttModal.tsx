import { useEffect, useMemo, useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Layers } from "lucide-react";
import { toast } from "sonner";
import { errMsg } from "@/lib/error";
import { cn } from "@/lib/utils";
import { useInsertDNTT, type ChiPhiRow } from "@/hooks/use-chi-phi";
import { useNhaCungCapList } from "@/hooks/use-nha-cung-cap";
import { groupGopByNcc, sumSelected, type GopNccGroup } from "@/lib/dntt-gop-calc";
import { t, useTranslate } from "@/lib/i18n";

const fmt = (n: number) => n.toLocaleString("vi-VN");

interface Props {
  open: boolean;
  onClose: () => void;
  doanId: number;
  tenDoan?: string;
  /** Các dòng dịch vụ chính (danh_muc='canh_diem', không phải extras). */
  dvRows: ChiPhiRow[];
}

export default function DVGopDnttModal({ open, onClose, doanId, dvRows }: Props) {
  useTranslate();
  const insertDNTT = useInsertDNTT();
  const { data: nccList = [] } = useNhaCungCapList();
  const nccById = useMemo(() => {
    const m = new Map<number, (typeof nccList)[number]>();
    for (const n of nccList) m.set(n.id, n);
    return m;
  }, [nccList]);

  const groups = useMemo(() => groupGopByNcc(dvRows), [dvRows]);

  // Chọn mặc định tất cả item; reset mỗi khi mở modal hoặc nhóm đổi.
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [ngayCan, setNgayCan] = useState("");
  const [submittingNcc, setSubmittingNcc] = useState<number | null>(null);

  useEffect(() => {
    if (!open) return;
    setSelected(new Set(groups.flatMap((g) => g.items.map((i) => i.chi_phi_id))));
  }, [open, groups]);

  const toggle = (id: number) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });

  const handleCreate = async (group: GopNccGroup) => {
    const items = group.items.filter((i) => selected.has(i.chi_phi_id));
    if (items.length === 0) { toast.error(t("Chọn ít nhất 1 dịch vụ để gộp")); return; }
    const soTien = items.reduce((s, i) => s + i.remaining, 0);
    if (soTien <= 0) { toast.error(t("Tổng tiền gộp phải lớn hơn 0")); return; }
    const ncc = nccById.get(group.nccId);
    const nccTen = ncc?.ten ?? `NCC #${group.nccId}`;
    setSubmittingNcc(group.nccId);
    try {
      await insertDNTT.mutateAsync({
        doan_id: doanId,
        loai: "dich_vu",
        mo_ta: `[Gộp] ${nccTen}: ${items.map((i) => i.label).join(", ")}`.slice(0, 500),
        nha_cung_cap_id: group.nccId,
        so_tien: soTien,
        la_coc: false,
        trang_thai_duyet: "cho_duyet",
        ref_loai: "doan_chi_phi",
        ref_id: items[0].chi_phi_id,
        ngay_can_thanh_toan: ngayCan || null,
        allocations: items.map((i) => ({ chi_phi_id: i.chi_phi_id, so_tien: i.remaining })),
      });
      toast.success(t("Đã tạo ĐNTT gộp cho") + ` ${nccTen}`);
      // dvRows sẽ refresh (insertDNTT invalidate doan_chi_phi) → nhóm này biến mất.
    } catch (e: unknown) {
      toast.error(t("Lỗi tạo ĐNTT gộp: ") + (errMsg(e) || ""));
    } finally {
      setSubmittingNcc(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && !submittingNcc && onClose()}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Layers className="h-4 w-4" /> {t("ĐNTT gộp theo nhà cung cấp")}
          </DialogTitle>
        </DialogHeader>

        <p className="text-xs text-muted-foreground -mt-1">
          {t("Gộp các dịch vụ cùng nhà cung cấp thành 1 đề nghị thanh toán. Số tiền mỗi dòng là phần chưa ĐNTT.")}
        </p>

        <div className="flex items-center gap-2 text-xs">
          <Label className="text-xs">{t("Ngày cần thanh toán")}</Label>
          <Input
            type="date" value={ngayCan} onChange={(e) => setNgayCan(e.target.value)}
            className="h-8 w-40 text-xs"
          />
        </div>

        {groups.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
            {t("Không có nhóm dịch vụ cùng nhà cung cấp để gộp.")}
            <br />
            <span className="text-xs">{t("Cần ≥2 dịch vụ cùng NCC, công ty trả, chưa thanh toán hết.")}</span>
          </div>
        ) : (
          <div className="space-y-3">
            {groups.map((group) => {
              const ncc = nccById.get(group.nccId);
              const selTotal = sumSelected(group.items, selected);
              const selCount = group.items.filter((i) => selected.has(i.chi_phi_id)).length;
              return (
                <div key={group.nccId} className="rounded-lg border border-border overflow-hidden">
                  <div className="px-3 py-2 bg-muted/30 border-b border-border">
                    <p className="text-sm font-semibold">{ncc?.ten ?? `NCC #${group.nccId}`}</p>
                    {(ncc?.so_tai_khoan || ncc?.ngan_hang) && (
                      <p className="text-[11px] text-muted-foreground">
                        {[ncc?.ngan_hang, ncc?.so_tai_khoan].filter(Boolean).join(" · ")}
                      </p>
                    )}
                  </div>
                  <div className="divide-y divide-border">
                    {group.items.map((i) => (
                      <label
                        key={i.chi_phi_id}
                        className="flex items-center gap-2 px-3 py-1.5 text-xs cursor-pointer hover:bg-muted/20"
                      >
                        <Checkbox
                          checked={selected.has(i.chi_phi_id)}
                          onCheckedChange={() => toggle(i.chi_phi_id)}
                          className="h-3.5 w-3.5"
                        />
                        <span className="flex-1 truncate">
                          {i.ngay_so ? <span className="text-muted-foreground mr-1">N{i.ngay_so}</span> : null}
                          {i.label}
                        </span>
                        <span className="font-medium tabular-nums">{fmt(i.remaining)} ₫</span>
                      </label>
                    ))}
                  </div>
                  <div className="flex items-center justify-between gap-3 px-3 py-2 bg-muted/20 border-t border-border">
                    <span className="text-xs text-muted-foreground">
                      {t("Đã chọn")} {selCount}/{group.items.length} · <b className="text-foreground">{fmt(selTotal)} ₫</b>
                    </span>
                    <Button
                      size="sm"
                      className={cn("h-7 text-xs", selTotal <= 0 && "opacity-50")}
                      disabled={selTotal <= 0 || submittingNcc === group.nccId}
                      onClick={() => handleCreate(group)}
                    >
                      <Layers className="h-3.5 w-3.5 mr-1" />
                      {submittingNcc === group.nccId ? t("Đang tạo...") : `${t("Tạo ĐNTT gộp")} (${fmt(selTotal)} ₫)`}
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div className="flex justify-end pt-2">
          <Button variant="outline" size="sm" onClick={onClose} disabled={!!submittingNcc}>
            {t("Đóng")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
