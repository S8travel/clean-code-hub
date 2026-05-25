import { useMemo } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SearchableSelect } from "@/components/SearchableSelect";
import { useLeadsList } from "@/hooks/use-leads";

interface Props {
  leadId: number | null;
  onChange: (id: number | null) => void;
}

// Combobox chọn lead nguồn cho báo giá. Hiển thị "Họ tên · SĐT". Cho phép
// clear (set null) bằng nút X. Reuse SearchableSelect → keyboard-friendly.
export function LeadSelector({ leadId, onChange }: Props) {
  const { data: leads = [], isLoading } = useLeadsList();

  const options = useMemo(
    () => leads.map((l) => ({
      value: String(l.id),
      label: l.so_dien_thoai ? `${l.ho_ten} · ${l.so_dien_thoai}` : l.ho_ten,
    })),
    [leads],
  );

  return (
    <div className="flex items-center gap-1">
      <SearchableSelect
        options={options}
        value={leadId != null ? String(leadId) : ""}
        onChange={(v) => onChange(v ? Number(v) : null)}
        placeholder={isLoading ? "Đang tải lead..." : "Chọn lead nguồn..."}
        searchPlaceholder="Tìm tên / SĐT lead..."
        emptyText="Không tìm thấy lead"
        className="flex-1"
      />
      {leadId != null && (
        <Button
          variant="ghost"
          size="icon"
          className="h-9 w-9 shrink-0 text-slate-400 hover:text-destructive"
          title="Bỏ liên kết lead"
          onClick={() => onChange(null)}
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      )}
    </div>
  );
}
