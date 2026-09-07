// Trích xuất chương trình tour tiếng Trung → JSON dịch vụ theo ngày (Claude Haiku).
//
// ⚠️ Hàm này hiện KHÔNG màn hình nào gọi (hook useExtractChuongTrinh trong
// src/hooks/use-bao-gia.ts không được component nào dùng; luồng đang chạy là
// bao-gia-extract-match). Giữ lại vì có thể dùng lại, nhưng đã khoá cửa.
//
// Lịch sử: tới 05/09/2026 hàm chạy với verify_jwt=false, CORS "*", không kiểm tra
// gì cả — bất kỳ ai biết URL đều bơm text vào và ANTHROPIC_API_KEY của công ty trả
// tiền. Source cũng không nằm trong git (chỉ có trên prod).
//
// BÀI HỌC quan trọng khi siết những hàm khác: **verify_jwt=true KHÔNG đủ**.
// Publishable key `sb_publishable_...` nằm sẵn trong bundle web và được gateway
// tính là JWT hợp lệ (role "anon") → bật verify_jwt xong người lạ vẫn gọi được.
// Muốn chặn thật thì hàm phải tự hỏi Auth xem token có phải NGƯỜI đăng nhập không,
// đúng như src/lib/edge-fn-auth.ts đã ghi ở phía client.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SYSTEM_PROMPT = `Bạn là hệ thống phân tích chương trình tour du lịch.
Input là chương trình tour viết bằng tiếng Trung (Phồn thể hoặc Giản thể).

NHIỆM VỤ:
Trích xuất danh sách dịch vụ từng ngày theo cấu trúc sau.
CHỈ trả về JSON, KHÔNG thêm bất kỳ text nào ngoài JSON.

OUTPUT JSON:
{
  "ten_chuong_trinh": "tên tour bằng tiếng Việt",
  "so_ngay": <số ngày>,
  "items": [
    {
      "ngay": <số thứ tự ngày, bắt đầu từ 1>,
      "loai": <"hotel" | "meal" | "ticket" | "transport">,
      "mo_ta_zh": "<mô tả ngắn bằng tiếng Trung từ file>",
      "mo_ta_goi_y": "<gợi ý tên tiếng Việt tương ứng>"
    }
  ]
}

QUY TẮC PHÂN LOẠI:
- hotel: khách sạn, nơi lưu trú (每晚住, 入住, 酒店)
- meal: bữa ăn — bữa sáng, trưa, tối (早餐, 午餐, 晚餐, 用餐)
- ticket: vé tham quan, điểm du lịch (参观, 游览, 景点, 门票)
- transport: xe, tàu, phương tiện di chuyển (乘车, 大巴, 游船, 火车)

LƯU Ý:
- Mỗi bữa ăn (sáng/trưa/tối) là 1 dòng riêng
- Mỗi điểm tham quan là 1 dòng riêng
- Mỗi đêm khách sạn là 1 dòng (loai=hotel)
- Xe/tàu toàn chuyến chỉ cần 1 dòng (loai=transport)
- Không đưa vào các dịch vụ không rõ giá (như phòng khách sạn đặc biệt, nâng cấp)`;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// Token phải thuộc về một NGƯỜI đang đăng nhập. Publishable key qua được
// verify_jwt nhưng /auth/v1/user sẽ trả 401 cho nó — đó là chỗ chặn thật.
async function nguoiDangNhap(req: Request): Promise<boolean> {
  const auth = req.headers.get("Authorization") ?? "";
  const token = auth.replace(/^Bearer\s+/i, "").trim();
  if (!token) return false;
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? "";
  if (!supabaseUrl) return false;
  try {
    const res = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: { apikey: anonKey, Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return false;
    const user = await res.json();
    return Boolean(user?.id);
  } catch {
    return false;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (!(await nguoiDangNhap(req))) {
    return json({ error: "Cần đăng nhập để dùng chức năng này" }, 401);
  }

  try {
    const { text } = await req.json();

    if (!text || text.trim().length < 10) {
      return json({ error: "Text quá ngắn hoặc rỗng" }, 400);
    }

    const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!anthropicKey) {
      return json({ error: "ANTHROPIC_API_KEY not configured" }, 500);
    }

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": anthropicKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 4096,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: text }],
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      return json({ error: `Claude API error: ${err}` }, 500);
    }

    const result = await response.json();
    const rawText = result.content?.[0]?.text ?? "";

    const jsonMatch = rawText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return json({ error: "AI không trả về JSON hợp lệ", raw: rawText }, 500);
    }

    return json(JSON.parse(jsonMatch[0]));
  } catch (err) {
    return json({ error: String(err) }, 500);
  }
});
