// Đối tác yêu cầu sửa chương trình của một báo giá — đầu NHẬN bên CRM.
//
// Đường đi: cổng /bao-gia/:id → edge fn 'gui-yeu-cau-sua' (bên cổng, verify_jwt)
//           → hàm này (x-portal-secret) → bao_gia_log + thong_bao.
//
// VÌ SAO GHI VÀO bao_gia_log CHỨ KHÔNG DỰNG BẢNG MỚI: yêu cầu sửa là một lượt
// trong dòng thời gian của báo giá, nằm xen giữa các lần gửi bản. Tách bảng
// riêng thì màn Lịch sử phiên bản phải trộn hai nguồn để hiện đúng thứ tự, mà
// thứ tự chính là thứ người đọc cần ("chào bản 2 → họ đòi đổi → chào bản 3").
//
// Auth: verify_jwt=false (xem supabase/config.toml) + header 'x-portal-secret'
// khớp PORTAL_TRAO_DOI_SECRET. Dùng lại đúng khoá của cầu nối hỏi/đáp: cùng một
// bên gọi (project cổng), cùng mức rủi ro (chèn được chữ, không giật được dữ liệu).
//
// KHÔNG ĐI KÈM TIỀN: hàm chỉ chuyển chữ do đối tác gõ.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-portal-secret",
};

const CRM_URL = Deno.env.get("SUPABASE_URL")!;
const CRM_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const PORTAL_SECRET = Deno.env.get("PORTAL_TRAO_DOI_SECRET") ?? "";

/** Chặn bơm text nhiều MB qua một endpoint không captcha. */
const MAX_CHU = 2000;
const cat = (s: unknown, n = MAX_CHU): string => String(s ?? "").trim().slice(0, n);

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
    if (!PORTAL_SECRET) return json({ error: "Chưa cấu hình PORTAL_TRAO_DOI_SECRET" }, 500);
    if (req.headers.get("x-portal-secret") !== PORTAL_SECRET) {
      return json({ error: "Không có quyền" }, 401);
    }

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const baoGiaId = Number(body.crm_bao_gia_id);
    const noiDung = cat(body.noi_dung);
    if (!Number.isFinite(baoGiaId) || baoGiaId <= 0) return json({ error: "Thiếu báo giá" }, 400);
    if (!noiDung) return json({ error: "Cần nhập nội dung yêu cầu" }, 400);

    const crm = createClient(CRM_URL, CRM_SERVICE_KEY);

    const { data: bg, error: eBg } = await crm
      .from("bao_gia")
      .select("id, ma_bg, tieu_de, created_by, agent_id")
      .eq("id", baoGiaId)
      .maybeSingle();
    if (eBg) return json({ error: eBg.message }, 500);
    if (!bg) return json({ error: "Không tìm thấy báo giá" }, 404);

    // Tên đối tác lấy từ DB theo agent_id của chính báo giá, KHÔNG lấy từ body:
    // thân request là thứ bên ngoài gõ được.
    let tenAgent = "Đối tác";
    if (bg.agent_id != null) {
      const { data: a } = await crm.from("agents").select("ten").eq("id", bg.agent_id).maybeSingle();
      if (a?.ten) tenAgent = a.ten;
    }
    const nguoiGui = cat(body.nguoi_gui, 200);
    // Bản đối tác đang cầm lúc bấm yêu cầu — nói rõ họ soi bản nào, vì lúc mình
    // đọc có thể đã chào thêm một bản nữa rồi.
    const banDangXem = cat(body.ma_hien_thi, 60) || bg.ma_bg || `BG${bg.id}`;

    const { data: log, error: eLog } = await crm
      .from("bao_gia_log")
      .insert({
        bao_gia_id: bg.id,
        loai: "yeu_cau_sua",
        noi_dung: `[${banDangXem}] ${noiDung}`,
        tao_boi_ten: nguoiGui ? `${tenAgent} — ${nguoiGui}` : tenAgent,
      })
      .select("id")
      .single();
    if (eLog) return json({ error: eLog.message }, 500);

    // ── Chuông ──────────────────────────────────────────────────────────────
    // Người làm báo giá là người phải trả lời. Báo giá cũ không ghi ai tạo thì
    // rơi về nhóm nhận yêu cầu đối tác — để yêu cầu không rơi vào khoảng không.
    const nhan = new Set<string>();
    if (bg.created_by) nhan.add(bg.created_by as string);
    if (!nhan.size) {
      const { data: ds } = await crm
        .from("user_roles")
        .select("user_id")
        .eq("nhan_yeu_cau_doi_tac", true)
        .eq("active", true)
        .not("user_id", "is", null);
      for (const u of ds ?? []) if (u.user_id) nhan.add(u.user_id as string);
    }

    if (nhan.size) {
      await crm.from("thong_bao").insert(
        [...nhan].map((userId) => ({
          user_id: userId,
          loai: "bao_gia_yeu_cau_sua",
          bao_gia_id: bg.id,
          tieu_de: `${tenAgent} yêu cầu sửa ${banDangXem}`,
          noi_dung: noiDung.slice(0, 300),
        })),
      );
    }

    return json({ log_id: log.id, so_nguoi_nhan: nhan.size });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
});
