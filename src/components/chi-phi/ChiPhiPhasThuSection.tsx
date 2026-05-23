import { useState } from "react";
import { differenceInDays, parseISO } from "date-fns";
import { Plus, Trash2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { DecimalInput } from "@/components/ui/decimal-input";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { t, useTranslate } from "@/lib/i18n";
import type { HDVDoanInfo } from "./ChiPhiHDVSection";

const NDT_TIP_CO_TL = 150;
const NDT_TIP_KHONG_TL = 300;
const fmt = (n: number) => n.toLocaleString("vi-VN");

type LoaiTien = "NDT" | "NT$" | "US$" | "USD" | "VND";
type NguoiThu = "cong_ty" | "hdv";
interface ExtraRow { id: number; moTa: string; soTien: number; loaiTien: LoaiTien; tyGia: number; nguoiThu: NguoiThu }
const LOAI_TIEN_LABEL: Record<LoaiTien, string> = { NDT: "NDT", "NT$": "NT$", "US$": "US$", USD: "USD", VND: "VND" };

interface Props {
  doan?: HDVDoanInfo;
}

export default function ChiPhiPhasThuSection({ doan }: Props) {
  useTranslate();
  const soKhach =
    (doan?.so_khach_lon ?? 0) + (doan?.so_khach_em1 ?? 0) +
    (doan?.so_khach_em2 ?? 0) + (doan?.so_khach_tl ?? 0) ||
    doan?.so_khach || 0;

  const soNgay = doan?.ngay_di && doan?.ngay_ve
    ? Math.max(1, differenceInDays(parseISO(doan.ngay_ve), parseISO(doan.ngay_di)) + 1)
    : 0;

  const coTL = (doan?.so_khach_tl ?? 0) > 0;
  const defaultTipDonGia = coTL ? NDT_TIP_CO_TL : NDT_TIP_KHONG_TL;

  const [tyGia, setTyGia] = useState<number>(() => {
    const saved = localStorage.getItem("hdv_ty_gia_ndt");
    return saved ? Number(saved) : 800;
  });
  const handleTyGiaChange = (v: number) => {
    setTyGia(v);
    localStorage.setItem("hdv_ty_gia_ndt", String(v));
  };

  const [tipDonGia, setTipDonGia] = useState(defaultTipDonGia);
  const [tipLoaiTien, setTipLoaiTien] = useState<LoaiTien>("NDT");
  const [tipSoKhach, setTipSoKhach] = useState(soKhach);
  const [tipSoNgay, setTipSoNgay] = useState(soNgay);
  const [tipNguoiThu, setTipNguoiThu] = useState<NguoiThu>("hdv");

  const tongTip = tipSoKhach * tipSoNgay * tipDonGia;
  const tongVND = tongTip * tyGia;

  const [extraRows, setExtraRows] = useState<ExtraRow[]>([]);
  const addRow = () =>
    setExtraRows((prev) => [...prev, { id: Date.now(), moTa: "", soTien: 0, loaiTien: "NDT", tyGia, nguoiThu: "hdv" }]);
  const removeRow = (id: number) =>
    setExtraRows((prev) => prev.filter((r) => r.id !== id));
  const updateRow = <K extends keyof Omit<ExtraRow, "id">>(id: number, field: K, val: ExtraRow[K]) =>
    setExtraRows((prev) => prev.map((r) => (r.id === id ? { ...r, [field]: val } : r)));
  const handleLoaiTienChange = (id: number, val: LoaiTien) =>
    setExtraRows((prev) =>
      prev.map((r) => (r.id === id ? { ...r, loaiTien: val, tyGia: val === "VND" ? 1 : r.tyGia } : r))
    );

  const extraTotalVND = extraRows.reduce((s, r) => s + r.soTien * r.tyGia, 0);
  const totalVND = tongVND + extraTotalVND;

  const hdvTotalVND =
    (tipNguoiThu === "hdv" ? tongVND : 0) +
    extraRows.filter((r) => r.nguoiThu === "hdv").reduce((s, r) => s + r.soTien * r.tyGia, 0);
  const ctTotalVND = totalVND - hdvTotalVND;

  if (!soKhach || !soNgay) return null;

  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      <div className="px-4 py-2.5 bg-muted/30 border-b border-border flex items-center justify-between flex-wrap gap-2">
        <p className="text-sm font-semibold">💰 {t("Phải thu")}</p>
        <div className="flex items-center gap-3 flex-wrap">
          {totalVND > 0 && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              {ctTotalVND > 0 && (
                <span className="px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 font-medium">CT: {fmt(ctTotalVND)} ₫</span>
              )}
              {hdvTotalVND > 0 && (
                <span className="px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 font-medium">HDV: {fmt(hdvTotalVND)} ₫</span>
              )}
            </div>
          )}
          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={addRow}>
            <Plus className="h-3 w-3 mr-1" /> {t("Thêm")}
          </Button>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="border-b border-border bg-muted/20 text-[11px] font-medium text-muted-foreground">
              <th className="text-left px-4 py-2.5">{t("Mục")}</th>
              <th className="text-center px-3 py-2.5">{t("Khách")}</th>
              <th className="text-center px-3 py-2.5">{t("Ngày")}</th>
              <th className="text-center px-3 py-2.5">{t("Đơn giá/khách/ngày")}</th>
              <th className="text-right px-3 py-2.5">{t("Tổng")}</th>
              <th className="text-center px-3 py-2.5">{t("Tỷ giá")}</th>
              <th className="text-right px-4 py-2.5">{t("Thành tiền VND")}</th>
              <th className="w-8" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {/* Tip row */}
            <tr className="hover:bg-muted/20">
              <td className="px-4 py-2.5 font-medium">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span>Tip</span>
                  <span className={cn(
                    "px-1.5 py-0.5 rounded text-[10px] font-medium",
                    coTL ? "bg-green-100 text-green-700" : "bg-orange-100 text-orange-700",
                  )}>
                    {coTL ? t("Có T/L") : t("Không T/L")}
                  </span>
                  <button
                    onClick={() => setTipNguoiThu((v) => v === "cong_ty" ? "hdv" : "cong_ty")}
                    className={cn(
                      "px-1.5 py-0.5 rounded text-[10px] font-medium border transition-colors cursor-pointer",
                      tipNguoiThu === "hdv"
                        ? "bg-amber-50 text-amber-700 border-amber-200"
                        : "bg-blue-50 text-blue-700 border-blue-200",
                    )}
                  >
                    {tipNguoiThu === "hdv" ? t("HDV thu") : t("Công ty thu")}
                  </button>
                </div>
              </td>
              <td className="px-2 py-2 text-center">
                <Input
                  type="number"
                  value={tipSoKhach || ""}
                  onChange={(e) => setTipSoKhach(Number(e.target.value) || 0)}
                  className="h-6 text-xs px-1.5 py-0 text-center w-[48px] mx-auto"
                />
              </td>
              <td className="px-2 py-2 text-center">
                <Input
                  type="number"
                  value={tipSoNgay || ""}
                  onChange={(e) => setTipSoNgay(Number(e.target.value) || 0)}
                  className="h-6 text-xs px-1.5 py-0 text-center w-[48px] mx-auto"
                />
              </td>
              <td className="px-3 py-2 text-center">
                <div className="flex items-center gap-1 justify-center">
                  <DecimalInput
                    value={tipDonGia}
                    onChange={setTipDonGia}
                    className="h-6 text-xs px-1.5 py-0 text-right w-[80px]"
                  />
                  <Select value={tipLoaiTien} onValueChange={(v) => setTipLoaiTien(v as LoaiTien)}>
                    <SelectTrigger className="h-6 text-xs px-1.5 w-[52px]">
                      <span>{tipLoaiTien}</span>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="NDT">NDT</SelectItem>
                      <SelectItem value="NT$">NT$</SelectItem>
                      <SelectItem value="US$">US$</SelectItem>
                      <SelectItem value="USD">USD</SelectItem>
                      <SelectItem value="VND">VND</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </td>
              <td className="px-3 py-2.5 text-right font-semibold whitespace-nowrap">
                {tongTip > 0 ? `${fmt(tongTip)} ${LOAI_TIEN_LABEL[tipLoaiTien]}` : "—"}
              </td>
              <td className="px-3 py-2.5">
                <div className="flex justify-center">
                  <Input
                    type="number"
                    value={tyGia || ""}
                    onChange={(e) => handleTyGiaChange(Number(e.target.value) || 0)}
                    className="h-6 text-xs px-1.5 py-0 text-center w-[72px]"
                  />
                </div>
              </td>
              <td className="px-4 py-2.5 text-right font-semibold text-primary whitespace-nowrap">
                {tyGia > 0 ? `${fmt(tongVND)} ₫` : "—"}
              </td>
              <td />
            </tr>

            {/* Extra rows */}
            {extraRows.map((row) => {
              const isVND = row.loaiTien === "VND";
              const thanhTienVND = row.soTien * row.tyGia;
              return (
                <tr key={row.id} className="hover:bg-muted/20">
                  <td className="px-4 py-2">
                    <div className="flex items-center gap-1.5">
                      <Input
                        value={row.moTa}
                        onChange={(e) => updateRow(row.id, "moTa", e.target.value)}
                        className="h-6 text-xs px-1.5"
                        placeholder={t("Mô tả khoản thu...")}
                        autoFocus
                      />
                      <button
                        onClick={() => updateRow(row.id, "nguoiThu", row.nguoiThu === "cong_ty" ? "hdv" : "cong_ty")}
                        className={cn(
                          "shrink-0 px-1.5 py-0.5 rounded text-[10px] font-medium border transition-colors cursor-pointer whitespace-nowrap",
                          row.nguoiThu === "hdv"
                            ? "bg-amber-50 text-amber-700 border-amber-200"
                            : "bg-blue-50 text-blue-700 border-blue-200",
                        )}
                      >
                        {row.nguoiThu === "hdv" ? t("HDV thu") : t("Công ty thu")}
                      </button>
                    </div>
                  </td>
                  <td className="px-3 py-2 text-center text-muted-foreground">—</td>
                  <td className="px-3 py-2 text-center text-muted-foreground">—</td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-1 justify-center">
                      <Input
                        type="number"
                        value={row.soTien || ""}
                        onChange={(e) => updateRow(row.id, "soTien", Number(e.target.value) || 0)}
                        className="h-6 text-xs px-1.5 py-0 text-center w-[72px]"
                        placeholder="0"
                      />
                      <Select value={row.loaiTien} onValueChange={(v) => handleLoaiTienChange(row.id, v as LoaiTien)}>
                        <SelectTrigger className="h-6 text-xs px-1.5 w-[56px]">
                          <span>{row.loaiTien}</span>
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="NDT">NDT</SelectItem>
                          <SelectItem value="NT$">NT$</SelectItem>
                          <SelectItem value="US$">US$</SelectItem>
                          <SelectItem value="USD">USD</SelectItem>
                          <SelectItem value="VND">VND</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </td>
                  <td className="px-3 py-2 text-right font-semibold whitespace-nowrap">
                    {row.soTien > 0 ? `${fmt(row.soTien)} ${LOAI_TIEN_LABEL[row.loaiTien]}` : "—"}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex justify-center">
                      <Input
                        type="number"
                        value={isVND ? 1 : (row.tyGia || "")}
                        onChange={(e) => !isVND && updateRow(row.id, "tyGia", Number(e.target.value) || 0)}
                        disabled={isVND}
                        className="h-6 text-xs px-1.5 py-0 text-center w-[72px] disabled:opacity-50"
                      />
                    </div>
                  </td>
                  <td className="px-4 py-2 text-right font-semibold text-primary whitespace-nowrap">
                    {row.soTien > 0 && row.tyGia > 0 ? `${fmt(thanhTienVND)} ₫` : "—"}
                  </td>
                  <td className="px-2 py-2">
                    <Button
                      size="icon" variant="ghost"
                      className="h-6 w-6 text-muted-foreground hover:text-destructive"
                      onClick={() => removeRow(row.id)}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
