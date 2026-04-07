import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.101.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { question, history } = await req.json();
    if (!question) {
      return new Response(JSON.stringify({ error: "Thiếu câu hỏi" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const claudeKey = Deno.env.get("CLAUDE_API_KEY");
    if (!claudeKey) {
      return new Response(JSON.stringify({ error: "Chưa cấu hình CLAUDE_API_KEY" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Fetch DB context ───────────────────────────────────────────────────
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const [doanRes, ksRes, dvRes, dnttRes, khachSanRes, nhaHangRes] = await Promise.all([
      supabase.from("doan")
        .select("id, ten_doan, ngay_di, trang_thai, booking_status")
        .order("ngay_di", { ascending: false })
        .limit(30),

      supabase.from("doan_booking_ks")
        .select("doan_id, ks_dat_truoc_status, ks_final_status, khach_san:khach_san_id(ten)")
        .limit(60),

      supabase.from("doan_booking_dv")
        .select("doan_id, ten_nha_cung_cap, booking_status")
        .limit(60),

      supabase.from("de_nghi_thanh_toan")
        .select("doan_id, mo_ta, so_tien, trang_thai_duyet, trang_thai_thanh_toan")
        .not("doan_id", "is", null)
        .neq("loai", "dinh_ky")
        .neq("trang_thai_duyet", "da_huy")
        .limit(60),

      supabase.from("khach_san")
        .select("id, ten, dia_diem")
        .limit(50),

      supabase.from("nha_hang")
        .select("id, ten, dia_diem")
        .limit(50),
    ]);

    const context = {
      doan: doanRes.data ?? [],
      booking_ks: (ksRes.data ?? []).map((r: any) => ({
        doan_id: r.doan_id,
        ks: r.khach_san?.ten,
        dt: r.ks_dat_truoc_status,
        fn: r.ks_final_status,
      })),
      booking_dv: (dvRes.data ?? []).map((r: any) => ({
        doan_id: r.doan_id,
        ncc: r.ten_nha_cung_cap,
        st: r.booking_status,
      })),
      dntt: (dnttRes.data ?? []).map((r: any) => ({
        doan_id: r.doan_id,
        mo_ta: r.mo_ta,
        tien: r.so_tien,
        duyet: r.trang_thai_duyet,
        tt: r.trang_thai_thanh_toan,
      })),
      khach_san: khachSanRes.data ?? [],
      nha_hang: nhaHangRes.data ?? [],
    };

    // ── Build prompt ───────────────────────────────────────────────────────
    const systemPrompt = `Bạn là trợ lý AI của Công ty TNHH Du lịch S8 Đà Nẵng.
Dưới đây là dữ liệu thực tế từ hệ thống quản lý tour (JSON):
<DATA>
${JSON.stringify(context)}
</DATA>

Hướng dẫn:
- Trả lời ngắn gọn, rõ ràng bằng tiếng Việt
- Dựa vào dữ liệu trên để trả lời, không bịa thêm
- Nếu không tìm thấy trong dữ liệu, nói rõ "Không có thông tin"
- Trạng thái đoàn: dang_chay=đang chạy, huy=đã hủy
- Booking KS status: chua_gui=chưa gửi, cho_ks_xac_nhan=chờ XN, ks_xac_nhan=đã XN đặt trước, ks_xac_nhan_final=Final đã XN, ks_xac_nhan_huy=đã hủy
- ĐNTT: cho_duyet=chờ duyệt, da_duyet=đã duyệt, tu_choi=từ chối; TT: chua_tt=chưa TT, da_tt=đã TT

Câu hỏi: ${question}`;

    // ── Call Claude ────────────────────────────────────────────────────────
    const claudeRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": claudeKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 1024,
        system: systemPrompt,
        messages: [
          ...(Array.isArray(history) ? history.map((m: any) => ({
            role: m.role === "assistant" ? "assistant" : "user",
            content: m.content,
          })) : []),
          { role: "user", content: question },
        ],
      }),
    });

    if (!claudeRes.ok) {
      const errText = await claudeRes.text();
      throw new Error(`Claude error: ${errText}`);
    }

    const claudeData = await claudeRes.json();
    const answer = claudeData?.content?.[0]?.text ?? "Không có phản hồi từ AI";

    return new Response(JSON.stringify({ answer }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message ?? "Lỗi không xác định" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
