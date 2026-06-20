import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Check, X } from "lucide-react";
import { toast } from "sonner";
import { useInsertDNTT, useUpdateDNTT, type DNTTRow } from "@/hooks/use-chi-phi";
import { t, useTranslate } from "@/lib/i18n";

const fmt = (n: number) => Math.round(n).toLocaleString("vi-VN");

interface Props {
  chiPhiId: number | undefined;
  doanId: number;
  thanhTien: number;
  moTa: string;
  nhaCungCapId?: number | null;
  loai?: string;
  dnttList: DNTTRow[];
  selectedDnttIds: Set<number>;
  onToggleDntt: (id: number) => void;
}

export default function DNTTCell({
  chiPhiId, doanId, thanhTien, moTa, nhaCungCapId,
  loai = "khach_san",
  dnttList, selectedDnttIds, onToggleDntt,
}: Props) {
  useTranslate();
  const insertDNTT = useInsertDNTT();
  const updateDNTT = useUpdateDNTT();

  // Cọc modal
  const [cocOpen, setCocOpen] = useState(false);
  const [cocMode, setCocMode] = useState<"percent" | "amount">("percent");
  const [cocValue, setCocValue] = useState(30);

  // Resend modal (for rejected ĐNTT)
  const [resendOpen, setResendOpen] = useState(false);
  const [resendId, setResendId] = useState<number | null>(null);
  const [resendMode, setResendMode] = useState<"full" | "partial">("full");
  const [resendAmount, setResendAmount] = useState(0);

  // Inline edit for pending ĐNTT
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editAmount, setEditAmount] = useState("");

  if (!chiPhiId) {
    return <span className="text-xs text-muted-foreground">{t("Lưu trước")}</span>;
  }

  const myDntt = dnttList.filter(d => d.ref_loai === "doan_chi_phi" && d.ref_id === chiPhiId);
  const hasCoc = myDntt.some(d => d.la_coc);
  const hasFullDntt = myDntt.some(d => !d.la_coc);
  const allRejected = myDntt.length > 0 && myDntt.every(d => d.trang_thai_duyet === "tu_choi");
  const totalDntt = myDntt.reduce((s, d) => s + d.so_tien, 0);
  const remaining = thanhTien - totalDntt;

  const isPending = insertDNTT.isPending || updateDNTT.isPending;

  const handleSendDNTT = (laCoc: boolean, soTien: number, tyleCoc?: number) => {
    insertDNTT.mutate({
      doan_id: doanId,
      loai,
      mo_ta: moTa,
      nha_cung_cap_id: nhaCungCapId || null,
      so_tien: soTien,
      la_coc: laCoc,
      ty_le_coc: tyleCoc || null,
      trang_thai_duyet: "cho_duyet",
      ref_loai: "doan_chi_phi",
      ref_id: chiPhiId,
      allocations: [{ chi_phi_id: chiPhiId, so_tien: soTien }],
    }, {
      onSuccess: () => toast.success(t("Đã gửi ĐNTT")),
    });
  };

  const handleResendOpen = (d: DNTTRow) => {
    setResendId(d.id);
    setResendMode("full");
    setResendAmount(thanhTien);
    setResendOpen(true);
  };

  const handleResendSubmit = () => {
    if (!resendId) return;
    const soTien = resendMode === "full" ? thanhTien : resendAmount;
    if (soTien <= 0) {
      toast.error(t("Số tiền không hợp lệ"));
      return;
    }
    updateDNTT.mutate({
      id: resendId,
      doanId,
      so_tien: soTien,
      trang_thai_duyet: "cho_duyet",
      duyet_boi: null,
      duyet_luc: null,
      ghi_chu: null,
    }, {
      onSuccess: () => {
        toast.success(t("Đã gửi lại ĐNTT"));
        setResendOpen(false);
      },
    });
  };

  const handleEditSave = (id: number) => {
    const val = Number(editAmount);
    if (!val || val <= 0) {
      toast.error(t("Số tiền không hợp lệ"));
      return;
    }
    updateDNTT.mutate({
      id,
      doanId,
      so_tien: val,
    }, {
      onSuccess: () => {
        toast.success(t("Đã cập nhật ĐNTT"));
        setEditingId(null);
      },
    });
  };

  const handleCocSubmit = () => {
    const soTien = cocMode === "percent"
      ? Math.round(thanhTien * cocValue / 100)
      : cocValue;
    if (soTien <= 0 || soTien >= thanhTien) {
      toast.error(t("Số tiền cọc không hợp lệ"));
      return;
    }
    handleSendDNTT(true, soTien, cocMode === "percent" ? cocValue : undefined);
    setCocOpen(false);
  };

  return (
    <div className="space-y-1.5 min-w-[160px]">
      {myDntt.map(d => (
        <div key={d.id} className="flex items-center gap-1.5 text-xs">
          {d.trang_thai_duyet === "tu_choi" ? (
            <>
              <Badge variant="destructive" className="text-[10px] px-1.5 py-0">
                {t("Từ chối")} · {fmt(d.so_tien)}
              </Badge>
              <Button size="sm" variant="outline" className="h-5 text-[10px] px-2"
                disabled={isPending}
                onClick={() => handleResendOpen(d)}>
                {t("Gửi lại")}
              </Button>
            </>
          ) : editingId === d.id ? (
            <div className="flex items-center gap-1">
              <Input
                type="number"
                value={editAmount}
                onChange={(e) => setEditAmount(e.target.value)}
                className="h-6 text-[10px] w-[80px] [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                autoFocus
              />
              <Button size="icon" variant="ghost" className="h-5 w-5"
                disabled={isPending}
                onClick={() => handleEditSave(d.id)}>
                <Check className="h-3 w-3 text-green-600" />
              </Button>
              <Button size="icon" variant="ghost" className="h-5 w-5"
                onClick={() => setEditingId(null)}>
                <X className="h-3 w-3 text-destructive" />
              </Button>
            </div>
          ) : (
            <>
              <Checkbox
                checked={selectedDnttIds.has(d.id)}
                onCheckedChange={() => onToggleDntt(d.id)}
                className="h-3.5 w-3.5"
              />
              <Badge
                variant={d.trang_thai_duyet === "da_duyet" ? "default" : "secondary"}
                className="text-[10px] px-1.5 py-0"
              >
                {d.trang_thai_duyet === "da_duyet" ? t("Đã duyệt") : t("Chờ duyệt")} · {fmt(d.so_tien)}
              </Badge>
              {/* ĐNTT sai → hủy, KHÔNG sửa inline (gỡ pencil 2026-05-26) */}
            </>
          )}
        </div>
      ))}

      {myDntt.length === 0 && thanhTien > 0 && (
        <div className="flex gap-1">
          <Button size="sm" variant="outline" className="h-6 text-[10px] px-2"
            disabled={isPending}
            onClick={() => handleSendDNTT(false, thanhTien)}>
            {t("Gửi ĐNTT:")} {fmt(thanhTien)}
          </Button>
          <Button size="sm" variant="outline" className="h-6 text-[10px] px-2"
            disabled={isPending}
            onClick={() => setCocOpen(true)}>
            {t("Cọc...")}
          </Button>
        </div>
      )}

      {hasCoc && !hasFullDntt && remaining > 0 && !allRejected && (
        <Button size="sm" variant="outline" className="h-6 text-[10px] px-2"
          disabled={isPending}
          onClick={() => handleSendDNTT(false, remaining)}>
          {t("Gửi ĐNTT:")} {fmt(remaining)}
        </Button>
      )}

      {allRejected && thanhTien > 0 && (
        <div className="flex gap-1 mt-1">
          <Button size="sm" variant="outline" className="h-6 text-[10px] px-2"
            disabled={isPending}
            onClick={() => handleSendDNTT(false, thanhTien)}>
            {t("Gửi ĐNTT:")} {fmt(thanhTien)}
          </Button>
          <Button size="sm" variant="outline" className="h-6 text-[10px] px-2"
            disabled={isPending}
            onClick={() => setCocOpen(true)}>
            {t("Cọc...")}
          </Button>
        </div>
      )}

      <Dialog open={cocOpen} onOpenChange={setCocOpen}>
        <DialogContent className="sm:max-w-[360px]">
          <DialogHeader>
            <DialogTitle className="text-sm">{t("Gửi cọc")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">{t("Thành tiền:")} {fmt(thanhTien)} VND</p>
            <RadioGroup value={cocMode} onValueChange={(v) => setCocMode(v as "percent" | "amount")} className="flex gap-4">
              <div className="flex items-center gap-1.5">
                <RadioGroupItem value="percent" id="coc-pct" />
                <Label htmlFor="coc-pct" className="text-xs">{t("% cọc")}</Label>
              </div>
              <div className="flex items-center gap-1.5">
                <RadioGroupItem value="amount" id="coc-amt" />
                <Label htmlFor="coc-amt" className="text-xs">{t("Số tiền")}</Label>
              </div>
            </RadioGroup>
            <Input
              type="number"
              value={cocValue || ""}
              onChange={e => setCocValue(Number(e.target.value) || 0)}
              placeholder={cocMode === "percent" ? t("VD: 30") : t("VD: 5000000")}
              className="h-8 text-xs [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
            />
            {cocMode === "percent" && cocValue > 0 && (
              <p className="text-xs text-muted-foreground">
                = {fmt(Math.round(thanhTien * cocValue / 100))} VND · {t("Còn lại:")} {fmt(thanhTien - Math.round(thanhTien * cocValue / 100))} VND
              </p>
            )}
            {cocMode === "amount" && cocValue > 0 && (
              <p className="text-xs text-muted-foreground">
                {t("Còn lại:")} {fmt(thanhTien - cocValue)} VND
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setCocOpen(false)}>{t("Hủy")}</Button>
            <Button size="sm" onClick={handleCocSubmit} disabled={isPending}>{t("Gửi cọc")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={resendOpen} onOpenChange={setResendOpen}>
        <DialogContent className="sm:max-w-[360px]">
          <DialogHeader>
            <DialogTitle className="text-sm">{t("Gửi lại ĐNTT")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">{t("Thành tiền:")} {fmt(thanhTien)} VND</p>
            <RadioGroup value={resendMode} onValueChange={(v) => setResendMode(v as "full" | "partial")} className="flex gap-4">
              <div className="flex items-center gap-1.5">
                <RadioGroupItem value="full" id="resend-full" />
                <Label htmlFor="resend-full" className="text-xs">{t("Thanh toán toàn bộ")}</Label>
              </div>
              <div className="flex items-center gap-1.5">
                <RadioGroupItem value="partial" id="resend-partial" />
                <Label htmlFor="resend-partial" className="text-xs">{t("Thanh toán 1 phần")}</Label>
              </div>
            </RadioGroup>
            {resendMode === "partial" && (
              <>
                <Input
                  type="number"
                  value={resendAmount || ""}
                  onChange={e => setResendAmount(Number(e.target.value) || 0)}
                  placeholder={t("Nhập số tiền")}
                  className="h-8 text-xs [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                />
                {resendAmount > 0 && (
                  <p className="text-xs text-muted-foreground">
                    {t("Còn lại:")} {fmt(thanhTien - resendAmount)} VND
                  </p>
                )}
              </>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setResendOpen(false)}>{t("Hủy")}</Button>
            <Button size="sm" onClick={handleResendSubmit} disabled={isPending}>{t("Gửi lại")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
