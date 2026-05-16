import { Plus } from "lucide-react";
import DayRow from "./DayRow";
import type { DayLocal, CanhDiemItem, NhaHangItem, KhachSanItem } from "@/hooks/use-dieu-tour";
import { getWeekday } from "@/hooks/use-dieu-tour";
import { useMemo } from "react";

interface Props {
  days: DayLocal[];
  setDays: (days: DayLocal[]) => void;
  canhDiemList: CanhDiemItem[];
  nhaHangList: NhaHangItem[];
  khachSanList: KhachSanItem[];
  getDayLabel?: (day: DayLocal, index: number) => string;
  doanId?: number; // truyền xuống DayRow để pre-check khi xóa NH/KS/cảnh điểm
  /** Khoá cột Khách sạn (ẩn select + chú thích) — dùng cho mẫu seri. */
  lockKhachSan?: boolean;
}

export default function DayScheduleTable({ days, setDays, canhDiemList, nhaHangList, khachSanList, getDayLabel, doanId, lockKhachSan }: Props) {
  const canhDiemOptions = useMemo(() =>
    canhDiemList.map((c) => ({
      value: String(c.id),
      label: c.ten,
    })), [canhDiemList]);

  const nhaHangOptions = useMemo(() =>
    nhaHangList.map((n) => ({
      value: String(n.id),
      label: `${n.ten}${n.dia_chi ? ` · ${n.dia_chi}` : ""}`,
    })), [nhaHangList]);

  const khachSanOptions = useMemo(() =>
    khachSanList.map((k) => ({
      value: String(k.id),
      label: `${k.ten}${k.dia_chi ? ` · ${k.dia_chi}` : ""}`,
    })), [khachSanList]);

  const handleDayChange = (index: number, day: DayLocal) => {
    const newDays = [...days];
    newDays[index] = day;
    setDays(newDays);
  };

  const handleRemoveDay = (index: number) => {
    const newDays = days.filter((_, i) => i !== index).map((d, i) => ({ ...d, ngay_so: i + 1 }));
    setDays(newDays);
  };

  const handleAddDay = () => {
    const lastDay = days[days.length - 1];
    let nextDate: string;
    if (lastDay) {
      // UTC-safe để tránh timezone-shift
      const [y, m, dd] = lastDay.ngay_date.split("-").map(Number);
      const d = new Date(Date.UTC(y, m - 1, dd));
      d.setUTCDate(d.getUTCDate() + 1);
      nextDate = d.toISOString().split("T")[0];
    } else {
      // Today's date in local timezone (avoid UTC shift)
      const now = new Date();
      const y = now.getFullYear();
      const m = String(now.getMonth() + 1).padStart(2, "0");
      const dd = String(now.getDate()).padStart(2, "0");
      nextDate = `${y}-${m}-${dd}`;
    }
    setDays([...days, {
      ngay_so: days.length + 1,
      ngay_date: nextDate,
      thu: getWeekday(nextDate),
      thanh_pho: "",
      an_trua_nha_hang_id: null,
      an_toi_nha_hang_id: null,
      an_trua_set_menu_id: null,
      an_toi_set_menu_id: null,
      an_trua_ghi_chu: "",
      an_toi_ghi_chu: "",
      khach_san_id: null,
      ks_ma_code: "",
      ks_loai_phong: "",
      items: [],
    }]);
  };

  return (
    <div className="space-y-0">
      <h3 className="text-sm font-semibold mb-2">Lịch trình ngày</h3>
      {/* Mobile: vuốt ngang thay vì bóp cột; desktop & print giữ nguyên */}
      <div className="overflow-x-auto print:overflow-visible">
      <div className="min-w-[820px] print:min-w-0">
      {/* Header */}
      <div className="grid grid-cols-[60px_1fr_1fr_1fr_1fr_32px] print:grid-cols-[60px_1fr_1fr_1fr_1fr] gap-0 border border-border rounded-t-lg bg-muted/50 text-xs font-medium text-muted-foreground">
        <div className="p-2 border-r border-border">Ngày</div>
        <div className="p-2 border-r border-border">Chương trình</div>
        <div className="p-2 border-r border-border">Ăn trưa</div>
        <div className="p-2 border-r border-border">Ăn tối</div>
        <div className="p-2 print:border-r-0">Khách sạn</div>
        <div className="p-2 print-hide"></div>
      </div>
      {/* Rows */}
      <div className="border-x border-border">
        {days.map((day, i) => (
          <DayRow
            key={i}
            day={day}
            onChange={(d) => handleDayChange(i, d)}
            onRemove={() => handleRemoveDay(i)}
            canhDiemList={canhDiemList}
            nhaHangList={nhaHangList}
            khachSanList={khachSanList}
            canhDiemOptions={canhDiemOptions}
            nhaHangOptions={nhaHangOptions}
            khachSanOptions={khachSanOptions}
            dayLabel={getDayLabel ? getDayLabel(day, i) : undefined}
            doanId={doanId}
            lockKhachSan={lockKhachSan}
          />
        ))}
      </div>
      {/* Add day */}
      <button
        type="button"
        onClick={handleAddDay}
        className="w-full py-2.5 border border-dashed border-border rounded-b-lg text-sm text-muted-foreground hover:border-foreground hover:text-foreground transition-colors print-hide"
      >
        <Plus className="inline h-4 w-4 mr-1" /> Thêm ngày
      </button>
      </div>
      </div>
    </div>
  );
}
