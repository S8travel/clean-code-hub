import { Fragment, useEffect, useState } from "react";
import { KeyRound, Save } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  useQuyenThem, useUpsertQuyenThem,
  type Resource, type UserQuyenThem,
} from "@/hooks/use-permissions";
import { errMsg } from "@/lib/error";
import { t, useTranslate } from "@/lib/i18n";
import { RESOURCES, RESOURCE_SECTIONS } from "./constants";

// Quyền cấp THÊM cho riêng một người — dùng khi một người cần thêm đúng một mục
// mà cả vai trò của họ thì không nên có (vd Báo Giá: có giá vốn và lợi nhuận).
//
// CHỈ CỘNG THÊM. Bỏ tick ở đây không cấm được thứ vai trò đã cho — muốn cấm thì
// sửa ma trận ở tab Phân quyền, hoặc đổi vai trò. Ghi rõ trên màn hình để admin
// không tick-bỏ-tick ở đây rồi tưởng đã chặn được ai.

const RONG: UserQuyenThem[] = [];

type Co = { v: boolean; c: boolean; e: boolean; d: boolean };
const coRong = (): Co => ({ v: false, c: false, e: false, d: false });

export function QuyenThemSection({ userId }: { userId: string }) {
  useTranslate();
  const { data: dangCo = RONG, isLoading } = useQuyenThem(userId);
  const luu = useUpsertQuyenThem();

  const [bang, setBang] = useState<Record<Resource, Co>>(
    () => Object.fromEntries(RESOURCES.map((r) => [r.value, coRong()])) as Record<Resource, Co>,
  );
  const [doiRoi, setDoiRoi] = useState(false);

  useEffect(() => {
    setBang(Object.fromEntries(
      RESOURCES.map((r) => {
        const row = dangCo.find((p) => p.resource === r.value);
        return [r.value, {
          v: row?.can_view ?? false,
          c: row?.can_create ?? false,
          e: row?.can_edit ?? false,
          d: row?.can_delete ?? false,
        }];
      }),
    ) as Record<Resource, Co>);
    setDoiRoi(false);
  }, [dangCo, userId]);

  const tick = (resource: Resource, o: keyof Co) => {
    setBang((p) => ({ ...p, [resource]: { ...p[resource], [o]: !p[resource][o] } }));
    setDoiRoi(true);
  };

  const soDangCap = Object.values(bang).filter((c) => c.v || c.c || c.e || c.d).length;

  const ghiLai = async () => {
    try {
      await luu.mutateAsync({
        userId,
        rows: RESOURCES.map((r) => ({
          resource: r.value,
          can_view: bang[r.value].v,
          can_create: bang[r.value].c,
          can_edit: bang[r.value].e,
          can_delete: bang[r.value].d,
        })),
      });
      setDoiRoi(false);
      toast.success(t("Đã lưu quyền cấp thêm"));
    } catch (err: unknown) {
      toast.error(t("Lỗi: ") + (errMsg(err) || t("Không lưu được")));
    }
  };

  return (
    <div className="border rounded-lg p-4 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium flex items-center gap-1.5">
            <KeyRound className="h-4 w-4 text-primary" />
            {t("Quyền cấp thêm cho riêng người này")}
            {soDangCap > 0 && (
              <span className="text-[10px] rounded-full bg-primary/10 text-primary px-1.5 py-0.5">
                {soDangCap}
              </span>
            )}
          </p>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            {t("Cộng thêm vào quyền của vai trò. Bỏ tick ở đây KHÔNG cấm được thứ vai trò đã cho — muốn cấm thì sửa ở tab Phân quyền.")}
          </p>
        </div>
        <Button size="sm" className="h-7 text-xs shrink-0" onClick={ghiLai}
          disabled={!doiRoi || luu.isPending}>
          <Save className="h-3 w-3 mr-1" />
          {luu.isPending ? t("Đang lưu...") : t("Lưu quyền")}
        </Button>
      </div>

      {isLoading ? (
        <p className="text-xs text-muted-foreground">{t("Đang tải...")}</p>
      ) : (
        <div className="border border-border rounded-md overflow-hidden bg-background">
          <Table>
            <TableHeader>
              <TableRow className="text-xs bg-muted/30">
                <TableHead className="py-2">{t("Resource")}</TableHead>
                <TableHead className="py-2 text-center w-16">{t("Xem")}</TableHead>
                <TableHead className="py-2 text-center w-16">{t("Tạo")}</TableHead>
                <TableHead className="py-2 text-center w-16">{t("Sửa")}</TableHead>
                <TableHead className="py-2 text-center w-16">{t("Xóa")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {RESOURCE_SECTIONS.map((section) => (
                <Fragment key={section.section}>
                  <TableRow className="bg-blue-50 hover:bg-blue-50">
                    <TableCell colSpan={5} className="py-1.5 font-semibold text-[11px] uppercase text-blue-900">
                      {t(section.section)}
                    </TableCell>
                  </TableRow>
                  {section.items.map((r) => (
                    <TableRow key={r.value} className="text-sm">
                      <TableCell className="py-1.5">{t(r.label)}</TableCell>
                      {(["v", "c", "e", "d"] as const).map((o) => (
                        <TableCell key={o} className="py-1.5 text-center">
                          <Checkbox
                            checked={bang[r.value]?.[o] ?? false}
                            onCheckedChange={() => tick(r.value, o)}
                          />
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </Fragment>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
