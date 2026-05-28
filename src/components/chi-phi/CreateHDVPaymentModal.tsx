import { useState, useEffect } from "react";
import { format, addDays } from "date-fns";
import { FileDown } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { errMsg } from "@/lib/error";
import { useCreateHDVPayment, type HDVInfo } from "@/hooks/use-chi-phi-hdv";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";
import { exportHDVQuyetToanExcel } from "@/lib/export-hdv-quyet-toan-excel";
import { t } from "@/lib/i18n";
import type { HDVDoanInfo } from "./hdv-shared";

const fmt = (n: number) => n.toLocaleString("vi-VN");

interface CreateModalProps {
  doanId: number;
  hdvId: number | null;
  refLoai: "hdv_tam_ung" | "hdv_quyet_toan";
  title: string;
  defaultSoTien?: number;
  defaultLaThuHoi?: boolean;
  // Quyết toán context — chỉ dùng cho hdv_quyet_toan
  doan?: HDVDoanInfo;
  tongHdvChi?: number;
  hdv?: HDVInfo | null;  // full info để in file (cần STK + ngân hàng)
  onClose: () => void;
}

export function CreateHDVPaymentModal({
  doanId, hdvId, refLoai, title, defaultSoTien, defaultLaThuHoi,
  doan, tongHdvChi, hdv,
  onClose,
}: CreateModalProps) {
  const hdvName = hdv?.ten ?? "";
  const createMut = useCreateHDVPayment();
  const { user } = useAuth();
  const isQT = refLoai === "hdv_quyet_toan";

  // Defaults từ doan
  const soKhachDefault =
    (doan?.so_khach_lon ?? 0) + (doan?.so_khach_em1 ?? 0) +
    (doan?.so_khach_em2 ?? 0) + (doan?.so_khach_tl ?? 0) ||
    doan?.so_khach || 0;
  const soNgayDefault = doan?.ngay_di && doan?.ngay_ve
    ? Math.max(1, Math.ceil((new Date(doan.ngay_ve).getTime() - new Date(doan.ngay_di).getTime()) / 86400000) + 1)
    : 0;
  const coTL = (doan?.so_khach_tl ?? 0) > 0;
  const tipDonGiaDefault = coTL ? 150 : 300;
  const tyGiaDefault = (() => {
    const s = typeof window !== "undefined" ? localStorage.getItem("hdv_ty_gia_ndt") : null;
    return s ? Number(s) : 800;
  })();
  const tongHdvChiVal = tongHdvChi ?? 0;

  // Common state
  const [soTien, setSoTien] = useState(defaultSoTien ?? 0);
  const [moTa, setMoTa] = useState(
    isQT
      ? `${t("Quyết toán HDV")} ${hdvName} ${soKhachDefault}p ${soNgayDefault}`.replace(/\s+/g, " ").trim()
      : t("Tạm ứng cho hướng dẫn viên"),
  );
  const [ghiChu, setGhiChu] = useState("");
  const [laThuHoi, setLaThuHoi] = useState(defaultLaThuHoi ?? false);
  // Default = hôm nay + 2 ngày; null sort xuống cuối list ĐNTT page → user dễ bỏ sót.
  const [ngayCanTT, setNgayCanTT] = useState(format(addDays(new Date(), 2), "yyyy-MM-dd"));

  // Quyết toán state (7 fields theo form S8 BM02.1-20)
  const [tamUng, setTamUng] = useState(0);
  const [thuTrachNhiem, setThuTrachNhiem] = useState(0);
  const [tipSoKhach, setTipSoKhach] = useState(soKhachDefault);
  const [tipDonGia, setTipDonGia] = useState(tipDonGiaDefault);
  const [tipTyGia, setTipTyGia] = useState(tyGiaDefault);
  const [dauKhachSoKhach, setDauKhachSoKhach] = useState(soKhachDefault);
  const [dauKhachDonGia, setDauKhachDonGia] = useState(0);
  const [quyVpSoLuong, setQuyVpSoLuong] = useState(1);
  const [quyVpDonGia, setQuyVpDonGia] = useState(0);
  const [thuBanOp, setThuBanOp] = useState(0);
  const [thuKhac, setThuKhac] = useState(0);

  // Auto-compute
  // Tip = số khách × đơn giá NT/khách/ngày × số ngày × tỷ giá
  const thuTipVnd = tipSoKhach * tipDonGia * soNgayDefault * tipTyGia;
  const thuDauKhachVnd = dauKhachSoKhach * dauKhachDonGia;
  const thuQuyVpVnd = quyVpSoLuong * quyVpDonGia;
  const tongThu = tamUng + thuTrachNhiem + thuTipVnd + thuDauKhachVnd + thuQuyVpVnd + thuBanOp + thuKhac;
  const conPhaiThanhToan = tongHdvChiVal - tongThu;

  // Auto-sync ĐNTT với |conPhaiThanhToan| trong QT mode. Mỗi khi quyết toán field
  // đổi (tongHdvChi/tip/đầu khách/...), soTien + laThuHoi tự cập nhật. User vẫn
  // có thể sửa ĐNTT tay — override stick cho tới khi field QT đổi tiếp.
  useEffect(() => {
    if (!isQT) return;
    setSoTien(Math.abs(conPhaiThanhToan));
    setLaThuHoi(conPhaiThanhToan < 0);
  }, [conPhaiThanhToan, isQT]);

  const buildQuyetToanData = () => ({
    tam_ung: tamUng,
    thu_trach_nhiem: thuTrachNhiem,
    thu_tip: { so_khach: tipSoKhach, don_gia_nt: tipDonGia, ty_gia: tipTyGia },
    thu_dau_khach: { so_khach: dauKhachSoKhach, don_gia: dauKhachDonGia },
    thu_quy_vp: { so_luong: quyVpSoLuong, don_gia: quyVpDonGia },
    thu_ban_op: thuBanOp,
    thu_khac: thuKhac,
    tong_hdv_chi: tongHdvChiVal,
    ma_doan: doan?.ten_doan ?? "",
    ten_hdv: hdvName,
    so_khach_doan: soKhachDefault,
    so_ngay_doan: soNgayDefault,
    ten_nguoi_de_nghi: hdvName,
  });

  const handleSubmit = async () => {
    if (soTien <= 0) { toast.error(t("Số tiền phải lớn hơn 0")); return; }
    try {
      await createMut.mutateAsync({
        doanId, hdvId, refLoai, soTien, laThuHoi, moTa,
        ghiChu: ghiChu || undefined,
        quyetToanData: isQT ? buildQuyetToanData() : null,
        ngayCanThanhToan: ngayCanTT || null,
      });
      toast.success(t("Đã tạo đề nghị thanh toán"));
      onClose();
    } catch (e: unknown) {
      toast.error(errMsg(e) || t("Lỗi tạo đề nghị TT"));
    }
  };

  const handleExport = async () => {
    if (!isQT) return;
    try {
      await exportHDVQuyetToanExcel({
        data: buildQuyetToanData(),
        hdv: hdv ?? null,
        nguoiDeNghi: user?.ho_ten ?? "",
      });
      toast.success(t("Đã xuất file Excel"));
    } catch (e: unknown) {
      toast.error(t("Lỗi xuất Excel: ") + (errMsg(e) || ""));
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className={cn(isQT ? "max-w-2xl max-h-[90vh] overflow-y-auto" : "max-w-md")}>
        <DialogHeader><DialogTitle>{title}</DialogTitle></DialogHeader>
        <div className="space-y-4 pt-2">
          {/* Chi tiết quyết toán (form S8 BM02.1-20) */}
          {isQT && (
            <div className="border border-border rounded-lg p-3 space-y-3 bg-muted/30">
              <p className="text-xs font-semibold text-muted-foreground uppercase">
                {t("Chi tiết quyết toán (Form S8)")}
              </p>

              <div className="grid grid-cols-2 gap-3 text-xs">
                <div>
                  <Label className="text-[11px] text-muted-foreground">{t("Mã đoàn")}</Label>
                  <p className="font-medium">{doan?.ten_doan || "—"}</p>
                </div>
                <div>
                  <Label className="text-[11px] text-muted-foreground">HDV</Label>
                  <p className="font-medium">{hdvName || "—"}</p>
                </div>
                <div>
                  <Label className="text-[11px] text-muted-foreground">{t("Số khách")}</Label>
                  <p className="font-medium">{soKhachDefault}</p>
                </div>
                <div>
                  <Label className="text-[11px] text-muted-foreground">{t("Số ngày")}</Label>
                  <p className="font-medium">{soNgayDefault}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs">
                <NumberField label={t("Tạm ứng")} value={tamUng} onChange={setTamUng} />
                <NumberField label={t("Thu tiền trách nhiệm")} value={thuTrachNhiem} onChange={setThuTrachNhiem} />
              </div>

              {/* Tip — NT/khách/ngày × số khách × số ngày × tỷ giá */}
              <div className="space-y-1.5">
                <Label className="text-[11px] text-muted-foreground">{t("Thu tiền tip")}</Label>
                <div className="grid grid-cols-4 gap-1.5">
                  <Input
                    type="number" min={0} className="h-7 text-xs"
                    value={tipSoKhach || ""} onChange={(e) => setTipSoKhach(Number(e.target.value) || 0)}
                    placeholder={t("SL khách")}
                  />
                  <Input
                    type="number" min={0} className="h-7 text-xs"
                    value={tipDonGia || ""} onChange={(e) => setTipDonGia(Number(e.target.value) || 0)}
                    placeholder={t("ĐG NT/khách/ngày")}
                  />
                  <Input
                    type="number" min={0} className="h-7 text-xs"
                    value={tipTyGia || ""} onChange={(e) => setTipTyGia(Number(e.target.value) || 0)}
                    placeholder={t("Tỷ giá")}
                  />
                  <p className="h-7 text-xs flex items-center justify-end font-semibold text-emerald-700">
                    {fmt(thuTipVnd)} ₫
                  </p>
                </div>
                <p className="text-[10px] text-muted-foreground">
                  {tipSoKhach} × {tipDonGia} NT × {soNgayDefault} {t("ngày")} × {tipTyGia} = {fmt(thuTipVnd)} ₫
                </p>
              </div>

              {/* Đầu khách */}
              <div className="space-y-1.5">
                <Label className="text-[11px] text-muted-foreground">{t("Thu tiền đầu khách")}</Label>
                <div className="grid grid-cols-3 gap-1.5">
                  <Input
                    type="number" min={0} className="h-7 text-xs"
                    value={dauKhachSoKhach || ""} onChange={(e) => setDauKhachSoKhach(Number(e.target.value) || 0)}
                    placeholder={t("SL khách")}
                  />
                  <Input
                    type="number" min={0} className="h-7 text-xs"
                    value={dauKhachDonGia || ""} onChange={(e) => setDauKhachDonGia(Number(e.target.value) || 0)}
                    placeholder={t("ĐG")}
                  />
                  <p className="h-7 text-xs flex items-center justify-end font-semibold text-emerald-700">
                    {fmt(thuDauKhachVnd)} ₫
                  </p>
                </div>
              </div>

              {/* Quỹ VP */}
              <div className="space-y-1.5">
                <Label className="text-[11px] text-muted-foreground">{t("Thu tiền quỹ văn phòng")}</Label>
                <div className="grid grid-cols-3 gap-1.5">
                  <Input
                    type="number" min={0} className="h-7 text-xs"
                    value={quyVpSoLuong || ""} onChange={(e) => setQuyVpSoLuong(Number(e.target.value) || 0)}
                    placeholder={t("SL")}
                  />
                  <Input
                    type="number" min={0} className="h-7 text-xs"
                    value={quyVpDonGia || ""} onChange={(e) => setQuyVpDonGia(Number(e.target.value) || 0)}
                    placeholder={t("ĐG")}
                  />
                  <p className="h-7 text-xs flex items-center justify-end font-semibold text-emerald-700">
                    {fmt(thuQuyVpVnd)} ₫
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs">
                <NumberField label={t("Thu tiền bán OP")} value={thuBanOp} onChange={setThuBanOp} />
                <NumberField label={t("Thu khác")} value={thuKhac} onChange={setThuKhac} />
              </div>

              {/* Tổng + Còn phải thanh toán */}
              <div className="border-t border-border pt-2 space-y-1 text-xs">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{t("Tổng quyết toán (HDV chi):")}</span>
                  <span className="font-semibold">{fmt(tongHdvChiVal)} ₫</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{t("Tổng thu:")}</span>
                  <span className="font-semibold text-emerald-700">{fmt(tongThu)} ₫</span>
                </div>
                <div className="flex justify-between border-t border-border pt-1">
                  <span className="font-semibold">
                    {conPhaiThanhToan >= 0 ? t("Công ty còn phải trả HDV:") : t("HDV phải trả lại công ty:")}
                  </span>
                  <span className={cn(
                    "font-bold",
                    conPhaiThanhToan > 0 ? "text-orange-600" : conPhaiThanhToan < 0 ? "text-blue-600" : "",
                  )}>
                    {conPhaiThanhToan < 0 ? "-" : ""}{fmt(Math.abs(conPhaiThanhToan))} ₫
                  </span>
                </div>
                <p className="text-[10px] text-muted-foreground italic">
                  {t("Số tiền ĐNTT bên dưới tự đồng bộ với giá trị này.")}
                </p>
              </div>
            </div>
          )}

          <div className="space-y-1.5">
            <Label className="text-xs">{t("Mô tả")}</Label>
            <Input className="h-8 text-sm" value={moTa} onChange={(e) => setMoTa(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">{t("Số tiền ĐNTT (VND)")}</Label>
            <Input
              className="h-8 text-sm" type="number" min={0}
              value={soTien || ""} onChange={(e) => setSoTien(Number(e.target.value))}
              placeholder={t("VD: 5000000")}
            />
            {soTien > 0 && <p className="text-[11px] text-muted-foreground">{fmt(soTien)} ₫</p>}
          </div>
          {isQT && (
            <>
              <div className="space-y-1.5">
                <Label className="text-xs">{t("Ngày cần thanh toán")}</Label>
                <Input
                  className="h-8 text-sm" type="date"
                  value={ngayCanTT} onChange={(e) => setNgayCanTT(e.target.value)}
                />
              </div>
              <div className="flex items-center gap-2">
                <Checkbox id="la-thu-hoi" checked={laThuHoi} onCheckedChange={(v) => setLaThuHoi(!!v)} />
                <Label htmlFor="la-thu-hoi" className="text-xs cursor-pointer">
                  {t("HDV hoàn lại tiền (thu hồi tạm ứng thừa)")}
                </Label>
              </div>
            </>
          )}
          <div className="space-y-1.5">
            <Label className="text-xs">{t("Ghi chú")}</Label>
            <Textarea
              className="text-sm min-h-[60px] resize-none" value={ghiChu}
              onChange={(e) => setGhiChu(e.target.value)} placeholder={t("Ghi chú thêm (nếu có)...")}
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" size="sm" onClick={onClose}>{t("Hủy")}</Button>
            {isQT && (
              <Button variant="outline" size="sm" onClick={handleExport} className="gap-1">
                <FileDown className="h-3.5 w-3.5" />
                {t("In file Excel")}
              </Button>
            )}
            <Button size="sm" onClick={handleSubmit} disabled={createMut.isPending}>
              {createMut.isPending ? t("Đang tạo...") : t("Tạo")}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function NumberField({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div className="space-y-1">
      <Label className="text-[11px] text-muted-foreground">{label}</Label>
      <Input
        type="number" min={0} className="h-7 text-xs"
        value={value || ""}
        onChange={(e) => onChange(Number(e.target.value) || 0)}
        placeholder="0"
      />
    </div>
  );
}
