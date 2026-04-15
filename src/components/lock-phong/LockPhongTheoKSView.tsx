import { useMemo, useState } from "react";
import { format } from "date-fns";
import { vi } from "date-fns/locale";
import { ChevronDown, ChevronRight, Hotel, Mail, MapPin } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { type LockPhongDisplay, type LockPhongKSDisplay } from "@/hooks/use-lock-phong";
import LockPhongEmailModal from "./LockPhongEmailModal";

function fmtDate(d: string) {
  try {
    return format(new Date(d + "T00:00:00"), "dd/MM/yyyy", { locale: vi });
  } catch {
    return d;
  }
}

function EmailStatusBadge({ status }: { status: string }) {
  if (status === "da_xac_nhan")
    return <Badge className="text-[10px] bg-teal-100 text-teal-700 border-0">Đã XN</Badge>;
  if (status === "cho_xac_nhan")
    return <Badge className="text-[10px] bg-blue-100 text-blue-700 border-0">Chờ XN</Badge>;
  if (status === "da_huy")
    return <Badge className="text-[10px] bg-red-100 text-red-700 border-0">Đã hủy</Badge>;
  return (
    <Badge className="text-[10px] bg-muted text-muted-foreground border-0">Chưa gửi</Badge>
  );
}

interface KSGroup {
  khach_san_id: number;
  khach_san_ten: string;
  khach_san_email: string | null;
  khach_san_dia_diem: string | null;
  entries: { lockPhong: LockPhongDisplay; ksRow: LockPhongKSDisplay }[];
}

interface Props {
  data: LockPhongDisplay[];
}

export default function LockPhongTheoKSView({ data }: Props) {
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());
  const [emailTarget, setEmailTarget] = useState<{
    lockPhong: LockPhongDisplay;
    ksRow: LockPhongKSDisplay;
  } | null>(null);

  const groups = useMemo<KSGroup[]>(() => {
    const map = new Map<number, KSGroup>();
    for (const lp of data) {
      for (const ks of lp.hotels) {
        if (!map.has(ks.khach_san_id)) {
          map.set(ks.khach_san_id, {
            khach_san_id: ks.khach_san_id,
            khach_san_ten: ks.khach_san_ten,
            khach_san_email: ks.khach_san_email,
            khach_san_dia_diem: ks.khach_san_dia_diem,
            entries: [],
          });
        }
        map.get(ks.khach_san_id)!.entries.push({ lockPhong: lp, ksRow: ks });
      }
    }
    // Sort by hotel name, then sort each group's entries by check_in
    return Array.from(map.values())
      .sort((a, b) => a.khach_san_ten.localeCompare(b.khach_san_ten))
      .map((g) => ({
        ...g,
        entries: [...g.entries].sort((a, b) =>
          a.ksRow.check_in.localeCompare(b.ksRow.check_in)
        ),
      }));
  }, [data]);

  const toggleExpand = (id: number) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  if (groups.length === 0) {
    return (
      <p className="py-12 text-center text-sm text-muted-foreground">
        Chưa có dữ liệu lock phòng
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {groups.map((group) => {
        const isOpen = expandedIds.has(group.khach_san_id);
        return (
          <div
            key={group.khach_san_id}
            className="rounded-xl border border-border bg-card overflow-hidden"
          >
            {/* Hotel header — clickable to expand/collapse */}
            <button
              type="button"
              className="w-full px-4 py-3 flex items-center gap-3 text-left hover:bg-muted/30 transition-colors bg-muted/20 border-b border-border"
              onClick={() => toggleExpand(group.khach_san_id)}
            >
              <Hotel className="h-4 w-4 text-muted-foreground shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-sm">{group.khach_san_ten}</span>
                  <Badge variant="secondary" className="text-[10px]">
                    {group.entries.length} đoàn
                  </Badge>
                  {group.khach_san_dia_diem && (
                    <span className="flex items-center gap-0.5 text-xs text-muted-foreground">
                      <MapPin className="h-3 w-3" />
                      {group.khach_san_dia_diem}
                    </span>
                  )}
                  {group.khach_san_email && (
                    <span className="flex items-center gap-0.5 text-xs text-muted-foreground">
                      <Mail className="h-3 w-3" />
                      {group.khach_san_email}
                    </span>
                  )}
                </div>
              </div>
              {isOpen ? (
                <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
              ) : (
                <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
              )}
            </button>

            {/* Entries table */}
            {isOpen && (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/10">
                      <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">
                        Tên đoàn
                      </th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">
                        Seri
                      </th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">
                        Ngày xuất phát
                      </th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">
                        Check-in
                      </th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">
                        Check-out
                      </th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">
                        Đêm
                      </th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">
                        Số phòng
                      </th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">
                        Trạng thái
                      </th>
                      <th className="px-4 py-2 text-xs font-medium text-muted-foreground" />
                    </tr>
                  </thead>
                  <tbody>
                    {group.entries.map(({ lockPhong, ksRow }) => (
                      <tr
                        key={`${lockPhong.id}-${ksRow.id}`}
                        className={cn(
                          "border-b border-border last:border-0 hover:bg-muted/10 transition-colors",
                          ksRow.email_status === "da_huy" && "opacity-50"
                        )}
                      >
                        <td className="px-4 py-2.5 font-medium">{lockPhong.ten_doan}</td>
                        <td className="px-4 py-2.5 text-muted-foreground text-xs">
                          {lockPhong.ten_seri}
                        </td>
                        <td className="px-4 py-2.5 text-xs">
                          {fmtDate(lockPhong.ngay_xuat_phat)}
                        </td>
                        <td className="px-4 py-2.5 text-xs">{fmtDate(ksRow.check_in)}</td>
                        <td className="px-4 py-2.5 text-xs">{fmtDate(ksRow.check_out)}</td>
                        <td className="px-4 py-2.5 text-xs font-medium">{ksRow.so_dem}</td>
                        <td className="px-4 py-2.5 text-xs text-muted-foreground">
                          {ksRow.so_phong || "—"}
                        </td>
                        <td className="px-4 py-2.5">
                          <EmailStatusBadge status={ksRow.email_status} />
                        </td>
                        <td className="px-4 py-2.5">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 gap-1 text-xs text-muted-foreground hover:text-foreground px-2"
                            onClick={() => setEmailTarget({ lockPhong, ksRow })}
                          >
                            <Mail className="h-3 w-3" />
                            Email
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        );
      })}

      {emailTarget && (
        <LockPhongEmailModal
          open={true}
          onOpenChange={(v) => { if (!v) setEmailTarget(null); }}
          lockPhong={emailTarget.lockPhong}
          ksRow={emailTarget.ksRow}
        />
      )}
    </div>
  );
}
