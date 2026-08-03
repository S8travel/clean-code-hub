// Chat DẠY quy tắc tính giá báo giá: nhận câu tiếng Việt tự nhiên của OP
// ("KS X khi có ăn tối thì giá phòng 3tr, không tính tiền ăn tối") → AI parse
// thành quy tắc CÓ CẤU TRÚC + khớp đúng KS trong danh mục. AI KHÔNG lưu gì —
// client hiện lại cho user xác nhận rồi mới insert bảng bao_gia_rule.
// P1 chỉ hỗ trợ loai='ks_gia_kem_bua'.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.101.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MODEL = "claude-opus-5";

const OUTPUT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["hieu", "ly_do", "rule"],
  properties: {
    hieu: { type: "boolean" },
    // Khi hieu=true: diễn giải lại quy tắc bằng tiếng Việt để user xác nhận.
    // Khi hieu=false: lý do (không khớp được KS / loại quy tắc chưa hỗ trợ / thiếu giá...).
    ly_do: { type: "string" },
    rule: {
      anyOf: [
        {
          type: "object",
          additionalProperties: false,
          required: ["loai", "khach_san_id", "khach_san_ten", "bua", "gia_phong"],
          properties: {
            loai: { type: "string", enum: ["ks_gia_kem_bua"] },
            khach_san_id: { type: "integer" },
            khach_san_ten: { type: "string" },
            bua: { type: "string", enum: ["trua", "toi", "ca_hai"] },
            gia_phong: { type: "number" },
          },
        },
        { type: "null" },
      ],
    },
  },
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { text } = await req.json();
    if (typeof text !== "string" || !text.trim()) {
      return json({ error: "Thiếu câu dạy quy tắc" }, 400);
    }

    const apiKey = Deno.env.get("CLAUDE_API_KEY");
    if (!apiKey) return json({ error: "Chưa cấu hình CLAUDE_API_KEY" }, 500);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SB_SECRET_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const { data: ksList } = await supabase
      .from("khach_san").select("id, ten, dia_diem").limit(1000);
    const catalog = (ksList ?? []).map((k: Record<string, unknown>) => ({
      id: k.id, ten: k.ten, dia_diem: k.dia_diem,
    }));

    const systemPrompt = `Bạn nhận 1 câu người vận hành tour (OP) DẠY quy tắc tính giá báo giá, bằng tiếng Việt tự nhiên. Nhiệm vụ: phân tích thành quy tắc có cấu trúc. CHỈ trả JSON đúng schema, không kèm chữ nào khác.

LOẠI QUY TẮC DUY NHẤT ĐANG HỖ TRỢ — "ks_gia_kem_bua":
"Khách sạn X: khi đêm đó lịch trình CÓ bữa <trua|toi|ca_hai> thì giá phòng = <gia_phong> VND và KHÔNG tính tiền bữa đó riêng nữa (giá phòng đã bao gồm bữa ăn)."

YÊU CẦU:
- Khớp tên khách sạn trong câu với DANH MỤC bên dưới (chịu viết tắt/thiếu dấu/sai chính tả nhẹ) → trả khach_san_id + khach_san_ten đúng theo danh mục. Không khớp được → hieu=false, ly_do nêu tên gần giống nhất nếu có.
- gia_phong: đổi cách viết Việt Nam về số VND ("3tr"/"3 triệu"=3000000, "2tr8"/"2.8tr"=2800000, "950k"=950000). Câu không nêu giá → hieu=false.
- bua: "ăn tối"→"toi", "ăn trưa"→"trua", "cả 2 bữa"/"trưa và tối"→"ca_hai". Câu không rõ bữa nào → hieu=false, hỏi lại trong ly_do.
- Câu dạy thuộc loại quy tắc KHÁC (giảm giá theo số khách, phụ thu mùa, quy tắc nhà hàng...) → hieu=false, ly_do: "Loại quy tắc này chưa hỗ trợ tự động — hiện chỉ hỗ trợ: giá phòng KS kèm bữa ăn."
- hieu=true → ly_do là 1 câu diễn giải lại quy tắc thật dễ hiểu để user xác nhận, vd: "Amina Lantana Hoian: đêm nào lịch trình có ăn tối → giá phòng 3.000.000 ₫ (đã gồm ăn tối), không tính tiền bữa tối riêng."
- TUYỆT ĐỐI không bịa khach_san_id ngoài danh mục, không bịa giá.

DANH MỤC KHÁCH SẠN (JSON):
${JSON.stringify(catalog)}`;

    const claudeRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 2000,
        system: systemPrompt,
        messages: [{ role: "user", content: [{ type: "text", text: `CÂU DẠY:\n${text}` }] }],
        output_config: { effort: "medium", format: { type: "json_schema", schema: OUTPUT_SCHEMA } },
      }),
    });

    if (!claudeRes.ok) {
      const errText = await claudeRes.text();
      console.error(`[teach-rule] anthropic ${claudeRes.status}: ${errText.slice(0, 800)}`);
      throw new Error(`LLM error ${claudeRes.status}: ${errText.slice(0, 400)}`);
    }

    const data = await claudeRes.json();
    const textBlock = (data?.content ?? []).find((b: Record<string, unknown>) => b.type === "text");
    if (!textBlock?.text) throw new Error("AI không trả về kết quả");
    const rawText = String(textBlock.text);
    const m = rawText.match(/\{[\s\S]*\}/);
    const ketQua = JSON.parse(m ? m[0] : rawText);
    return json({ ketQua });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[teach-rule] failed: ${message}`);
    return json({ error: message || "Lỗi không xác định" }, 500);
  }
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
