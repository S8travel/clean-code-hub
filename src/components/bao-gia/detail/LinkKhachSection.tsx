import { useState } from "react";
import { Check, Copy, Eye, Link2, Loader2, RefreshCw, ShieldOff } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { useTaoLinkBaoGia, useThuHoiLinkBaoGia } from "@/hooks/use-link-bao-gia";
import type { BaoGiaRow } from "@/hooks/use-bao-gia";

// Link xem báo giá gửi cho người KHÔNG có tài khoản cổng.
//
// Phần lớn đối tác chưa được cấp tài khoản cổng, khách lẻ thì không bao giờ có.
// Với họ "gửi báo giá" nghĩa là đính file Word vào mail — nên chào lại lần 2,
// lần 3 là ba file trùng tên nằm trong hộp thư, không ai biết bản nào mới.
//
// Link gắn với BÁO GIÁ chứ không gắn với bản: chào thêm bản mới thì vẫn link đó,
// khách bấm lại là thấy bản mới nhất. Đó là toàn bộ lý do làm link thay vì chỉ
// đính file. Gửi kèm cả hai thì hơn — file để đọc offline, link để luôn đúng.

const ngay = (s: string | null) => (s ? format(new Date(s), "dd/MM/yyyy") : "—");
const gio = (s: string | null) => (s ? format(new Date(s), "HH:mm dd/MM/yyyy") : "—");

export function LinkKhachSection({ draft }: { draft: BaoGiaRow }) {
  const tao = useTaoLinkBaoGia();
  const thuHoi = useThuHoiLinkBaoGia();
  const [daChep, setDaChep] = useState(false);

  // Chưa chào bản nào thì chưa có gì để chia sẻ — hàm phía sau cũng chặn, nhưng
  // ẩn nút ở đây thì OP không phải bấm mới biết.
  if ((draft.so_phien_ban_cuoi ?? 0) < 1) return null;

  const coLink = !!draft.link_token && !draft.link_thu_hoi;
  const url = draft.link_token
    ? `https://s8-agent-portal.vercel.app/xem/${draft.link_token}`
    : "";

  const chep = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setDaChep(true);
      setTimeout(() => setDaChep(false), 2000);
    } catch {
      toast.error("Không chép được — bôi đen rồi copy tay giúp em");
    }
  };

  return (
    <section className="bg-white border border-slate-200 rounded-lg p-4 space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <h2 className="text-xs uppercase tracking-wider font-semibold text-slate-500 inline-flex items-center gap-1.5">
          <Link2 className="h-3.5 w-3.5" /> Link gửi khách không có cổng
        </h2>
        {coLink && draft.link_so_lan_mo > 0 && (
          <span className="inline-flex items-center gap-1 text-[11px] text-emerald-700 bg-emerald-50 border border-emerald-200 rounded px-1.5 py-0.5">
            <Eye className="h-3 w-3" />
            Khách đã mở {draft.link_so_lan_mo} lần · {gio(draft.link_mo_gan_nhat)}
          </span>
        )}
        {coLink && draft.link_so_lan_mo === 0 && (
          <span className="text-[11px] text-slate-500 bg-slate-100 rounded px-1.5 py-0.5">
            Khách chưa mở
          </span>
        )}
      </div>

      {!coLink ? (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">
            {draft.link_thu_hoi
              ? "Link đã thu hồi. Tạo lại thì link cũ trong mail sống lại và hiện bản mới nhất."
              : "Tạo một link mở không cần đăng nhập, gửi kèm mail cùng file Word. Chào thêm bản mới thì vẫn link này."}
          </p>
          <Button
            size="sm"
            className="h-8 text-xs gap-1.5"
            disabled={tao.isPending}
            onClick={() =>
              tao.mutate(
                { baoGiaId: draft.id },
                {
                  onSuccess: (kq) => toast.success(`Đã tạo link — hiệu lực tới ${ngay(kq.het_han)}`),
                  onError: (e) => toast.error(e instanceof Error ? e.message : "Tạo link thất bại"),
                },
              )
            }
          >
            {tao.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Link2 className="h-3.5 w-3.5" />}
            {draft.link_thu_hoi ? "Tạo lại link" : "Tạo link gửi khách"}
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          <div className="flex gap-2">
            <input
              readOnly
              value={url}
              onFocus={(e) => e.currentTarget.select()}
              className="flex-1 min-w-0 rounded-md border border-slate-300 bg-slate-50 px-3 py-1.5 text-xs font-mono"
            />
            <Button size="sm" variant="outline" className="h-8 text-xs gap-1.5 shrink-0" onClick={chep}>
              {daChep ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
              {daChep ? "Đã chép" : "Chép link"}
            </Button>
          </div>

          <p className="text-[11px] text-muted-foreground">
            Hiệu lực tới {ngay(draft.link_het_han)} · tạo {gio(draft.link_tao_luc)} ·
            trang chỉ hiện bảng giá đã chào, không có giá vốn
          </p>

          <div className="flex gap-2 flex-wrap">
            {/* Chào thêm bản mới thì bấm cái này — token giữ nguyên, chỉ nội dung
                được đồng bộ lại. Link đã gửi trong mail cũ vẫn sống. */}
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs gap-1.5"
              disabled={tao.isPending}
              onClick={() =>
                tao.mutate(
                  { baoGiaId: draft.id },
                  {
                    onSuccess: (kq) => toast.success(`Đã cập nhật link — ${kq.so_ban} bản chào`),
                    onError: (e) => toast.error(e instanceof Error ? e.message : "Cập nhật thất bại"),
                  },
                )
              }
            >
              {tao.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
              Cập nhật nội dung link
            </Button>

            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs gap-1.5 text-red-600 hover:text-red-700"
              disabled={thuHoi.isPending}
              onClick={() => {
                if (!confirm("Thu hồi link? Khách bấm vào sẽ thấy thông báo link đã thu hồi.")) return;
                thuHoi.mutate(
                  { baoGiaId: draft.id },
                  {
                    onSuccess: () => toast.success("Đã thu hồi link"),
                    onError: (e) => toast.error(e instanceof Error ? e.message : "Thu hồi thất bại"),
                  },
                );
              }}
            >
              {thuHoi.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <ShieldOff className="h-3 w-3" />}
              Thu hồi
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}
