import { RotateCcw, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger,
} from "@/components/ui/select";
import { SearchableSelect } from "@/components/SearchableSelect";
import { t } from "@/lib/i18n";

interface Props {
  doanSelectOpts: { value: string; label: string }[];
  doanId: string;
  setDoanId: (v: string) => void;
  loai: string;
  setLoai: (v: string) => void;
  trangThaiHD: string;
  setTrangThaiHD: (v: string) => void;
  trangThaiUNC: string;
  setTrangThaiUNC: (v: string) => void;
  trangThaiTT: string;
  setTrangThaiTT: (v: string) => void;
  onReset: () => void;
  onOpenBatch: () => void;
  batchCount: number;
}

export function HoaDonUNCFilters({
  doanSelectOpts, doanId, setDoanId, loai, setLoai,
  trangThaiHD, setTrangThaiHD, trangThaiUNC, setTrangThaiUNC,
  trangThaiTT, setTrangThaiTT, onReset, onOpenBatch, batchCount,
}: Props) {
  // Khớp doan_chi_phi.loai / de_nghi_thanh_toan.loai. "HDV" là acronym, không dịch.
  const loaiOptions = [
    { value: "khach_san", label: t("Khách sạn") },
    { value: "nha_hang", label: t("Nhà hàng") },
    { value: "dich_vu", label: t("Dịch vụ") },
    { value: "ve_may_bay", label: t("Vé máy bay") },
    { value: "xe", label: t("Xe") },
    { value: "visa", label: t("Visa") },
    { value: "bao_hiem", label: t("Bảo hiểm") },
    { value: "hdv", label: "HDV" },
  ];
  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="w-[200px]">
        <label className="text-xs text-muted-foreground mb-1 block">{t("Đoàn")}</label>
        <SearchableSelect
          options={doanSelectOpts}
          value={doanId}
          onChange={setDoanId}
          placeholder={t("Tất cả đoàn")}
          searchPlaceholder={t("Tìm đoàn...")}
        />
      </div>

      <div>
        <label className="text-xs text-muted-foreground mb-1 block">{t("Loại")}</label>
        <Select value={loai} onValueChange={v => setLoai(v === "all" ? "" : v)}>
          <SelectTrigger className="w-[130px]">
            <span>{loaiOptions.find((o) => o.value === loai)?.label ?? t("Tất cả")}</span>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("Tất cả")}</SelectItem>
            {loaiOptions.map((o) => (
              <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div>
        <label className="text-xs text-muted-foreground mb-1 block">{t("Trạng thái hóa đơn")}</label>
        <Select value={trangThaiHD} onValueChange={v => setTrangThaiHD(v === "all" ? "" : v)}>
          <SelectTrigger className="w-[150px]">
            <span>{!trangThaiHD ? t("Tất cả") : trangThaiHD === "chua_co" ? t("Chưa có") : trangThaiHD === "da_co" ? t("Đã có") : t("Không cần")}</span>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("Tất cả")}</SelectItem>
            <SelectItem value="chua_co">{t("Chưa có")}</SelectItem>
            <SelectItem value="da_co">{t("Đã có")}</SelectItem>
            <SelectItem value="khong_can">{t("Không cần")}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div>
        <label className="text-xs text-muted-foreground mb-1 block">{t("Trạng thái UNC")}</label>
        <Select value={trangThaiUNC} onValueChange={v => setTrangThaiUNC(v === "all" ? "" : v)}>
          <SelectTrigger className="w-[150px]">
            <span>{!trangThaiUNC ? t("Tất cả") : trangThaiUNC === "chua_co" ? t("Chưa có") : trangThaiUNC === "da_co" ? t("Đã có") : t("Không cần")}</span>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("Tất cả")}</SelectItem>
            <SelectItem value="chua_co">{t("Chưa có")}</SelectItem>
            <SelectItem value="da_co">{t("Đã có")}</SelectItem>
            <SelectItem value="khong_can">{t("Không cần")}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div>
        <label className="text-xs text-muted-foreground mb-1 block">{t("Trạng thái TT")}</label>
        <Select value={trangThaiTT} onValueChange={v => setTrangThaiTT(v === "all" ? "" : v)}>
          <SelectTrigger className="w-[150px]">
            <span>{!trangThaiTT ? t("Tất cả") : trangThaiTT === "chua_tt" ? t("Chờ thanh toán") : t("Đã thanh toán")}</span>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("Tất cả")}</SelectItem>
            <SelectItem value="chua_tt">{t("Chờ thanh toán")}</SelectItem>
            <SelectItem value="da_tt">{t("Đã thanh toán")}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Button variant="ghost" size="sm" onClick={onReset}>
        <RotateCcw className="h-4 w-4 mr-1" /> Reset
      </Button>

      <Button
        size="sm"
        className="gap-1.5"
        onClick={onOpenBatch}
        title={t("Gắn UNC hàng loạt cho mọi ĐNTT chưa có UNC (theo bộ lọc hiện tại)")}
      >
        <Upload className="h-4 w-4" />
        {t("Gắn UNC nhanh")}{batchCount > 0 ? ` (${batchCount})` : ""}
      </Button>
    </div>
  );
}
