import { t } from "@/lib/i18n";

interface Props {
  soKhachLon: number;
  soKhachEm1: number;
  soKhachEm2: number;
  soKhachTl: number;
  totalFromDoan: number;
  chuThichKhach: string;
  setChuThichKhach: (v: string) => void;
}

export default function GuestCountSection(props: Props) {
  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold">Số lượng khách</h3>
      <div className="grid grid-cols-5 gap-3">
        <ReadonlyField label={t("Người lớn")} value={props.soKhachLon} />
        <ReadonlyField label="Trẻ em 6–10" value={props.soKhachEm1} />
        <ReadonlyField label="Trẻ em <6" value={props.soKhachEm2} />
        <ReadonlyField label="T/L" value={props.soKhachTl} />
        <ReadonlyField label="Tổng" value={props.totalFromDoan} highlight />
      </div>
      <textarea
        value={props.chuThichKhach}
        onChange={(e) => props.setChuThichKhach(e.target.value)}
        placeholder="VD: Khách ăn chay, dị ứng, VIP..."
        rows={2}
        className="w-full text-sm resize-none rounded-md border border-input bg-background px-3 py-2"
      />
    </div>
  );
}

function ReadonlyField({ label, value, highlight }: { label: string; value: number; highlight?: boolean }) {
  const isZh = document.cookie.includes("googtrans=/vi/zh-TW");
  return (
    <div className="space-y-1">
      <label className={`text-xs text-muted-foreground${isZh ? " notranslate" : ""}`}>{label}</label>
      <div
        className="h-9 rounded-md border border-border flex items-center justify-center font-bold text-sm tabular-nums bg-muted/50"
        style={highlight ? { color: "#185FA5" } : undefined}
      >
        {value}
      </div>
    </div>
  );
}
