import { createClient } from "@supabase/supabase-js";

export const EXTERNAL_SUPABASE_URL = "https://lflsbwoqzmbknzdpaequ.supabase.co";
const EXTERNAL_SUPABASE_ANON_KEY =
  "sb_publishable_NDWgz5PzI38R-ouTHShYaw_6YhYjOIw";

export const externalSupabase = createClient(
  EXTERNAL_SUPABASE_URL,
  EXTERNAL_SUPABASE_ANON_KEY
);
