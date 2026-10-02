// Đại lý tải giấy tờ của một đoàn từ cổng đối tác (外網): 分房表 (chia phòng) hoặc
// 合約 (hợp đồng).
//
// Đường đi: trình duyệt đại lý đẩy file lên bucket 'yeu-cau' bên cổng → edge fn
// 'gui-giay-to' (cổng) ký link 10 phút rồi gọi hàm này → CRM tự tải file về kho tài
// liệu đoàn, ghi doan_tai_lieu đúng loại, bắn chuông cho OP phụ trách.
//
// Auth: verify_jwt=false (supabase/config.toml) + header 'x-portal-secret' khớp
// PORTAL_TRAO_DOI_SECRET — cùng khoá của cầu nối hỏi/đáp, KHÔNG phải khoá cron.
//
// MỘT file mỗi loại mỗi đoàn: gửi lại thì THAY dòng cũ (giữ nguyên id) — bên cổng
// upsert theo crm_tai_lieu_id nên trạng thái trên danh sách không nhấp nháy. Hợp đồng
// OP đã tải cũng bị thay bằng bản đại lý gửi sau: bản mới nhất là bản đúng.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { chuanHoaGiayTo, duongDanGiayTo, TEN_LOAI } from "../_shared/giay-to-doi-tac.ts";
import { MAX_CO_CHU } from "../_shared/yeu-cau-doi-tac.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-portal-secret",
};

const CRM_URL = Deno.env.get("SUPABASE_URL")!;
const CRM_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const PORTAL_URL = Deno.env.get("PORTAL_URL") ?? "";
const PORTAL_SECRET = Deno.env.get("PORTAL_TRAO_DOI_SECRET") ?? "";

/** Kho tài liệu đoàn — cùng bucket với useUploadDoanTaiLieu (private, mở bằng link ký). */
const BUCKET = "dntt-documents";
const TIMEOUT_TAI_MS = 20_000;
/**
 * Trần số lần gửi mỗi loại mỗi đoàn trong 1 giờ. Bản cũ KHÔNG xoá khi thay (giữ dấu
 * hợp đồng S8 đã ký trước đó), nên không có trần thì một tài khoản đối tác lặp gửi
 * là đổ đầy kho chứng từ và bắn chuông liên tục.
 */
const TRAN_MOI_GIO = 10;

type Crm = ReturnType<typeof createClient>;

/**
 * Ai nhận chuông: OP phụ trách đoàn (doan.assigned_to) + OP được phân việc NH/DV
 * (cong_viec loai_viec='pv_nh_dv' — phần lớn đoàn chỉ có cái này); không có ai thì
 * rơi về nhóm nhận yêu cầu đối tác (user_roles.nhan_yeu_cau_doi_tac). Không để file
 * đại lý gửi rơi vào im lặng.
 */
async function nguoiNhanChuong(crm: Crm, doanId: number, assignedTo: string | null): Promise<string[]> {
  const ds = new Set<string>();
  if (assignedTo) ds.add(assignedTo);
  const { data: pv } = await crm
    .from("cong_viec").select("nguoi_nhan")
    .eq("doan_id", doanId).eq("loai_viec", "pv_nh_dv").not("nguoi_nhan", "is", null);
  for (const r of (pv ?? []) as Array<{ nguoi_nhan: string | null }>) if (r.nguoi_nhan) ds.add(r.nguoi_nhan);
  if (ds.size) return [...ds];
  const { data: nhom } = await crm
    .from("user_roles").select("user_id, active").eq("nhan_yeu_cau_doi_tac", true);
  for (const r of (nhom ?? []) as Array<{ user_id: string | null; active: boolean | null }>) {
    if (r.user_id && r.active !== false) ds.add(r.user_id);
  }
  return [...ds];
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  const crm = createClient(CRM_URL, CRM_SERVICE_KEY);
  let daTaiLen: string | null = null;

  try {
    if (!PORTAL_SECRET) return json({ error: "Chưa cấu hình PORTAL_TRAO_DOI_SECRET" }, 500);
    if (req.headers.get("x-portal-secret") !== PORTAL_SECRET) {
      return json({ error: "Không có quyền" }, 401);
    }

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const kq = chuanHoaGiayTo(body, PORTAL_URL);
    if (!kq.ok) return json({ error: kq.loi }, 400);
    const gt = kq.data;

    // Đại lý chỉ gửi được cho đoàn của chính mình. Cổng đã kiểm một lần; kiểm lại
    // ở đây vì đây mới là chỗ ghi vào CRM.
    const { data: doan, error: eDoan } = await crm
      .from("doan").select("id, ten_doan, agent_id, assigned_to").eq("id", gt.crm_doan_id).maybeSingle();
    if (eDoan) throw eDoan;
    if (!doan) return json({ error: "Đoàn không tồn tại" }, 404);
    if (doan.agent_id !== gt.crm_agent_id) return json({ error: "Đoàn không thuộc đối tác này" }, 403);

    // ── Trần gửi: đếm file của loại này trong kho, tạo trong 1 giờ qua ─────────
    const { data: daCo } = await crm.storage.from(BUCKET).list(`doan-${doan.id}/${gt.loai}`, {
      limit: 100,
      sortBy: { column: "created_at", order: "desc" },
    });
    const moc = Date.now() - 3600_000;
    const trongGio = (daCo ?? []).filter((o) => o.created_at && Date.parse(o.created_at) > moc).length;
    if (trongGio >= TRAN_MOI_GIO) return json({ error: "Gửi quá nhiều lần, thử lại sau 1 giờ" }, 429);

    // ── Tải file từ link ký của cổng ─────────────────────────────────────────
    const r = await fetch(gt.tep.url, { signal: AbortSignal.timeout(TIMEOUT_TAI_MS) });
    if (!r.ok) return json({ error: "Không tải được file từ cổng" }, 502);
    const bytes = new Uint8Array(await r.arrayBuffer());
    // Đo cỡ thật — `co_chu` chỉ là con số phía cổng khai.
    if (!bytes.byteLength) return json({ error: "File rỗng" }, 400);
    if (bytes.byteLength > MAX_CO_CHU) return json({ error: "File quá 10MB" }, 400);

    const duongDan = duongDanGiayTo(doan.id, gt.loai, gt.tep.ten, Date.now());
    const { error: eUp } = await crm.storage.from(BUCKET).upload(duongDan, bytes, {
      contentType: gt.tep.mime,
      upsert: false,
    });
    if (eUp) throw eUp;
    daTaiLen = duongDan;
    // Cùng dạng URL mà useUploadDoanTaiLieu lưu; nơi mở file tự ký lại vì bucket private.
    const fileUrl = crm.storage.from(BUCKET).getPublicUrl(duongDan).data.publicUrl;

    // ── Ghi doan_tai_lieu: thay dòng cũ nếu có ───────────────────────────────
    // Unique là PARTIAL index nên không upsert onConflict được → select rồi update/insert.
    const payload = {
      doan_id: doan.id,
      loai: gt.loai,
      file_url: fileUrl,
      file_name: gt.tep.ten,
      uploaded_by: null,
      uploaded_at: new Date().toISOString(),
      ten: null,
      mo_ta: `Đối tác gửi từ cổng: ${gt.tai_khoan_ten ?? gt.tai_khoan_email ?? "—"}`,
      // File đại lý tự gửi thì đại lý PHẢI thấy lại: xoá cờ "không cho đối tác xem"
      // OP có thể đã đặt trên dòng cũ — không thì lượt push-portal sau gỡ mất file
      // vừa gửi và trạng thái trên cổng tắt theo (đại lý gửi lại, chuông lại kêu...).
      portal_enabled: null,
    };
    const { data: cu, error: eCu } = await crm
      .from("doan_tai_lieu").select("id").eq("doan_id", doan.id).eq("loai", gt.loai).maybeSingle();
    if (eCu) throw eCu;
    const ghi = cu
      ? crm.from("doan_tai_lieu").update(payload).eq("id", cu.id)
      : crm.from("doan_tai_lieu").insert(payload);
    const { data: dong, error: eGhi } = await ghi.select("id, file_name, uploaded_at").single();
    if (eGhi) throw eGhi;
    daTaiLen = null; // đã có dòng trỏ tới, không còn là rác

    // ── Chuông ───────────────────────────────────────────────────────────────
    // Không ai nhận được thì nói ra trong kết quả thay vì im lặng.
    let daBao = false;
    const nhan = await nguoiNhanChuong(crm, doan.id, doan.assigned_to);
    if (nhan.length) {
      const nguoiGui = gt.tai_khoan_ten ?? gt.tai_khoan_email;
      const { error: eTB } = await crm.from("thong_bao").insert(nhan.map((userId) => ({
        user_id: userId,
        loai: "giay_to_doi_tac",
        tieu_de: `Đối tác gửi file ${TEN_LOAI[gt.loai]}`,
        noi_dung: `${gt.tep.ten}${nguoiGui ? ` — ${nguoiGui}` : ""}`.slice(0, 300),
        doan_id: doan.id,
        doan_ten: doan.ten_doan,
      })));
      daBao = !eTB;
    }

    return json({
      tai_lieu_id: dong.id,
      file_name: dong.file_name,
      uploaded_at: dong.uploaded_at,
      da_bao_op: daBao,
    });
  } catch (err) {
    // File đã lên kho mà không ghi được dòng nào trỏ tới → dọn, không để rác.
    if (daTaiLen) await crm.storage.from(BUCKET).remove([daTaiLen]).catch(() => undefined);
    return json({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
});
