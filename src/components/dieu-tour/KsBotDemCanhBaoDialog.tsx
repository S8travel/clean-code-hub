import {
  AlertDialog, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { nhanDem, type KsBotDemCanhBao } from "@/lib/ks-bot-dem";

const fmt = (n: number) => Math.round(n).toLocaleString("vi-VN");

interface Props {
  canhBao: KsBotDemCanhBao | null;
  /** OP bấm "vẫn tiếp tục" → lưu thay đổi lịch trình như bình thường. */
  onTiepTuc: () => void;
  /** OP bấm "giữ nguyên" → hoàn tác các đêm bị đụng, không lưu. */
  onGiuNguyen: () => void;
  /** Mở tab Chi phí để OP xử lý tiền (công nợ / chênh lệch thừa). */
  onMoChiPhi: () => void;
}

/**
 * Cảnh báo TRƯỚC khi lưu: đêm đang giữ tiền sắp bị gỡ / bị gán sang khách sạn khác.
 *
 * CỐ Ý chỉ cảnh báo, KHÔNG tự xử lý tiền. Quy trình hiện hành (nút "Xử lý chênh lệch thừa"
 * ở tab Chi phí → sinh công nợ) đang chạy đúng — nhiệm vụ của dialog này chỉ là đảm bảo OP
 * BIẾT mình đang bước qua cái gì, thay vì thao tác trôi đi trong im lặng như trước.
 */
export default function KsBotDemCanhBaoDialog({
  canhBao, onTiepTuc, onGiuNguyen, onMoChiPhi,
}: Props) {
  if (!canhBao) return null;

  const laGan = canhBao.kind === "gan_ks_vao_dem_co_tien";
  const tenKs = canhBao.oldKsName ?? "khách sạn trước đó";

  return (
    // KHÔNG dùng AlertDialogAction/AlertDialogCancel cho các nút: chúng là Radix Close,
    // click sẽ gọi luôn onOpenChange(false) → onGiuNguyen, CHỒNG lên onTiepTuc → thao tác
    // bị revert ngay sau khi xác nhận (ngõ cụt). Nút thuần + parent tự set canhBao=null để
    // đóng. onOpenChange chỉ còn phục vụ phím Esc / click nền = "giữ nguyên".
    <AlertDialog open onOpenChange={(o) => { if (!o) onGiuNguyen(); }}>
      <AlertDialogContent className="max-w-lg">
        <AlertDialogHeader>
          <AlertDialogTitle className="text-base">
            {laGan
              ? "Đêm này đang giữ tiền của khách sạn khác"
              : `Đêm bị gỡ đang giữ tiền của ${tenKs}`}
          </AlertDialogTitle>

          <AlertDialogDescription asChild>
            <div className="space-y-3 text-sm">
              <div className="rounded-md border bg-muted/40 p-2.5 space-y-1.5">
                {canhBao.demDinhTien.map((d) => (
                  <div key={d.dayId} className="flex items-baseline justify-between gap-3">
                    <span className="font-medium text-foreground">{nhanDem(d)}</span>
                    <span className="text-right tabular-nums">
                      {d.daTra > 0 && (
                        <span className="font-semibold text-foreground">
                          đã chi {fmt(d.daTra)} ₫
                        </span>
                      )}
                      {d.daTra > 0 && d.daDeNghi > d.daTra && " · "}
                      {d.daDeNghi > d.daTra && (
                        <span className="text-amber-700">
                          còn nợ phiếu {fmt(d.daDeNghi - d.daTra)} ₫
                        </span>
                      )}
                      {d.daTra === 0 && d.daDeNghi > 0 && (
                        <span className="text-amber-700">
                          đã duyệt chi {fmt(d.daDeNghi)} ₫
                        </span>
                      )}
                    </span>
                  </div>
                ))}
              </div>

              {laGan ? (
                <p>
                  Số tiền trên <strong>đã trả cho khách sạn trước đó</strong>. Gán khách sạn mới
                  vào đêm này sẽ khiến hệ thống đọc khoản đó thành <strong>của khách sạn mới</strong>
                  {" "}— trong khi tiền thật thì không đi theo.
                </p>
              ) : (
                <p>
                  Gỡ đêm này <strong>không tự đòi lại tiền</strong> từ {tenKs}.
                  {canhBao.soDemConLai > 0 && (
                    <> {tenKs} vẫn còn <strong>{canhBao.soDemConLai} đêm</strong> khác trong tour — các đêm đó không bị đụng.</>
                  )}
                </p>
              )}

              <p className="text-muted-foreground">
                Sau khi lưu, vào tab <strong>Chi phí</strong> để chốt phí hủy với khách sạn hoặc
                ghi nhận công nợ thu hồi. Hệ thống sẽ không tự làm việc đó.
              </p>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>

        <AlertDialogFooter className="gap-2 sm:gap-2">
          <button
            type="button"
            onClick={onGiuNguyen}
            className="inline-flex h-9 items-center justify-center rounded-md border px-3 text-sm hover:bg-muted"
          >
            Giữ nguyên lịch trình
          </button>
          <button
            type="button"
            onClick={onMoChiPhi}
            className="inline-flex h-9 items-center justify-center rounded-md border px-3 text-sm hover:bg-muted"
          >
            Mở tab Chi phí
          </button>
          <button
            type="button"
            onClick={onTiepTuc}
            className="inline-flex h-9 items-center justify-center rounded-md px-3 text-sm font-medium text-white bg-amber-600 hover:bg-amber-700"
          >
            Tôi hiểu, vẫn đổi
          </button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
