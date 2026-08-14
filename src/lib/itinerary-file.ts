// Đọc file lịch trình cho AI báo giá:
// - PDF / ảnh: Claude đọc trực tiếp (edge fn) — KHÔNG trích ở đây.
// - Word (.docx) / Excel (.xlsx/.xls): trích text ở client rồi gửi như text.

export type FileKind = "pdf" | "image" | "docx" | "xlsx" | "other";

function ext(name: string): string {
  return name.split(".").pop()?.toLowerCase() ?? "";
}

export function fileKind(name: string): FileKind {
  const e = ext(name);
  if (e === "pdf") return "pdf";
  if (["png", "jpg", "jpeg", "webp", "gif"].includes(e)) return "image";
  if (e === "docx") return "docx"; // .doc (binary cũ) KHÔNG hỗ trợ → other
  if (e === "xlsx" || e === "xls") return "xlsx";
  return "other";
}

/** File AI KHÔNG đọc được: nhãn ngắn (gắn cạnh tên file) + cách chữa cụ thể.
 *  null = đọc được.
 *
 *  Tách riêng `.doc` khỏi nhóm "khác": đây là ca hay gặp nhất (đối tác Đài Loan
 *  gửi Word 97-2003) và cách chữa rất khác — lưu lại thành .docx là xong. Báo
 *  chung chung "chưa đọc được" thì OP không biết làm gì, tải lại nhiều lần cùng
 *  1 file mà vẫn không chọn được để phân tích. */
export function unsupportedFileInfo(name: string): { badge: string; help: string } | null {
  if (fileKind(name) !== "other") return null;
  if (ext(name) === "doc") {
    return {
      badge: "Word bản cũ — lưu lại thành .docx",
      help: "Word 97-2003 (.doc) chưa đọc được. Mở bằng Word → Lưu thành .docx (hoặc in ra PDF) rồi tải lại.",
    };
  }
  return {
    badge: "chưa đọc được — đổi sang PDF/.docx",
    help: "Chỉ đọc được PDF, ảnh, Word (.docx) và Excel (.xlsx/.xls). Đổi sang một trong các định dạng đó, hoặc dán nội dung dạng text.",
  };
}

/** MIME ảnh cho Claude (image block). '' nếu không phải ảnh hỗ trợ. */
export function imageMime(name: string): string {
  const e = ext(name);
  if (e === "png") return "image/png";
  if (e === "jpg" || e === "jpeg") return "image/jpeg";
  if (e === "webp") return "image/webp";
  if (e === "gif") return "image/gif";
  return "";
}

/** Trích text từ docx/xlsx (đọc client). PDF/ảnh KHÔNG dùng hàm này.
 *  Dynamic import mammoth/xlsx → chỉ tải khi user thực sự đọc file (không nặng trang). */
export async function extractItineraryText(buf: ArrayBuffer, kind: FileKind): Promise<string> {
  if (kind === "docx") {
    const mammoth = (await import("mammoth")).default;
    const { value } = await mammoth.extractRawText({ arrayBuffer: buf });
    return value.trim();
  }
  if (kind === "xlsx") {
    const XLSX = await import("xlsx");
    const wb = XLSX.read(buf, { type: "array" });
    return wb.SheetNames
      .map((n) => `# ${n}\n${XLSX.utils.sheet_to_csv(wb.Sheets[n])}`)
      .join("\n\n")
      .trim();
  }
  throw new Error("Định dạng không hỗ trợ trích text (chỉ Word/Excel)");
}
