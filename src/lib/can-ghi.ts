/** Lệnh ghi này có làm đổi gì không — so các cột sắp ghi với dòng đang có trong DB.
 *
 *  Vì sao cần: autosave Điều tour chạy 1,5 giây sau MỖI lần sửa và trước đây ghi lại
 *  TOÀN BỘ đoàn (bảng `doan`, mọi ngày, mọi cảnh điểm, mọi dòng chi phí nhà hàng) dù OP
 *  chỉ đổi một ô. Mỗi lệnh là một lượt mạng ~0,13 giây nối đuôi nhau (lưu một đoàn 5
 *  ngày ~65 lượt ≈ 8 giây), và Postgres vẫn sinh sự kiện realtime cho UPDATE y nguyên.
 *  Riêng `update doan` y nguyên làm MỌI máy đang mở CRM tải lại danh sách đoàn (~1,5 MB)
 *  — sự cố 02/10/2026. Bỏ lệnh ghi không đổi gì thì DB vẫn ra đúng y như cũ.
 *
 *  Luật an toàn: thiếu dòng cũ (đọc hỏng) hoặc dòng cũ không có cột đó (quên thêm vào
 *  câu select) → coi như KHÁC, ghi như trước. Thà ghi thừa còn hơn bỏ sót.
 */
export function canGhi(
  cu: Record<string, unknown> | null | undefined,
  moi: Record<string, unknown>,
): boolean {
  if (!cu) return true;
  for (const [cot, giaTri] of Object.entries(moi)) {
    if (giaTri === undefined) continue; // không gửi cột này
    if (!(cot in cu)) return true;
    if (!giongNhau(cu[cot], giaTri)) return true;
  }
  return false;
}

function giongNhau(a: unknown, b: unknown): boolean {
  const x = a === undefined ? null : a;
  const y = b === undefined ? null : b;
  if (x === null || y === null) return x === y;
  if (Array.isArray(x) || Array.isArray(y)) {
    if (!Array.isArray(x) || !Array.isArray(y) || x.length !== y.length) return false;
    return x.every((v, i) => giongNhau(v, y[i]));
  }
  // Cột numeric có thể về dạng chuỗi tuỳ đường đọc — so theo giá trị số.
  if (laSo(x) && laSo(y)) return Number(x) === Number(y);
  if (typeof x === "object" || typeof y === "object") {
    return JSON.stringify(x) === JSON.stringify(y);
  }
  return x === y;
}

function laSo(v: unknown): boolean {
  if (typeof v === "number") return Number.isFinite(v);
  return typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v));
}
