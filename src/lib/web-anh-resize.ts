import {
  WEB_ANH_CANH_DAI,
  fitLongEdge,
  isSvgFile,
  kiemTraFileAnh,
  pickOutput,
  type WebAnhKind,
} from "./web-anh";

// Co ảnh NGAY TRÊN TRÌNH DUYỆT trước khi tải lên bucket web-images: nhân viên
// chọn ảnh 6000px từ máy ảnh, web chỉ cần 1600px. Phần thuần (tính kích
// thước, chọn định dạng, kiểm tra file) nằm ở web-anh.ts để test; file này
// chỉ là lớp canvas.

export interface AnhDaChuanBi {
  blob: Blob;
  ext: string;
  mime: string;
  width: number;
  height: number;
}

type NguonVe = ImageBitmap | HTMLImageElement;

async function giaiMa(file: File): Promise<NguonVe> {
  // createImageBitmap tự xoay theo EXIF (ảnh điện thoại chụp dọc) — <img> cũng
  // vậy ở trình duyệt mới, nhưng bitmap giải mã ngoài luồng chính, không khựng UI.
  if (typeof createImageBitmap === "function") {
    try {
      return await createImageBitmap(file);
    } catch {
      /* định dạng bitmap không nhận (vd BMP cũ) → thử <img> */
    }
  }
  const url = URL.createObjectURL(file);
  try {
    return await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("Không đọc được file ảnh này."));
      img.src = url;
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Kiểm tra + co + nén ảnh cho trang web. SVG (logo) giữ nguyên file. */
export async function chuanBiAnhWeb(file: File, kind: WebAnhKind): Promise<AnhDaChuanBi> {
  const loi = kiemTraFileAnh(file, kind);
  if (loi) throw new Error(loi);
  if (isSvgFile(file)) {
    return { blob: file, ext: "svg", mime: "image/svg+xml", width: 0, height: 0 };
  }

  const nguon = await giaiMa(file);
  const w = "naturalWidth" in nguon ? nguon.naturalWidth : nguon.width;
  const h = "naturalHeight" in nguon ? nguon.naturalHeight : nguon.height;
  const { width, height } = fitLongEdge(w, h, WEB_ANH_CANH_DAI[kind]);
  if (!width || !height) throw new Error("Không đọc được kích thước ảnh.");

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Trình duyệt không hỗ trợ xử lý ảnh.");

  const out = pickOutput(kind);
  // JPEG không có kênh trong suốt: PNG nền trong suốt vẽ thẳng sẽ ra nền ĐEN.
  if (out.mime === "image/jpeg") {
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);
  }
  ctx.drawImage(nguon, 0, 0, width, height);
  if (typeof ImageBitmap !== "undefined" && nguon instanceof ImageBitmap) nguon.close();

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, out.mime, out.quality),
  );
  if (!blob) throw new Error("Không nén được ảnh.");
  return { blob, ext: out.ext, mime: out.mime, width, height };
}
