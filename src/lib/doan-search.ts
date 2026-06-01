// Tìm đoàn theo từ khóa — BỎ QUA mọi khoảng trắng (người dùng hay copy-paste mã
// đoàn kèm dấu cách đầu/cuối/giữa). Không phân biệt hoa thường.

/** Chuẩn hóa: thường hóa + bỏ TẤT CẢ khoảng trắng. */
export function normForSearch(s: string | null | undefined): string {
  return (s ?? "").toLowerCase().replace(/\s+/g, "");
}

/**
 * True nếu từ khóa khớp 1 trong các field (đoàn / HDV / agent / OP), bỏ qua dấu cách.
 * Từ khóa rỗng (sau chuẩn hóa) → khớp hết.
 */
export function doanMatchesSearch(
  fields: {
    tenDoan?: string | null;
    hdv?: string | null;
    agent?: string | null;
    op?: string | null;
  },
  query: string,
): boolean {
  const q = normForSearch(query);
  if (!q) return true;
  return [fields.tenDoan, fields.hdv, fields.agent, fields.op].some((f) =>
    normForSearch(f).includes(q),
  );
}
