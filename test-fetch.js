async function run() {
  const res = await fetch("https://utrljiwwvohkdztwwchs.supabase.co/rest/v1/canh_diem", {
    method: "POST",
    headers: {
      "apikey": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV0cmxqaXd3dm9oa2R6dHd3Y2hzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ4ODI0NDAsImV4cCI6MjA5MDQ1ODQ0MH0.cBhy5GzufKR9TTokxQ5HVaMtOcIEGJKBpWmc0uoyuRU",
      "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV0cmxqaXd3dm9oa2R6dHd3Y2hzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ4ODI0NDAsImV4cCI6MjA5MDQ1ODQ0MH0.cBhy5GzufKR9TTokxQ5HVaMtOcIEGJKBpWmc0uoyuRU",
      "Content-Type": "application/json",
      "Prefer": "return=representation"
    },
    body: JSON.stringify({
      ten: "Test Fetch",
      loai: "canh_diem"
    })
  });
  
  const data = await res.json();
  console.log("STATUS:", res.status);
  console.log("DATA:", data);
}

run();
