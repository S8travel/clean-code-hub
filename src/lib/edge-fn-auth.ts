import { externalSupabase } from "@/lib/supabase-external";

// Header xác thực dùng chung khi client gọi edge function.
//
// Gọi edge function phải kèm danh tính NGƯỜI đang đăng nhập, không phải
// publishable key: khoá đó nằm sẵn trong bundle nên nó không chứng minh được ai
// đang gọi. Với hàm gửi mail thì điều đó càng quan trọng, vì mail đi ra dưới
// tên miền công ty.
//
// TƯƠNG THÍCH NGƯỢC — quan trọng: token phiên hợp lệ với edge function dù
// verify_jwt bật hay tắt, nên phần client này ship trước một mình được. CHỈ SAU
// KHI frontend đã lên production mới bật verify_jwt, nếu không toàn bộ luồng
// gửi mail đặt phòng chết ngay.
//
// `apikey` vẫn phải giữ publishable key — đó là khoá định tuyến của gateway,
// khác vai trò với `Authorization`.
const PUBLISHABLE_KEY = "sb_publishable_NDWgz5PzI38R-ouTHShYaw_6YhYjOIw";

/**
 * Header gọi edge function bằng danh tính người đang đăng nhập.
 * Ném lỗi tiếng Việt rõ ràng khi hết phiên, thay vì để hàm trả 401 khó hiểu.
 */
export async function edgeAuthHeaders(): Promise<Record<string, string>> {
  const { data } = await externalSupabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) {
    throw new Error("Phiên đăng nhập đã hết hạn — đăng nhập lại rồi thao tác tiếp.");
  }
  return {
    "Content-Type": "application/json",
    apikey: PUBLISHABLE_KEY,
    Authorization: `Bearer ${token}`,
  };
}
