import { Fragment, useEffect, useState } from "react";
import { Ban, Save } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  useQuyenBo, useUpsertQuyenBo,
  type Resource, type UserQuyenBo,
} from "@/hooks/use-permissions";
import { errMsg } from "@/lib/error";
import { t, useTranslate } from "@/lib/i18n";
import { RESOURCES, RESOURCE_SECTIONS } from "./constants";

// Quyền THU HỒI của riêng một người — ngược với "Quyền cấp thêm". Dùng khi một
// người không nên thấy một mục mà cả vai trò của họ thì vẫn cần: tắt ở ma trận
// là tắt cho cả nhóm, còn đổi vai trò thì kéo theo mọi quyền khác.
//
// Tick chạy SAU CÙNG và thắng mọi nguồn cho (vai trò + quyền cấp thêm). Không áp
// cho admin — admin là đường quay lại sửa phân quyền.

const RONG: UserQuyenBo[] = [];

type Co = { v: boolean; c: boolean; e: boolean; d: boolean };
const coRong = (): Co => ({ v: false, c: false, e: false, d: false });

export function QuyenBoSection({ userId, laAdmin }: { userId: string; laAdmin: boolean }) {
  useTranslate();
  const { data: dangBo = RONG, isLoading } = useQuyenBo(userId);
  const luu = useUpsertQuyenBo();

  const [bang, setBang] = useState<Record<Resource, Co>>(
    () => Object.fromEntries(RESOURCES.map((r) => [r.value, coRong()])) as Record<Resource, Co>,
  );
  const [doiRoi, setDoiRoi] = useState(false);

  useEffect(() => {
    setBang(Object.fromEntries(
      RESOURCES.map((r) => {
        const row = dangBo.find((p) => p.resource === r.value);
        return [r.value, {
          v: row?.can_view ?? false,
          c: row?.can_create ?? false,
          e: row?.can_edit ?? false,
          d: row?.can_delete ?? false,
        }];
      }),
    ) as Record<Resource, Co>);
    setDoiRoi(false);
  }, [dangBo, userId]);

  const tick = (resource: Resource, o: keyof Co) => {
    setBang((p) => ({ ...p, [resource]: { ...p[resource], [o]: !p[resource][o] } }));
    setDoiRoi(true);
  };

  // Tick "Xem" là ẩn hẳn mục khỏi người này → tick luôn 3 ô còn lại cho khỏi
  // hiểu nhầm là "vào xem được nhưng không sửa".
  const tickXem = (resource: Resource) => {
    setBang((p) => {
      const bat = !p[resource].v;
      return { ...p, [resource]: bat ? { v: true, c: true, e: true, d: true } : coRong() };
    });
    setDoiRoi(true);
  };

  const soDangBo = Object.values(bang).filter((c) => c.v || c.c || c.e || c.d).length;

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
      toast.success(t("Đã lưu quyền thu hồi"));
    } catch (err: unknown) {
      toast.error(t("Lỗi: ") + (errMsg(err) || t("Không lưu được")));
    }
  };

  return (
    <div className="border rounded-lg p-4 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium flex items-center gap-1.5">
            <Ban className="h-4 w-4 text-rose-600" />
            {t("Quyền thu hồi của riêng người này")}
            {soDangBo > 0 && (
              <span className="text-[10px] rounded-full bg-rose-100 text-rose-700 px-1.5 py-0.5">
                {soDangBo}
              </span>
            )}
          </p>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            {t("Tick ô nào thì người này MẤT quyền đó, kể cả khi vai trò của họ có. Tick \"Xem\" là ẩn hẳn mục khỏi menu và chặn vào trang.")}
          </p>
        </div>
        <Button size="sm" variant="destructive" className="h-7 text-xs shrink-0" onClick={ghiLai}
          disabled={!doiRoi || luu.isPending}>
          <Save className="h-3 w-3 mr-1" />
          {luu.isPending ? t("Đang lưu...") : t("Lưu thu hồi")}
        </Button>
      </div>

      {laAdmin && (
        <p className="rounded-md bg-amber-50 px-3 py-2 text-[11px] leading-snug text-amber-800">
          {t("Người này là admin — admin luôn thấy mọi mục nên thu hồi ở đây không có tác dụng. Đây là chủ ý: admin là đường quay lại sửa phân quyền.")}
        </p>
      )}

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
                  <TableRow className="bg-rose-50 hover:bg-rose-50">
                    <TableCell colSpan={5} className="py-1.5 font-semibold text-[11px] uppercase text-rose-900">
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
                            onCheckedChange={() => (o === "v" ? tickXem(r.value) : tick(r.value, o))}
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
