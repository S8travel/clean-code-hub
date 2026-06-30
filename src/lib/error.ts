// Lấy message an toàn từ 1 giá trị error unknown (Error, lỗi Supabase {message}, string).
export function errMsg(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  if (err != null && typeof err === "object" && "message" in err) {
    const m = (err as { message: unknown }).message;
    if (typeof m === "string") return m;
  }
  return "";
}

// FK violation Postgres (mã 23503) — vd gán nha_cung_cap_id/khach_san_id không tồn tại.
export function isFkViolation(err: unknown): boolean {
  return (
    err != null &&
    typeof err === "object" &&
    "code" in err &&
    (err as { code: unknown }).code === "23503"
  );
}
