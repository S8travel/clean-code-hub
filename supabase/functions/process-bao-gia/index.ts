// Báo giá tự động từ file chương trình tour (PDF gửi thẳng cho Claude, DOCX bóc
// text bằng mammoth) → JSON 2 kịch bản 16/20 khách.
//
// ⛔ ĐÃ GỠ KHỎI PROD 05/09/2026 (`supabase functions delete process-bao-gia`).
// Giữ source ở đây làm tư liệu, KHÔNG deploy lại nguyên trạng.
//
// Lý do gỡ: hàm không màn hình nào gọi (hook `useProcessBaoGia` là dead code, luồng
// đang chạy là `bao-gia-extract-match`), model `claude-sonnet-4-6` đã cũ,
// `ANTHROPIC_API_KEY` trả authentication_error — và quan trọng nhất, nó KHÔNG tự xác
// thực người gọi: đã kiểm chứng bằng publishable key (nằm sẵn trong bundle web),
// request của người lạ vào tới tận bước gọi Anthropic. Khoá API sống lại là công ty
// trả tiền cho người ngoài.
//
// ⚠️ Nếu dựng lại: thêm guard `nguoiDangNhap(req)` như trong
// supabase/functions/extract-chuong-trinh/index.ts TRƯỚC, rồi mới cập nhật model +
// khoá API. `verify_jwt = true` một mình KHÔNG chặn được publishable key.
// ⚠️ `supabase functions deploy` KHÔNG kèm tên hàm sẽ deploy cả thư mục này và dựng
// lại hàm đã gỡ — luôn deploy đích danh từng hàm.
//
// Công thức tính giá bên dưới là bản CŨ (pax = khách + 1 HDV, lãi cố định theo USD).
// Luật báo giá hiện hành nằm ở src/lib/bao-gia-*.ts — đừng lấy file này làm chuẩn.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import mammoth from "https://esm.sh/mammoth@1.8.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SYSTEM_PROMPT = `Bạn là hệ thống báo giá tour du lịch chuyên nghiệp. File đầu vào là chương trình tour viết bằng tiếng Trung (Phồn thể hoặc Giản thể).

NHIỆM VỤ:
1. Đọc và hiểu nội dung chương trình tour (tiếng Trung)
2. Trích xuất danh sách dịch vụ và đơn giá từ bảng giá trong file
3. Đếm số ngày của tour
4. Áp dụng công thức tính giá cho 2 trường hợp (16 khách và 20 khách)
5. Trả về kết quả dưới dạng JSON thuần túy (KHÔNG có text ngoài JSON)

CÔNG THỨC TÍNH GIÁ:
- Trường hợp 16 khách: pax = 17 (bao gồm 1 HDV), rooms = 9
- Trường hợp 20 khách: pax = 21 (bao gồm 1 HDV), rooms = 11

Chi phí:
- hotel = tổng(giá_phòng × rooms) [mỗi đêm, tất cả khách sạn]
- meal = tổng(đơn_giá × pax) [mỗi bữa ăn]
- ticket = tổng(đơn_giá × pax) [mỗi điểm tham quan]
- transport = giá_cố_định [xe]
- insurance = 100000 × pax
- guide = 200000 × days
- tips = 500000

total_cost = hotel + meal + ticket + transport + insurance + guide + tips
profit_vnd = profit_usd × exchange_rate
final_price_vnd = (total_cost + profit_vnd) ÷ guests [guests = 16 hoặc 20, không phải pax]
final_price_usd = final_price_vnd ÷ exchange_rate

Kết quả cuối = trung bình của 2 trường hợp

OUTPUT JSON (giá trị số là VND trừ khi có ghi USD, làm tròn đến nghìn đồng):
{
  "ten_chuong_trinh": "tên tour (tiếng Việt nếu có thể dịch, nếu không giữ tiếng Trung)",
  "so_ngay": <số>,
  "items": [
    {"loai": "hotel", "mo_ta": "tên khách sạn + địa điểm", "don_gia": <giá_1_phòng_1_đêm>, "ghi_chu": "số đêm: X"},
    {"loai": "meal", "mo_ta": "mô tả bữa ăn", "don_gia": <giá_1_người>, "ghi_chu": "bữa X/ngày Y"},
    {"loai": "ticket", "mo_ta": "tên điểm tham quan", "don_gia": <giá_1_người>, "ghi_chu": ""},
    {"loai": "transport", "mo_ta": "loại xe / tuyến đường", "don_gia": <giá_cố_định_toàn_tour>, "ghi_chu": "cố định"}
  ],
  "case_16": {
    "guests": 16,
    "pax": 17,
    "rooms": 9,
    "hotel": <tổng>,
    "meal": <tổng>,
    "ticket": <tổng>,
    "transport": <tổng>,
    "insurance": <tổng>,
    "guide": <tổng>,
    "tips": 500000,
    "total_cost": <tổng>,
    "profit_vnd": <lợi_nhuận_quy_đổi>,
    "final_price_vnd": <giá_1_khách_VND>,
    "final_price_usd": <giá_1_khách_USD>
  },
  "case_20": {
    "guests": 20,
    "pax": 21,
    "rooms": 11,
    "hotel": <tổng>,
    "meal": <tổng>,
    "ticket": <tổng>,
    "transport": <tổng>,
    "insurance": <tổng>,
    "guide": <tổng>,
    "tips": 500000,
    "total_cost": <tổng>,
    "profit_vnd": <lợi_nhuận_quy_đổi>,
    "final_price_vnd": <giá_1_khách_VND>,
    "final_price_usd": <giá_1_khách_USD>
  },
  "gia_trung_binh_vnd": <trung_bình>,
  "gia_trung_binh_usd": <trung_bình>
}`;

// Kiểu message gửi Anthropic. Bản trên prod khai `any[]`; ở đây khai tường minh
// để hợp quy ước repo (eslint cấm `any`) — hành vi runtime không đổi.
type ClaudeContentBlock =
  | { type: "text"; text: string }
  | { type: "document"; source: { type: "base64"; media_type: string; data: string } };
type ClaudeMessage = { role: "user"; content: string | ClaudeContentBlock[] };

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { fileContent, fileType, exchangeRate, profitUsd } = await req.json();

    if (!fileContent || !fileType) {
      return new Response(JSON.stringify({ error: "Missing fileContent or fileType" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!anthropicKey) {
      return new Response(JSON.stringify({ error: "ANTHROPIC_API_KEY not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userInstruction = `Tỷ giá: ${exchangeRate} VND/USD\nLợi nhuận: ${profitUsd} USD\n\nHãy phân tích file chương trình tour sau và tính báo giá theo công thức đã cung cấp:`;

    let messages: ClaudeMessage[];

    if (fileType === "application/pdf" || fileType.includes("pdf")) {
      // PDF: gửi trực tiếp lên Claude dưới dạng document block
      messages = [
        {
          role: "user",
          content: [
            {
              type: "document",
              source: {
                type: "base64",
                media_type: "application/pdf",
                data: fileContent,
              },
            },
            {
              type: "text",
              text: userInstruction,
            },
          ],
        },
      ];
    } else {
      // DOCX: dùng mammoth extract text rồi gửi text
      const buffer = Uint8Array.from(atob(fileContent), (c) => c.charCodeAt(0));
      const result = await mammoth.extractRawText({ arrayBuffer: buffer.buffer });
      const extractedText = result.value;

      messages = [
        {
          role: "user",
          content: `${userInstruction}\n\n---\n${extractedText}`,
        },
      ];
    }

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": anthropicKey,
        "anthropic-version": "2023-06-01",
        "anthropic-beta": "pdfs-2024-09-25",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 4096,
        system: SYSTEM_PROMPT,
        messages,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      return new Response(JSON.stringify({ error: `Claude API error: ${errText}` }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const claudeResult = await response.json();
    const rawText = claudeResult.content?.[0]?.text ?? "";

    // Extract JSON from response
    const jsonMatch = rawText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return new Response(JSON.stringify({ error: "AI did not return valid JSON", raw: rawText }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const ketQua = JSON.parse(jsonMatch[0]);

    return new Response(JSON.stringify({ ketQua }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
