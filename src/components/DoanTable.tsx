import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { format, parseISO } from "date-fns";
import { vi } from "date-fns/locale";
import {
  ArrowUpDown, ArrowUp, ArrowDown, Pencil, Trash2, Ban, Copy, MoreHorizontal,
  Eye, Plane, Bus, CheckCircle2, Users, CalendarDays,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { useDoanQuyetToanPaidSet } from "@/hooks/use-doan";
import { useDoanOpMap } from "@/hooks/use-phan-viec";
import { computeDoanStatus } from "@/lib/doan-status";
import { t, useTranslate } from "@/lib/i18n";

/* ── helpers ── */

function fmtDate(d: string | null) {
  if (!d) return { date: "—", day: "" };
  const parsed = parseISO(d);
  return {
    date: format(parsed, "dd/MM/yyyy"),
    day: format(parsed, "EEEE", { locale: vi }),
  };
}

const LOAI_TOUR_BADGE: Record<string, { label: string; className: string }> = {
  outbound: { label: "Outbound", className: "bg-emerald-100 text-emerald-700" },
  noi_dia:  { label: "Nội địa",  className: "bg-orange-100 text-orange-700" },
};

function lookup(obj: any, field = "ten"): string {
  if (!obj) return "—";
  if (typeof obj === "object" && obj[field]) return obj[field];
  return "—";
}

function xeLabel(xe: any): string | null {
  if (!xe) return null;
  const parts = [xe.nha_xe?.ten ?? "", xe.ten_xe, xe.so_cho ? `${xe.so_cho} chỗ` : ""].filter(Boolean);
  return parts.length ? parts.join(" · ") : null;
}

const PALETTE = [
  "bg-blue-100 text-blue-700", "bg-emerald-100 text-emerald-700",
  "bg-amber-100 text-amber-700", "bg-purple-100 text-purple-700",
  "bg-pink-100 text-pink-700", "bg-cyan-100 text-cyan-700",
  "bg-orange-100 text-orange-700", "bg-indigo-100 text-indigo-700",
];
const AVATAR_BG = [
  "bg-blue-500", "bg-emerald-500", "bg-amber-500", "bg-purple-500",
  "bg-pink-500", "bg-cyan-500", "bg-orange-500", "bg-red-500",
];
function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}
function badgeColor(name: string) { return PALETTE[hashStr(name) % PALETTE.length]; }
function avatarBg(name: string) { return AVATAR_BG[hashStr(name) % AVATAR_BG.length]; }

// Trạng thái giàu: huỷ / hoàn thành / đang diễn ra / sắp khởi hành / đang chạy
function richStatus(g: any, qtPaidSet: Set<number> | null) {
  const base = computeDoanStatus(g, qtPaidSet ?? null);
  if (base === "huy")
    return { label: "Đã huỷ", tile: "bg-red-500", text: "text-red-600", chip: "Đã huỷ", icon: Ban };
  if (base === "hoan_thanh" || base === "da_quyet_toan")
    return {
      label: "Hoàn thành", tile: "bg-teal-500", text: "text-teal-600",
      chip: base === "da_quyet_toan" ? "Đã quyết toán" : "Đã hoàn thành", icon: CheckCircle2,
    };
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const di = g.ngay_di ? new Date(g.ngay_di + "T00:00:00") : null;
  const ve = g.ngay_ve ? new Date(g.ngay_ve + "T00:00:00") : null;
  if (di && ve && di.getTime() <= today.getTime() && today.getTime() <= ve.getTime())
    return { label: "Đang diễn ra", tile: "bg-blue-500", text: "text-blue-600", chip: "Đang diễn ra", icon: Bus };
  if (di && di.getTime() > today.getTime()) {
    const days = Math.ceil((di.getTime() - today.getTime()) / 86400000);
    if (days <= 3)
      return { label: "Sắp khởi hành", tile: "bg-amber-500", text: "text-amber-600", chip: `Khởi hành sau ${days} ngày`, icon: Plane };
  }
  return { label: "Đang chạy", tile: "bg-emerald-500", text: "text-emerald-600", chip: "Đang chạy", icon: Plane };
}

function nightsLabel(g: any): string | null {
  if (!g.ngay_di || !g.ngay_ve) return null;
  const d = Math.round(
    (new Date(g.ngay_ve + "T00:00:00").getTime() - new Date(g.ngay_di + "T00:00:00").getTime()) / 86400000,
  );
  return d > 0 ? `${d + 1}N${d}Đ` : null;
}

type SortKey = "ten_doan" | "ngay_di" | "ngay_ve";
type SortDir = "asc" | "desc";

/* ── props ── */
interface Props {
  groups: any[] | undefined;
  isLoading: boolean;
  userRolesMap: Map<string, string>;
  sortKey?: string;
  sortDir?: "asc" | "desc";
  onSortChange?: (key: string, dir: "asc" | "desc") => void;
  onEdit?: (doan: any) => void;
  onClone?: (doan: any) => void;
  onCancel?: (doan: any) => void;
  onDelete?: (doan: any) => void;
}

function Avatar({ name, label }: { name: string; label: string }) {
  return (
    <div className="flex items-center gap-2 min-w-0">
      <div className={cn("h-7 w-7 rounded-full flex items-center justify-center text-[10px] text-white font-bold shrink-0", avatarBg(name))}>
        {name.charAt(0).toUpperCase()}
      </div>
      <div className="min-w-0">
        <p className="text-[10px] text-muted-foreground leading-none">{label}</p>
        <p className="text-xs truncate leading-tight">{name}</p>
      </div>
    </div>
  );
}

function KhachChip({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex flex-col items-center px-2 py-0.5 border border-border/50 min-w-[34px] first:rounded-l-md">
      <span className="text-muted-foreground text-[8px]">{label}</span>
      <span className="tabular-nums text-[11px] font-medium">{value}</span>
    </div>
  );
}

export function DoanTable({
  groups, isLoading,
  sortKey: sortKeyProp, sortDir: sortDirProp, onSortChange,
  onEdit, onClone, onCancel, onDelete,
}: Props) {
  useTranslate();
  const navigate = useNavigate();
  const { data: qtPaidSet } = useDoanQuyetToanPaidSet();
  const { data: opMap } = useDoanOpMap((groups ?? []).map((g: any) => g.id));
  const [sortKeyState, setSortKeyState] = useState<SortKey>("ngay_di");
  const [sortDirState, setSortDirState] = useState<SortDir>("asc");
  const sortKey = (sortKeyProp as SortKey | undefined) ?? sortKeyState;
  const sortDir = sortDirProp ?? sortDirState;

  const toggleSort = (key: SortKey) => {
    const nextDir: SortDir = sortKey === key ? (sortDir === "asc" ? "desc" : "asc") : "asc";
    if (onSortChange) onSortChange(key, nextDir);
    else { setSortKeyState(key); setSortDirState(nextDir); }
  };

  const sorted = useMemo(() => {
    if (!groups) return [];
    return [...groups].sort((a, b) => {
      const va = a[sortKey] ?? "";
      const vb = b[sortKey] ?? "";
      const cmp = va < vb ? -1 : va > vb ? 1 : 0;
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [groups, sortKey, sortDir]);

  if (isLoading) {
    return (
      <div className="space-y-2 p-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-24 w-full rounded-xl" />
        ))}
      </div>
    );
  }

  if (!sorted.length) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
        <p className="text-sm">Không tìm thấy đoàn nào phù hợp.</p>
      </div>
    );
  }

  const SortIcon = ({ col }: { col: SortKey }) => {
    if (sortKey !== col) return <ArrowUpDown className="h-3 w-3 opacity-40" />;
    return sortDir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />;
  };

  const SORTS: { k: SortKey; l: string }[] = [
    { k: "ten_doan", l: "Mã đoàn" },
    { k: "ngay_di", l: "Ngày đón" },
    { k: "ngay_ve", l: "Ngày tiễn" },
  ];

  return (
    <div className="p-3">
      {/* Sort bar */}
      <div className="flex items-center gap-2 text-xs text-muted-foreground px-1 mb-2.5">
        <span>Sắp xếp:</span>
        {SORTS.map((s) => (
          <button
            key={s.k}
            onClick={() => toggleSort(s.k)}
            className={cn(
              "inline-flex items-center gap-1 px-2 py-1 rounded-md hover:bg-muted/60 transition-colors",
              sortKey === s.k && "text-foreground font-medium",
            )}
          >
            {s.l} <SortIcon col={s.k} />
          </button>
        ))}
      </div>

      <div className="overflow-x-auto">
      <div className="space-y-2.5 min-w-[1386px]">
      {sorted.map((g) => {
        const st = richStatus(g, qtPaidSet ?? null);
        const StIcon = st.icon;
        const don = fmtDate(g.ngay_di);
        const tien = fmtDate(g.ngay_ve);
        const hdvName = lookup(g.huong_dan_vien, "ten");
        const agentName = g.agents?.ten || "—";
        const agentHuy = g.agent_huy?.ten as string | undefined;
        const xe = xeLabel(g.xe);
        const diaDiem = lookup(g.dia_diem, "ten");
        const lon = g.so_khach_lon ?? 0;
        const em1 = g.so_khach_em1 ?? 0;
        const em2 = g.so_khach_em2 ?? 0;
        const tl = g.so_khach_tl ?? 0;
        const total = lon + em1 + em2 + tl;
        const op = opMap?.get(g.id)?.ten ?? null;
        const nights = nightsLabel(g);

        return (
          <div
            key={g.id}
            onClick={() => navigate(`/doan/${g.id}`)}
            className={cn(
              "rounded-xl border border-border bg-card hover:shadow-md transition-shadow cursor-pointer",
              g.trang_thai === "huy" && "opacity-70",
            )}
          >
            <div className="grid grid-cols-[300px_160px_120px_170px_210px_150px_180px_96px] items-stretch divide-x divide-gray-200">
              {/* 1. Trạng thái + Mã đoàn (giữ nguyên) */}
              <div className="flex items-center gap-3 px-4 py-3 min-w-0">
                <div className="flex flex-col items-center w-14 shrink-0 text-center">
                  <div className={cn("h-11 w-11 rounded-xl grid place-items-center text-white", st.tile)}>
                    <StIcon className="h-5 w-5" />
                  </div>
                  <span className={cn("text-[10px] mt-1 leading-tight font-medium", st.text)}>{st.label}</span>
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] text-muted-foreground">Mã đoàn</p>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="font-semibold text-sm text-[hsl(var(--brand))] truncate">{g.ten_doan}</span>
                    {g.loai_tour && LOAI_TOUR_BADGE[g.loai_tour] && (
                      <span className={cn("text-[10px] font-medium px-1.5 py-0.5 rounded-full", LOAI_TOUR_BADGE[g.loai_tour].className)}>
                        {LOAI_TOUR_BADGE[g.loai_tour].label}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                    {diaDiem !== "—" && (
                      <span className={cn("text-[10px] font-medium px-2 py-0.5 rounded-full", badgeColor(diaDiem))}>{diaDiem}</span>
                    )}
                    {nights && <span className="text-[11px] text-muted-foreground">{nights}</span>}
                  </div>
                  <span className={cn("inline-block mt-1.5 text-[10px] px-2 py-0.5 rounded-full bg-muted", st.text)}>{st.chip}</span>
                </div>
              </div>

              {/* 2. HDV / OP */}
              <div className="px-3 py-3 flex flex-col justify-center gap-1.5 min-w-0">
                {hdvName !== "—"
                  ? <Avatar name={hdvName} label="HDV" />
                  : <p className="text-xs text-muted-foreground">HDV: —</p>}
                {op
                  ? <Avatar name={op} label="OP" />
                  : <p className="text-xs text-muted-foreground">OP: chưa phân</p>}
              </div>

              {/* 3. Agent */}
              <div className="px-3 py-3 flex flex-col justify-center min-w-0">
                <p className="text-[10px] text-muted-foreground">Agent</p>
                <p className="text-xs truncate" title={agentName}>{agentName}</p>
                {agentHuy && (
                  <p className="text-[10px] text-destructive/80 mt-0.5 truncate">Hủy bởi: {agentHuy}</p>
                )}
              </div>

              {/* 4. Số lượng khách */}
              <div className="px-3 py-3 flex flex-col justify-center min-w-0">
                <div className="flex items-center gap-1.5 text-xs">
                  <Users className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="font-bold text-sm">{total}</span> khách
                </div>
                <div className="flex mt-1.5">
                  <KhachChip label={t("Lớn")} value={lon} />
                  <KhachChip label="50%" value={em1} />
                  <KhachChip label="Free" value={em2} />
                  <KhachChip label="T/L" value={tl} />
                </div>
              </div>

              {/* 6. Thời gian + chuyến bay (đón & tiễn) */}
              <div className="px-3 py-3 flex flex-col justify-center min-w-0 text-xs space-y-0.5">
                <div className="flex items-center gap-1.5">
                  <CalendarDays className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <span className="tabular-nums">{don.date} – {tien.date}</span>
                </div>
                {(don.day || tien.day) && (
                  <p className="text-[10px] text-muted-foreground capitalize pl-5">
                    {don.day} – {tien.day}
                  </p>
                )}
                {g.chuyen_bay_don && (
                  <div className="flex items-center gap-1.5 pt-0.5">
                    <Plane className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                    <span className="text-[10px] text-muted-foreground">Đón</span>
                    <code className="text-[11px] text-[hsl(var(--brand))] font-mono truncate">{g.chuyen_bay_don}</code>
                  </div>
                )}
                {g.chuyen_bay_tien && (
                  <div className="flex items-center gap-1.5">
                    <Plane className="h-3.5 w-3.5 text-orange-500 shrink-0 rotate-90" />
                    <span className="text-[10px] text-muted-foreground">Tiễn</span>
                    <code className="text-[11px] text-[hsl(var(--brand))] font-mono truncate">{g.chuyen_bay_tien}</code>
                  </div>
                )}
              </div>

              {/* 7. Loại xe */}
              <div className="px-3 py-3 flex flex-col justify-center min-w-0">
                <p className="text-[10px] text-muted-foreground">Loại xe</p>
                {xe
                  ? <p className="text-xs leading-snug line-clamp-2" title={xe}>{xe}</p>
                  : <span className="text-xs text-muted-foreground">—</span>}
              </div>

              {/* 8. Chú thích */}
              <div className="px-3 py-3 flex flex-col justify-center min-w-0">
                <p className="text-[10px] text-muted-foreground">Chú thích</p>
                {g.ghi_chu
                  ? <p className="text-xs line-clamp-3 leading-snug" title={g.ghi_chu}>{g.ghi_chu}</p>
                  : <span className="text-xs text-muted-foreground">—</span>}
              </div>

              {/* Actions */}
              <div className="px-1 py-3 flex items-center justify-center gap-0.5" onClick={(e) => e.stopPropagation()}>
                <Button
                  variant="ghost" size="icon" className="h-8 w-8"
                  title="Xem chi tiết"
                  onClick={() => navigate(`/doan/${g.id}`)}
                >
                  <Eye className="h-4 w-4" />
                </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-8 w-8" title="Thao tác">
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-36">
                    <DropdownMenuItem onClick={() => onEdit?.(g)}>
                      <Pencil className="h-3.5 w-3.5 mr-2" /> Sửa
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => onClone?.(g)}>
                      <Copy className="h-3.5 w-3.5 mr-2 text-sky-600" /> Nhân bản
                    </DropdownMenuItem>
                    {g.trang_thai !== "huy" && (
                      <DropdownMenuItem onClick={() => onCancel?.(g)}>
                        <Ban className="h-3.5 w-3.5 mr-2 text-orange-500" /> Hủy đoàn
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuItem
                      onClick={() => onDelete?.(g)}
                      className="text-destructive focus:text-destructive"
                    >
                      <Trash2 className="h-3.5 w-3.5 mr-2" /> Xóa vĩnh viễn
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          </div>
        );
      })}
      </div>
      </div>
    </div>
  );
}
