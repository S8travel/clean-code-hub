import "jsr:@supabase/functions-js/edge-runtime.d.ts";

// Lấy tỷ giá USD/VND (giá MUA) từ Vietcombank — rate chuẩn business VN, mọi NCC
// dùng. Proxy qua edge fn vì VCB không bật CORS cho browser. Cache 30 phút
// tại memory để giảm load (rate VCB cập nhật vài lần/ngày, không cần realtime).

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// XML stable endpoint của VCB — third-party Vietnam dùng từ ~2010, không
// đòi auth, trả về tất cả currency với attributes Buy/Transfer/Sell.
const VCB_URL = "https://portal.vietcombank.com.vn/Usercontrols/TVPortal.TyGia/pXML.aspx";
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 phút

let cache: { ts: number; payload: object } | null = null;

interface VcbRate {
  rate: number;       // giá MUA (VND/USD)
  rate_transfer: number; // chuyển khoản (tham khảo)
  rate_sell: number;     // bán (tham khảo)
  date: string;       // ngày VCB công bố
  source: "VCB";
  currency: "USD";
  side: "buy";
  cached: boolean;
}

async function fetchVcbRate(): Promise<VcbRate> {
  const resp = await fetch(VCB_URL, {
    headers: {
      "User-Agent": "Mozilla/5.0 (S8 CRM exchange-rate fetcher)",
      "Accept": "application/xml, text/xml, */*",
    },
  });
  if (!resp.ok) throw new Error(`VCB HTTP ${resp.status}`);
  const xml = await resp.text();

  // VCB XML: <Exrate CurrencyCode="USD" Buy="25,520.00" Transfer="25,550.00" Sell="25,890.00"/>
  // Số dạng vi-VN: dùng "," làm thousand separator + "." làm decimal.
  const usdRow = xml.match(/<Exrate[^>]*CurrencyCode="USD"[^/]*\/>/);
  if (!usdRow) throw new Error("Không tìm thấy dòng USD trong response VCB");

  const buy = usdRow[0].match(/Buy="([\d.,]+)"/)?.[1];
  const transfer = usdRow[0].match(/Transfer="([\d.,]+)"/)?.[1];
  const sell = usdRow[0].match(/Sell="([\d.,]+)"/)?.[1];
  if (!buy) throw new Error("Thiếu attribute Buy cho USD");

  const parseRate = (s: string) => parseFloat(s.replace(/,/g, ""));
  const rate = parseRate(buy);
  if (!isFinite(rate) || rate <= 0) throw new Error(`Rate USD không hợp lệ: ${buy}`);

  const dateMatch = xml.match(/<DateTime>([^<]+)<\/DateTime>/);
  const date = dateMatch?.[1]?.trim() ?? new Date().toISOString();

  return {
    rate,
    rate_transfer: transfer ? parseRate(transfer) : rate,
    rate_sell: sell ? parseRate(sell) : rate,
    date,
    source: "VCB",
    currency: "USD",
    side: "buy",
    cached: false,
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: CORS_HEADERS, status: 204 });
  }

  try {
    // Cache 30 phút — VCB không thay đổi liên tục
    const now = Date.now();
    if (cache && now - cache.ts < CACHE_TTL_MS) {
      return new Response(JSON.stringify({ ...cache.payload, cached: true }), {
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    const data = await fetchVcbRate();
    cache = { ts: now, payload: data };

    return new Response(JSON.stringify(data), {
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }
});
