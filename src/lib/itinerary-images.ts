// Render file lịch trình (PDF/ảnh) thành ẢNH TRANG để nhúng vào Word xuất báo
// giá — giữ nguyên format gốc của khách (bảng biểu, màu, chữ Hán). Trích text
// (itinerary-file.ts) làm mất layout nên chỉ còn là fallback cho Word/Excel.

import { fileKind, type FileKind } from "./itinerary-file";

export interface PageImage {
  data: Uint8Array;
  /** Kích thước pixel của ảnh đã render — dùng tính tỷ lệ khi nhúng vào Word. */
  width: number;
  height: number;
  /** Định dạng bytes trong `data` (docx ImageRun cần khai đúng type). */
  type: "png" | "jpg";
}

export interface PdfRenderResult {
  pages: PageImage[];
  /** Tổng số trang PDF gốc — caller so với pages.length để cảnh báo bị cắt. */
  numPages: number;
  truncated: boolean;
}

/** Chiều rộng render trang PDF (px) — đủ nét khi in A4. */
const RENDER_TARGET_W = 1600;
/** Giới hạn số trang nhúng — file quá dài làm docx phình to. */
export const MAX_PROGRAM_PAGES = 30;
/** Trên ngưỡng bytes này, PNG (lossless) coi như ảnh chụp/scan → thử JPEG. */
const PNG_BYTE_BUDGET = 400_000;
/** Tỷ lệ cao/rộng của khung 行程內容 trên trang Word (938px cao / 649px rộng —
 *  suy từ khổ A4 + margin trong export-bao-gia-word). Ảnh cao vượt hẳn tỷ lệ
 *  này phải CẮT LÁT thành nhiều trang, co nguyên con sẽ không đọc được chữ. */
export const PROGRAM_PAGE_RATIO = 938 / 649;

/** Kích thước hiển thị (px) vừa khung trang Word: co giữ tỷ lệ sao cho lọt cả
 *  chiều rộng maxW lẫn chiều cao maxH (trang lịch trình phóng đầy khung để đọc
 *  được — ảnh nhỏ vẫn phóng to). Kích thước không hợp lệ → trả nguyên khung. */
export function fitPageSize(
  w: number,
  h: number,
  maxW: number,
  maxH: number,
): { width: number; height: number } {
  if (w <= 0 || h <= 0 || maxW <= 0 || maxH <= 0) return { width: maxW, height: maxH };
  const scale = Math.min(maxW / w, maxH / h);
  return { width: Math.max(1, Math.round(w * scale)), height: Math.max(1, Math.round(h * scale)) };
}

/** Số lát cần cắt cho ảnh w×h: ảnh cao quá tỷ lệ trang (chịu dung sai 25% —
 *  hơi cao thì co nhẹ, không cắt) → chia theo chiều cao để mỗi lát fit theo
 *  CHIỀU RỘNG trang, chữ giữ nguyên cỡ đọc được. */
export function sliceCount(w: number, h: number): number {
  if (w <= 0 || h <= 0) return 1;
  const ratio = h / w;
  if (ratio <= PROGRAM_PAGE_RATIO * 1.25) return 1;
  return Math.min(MAX_PROGRAM_PAGES, Math.ceil(ratio / PROGRAM_PAGE_RATIO));
}

export interface ProgramFilePick<T> {
  /** pdf/docx/xlsx: đúng 1 file; image: TẤT CẢ file ảnh theo thứ tự đính kèm
   *  (khách hay scan lịch trình thành nhiều ảnh trang1/trang2/...). */
  kind: Exclude<FileKind, "other">;
  files: T[];
  /** Ứng viên Word/Excel để fallback trích text khi đọc file PDF/ảnh lỗi. */
  fallbackText: { file: T; kind: "docx" | "xlsx" } | null;
}

/** Chọn file lịch trình gắn vào bản xuất: ưu tiên PDF/ảnh (nhúng ảnh, giữ
 *  nguyên format) → rồi mới tới Word/Excel (chỉ trích được text). Không có
 *  file đọc được → null. */
export function pickProgramFile<T extends { ten: string }>(
  files: T[],
): ProgramFilePick<T> | null {
  const textualFile = files.find((f) => {
    const k = fileKind(f.ten);
    return k === "docx" || k === "xlsx";
  });
  const fallbackText = textualFile
    ? { file: textualFile, kind: fileKind(textualFile.ten) as "docx" | "xlsx" }
    : null;

  const visual = files.find((f) => {
    const k = fileKind(f.ten);
    return k === "pdf" || k === "image";
  });
  if (visual) {
    const kind = fileKind(visual.ten) as "pdf" | "image";
    return {
      kind,
      // Ảnh: khách hay tách lịch trình thành nhiều file ảnh → gom hết theo thứ
      // tự đính kèm. PDF: 1 file là 1 tài liệu hoàn chỉnh.
      files: kind === "image" ? files.filter((f) => fileKind(f.ten) === "image") : [visual],
      fallbackText,
    };
  }
  if (textualFile) return { kind: fallbackText!.kind, files: [textualFile], fallbackText: null };
  return null;
}

async function canvasToBytes(canvas: HTMLCanvasElement, mime: string, quality?: number): Promise<Uint8Array> {
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Không tạo được ảnh từ canvas"))), mime, quality),
  );
  return new Uint8Array(await blob.arrayBuffer());
}

/** Encode canvas → PNG; PNG quá to (ảnh chụp/scan — PNG lossless phình rất
 *  nhanh, docx dễ vượt giới hạn gửi mail) → dùng JPEG 0.85 nếu nhẹ hơn.
 *  Nền canvas đã tô trắng nên JPEG không mất gì. */
async function encodeCanvas(canvas: HTMLCanvasElement): Promise<{ data: Uint8Array; type: "png" | "jpg" }> {
  const png = await canvasToBytes(canvas, "image/png");
  if (png.length <= PNG_BYTE_BUDGET) return { data: png, type: "png" };
  const jpg = await canvasToBytes(canvas, "image/jpeg", 0.85);
  return jpg.length < png.length ? { data: jpg, type: "jpg" } : { data: png, type: "png" };
}

/** Render từng trang PDF thành ảnh (pdf.js chạy client — dynamic import, chỉ
 *  tải khi thực sự xuất file có lịch trình PDF). Dùng bản LEGACY của pdfjs vì
 *  bản modern gọi trần Promise.withResolvers (Safari <17.4 / Chrome <119 văng
 *  TypeError); legacy tự chứa polyfill cả ở main thread lẫn worker. */
export async function renderPdfToPageImages(
  buf: ArrayBuffer,
  maxPages = MAX_PROGRAM_PAGES,
): Promise<PdfRenderResult> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  if (!pdfjs.GlobalWorkerOptions.workerSrc) {
    const { default: workerUrl } = await import("pdfjs-dist/legacy/build/pdf.worker.min.mjs?url");
    pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
  }
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(buf) }).promise;
  try {
    const n = Math.min(pdf.numPages, maxPages);
    const pages: PageImage[] = [];
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Trình duyệt không hỗ trợ canvas 2D");
    for (let i = 1; i <= n; i++) {
      const page = await pdf.getPage(i);
      const base = page.getViewport({ scale: 1 });
      const vp = page.getViewport({ scale: RENDER_TARGET_W / base.width });
      canvas.width = Math.ceil(vp.width);
      canvas.height = Math.ceil(vp.height);
      // PDF nền trong suốt → tô trắng trước, kẻo render ra nền đen khi in.
      ctx.fillStyle = "#FFFFFF";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvasContext: ctx, viewport: vp }).promise;
      pages.push({ ...(await encodeCanvas(canvas)), width: canvas.width, height: canvas.height });
      page.cleanup();
    }
    return { pages, numPages: pdf.numPages, truncated: pdf.numPages > n };
  } finally {
    await pdf.destroy();
  }
}

/** File ảnh → 1..N trang ảnh. LUÔN đi qua canvas: createImageBitmap tự áp EXIF
 *  orientation (ảnh chụp điện thoại hết bị xoay ngang khi nhúng Word — Word
 *  không đọc EXIF), và ảnh CAO (screenshot dài) được cắt lát thành nhiều trang
 *  thay vì co nguyên con thành dải chữ không đọc được. */
export async function imageToPageImages(buf: ArrayBuffer, mime: string): Promise<PageImage[]> {
  const bmp = await createImageBitmap(new Blob([buf], { type: mime }));
  try {
    const slices = sliceCount(bmp.width, bmp.height);
    const sliceH = Math.ceil(bmp.height / slices);
    const out: PageImage[] = [];
    for (let i = 0; i < slices; i++) {
      const h = Math.min(sliceH, bmp.height - i * sliceH);
      if (h <= 0) break;
      const canvas = document.createElement("canvas");
      canvas.width = bmp.width;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Trình duyệt không hỗ trợ canvas 2D");
      // Nền trắng: ảnh PNG trong suốt nhúng vào Word/JPEG sẽ ra nền đen nếu bỏ qua.
      ctx.fillStyle = "#FFFFFF";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(bmp, 0, i * sliceH, bmp.width, h, 0, 0, bmp.width, h);
      out.push({ ...(await encodeCanvas(canvas)), width: bmp.width, height: h });
    }
    return out;
  } finally {
    bmp.close();
  }
}
