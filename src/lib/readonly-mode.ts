/**
 * Chế độ CHỈ XEM — tài khoản có `user_roles.chi_xem = true`.
 *
 * Enforce THẬT nằm ở DB (migration 20260728_tai_khoan_chi_xem): policy RLS
 * restrictive chặn INSERT/UPDATE/DELETE trên mọi bảng + guard trong các RPC
 * SECURITY DEFINER. Lớp ở đây là lớp UX phủ lên trên, giải quyết 2 việc mà DB
 * không làm được:
 *
 *  1. UPDATE bị RLS chặn KHÔNG trả lỗi — PostgREST lọc hết row rồi báo thành
 *     công với 0 dòng. App sẽ toast "đã lưu" trong khi DB không đổi gì (đúng
 *     lớp bug đã gặp ở use-nguoi-dung / update_my_profile). Chặn ngay tại fetch
 *     → mutation ném lỗi, user thấy đúng lý do.
 *  2. Chặn cả upload storage — storage không đi qua RLS của bảng public.
 *
 * Một chỗ duy nhất (custom fetch của supabase client) phủ được toàn bộ lời gọi,
 * kể cả code viết sau này, thay vì phải sửa hơn trăm mutation.
 */

/** RPC KHÔNG ghi dữ liệu → vẫn cho gọi ở chế độ chỉ xem. Mọi RPC khác bị chặn. */
export const READONLY_SAFE_RPCS: ReadonlySet<string> = new Set([
  "get_lead_stats",
  "get_lead_funnel",
  "get_lead_by_nguon",
  "get_lead_by_sales",
  "get_lead_ly_do_mat",
  "get_khao_sat_doan_info",
  "cong_no_kha_dung_cho_ncc",
]);

export const READ_ONLY_MESSAGE =
  "Tài khoản chỉ xem — không thực hiện được thao tác này";

const READ_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

let readOnly = false;

/** Bật/tắt theo `user_roles.chi_xem` của user đang đăng nhập (xem use-auth). */
export function setReadOnlyMode(value: boolean): void {
  readOnly = value;
}

export function isReadOnlyMode(): boolean {
  return readOnly;
}

/**
 * Request này có ghi dữ liệu không (→ phải chặn khi đang ở chế độ chỉ xem).
 *
 * Tách riêng khỏi client để test được mà không cần mạng.
 */
export function isWriteRequest(method: string | undefined, url: string): boolean {
  if (READ_METHODS.has((method ?? "GET").toUpperCase())) return false;

  // Đăng nhập / refresh token / đăng xuất vẫn phải chạy, nếu không thì không
  // vào được hệ thống.
  const path = pathOf(url);
  if (path.startsWith("/auth/v1/")) return false;

  const rpc = path.match(/^\/rest\/v1\/rpc\/([^/?]+)/);
  if (rpc) return !READONLY_SAFE_RPCS.has(decodeURIComponent(rpc[1]));

  // Còn lại: POST/PATCH/PUT/DELETE vào /rest/v1/<bảng> hoặc /storage/v1/... đều là ghi.
  return true;
}

function pathOf(url: string): string {
  try {
    return new URL(url, "http://x").pathname;
  } catch {
    return url;
  }
}
