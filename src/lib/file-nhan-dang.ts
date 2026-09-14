// NHẬN DẠNG file theo RUỘT, không theo đuôi tên.
//
// Đối tác Đài Loan gửi file lịch trình đặt tên ".doc" nhưng ruột thường là thứ
// khác: hệ thống đặt vé của họ xuất .docx rồi đổi đuôi, hoặc xuất RTF. Trước đây
// app tin cái đuôi nên chặn thẳng ("Word 97-2003 chưa đọc được") kể cả khi file
// đó thực ra đọc được ngon lành — OP phải mở Word lưu lại chỉ để đổi tên đuôi.
//
// Đo 03/09/2026: 7/45 file lịch trình đã tải lên có đuôi .doc.

/** Định dạng THẬT đọc ra từ mấy byte đầu.
 *  - `docx`/`xlsx`: gói zip Office → bộ đọc sẵn có xử lý được ngay.
 *  - `xls97`: Excel nhị phân cũ — SheetJS vẫn đọc được.
 *  - `doc97`: Word nhị phân cũ — CHƯA đọc được, phải lưu lại thành .docx.
 *  - `rtf`: text có mã điều khiển — chưa bóc, nhưng nói tên ra để còn quyết định.
 *  - `khac`: không nhận ra. */
export type DinhDangThat = "pdf" | "docx" | "xlsx" | "xls97" | "doc97" | "rtf" | "khac";

/** Vùng byte tối đa đem đi dò tên stream/entry. Đủ cho mọi file lịch trình thật
 *  (lớn nhất đo được 2,3 MB) mà không quét cả file lạ vài trăm MB. */
const GIOI_HAN_DO = 4 * 1024 * 1024;

function batDau(b: Uint8Array, mau: readonly number[]): boolean {
  if (b.length < mau.length) return false;
  for (let i = 0; i < mau.length; i++) if (b[i] !== mau[i]) return false;
  return true;
}

/** Tìm dãy byte trong vùng đã giới hạn. -1 = không có. */
function tim(b: Uint8Array, kim: readonly number[]): number {
  const het = Math.min(b.length, GIOI_HAN_DO) - kim.length;
  for (let i = 0; i <= het; i++) {
    let khop = true;
    for (let j = 0; j < kim.length; j++) if (b[i + j] !== kim[j]) { khop = false; break; }
    if (khop) return i;
  }
  return -1;
}

const asc = (s: string): number[] => [...s].map((c) => c.charCodeAt(0));
/** Tên stream trong file OLE2 lưu dạng UTF-16LE ("WordDocument" → 57 00 6F 00…). */
const utf16 = (s: string): number[] => [...s].flatMap((c) => [c.charCodeAt(0), 0]);

/**
 * Đọc mấy byte đầu để biết file THẬT SỰ là gì.
 *
 * Cố ý KHÔNG đoán mò: chỉ trả về loại khi có chữ ký rõ ràng, còn lại là "khac"
 * — đưa nhầm một file rác cho AI thì nó vẫn bịa ra được một chương trình trông
 * như thật, đó là kiểu sai đắt nhất ở màn này.
 */
export function nhanDangTheoByte(buf: ArrayBuffer): DinhDangThat {
  const b = new Uint8Array(buf);
  if (b.length < 8) return "khac";

  if (batDau(b, asc("%PDF"))) return "pdf";
  if (batDau(b, asc("{\\rtf"))) return "rtf";

  // Gói zip: docx và xlsx cùng chữ ký "PK\x03\x04" → phân biệt bằng tên thư mục
  // bên trong (danh sách entry nằm ngay đầu file).
  if (batDau(b, [0x50, 0x4B, 0x03, 0x04])) {
    if (tim(b, asc("word/")) >= 0) return "docx";
    if (tim(b, asc("xl/")) >= 0) return "xlsx";
    return "khac";
  }

  // OLE2 (Word/Excel nhị phân cũ) — cùng chữ ký, phân biệt bằng tên stream.
  if (batDau(b, [0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1])) {
    if (tim(b, utf16("WordDocument")) >= 0) return "doc97";
    if (tim(b, utf16("Workbook")) >= 0 || tim(b, utf16("Book")) >= 0) return "xls97";
    return "khac";
  }

  return "khac";
}

/** Câu nói cho người nhập khi file không đọc thẳng được, theo ĐÚNG thứ nó là. */
export function loiNhanDinhDang(d: DinhDangThat): string {
  if (d === "doc97") {
    return "Đây đúng là Word 97-2003 (.doc) bản nhị phân — chưa đọc được. Mở bằng Word → Lưu thành .docx (hoặc in ra PDF) rồi tải lại.";
  }
  if (d === "rtf") {
    return "File này thực ra là RTF (đổi đuôi thành .doc) — app chưa bóc được chữ. Mở bằng Word → Lưu thành .docx rồi tải lại.";
  }
  return "Không nhận ra định dạng file. Đổi sang PDF / .docx / .xlsx, hoặc dán nội dung dạng text.";
}
