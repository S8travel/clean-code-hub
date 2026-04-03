import { format } from "date-fns";

interface Props {
  doan: any;
}

export default function ChiPhiHeader({ doan }: Props) {
  const items = [
    { label: "Mã đoàn", value: doan.ten_doan },
    { label: "Agent", value: doan.agents?.ten || "—" },
    {
      label: "Số khách",
      value: `${doan.so_khach_lon || 0} NL · ${doan.so_khach_tl || 0} TL · FOC`,
    },
    {
      label: "Ngày",
      value: doan.ngay_di && doan.ngay_ve
        ? `${format(new Date(doan.ngay_di), "dd/MM/yyyy")} → ${format(new Date(doan.ngay_ve), "dd/MM/yyyy")}`
        : "—",
    },
    { label: "HDV", value: doan.huong_dan_vien?.ten || "—" },
    { label: "Xe", value: doan.xe ? [doan.xe.ten_nha_xe, doan.xe.so_cho ? `${doan.xe.so_cho} chỗ` : "", doan.xe.loai_xe].filter(Boolean).join(" · ") || "—" : "—" },
    { label: "OP", value: doan.assigned_to || "—" },
    {
      label: "Quà tặng",
      value: Array.isArray(doan.tang_pham) && doan.tang_pham.length > 0
        ? doan.tang_pham.join(", ")
        : "—",
    },
  ];

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <h3 className="text-sm font-semibold mb-3">Thông tin đoàn</h3>
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
