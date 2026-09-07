import { useNavigate } from "react-router-dom";
import { Layers } from "lucide-react";
import { useBaoGiaChum, type BaoGiaRow } from "@/hooks/use-bao-gia";
import { idGocCua } from "@/lib/bao-gia-nhom";
import { maPhienBan } from "@/lib/bao-gia-phien-ban";
import { baoGiaCode } from "./helpers";

/**
 * Dải "báo giá này nằm trong một chùm" ở đầu trang chi tiết.
 *
 * Tách thành component riêng chứ không nhét thẳng vào BaoGiaDetailPage: trang đó
 * có một nhánh `return` sớm khi chưa tải xong, mà hook thì phải gọi đủ và đúng
 * thứ tự ở mọi lần vẽ. Để trong đây thì nhánh thoát sớm nằm SAU mọi hook.
 *
 * Màu xám chì (slate) — cố ý không dùng hổ phách hay tím, hai màu đó đang mang
 * nghĩa "cảnh báo" và "đã gửi khách" ở hai dải ngay bên dưới.
 */
export function ChumBanner({ row }: { row: BaoGiaRow }) {
  const navigate = useNavigate();
  const gocId = idGocCua(row);
  const { data: chum = [] } = useBaoGiaChum(gocId);

  const anhEm = chum.filter((c) => c.id !== row.id);
  if (anhEm.length === 0) return null;

  const laBanPhu = row.bao_gia_goc_id != null;
  const ten = (c: (typeof chum)[number]) =>
    maPhienBan(baoGiaCode(c), c.so_phien_ban_cuoi ?? 0);

  return (
    <div className="mb-3 rounded-md border border-slate-300 bg-slate-50 px-4 py-2.5">
      <p className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-800">
        <Layers className="h-3.5 w-3.5" />
        {laBanPhu
          ? "Đây là một bản phụ"
          : `Báo giá này có ${anhEm.length} bản phụ`}
      </p>
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        {anhEm.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => navigate(`/bao-gia/${c.id}`)}
            className="rounded border border-slate-300 bg-white px-2 py-1 text-[11px] text-slate-700 hover:border-slate-400 hover:bg-slate-100"
            title={c.tieu_de ?? undefined}
          >
            <span className="font-mono text-slate-500">{ten(c)}</span>
            {c.bao_gia_goc_id == null && (
              <span className="ml-1 text-slate-400">· bản gốc</span>
            )}
            {c.tieu_de && (
              <span className="ml-1.5 max-w-[220px] truncate align-bottom inline-block">
                {c.tieu_de}
              </span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
