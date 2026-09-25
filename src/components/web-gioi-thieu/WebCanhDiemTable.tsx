import { useState } from "react";
import { toast } from "sonner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { errMsg } from "@/lib/error";
import { t } from "@/lib/i18n";
import {
  LOAI_CANH_DIEM_NHAN,
  chuanHoaSlideThuTu,
  laAnhWikimedia,
  locWebRows,
  type WebRowFilter,
} from "@/lib/web-anh";
import {
  useDatAnTrenWeb,
  useDatSlideThuTu,
  useGoAnhWeb,
  useTaiAnhWeb,
  useWebCanhDiemRows,
  type WebCanhDiemRow,
} from "@/hooks/use-web-gioi-thieu";
import WebAnhCell from "./WebAnhCell";

interface Props {
  canEdit: boolean;
  filter: WebRowFilter;
}

type Kind = "anh" | "slide";

/** Bảng cảnh điểm của trang web: ảnh đại diện (kèm nguồn), slide trang chủ, ẩn. */
export default function WebCanhDiemTable({ canEdit, filter }: Props) {
  const { data, isLoading, error } = useWebCanhDiemRows();
  const taiMut = useTaiAnhWeb();
  const goMut = useGoAnhWeb();
  const anMut = useDatAnTrenWeb();
  const slideMut = useDatSlideThuTu();
  const [dangTai, setDangTai] = useState<Set<string>>(new Set());
  const danhDau = (key: string, on: boolean) =>
    setDangTai((prev) => {
      const n = new Set(prev);
      if (on) n.add(key); else n.delete(key);
      return n;
    });

  const rows = locWebRows(data ?? [], filter, (r) => `${r.ten_vi} ${r.tinh_vi}`);

  const target = (r: WebCanhDiemRow, kind: Kind) =>
    ({ loai: "canh_diem", id: r.id, slug: r.slug, kind }) as const;
  const urlCu = (r: WebCanhDiemRow, kind: Kind) => (kind === "slide" ? r.slide_anh_url : r.anh_url);

  const tai = async (r: WebCanhDiemRow, kind: Kind, file: File) => {
    const key = `${r.id}:${kind}`;
    danhDau(key, true);
    try {
      await taiMut.mutateAsync({ target: target(r, kind), file, oldUrl: urlCu(r, kind) });
      toast.success(t("Đã tải ảnh lên"));
    } catch (e) {
      toast.error(errMsg(e) || t("Tải ảnh thất bại"));
    } finally {
      danhDau(key, false);
    }
  };

  const go = async (r: WebCanhDiemRow, kind: Kind) => {
    if (!window.confirm(t("Gỡ ảnh này khỏi trang web?"))) return;
    const key = `${r.id}:${kind}`;
    danhDau(key, true);
    try {
      await goMut.mutateAsync({ target: target(r, kind), oldUrl: urlCu(r, kind) });
      toast.success(t("Đã gỡ ảnh"));
    } catch (e) {
      toast.error(errMsg(e) || t("Lỗi"));
    } finally {
      danhDau(key, false);
    }
  };

  const an = async (r: WebCanhDiemRow, checked: boolean) => {
    try {
      await anMut.mutateAsync({ loai: "canh_diem", id: r.id, an: checked });
    } catch (e) {
      toast.error(errMsg(e) || t("Lỗi"));
    }
  };

  // Blur-save (không form): rỗng / 0 = rút khỏi slide.
  const doiSlide = async (r: WebCanhDiemRow, raw: string) => {
    const thuTu = chuanHoaSlideThuTu(raw);
    if (thuTu === r.slide_thu_tu) return;
    try {
      await slideMut.mutateAsync({ id: r.id, thuTu });
      toast.success(t("Đã cập nhật slide"));
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
              <TableHead className="py-1.5 px-2">{t("Tên")}</TableHead>
              <TableHead className="w-52 py-1.5 px-2">{t("Slide trang chủ")}</TableHead>
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
                    {r.anh_url && (
                      <p
                        className="mt-1 w-28 text-[10px] text-muted-foreground truncate"
                        title={r.anh_nguon ?? undefined}
                      >
                        {laAnhWikimedia(r.anh_url) ? t("Wikimedia — có ghi nguồn") : t("Ảnh tự tải")}
                      </p>
                    )}
                  </TableCell>
                  <TableCell className="py-1.5 px-2 align-top">
                    <div className="font-medium">{r.ten_vi}</div>
                    <div className="text-[11px] text-muted-foreground flex items-center gap-1.5">
                      <span>{r.tinh_vi}</span>
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4">
                        {t(LOAI_CANH_DIEM_NHAN[r.loai] ?? r.loai)}
                      </Badge>
                    </div>
                  </TableCell>
                  <TableCell className="py-1.5 px-2 align-top">
                    <div className="flex items-start gap-2">
                      <div className="flex flex-col gap-0.5">
                        <span className="text-[10px] text-muted-foreground">{t("Thứ tự")}</span>
                        <Input
                          key={`${r.id}-${r.slide_thu_tu ?? ""}`}
                          type="number"
                          min={1}
                          defaultValue={r.slide_thu_tu ?? ""}
                          placeholder="—"
                          disabled={!canEdit}
                          className="h-7 w-14 text-xs px-1.5 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                          onBlur={(e) => doiSlide(r, e.target.value)}
                          title={t("Vị trí trên slide trang chủ — để trống là không đưa lên slide")}
                        />
                      </div>
                      <WebAnhCell
                        url={r.slide_anh_url}
                        kind="slide"
                        canEdit={canEdit}
                        dangTai={dangTai.has(`${r.id}:slide`)}
                        onChon={(f) => tai(r, "slide", f)}
                        onGo={() => go(r, "slide")}
                      />
                    </div>
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
