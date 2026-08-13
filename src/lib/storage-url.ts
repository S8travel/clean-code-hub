import { externalSupabase } from "@/lib/supabase-external";

// ── Link file storage cho bucket riêng tư ────────────────────────────────────
//
// Chứng từ nhà cung cấp và tài liệu đoàn nằm trong bucket riêng tư: chỉ người
// đã đăng nhập mới đọc được, và mỗi lần mở thì ký một link tạm ngắn hạn.
//
// CHỌN CÁCH KHÔNG ĐỔI DỮ LIỆU: các cột lưu link (`unc_url`, `hoa_don_url`,
// `doan_tai_lieu.file_url`, jsonb `lich_trinh_files`) đang giữ URL ở dạng công
// khai, mà dạng đó vốn đã chứa đủ {bucket, path}. Nên giữ nguyên cách lưu và
// chỉ chuyển đổi lúc đọc — không phải migrate dữ liệu cũ, không sợ nửa chừng.

/** Bucket đã chuyển sang private → URL công khai lưu trong DB không mở được nữa. */
const PRIVATE_BUCKETS = new Set(["dntt-documents", "doan-files"]);

/** Link ký sống 1 giờ: đủ để xem/tải, đủ ngắn để lỡ lộ cũng không dùng lại được. */
const SIGNED_TTL_SEC = 60 * 60;

/** Tách {bucket, path} từ URL Supabase Storage (cả dạng /public/ lẫn /sign/). */
export function parseStorageUrl(url: string): { bucket: string; path: string } | null {
  if (!url) return null;
  const m = /\/storage\/v1\/object\/(?:public|sign)\/([^/]+)\/([^?]+)/.exec(url);
  if (!m) return null;
  const path = decodeURIComponent(m[2]);
  if (!path) return null;
  return { bucket: m[1], path };
}

/** File này có nằm trong bucket đã khoá không (→ cần ký trước khi mở). */
export function needsSigning(url: string): boolean {
  const p = parseStorageUrl(url);
  return !!p && PRIVATE_BUCKETS.has(p.bucket);
}

/**
 * URL mở được cho 1 file đã lưu.
 * - Bucket private → ký link tạm.
 * - Bucket public / URL ngoài (không phải storage) → trả nguyên, không đụng vào.
 */
export async function resolveStorageUrl(url: string): Promise<string> {
  const parsed = parseStorageUrl(url);
  if (!parsed || !PRIVATE_BUCKETS.has(parsed.bucket)) return url;

  const { data, error } = await externalSupabase.storage
    .from(parsed.bucket)
    .createSignedUrl(parsed.path, SIGNED_TTL_SEC);
  if (error) throw error;
  if (!data?.signedUrl) throw new Error("Không tạo được link tạm cho file này");
  return data.signedUrl;
}

/**
 * Mở file trong tab mới.
 *
 * Mở cửa sổ TRƯỚC khi await: nếu await xong mới window.open thì trình duyệt coi
 * đó không phải hành động của người dùng và chặn popup. Ký xong thì trỏ cửa sổ
 * đã mở sang link thật.
 */
export async function openStorageFile(url: string): Promise<void> {
  if (!needsSigning(url)) {
    window.open(url, "_blank", "noopener");
    return;
  }
  const win = window.open("", "_blank", "noopener");
  try {
    const signed = await resolveStorageUrl(url);
    if (win) win.location.href = signed;
    else window.location.href = signed; // popup bị chặn → mở ngay tab hiện tại
  } catch (e) {
    win?.close();
    throw e;
  }
}

/**
 * onClick cho thẻ `<a href={url}>` trỏ tới file storage.
 *
 * Giữ nguyên `href` (hover vẫn thấy đường dẫn, vẫn copy link được) nhưng chặn
 * điều hướng mặc định khi file nằm trong bucket đã khoá — vì URL công khai lưu
 * trong DB lúc đó trả 400. File ở bucket public thì không đụng vào, để trình
 * duyệt mở như cũ.
 */
export function openStorageFileOnClick(
  url: string,
  onError?: (message: string) => void,
) {
  return (e: { preventDefault: () => void }) => {
    if (!needsSigning(url)) return;
    e.preventDefault();
    void openStorageFile(url).catch(() =>
      onError?.("Không mở được file — bạn không có quyền hoặc file đã bị gỡ."),
    );
  };
}
