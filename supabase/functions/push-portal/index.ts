// Edge function: đồng bộ dữ liệu sang CỔNG ĐỐI TÁC (外網) — project Supabase khác.
//
// Trigger: pg_cron 2 lần/ngày (8h và 16h giờ VN), hoặc client gọi ngay sau khi OP
//          bấm "Gửi khách" trên một báo giá.
// Auth:    verify_jwt=false (xem supabase/config.toml) + MỘT TRONG HAI:
//            - header 'x-portal-secret' khớp env PORTAL_CRON_SECRET (cron), HOẶC
//            - Authorization: Bearer <access token phiên đăng nhập> (client).
//
// LUẬT AI THẤY GÌ:
//   - Báo giá: theo cờ portal_enabled — gửi báo giá là hành động chủ động của OP.
//   - Đoàn: TẤT CẢ đoàn của agent CÓ TÀI KHOẢN cổng, trừ đoàn đã hủy. Không có
//     công tắc từng đoàn: đối tác đăng nhập là thấy đoàn của chính họ, như mở sổ
//     của mình ra xem.
//
// Đây là ĐỒNG BỘ chứ không phải chỉ đẩy: dòng nào không còn được phép hiển thị
// (báo giá tắt chia sẻ, đoàn hủy, agent mất tài khoản) sẽ bị XOÁ khỏi cổng.
//
// KHÔNG ĐẨY: mọi số tiền chi phí, nhà cung cấp, công nợ, trạng thái booking.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { chiaLo, locBaoGia, locDoan, type BoQua } from "../_shared/portal-sync.ts";
import {
  dongBoKSXacNhan,
  dongBoTaiLieu,
  dongBoTraoDoi,
  type DoanDaDay,
  type TaiLenKho,
} from "./dong-bo-them.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-portal-secret",
};

const CRM_URL = Deno.env.get("SUPABASE_URL")!;
const CRM_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const PORTAL_URL = Deno.env.get("PORTAL_URL")!;
const PORTAL_SERVICE_KEY = Deno.env.get("PORTAL_SERVICE_KEY")!;
const PORTAL_CRON_SECRET = Deno.env.get("PORTAL_CRON_SECRET") ?? "";

/** Vài trăm đoàn một lượt: cắt lô để một request quá to không giết cả lần chạy. */
const CO_LO = 100;

async function nguoiGoi(req: Request): Promise<"cron" | "tay" | null> {
  const secret = req.headers.get("x-portal-secret");
  if (PORTAL_CRON_SECRET && secret === PORTAL_CRON_SECRET) return "cron";

  const auth = req.headers.get("Authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token) return null;
  const { data, error } = await createClient(CRM_URL, CRM_SERVICE_KEY).auth.getUser(token);
  return !error && data.user ? "tay" : null;
}

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

  // Log chỉ chứa được 50 dòng bỏ qua, mà "đoàn đã hủy" là chuyện thường ngày và
  // đủ sức chiếm sạch 50 chỗ đó — lỗi thật của giấy tờ / 飯店確認單 / hỏi đáp bị
  // đẩy ra ngoài tầm nhìn (mất một lượt truy vết vì chuyện này 18/08). Xếp lý do
  // bất thường lên trước rồi mới cắt.
  const thuongNgay = (b: BoQua) => (b.ly_do.startsWith("đoàn đã hủy") ? 1 : 0);
  const xepBoQua = (): BoQua[] => [...boQua].sort((a, b) => thuongNgay(a) - thuongNgay(b));

  // Ghi lại MỌI lần chạy: cron.job_run_details chỉ biết request đã được xếp hàng,
  // không biết hàm này chạy ra sao. Không có bảng log thì luồng chết cả tuần cũng
  // không ai hay.
  const ghiLog = async (
    so: { bao_gia: number; doan: number; xoa: number },
    loi: string | null,
    them: Record<string, unknown> = {},
  ) => {
    await crm.from("portal_push_log").insert({
      nguon, so_bao_gia: so.bao_gia, so_doan: so.doan, so_xoa: so.xoa, loi,
      chi_tiet: { bo_qua: xepBoQua().slice(0, 50), so_bo_qua: boQua.length, ...them },
    });
  };

  try {
    const ai = await nguoiGoi(req);
    if (!ai) return json({ error: "Không có quyền gọi" }, 401);
    nguon = ai;
    if (!PORTAL_URL || !PORTAL_SERVICE_KEY) {
      return json({ error: "Thiếu env PORTAL_URL / PORTAL_SERVICE_KEY" }, 500);
    }

    // ── 1) Agent nào ĐÃ CÓ TÀI KHOẢN cổng ────────────────────────────────────
    // Đây là định nghĩa của "đối tác đang dùng cổng". Đẩy đoàn cho agent chưa có
    // tài khoản chỉ tổ phình dữ liệu mà không ai xem.
    // Đọc luôn danh sách đoàn đã có bên cổng: dùng nó để biết "đoàn nào đã từng
    // đẩy", thay cho cột doan.portal_pushed_at bên CRM. Lý do đổi: ghi cột đó cho
    // 187 đoàn một lệnh sinh 187 sự kiện realtime, mỗi sự kiện làm MỌI tab CRM nạp
    // lại danh sách đoàn — 126 request trong 4 giây, cạn pool PostgREST, auth đói
    // theo và OP không đăng nhập được (sự cố 18/08 08:34).
    const rDaCo = await portal("doan?select=crm_doan_id");
    if (!rDaCo.ok) throw new Error(`Đọc doan bên cổng hỏng: ${(await rDaCo.text()).slice(0, 200)}`);
    const daCoBenCong = new Set(
      ((await rDaCo.json()) as Array<{ crm_doan_id: number }>).map((d) => d.crm_doan_id),
    );

    const rAgent = await portal("agent?select=id,crm_agent_id");
    if (!rAgent.ok) throw new Error(`Đọc agent bên cổng hỏng: ${(await rAgent.text()).slice(0, 200)}`);
    const dsAgent = (await rAgent.json()) as Array<{ id: number; crm_agent_id: number | null }>;

    const rUser = await portal("agent_user?select=agent_id&active=is.true");
    if (!rUser.ok) throw new Error(`Đọc agent_user hỏng: ${(await rUser.text()).slice(0, 200)}`);
    const coTaiKhoan = new Set(((await rUser.json()) as Array<{ agent_id: number }>).map((u) => u.agent_id));

    const map = new Map<number, number>();          // crm_agent_id → portal agent.id
    const crmIdCoTaiKhoan: number[] = [];
    for (const a of dsAgent) {
      if (a.crm_agent_id == null) continue;
      map.set(a.crm_agent_id, a.id);
      if (coTaiKhoan.has(a.id)) crmIdCoTaiKhoan.push(a.crm_agent_id);
    }

    // ── 2) Báo giá đang mở chia sẻ ──────────────────────────────────────────
    const { data: bgRaw, error: e1 } = await crm
      .from("bao_gia")
      .select("id, agent_id, ma_bg, tieu_de, ngay_di, ngay_ve, portal_noi_dung")
      .eq("portal_enabled", true);
    if (e1) throw e1;
    const locBG = locBaoGia((bgRaw ?? []) as never);

    // ── 3) TẤT CẢ đoàn của agent có tài khoản (trừ đoàn đã hủy) ─────────────
    let doanRaw: unknown[] = [];
    if (crmIdCoTaiKhoan.length) {
      const { data, error } = await crm
        .from("doan")
        .select("id, agent_id, ten_doan, ngay_di, ngay_ve, so_khach, trang_thai, portal_pushed_at, assigned_to")
        .in("agent_id", crmIdCoTaiKhoan);
      if (error) throw error;
      doanRaw = data ?? [];
    }
    const homNay = new Date().toISOString().slice(0, 10);
    const locDN = locDoan(
      (doanRaw as Array<{ id: number }>).map((d) => ({
        ...d,
        // "Đã từng đẩy" = đã có mặt bên cổng. Nguồn sự thật nằm ở cổng, không phải
        // ở cột bên CRM.
        portal_pushed_at: daCoBenCong.has(d.id) ? "da-co" : null,
      })) as never,
      homNay,
    );
    boQua.push(...locBG.boQua, ...locDN.boQua);

    // ── 4) Đồng bộ danh sách agent (tên có thể đổi bên CRM) ─────────────────
    const agentCanCo = [...new Set([
      ...locBG.canDay.map((b) => b.agent_id as number),
      ...crmIdCoTaiKhoan,
    ])];
    if (agentCanCo.length) {
      const { data: agents, error } = await crm.from("agents").select("id, ten").in("id", agentCanCo);
      if (error) throw error;
      await upsert("agent", "crm_agent_id", (agents ?? []).map((a) => ({ crm_agent_id: a.id, ten: a.ten })));
      // Đọc lại để có id của agent vừa được tạo lần đầu.
      const rMap = await portal(`agent?select=id,crm_agent_id&crm_agent_id=in.(${agentCanCo.join(",")})`);
      if (rMap.ok) {
        for (const a of (await rMap.json()) as Array<{ id: number; crm_agent_id: number }>) {
          map.set(a.crm_agent_id, a.id);
        }
      }
    }

    // ── 5) Đẩy báo giá (bản đã đóng băng, chép nguyên) ──────────────────────
    const now = new Date().toISOString();
    const bgRows = locBG.canDay
      .filter((b) => map.has(b.agent_id as number))
      .map((b) => {
        const snap = b.portal_noi_dung as Record<string, unknown>;
        const r = b as unknown as Record<string, string | null>;
        return {
          crm_bao_gia_id: b.id,
          agent_id: map.get(b.agent_id as number),
          ma_bg: (snap?.ma_bg as string) ?? r.ma_bg ?? `BG${b.id}`,
          tieu_de: (snap?.tieu_de as string) ?? r.tieu_de ?? null,
          chao_ngay: (snap?.chao_ngay as string) ?? null,
          hieu_luc_den: (snap?.hieu_luc_den as string) ?? null,
          ngay_di: r.ngay_di ?? null,
          ngay_ve: r.ngay_ve ?? null,
          noi_dung: snap,
          pushed_at: now,
        };
      });

    let soBaoGia = 0;
    for (const lo of chiaLo(bgRows, CO_LO)) {
      try {
        await upsert("bao_gia", "crm_bao_gia_id", lo);
        soBaoGia += lo.length;
      } catch {
        // Cả lô hỏng vì một dòng → thử lại từng dòng để cứu phần lành và chỉ đích
        // danh dòng hỏng, thay vì để mất trắng cả lô.
        for (const row of lo) {
          try {
            await upsert("bao_gia", "crm_bao_gia_id", [row]);
            soBaoGia++;
          } catch (err) {
            boQua.push({
              loai: "bao_gia", id: row.crm_bao_gia_id,
              ly_do: `cổng từ chối: ${err instanceof Error ? err.message : String(err)}`,
            });
          }
        }
      }
    }

    // ── 6) Đẩy đoàn — dựng chương trình THEO LÔ trong một lần gọi RPC ───────
    let soDoan = 0;
    for (const lo of chiaLo(locDN.canDay, CO_LO)) {
      const ids = lo.map((d) => d.id);
      const { data: nd, error } = await crm.rpc("build_portal_doan_batch", { p_doan_ids: ids });
      if (error) {
        boQua.push({
          loai: "doan", id: ids[0],
          ly_do: `dựng chương trình hỏng cho ${ids.length} đoàn: ${error.message}`,
        });
        continue;
      }
      const theoId = new Map<number, unknown>(
        ((nd ?? []) as Array<{ doan_id: number; noi_dung: unknown }>).map((x) => [x.doan_id, x.noi_dung]),
      );
      const rows = lo.map((d) => {
        const r = d as unknown as Record<string, string | number | null>;
        return {
          crm_doan_id: d.id,
          agent_id: map.get(d.agent_id as number),
          ma_doan: (r.ten_doan as string) ?? null,
          ngay_di: (r.ngay_di as string) ?? null,
          ngay_ve: d.ngay_ve,
          so_khach: (r.so_khach as number) ?? null,
          noi_dung: theoId.get(d.id) ?? {},
          pushed_at: now,
        };
      }).filter((r) => r.agent_id != null);

      try {
        await upsert("doan", "crm_doan_id", rows);
        soDoan += rows.length;
      } catch {
        for (const row of rows) {
          try {
            await upsert("doan", "crm_doan_id", [row]);
            soDoan++;
          } catch (err) {
            boQua.push({
              loai: "doan", id: row.crm_doan_id,
              ly_do: `cổng từ chối: ${err instanceof Error ? err.message : String(err)}`,
            });
          }
        }
      }
    }

    // ── 7) Gỡ khỏi cổng những gì không còn được phép hiển thị ───────────────
    const soXoa = (await xoaDoi("bao_gia", "crm_bao_gia_id", locBG.hienThi))
      + (await xoaDoi("doan", "crm_doan_id", locDN.hienThi));

    // ── 8) Ba bảng con của màn đoàn: giấy tờ, 飯店確認單, hỏi/đáp ────────────
    // Chạy SAU bước gỡ: đoàn vừa bị gỡ khỏi cổng thì bảng con cũng đã cascade đi
    // theo, đọc lại danh sách ở đây là đọc đúng những đoàn còn sống.
    const rDoanCong = await portal("doan?select=id,crm_doan_id,agent_id");
    if (!rDoanCong.ok) throw new Error(`Đọc lại doan bên cổng hỏng: ${(await rDoanCong.text()).slice(0, 200)}`);
    const opTheoDoan = new Map(
      (doanRaw as Array<{ id: number; assigned_to: string | null }>).map((d) => [d.id, d.assigned_to]),
    );
    const doanDaDay: DoanDaDay[] = (
      (await rDoanCong.json()) as Array<{ id: number; crm_doan_id: number; agent_id: number }>
    )
      .filter((d) => locDN.hienThi.includes(d.crm_doan_id))
      .map((d) => ({
        crm_id: d.crm_doan_id,
        cong_id: d.id,
        agent_id: d.agent_id,
        assigned_to: opTheoDoan.get(d.crm_doan_id) ?? null,
      }));

    const taiLenKho: TaiLenKho = async (duongDan, dulieu, kieu) => {
      const r = await fetch(`${PORTAL_URL}/storage/v1/object/tai-lieu/${encodeURI(duongDan)}`, {
        method: "POST",
        headers: {
          apikey: PORTAL_SERVICE_KEY,
          Authorization: `Bearer ${PORTAL_SERVICE_KEY}`,
          "Content-Type": kieu,
          // OP thay file hợp đồng thì đường dẫn giữ nguyên (theo id tài liệu),
          // nên phải cho ghi đè, không thì lần thay thứ hai văng 409.
          "x-upsert": "true",
        },
        body: dulieu,
      });
      if (!r.ok) throw new Error(`(${r.status}) ${(await r.text()).slice(0, 200)}`);
    };

    // Một luồng hỏng không được kéo cả lần chạy xuống: mỗi luồng tự nuốt lỗi vào
    // boQua để OP còn đọc được lý do, thay vì cả lượt đẩy báo đỏ mà không rõ vì sao.
    let soKS = 0, soTaiLieu = { chep: 0, go: 0 }, soTraoDoi = 0;
    for (const lo of chiaLo(doanDaDay, CO_LO)) {
      try {
        soKS += await dongBoKSXacNhan(crm, portal, lo, boQua);
      } catch (err) {
        boQua.push({ loai: "doan", id: lo[0].crm_id, ly_do: `飯店確認單: ${err instanceof Error ? err.message : String(err)}` });
      }
      try {
        const kq = await dongBoTaiLieu(crm, portal, taiLenKho, lo, boQua);
        soTaiLieu = { chep: soTaiLieu.chep + kq.chep, go: soTaiLieu.go + kq.go };
      } catch (err) {
        boQua.push({ loai: "doan", id: lo[0].crm_id, ly_do: `giấy tờ: ${err instanceof Error ? err.message : String(err)}` });
      }
      try {
        soTraoDoi += await dongBoTraoDoi(crm, portal, lo);
      } catch (err) {
        boQua.push({ loai: "doan", id: lo[0].crm_id, ly_do: `hỏi/đáp: ${err instanceof Error ? err.message : String(err)}` });
      }
    }

    // ── 9) Ghi dấu đã đẩy ───────────────────────────────────────────────────
    if (bgRows.length) {
      await crm.from("bao_gia").update({ portal_pushed_at: now })
        .in("id", bgRows.map((r) => r.crm_bao_gia_id));
    }
    // KHÔNG ghi gì vào bảng doan: bảng này nằm trong publication realtime, cập nhật
    // hàng loạt là làm mọi tab CRM nạp lại danh sách đoàn cùng lúc. Trạng thái đã đẩy
    // đọc từ bên cổng (xem daCoBenCong ở trên).

    // Đối tác có báo giá nhưng chưa ai đăng nhập được thì đẩy xong cũng vô nghĩa.
    const thieuTaiKhoan = [...new Set(locBG.canDay.map((b) => b.agent_id as number))]
      .filter((id) => !crmIdCoTaiKhoan.includes(id));

    const ketQua = {
      bao_gia: soBaoGia,
      doan: soDoan,
      xoa: soXoa + soTaiLieu.go,
      ks_xac_nhan: soKS,
      tai_lieu: soTaiLieu.chep,
      trao_doi: soTraoDoi,
      bo_qua: xepBoQua().slice(0, 20),
      agent_thieu_tai_khoan: thieuTaiKhoan.map((id) => ({ crm_agent_id: id, ten: `#${id}` })),
      luc: now,
    };
    await ghiLog({ bao_gia: soBaoGia, doan: soDoan, xoa: soXoa }, null, {
      agent_co_tai_khoan: crmIdCoTaiKhoan,
      agent_thieu_tai_khoan: thieuTaiKhoan,
      ks_xac_nhan: soKS,
      tai_lieu_chep: soTaiLieu.chep,
      tai_lieu_go: soTaiLieu.go,
      trao_doi: soTraoDoi,
    });
    return json(ketQua);
  } catch (err) {
    const loi = err instanceof Error ? err.message : String(err);
    await ghiLog({ bao_gia: 0, doan: 0, xoa: 0 }, loi).catch(() => {});
    return json({ error: loi, bo_qua: xepBoQua().slice(0, 20) }, 500);
  }
});
