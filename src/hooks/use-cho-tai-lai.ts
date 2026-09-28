import { useState } from "react";
import { buocChoTaiLai, type QueryChoLite } from "@/lib/cho-tai-lai";

/**
 * Còn phải chờ lượt tải lúc mở không? true = section nên hiện "Đang tải", CHƯA dựng state.
 *
 * Chờ khi có query đang cũ và đang tải lại (cache cũ lúc mở, hoặc bị invalidate trước khi
 * thả); thả một lần là thôi: cache tự hết hạn sau staleTime hay bị tải lại ngầm về sau KHÔNG
 * được tháo bảng đang hiện (tháo bảng = mất số OP đang gõ dở). Luật ở buocChoTaiLai
 * (lib/cho-tai-lai.ts, có test).
 *
 * @param khoa lượt mở (vd `${doanId}|${doanNhomId}`) — đổi khóa thì chờ lại từ đầu.
 * @param queries kết quả useQuery của các nguồn dựng state.
 */
export function useChoTaiLai(khoa: string, queries: readonly QueryChoLite[]): boolean {
  const [moc, setMoc] = useState(() => buocChoTaiLai(null, khoa, queries));
  const mocMoi = buocChoTaiLai(moc, khoa, queries);
  // Lưu thông tin từ lượt render trước (mẫu setState-trong-render của React) — hội tụ
  // ngay vì buocChoTaiLai trả nguyên prev khi không đổi.
  if (mocMoi !== moc) setMoc(mocMoi);
  return !mocMoi.daTha;
}
