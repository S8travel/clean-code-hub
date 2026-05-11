// Hash các key fields được đưa vào mail booking để detect dirty.
// Khi gửi mail → lưu hash hiện tại. Khi render → so sánh hash hiện tại vs DB.
// Khác → có thay đổi sau mail gửi gần nhất → hiện badge "Có thay đổi".

// Hash đơn giản djb2 — đủ tránh collision cho key fields ngắn, < 200 chars.
function djb2(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

// Normalize value để hash ổn định:
// - undefined / null / "" → ""
// - number / boolean → string
// - array → join("|") sau khi normalize từng phần tử
// - object → JSON.stringify với key sorted
function normalize(v: unknown): string {
  if (v == null || v === "") return "";
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (Array.isArray(v)) return v.map(normalize).join("|");
  if (typeof v === "object") {
    const obj = v as Record<string, unknown>;
    return Object.keys(obj)
      .sort()
      .map((k) => `${k}:${normalize(obj[k])}`)
      .join(",");
  }
  return String(v);
}

export function hashMailContent(fields: Record<string, unknown>): string {
  const sortedKeys = Object.keys(fields).sort();
  const serialized = sortedKeys.map((k) => `${k}=${normalize(fields[k])}`).join(";");
  return djb2(serialized);
}

// Helper: check booking có dirty (thay đổi so với lần gửi mail gần nhất) không.
// Yêu cầu: sent_at non-null (đã từng gửi) AND mail_content_hash non-null AND khác hash hiện tại.
// Nếu sent_at null hoặc mail_content_hash null → chưa gửi mail bao giờ → không dirty.
export function isMailDirty(
  sentAt: string | null | undefined,
  storedHash: string | null | undefined,
  currentFields: Record<string, unknown>,
): boolean {
  if (!sentAt) return false;
  if (!storedHash) return false;
  return storedHash !== hashMailContent(currentFields);
}
