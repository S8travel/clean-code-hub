import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { format, parseISO } from "date-fns";
import { vi } from "date-fns/locale";
import { ArrowUpDown, ArrowUp, ArrowDown, Pencil, Trash2, KeyRound, Ban } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PermissionDialog } from "@/components/PermissionDialog";
import type { UserRole } from "@/hooks/use-doan";
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

function lookup(obj: any, field = "ten"): string {
  if (!obj) return "—";
  if (typeof obj === "object" && obj[field]) return obj[field];
  return "—";
}

function xeLabel(xe: any): string | null {
  if (!xe) return null;
  const nhaXe = xe.nha_xe?.ten ?? "";
  const socho = xe.so_cho ? `${xe.so_cho} chỗ` : "";
  const parts = [nhaXe, xe.ten_xe, socho].filter(Boolean);
  return parts.length ? parts.join(" · ") : null;
}

const PALETTE = [
  "bg-blue-100 text-blue-700",
  "bg-emerald-100 text-emerald-700",
  "bg-amber-100 text-amber-700",
  "bg-purple-100 text-purple-700",
  "bg-pink-100 text-pink-700",
  "bg-cyan-100 text-cyan-700",
  "bg-orange-100 text-orange-700",
  "bg-indigo-100 text-indigo-700",
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

function badgeColor(name: string) {
  return PALETTE[hashStr(name) % PALETTE.length];
}

function avatarBg(name: string) {
  return AVATAR_BG[hashStr(name) % AVATAR_BG.length];
}

type SortKey = "ten_doan" | "ngay_di" | "ngay_ve";
type SortDir = "asc" | "desc";

/* ── props ── */
interface Props {
  groups: any[] | undefined;
  isLoading: boolean;
  userRolesMap: Map<string, string>; // user_id → ho_ten
  onEdit?: (doan: any) => void;
  onCancel?: (doan: any) => void;
  onDelete?: (doan: any) => void;
}

export function DoanTable({ groups, isLoading, userRolesMap, onEdit, onCancel, onDelete }: Props) {
  useTranslate();
  const navigate = useNavigate();
  const [sortKey, setSortKey] = useState<SortKey>("ngay_di");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [permDoan, setPermDoan] = useState<{ id: number; code: string } | null>(null);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
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
          <Skeleton key={i} className="h-14 w-full rounded-lg" />
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

  const rowBg = (g: any) => {
    if (g.trang_thai === "huy") return "bg-[rgba(226,75,74,0.05)]";
    if (g.trang_thai === "hoan_thanh") return "bg-muted/30";
    return "";
  };

  const getOpName = (g: any): string | null => {
    if (!g.assigned_to) return null;
    return userRolesMap.get(g.assigned_to) || "—";
  };

  return (
    <>
      {/* Desktop table */}
      <div className="hidden xl:block overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border/40">
              <Th onClick={() => toggleSort("ten_doan")} className="min-w-[180px]">
                Code Đoàn <SortIcon col="ten_doan" />
              </Th>
              <Th className="min-w-[130px]">HDV</Th>
              <Th className="min-w-[120px]">Agent</Th>
              <Th className="min-w-[100px]">OP</Th>
              <Th className="min-w-[90px]">Địa Điểm</Th>
              <Th className="min-w-[200px]">Số Khách</Th>
              <Th className="min-w-[120px]">Loại Xe</Th>
              <Th className="min-w-[150px]">Ghi Chú</Th>
              <Th onClick={() => toggleSort("ngay_di")} className="min-w-[100px]">
                Ngày Đón <SortIcon col="ngay_di" />
              </Th>
              <Th onClick={() => toggleSort("ngay_ve")} className="min-w-[100px]">
                Ngày Tiễn <SortIcon col="ngay_ve" />
              </Th>
              <Th className="min-w-[80px]">CB Đến</Th>
              <Th className="min-w-[80px]">CB Đi</Th>
              <Th className="min-w-[90px] sticky right-0 bg-card">{" "}</Th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((g) => {
              const don = fmtDate(g.ngay_di);
              const tien = fmtDate(g.ngay_ve);
              const xe = xeLabel(g.xe);
              const hdvName = lookup(g.huong_dan_vien, "ten");
              const agentName = g.agents?.ten || "—";
              const agentHuyName = g.agent_huy?.ten;
              const diaDiem = lookup(g.dia_diem, "ten");
              const lon = g.so_khach_lon ?? 0;
              const em1 = g.so_khach_em1 ?? 0;
              const em2 = g.so_khach_em2 ?? 0;
              const tl = g.so_khach_tl ?? 0;
              const total = lon + em1 + em2 + tl;
              const op = getOpName(g);

              return (
                <tr
                  key={g.id}
                  onClick={() => navigate(`/doan/${g.id}`)}
                  className={`group border-b border-border/40 hover:bg-muted/50 cursor-pointer transition-colors ${rowBg(g)}`}
                >
                  {/* Code Đoàn */}
                  <td className="px-3 py-3">
                    <span className="font-semibold text-[hsl(var(--brand))]">{g.ten_doan}</span>
                    {g.ghi_chu_dieu_tour && (
                      <p className="text-xs text-muted-foreground mt-0.5 truncate max-w-[200px]">{g.ghi_chu_dieu_tour}</p>
                    )}
                    {g.trang_thai === "huy" && (
                      <Badge variant="destructive" className="mt-1 text-[10px] px-1.5 py-0">Đã hủy</Badge>
                    )}
                    {g.trang_thai === "hoan_thanh" && (
                      <Badge variant="secondary" className="mt-1 text-[10px] px-1.5 py-0">Hoàn thành</Badge>
                    )}
                  </td>

                  {/* HDV */}
                  <td className="px-3 py-3">
                    {hdvName !== "—" ? (
                      <div className="flex items-center gap-2">
                        <div className={`h-6 w-6 rounded-full flex items-center justify-center text-[10px] text-white font-bold ${avatarBg(hdvName)}`}>
                          {hdvName.charAt(0).toUpperCase()}
                        </div>
                        <span className="text-xs">{hdvName}</span>
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </td>

                  {/* Agent */}
                  <td className="px-3 py-3">
                    <span className="text-xs">{agentName}</span>
                    {agentHuyName && (
                      <p className="text-[10px] text-destructive/80 mt-0.5">Hủy bởi: {agentHuyName}</p>
                    )}
                  </td>

                  {/* OP */}
                  <td className="px-3 py-3">
                    {op ? (
                      <div className="flex items-center gap-2">
                        <div className={`h-6 w-6 rounded-full flex items-center justify-center text-[10px] text-white font-bold ${avatarBg(op)}`}>
                          {op.charAt(0).toUpperCase()}
                        </div>
                        <span className="text-xs">{op}</span>
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">— Chưa phân</span>
                    )}
                  </td>

                  {/* Địa Điểm */}
                  <td className="px-3 py-3">
                    {diaDiem !== "—" ? (
                      <span className={`inline-block text-[10px] font-medium px-2 py-0.5 rounded-full ${badgeColor(diaDiem)}`}>
                        {diaDiem}
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </td>

                  {/* Số Khách grid */}
                  <td className="px-3 py-3">
                    <div className="flex items-center gap-0 text-[10px] font-medium">
                      <KhachCell label={t("Lớn")} value={lon} />
                      <KhachCell label="6–10" value={em1} />
                      <KhachCell label="<6" value={em2} />
                      <KhachCell label="T/L" value={tl} />
                      <div className="flex flex-col items-center px-2 py-0.5 bg-[hsl(var(--brand))] text-white rounded-r-md min-w-[36px]">
                        <span className="opacity-80 text-[8px]">Tổng</span>
                        <span className="font-bold text-xs">{total}</span>
                      </div>
                    </div>
                  </td>

                  {/* Loại Xe */}
                  <td className="px-3 py-3">
                    {xe ? (
                      <span className="text-[10px] bg-muted px-2 py-1 rounded-md">{xe}</span>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </td>

                  {/* Ghi Chú */}
                  <td className="px-3 py-3">
                    {g.ghi_chu ? (
                      <span className="text-xs text-muted-foreground truncate block max-w-[150px]" title={g.ghi_chu}>{g.ghi_chu}</span>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </td>

                  {/* Ngày Đón */}
                  <td className="px-3 py-3">
                    <span className="tabular-nums text-xs">{don.date}</span>
                    {don.day && <p className="text-[10px] text-muted-foreground capitalize">{don.day}</p>}
                  </td>

                  {/* Ngày Tiễn */}
                  <td className="px-3 py-3">
                    <span className="tabular-nums text-xs">{tien.date}</span>
                    {tien.day && <p className="text-[10px] text-muted-foreground capitalize">{tien.day}</p>}
                  </td>

                  {/* CB Đến */}
                  <td className="px-3 py-3">
                    {g.chuyen_bay_don ? (
                      <code className="text-xs text-[hsl(var(--brand))] font-mono">{g.chuyen_bay_don}</code>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </td>

                  {/* CB Đi */}
                  <td className="px-3 py-3">
                    {g.chuyen_bay_tien ? (
                      <code className="text-xs text-[hsl(var(--brand))] font-mono">{g.chuyen_bay_tien}</code>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </td>

                  {/* Actions */}
                  <td className="px-2 py-3 sticky right-0 bg-card">
                    <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={(e) => { e.stopPropagation(); onEdit?.(g); }}
                        title="Sửa"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-amber-600 hover:text-amber-700 hover:bg-amber-50"
                        onClick={(e) => { e.stopPropagation(); setPermDoan({ id: g.id, code: g.ten_doan }); }}
                        title="Phân quyền"
                      >
                        <KeyRound className="h-3.5 w-3.5" />
                      </Button>
                      {g.trang_thai !== "huy" && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-orange-500 hover:text-orange-600 hover:bg-orange-50"
                          onClick={(e) => { e.stopPropagation(); onCancel?.(g); }}
                          title="Hủy đoàn"
                        >
                          <Ban className="h-3.5 w-3.5" />
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-destructive hover:text-destructive hover:bg-destructive/10"
                        onClick={(e) => { e.stopPropagation(); onDelete?.(g); }}
                        title="Xóa vĩnh viễn"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <div className="xl:hidden space-y-3 p-3">
        {sorted.map((g) => {
          const don = fmtDate(g.ngay_di);
          const tien = fmtDate(g.ngay_ve);
          const hdvName = lookup(g.huong_dan_vien, "ten");
          const lon = g.so_khach_lon ?? 0;
          const em1 = g.so_khach_em1 ?? 0;
          const em2 = g.so_khach_em2 ?? 0;
          const tl = g.so_khach_tl ?? 0;
          const total = lon + em1 + em2 + tl;

          return (
            <div
              key={g.id}
              onClick={() => navigate(`/doan/${g.id}`)}
              className={`rounded-xl bg-card shadow-card p-4 cursor-pointer active:scale-[0.99] transition-transform ${rowBg(g)}`}
            >
              <div className="flex items-start justify-between mb-2">
                <div>
                  <span className="font-semibold text-sm text-[hsl(var(--brand))]">{g.ten_doan}</span>
                  {g.trang_thai === "huy" && <Badge variant="destructive" className="ml-2 text-[10px] px-1.5 py-0">Đã hủy</Badge>}
                  {g.trang_thai === "hoan_thanh" && <Badge variant="secondary" className="ml-2 text-[10px] px-1.5 py-0">Hoàn thành</Badge>}
                </div>
                <div className="flex items-center gap-1">
                  <span className="text-xs font-bold text-[hsl(var(--brand))]">{total} khách</span>
                  <Button variant="ghost" size="icon" className="h-7 w-7"
                    onClick={(e) => { e.stopPropagation(); onEdit?.(g); }}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  {g.trang_thai !== "huy" && (
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-orange-500"
                      onClick={(e) => { e.stopPropagation(); onCancel?.(g); }}>
                      <Ban className="h-3.5 w-3.5" />
                    </Button>
                  )}
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive"
                    onClick={(e) => { e.stopPropagation(); onDelete?.(g); }}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-1 text-xs text-muted-foreground">
                <span>Đón: {don.date}</span>
                <span>Tiễn: {tien.date}</span>
                {hdvName !== "—" && <span>HDV: {hdvName}</span>}
                {g.agents?.ten && <span>Agent: {g.agents.ten}</span>}
              </div>
            </div>
          );
        })}
      </div>

      {permDoan && (
        <PermissionDialog
          doanId={permDoan.id}
          doanCode={permDoan.code}
          open={!!permDoan}
          onOpenChange={(open) => { if (!open) setPermDoan(null); }}
        />
      )}
    </>
  );
}

/* ── Sub-components ── */

function Th({ children, onClick, className = "" }: { children: React.ReactNode; onClick?: () => void; className?: string }) {
  return (
    <th
      onClick={onClick}
      className={`px-3 py-2.5 text-left text-[10px] uppercase font-semibold text-muted-foreground tracking-wider whitespace-nowrap ${onClick ? "cursor-pointer select-none hover:text-foreground" : ""} ${className}`}
    >
      <span className="inline-flex items-center gap-1">{children}</span>
    </th>
  );
}

function KhachCell({ label, value }: { label: string; value: number }) {
  const isZh = document.cookie.includes("googtrans=/vi/zh-TW");
  return (
    <div className="flex flex-col items-center px-2 py-0.5 border border-border/40 min-w-[36px] first:rounded-l-md">
      <span className={`text-muted-foreground text-[8px]${isZh ? " notranslate" : ""}`}>{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}
