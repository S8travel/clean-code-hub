import { createClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";
import { isReadOnlyMode, isWriteRequest, READ_ONLY_MESSAGE } from "./readonly-mode";

export const EXTERNAL_SUPABASE_URL = "https://lflsbwoqzmbknzdpaequ.supabase.co";
const EXTERNAL_SUPABASE_ANON_KEY =
  "sb_publishable_NDWgz5PzI38R-ouTHShYaw_6YhYjOIw";

/**
 * Chốt chặn DUY NHẤT cho tài khoản chỉ xem: mọi lời gọi ghi đều đi qua đây.
 * Trả 403 dạng lỗi PostgREST để supabase-js parse thành `error` như bình thường
 * → mutation ném lỗi, không bị "lưu thành công nhưng DB không đổi".
 * DB vẫn là lớp enforce thật — xem lib/readonly-mode.ts.
 */
const guardedFetch: typeof fetch = (input, init) => {
  const url =
    typeof input === "string" ? input
    : input instanceof URL ? input.toString()
    : input.url;
  const method = init?.method ?? (input instanceof Request ? input.method : "GET");

  if (isReadOnlyMode() && isWriteRequest(method, url)) {
    return Promise.resolve(
      new Response(
        JSON.stringify({ message: READ_ONLY_MESSAGE, code: "42501", hint: null, details: null }),
        { status: 403, headers: { "Content-Type": "application/json" } },
      ),
    );
  }

  return fetch(input, init);
};

export const externalSupabase = createClient<Database>(
  EXTERNAL_SUPABASE_URL,
  EXTERNAL_SUPABASE_ANON_KEY,
  { global: { fetch: guardedFetch } },
);
