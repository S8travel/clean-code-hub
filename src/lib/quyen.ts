// Luật tính quyền — tách khỏi hook để test được mà không cần đăng nhập.
//
// Hai nguồn quyền:
//   1. Ma trận theo VAI TRÒ (`role_permissions`) — nền chung của cả nhóm.
//   2. Quyền RIÊNG theo người (`user_permissions`) — mở thêm cho đúng một người.
//
// Quyền riêng chỉ CỘNG THÊM, không bao giờ thu bớt (trừ 'specialist' giữ luật
// cũ, xem bên dưới). Lý do: một dòng quyền riêng sót lại từ lần cấu hình cũ mà
// thu được quyền thì người ta mất quyền đang dùng hằng ngày và không ai hiểu vì
// sao — trong khi cái giá của việc "quên gỡ dòng cho phép" chỉ là một người thấy
// thêm một trang, và nó nằm sờ sờ trong trang Người dùng để gỡ.

export type PermAction = "view" | "create" | "edit" | "delete";

export interface QuyenRow {
  can_view: boolean;
  can_create: boolean;
  can_edit: boolean;
  can_delete: boolean;
}

export function coQuyen(row: QuyenRow | undefined, action: PermAction): boolean {
  if (!row) return false;
  if (action === "view") return row.can_view;
  if (action === "create") return row.can_create;
  if (action === "edit") return row.can_edit;
  return row.can_delete;
}

export interface ThamSoTinhQuyen<R extends string> {
  /** Vai trò của người đang đăng nhập; null = chưa đăng nhập. */
  role: string | null | undefined;
  resource: R;
  action: PermAction;
  /** Dòng ma trận theo vai trò cho đúng resource này (undefined = không có dòng). */
  theoVaiTro: QuyenRow | undefined;
  /** Dòng quyền riêng của chính người này cho resource này. */
  theoNguoi: QuyenRow | undefined;
}

/**
 * Người này có được làm `action` trên `resource` không.
 *
 * - `admin`: được tất cả.
 * - `specialist`: CHỈ đọc quyền riêng, không dùng ma trận vai trò. Đây là luật
 *   sẵn có của vai trò đó (nó vốn được dựng để cấu hình từng người), đổi đi là
 *   thay đổi quyền của những người đang chạy — nên giữ nguyên.
 * - Vai trò khác: ma trận là nền; quyền riêng chỉ mở thêm.
 */
export function tinhQuyen<R extends string>({
  role,
  action,
  theoVaiTro,
  theoNguoi,
}: ThamSoTinhQuyen<R>): boolean {
  if (!role) return false;
  if (role === "admin") return true;
  if (role === "specialist") return coQuyen(theoNguoi, action);
  return coQuyen(theoVaiTro, action) || coQuyen(theoNguoi, action);
}
