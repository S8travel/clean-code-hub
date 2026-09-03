// ĐỐI CHIẾU dòng chi phí ↔ dòng trong chương trình gốc.
//
// Màn review AI bày ra một bảng chi phí, nhưng người nhập luôn phải trả lời câu
// hỏi "dòng này ở đâu trong chương trình đối tác gửi?" — trước đây phải mở file
// ra dò bằng mắt. Ở đây nối hai bên lại: rê chuột vào một mục chi phí thì dòng
// gốc sinh ra nó sáng lên.
//
// Neo là `ten_zh`: prompt của edge fn BẮT BUỘC model chép NGUYÊN VĂN dòng lịch
// trình vào đó (kể cả mức tiền ghi kèm). Nên phần lớn ca chỉ là tìm chuỗi con.
// Ba tầng dò, dừng ở tầng đầu tiên có kết quả — cố ý KHÔNG hạ ngưỡng tầng cuối:
// tô sáng nhầm dòng còn tệ hơn không tô, vì người nhập sẽ tin theo.

import { gianHoa } from "./han-gian-hoa";
import { diemGiong } from "./bao-gia-so-tay";

/** Nắn để so khớp: giản hoá chữ Hán, bỏ dấu câu / khoảng trắng / ký tự trang trí.
 *  Giữ nguyên chữ và số — mức tiền trong dòng ("15usd") là tín hiệu phân biệt tốt. */
export function nanDoiChieu(s: string | null | undefined): string {
  return gianHoa(String(s ?? "").normalize("NFKC"))
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "");
}

/** Tách text chương trình thành mảng dòng để hiển thị. Giữ cả dòng trống (bố cục
 *  chương trình đọc dễ hơn), chỉ bỏ khoảng trắng cuối dòng và \r của file Windows. */
export function tachDongGoc(text: string | null | undefined): string[] {
  return String(text ?? "").replace(/\r\n?/g, "\n").split("\n").map((d) => d.trimEnd());
}

/** Ngưỡng giống chữ cho tầng cuối. 0,55 đo trên bigram ký tự — dưới mức này thì
 *  cặp SAI cũng đạt điểm tương đương (xem chú thích ở diemGiong). */
const NGUONG_GIONG = 0.55;

/** Dòng gốc ngắn nhất được phép nhận là "mảnh của ten_zh" ở tầng 2. Ngắn hơn thì
 *  một chữ "餐" cũng khớp vào chục dòng. */
const TOI_THIEU_MANH = 6;

/**
 * Tìm dòng trong chương trình gốc đã sinh ra `tenZh`. Trả chỉ số dòng, hoặc null
 * khi không đủ chắc.
 *
 * `dongNan` là các dòng ĐÃ nắn sẵn (gọi hàm này cho vài chục mục nên nắn một lần
 * ở ngoài, đừng nắn lại trong vòng lặp).
 */
export function chiSoDongGoc(dongNan: readonly string[], tenZh: string | null | undefined): number | null {
  const kim = nanDoiChieu(tenZh);
  if (kim.length < 2) return null;

  // Tầng 1 — dòng gốc CHỨA nguyên văn ten_zh. Nhiều dòng cùng chứa thì lấy dòng
  // NGẮN NHẤT: nó là dòng sát nghĩa nhất, không phải cả đoạn văn bao quanh.
  let tot = -1;
  for (let i = 0; i < dongNan.length; i++) {
    const d = dongNan[i];
    if (d.length >= kim.length && d.includes(kim) && (tot < 0 || d.length < dongNan[tot].length)) tot = i;
  }
  if (tot >= 0) return tot;

  // Tầng 2 — ngược lại: dòng gốc là MỘT MẢNH của ten_zh (model gộp dòng bị ngắt
  // trang, hoặc nối "住宿同上" với tên khách sạn tra ngược). Lấy mảnh ĐẦU TIÊN,
  // không phải mảnh dài nhất: nó là chỗ mục đó BẮT ĐẦU, cuộn tới đó thì mắt
  // người đọc rơi đúng đầu đoạn.
  for (let i = 0; i < dongNan.length; i++) {
    const d = dongNan[i];
    if (d.length >= TOI_THIEU_MANH && kim.includes(d)) return i;
  }

  // Tầng 3 — giống chữ. Model có sửa chính tả / bỏ ký hiệu thì vẫn bắt được.
  let diemTot = 0;
  for (let i = 0; i < dongNan.length; i++) {
    if (dongNan[i].length < TOI_THIEU_MANH) continue;
    const diem = diemGiong(kim, dongNan[i]);
    if (diem > diemTot) { diemTot = diem; tot = i; }
  }
  return diemTot >= NGUONG_GIONG ? tot : null;
}

/** Bản đồ mục chi phí → dòng gốc, dựng một lần cho cả bảng.
 *  Trả mảng cùng thứ tự với `tenZhs`; phần tử null = không dò ra dòng nào. */
export function banDoDoiChieu(
  dong: readonly string[],
  tenZhs: readonly (string | null | undefined)[],
): (number | null)[] {
  const nan = dong.map(nanDoiChieu);
  return tenZhs.map((zh) => chiSoDongGoc(nan, zh));
}
