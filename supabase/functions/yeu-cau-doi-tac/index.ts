// 詢價 — nhận yêu cầu báo giá do CỔNG ĐỐI TÁC (外網) chuyển sang, tạo lead bên CRM.
//
// Auth: verify_jwt=false (xem supabase/config.toml) + header 'x-portal-secret'
// khớp PORTAL_TRAO_DOI_SECRET. Đối tác KHÔNG gọi thẳng vào đây: họ gọi edge
// function 'gui-yeu-cau' bên cổng, hàm đó mới giữ khoá này.
//
// VÌ SAO KHÔNG ĐỂ CỔNG GỌI THẲNG RPC: RPC create_lead_from_agent_portal trước đây
// mở cho anon, mà khoá publishable của CRM nằm sẵn trong bundle web — ai cũng gọi
// tạo lead được với agent_id tuỳ chọn. Nay RPC chỉ còn service_role, và service_role
// chỉ sống ở đây, trong hạ tầng CRM.
//
// File đính kèm: cổng đưa sang LINK KÝ hạn ngắn, hàm này tải về rồi chép vào bucket
// riêng 'lead-files' của CRM. Không lưu link của cổng: link ký hết hạn sau vài phút,
// mà sales có thể mở lại yêu cầu sau vài tuần.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  chuanHoaYeuCau,
  duongDanLeadFile,
  mimeTuDuoi,
  stampTuNgay,
  MAX_CO_CHU,
  type TepGui,
} from "../_shared/yeu-cau-doi-tac.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-portal-secret",
};

const CRM_URL = Deno.env.get("SUPABASE_URL")!;
const CRM_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const PORTAL_URL = Deno.env.get("PORTAL_URL") ?? "";
/** Cùng khoá với cầu nối hỏi/đáp: hai đường này cùng mức rủi ro (chèn được chữ
 *  và file vào CRM), và cùng do một hàm bên cổng gọi. KHÔNG dùng PORTAL_CRON_SECRET
 *  — khoá cron kích được cả lượt đồng bộ toàn hệ thống. */
const PORTAL_SECRET = Deno.env.get("PORTAL_TRAO_DOI_SECRET") ?? "";

const BUCKET = "lead-files";
/** Tải file của người ngoài: có trần thời gian, không treo cả hàm vì một link chậm. */
const TIMEOUT_TAI_MS = 20_000;

interface DaChep {
  ten: string;
  file_name: string;
  duong_dan: string;
  co_chu: number;
  mime: string | null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  const crm = createClient(CRM_URL, CRM_SERVICE_KEY);
  const daUpload: string[] = [];

  try {
    if (!PORTAL_SECRET) return json({ error: "Chưa cấu hình PORTAL_TRAO_DOI_SECRET" }, 500);
    if (req.headers.get("x-portal-secret") !== PORTAL_SECRET) {
      return json({ error: "Không có quyền" }, 401);
    }

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const kq = chuanHoaYeuCau(body, PORTAL_URL);
    if (!kq.ok) return json({ error: kq.loi }, 400);
    const yc = kq.data;

    // Đối tác phải có thật bên CRM. RPC cũng kiểm lại, nhưng kiểm ở đây thì không
    // tải file về rồi mới biết là gửi nhầm.
    const { data: agent } = await crm
      .from("agents").select("id, ten").eq("id", yc.crm_agent_id).maybeSingle();
    if (!agent) return json({ error: "Đối tác không hợp lệ" }, 404);

    // ── Chép file đính kèm sang kho CRM ──────────────────────────────────────
    // Một file hỏng KHÔNG làm hỏng cả yêu cầu: bỏ file đó, ghi vào kết quả trả về
    // để bên cổng biết mà nói lại với đối tác.
    const stamp = stampTuNgay(new Date());
    const daChep: DaChep[] = [];
    const tepHong: string[] = [];

    for (const [i, tep] of yc.tep.entries()) {
      const chep = await chepMotFile(crm, yc.crm_agent_id, stamp, i, tep);
      if (chep) {
        daChep.push(chep);
        daUpload.push(chep.duong_dan);
      } else {
        tepHong.push(tep.ten);
      }
    }

    // ── Tạo lead ─────────────────────────────────────────────────────────────
    const { data: rpcData, error } = await crm.rpc("create_lead_from_agent_portal", {
      payload: {
        agent_id: yc.crm_agent_id,
        tai_khoan_email: yc.tai_khoan_email,
        tai_khoan_ten: yc.tai_khoan_ten,
        tieu_de: yc.tieu_de,
        noi_dung: yc.noi_dung,
        so_khach: yc.so_khach,
        ngay_di_du_kien: yc.ngay_di_du_kien,
        ngay_ve_du_kien: yc.ngay_ve_du_kien,
        nguoi_lien_he: yc.nguoi_lien_he,
        email: yc.email,
        so_dien_thoai: yc.so_dien_thoai,
        // Ghi lại chênh lệch để tab bên CRM nói được "đối tác gửi 2 file, lấy được 1".
        so_tep_gui: yc.so_tep_gui ?? yc.tep.length,
        // Gộp cả file cổng loại từ đầu lẫn file CRM tải hỏng — một danh sách duy
        // nhất để đi xin lại.
        tep_hong: [...yc.tep_hong_cong, ...tepHong],
        tep: daChep.map((f) => ({
          ten: f.ten,
          file_name: f.file_name,
          duong_dan: f.duong_dan,
          co_chu: f.co_chu,
          mime: f.mime,
        })),
      },
    });

    if (error) {
      // Lead không tạo được thì file vừa chép thành rác không ai trỏ tới — dọn ngay.
      await donRac(crm, daUpload);
      return json({ error: error.message }, 400);
    }

    // RPC trả jsonb {lead_id, yeu_cau_id, so_tep} — yeu_cau_id là bản gốc hiện ở
    // tab "Yêu cầu báo giá" bên CRM.
    const ket = (rpcData ?? {}) as { lead_id?: number; yeu_cau_id?: number };
    if (!ket.lead_id) {
      await donRac(crm, daUpload);
      return json({ error: "Không tạo được yêu cầu bên CRM" }, 500);
    }
    return json({
      lead_id: ket.lead_id,
      yeu_cau_id: ket.yeu_cau_id ?? null,
      so_tep: daChep.length,
      tep_hong: [...yc.tep_hong_cong, ...tepHong],
    });
  } catch (err) {
    await donRac(crm, daUpload);
    return json({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
});

type Crm = ReturnType<typeof createClient>;

/** Tải một file từ link ký của cổng rồi chép vào bucket 'lead-files'. */
async function chepMotFile(
  crm: Crm,
  crmAgentId: number,
  stamp: string,
  chiSo: number,
  tep: TepGui,
): Promise<DaChep | null> {
  try {
    const r = await fetch(tep.url, { signal: AbortSignal.timeout(TIMEOUT_TAI_MS) });
    if (!r.ok) return null;

    const bytes = new Uint8Array(await r.arrayBuffer());
    // Kiểm lại cỡ thật: `co_chu` là con số phía cổng khai, không phải thứ đo được.
    if (!bytes.byteLength || bytes.byteLength > MAX_CO_CHU) return null;

    // Ưu tiên kiểu cổng khai, rồi đuôi tên, rồi mới tới header. Bucket không nhận
    // 'application/octet-stream' nên để header quyết là file rớt im lặng.
    const mime = tep.mime ?? mimeTuDuoi(tep.ten) ?? r.headers.get("content-type")?.split(";")[0] ?? null;
    const duongDan = duongDanLeadFile(crmAgentId, stamp, chiSo, tep.ten);

    const { error } = await crm.storage.from(BUCKET).upload(duongDan, bytes, {
      contentType: mime ?? "application/octet-stream",
      upsert: false,
    });
    if (error) return null;

    return {
      ten: tep.ten,
      file_name: tep.ten,
      duong_dan: duongDan,
      co_chu: bytes.byteLength,
      mime,
    };
  } catch {
    return null;
  }
}

async function donRac(crm: Crm, duongDan: string[]): Promise<void> {
  if (!duongDan.length) return;
  await crm.storage.from(BUCKET).remove(duongDan).catch(() => undefined);
}
