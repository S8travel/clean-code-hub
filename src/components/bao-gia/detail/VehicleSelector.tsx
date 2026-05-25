import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SearchableSelect } from "@/components/SearchableSelect";
import { externalSupabase } from "@/lib/supabase-external";
import { fmtVnd } from "./helpers";

interface LoaiXeRow {
  id: number;
  ten_xe: string;
  so_cho: number | null;
  gia: number | null;
  nha_xe: { ten: string | null } | null;
}

interface Props {
  xeLoaiId: number | null;
  onChange: (id: number | null) => void;
}

// Dropdown chọn xe cho tour. Hiển thị "Nhà xe — Tên xe (X chỗ)" + giá kế bên.
// Lưu xe_loai_id (FK nha_xe_loai_xe). Snapshot giá lúc gửi sẽ làm phase sau.
export function VehicleSelector({ xeLoaiId, onChange }: Props) {
  const { data: loaiList = [], isLoading } = useQuery({
    queryKey: ["nha_xe_loai_xe_all"],
    queryFn: async () => {
      const { data, error } = await externalSupabase
        .from("nha_xe_loai_xe")
        .select("id, ten_xe, so_cho, gia, nha_xe:nha_xe_id(ten)")
        .order("id", { ascending: true });
      if (error) throw error;
      return (data || []) as unknown as LoaiXeRow[];
    },
  });

  const options = useMemo(
    () => loaiList.map((x) => {
      const nhaXe = x.nha_xe?.ten ?? "Nhà xe ?";
      const cho = x.so_cho ? ` (${x.so_cho} chỗ)` : "";
      return {
        value: String(x.id),
        label: `${nhaXe} — ${x.ten_xe}${cho}`,
      };
    }),
    [loaiList],
  );

  const selected = loaiList.find((x) => x.id === xeLoaiId);
  const giaText = selected?.gia != null ? `${fmtVnd(selected.gia)} ₫` : "—";

  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 min-w-0">
        <SearchableSelect
          options={options}
          value={xeLoaiId != null ? String(xeLoaiId) : ""}
          onChange={(v) => onChange(v ? Number(v) : null)}
          placeholder={isLoading ? "Đang tải xe..." : "Chọn loại xe..."}
          searchPlaceholder="Tìm nhà xe / loại xe..."
          emptyText="Không tìm thấy"
        />
      </div>
      <span
        className="text-xs font-medium text-slate-700 tabular-nums whitespace-nowrap min-w-[88px] text-right"
        title={selected ? `${selected.nha_xe?.ten ?? ""} — ${selected.ten_xe}` : "Chưa chọn"}
      >
        {giaText}
      </span>
      {xeLoaiId != null && (
        <Button
          variant="ghost"
          size="icon"
          className="h-9 w-9 shrink-0 text-slate-400 hover:text-destructive"
          title="Bỏ chọn xe"
          onClick={() => onChange(null)}
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      )}
    </div>
  );
}
