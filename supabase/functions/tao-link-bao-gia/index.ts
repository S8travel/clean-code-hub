// Tạo (hoặc làm mới) link xem báo giá cho người không có tài khoản cổng.
//
// Đường đi: CRM bấm "Gửi cho khách" → hàm này chép LỚP CHÀO của mọi bản đã gửi
// sang project cổng (bảng bao_gia_link + bao_gia_link_ban) → trả về URL để dán
// vào mail.
//
// verify_jwt = TRUE: chỉ người đăng nhập CRM mới tạo được link. Hàm này quyết
// định thứ gì được mở ra ngoài internet — để mở là ai cũng tự tạo được một trang
// công khai chứa bảng giá của khách khác.
//
// LỚP VỐN KHÔNG ĐI QUA ĐÂY. Câu select cố ý kê tên từng cột và KHÔNG có
// `noi_dung_von`. Đổi thành `*` là đẩy đơn giá, tỷ giá, lợi nhuận lên một trang
// mở cho cả internet.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { soSanhBanChao, type BanChao } from "../_shared/bao-gia-chao-diff.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const CRM_URL = Deno.env.get("SUPABASE_URL")!;
const CRM_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const PORTAL_URL = Deno.env.get("PORTAL_URL") ?? "";
const PORTAL_SERVICE_KEY = Deno.env.get("PORTAL_SERVICE_KEY") ?? "";
/** Địa chỉ web của cổng (không phải URL Supabase). Đổi sang tên miền riêng thì sửa secret. */
const PORTAL_WEB_URL = Deno.env.get("PORTAL_WEB_URL") ?? "https://s8-agent-portal.vercel.app";

/** Link sống thêm bao lâu sau ngày hết hiệu lực của bản chào mới nhất. */
const NGAY_DEM = 30;
/** Bản chào không ghi hạn thì link vẫn phải chết một ngày nào đó. */
const NGAY_MAC_DINH = 90;

const cat = (v: unknown, n = 200): string => String(v ?? "").trim().slice(0, n);

/** 128 bit ngẫu nhiên dạng hex — đoán mò là bất khả thi. */
function sinhToken(): string {
  const b = new Uint8Array(16);
  crypto.getRandomValues(b);
  return [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
}

function themNgay(goc: Date, n: number): string {
  const d = new Date(goc);
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
    if (!PORTAL_URL || !PORTAL_SERVICE_KEY) {
      return json({ error: "Chưa cấu hình PORTAL_URL / PORTAL_SERVICE_KEY" }, 500);
    }

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const baoGiaId = Number(body.bao_gia_id);
    if (!Number.isFinite(baoGiaId) || baoGiaId <= 0) return json({ error: "Thiếu báo giá" }, 400);

    const crm = createClient(CRM_URL, CRM_SERVICE_KEY);

    const { data: bg, error: eBg } = await crm
      .from("bao_gia")
      .select("id, ma_bg, tieu_de, ngay_di, ngay_ve, lead_id, link_token, link_thu_hoi")
      .eq("id", baoGiaId)
      .maybeSingle();
    if (eBg) return json({ error: eBg.message }, 500);
    if (!bg) return json({ error: "Không tìm thấy báo giá" }, 404);

    // Thu hồi: tắt ở CẢ HAI đầu. Tắt mỗi bên CRM thì trang ngoài kia vẫn mở
    // được — mà đó mới là chỗ khách đang nhìn.
    if (body.thu_hoi === true) {
      const dauTh = {
        apikey: PORTAL_SERVICE_KEY,
        Authorization: `Bearer ${PORTAL_SERVICE_KEY}`,
        "Content-Type": "application/json",
      };
      const r = await fetch(`${PORTAL_URL}/rest/v1/bao_gia_link?crm_bao_gia_id=eq.${bg.id}`, {
        method: "PATCH",
        headers: { ...dauTh, Prefer: "return=minimal" },
        body: JSON.stringify({ thu_hoi: true, cap_nhat_luc: new Date().toISOString() }),
      });
      if (!r.ok) return json({ error: `cổng từ chối thu hồi: ${(await r.text()).slice(0, 200)}` }, 502);
      await crm.from("bao_gia").update({ link_thu_hoi: true }).eq("id", bg.id);
      return json({ thu_hoi: true });
    }

    // Chỉ chia sẻ thứ ĐÃ CHÀO. Báo giá chưa bấm "Chốt và gửi" lần nào thì chưa
    // có con số nào chốt — gửi link lúc đó là gửi một bản nháp ra ngoài.
    const { data: dsBan, error: eBan } = await crm
      .from("bao_gia_phien_ban")
      .select("so_phien_ban, ma_hien_thi, noi_dung_chao, chao_ngay, hieu_luc_den, gui_luc")
      .eq("bao_gia_id", baoGiaId)
      .order("so_phien_ban", { ascending: true });
    if (eBan) return json({ error: eBan.message }, 500);
    if (!dsBan?.length) {
      return json({ error: "Báo giá chưa chào bản nào — bấm 'Chốt và gửi' trước đã" }, 409);
    }

    // Tên khách để hiện lời chào; lấy từ lead gắn báo giá, không bắt gõ tay.
    let tenKhach = cat(body.ten_khach);
    let soKhach: number | null = null;
    if (bg.lead_id) {
      const { data: lead } = await crm
        .from("lead")
        .select("ho_ten, ten_to_chuc, so_nguoi_lon, so_nguoi_em")
        .eq("id", bg.lead_id)
        .maybeSingle();
      if (lead) {
        if (!tenKhach) tenKhach = cat(lead.ten_to_chuc || lead.ho_ten);
        const n = (lead.so_nguoi_lon ?? 0) + (lead.so_nguoi_em ?? 0);
        soKhach = n > 0 ? n : null;
      }
    }

    // Hạn: theo bản chào mới nhất + đệm. Bản không ghi hạn thì vẫn phải có ngày
    // chết — một link sống mãi là một bảng giá cũ trôi nổi ngoài internet.
    const banCuoi = dsBan[dsBan.length - 1] as { hieu_luc_den: string | null };
    const hetHan = cat(body.het_han, 20)
      || (banCuoi.hieu_luc_den
        ? themNgay(new Date(`${banCuoi.hieu_luc_den}T00:00:00Z`), NGAY_DEM)
        : themNgay(new Date(), NGAY_MAC_DINH));

    // Giữ NGUYÊN token cũ khi tạo lại: link đã gửi trong mail trước đó phải còn
    // sống, và khách bấm lại là thấy bản mới nhất. Đây là toàn bộ lý do làm link
    // thay vì đính file.
    const token = bg.link_token || sinhToken();

    const dauCong = {
      apikey: PORTAL_SERVICE_KEY,
      Authorization: `Bearer ${PORTAL_SERVICE_KEY}`,
      "Content-Type": "application/json",
    };

    const rLink = await fetch(`${PORTAL_URL}/rest/v1/bao_gia_link?on_conflict=crm_bao_gia_id`, {
      method: "POST",
      headers: { ...dauCong, Prefer: "resolution=merge-duplicates,return=representation" },
      body: JSON.stringify([{
        token,
        crm_bao_gia_id: bg.id,
        ma_bg: bg.ma_bg ?? `BG${bg.id}`,
        tieu_de: bg.tieu_de,
        ten_khach: tenKhach || null,
        ngay_di: bg.ngay_di,
        ngay_ve: bg.ngay_ve,
        so_khach: soKhach,
        het_han: hetHan,
        thu_hoi: false,
        cap_nhat_luc: new Date().toISOString(),
      }]),
    });
    if (!rLink.ok) {
      return json({ error: `cổng từ chối: ${(await rLink.text()).slice(0, 200)}` }, 502);
    }
    const linkId = ((await rLink.json()) as Array<{ id: number }>)[0]?.id;
    if (!linkId) return json({ error: "Cổng không trả về link" }, 502);

    // Ghi đè toàn bộ danh sách bản: chào thêm bản mới thì link phải có đủ, còn
    // bản bị gỡ chia sẻ bên CRM thì cũng biến mất ngoài đó.
    await fetch(`${PORTAL_URL}/rest/v1/bao_gia_link_ban?link_id=eq.${linkId}`, {
      method: "DELETE",
      headers: { ...dauCong, Prefer: "return=minimal" },
    });
    const rBan = await fetch(`${PORTAL_URL}/rest/v1/bao_gia_link_ban`, {
      method: "POST",
      headers: { ...dauCong, Prefer: "return=minimal" },
      body: JSON.stringify(dsBan.map((b, i) => ({
        link_id: linkId,
        so_phien_ban: b.so_phien_ban,
        ma_hien_thi: b.ma_hien_thi,
        noi_dung: b.noi_dung_chao,
        // "Khác bản trước" tính ngay tại đây bằng đúng hàm dùng cho cổng — CHỈ so
        // lớp chào. Khách xem qua link cần biết bản này đổi gì y như đối tác có
        // tài khoản, nếu không thì họ lại phải mở hai file ra dò bằng mắt.
        thay_doi: i === 0
          ? []
          : soSanhBanChao(
              dsBan[i - 1].noi_dung_chao as BanChao,
              b.noi_dung_chao as BanChao,
            ),
        chao_ngay: b.chao_ngay,
        hieu_luc_den: b.hieu_luc_den,
        gui_luc: b.gui_luc,
      }))),
    });
    if (!rBan.ok) {
      return json({ error: `cổng từ chối bản chào: ${(await rBan.text()).slice(0, 200)}` }, 502);
    }

    await crm
      .from("bao_gia")
      .update({
        link_token: token,
        link_het_han: hetHan,
        link_thu_hoi: false,
        link_tao_luc: new Date().toISOString(),
      })
      .eq("id", bg.id);

    return json({
      url: `${PORTAL_WEB_URL}/xem/${token}`,
      token,
      het_han: hetHan,
      so_ban: dsBan.length,
    });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
});
