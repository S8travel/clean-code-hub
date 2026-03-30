import { useMemo } from "react";
import { useCongNoByNCC } from "@/hooks/use-dntt";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { AlertCircle } from "lucide-react";

const fmt = (n: number) => n.toLocaleString("vi-VN");

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
}

export default function KSCongNoPanel({ nccId, doanId, value, onChange }: Props) {
  const { data: congNoList = [], isLoading } = useCongNoByNCC(nccId);

  const options = useMemo(() =>
    congNoList.map((r) => ({
      id: r.id,
      label: `${r.ten_doan || `#${r.doan_id}`} — ${fmt(r.con_lai)} VND`,
      conLai: r.con_lai,
      tenDoan: r.ten_doan || `#${r.doan_id}`,
    })),
  [congNoList]);

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
      soTienCanTru: opt.conLai,
      tenDoan: opt.tenDoan,
    });
  };

  const handleAmountChange = (raw: string) => {
    if (!value) return;
    const parsed = parseInt(raw.replace(/\D/g, ""), 10);
    const soTienCanTru = isNaN(parsed) ? 0 : Math.min(parsed, value.soTienConLai);
    onChange({ ...value, soTienCanTru });
  };

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <div className="flex items-center gap-1 text-amber-600 text-xs shrink-0">
        <AlertCircle className="h-3.5 w-3.5 shrink-0" />
        <span className="font-medium">Có {options.length} khoản công nợ</span>
      </div>

      <Select
        value={value ? String(value.congNoId) : "none"}
        onValueChange={handleSelectChange}
      >
        <SelectTrigger className="h-7 text-xs w-[220px]">
          <SelectValue placeholder="Chọn khoản cấn trừ..." />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="none">— Không cấn trừ —</SelectItem>
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
            placeholder="Số tiền"
          />
          <span className="text-xs text-muted-foreground shrink-0">VND</span>
        </div>
      )}
    </div>
  );
}
