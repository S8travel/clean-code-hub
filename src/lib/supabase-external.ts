import { createClient } from "@supabase/supabase-js";

export const EXTERNAL_SUPABASE_URL = "https://lflsbwoqzmbknzdpaequ.supabase.co";
const EXTERNAL_SUPABASE_ANON_KEY =
  "sb_publishable_6R8_5n97R_1JRQRfrf5vJA_6cuXePLL";

export const externalSupabase = createClient(
  EXTERNAL_SUPABASE_URL,
  EXTERNAL_SUPABASE_ANON_KEY
);
