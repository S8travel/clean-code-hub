import { createContext, useContext } from "react";

/**
 * true = người xem là tài khoản đối tác (user_roles.agent_ids): tab Chi phí chỉ
 * hiện dòng chi phí, ẨN mọi thứ về ĐNTT, trạng thái thanh toán, hóa đơn/UNC,
 * công nợ/cấn trừ. Provider đặt ở DoanDetail quanh <ChiPhiTab>.
 *
 * ⚠️ Chỉ ẩn ở giao diện — dữ liệu vẫn được tải về trình duyệt (xem lib/agent-scope.ts).
 */
export const AnThanhToanContext = createContext(false);

export function useAnThanhToan(): boolean {
  return useContext(AnThanhToanContext);
}
