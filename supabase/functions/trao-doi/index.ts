// Cầu nối hỏi/đáp giữa CRM và CỔNG ĐỐI TÁC (外網) — hai chiều, một hàm.
//
// Auth: verify_jwt=false (xem supabase/config.toml) + MỘT TRONG HAI:
//   - header 'x-portal-secret' khớp PORTAL_CRON_SECRET → tin do CỔNG chuyển sang
//     (edge function gui-trao-doi bên cổng gọi; đối tác không gọi thẳng vào đây).
//   - Authorization: Bearer <token phiên CRM> → OP gửi hoặc trả lời.
//
// VÌ SAO CRM LÀ BẢN GỐC: hỏi/đáp là hồ sơ công việc của đoàn, phải nằm cùng chỗ
// với đoàn để tra cứu và không mất khi cổng bị gỡ. Cổng chỉ giữ một bản sao cho
// đối tác đọc.
//
// KHÔNG ĐI KÈM TIỀN: hàm này chỉ chuyển chữ do người gõ, không đọc bảng chi phí.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-portal-secret",
};

const CRM_URL = Deno.env.get("SUPABASE_URL")!;
const CRM_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const PORTAL_URL = Deno.env.get("PORTAL_URL") ?? "";
const PORTAL_SERVICE_KEY = Deno.env.get("PORTAL_SERVICE_KEY") ?? "";
// Khoá RIÊNG cho cầu nối này, KHÔNG dùng lại PORTAL_CRON_SECRET.
// Lý do: khoá cron kích được cả lượt đồng bộ toàn hệ thống. Đưa nó sang project
// cổng — nơi đối tác đăng nhập — là cho một hệ thống ngoài giữ chìa khoá to hơn
// việc nó cần làm. Lộ khoá này thì kẻ xấu chỉ chèn được tin nhắn, không giật
// được luồng đẩy dữ liệu.
const PORTAL_SECRET = Deno.env.get("PORTAL_TRAO_DOI_SECRET") ?? "";

/** Chặn bơm text nhiều MB qua một endpoint không captcha. */
const MAX_CHU = 2000;
const cat = (s: unknown): string => String(s ?? "").trim().slice(0, MAX_CHU);

interface DongTraoDoi {
  id: number;
  doan_id: number;
  ben_gui: string;
  nguoi_gui: string | null;
  noi_dung: string;
  gui_luc: string;
  tra_loi: string | null;
  nguoi_tra_loi: string | null;
  tra_loi_luc: string | null;
}

/** Đẩy một dòng sang cổng ngay, không đợi lượt đồng bộ định kỳ 8h/16h. */
async function daySangCong(d: DongTraoDoi, crmDoanId: number): Promise<void> {
  if (!PORTAL_URL || !PORTAL_SERVICE_KEY) return;
  const dau = {
    apikey: PORTAL_SERVICE_KEY,
    Authorization: `Bearer ${PORTAL_SERVICE_KEY}`,
    "Content-Type": "application/json",
  };

  // Đoàn phải đã có bên cổng thì mới có chỗ treo dòng này. Chưa có (đoàn mới,
  // chưa tới lượt đẩy) thì thôi — lượt push-portal sau sẽ vá lại.
  const rDoan = await fetch(
    `${PORTAL_URL}/rest/v1/doan?crm_doan_id=eq.${crmDoanId}&select=id,agent_id`,
    { headers: dau },
  );
  if (!rDoan.ok) return;
  const ds = (await rDoan.json()) as Array<{ id: number; agent_id: number }>;
  if (!ds.length) return;

  await fetch(`${PORTAL_URL}/rest/v1/trao_doi?on_conflict=crm_trao_doi_id`, {
    method: "POST",
    headers: { ...dau, Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify([{
      crm_trao_doi_id: d.id,
      agent_id: ds[0].agent_id,
      doan_id: ds[0].id,
      ben_gui: d.ben_gui,
      nguoi_gui: d.nguoi_gui,
      noi_dung: d.noi_dung,
      gui_luc: d.gui_luc,
      tra_loi: d.tra_loi,
      nguoi_tra_loi: d.nguoi_tra_loi,
      tra_loi_luc: d.tra_loi_luc,
    }]),
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  const crm = createClient(CRM_URL, CRM_SERVICE_KEY);

  try {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const tuCong = !!PORTAL_SECRET && req.headers.get("x-portal-secret") === PORTAL_SECRET;

    // ── Chiều 1: đối tác hỏi (cổng chuyển sang) ─────────────────────────────
    if (tuCong) {
      const doanId = Number(body.crm_doan_id);
      const noiDung = cat(body.noi_dung);
      if (!Number.isFinite(doanId) || !noiDung) {
        return json({ error: "Thiếu crm_doan_id hoặc noi_dung" }, 400);
      }

      const { data: doan, error: eDoan } = await crm
        .from("doan").select("id, ten_doan, agent_id, assigned_to").eq("id", doanId).maybeSingle();
      if (eDoan) throw eDoan;
      if (!doan) return json({ error: "Đoàn không tồn tại" }, 404);
      // Đối tác chỉ hỏi được về đoàn của chính mình. Cổng đã kiểm một lần, kiểm
      // lại ở đây vì đây mới là chỗ ghi vào CRM.
      if (body.crm_agent_id != null && Number(body.crm_agent_id) !== doan.agent_id) {
        return json({ error: "Đoàn không thuộc đối tác này" }, 403);
      }

      const { data: dong, error } = await crm
        .from("doan_trao_doi")
        .insert({
          doan_id: doanId,
          agent_id: doan.agent_id,
          ben_gui: "doi_tac",
          nguoi_gui: cat(body.nguoi_gui).slice(0, 200) || null,
          noi_dung: noiDung,
        })
        .select("id, doan_id, ben_gui, nguoi_gui, noi_dung, gui_luc, tra_loi, nguoi_tra_loi, tra_loi_luc")
        .single();
      if (error) throw error;

      // Không có OP phụ trách thì không biết bắn cho ai — nói ra trong kết quả
      // thay vì im lặng, kẻo đối tác gửi mà chẳng ai đọc.
      let daBao = false;
      if (doan.assigned_to) {
        const { error: eTB } = await crm.from("thong_bao").insert({
          user_id: doan.assigned_to,
          loai: "trao_doi_doi_tac",
          tieu_de: "Đối tác gửi yêu cầu mới",
          noi_dung: noiDung.slice(0, 300),
          doan_id: doanId,
          doan_ten: doan.ten_doan,
        });
        daBao = !eTB;
      }

      return json({ id: dong.id, da_bao_op: daBao });
    }

    // ── Chiều 2: OP gửi hoặc trả lời ────────────────────────────────────────
    const auth = req.headers.get("Authorization") ?? "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
    if (!token) return json({ error: "Không có quyền gọi" }, 401);
    const { data: uData, error: uErr } = await crm.auth.getUser(token);
    if (uErr || !uData.user) return json({ error: "Không có quyền gọi" }, 401);
    const userId = uData.user.id;

    const { data: hoSo } = await crm
      .from("user_roles").select("ho_ten").eq("user_id", userId).maybeSingle();
    const tenOP = hoSo?.ho_ten ?? uData.user.email ?? "S8 Travel";

    let dong: DongTraoDoi;

    if (body.id != null) {
      // Trả lời một lượt hỏi đã có.
      const traLoi = cat(body.tra_loi);
      if (!traLoi) return json({ error: "Chưa nhập nội dung trả lời" }, 400);
      const { data, error } = await crm
        .from("doan_trao_doi")
        .update({
          tra_loi: traLoi,
          nguoi_tra_loi: tenOP,
          tra_loi_boi: userId,
          tra_loi_luc: new Date().toISOString(),
        })
        .eq("id", Number(body.id))
        .select("id, doan_id, ben_gui, nguoi_gui, noi_dung, gui_luc, tra_loi, nguoi_tra_loi, tra_loi_luc")
        .single();
      if (error) throw error;
      dong = data as DongTraoDoi;
    } else {
      // S8 chủ động mở một lượt (báo đối tác một việc gì đó).
      const doanId = Number(body.doan_id);
      const noiDung = cat(body.noi_dung);
      if (!Number.isFinite(doanId) || !noiDung) {
        return json({ error: "Thiếu doan_id hoặc noi_dung" }, 400);
      }
      const { data: doan } = await crm
        .from("doan").select("agent_id").eq("id", doanId).maybeSingle();
      const { data, error } = await crm
        .from("doan_trao_doi")
        .insert({
          doan_id: doanId,
          agent_id: doan?.agent_id ?? null,
          ben_gui: "s8",
          nguoi_gui: tenOP,
          noi_dung: noiDung,
        })
        .select("id, doan_id, ben_gui, nguoi_gui, noi_dung, gui_luc, tra_loi, nguoi_tra_loi, tra_loi_luc")
        .single();
      if (error) throw error;
      dong = data as DongTraoDoi;
    }

    // Đẩy sang cổng ngay. Hỏng thì KHÔNG báo lỗi cho OP — dòng đã nằm trong CRM,
    // lượt push-portal sau sẽ đồng bộ lại; báo đỏ chỉ làm OP gõ lại lần nữa.
    let daDay = true;
    try {
      await daySangCong(dong, dong.doan_id);
    } catch {
      daDay = false;
    }

    return json({ id: dong.id, da_day_sang_cong: daDay });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
});
