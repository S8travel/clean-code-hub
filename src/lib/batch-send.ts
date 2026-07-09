// Gửi tuần tự có throttle — dùng cho batch email (Resend giới hạn ~2 req/s,
// loop không delay sẽ dính 429 hàng loạt).

export interface SendSequentialResult {
  ok: number;
  fail: number;
}

export async function sendSequential<T>(
  items: T[],
  fn: (item: T, index: number) => Promise<void>,
  opts: {
    delayMs?: number;
    /** Gọi trước khi gửi item i (đánh dấu "đang gửi" trên UI). */
    onStart?: (index: number) => void;
    /** Gọi sau mỗi item — lỗi 1 item KHÔNG dừng cả batch. */
    onResult?: (index: number, ok: boolean, error?: string) => void;
  } = {},
): Promise<SendSequentialResult> {
  const delayMs = opts.delayMs ?? 600;
  let ok = 0;
  let fail = 0;
  for (let i = 0; i < items.length; i++) {
    opts.onStart?.(i);
    try {
      await fn(items[i], i);
      ok++;
      opts.onResult?.(i, true);
    } catch (e: unknown) {
      fail++;
      opts.onResult?.(i, false, e instanceof Error ? e.message : String(e));
    }
    if (i < items.length - 1 && delayMs > 0) {
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  return { ok, fail };
}
