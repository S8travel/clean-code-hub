// Edge function: đồng bộ dữ liệu sang CỔNG ĐỐI TÁC (外網) — project Supabase khác.
//
// Trigger: pg_cron mỗi 30 phút, hoặc nút "Đẩy ngay" / bật công tắc trong CRM.
// Auth:    verify_jwt=false (xem supabase/config.toml) + MỘT TRONG HAI:
//            - header 'x-portal-secret' khớp env PORTAL_CRON_SECRET (cron), HOẶC
//            - Authorization: Bearer <access token phiên đăng nhập> (nút bấm).
//
// Đây là ĐỒNG BỘ chứ không phải chỉ đẩy: dòng nào không còn được phép hiển thị
// (tắt công tắc, đoàn hủy, gỡ đối tác) sẽ bị XOÁ khỏi cổng. Trước đây chỉ có
// upsert nên tắt công tắc xong đối tác vẫn xem được — CRM báo "đã ngừng chia sẻ"
// mà thực tế không ngừng gì cả.
//
// KHÔNG ĐẨY: mọi số tiền chi phí, nhà cung cấp, công nợ, trạng thái booking.
//   - Báo giá: chép nguyên cột portal_noi_dung — bản đóng băng do
//     lib/portal-payload.ts dựng (có assertNoCostLeak).
//   - Đoàn: gọi RPC build_portal_doan_noi_dung — chỉ chương trình.
// Bên cổng còn chốt nữa: CHECK khong_co_gia_von() từ chối lưu nếu lỡ có khoá giá vốn.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { locBaoGia, locDoan, type BoQua } from "../_shared/portal-sync.ts";

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
async function nguoiGoi(req: Request): Promise<"cron" | "tay" | null> {
  const secret = req.headers.get("x-portal-secret");
  if (PORTAL_CRON_SECRET && secret === PORTAL_CRON_SECRET) return "cron";

  const auth = req.headers.get("Authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token) return null;
  const { data, error } = await createClient(CRM_URL, CRM_SERVICE_KEY).auth.getUser(token);
  return !error && data.user ? "tay" : null;
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
  if (!r.ok) throw new Error(`(${r.status}) ${(await r.text()).slice(0, 300)}`);
}

/** Gỡ khỏi cổng mọi dòng không còn nằm trong danh sách được phép hiển thị. */
async function xoaDoi(bang: string, cot: string, hienThi: number[]): Promise<number> {
  const dieuKien = hienThi.length ? `${cot}=not.in.(${hienThi.join(",")})` : `${cot}=gt.0`;
  const r = await portal(`${bang}?${dieuKien}&select=id`, {
    method: "DELETE",
    headers: { Prefer: "return=representation" },
  });
  if (!r.ok) throw new Error(`Gỡ khỏi ${bang} hỏng (${r.status}): ${(await r.text()).slice(0, 200)}`);
  return ((await r.json()) as unknown[]).length;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  const crm = createClient(CRM_URL, CRM_SERVICE_KEY);
  let nguon: "cron" | "tay" = "cron";
  const boQua: BoQua[] = [];

  // Ghi lại MỌI lần chạy: cron.job_run_details chỉ biết request đã được xếp hàng,
  // không biết hàm này chạy ra sao. Không có bảng log thì luồng chết cả tuần
  // cũng không ai hay.
  const ghiLog = async (
    so: { bao_gia: number; doan: number; xoa: number },
    loi: string | null,
    them: Record<string, unknown> = {},
  ) => {
    await crm.from("portal_push_log").insert({
      nguon,
      so_bao_gia: so.bao_gia,
      so_doan: so.doan,
      so_xoa: so.xoa,
      loi,
      chi_tiet: { bo_qua: boQua, ...them },
    });
  };

  try {
    const ai = await nguoiGoi(req);
    if (!ai) return json({ error: "Không có quyền gọi" }, 401);
    nguon = ai;
    if (!PORTAL_URL || !PORTAL_SERVICE_KEY) {
      return json({ error: "Thiếu env PORTAL_URL / PORTAL_SERVICE_KEY" }, 500);
    }

    // ── 1) Lấy TOÀN BỘ dòng đang bật cổng (không lọc sẵn ở truy vấn) ─────────
    // Lọc ở truy vấn thì dòng thiếu điều kiện biến mất không dấu vết; đưa hết về
    // rồi để locBaoGia/locDoan phân loại mới nêu được lý do cho OP.
    const { data: bgRaw, error: e1 } = await crm
      .from("bao_gia")
      .select("id, agent_id, ma_bg, tieu_de, ngay_di, ngay_ve, portal_noi_dung")
      .eq("portal_enabled", true);
    if (e1) throw e1;

    const { data: doanRaw, error: e2 } = await crm
      .from("doan")
      .select("id, agent_id, ten_doan, ngay_di, ngay_ve, so_khach, trang_thai")
      .eq("portal_enabled", true);
    if (e2) throw e2;

    const homNay = new Date().toISOString().slice(0, 10);
    const locBG = locBaoGia((bgRaw ?? []) as never);
    const locDN = locDoan((doanRaw ?? []) as never, homNay);
    boQua.push(...locBG.boQua, ...locDN.boQua);

    // ── 2) Đồng bộ danh sách đối tác ────────────────────────────────────────
    const agentIds = [...new Set([
      ...locBG.canDay.map((b) => b.agent_id as number),
      ...locDN.canDay.map((d) => d.agent_id as number),
    ])];

    const map = new Map<number, number>();
    let thieuTaiKhoan: Array<{ crm_agent_id: number; ten: string }> = [];
    if (agentIds.length) {
      const { data: agents, error: e3 } = await crm.from("agents").select("id, ten").in("id", agentIds);
      if (e3) throw e3;
      await upsert("agent", "crm_agent_id", (agents ?? []).map((a) => ({ crm_agent_id: a.id, ten: a.ten })));

      const rMap = await portal(`agent?select=id,crm_agent_id&crm_agent_id=in.(${agentIds.join(",")})`);
      if (!rMap.ok) throw new Error(`Đọc agent bên cổng hỏng: ${(await rMap.text()).slice(0, 200)}`);
      const dsAgent = (await rMap.json()) as Array<{ id: number; crm_agent_id: number }>;
      dsAgent.forEach((a) => map.set(a.crm_agent_id, a.id));

      // Đẩy được KHÔNG có nghĩa đối tác xem được: phải có tài khoản đăng nhập ở
      // cổng nữa. Trả về đây để CRM cảnh báo OP thay vì để họ ngồi đợi.
      if (dsAgent.length) {
        const rU = await portal(
          `agent_user?select=agent_id&active=is.true&agent_id=in.(${dsAgent.map((a) => a.id).join(",")})`,
        );
        if (rU.ok) {
          const coTk = new Set(((await rU.json()) as Array<{ agent_id: number }>).map((u) => u.agent_id));
          thieuTaiKhoan = (agents ?? [])
            .filter((a) => map.has(a.id) && !coTk.has(map.get(a.id)!))
            .map((a) => ({ crm_agent_id: a.id, ten: a.ten }));
        }
      }
    }

    // ── 3) Đẩy báo giá (bản đã đóng băng, chép nguyên) ──────────────────────
    const bgRows = locBG.canDay
      .filter((b) => map.has(b.agent_id as number))
      .map((b) => {
        const snap = b.portal_noi_dung as Record<string, unknown>;
        return {
          crm_bao_gia_id: b.id,
          agent_id: map.get(b.agent_id as number),
          ma_bg: (snap?.ma_bg as string) ?? (b as { ma_bg?: string }).ma_bg ?? `BG${b.id}`,
          tieu_de: (snap?.tieu_de as string) ?? (b as { tieu_de?: string }).tieu_de ?? null,
          chao_ngay: (snap?.chao_ngay as string) ?? null,
          hieu_luc_den: (snap?.hieu_luc_den as string) ?? null,
          ngay_di: (b as { ngay_di?: string }).ngay_di ?? null,
          ngay_ve: (b as { ngay_ve?: string }).ngay_ve ?? null,
          noi_dung: snap,
          pushed_at: new Date().toISOString(),
        };
      });

    let soBaoGia = 0;
    if (bgRows.length) {
      try {
        await upsert("bao_gia", "crm_bao_gia_id", bgRows);
        soBaoGia = bgRows.length;
      } catch {
        // Cả lô hỏng vì một dòng → thử lại từng dòng để cứu phần lành và chỉ
        // đích danh dòng hỏng, thay vì để mất trắng cả lô.
        for (const row of bgRows) {
          try {
            await upsert("bao_gia", "crm_bao_gia_id", [row]);
            soBaoGia++;
          } catch (err) {
            boQua.push({
              loai: "bao_gia",
              id: row.crm_bao_gia_id,
              ly_do: `cổng từ chối: ${err instanceof Error ? err.message : String(err)}`,
            });
          }
        }
      }
    }

    // ── 4) Đẩy đoàn (dựng lại chương trình mỗi lần, từng dòng một) ──────────
    let soDoan = 0;
    for (const d of locDN.canDay) {
      if (!map.has(d.agent_id as number)) continue;
      try {
        const { data: nd, error } = await crm.rpc("build_portal_doan_noi_dung", { p_doan_id: d.id });
        if (error) throw error;
        await upsert("doan", "crm_doan_id", [{
          crm_doan_id: d.id,
          agent_id: map.get(d.agent_id as number),
          ma_doan: (d as { ten_doan?: string }).ten_doan ?? null,
          ngay_di: (d as { ngay_di?: string }).ngay_di ?? null,
          ngay_ve: d.ngay_ve,
          so_khach: (d as { so_khach?: number }).so_khach ?? null,
          noi_dung: nd,
          pushed_at: new Date().toISOString(),
        }]);
        soDoan++;
      } catch (err) {
        boQua.push({
          loai: "doan",
          id: d.id,
          ly_do: `đẩy hỏng: ${err instanceof Error ? err.message : String(err)}`,
        });
      }
    }

    // ── 5) Gỡ khỏi cổng những gì không còn được phép hiển thị ───────────────
    const soXoa = (await xoaDoi("bao_gia", "crm_bao_gia_id", locBG.hienThi))
      + (await xoaDoi("doan", "crm_doan_id", locDN.hienThi));

    // ── 6) Ghi dấu đã đẩy ───────────────────────────────────────────────────
    const now = new Date().toISOString();
    if (soBaoGia) {
      await crm.from("bao_gia").update({ portal_pushed_at: now })
        .in("id", bgRows.map((r) => r.crm_bao_gia_id));
    }
    if (soDoan) {
      await crm.from("doan").update({ portal_pushed_at: now })
        .in("id", locDN.canDay.map((d) => d.id));
    }

    const ketQua = {
      bao_gia: soBaoGia,
      doan: soDoan,
      xoa: soXoa,
      bo_qua: boQua,
      agent_thieu_tai_khoan: thieuTaiKhoan,
      luc: now,
    };
    await ghiLog({ bao_gia: soBaoGia, doan: soDoan, xoa: soXoa }, null, {
      agent_thieu_tai_khoan: thieuTaiKhoan,
    });
    return json(ketQua);
  } catch (err) {
    const loi = err instanceof Error ? err.message : String(err);
    await ghiLog({ bao_gia: 0, doan: 0, xoa: 0 }, loi).catch(() => {});
    return json({ error: loi, bo_qua: boQua }, 500);
  }
});
