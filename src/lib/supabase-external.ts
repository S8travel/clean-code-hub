import { createClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

export const EXTERNAL_SUPABASE_URL = "https://lflsbwoqzmbknzdpaequ.supabase.co";
// Dùng anon key LEGACY (JWT eyJ...) thay publishable key kiểu mới (sb_publishable_…).
// Lý do: storage-api KHÔNG suy ra được ngữ cảnh xác thực từ apikey non-JWT → mọi
// upload bị coi là anon → "new row violates row-level security policy" (RLS chặn).
// PostgREST chấp nhận cả 2 key (ghi/đọc bảng vẫn authenticated), nhưng Storage cần
// apikey dạng JWT để gắn đúng role. Giữ legacy key tới khi storage-api hỗ trợ key mới.
const EXTERNAL_SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxmbHNid29xem1ia256ZHBhZXF1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM3MDAzNzcsImV4cCI6MjA4OTI3NjM3N30.RLsKYfH6XZw3Mcmk2fm1R6rKKzrtm0MLrYhtjIT--T0";

export const externalSupabase = createClient<Database>(
  EXTERNAL_SUPABASE_URL,
  EXTERNAL_SUPABASE_ANON_KEY
);
