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

    const [doanRes, khachSanRes, nhaHangRes, canhDiemRes] = await Promise.all([
      supabase.from("doan")
        .select("id, ten_doan, ngay_di, ngay_ve, trang_thai, booking_status, so_khach")
        .order("ngay_di", { ascending: false })
        .limit(50),

      supabase.from("khach_san")
        .select("id, ten, dia_diem, dia_chi, email, so_dien_thoai, website, foc_khach, foc_mien, nguoi_thanh_toan")
        .limit(100),

      supabase.from("nha_hang")
        .select("id, ten, dia_diem, dia_chi, email, website, foc_khach, foc_mien, chiet_khau_phan_tram, nguoi_thanh_toan, set_menu:nha_hang_set_menu(ten_set, gia, don_vi)")
        .limit(100),

      supabase.from("canh_diem")
        .select("id, ten, dia_diem, loai, co_phi, gia_mac_dinh, don_vi, nguoi_thanh_toan")
        .limit(100),
    ]);

    const context = {
      doan: doanRes.data ?? [],
      khach_san: khachSanRes.data ?? [],
      nha_hang: nhaHangRes.data ?? [],
      canh_diem: canhDiemRes.data ?? [],
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
- Cảnh điểm loại: di_tich=di tích, thien_nhien=thiên nhiên, vui_choi=vui chơi
- nguoi_thanh_toan: cong_ty=công ty trả, hdv=HDV tự trả

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
