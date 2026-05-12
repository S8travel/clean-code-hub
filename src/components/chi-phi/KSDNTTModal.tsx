import { useState } from "react";
import { format, subDays, parseISO } from "date-fns";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { proRataInts } from "@/lib/pro-rata";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DatePicker } from "@/components/ui/date-picker";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import { useInsertDNTT } from "@/hooks/use-chi-phi";
import { externalSupabase } from "@/lib/supabase-external";
import { recalcChiPhiStatus } from "@/hooks/use-dntt";
import { appendCanTruLog } from "@/hooks/use-cong-no";
import type { LocalKSRow } from "./ChiPhiKSSection";
import KSCongNoPanel, { type CanTruSelection } from "./KSCongNoPanel";

const fmt = (n: number) => n.toLocaleString("vi-VN");

interface Props {
  open: boolean;
  onClose: () => void;
  doanId: number;
  ksId: number;
  ksName: string;
  nccId: number | null;
  nccTen: string | null;
  nccStk: string | null;
  nccNganHang: string | null;
  totalKS: number;
  daCoc: number;
  localRows: LocalKSRow[];
  chiPhiRowIds: number[];
  canTru: CanTruSelection | null;
  onCanTruChange: (v: CanTruSelection | null) => void;
  tenDoanMoi: string;
  serviceDate?: string;
}

function defaultNgayCan(serviceDate?: string): string {
  if (!serviceDate) return "";
  try {
    return format(subDays(parseISO(serviceDate), 1), "yyyy-MM-dd");
  } catch {
    return "";
  }
}

export default function KSDNTTModal({
  open, onClose, doanId, ksId, ksName, nccId, nccTen, nccStk, nccNganHang,
  totalKS, daCoc, localRows, chiPhiRowIds, canTru, onCanTruChange, tenDoanMoi, serviceDate,
}: Props) {
  const conLai = totalKS - daCoc;
  const canTruAmount = canTru?.soTienCanTru ?? 0;
  const thucThanhToan = Math.max(conLai - canTruAmount, 0);

  const [mode, setMode] = useState<"full" | "deposit">("full");
  const [depositAmount, setDepositAmount] = useState<number>(0);
  const [ghiChu, setGhiChu] = useState("");
  const [ngayCan, setNgayCan] = useState<string>(() => defaultNgayCan(serviceDate));
  const insertDNTT = useInsertDNTT();
  const qc = useQueryClient();
  const [submitting, setSubmitting] = useState(false);

  const soTien = mode === "full" ? thucThanhToan : depositAmount;
  const soTienConLai = mode === "full" ? 0 : thucThanhToan - depositAmount;

  const buildMoTa = () => {
    const parts: string[] = [];
    localRows.forEach((r) => {
      const dateStr = r.ngay_date ? format(new Date(r.ngay_date), "dd/MM") : "?";
      parts.push(`${r.loai_phong || "Phòng"} x${r.so_phong} (${dateStr})`);
    });
    return `${ksName} - ${parts.join(", ")}`;
  };

  const handleSubmit = async () => {
    if (soTien <= 0 && canTruAmount <= 0) {
      toast.error("Số tiền phải lớn hơn 0");
      return;
    }
    setSubmitting(true);
    try {
      // 1. Tạo 1 ĐNTT cho FULL amount = soTien + canTruAmount
      const fullAmount = soTien + canTruAmount;
      const allocRows = localRows.filter((r) => r.id && chiPhiRowIds.includes(r.id));
      // Largest-remainder split → SUM(allocations.so_tien) === fullAmount
      const allocAmts = proRataInts(fullAmount, allocRows.map((r) => r.thanh_tien));
      const allocations = allocRows.map((r, i) => ({
        chi_phi_id: r.id!,
        so_tien: allocAmts[i],
      }));

      const payload = {
        doan_id: doanId,
        loai: "khach_san",
        mo_ta: buildMoTa(),
        nha_cung_cap_id: nccId,
        ten_nha_cung_cap: nccTen,
        so_tai_khoan: nccStk,
        ngan_hang: nccNganHang,
        so_tien: fullAmount,
        la_coc: mode === "deposit",
        trang_thai_duyet: "cho_duyet",
        ref_loai: "khach_san",
        ref_id: ksId,
        ghi_chu: ghiChu || null,
        ngay_can_thanh_toan: ngayCan || null,
        allocations: allocations.length > 0 ? allocations : undefined,
      };
      const mainRecord = await insertDNTT.mutateAsync(payload);
      const mainDnttId = (mainRecord as any)?.id ?? null;

      // 2. Nếu có cấn trừ: insert payment can_tru ngay
      if (canTru && canTruAmount > 0 && mainDnttId) {
        const { error: payErr } = await externalSupabase.from("payments").insert({
          dntt_id: mainDnttId,
          method: "can_tru",
          so_tien: canTruAmount,
          cong_no_id: canTru.congNoId,
          ghi_chu: `Cấn trừ từ đoàn: ${canTru.tenDoan}`,
        });
        if (payErr) throw payErr;
        await appendCanTruLog(canTru.congNoId, canTruAmount, tenDoanMoi);
        await recalcChiPhiStatus(chiPhiRowIds);
        onCanTruChange(null);
        qc.invalidateQueries({ queryKey: ["cong-no"] });
        qc.invalidateQueries({ queryKey: ["cong-no-by-ncc"] });
        qc.invalidateQueries({ queryKey: ["payments-by-chi-phi", doanId] });
      }

      if (chiPhiRowIds.length > 0) {
        await externalSupabase
          .from("doan_chi_phi")
          .update({ trang_thai_dntt: "cho_duyet" })
          .in("id", chiPhiRowIds);
      }

      qc.invalidateQueries({ queryKey: ["de_nghi_thanh_toan", doanId] });
      qc.invalidateQueries({ queryKey: ["dntt-list"] });
      toast.success("Đã tạo đề nghị thanh toán");
      onClose();
    } catch (err: any) {
      toast.error("Lỗi: " + (err?.message || "Không thể tạo ĐNTT"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-sm">Tạo đề nghị thanh toán — {ksName}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Tóm tắt số tiền */}
          <div className="text-xs space-y-1 bg-muted/40 rounded-md px-3 py-2">
            <div className="flex justify-between">
              <span>Tổng tiền KS:</span>
              <span className="font-semibold">{fmt(totalKS)} VND</span>
            </div>
            {daCoc > 0 && (
              <div className="flex justify-between text-muted-foreground">
                <span>Đã thanh toán:</span>
                <span>{fmt(daCoc)} VND</span>
              </div>
            )}
            <div className="flex justify-between">
              <span>Còn lại:</span>
              <span className="font-semibold">{fmt(conLai)} VND</span>
            </div>
            {canTru && canTruAmount > 0 && (
              <>
                <div className="flex justify-between text-amber-600">
                  <span>Cấn trừ (từ đoàn {canTru.tenDoan}):</span>
                  <span className="font-semibold">− {fmt(canTruAmount)} VND</span>
                </div>
                <div className="flex justify-between font-semibold border-t border-border pt-1 mt-1">
                  <span>Thực thanh toán:</span>
                  <span>{fmt(thucThanhToan)} VND</span>
                </div>
              </>
            )}
          </div>

          {/* Cấn trừ công nợ */}
          <KSCongNoPanel
            nccId={nccId}
            doanId={doanId}
            value={canTru}
            onChange={onCanTruChange}
          />

          {/* Chọn hình thức */}
          {thucThanhToan > 0 && (
            <RadioGroup value={mode} onValueChange={(v) => setMode(v as "full" | "deposit")} className="space-y-2">
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="full" id="full" />
                <Label htmlFor="full" className="text-xs cursor-pointer">
                  Toàn bộ — {fmt(thucThanhToan)} VND
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="deposit" id="deposit" />
                <Label htmlFor="deposit" className="text-xs cursor-pointer">
                  1 phần (cọc/cấn trừ)
                </Label>
              </div>
            </RadioGroup>
          )}

          {mode === "deposit" && thucThanhToan > 0 && (
            <div className="space-y-2">
              <Label className="text-xs">Số tiền cọc/cấn trừ</Label>
              <Input
                type="number"
                className="h-8 text-xs"
                value={depositAmount || ""}
                onChange={(e) => setDepositAmount(Number(e.target.value) || 0)}
                max={thucThanhToan}
                min={0}
              />
              {depositAmount > 0 && (
                <p className="text-[11px] text-muted-foreground">
                  Còn lại: {fmt(thucThanhToan - depositAmount)} VND
                </p>
              )}
            </div>
          )}

          {/* Ngày cần thanh toán */}
          <div className="space-y-1.5">
            <Label className="text-xs">Ngày cần thanh toán</Label>
            <DatePicker className="h-8 text-xs w-full" value={ngayCan} onChange={setNgayCan} />
          </div>

          {/* Ghi chú */}
          <div className="space-y-1.5">
            <Label className="text-xs">Ghi chú</Label>
            <Textarea
              className="text-xs min-h-[60px] resize-none"
              placeholder="Ghi chú thêm (tùy chọn)"
              value={ghiChu}
              onChange={(e) => setGhiChu(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" className="text-xs" onClick={onClose}>Hủy</Button>
          <Button
            size="sm"
            className="text-xs"
            onClick={handleSubmit}
            disabled={submitting || (soTien <= 0 && canTruAmount <= 0)}
          >
            Tạo đề nghị TT
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
