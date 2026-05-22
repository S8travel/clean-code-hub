import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// HTML → plain text. Email có cả text + html giảm điểm spam đáng kể
// (mail chỉ-HTML bị Gmail/Outlook nghi ngờ hơn).
function htmlToText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<\/\s*(p|div|tr|h[1-6]|li)\s*>/gi, "\n")
    .replace(/<\/\s*td\s*>/gi, "\t")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// Email trong DB có thể cách nhau bằng dấu phẩy, chấm phẩy, xuống dòng,
// hoặc dấu phẩy/chấm phẩy tiếng Trung (，；). Split tất cả + lọc entry
// không có "@" (rác) → tránh Resend 422 Invalid `to` field.
function parseEmailList(input: unknown): string[] {
  if (Array.isArray(input)) return input.flatMap((v) => parseEmailList(v));
  if (typeof input !== "string") return [];
  return input
    .split(/[,;\n\r，；]+/)
    .map((e) => e.trim())
    .filter((e) => e.length > 0 && e.includes("@"));
}

// Reply-To = Gmail OP gửi mail (frontend truyền qua `replyTo`) → NCC bấm Reply
// về THẲNG hộp OP đã gửi. Không cần forwarding/alias/DNS.
// Đánh đổi: Gmail ở Reply-To + From là domain → SpamAssassin
// FREEMAIL_FORGED_REPLYTO (-2.5đ, mail-tester ~7.3). Chấp nhận tạm — auth
// (SPF/DKIM/DMARC qua Resend) vẫn chuẩn nên thực tế phần lớn vẫn vào inbox.
// Thiếu replyTo → fallback booking@s8travel.com.
function opReplyTo(raw: unknown): string {
  return parseEmailList(raw)[0] || Deno.env.get("REPLY_TO_ADDRESS") || "booking@s8travel.com";
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { to, cc, subject, html, text, replyTo, messageId, inReplyTo, attachments } = await req.json();
    // attachments?: Array<{ filename: string; content: string }> — content là base64
    // text?: bản plain-text. Không truyền → tự sinh từ html (giảm spam).

    if (!to || !subject || !html) {
      return new Response(
        JSON.stringify({ error: "Thiếu thông tin: to, subject, html" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const toList = parseEmailList(to);
    if (toList.length === 0) {
      return new Response(
        JSON.stringify({ error: "Email người nhận không hợp lệ (rỗng hoặc sai định dạng)" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
    if (!RESEND_API_KEY) {
      return new Response(
        JSON.stringify({ error: "RESEND_API_KEY chưa được cấu hình trong Supabase secrets" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "S8 Travel <booking@email.s8travel.com>",
        to: toList,
        // CC = mail nội bộ S8 (BOOKING_CC) + gmail OP → OP hiện trong luồng,
        // NCC Reply All là OP + các mail S8 khác đều nhận. Dedupe, loại trùng to.
        ...((() => {
          const ccList = [...new Set([...parseEmailList(cc), ...parseEmailList(replyTo)])]
            .filter((e) => !toList.includes(e));
          return ccList.length ? { cc: ccList } : {};
        })()),
        subject,
        html,
        text: (typeof text === "string" && text.trim()) ? text : htmlToText(html),
        reply_to: [opReplyTo(replyTo)],
        ...(attachments?.length ? { attachments } : {}),
        ...((messageId || inReplyTo) ? {
          headers: {
            ...(messageId  ? { "Message-ID":  `<${messageId}@email.s8travel.com>` } : {}),
            ...(inReplyTo  ? { "In-Reply-To": `<${inReplyTo}@email.s8travel.com>`, "References": `<${inReplyTo}@email.s8travel.com>` } : {}),
          }
        } : {}),
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Resend API error: ${errText}`);
    }

    const data = await res.json();
    return new Response(
      JSON.stringify({ success: true, id: data.id }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return new Response(
      JSON.stringify({ error: message || "Lỗi không xác định" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
