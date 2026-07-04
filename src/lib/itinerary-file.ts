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
