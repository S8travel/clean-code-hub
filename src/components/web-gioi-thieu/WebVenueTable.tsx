import { useState } from "react";
import { toast } from "sonner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { errMsg } from "@/lib/error";
import { t } from "@/lib/i18n";
import { locWebRows, type WebRowFilter, type WebVenueRow } from "@/lib/web-anh";
import {
  useDatAnTrenWeb,
  useGoAnhWeb,
  useTaiAnhWeb,
  useWebVenueRows,
  type WebVenueLoai,
} from "@/hooks/use-web-gioi-thieu";
import WebAnhCell from "./WebAnhCell";

interface Props {
  loai: WebVenueLoai;
  canEdit: boolean;
  filter: WebRowFilter;
}

type Kind = "anh" | "logo";

/** Bảng khách sạn hoặc nhà hàng: ảnh, logo, ẩn trên web. */
export default function WebVenueTable({ loai, canEdit, filter }: Props) {
  const { data, isLoading, error } = useWebVenueRows(loai);
  const taiMut = useTaiAnhWeb();
  const goMut = useGoAnhWeb();
  const anMut = useDatAnTrenWeb();
  // "id:kind" đang tải — spinner đúng ô, các ô khác vẫn bấm được.
  const [dangTai, setDangTai] = useState<Set<string>>(new Set());
  const danhDau = (key: string, on: boolean) =>
    setDangTai((prev) => {
      const n = new Set(prev);
      if (on) n.add(key); else n.delete(key);
      return n;
    });

  const rows = locWebRows(data ?? [], filter, (r) => `${r.ten} ${r.dia_diem ?? ""}`);

  const tai = async (r: WebVenueRow, kind: Kind, file: File) => {
    const key = `${r.id}:${kind}`;
    danhDau(key, true);
    try {
      await taiMut.mutateAsync({
        target: { loai, refId: r.id, kind },
        file,
        oldUrl: kind === "logo" ? r.logo_url : r.anh_url,
      });
      toast.success(t("Đã tải ảnh lên"));
    } catch (e) {
      toast.error(errMsg(e) || t("Tải ảnh thất bại"));
    } finally {
      danhDau(key, false);
    }
  };

  const go = async (r: WebVenueRow, kind: Kind) => {
    if (!window.confirm(t("Gỡ ảnh này khỏi trang web?"))) return;
    const key = `${r.id}:${kind}`;
    danhDau(key, true);
    try {
      await goMut.mutateAsync({
        target: { loai, refId: r.id, kind },
        oldUrl: kind === "logo" ? r.logo_url : r.anh_url,
      });
      toast.success(t("Đã gỡ ảnh"));
    } catch (e) {
      toast.error(errMsg(e) || t("Lỗi"));
    } finally {
      danhDau(key, false);
    }
  };

  const an = async (r: WebVenueRow, checked: boolean) => {
    try {
      await anMut.mutateAsync({ loai, id: r.id, an: checked });
    } catch (e) {
      toast.error(errMsg(e) || t("Lỗi"));
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-2 pt-2">
        {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}
      </div>
    );
  }
  if (error) return <p className="text-xs text-destructive pt-2">{errMsg(error)}</p>;

  return (
    <div className="space-y-1 pt-2">
      <p className="text-[11px] text-muted-foreground">{rows.length} {t("mục")}</p>
      <div className="rounded-md border overflow-x-auto">
        <Table className="text-xs">
          <TableHeader>
            <TableRow className="bg-[#E6F1FB]">
              <TableHead className="w-36 py-1.5 px-2">{t("Ảnh")}</TableHead>
              <TableHead className="w-24 py-1.5 px-2">{t("Logo")}</TableHead>
              <TableHead className="py-1.5 px-2">{t("Tên")}</TableHead>
              <TableHead className="w-28 py-1.5 px-2 text-center">{t("Ẩn trên web")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="text-center text-muted-foreground py-6">
                  {t("Không có mục nào khớp")}
                </TableCell>
              </TableRow>
            ) : (
              rows.map((r) => (
                <TableRow key={r.id} className={r.an_tren_web ? "opacity-60" : undefined}>
                  <TableCell className="py-1.5 px-2 align-top">
                    <WebAnhCell
                      url={r.anh_url}
                      kind="anh"
                      canEdit={canEdit}
                      dangTai={dangTai.has(`${r.id}:anh`)}
                      onChon={(f) => tai(r, "anh", f)}
                      onGo={() => go(r, "anh")}
                    />
                  </TableCell>
                  <TableCell className="py-1.5 px-2 align-top">
                    <WebAnhCell
                      url={r.logo_url}
                      kind="logo"
                      canEdit={canEdit}
                      dangTai={dangTai.has(`${r.id}:logo`)}
                      onChon={(f) => tai(r, "logo", f)}
                      onGo={() => go(r, "logo")}
                    />
                  </TableCell>
                  <TableCell className="py-1.5 px-2 align-top">
                    <div className="font-medium">{r.ten}</div>
                    {r.dia_diem && <div className="text-[11px] text-muted-foreground">{r.dia_diem}</div>}
                  </TableCell>
                  <TableCell className="py-1.5 px-2 text-center align-top">
                    <Switch
                      checked={r.an_tren_web}
                      disabled={!canEdit}
                      onCheckedChange={(v) => an(r, v)}
                      aria-label={t("Ẩn trên web")}
                    />
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
