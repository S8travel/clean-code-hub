import { Globe, Loader2, Lock, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import type { BaoGiaRow } from "@/hooks/use-bao-gia";
import { usePushPortal, useSetPortalEnabled } from "@/hooks/use-portal-push";
import { buildPortalBaoGiaSnapshot } from "@/lib/portal-payload";
import { liveKetQua } from "./helpers";

interface Props {
  draft: BaoGiaRow;
  /** Lưu bản đóng băng vào portal_noi_dung (không đụng trạng thái báo giá). */
  savePatch: (patch: Partial<BaoGiaRow>) => void;
}

// Chia sẻ báo giá này cho đối tác xem trên cổng (外網).
// Điều kiện: bảng giá phải được đóng băng trước — cổng chỉ hiện bản đã chốt, sửa
// giá vốn sau không làm đổi con số đã chào.
export function PortalShareSection({ draft, savePatch }: Props) {
  const setEnabled = useSetPortalEnabled("bao_gia");
  const push = usePushPortal();

  const daDongBang = !!draft.portal_noi_dung;
  const dangChiaSe = draft.portal_enabled;
  // Báo giá gửi khách TRƯỚC khi có tính năng này thì đang ở 'sent' mà chưa có bản
  // đóng băng. Bắt họ "Mở lại để sửa" rồi "Gửi khách" lần nữa chỉ để chốt giá là
  // vô lý (và làm mất dấu lần gửi thật) → cho chốt tại chỗ.
  const chotDuocTaiCho = draft.trang_thai === "sent" && !daDongBang;

  const chotGia = () => {
    const fresh = liveKetQua(draft);
    if (!fresh) {
      toast.error("Không tính lại được bảng giá — kiểm tra lại phần chi phí.");
      return;
    }
    try {
      // Neo ngày chào về lúc TẠO báo giá, không lấy hôm nay: hiệu lực tính từ đó
      // (hieu_luc_ngay), chốt muộn mà lấy hôm nay là tự kéo dài hạn đã hứa với
      // khách — đối tác đặt theo giá đã hết hạn thì mình chịu.
      const chaoLuc = draft.created_at ? new Date(draft.created_at) : new Date();
      savePatch({ portal_noi_dung: buildPortalBaoGiaSnapshot(draft, fresh, chaoLuc) });
      toast.success("Đã chốt bảng giá hiện tại. Bật công tắc để đối tác xem.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Lỗi chốt giá");
    }
  };

  const toggle = (bat: boolean) => {
    if (bat && !daDongBang) {
      toast.error('Bấm "Gửi khách" trước để chốt bảng giá, rồi mới chia sẻ được.');
      return;
    }
    setEnabled.mutate(
      { id: draft.id, bat },
      {
        onSuccess: () => toast.success(bat ? "Đã mở cho đối tác xem." : "Đã ngừng chia sẻ."),
        onError: () => toast.error("Lỗi lưu"),
      },
    );
  };

  return (
    <section className="bg-white border border-slate-200 rounded-lg p-4 space-y-3">
      <div className="flex items-center gap-2">
        <h2 className="text-xs uppercase tracking-wider font-semibold text-slate-500 inline-flex items-center gap-1.5">
          <Globe className="h-3.5 w-3.5" /> Cổng đối tác
        </h2>
        <div className="ml-auto flex items-center gap-2">
          <span className="text-xs text-slate-600">Cho đối tác xem</span>
          <Switch checked={dangChiaSe} onCheckedChange={toggle} disabled={setEnabled.isPending} />
        </div>
      </div>

      <p className="text-[11px] text-slate-500">
        {chotDuocTaiCho ? (
          <>Báo giá này đã gửi khách từ trước khi có cổng đối tác nên chưa có bản chốt.
          Bấm <b>Chốt bảng giá hiện tại</b> để lưu lại đúng con số đang hiển thị.</>
        ) : !daDongBang ? (
          <>Chưa chốt giá. Bấm <b>Gửi khách</b> để khoá bảng giá lại — cổng chỉ hiện bản đã chốt,
          sửa đơn giá sau không làm đổi con số đã chào.</>
        ) : dangChiaSe ? (
          <>Đối tác đăng nhập cổng là thấy bảng giá này. Hệ thống tự đẩy lại 30 phút/lần.
          {draft.portal_pushed_at && ` Lần đẩy gần nhất: ${new Date(draft.portal_pushed_at).toLocaleString("vi-VN")}.`}</>
        ) : (
          <>Đã chốt giá xong. Bật công tắc để đối tác xem được trên cổng.</>
        )}
      </p>

      {chotDuocTaiCho && (
        <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={chotGia}>
          <Lock className="h-3 w-3" /> Chốt bảng giá hiện tại
        </Button>
      )}

      {dangChiaSe && (
        <Button
          size="sm"
          variant="outline"
          className="h-7 text-xs gap-1"
          disabled={push.isPending}
          onClick={() =>
            push.mutate(undefined, {
              onSuccess: (r) => toast.success(`Đã đẩy ${r.bao_gia} báo giá, ${r.doan} đoàn sang cổng.`),
              onError: (e) => toast.error(e instanceof Error ? e.message : "Lỗi đẩy dữ liệu"),
            })
          }
        >
          {push.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
          Đẩy ngay
        </Button>
      )}
    </section>
  );
}
