import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAgents } from "@/hooks/use-doan";

// Field dùng chung cho Báo giá (modal tạo + section thông tin ở detail).

const LOAI_TOUR_OPTS = [
  { value: "inbound", label: "Inbound" },
  { value: "outbound", label: "Outbound" },
  { value: "noi_dia", label: "Nội địa" },
] as const;

/** Select Agent (đối tác bán). value = agents.id | null. */
export function AgentSelect({
  value,
  onChange,
  className,
}: {
  value: number | null;
  onChange: (id: number | null) => void;
  className?: string;
}) {
  const { data: agents = [] } = useAgents();
  return (
    <Select
      value={value != null ? String(value) : "none"}
      onValueChange={(v) => onChange(v === "none" ? null : Number(v))}
    >
      <SelectTrigger className={className ?? "h-9"}>
        <SelectValue placeholder="— Chưa chọn —" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="none">— Chưa chọn —</SelectItem>
        {agents.map((a) => (
          <SelectItem key={a.id} value={String(a.id)}>{a.ten ?? `Agent #${a.id}`}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/** Select loại tour. value = 'inbound'|'outbound'|'noi_dia' | null. */
export function LoaiTourSelect({
  value,
  onChange,
  className,
}: {
  value: string | null;
  onChange: (v: string | null) => void;
  className?: string;
}) {
  return (
    <Select value={value ?? "none"} onValueChange={(v) => onChange(v === "none" ? null : v)}>
      <SelectTrigger className={className ?? "h-9"}>
        <SelectValue placeholder="— Chưa phân loại —" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="none">— Chưa phân loại —</SelectItem>
        {LOAI_TOUR_OPTS.map((o) => (
          <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
