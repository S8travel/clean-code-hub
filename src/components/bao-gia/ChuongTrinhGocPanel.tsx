import { useEffect, useMemo, useRef } from "react";
import { FileText, ExternalLink } from "lucide-react";
import { banDoDoiChieu, tachDongGoc } from "@/lib/bao-gia-doi-chieu";
import type { ResolvedItem } from "@/lib/bao-gia-ai-resolve";

/** Nguồn để dựng cột "Chương trình gốc".
 *  - `text`: dán tay / Word / Excel / PDF có lớp chữ → đối chiếu được từng dòng.
 *  - `file`: PDF scan hoặc ảnh chụp → không có chữ để dò, mở thẳng file cho xem. */
export type NguonChuongTrinh =
  | {
      kieu: "text";
      /** Chép NGUYÊN VĂN nội dung đọc được — không tóm tắt, không lọc dòng. */
      noiDung: string;
      /** Link file gốc (nếu nguồn là file) để đối chiếu khi cần. */
      fileUrl?: string;
      /** File dài quá trần đọc → phần sau chưa hiện. Phải nói ra, không giấu. */
      catBot?: { doc: number; tong: number };
    }
  | { kieu: "file"; url: string; anh: boolean };

interface Props {
  nguon: NguonChuongTrinh | null;
  rows: ResolvedItem[];
  /** Chỉ số dòng chi phí đang rê chuột (theo mảng `rows`), null = không rê. */
  hoverIdx: number | null;
}

/**
 * Cột phải màn review AI: chương trình đối tác gửi, đặt cạnh bảng chi phí.
 *
 * Việc nó giải: người nhập nhìn một dòng chi phí và phải tự trả lời "cái này ở
 * đâu ra trong file đối tác?" — trước đây phải mở file gốc ra dò bằng mắt, nên
 * thực tế không ai dò, và dòng máy đọc nhầm cứ thế trôi vào báo giá.
 *
 * Rê chuột lên một mục chi phí → dòng gốc sinh ra nó sáng vàng và tự cuộn tới.
 * Dòng nào có mục chi phí bám vào thì có vạch xanh bên trái, nên quét mắt một
 * lượt là thấy đoạn nào máy BỎ QUA hoàn toàn.
 */
export function ChuongTrinhGocPanel({ nguon, rows, hoverIdx }: Props) {
  const dong = useMemo(
    () => (nguon?.kieu === "text" ? tachDongGoc(nguon.noiDung) : []),
    [nguon],
  );

  // Bản đồ mục chi phí → dòng gốc. Dựng lại khi rows đổi (người nhập sửa tên
  // dòng thì neo cũng đổi theo), KHÔNG dựng theo hoverIdx — rê chuột qua 30 mục
  // mà tính lại 30 lần thì bảng giật.
  const banDo = useMemo(
    () => (dong.length ? banDoDoiChieu(dong, rows.map((r) => r.ten_zh)) : []),
    [dong, rows],
  );

  const dongSang = hoverIdx != null ? banDo[hoverIdx] ?? null : null;
  const coMuc = useMemo(() => new Set(banDo.filter((i): i is number => i != null)), [banDo]);

  const refDongSang = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (dongSang != null) refDongSang.current?.scrollIntoView({ block: "nearest" });
  }, [dongSang]);

  const soMucCoNeo = banDo.filter((i) => i != null).length;

  return (
    <div className="flex flex-col min-h-0 h-full">
      <div className="flex items-center gap-1.5 mb-1.5 shrink-0">
        <FileText className="h-3.5 w-3.5 text-slate-500" />
        <span className="text-xs font-semibold">Chương trình gốc</span>
        {nguon?.kieu === "text" && rows.length > 0 && (
          <span className="text-[10px] text-muted-foreground ml-auto" title="Số mục chi phí dò được về đúng dòng trong chương trình.">
            {soMucCoNeo}/{rows.length} mục có neo
          </span>
        )}
      </div>

      {!nguon && (
        <p className="text-[11px] text-muted-foreground">
          Chưa có bản gốc để đối chiếu — mở lại bằng nút <b>Phân tích</b> thì cột này sẽ có nội dung.
        </p>
      )}

      {nguon?.kieu === "file" && (
        <div className="flex-1 min-h-0 flex flex-col gap-1.5">
          <p className="text-[10px] text-muted-foreground shrink-0">
            File này không có lớp chữ (bản scan / ảnh chụp) nên không tô sáng theo dòng được — xem trực tiếp bên dưới.
          </p>
          {nguon.anh ? (
            <img src={nguon.url} alt="Chương trình gốc" className="flex-1 min-h-0 object-contain border rounded bg-white" />
          ) : (
            <iframe src={nguon.url} title="Chương trình gốc" className="flex-1 min-h-0 w-full border rounded bg-white" />
          )}
          <a href={nguon.url} target="_blank" rel="noreferrer"
            className="text-[11px] text-sky-700 hover:underline inline-flex items-center gap-1 shrink-0">
            <ExternalLink className="h-3 w-3" /> Mở ở tab mới
          </a>
        </div>
      )}

      {nguon?.kieu === "text" && nguon.catBot && (
        <p className="text-[10px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-1.5 py-1 mb-1 shrink-0">
          File {nguon.catBot.tong} trang, cột này mới đọc {nguon.catBot.doc} trang đầu — mở file gốc để xem đủ.
        </p>
      )}

      {nguon?.kieu === "text" && (
        <div className="flex-1 min-h-0 overflow-auto border rounded bg-white p-2 text-[13px] leading-relaxed">
          {dong.map((d, i) => {
            const sang = i === dongSang;
            return (
              <div
                key={i}
                ref={sang ? refDongSang : undefined}
                className={`whitespace-pre-wrap break-words px-1 border-l-2 ${
                  sang ? "bg-amber-200 border-amber-500"
                    : coMuc.has(i) ? "border-sky-300" : "border-transparent"
                } ${d === "" ? "h-2" : ""}`}
              >
                {d}
              </div>
            );
          })}
        </div>
      )}

      {nguon?.kieu === "text" && (
        <p className="text-[10px] text-muted-foreground mt-1 shrink-0">
          Chép nguyên văn từ file, không thêm bớt. Rê chuột vào một mục chi phí bên trái →
          dòng gốc sinh ra nó sáng lên. Vạch xanh = dòng đã có mục chi phí bám vào.
          {nguon.fileUrl && (
            <>
              {" "}
              <a href={nguon.fileUrl} target="_blank" rel="noreferrer" className="text-sky-700 hover:underline inline-flex items-center gap-0.5">
                <ExternalLink className="h-2.5 w-2.5" /> mở file gốc
              </a>
            </>
          )}
        </p>
      )}
    </div>
  );
}
