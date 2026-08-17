import { useState } from "react";
import { AlertTriangle, GitCompare, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { BaoGiaRow } from "@/hooks/use-bao-gia";
import { usePhienBanList } from "@/hooks/use-bao-gia-phien-ban";
import { buildPhienBan, soSanhPhienBan } from "@/lib/bao-gia-phien-ban";
import { liveKetQua } from "./helpers";
import { BangSoSanh } from "./BangSoSanh";

// Bảng tính SỬA ĐƯỢC kể cả sau khi đã gửi — bản đã chào nằm trong bảng phiên bản
// (DB chặn sửa/xoá) và đối tác vẫn xem bản đóng băng, nên khoá bảng tính lại chỉ
// tổ gây ma sát: sửa lỗi chính tả hay ngày về sai cũng phải đẻ thêm một bản.
//
// Thứ thật sự cần chặn là số trên màn hình LỆCH ÂM THẦM với số đã chào — ai đó mở
// báo giá tháng sau, nhìn bảng tính rồi đọc giá cho đối tác qua điện thoại, mà giá
// đó chưa từng gửi cho ai. Nên: cho sửa, nhưng lệch thì nói thẳng.
export function CanhBaoLech({ draft, onGuiBanMoi }: { draft: BaoGiaRow; onGuiBanMoi: () => void }) {
  const { data: dsPhienBan = [] } = usePhienBanList(draft.id);
  const [moSoSanh, setMoSoSanh] = useState(false);

  const banHienHanh =
    dsPhienBan.find((p) => p.id === draft.phien_ban_hien_hanh_id) ?? dsPhienBan[0];
  if (!banHienHanh) return null; // chưa gửi lần nào → không có gì để lệch

  const fresh = liveKetQua(draft);
  if (!fresh) return null;

  let banHienTai;
  try {
    banHienTai = buildPhienBan(draft, fresh);
  } catch {
    return null; // bảng tính đang dở, chưa dựng được bản chào
  }

  const kq = soSanhPhienBan(banHienHanh, banHienTai);
  if (kq.giong_nhau) return null;

  return (
    <div className="mb-3 rounded-md border border-amber-200 bg-amber-50 px-4 py-2 flex items-center justify-between gap-3 flex-wrap">
      <span className="inline-flex items-center gap-1.5 text-xs text-amber-900">
        <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
        Bảng tính đang khác bản đã chào <b>{banHienHanh.ma_hien_thi}</b> —
        số trên màn hình chưa gửi cho đối tác.
      </span>
      <span className="flex gap-1.5">
        <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => setMoSoSanh(true)}>
          <GitCompare className="h-3 w-3" /> Khác chỗ nào
        </Button>
        <Button size="sm" className="h-7 text-xs gap-1" onClick={onGuiBanMoi}>
          <Send className="h-3 w-3" /> Gửi bản mới
        </Button>
      </span>

      <Dialog open={moSoSanh} onOpenChange={setMoSoSanh}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="text-base">
              {banHienHanh.ma_hien_thi} (đã gửi) → bảng tính hiện tại
            </DialogTitle>
          </DialogHeader>
          <BangSoSanh kq={kq} coLopVon={!!banHienHanh.noi_dung_von} />
        </DialogContent>
      </Dialog>
    </div>
  );
}
