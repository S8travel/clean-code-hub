// Edge function: đẩy dữ liệu sang CỔNG ĐỐI TÁC (外網) — project Supabase khác.
//
// Trigger: pg_cron mỗi 30 phút (đẩy lại toàn bộ đang mở cổng — upsert idempotent
//          nên không cần dò xem cái gì đã đổi), hoặc nút "Đẩy ngay" trong CRM.
// Auth:    verify_jwt=false (xem supabase/config.toml) + MỘT TRONG HAI:
//            - header 'x-portal-secret' khớp env PORTAL_CRON_SECRET (cron), HOẶC
//            - Authorization: Bearer <access token phiên đăng nhập> (nút bấm).
// Hành vi: CHỈ ĐỌC dữ liệu CRM + GHI sang project cổng. Không sửa gì của CRM
//          ngoài cột portal_pushed_at.
//
// KHÔNG ĐẨY: bất kỳ số tiền chi phí nào, nhà cung cấp, công nợ, trạng thái booking.
//   - Báo giá: chỉ chép nguyên cột portal_noi_dung — bản đã đóng băng lúc OP bấm
//     "Gửi khách", do lib/portal-payload.ts dựng (có assertNoCostLeak).
//   - Đoàn: gọi RPC build_portal_doan_noi_dung — chỉ chương trình.
// Bên cổng còn một chốt nữa: CHECK khong_co_gia_von() từ chối lưu nếu nội dung
// lỡ mang khoá giá vốn.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-portal-secret",
};

const CRM_URL = Deno.env.get("SUPABASE_URL")!;
const CRM_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const PORTAL_URL = Deno.env.get("PORTAL_URL")!;
const PORTAL_SERVICE_KEY = Deno.env.get("PORTAL_SERVICE_KEY")!;
const PORTAL_CRON_SECRET = Deno.env.get("PORTAL_CRON_SECRET") ?? "";

/** Cron thì đưa secret; người bấm nút thì đưa access token của phiên đăng nhập. */
async function nguoiGoiHopLe(req: Request): Promise<boolean> {
  const secret = req.headers.get("x-portal-secret");
  if (PORTAL_CRON_SECRET && secret === PORTAL_CRON_SECRET) return true;

  const auth = req.headers.get("Authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token) return false;
  const { data, error } = await createClient(CRM_URL, CRM_SERVICE_KEY).auth.getUser(token);
  return !error && !!data.user;
}

/** Gọi PostgREST của project cổng bằng service key (chỉ sống trong edge fn). */
async function portal(path: string, init: RequestInit = {}): Promise<Response> {
  return fetch(`${PORTAL_URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: PORTAL_SERVICE_KEY,
      Authorization: `Bearer ${PORTAL_SERVICE_KEY}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
}

async function upsert(bang: string, onConflict: string, rows: unknown[]): Promise<void> {
  if (!rows.length) return;
  const r = await portal(`${bang}?on_conflict=${onConflict}`, {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify(rows),
  });
  if (!r.ok) throw new Error(`Đẩy ${bang} hỏng (${r.status}): ${(await r.text()).slice(0, 300)}`);
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
    if (!(await nguoiGoiHopLe(req))) return json({ error: "Không có quyền gọi" }, 401);
    if (!PORTAL_URL || !PORTAL_SERVICE_KEY) {
      return json({ error: "Thiếu env PORTAL_URL / PORTAL_SERVICE_KEY" }, 500);
    }

    const crm = createClient(CRM_URL, CRM_SERVICE_KEY);

    // ── 1) Báo giá đang mở cổng (đã có bản đóng băng) ────────────────────────
    const { data: baoGia, error: e1 } = await crm
      .from("bao_gia")
      .select("id, agent_id, ma_bg, tieu_de, ngay_di, ngay_ve, portal_noi_dung")
      .eq("portal_enabled", true)
      .not("portal_noi_dung", "is", null)
      .not("agent_id", "is", null);
    if (e1) throw e1;

    // ── 2) Đoàn đang mở cổng ────────────────────────────────────────────────
    const { data: doan, error: e2 } = await crm
      .from("doan")
      .select("id, agent_id, ten_doan, ngay_di, ngay_ve, so_khach")
      .eq("portal_enabled", true)
      .not("agent_id", "is", null)
      .gte("ngay_ve", new Date(Date.now() - 30 * 86400_000).toISOString().slice(0, 10));
    if (e2) throw e2;

    // ── 3) Bảo đảm agent bên cổng có đủ, lấy map crm_agent_id → portal agent.id ─
    const agentIds = [...new Set([
      ...(baoGia ?? []).map((b) => b.agent_id as number),
      ...(doan ?? []).map((d) => d.agent_id as number),
    ])];
    if (!agentIds.length) return json({ bao_gia: 0, doan: 0, ghi_chu: "Chưa có gì được mở cổng" });

    const { data: agents, error: e3 } = await crm.from("agents").select("id, ten").in("id", agentIds);
    if (e3) throw e3;
    await upsert("agent", "crm_agent_id", (agents ?? []).map((a) => ({
      crm_agent_id: a.id,
      ten: a.ten,
    })));

    const rMap = await portal(`agent?select=id,crm_agent_id&crm_agent_id=in.(${agentIds.join(",")})`);
    if (!rMap.ok) throw new Error(`Đọc agent bên cổng hỏng: ${await rMap.text()}`);
    const map = new Map<number, number>(
      ((await rMap.json()) as Array<{ id: number; crm_agent_id: number }>)
        .map((a) => [a.crm_agent_id, a.id]),
    );

    // ── 4) Đẩy báo giá ──────────────────────────────────────────────────────
    const bgRows = (baoGia ?? [])
      .filter((b) => map.has(b.agent_id as number))
      .map((b) => {
        const snap = b.portal_noi_dung as Record<string, unknown>;
        return {
          crm_bao_gia_id: b.id,
          agent_id: map.get(b.agent_id as number),
          ma_bg: (snap?.ma_bg as string) ?? b.ma_bg ?? `BG${b.id}`,
          tieu_de: b.tieu_de,
          chao_ngay: (snap?.chao_ngay as string) ?? null,
          hieu_luc_den: (snap?.hieu_luc_den as string) ?? null,
          ngay_di: b.ngay_di,
          ngay_ve: b.ngay_ve,
          noi_dung: snap,
          pushed_at: new Date().toISOString(),
        };
      });
    await upsert("bao_gia", "crm_bao_gia_id", bgRows);

    // ── 5) Đẩy đoàn (chương trình dựng lại mỗi lần — lịch đổi thì cổng đổi theo) ─
    const doanRows: unknown[] = [];
    for (const d of doan ?? []) {
      if (!map.has(d.agent_id as number)) continue;
      const { data: nd, error } = await crm.rpc("build_portal_doan_noi_dung", { p_doan_id: d.id });
      if (error) throw error;
      doanRows.push({
        crm_doan_id: d.id,
        agent_id: map.get(d.agent_id as number),
        ma_doan: d.ten_doan,
        ngay_di: d.ngay_di,
        ngay_ve: d.ngay_ve,
        so_khach: d.so_khach,
        noi_dung: nd,
        pushed_at: new Date().toISOString(),
      });
    }
    await upsert("doan", "crm_doan_id", doanRows);

    // ── 6) Ghi dấu đã đẩy ───────────────────────────────────────────────────
    const now = new Date().toISOString();
    if (bgRows.length) {
      await crm.from("bao_gia").update({ portal_pushed_at: now })
        .in("id", bgRows.map((r) => r.crm_bao_gia_id));
    }
    if (doanRows.length) {
      await crm.from("doan").update({ portal_pushed_at: now })
        .in("id", doanRows.map((r) => (r as { crm_doan_id: number }).crm_doan_id));
    }

    return json({ bao_gia: bgRows.length, doan: doanRows.length, luc: now });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
});
