import { useState, useEffect, useRef } from "react";
import { format, addDays } from "date-fns";
import { FileDown } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
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
import { calcQuyetToanHDV } from "@/lib/quyet-toan-hdv-calc";
import { buildQuyetToanSeed } from "@/lib/quyet-toan-hdv-seed";
import { TY_GIA_NDT_DEFAULT } from "@/lib/phai-thu-calc";
import { t } from "@/lib/i18n";
import type { HDVDoanInfo } from "./hdv-shared";

const fmt = (n: number) => Math.round(n).toLocaleString("vi-VN");

interface CreateModalProps {
  doanId: number;
  /** HDV chính của đoàn — mặc định đứng tên phiếu. */
  hdvId: number | null;
  /** HDV của đoàn (chính → phụ). Từ 2 người trở lên thì hiện ô chọn người đứng tên. */
  hdvList?: HDVInfo[];
  refLoai: "hdv_tam_ung" | "hdv_quyet_toan";
  title: string;
  defaultSoTien?: number;
  defaultLaThuHoi?: boolean;
  // Quyết toán context — chỉ dùng cho hdv_quyet_toan
  doan?: HDVDoanInfo;
  tongHdvChi?: number;
  tamUngDaTT?: number;   // tạm ứng đã trả → pre-fill ô "Tạm ứng" trong Tổng thu
  hdv?: HDVInfo | null;  // full info để in file (cần STK + ngân hàng)
  onClose: () => void;
}

export function CreateHDVPaymentModal({
  doanId, hdvId, hdvList = [], refLoai, title, defaultSoTien, defaultLaThuHoi,
  doan, tongHdvChi, tamUngDaTT, hdv,
  onClose,
}: CreateModalProps) {
  // Người đứng tên phiếu. Đoàn 2 HDV vẫn chỉ một bản quyết toán cho cả túi tiền
  // chung — chọn ở đây là chọn ai nhận/trả phần chênh lệch, vì tên + số tài
  // khoản trên bản in lấy theo người này và lưu vào ĐNTT (ref_id).
  const [nguoiDungTenId, setNguoiDungTenId] = useState<number | null>(hdvId);
  const nguoiDungTen = hdvList.find((h) => h.id === nguoiDungTenId) ?? hdv ?? null;
  const hdvName = nguoiDungTen?.ten ?? "";
  const createMut = useCreateHDVPayment();
  const { user } = useAuth();
  const isQT = refLoai === "hdv_quyet_toan";

  // Defaults từ doan
  const soKhachDefault =
    (doan?.so_khach_lon ?? 0) + (doan?.so_khach_em1 ?? 0) +
    (doan?.so_khach_em2 ?? 0) + (doan?.so_khach_tl ?? 0) ||
    doan?.so_khach || 0;
  const soKhachTl = doan?.so_khach_tl ?? 0;
  // "Số khách" trên giấy đề nghị quyết toán = số khách THỰC, KHÔNG tính T/L
  // (T/L không tính suất). Khớp số khách tip (cũng trừ T/L qua defaultTipSoKhach).
  const soKhachThuc = Math.max(0, soKhachDefault - soKhachTl);
  const tongHdvChiVal = tongHdvChi ?? 0;

  // Tỷ giá tip: CHỈ đọc snapshot của chính đoàn (computePhaiThu tự đọc doan.tip_ty_gia);
  // đoàn chưa chốt → hằng mặc định. KHÔNG đọc localStorage dùng chung — nếu không, đoàn
  // chưa chốt sẽ "nhảy" theo tỷ giá đoàn khác OP vừa sửa (OP báo lỗi 16/07/2026).
  // ── Defaults "Tổng thu" — dựng từ CHÍNH computePhaiThu (một nguồn với bảng Phải thu),
  //    nên không thể trôi khỏi nhau. Xem lib/quyet-toan-hdv-seed.ts.
  const seed = buildQuyetToanSeed(doan, TY_GIA_NDT_DEFAULT);
  const soNgayDefault = seed.soNgay;

  // Common state
  const [soTien, setSoTien] = useState(defaultSoTien ?? 0);
  // Mô tả mặc định bám theo người đứng tên — đổi người thì đổi theo, trừ khi OP đã sửa tay.
  const moTaTuDong = isQT
    ? [t("Quyết toán HDV"), hdvName, `${soKhachThuc}p`, String(soNgayDefault)]
        .filter(Boolean).join(" ").trim()
    : t("Tạm ứng cho hướng dẫn viên");
  const [moTa, setMoTa] = useState(moTaTuDong);
  const moTaDaSua = useRef(false);
  useEffect(() => {
    if (moTaDaSua.current) return;
    setMoTa(moTaTuDong);
  }, [moTaTuDong]);
  const [ghiChu, setGhiChu] = useState("");
  const [laThuHoi, setLaThuHoi] = useState(defaultLaThuHoi ?? false);
  // Default = hôm nay + 2 ngày; null sort xuống cuối list ĐNTT page → user dễ bỏ sót.
  const [ngayCanTT, setNgayCanTT] = useState(format(addDays(new Date(), 2), "yyyy-MM-dd"));

  // Quyết toán state (7 fields theo form S8 BM02.1-20)
  const [tamUng, setTamUng] = useState(tamUngDaTT ?? 0);
  const [thuTrachNhiem, setThuTrachNhiem] = useState(0);
  const [tipSoKhach, setTipSoKhach] = useState(seed.tip.soKhach);
  const [tipDonGia, setTipDonGia] = useState(seed.tip.donGiaNT);
  const [tipTyGia, setTipTyGia] = useState(seed.tip.tyGia);
  const [dauKhachSoKhach, setDauKhachSoKhach] = useState(seed.dauKhach.soKhach);
  const [dauKhachDonGia, setDauKhachDonGia] = useState(seed.dauKhach.donGia);
  const [quyVpSoLuong, setQuyVpSoLuong] = useState(seed.quyVp.soLuong);
  const [quyVpDonGia, setQuyVpDonGia] = useState(seed.quyVp.donGia);
  const [thuBanOp, setThuBanOp] = useState(0);
  const [thuKhac, setThuKhac] = useState(seed.thuKhac);
  // Tip khoán (doan.tip_lump_sum): công thức số khách × đơn giá × ngày KHÔNG tái tạo
  // được tổng khoán → giữ tổng gốc để quyết toán khớp Phải thu. null = tính công thức.
  const tipTongNT = seed.tip.tongNT;

  // Auto-compute quyết toán (logic tách ở lib/quyet-toan-hdv-calc.ts — có unit test)
  const { thuTipVnd, thuDauKhachVnd, thuQuyVpVnd, tongThu, conPhaiThanhToan } = calcQuyetToanHDV({
    tamUng,
    thuTrachNhiem,
    tip: { soKhach: tipSoKhach, donGiaNT: tipDonGia, soNgay: soNgayDefault, tyGia: tipTyGia, tongNT: tipTongNT },
    dauKhach: { soKhach: dauKhachSoKhach, donGia: dauKhachDonGia },
    quyVp: { soLuong: quyVpSoLuong, donGia: quyVpDonGia },
    thuBanOp,
    thuKhac,
    tongHdvChi: tongHdvChiVal,
  });

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
    // tong_nt: chỉ có khi đoàn dùng tip khoán. Bản ghi cũ thiếu field → export tính
    // theo công thức như trước (tương thích ngược).
    thu_tip: { so_khach: tipSoKhach, don_gia_nt: tipDonGia, ty_gia: tipTyGia, tong_nt: tipTongNT },
    thu_dau_khach: { so_khach: dauKhachSoKhach, don_gia: dauKhachDonGia },
    thu_quy_vp: { so_luong: quyVpSoLuong, don_gia: quyVpDonGia },
    thu_ban_op: thuBanOp,
    thu_khac: thuKhac,
    tong_hdv_chi: tongHdvChiVal,
    ma_doan: doan?.ten_doan ?? "",
    ten_hdv: hdvName,
    so_khach_doan: soKhachThuc,
    so_ngay_doan: soNgayDefault,
    ten_nguoi_de_nghi: hdvName,
  });

  const handleSubmit = async () => {
    if (soTien <= 0) { toast.error(t("Số tiền phải lớn hơn 0")); return; }
    // Chốt chặn cuối: VND không có đơn vị lẻ. calcQuyetToanHDV đã trả số nguyên,
    // nhưng ô này OP gõ tay được nên vẫn tròn lần nữa trước khi ghi DB.
    const soTienVnd = Math.round(soTien);
    try {
      await createMut.mutateAsync({
        doanId, hdvId: nguoiDungTenId, refLoai, soTien: soTienVnd, laThuHoi, moTa,
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
        hdv: nguoiDungTen,
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
          {/* Đoàn 2 HDV → chọn ai đứng tên phiếu (mặc định HDV chính) */}
          {hdvList.length > 1 && (
            <div className="space-y-1.5">
              <Label className="text-xs">{t("Người đứng tên phiếu")}</Label>
              <Select
                value={nguoiDungTenId != null ? String(nguoiDungTenId) : ""}
                onValueChange={(v) => setNguoiDungTenId(Number(v))}
              >
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue placeholder={t("Chọn HDV")} />
                </SelectTrigger>
                <SelectContent>
                  {hdvList.map((h, idx) => (
                    <SelectItem key={h.id} value={String(h.id)}>
                      {h.ten} — {idx === 0 ? t("HDV chính") : t("HDV phụ")}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[11px] text-muted-foreground">
                {t("Tên và số tài khoản trên bản in lấy theo người này:")}{" "}
                {[nguoiDungTen?.so_tai_khoan, nguoiDungTen?.ngan_hang].filter(Boolean).join(" · ") || "—"}
              </p>
            </div>
          )}

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
                  <p className="font-medium">{soKhachThuc}</p>
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
                {/* Đoàn tip khoán: công thức nhân KHÔNG ra tổng khoán → in đúng phép tính
                    đang dùng, tránh người đọc tưởng số tiền sai. */}
                <p className="text-[10px] text-muted-foreground">
                  {tipTongNT != null
                    ? <>{t("Tip khoán")} {fmt(tipTongNT)} NT × {tipTyGia} = {fmt(thuTipVnd)} ₫</>
                    : <>{tipSoKhach} × {tipDonGia} NT × {soNgayDefault} {t("ngày")} × {tipTyGia} = {fmt(thuTipVnd)} ₫</>}
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
            <Input
              className="h-8 text-sm" value={moTa}
              onChange={(e) => { moTaDaSua.current = true; setMoTa(e.target.value); }}
            />
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
