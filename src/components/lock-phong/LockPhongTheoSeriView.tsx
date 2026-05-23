import { useMemo, useState } from "react";
import { format, differenceInDays, parseISO } from "date-fns";
import { vi } from "date-fns/locale";
import { ChevronDown, ChevronRight, Hotel, MapPin, ArrowRight, Pencil, Trash2, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { DeleteDialog } from "@/components/DeleteDialog";
import { useDeleteLockPhong, type LockPhongDisplay } from "@/hooks/use-lock-phong";
import { t, useTranslate } from "@/lib/i18n";

function fmtDate(d: string) {
  try {
    return format(new Date(d + "T00:00:00"), "dd/MM/yyyy", { locale: vi });
  } catch {
    return d;
  }
}

function DeadlineBadge({ deadline }: { deadline: string | null }) {
  if (!deadline) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dl = parseISO(deadline);
  const diff = differenceInDays(dl, today);
  if (diff < 0) {
    return (
      <span className="inline-flex items-center gap-0.5 text-[10px] text-red-600 font-medium">
        <Clock className="h-2.5 w-2.5" /> {t("Quá hạn")} {Math.abs(diff)}n
      </span>
    );
  }
  if (diff <= 3) {
    return (
      <span className="inline-flex items-center gap-0.5 text-[10px] text-orange-600 font-medium">
        <Clock className="h-2.5 w-2.5" /> {t("DL")}: {fmtDate(deadline)} ({diff === 0 ? t("hôm nay") : `${t("còn")} ${diff}n`})
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-0.5 text-[10px] text-muted-foreground">
      <Clock className="h-2.5 w-2.5" /> {t("DL")}: {fmtDate(deadline)}
    </span>
  );
}

interface SeriGroup {
  key: string;
  ten_seri: string;
  entries: LockPhongDisplay[];
}

interface Props {
  data: LockPhongDisplay[];
  onEdit: (entry: LockPhongDisplay) => void;
}

export default function LockPhongTheoSeriView({ data, onEdit }: Props) {
  useTranslate();
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(new Set());
  const [deleteTarget, setDeleteTarget] = useState<LockPhongDisplay | null>(null);
  const deleteMut = useDeleteLockPhong();

  const groups = useMemo<SeriGroup[]>(() => {
    const map = new Map<string, SeriGroup>();
    for (const lp of data) {
      const key = String(lp.seri_id ?? lp.ten_seri);
      if (!map.has(key)) {
        map.set(key, { key, ten_seri: lp.ten_seri, entries: [] });
      }
      map.get(key)!.entries.push(lp);
    }
    return Array.from(map.values())
      .sort((a, b) => a.ten_seri.localeCompare(b.ten_seri))
      .map((g) => ({
        ...g,
        entries: [...g.entries].sort((a, b) =>
          a.ngay_xuat_phat.localeCompare(b.ngay_xuat_phat)
        ),
      }));
  }, [data]);

  const toggle = (key: string) => {
    setExpandedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteMut.mutateAsync(deleteTarget.id);
      toast.success(t("Đã xóa lock phòng"));
    } catch {
      toast.error(t("Lỗi khi xóa"));
    } finally {
      setDeleteTarget(null);
    }
  };

  if (groups.length === 0) {
    return (
      <p className="py-12 text-center text-sm text-muted-foreground">
        {t("Chưa có dữ liệu lock phòng")}
      </p>
    );
  }

  return (
    <>
      <div className="space-y-3">
        {groups.map((group) => {
          const isOpen = expandedKeys.has(group.key);
          return (
            <div
              key={group.key}
              className="rounded-xl border border-border bg-card overflow-hidden"
            >
              {/* Seri header — collapsible */}
              <button
                type="button"
                className="w-full px-4 py-3 flex items-center gap-3 text-left hover:bg-muted/30 transition-colors bg-muted/20 border-b border-border"
                onClick={() => toggle(group.key)}
              >
                <div className="flex-1 min-w-0 flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-sm">{group.ten_seri}</span>
                  <Badge variant="secondary" className="text-[10px]">
                    {group.entries.length} {t("đoàn")}
                  </Badge>
                </div>
                {isOpen ? (
                  <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                ) : (
                  <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                )}
              </button>

              {/* Expanded: list of entries */}
              {isOpen && (
                <div className="divide-y divide-border">
                  {group.entries.map((entry) => (
                    <div key={entry.id} className="px-4 py-3">
                      {/* Entry header */}
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-medium text-sm">{entry.ten_doan}</span>
                            <span className="text-xs text-muted-foreground">
                              {t("Xuất phát")}: {fmtDate(entry.ngay_xuat_phat)}
                            </span>
                            <DeadlineBadge deadline={entry.deadline} />
                          </div>
                          {entry.ghi_chu && (
                            <p className="text-xs text-muted-foreground italic mt-0.5">
                              {entry.ghi_chu}
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground"
                            title={t("Chỉnh sửa")}
                            onClick={() => onEdit(entry)}
                          >
                            <Pencil className="h-3 w-3" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
                            title={t("Xóa")}
                            onClick={() => setDeleteTarget(entry)}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>

                      {/* Hotels for this entry */}
                      {entry.hotels.length > 0 && (
                        <div className="mt-2 space-y-1 pl-1">
                          {entry.hotels.map((hotel) => (
                            <div
                              key={hotel.id}
                              className="flex items-center gap-1.5 text-xs text-muted-foreground flex-wrap"
                            >
                              <Hotel className="h-3 w-3 shrink-0 text-muted-foreground/60" />
                              <span className="font-medium text-foreground">
                                {hotel.khach_san_ten}
                              </span>
                              {hotel.khach_san_dia_diem && (
                                <span className="flex items-center gap-0.5">
                                  <MapPin className="h-2.5 w-2.5" />
                                  {hotel.khach_san_dia_diem}
                                </span>
                              )}
                              <span className="text-muted-foreground/40">·</span>
                              <span>{fmtDate(hotel.check_in)}</span>
                              <ArrowRight className="h-2.5 w-2.5" />
                              <span>{fmtDate(hotel.check_out)}</span>
                              <span className="font-medium text-foreground">
                                ({hotel.so_dem} {t("đêm")})
                              </span>
                              {hotel.so_phong && (
                                <>
                                  <span className="text-muted-foreground/40">·</span>
                                  <span>{hotel.so_phong}</span>
                                </>
                              )}
                            </div>
                          ))}
                        </div>
                      )}

                      {entry.hotels.length === 0 && (
                        <p className="mt-1 text-xs text-muted-foreground italic pl-1">
                          {t("Chưa có khách sạn")}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <DeleteDialog
        open={!!deleteTarget}
        name={deleteTarget?.ten_doan ?? ""}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
        isDeleting={deleteMut.isPending}
        description={`${t("Lock phòng")} "${deleteTarget?.ten_doan}" ${t("sẽ bị xóa vĩnh viễn cùng toàn bộ dữ liệu khách sạn liên quan.")}`}
      />
    </>
  );
}
