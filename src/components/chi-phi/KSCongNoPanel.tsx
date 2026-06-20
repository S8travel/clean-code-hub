import { useEffect, useMemo, useRef } from "react";
import { useCongNoByNCC } from "@/hooks/use-cong-no";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { AlertCircle } from "lucide-react";
import { t, useTranslate } from "@/lib/i18n";

const fmt = (n: number) => Math.round(n).toLocaleString("vi-VN");

// Khoản dư cũ chưa link doan (data legacy import) lưu mã đoàn vào ghi_chu
// theo format "Đoàn: <ma>". Extract ra để hiển thị thân thiện.
function extractDoanFromGhiChu(ghi_chu: string | null | undefined): string | null {
  if (!ghi_chu) return null;
  const m = ghi_chu.match(/Đoàn[:：]\s*(.+)/i);
  return m ? m[1].trim() : null;
}

export interface CanTruSelection {
  congNoId: number;
  soTienConLai: number;
  soTienCanTru: number;
  tenDoan: string;
}

interface Props {
  nccId: number | null | undefined;
  doanId: number;
  value: CanTruSelection | null;
  onChange: (v: CanTruSelection | null) => void;
  /** Số tiền tối đa hợp lý để cấn trừ (= số tiền ĐNTT/đang thanh toán).
   *  Mặc định & clamp soTienCanTru về min(quỹ còn lại, maxAmount). */
  maxAmount?: number | null;
}

export default function KSCongNoPanel({ nccId, doanId, value, onChange, maxAmount }: Props) {
  useTranslate();
  const { data: congNoList = [], isLoading } = useCongNoByNCC(nccId);
  const cap = (conLai: number) =>
    maxAmount != null && maxAmount > 0 ? Math.min(conLai, maxAmount) : conLai;

  const options = useMemo(() => {
    const mapped = congNoList.map((r) => {
      const isPrepaid = r.loai === "tra_truoc";
      const tenDoan = isPrepaid
        ? t("Quỹ trả trước")
        : r.ten_doan ||
          extractDoanFromGhiChu(r.ghi_chu) ||
          (r.doan_id ? `#${r.doan_id}` : t("Khoản dư"));
      return {
        id: r.id,
        label: `${isPrepaid ? `💰 ${t("Quỹ trả trước")}` : tenDoan} — ${fmt(r.so_tien_con_lai)} VND`,
        conLai: r.so_tien_con_lai,
        tenDoan,
        isPrepaid,
      };
    });
    // Quỹ trả trước lên đầu để OP thấy & ưu tiên cấn trừ
    return mapped.sort((a, b) => Number(b.isPrepaid) - Number(a.isPrepaid));
  }, [congNoList]);

  const hasPrepaid = options.some((o) => o.isPrepaid);

  // NCC trả trước → tự gợi ý (preselect) quỹ trả trước khi chưa chọn gì.
  // Chỉ tự áp 1 lần / nccId — user xóa chọn thì tôn trọng, không ép lại.
  const autoAppliedNcc = useRef<number | null>(null);
  useEffect(() => {
    if (autoAppliedNcc.current === nccId) return;
    if (!nccId || options.length === 0) return;
    const prepaid = options.find((o) => o.isPrepaid);
    if (prepaid && !value) {
      autoAppliedNcc.current = nccId;
      onChange({
        congNoId: prepaid.id,
        soTienConLai: prepaid.conLai,
        soTienCanTru: cap(prepaid.conLai),
        tenDoan: prepaid.tenDoan,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nccId, options]);

  // maxAmount đổi (vd switch full→cọc) → kẹp lại soTienCanTru nếu vượt.
  useEffect(() => {
    if (!value) return;
    const capped = cap(value.soTienConLai);
    if (value.soTienCanTru > capped) onChange({ ...value, soTienCanTru: capped });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [maxAmount]);

  if (!nccId || isLoading || options.length === 0) return null;

  const handleSelectChange = (idStr: string) => {
    if (idStr === "none") {
      onChange(null);
      return;
    }
    const opt = options.find((o) => String(o.id) === idStr);
    if (!opt) return;
    onChange({
      congNoId: opt.id,
      soTienConLai: opt.conLai,
      soTienCanTru: cap(opt.conLai),
      tenDoan: opt.tenDoan,
    });
  };

  const handleAmountChange = (raw: string) => {
    if (!value) return;
    const parsed = parseInt(raw.replace(/\D/g, ""), 10);
    const soTienCanTru = isNaN(parsed) ? 0 : Math.min(parsed, cap(value.soTienConLai));
    onChange({ ...value, soTienCanTru });
  };

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <div className="flex items-center gap-1 text-amber-600 text-xs shrink-0">
        <AlertCircle className="h-3.5 w-3.5 shrink-0" />
        <span className="font-medium">
          {hasPrepaid
            ? t("NCC trả trước — gợi ý cấn trừ vào quỹ")
            : `${t("Có")} ${options.length} ${t("khoản công nợ")}`}
        </span>
      </div>

      <Select
        value={value ? String(value.congNoId) : "none"}
        onValueChange={handleSelectChange}
      >
        <SelectTrigger className="h-7 text-xs w-[220px]">
          <span>{!value ? t("— Không cấn trừ —") : options.find((o) => o.id === value.congNoId)?.label ?? t("Chọn khoản cấn trừ...")}</span>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="none">{t("— Không cấn trừ —")}</SelectItem>
          {options.map((o) => (
            <SelectItem key={o.id} value={String(o.id)}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {value && (
        <div className="flex items-center gap-1.5">
          <Input
            className="h-7 text-xs w-32"
            value={value.soTienCanTru || ""}
            onChange={(e) => handleAmountChange(e.target.value)}
            placeholder={t("Số tiền")}
          />
          <span className="text-xs text-muted-foreground shrink-0">VND</span>
        </div>
      )}
    </div>
  );
}
