import { format } from "date-fns";
import { t, useTranslate } from "@/lib/i18n";

interface ChiPhiHeaderDoan {
  ten_doan?: string | null;
  agents?: { ten?: string | null } | null;
  so_khach_lon?: number | null;
  so_khach_tl?: number | null;
  ngay_di?: string | null;
  ngay_ve?: string | null;
  huong_dan_vien?: { ten?: string | null } | null;
  xe?: { nha_xe?: { ten?: string | null } | null; ten_xe?: string | null; so_cho?: number | null } | null;
  tang_pham?: unknown;
}

interface Props {
  doan: ChiPhiHeaderDoan;
  opName?: string;
}

export default function ChiPhiHeader({ doan, opName }: Props) {
  useTranslate();
  const items = [
    { label: t("Mã đoàn"), value: doan.ten_doan },
    { label: "Agent", value: doan.agents?.ten || "—" },
    {
      label: t("Số khách"),
      value: `${doan.so_khach_lon || 0} NL · ${doan.so_khach_tl || 0} TL · FOC`,
    },
    {
      label: t("Ngày"),
      value: doan.ngay_di && doan.ngay_ve
        ? `${format(new Date(doan.ngay_di), "dd/MM/yyyy")} → ${format(new Date(doan.ngay_ve), "dd/MM/yyyy")}`
        : "—",
    },
    { label: t("HDV"), value: doan.huong_dan_vien?.ten || "—" },
    { label: t("Xe"), value: doan.xe ? [doan.xe.nha_xe?.ten, doan.xe.ten_xe, doan.xe.so_cho ? `${doan.xe.so_cho} ${t("chỗ")}` : ""].filter(Boolean).join(" · ") || "—" : "—" },
    { label: "OP", value: opName || "—" },
    {
      label: t("Quà tặng"),
      value: Array.isArray(doan.tang_pham) && doan.tang_pham.length > 0
        ? doan.tang_pham.join(", ")
        : "—",
    },
  ];

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <h3 className="text-sm font-semibold mb-3">{t("Thông tin đoàn")}</h3>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {items.map((item) => (
          <div key={item.label}>
            <p className="text-xs text-muted-foreground">{item.label}</p>
            <p className="text-sm font-medium truncate">{item.value}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
