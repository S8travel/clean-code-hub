// Đồng bộ giữa "đang lưu chi phí" và "đọc lại chi phí để in".
// Không import React/UI → test độc lập (chỉ cần QueryClient).

import type { QueryClient } from "@tanstack/react-query";

/** Key chung cho MỌI lệnh ghi doan_chi_phi đang bay. */
export const CHI_PHI_MUTATION_KEY = ["doan_chi_phi_write"] as const;

/**
 * Chờ mọi lệnh ghi `doan_chi_phi` đang bay lắng xuống, TRƯỚC khi đọc lại DB.
 *
 * Blur-save chạy fire-and-forget (`upsertMut.mutate`) và chính cú click nút "In"
 * là thứ làm ô input mất focus → đọc DB ngay thì response về TRƯỚC lệnh UPDATE,
 * bản in ra số CŨ (đúng lỗi mà bản in đang muốn chống). `useUpsertChiPhi` còn
 * SELECT lấy giá trị cũ để ghi log trước khi UPDATE nên tốn 2 lượt đi-về.
 *
 * Trả `false` khi hết thời gian chờ mà vẫn còn lệnh đang bay → caller cảnh báo
 * thay vì im lặng in số có thể cũ.
 */
export async function waitForChiPhiWrites(
  qc: QueryClient,
  timeoutMs = 8000,
  tickMs = 50,
): Promise<boolean> {
  // Nhường 1 macrotask: DecimalInput hoãn onBlur bằng setTimeout(0) nên lúc handler
  // In chạy, mutation của ô vừa sửa có thể còn CHƯA được bắn.
  await new Promise((r) => setTimeout(r, 0));
  const deadline = Date.now() + timeoutMs;
  while (qc.isMutating({ mutationKey: CHI_PHI_MUTATION_KEY }) > 0) {
    if (Date.now() >= deadline) return false;
    await new Promise((r) => setTimeout(r, tickMs));
  }
  return true;
}
