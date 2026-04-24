import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  "https://utrljiwwvohkdztwwchs.supabase.co",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV0cmxqaXd3dm9oa2R6dHd3Y2hzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ4ODI0NDAsImV4cCI6MjA5MDQ1ODQ0MH0.cBhy5GzufKR9TTokxQ5HVaMtOcIEGJKBpWmc0uoyuRU"
);

async function run() {
  const { data, error } = await supabase
    .from("canh_diem")
    .insert({
      ten: "Test Node",
      loai: "canh_diem",
      dia_diem: null,
      nha_cung_cap_id: null,
    })
    .select()
    .single();
  
  if (error) {
    console.error("ERROR:", error);
  } else {
    console.log("SUCCESS:", data);
  }
}

run();
