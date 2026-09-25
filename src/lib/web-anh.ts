import { parseStorageUrl } from "@/lib/storage-url";
import { chuanHoaTim } from "@/lib/bao-gia-loc";

// ── Ảnh trang giới thiệu đối tác (repo s8-gioi-thieu, Vercel) ───────────────
//
// Trang web tĩnh đọc 3 view web_khach_san / web_nha_hang / web_canh_diem. Ảnh
// nằm ở web_showcase_content (khách sạn, nhà hàng: ảnh + logo + ẩn) và
// web_canh_diem_content (cảnh điểm: ảnh + slide trang chủ + ẩn). File tải từ
// CRM lưu bucket công khai `web-images` dưới showcase/… — policy storage chỉ
// cho is_web_editor() ghi vào nhánh này. Phần thuần ở đây để test được, phần
// đụng canvas/trình duyệt ở web-anh-resize.ts.

export type WebAnhLoai = "khach_san" | "nha_hang" | "canh_diem";
export type WebAnhKind = "anh" | "logo" | "slide";

export const WEB_ANH_BUCKET = "web-images";
export const WEB_ANH_PREFIX = "showcase/";

/** Cạnh dài tối đa sau khi co (px). Ảnh 6000px từ máy ảnh co về đây rồi mới
 *  tải — web mở nhanh, bucket không phình. Slide phủ cả màn nên rộng hơn. */
export const WEB_ANH_CANH_DAI: Record<WebAnhKind, number> = { anh: 1600, slide: 1920, logo: 512 };
/** File gốc lớn hơn ngưỡng này thì từ chối ngay, khỏi giải mã tốn RAM. */
export const WEB_ANH_MAX_BYTES = 20 * 1024 * 1024;
export const WEB_ANH_JPEG_QUALITY = 0.85;

export interface WebAnhOutput {
  mime: "image/jpeg" | "image/png";
  ext: "jpg" | "png";
  quality?: number;
}

/** Co giữ tỷ lệ sao cho cạnh dài ≤ max. KHÔNG phóng to ảnh nhỏ. Kích thước
 *  không hợp lệ → 0×0 để caller báo lỗi thay vì tải lên ảnh rỗng. */
export function fitLongEdge(w: number, h: number, max: number): { width: number; height: number } {
  if (!(w > 0) || !(h > 0) || !(max > 0)) return { width: 0, height: 0 };
  const canhDai = Math.max(w, h);
  if (canhDai <= max) return { width: Math.round(w), height: Math.round(h) };
  const k = max / canhDai;
  return { width: Math.max(1, Math.round(w * k)), height: Math.max(1, Math.round(h * k)) };
}

/** Logo giữ PNG (nền trong suốt đặt lên nền tối của trang); ảnh chụp và slide
 *  luôn JPEG — nhẹ hơn nhiều mà mắt không thấy khác. */
export function pickOutput(kind: WebAnhKind): WebAnhOutput {
  return kind === "logo"
    ? { mime: "image/png", ext: "png" }
    : { mime: "image/jpeg", ext: "jpg", quality: WEB_ANH_JPEG_QUALITY };
}

const IMAGE_MIMES = new Set([
  "image/jpeg", "image/png", "image/webp", "image/gif", "image/bmp", "image/svg+xml",
]);
const IMAGE_EXTS = /\.(jpe?g|png|webp|gif|bmp|svg)$/i;

export function isSvgFile(f: { type: string; name: string }): boolean {
  return f.type === "image/svg+xml" || /\.svg$/i.test(f.name);
}

/** Ảnh trình duyệt giải mã được. HEIC (iPhone) / AVIF không nhận — canvas
 *  không đọc được, tải lên là ra ô vỡ trên web. */
export function isWebAnhFile(f: { type: string; name: string }): boolean {
  if (f.type) return IMAGE_MIMES.has(f.type);
  return IMAGE_EXTS.test(f.name);
}

/** Lý do từ chối file trước khi đụng tới canvas; null = hợp lệ. */
export function kiemTraFileAnh(
  f: { type: string; name: string; size: number },
  kind: WebAnhKind,
): string | null {
  if (!isWebAnhFile(f)) return "Chỉ nhận ảnh JPG, PNG, WEBP hoặc SVG (không nhận HEIC).";
  if (isSvgFile(f) && kind !== "logo") return "SVG chỉ dùng cho logo — ảnh chụp cần JPG/PNG/WEBP.";
  if (f.size > WEB_ANH_MAX_BYTES) return "Ảnh lớn hơn 20 MB — hãy thu nhỏ trước khi tải.";
  return null;
}

/** Đường dẫn trong bucket: showcase/<loai>/<khoá>/<kind>-<ts>.<ext>.
 *  ts làm tên duy nhất → tải không cần upsert (tránh lỗi RLS nhánh UPDATE,
 *  xem memory storage upload) và CDN không cache nhầm ảnh cũ sau khi thay. */
export function buildWebAnhPath(
  loai: WebAnhLoai,
  refKey: string | number,
  kind: WebAnhKind,
  ts: number,
  ext: string,
): string {
  const key = String(refKey).replace(/[^a-zA-Z0-9_-]+/g, "-");
  return `${WEB_ANH_PREFIX}${loai}/${key}/${kind}-${ts}.${ext}`;
}

/** URL có phải file MÌNH tải trong web-images/showcase không → path để xoá khi
 *  thay/gỡ. Link ngoài (Wikimedia, web khách sạn) hoặc nhánh khác của bucket →
 *  null, không đụng. */
export function webAnhStoragePath(url: string | null | undefined): string | null {
  if (!url) return null;
  const p = parseStorageUrl(url);
  if (!p || p.bucket !== WEB_ANH_BUCKET || !p.path.startsWith(WEB_ANH_PREFIX)) return null;
  return p.path;
}

/** Ảnh lấy từ Wikimedia Commons (CC) — trang web PHẢI hiện dòng ghi nguồn. */
export function laAnhWikimedia(url: string | null | undefined): boolean {
  return !!url && /(^|\.)wikimedia\.org\//.test(url);
}

/** Số thứ tự slide nhập tay: rỗng / không phải số / ≤ 0 → null = bỏ khỏi slide. */
export function chuanHoaSlideThuTu(raw: string): number | null {
  const n = Number.parseInt(raw.trim(), 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

// ── Gộp danh mục + nội dung web ─────────────────────────────────────────────

export interface ShowcaseContentRow {
  ref_id: number;
  anh_url: string | null;
  logo_url: string | null;
  an_tren_web: boolean | null;
}

export interface WebVenueRow {
  id: number;
  ten: string;
  dia_diem: string | null;
  anh_url: string | null;
  logo_url: string | null;
  an_tren_web: boolean;
}

/** Mỗi khách sạn / nhà hàng trong danh mục một dòng, ghép ảnh + cờ ẩn từ
 *  web_showcase_content. Chưa có dòng nội dung = chưa ảnh và ĐANG HIỆN trên
 *  web (view chỉ ẩn khi an_tren_web = true). Địa điểm trống thì lấy địa chỉ,
 *  giống cách view web_khach_san xếp thành phố. */
export function mergeShowcaseRows(
  master: { id: number; ten: string | null; dia_diem: string | null; dia_chi?: string | null }[],
  contents: ShowcaseContentRow[],
): WebVenueRow[] {
  const theoRef = new Map(contents.map((c) => [c.ref_id, c]));
  return master
    .map((m) => {
      const c = theoRef.get(m.id);
      return {
        id: m.id,
        ten: m.ten ?? "",
        dia_diem: m.dia_diem?.trim() || m.dia_chi?.trim() || null,
        anh_url: c?.anh_url ?? null,
        logo_url: c?.logo_url ?? null,
        an_tren_web: !!c?.an_tren_web,
      };
    })
    .sort((a, b) => a.ten.localeCompare(b.ten, "vi"));
}

export interface WebRowFilter {
  tim: string;
  chiChuaAnh: boolean;
  chiDangAn: boolean;
}

/** Lọc theo ô tìm (bỏ dấu, không phân biệt hoa thường) + 2 cờ. `vanBan` gom
 *  chữ để tìm của một dòng (tên + địa điểm / tỉnh). */
export function locWebRows<T extends { anh_url: string | null; an_tren_web: boolean }>(
  rows: T[],
  f: WebRowFilter,
  vanBan: (r: T) => string,
): T[] {
  const q = chuanHoaTim(f.tim);
  return rows.filter((r) => {
    if (f.chiChuaAnh && r.anh_url) return false;
    if (f.chiDangAn && !r.an_tren_web) return false;
    if (!q) return true;
    return chuanHoaTim(vanBan(r)).includes(q);
  });
}

/** Nhãn loại cảnh điểm trên trang web (CHECK web_cdc_loai_chk). */
export const LOAI_CANH_DIEM_NHAN: Record<string, string> = {
  disan: "Di sản",
  tamlinh: "Tâm linh",
  thiennhien: "Thiên nhiên",
  biendao: "Biển đảo",
  giaitri: "Giải trí",
  phocho: "Phố & chợ",
  langnghe: "Làng nghề",
};
