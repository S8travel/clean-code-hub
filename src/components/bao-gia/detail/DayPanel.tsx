import { MapPin, Utensils, Hotel, Bus, Ticket, Plus, Trash2, ChevronDown, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { BaoGiaItem } from "@/hooks/use-bao-gia";
import { fmtVnd } from "./helpers";

interface Props {
  dayIdx: number;        // 1-based
  cityLabel?: string;    // e.g. "Hà Nội Arrival"
  hotelItems: BaoGiaItem[];
  mealItems: BaoGiaItem[];
  ticketItems: BaoGiaItem[];
  transportItems: BaoGiaItem[];
  isExpanded: boolean;
  onToggle: () => void;
}

// Một accordion day-card. Khi expanded hiển thị các nhóm dịch vụ (cảnh
// điểm/ăn/KS/xe/vé). Read-only cho P1 — input chỉ để show layout.
export function DayPanel({
  dayIdx, cityLabel = "—",
  hotelItems, mealItems, ticketItems, transportItems,
  isExpanded, onToggle,
}: Props) {
  return (
    <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-slate-50 text-left"
      >
        <div className="flex items-center gap-2 text-sm">
          <span className="font-semibold text-blue-700">DAY {dayIdx}</span>
          <MapPin className="h-3.5 w-3.5 text-slate-400" />
          <span className="text-slate-700">{cityLabel}</span>
        </div>
        {isExpanded
          ? <ChevronDown className="h-4 w-4 text-slate-400" />
          : <ChevronRight className="h-4 w-4 text-slate-400" />}
      </button>
      {isExpanded && (
        <div className="border-t border-slate-200 px-4 py-3 space-y-2">
          {/* Cảnh điểm (dummy chips — schema chưa lưu cảnh điểm per ngày) */}
          <Row
            icon={<MapPin className="h-4 w-4 text-emerald-600" />}
            label="Cảnh điểm"
            rightContent={
              <div className="flex items-center gap-1.5 flex-wrap">
                {/* P1 shell — chưa có dữ liệu cảnh điểm per ngày */}
                <ChipPlaceholder>— chưa có dữ liệu</ChipPlaceholder>
                <Button variant="outline" size="sm" className="h-6 text-xs px-2 gap-0.5">
                  <Plus className="h-3 w-3" />
                  Thêm
                </Button>
              </div>
            }
          />

          {/* Ăn trưa — show first meal item if any */}
          <MealRow label="Ăn trưa" item={mealItems[0]} />
          <MealRow label="Ăn tối"  item={mealItems[1]} />

          {/* Khách sạn */}
          <HotelRow item={hotelItems[0]} />

          {/* Xe đưa đón */}
          <TransportRow item={transportItems[0]} />

          {/* Vé tham quan */}
          <TicketRow item={ticketItems[0]} />

          <div className="pt-2">
            <Button
              variant="outline"
              size="sm"
              className="w-full h-9 text-xs gap-1 border-dashed text-slate-600 hover:bg-slate-50"
            >
              <Plus className="h-3.5 w-3.5" />
              Thêm dịch vụ
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Sub-rows ─────────────────────────────────────────────────────────── */

function Row({
  icon, label, rightContent,
}: {
  icon: React.ReactNode;
  label: string;
  rightContent: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-3 py-1.5">
      <div className="flex items-center gap-2 w-[110px] shrink-0 pt-1.5">
        <span className="h-7 w-7 rounded-md bg-slate-100 inline-flex items-center justify-center">
          {icon}
        </span>
        <span className="text-xs font-medium text-slate-700">{label}</span>
      </div>
      <div className="flex-1 min-w-0">{rightContent}</div>
    </div>
  );
}

function MealRow({ label, item }: { label: string; item?: BaoGiaItem }) {
  const total = (item?.don_gia ?? 0) * 3; // assume 3 bàn placeholder
  return (
    <Row
      icon={<Utensils className="h-4 w-4 text-orange-600" />}
      label={label}
      rightContent={
        <div className="grid grid-cols-12 gap-2 items-center">
          <Input
            value={item?.mo_ta || ""}
            placeholder="Chọn nhà hàng..."
            readOnly
            className="col-span-5 h-9 bg-slate-50 text-xs"
          />
          <LabeledNum cls="col-span-2" label="Suất ăn" value={fmtVnd(item?.don_gia)} />
          <LabeledNum cls="col-span-1" label="Số bàn" value="3" />
          <LabeledNum cls="col-span-1" label="Markup" value="15 %" />
          <div className="col-span-2 text-right">
            <div className="text-[10px] text-slate-500 uppercase tracking-wide">Thành tiền</div>
            <div className="text-sm font-semibold text-slate-900 tabular-nums">{fmtVnd(total)}</div>
          </div>
          <Button variant="ghost" size="icon" className="col-span-1 h-8 w-8 text-slate-400 hover:text-destructive">
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      }
    />
  );
}

function HotelRow({ item }: { item?: BaoGiaItem }) {
  return (
    <Row
      icon={<Hotel className="h-4 w-4 text-indigo-600" />}
      label="Khách sạn"
      rightContent={
        <div className="grid grid-cols-12 gap-2 items-center">
          <Input
            value={item?.mo_ta || ""}
            placeholder="Chọn khách sạn..."
            readOnly
            className="col-span-5 h-9 bg-slate-50 text-xs"
          />
          <LabeledNum cls="col-span-2" label="Hạng phòng" value="Deluxe" />
          <LabeledNum cls="col-span-2" label="Số phòng" value="12" />
          <div className="col-span-2 text-right">
            <div className="text-[10px] text-slate-500 uppercase tracking-wide">Thành tiền</div>
            <div className="text-sm font-semibold text-slate-900 tabular-nums">{fmtVnd(item?.don_gia)}</div>
          </div>
          <Button variant="ghost" size="icon" className="col-span-1 h-8 w-8 text-slate-400 hover:text-destructive">
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      }
    />
  );
}

function TransportRow({ item }: { item?: BaoGiaItem }) {
  return (
    <Row
      icon={<Bus className="h-4 w-4 text-cyan-600" />}
      label="Xe đưa đón"
      rightContent={
        <div className="grid grid-cols-12 gap-2 items-center">
          <Input
            value={item?.mo_ta || ""}
            placeholder="Chọn loại xe..."
            readOnly
            className="col-span-5 h-9 bg-slate-50 text-xs"
          />
          <LabeledNum cls="col-span-4" label="Thời gian" value="1 ngày" />
          <div className="col-span-2 text-right">
            <div className="text-[10px] text-slate-500 uppercase tracking-wide">Thành tiền</div>
            <div className="text-sm font-semibold text-slate-900 tabular-nums">{fmtVnd(item?.don_gia)}</div>
          </div>
          <Button variant="ghost" size="icon" className="col-span-1 h-8 w-8 text-slate-400 hover:text-destructive">
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      }
    />
  );
}

function TicketRow({ item }: { item?: BaoGiaItem }) {
  return (
    <Row
      icon={<Ticket className="h-4 w-4 text-rose-600" />}
      label="Vé tham quan"
      rightContent={
        <div className="grid grid-cols-12 gap-2 items-center">
          <Input
            value={item?.mo_ta || ""}
            placeholder="Chọn vé..."
            readOnly
            className="col-span-5 h-9 bg-slate-50 text-xs"
          />
          <LabeledNum cls="col-span-2" label="Số lượng" value="25" />
          <LabeledNum cls="col-span-2" label="Đơn giá" value={fmtVnd(item?.don_gia)} />
          <div className="col-span-2 text-right">
            <div className="text-[10px] text-slate-500 uppercase tracking-wide">Thành tiền</div>
            <div className="text-sm font-semibold text-slate-900 tabular-nums">{fmtVnd((item?.don_gia ?? 0) * 25)}</div>
          </div>
          <Button variant="ghost" size="icon" className="col-span-1 h-8 w-8 text-slate-400 hover:text-destructive">
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      }
    />
  );
}

function LabeledNum({ cls, label, value }: { cls: string; label: string; value: string }) {
  return (
    <div className={cls}>
      <div className="text-[10px] text-slate-500 uppercase tracking-wide">{label}</div>
      <div className="text-xs text-slate-800 tabular-nums mt-0.5">{value}</div>
    </div>
  );
}

function ChipPlaceholder({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center px-2 py-0.5 text-xs text-slate-400 italic">
      {children}
    </span>
  );
}
