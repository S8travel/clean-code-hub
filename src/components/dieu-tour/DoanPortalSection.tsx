import { AlertTriangle, Globe, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { usePushPortal, useSetPortalEnabled, type KetQuaDay } from "@/hooks/use-portal-push";
import { ketQuaThanhLoi } from "@/lib/portal-thong-bao";

interface Props {
  doan: {
    id: number;
    agent_id: number | null;
    trang_thai: string | null;
    portal_enabled?: boolean | null;
    portal_pushed_at?: string | null;
  };
  /** Số ngày đã có lịch trình — đoàn rỗng mà mở cổng thì đối tác mở ra thấy trang trắng. */
  soNgayCoLich: number;
}

// Cho đối tác xem chương trình đoàn này trên cổng (外網).
//
// KHÔNG đưa sang cổng: mọi số tiền, nhà cung cấp, và trạng thái booking — đối tác
// thấy khách sạn "chưa gửi" là gọi thẳng khách sạn, mất vai trò trung gian.
// Chương trình được dựng lại mỗi lần đẩy nên sửa lịch là bên kia thấy bản mới.
export function DoanPortalSection({ doan, soNgayCoLich }: Props) {
  const setEnabled = useSetPortalEnabled("doan");
  const push = usePushPortal();

  const dangChiaSe = !!doan.portal_enabled;
  const chuaGanDoiTac = doan.agent_id == null;
  const daHuy = doan.trang_thai === "huy";
  const chuaCoLich = soNgayCoLich === 0;

  const bao = (r: KetQuaDay) => {
    const { kieu, loi } = ketQuaThanhLoi(r);
    (kieu === "success" ? toast.success : toast.warning)(loi, { duration: kieu === "success" ? 4000 : 8000 });
  };

  const day = () =>
    push.mutate(undefined, {
      onSuccess: bao,
      onError: (e) => toast.error(e instanceof Error ? e.message : "Lỗi đẩy dữ liệu"),
    });

  const toggle = (bat: boolean) => {
    if (bat && chuaGanDoiTac) {
      toast.error("Đoàn chưa gắn đối tác — cổng cần biết đưa chương trình cho ai xem.");
      return;
    }
    if (bat && chuaCoLich) {
      toast.error("Đoàn chưa có ngày nào trong lịch trình — đối tác mở ra sẽ thấy trang trống.");
      return;
    }
    setEnabled.mutate(
      { id: doan.id, bat },
      {
        // Đẩy luôn để OP biết ngay kết quả (kể cả việc đối tác chưa có tài khoản),
        // thay vì đợi tới lượt cron 30 phút rồi mới phát hiện.
        onSuccess: () => day(),
        onError: () => toast.error("Lỗi lưu"),
      },
    );
  };

  return (
    <section className="print-hide bg-white border border-slate-200 rounded-lg p-4 space-y-2">
      <div className="flex items-center gap-2">
        <h2 className="text-xs uppercase tracking-wider font-semibold text-slate-500 inline-flex items-center gap-1.5">
          <Globe className="h-3.5 w-3.5" /> Cổng đối tác
        </h2>
        <div className="ml-auto flex items-center gap-2">
          <span className="text-xs text-slate-600">Cho đối tác xem chương trình</span>
          <Switch
            checked={dangChiaSe}
            onCheckedChange={toggle}
            disabled={setEnabled.isPending || daHuy}
          />
        </div>
      </div>

      <p className="text-[11px] text-slate-500">
        {daHuy ? (
          <>Đoàn đã hủy nên không hiện trên cổng nữa — hệ thống đã tự gỡ khỏi cổng.</>
        ) : chuaGanDoiTac ? (
          <>Đoàn chưa gắn <b>đối tác</b> nên chưa chia sẻ được.</>
        ) : dangChiaSe ? (
          <>Đối tác xem được chương trình từng ngày, khách sạn, nhà hàng, HDV. <b>Không</b> có tiền
          và <b>không</b> có trạng thái booking. Chương trình tự cập nhật lại 30 phút/lần; tắt công
          tắc là gỡ khỏi cổng.
          {doan.portal_pushed_at && ` Lần đẩy gần nhất: ${new Date(doan.portal_pushed_at).toLocaleString("vi-VN")}.`}</>
        ) : (
          <>Bật để đối tác xem chương trình đoàn này. Chỉ gồm lịch trình — không có tiền, không có
          trạng thái booking.</>
        )}
      </p>

      {dangChiaSe && chuaCoLich && (
        <p className="text-[11px] text-amber-700 inline-flex items-center gap-1.5">
          <AlertTriangle className="h-3.5 w-3.5" />
          Đoàn chưa có ngày nào trong lịch trình — đối tác đang mở ra thấy trang trống.
        </p>
      )}

      {dangChiaSe && !daHuy && (
        <Button size="sm" variant="outline" className="h-7 text-xs gap-1" disabled={push.isPending} onClick={day}>
          {push.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
          Đẩy ngay
        </Button>
      )}
    </section>
  );
}
