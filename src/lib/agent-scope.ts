/**
 * Tài khoản giới hạn theo agent (`user_roles.agent_ids` có phần tử).
 *
 * Dùng cho người bên đối tác được xem đoàn của chính agent đó: chỉ thấy
 * danh sách đoàn + chi tiết đoàn thuộc agent, KHÔNG thấy danh mục, ĐNTT,
 * thanh toán, hóa đơn/UNC, công nợ.
 *
 * ⚠️ CHỈ LÀ TẦNG GIAO DIỆN (user chốt 21/09/2026). DB không chặn theo agent:
 * người biết kỹ thuật gọi thẳng API vẫn đọc được mọi thứ RLS văn phòng cho
 * phép. Xem CLAUDE.md mục "⛔ ĐÃ THỬ VÀ BỎ".
 */

/** Tập agent được xem, hoặc `null` = tài khoản thường (không giới hạn theo agent). */
export function resolveAgentScope(agentIds: readonly number[] | null | undefined): number[] | null {
  if (!agentIds || agentIds.length === 0) return null;
  return [...new Set(agentIds)];
}

/** Đoàn có thuộc tập agent được xem không. Scope `null` = không giới hạn. */
export function doanInAgentScope(
  doanAgentId: number | null | undefined,
  agentScope: readonly number[] | null,
): boolean {
  if (agentScope == null) return true;
  return doanAgentId != null && agentScope.includes(doanAgentId);
}

/** Trang tài khoản giới hạn theo agent được mở. Còn lại → đẩy về danh sách đoàn. */
export const TRANG_MAC_DINH_AGENT = "/doan";

export function duongDanChoPhepAgent(pathname: string): boolean {
  const p = pathname.replace(/\/+$/, "") || "/";
  return p === "/doan" || /^\/doan\/\d+$/.test(p) || p === "/thong-bao";
}
