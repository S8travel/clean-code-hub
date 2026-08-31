// AI tính báo giá — TRÍCH XUẤT lịch trình (ZH/VI) + KHỚP danh mục master.
// Hỗ trợ provider 'claude' (Anthropic) hoặc 'keystone' (gateway Anthropic-compatible).
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.101.0";
import { encodeBase64 } from "https://deno.land/std@0.224.0/encoding/base64.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MODEL = "claude-opus-4-8";

const OUTPUT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["ten_chuong_trinh", "so_ngay", "items"],
  properties: {
    ten_chuong_trinh: { type: "string" },
    so_ngay: { type: "integer" },
    items: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["ngay_so", "loai", "bua_an", "ten_zh", "ten_vi", "match", "ghi_chu", "da_bao_gom"],
        properties: {
          ngay_so: { type: "integer" },
          loai: { type: "string", enum: ["hotel", "meal", "ticket", "transport", "dich_vu"] },
          bua_an: { type: ["string", "null"] },
          // "trua"|"toi"|"ca_hai"|null — vé/hoạt động này đã bao gồm sẵn bữa ăn.
          da_bao_gom: { type: ["string", "null"] },
          ten_zh: { type: "string" },
          ten_vi: { type: "string" },
          match: {
            anyOf: [
              {
                type: "object",
                additionalProperties: false,
                required: ["table", "id", "set_menu_id", "confidence"],
                properties: {
                  table: { type: "string", enum: ["khach_san", "nha_hang", "canh_diem", "nha_xe_loai_xe"] },
                  id: { type: "integer" },
                  set_menu_id: { type: ["integer", "null"] },
                  confidence: { type: "number" },
                },
              },
              { type: "null" },
            ],
          },
          ghi_chu: { type: "string" },
        },
      },
    },
  },
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { itinerary, fileUrl, fileType, provider } = await req.json();
    const hasFile = typeof fileUrl === "string" && fileUrl.trim();
    const hasText = typeof itinerary === "string" && itinerary.trim();
    if (!hasFile && !hasText) {
      return json({ error: "Thiếu lịch trình (file đính kèm hoặc nội dung text)" }, 400);
    }

    // Provider: 'claude' (Anthropic) | 'keystone' (gateway Anthropic-compatible: chỉ đổi BASE URL + key + model).
    const useKeystone = provider === "keystone";
    const apiKey = useKeystone ? Deno.env.get("KEYSTONE_API_KEY") : Deno.env.get("CLAUDE_API_KEY");
    const model = useKeystone ? (Deno.env.get("KEYSTONE_MODEL") ?? "") : MODEL;
    const ksBase = (Deno.env.get("KEYSTONE_BASE_URL") ?? "").replace(/\/+$/, "");
    const endpoint = useKeystone
      ? (ksBase.endsWith("/v1/messages") ? ksBase : `${ksBase}/v1/messages`)
      : "https://api.anthropic.com/v1/messages";
    if (!apiKey) return json({ error: useKeystone ? "Chưa cấu hình KEYSTONE_API_KEY" : "Chưa cấu hình CLAUDE_API_KEY" }, 500);
    if (useKeystone && (!ksBase || !model)) {
      return json({ error: "Chưa cấu hình KEYSTONE_BASE_URL / KEYSTONE_MODEL" }, 500);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SB_SECRET_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const [canhDiemRes, nhaHangRes, khachSanRes, xeRes] = await Promise.all([
      supabase.from("canh_diem").select("id, ten, dia_diem, loai, bao_gom_bua_an").eq("co_phi", true).limit(1000),
      // ten_zh: 124 nhà hàng và 13 khách sạn đã có sẵn tên tiếng Trung trong danh
      // mục. Trước đây câu select bỏ qua cột này, nên model phải tự dịch tên tiếng
      // Trung của đối tác rồi mò trong một danh sách THUẦN TIẾNG VIỆT — đó là chỗ
      // khớp sai nhiều nhất, và nó sai theo thiết kế chứ không phải model kém.
      supabase.from("nha_hang").select("id, ten, ten_zh, dia_diem, set_menu:nha_hang_set_menu(id, ten_set)").limit(1000),
      supabase.from("khach_san").select("id, ten, ten_zh, dia_diem").limit(1000),
      supabase.from("nha_xe_loai_xe").select("id, ten_xe, so_cho, nha_xe:nha_xe_id(ten)").limit(1000),
    ]);

    // FAIL-CLOSED. Trước đây bốn câu này nuốt lỗi bằng `?? []`: danh mục nạp hỏng
    // thì model nhận danh sách RỖNG, khớp trượt sạch, và màn hình vẫn hiện "đã
    // phân tích xong" với mọi dòng 0 đồng. Thà báo hỏng còn hơn ra một bảng giá
    // trông như thật mà thiếu tiền.
    const loiNap = [
      ["cảnh điểm", canhDiemRes.error],
      ["nhà hàng", nhaHangRes.error],
      ["khách sạn", khachSanRes.error],
      ["loại xe", xeRes.error],
    ].filter(([, e]) => e) as Array<[string, { message: string }]>;
    if (loiNap.length) {
      return json({
        error: `Không nạp được danh mục ${loiNap.map(([t]) => t).join(", ")} — `
          + `chưa phân tích được lịch trình. Thử lại sau giây lát. `
          + `(${loiNap.map(([, e]) => e.message).join("; ")})`,
      }, 502);
    }

    const catalog = {
      canh_diem: (canhDiemRes.data ?? []).map((c: Record<string, unknown>) => ({
        id: c.id, ten: c.ten, dia_diem: c.dia_diem, loai: c.loai,
        // Chỉ gửi khi có (đa số vé là vé thường) → giữ prompt gọn.
        ...(c.bao_gom_bua_an ? { bao_gom_bua_an: c.bao_gom_bua_an } : {}),
      })),
      nha_hang: (nhaHangRes.data ?? []).map((n: Record<string, unknown>) => ({
        id: n.id, ten: n.ten, dia_diem: n.dia_diem,
        // Chỉ gửi khi có → giữ prompt gọn, và để model hiểu "thiếu" nghĩa là
        // chưa ai điền, không phải "tên tiếng Trung là chuỗi rỗng".
        ...(n.ten_zh ? { ten_zh: n.ten_zh } : {}),
        set_menu: ((n.set_menu as Array<Record<string, unknown>>) ?? []).map((s) => ({ id: s.id, ten: s.ten_set })),
      })),
      khach_san: (khachSanRes.data ?? []).map((k: Record<string, unknown>) => ({
        id: k.id, ten: k.ten, dia_diem: k.dia_diem,
        ...(k.ten_zh ? { ten_zh: k.ten_zh } : {}),
      })),
      nha_xe_loai_xe: (xeRes.data ?? []).map((x: Record<string, unknown>) => ({
        id: x.id, ten_xe: x.ten_xe, so_cho: x.so_cho,
        nha_xe: (x.nha_xe as Record<string, unknown> | null)?.ten ?? null,
      })),
    };

    const systemPrompt = `Bạn là trợ lý lập báo giá tour cho công ty du lịch Việt Nam, nhận lịch trình tour bằng tiếng Trung hoặc tiếng Việt.

NHIỆM VỤ: trích xuất MỌI hạng mục MẤT TIỀN trong lịch trình, theo từng ngày, và KHỚP mỗi hạng mục với 1 dòng trong DANH MỤC dưới đây (trả về id). TUYỆT ĐỐI KHÔNG bịa ra giá tiền. CHỈ trả về JSON đúng cấu trúc yêu cầu, không kèm chữ nào khác.

PHÂN LOẠI (loai):
- "hotel": khách sạn / resort / du thuyền ngủ đêm → khớp khach_san. Nếu một đêm có NHIỀU khách sạn lựa chọn (vd "A hoặc B", liệt kê theo hạng sao) → tách RIÊNG từng khách sạn thành các item hotel CÙNG ngay_so (MỖI item 1 KS, ten_vi là tên 1 KS); người dùng chọn 1, KHÔNG cộng dồn. Đừng gộp nhiều KS vào 1 dòng.
- "meal": bữa ăn (trưa/tối) ở nhà hàng → khớp nha_hang; nếu nêu rõ set/mức ăn thì chọn set_menu_id gần nhất, không rõ thì null. bua_an="trua"/"toi".
- "ticket": vé tham quan / cảnh điểm → khớp canh_diem
- "transport": xe → khớp nha_xe_loai_xe
- "dich_vu": dịch vụ mất tiền khác → ưu tiên canh_diem; không có thì match=null

"住宿同上" — ĐÊM SAU Ở CÙNG KHÁCH SẠN ĐÊM TRƯỚC, QUAN TRỌNG:
- Lịch trình hay viết đêm 2, 3 gọn lại là 「住宿同上」/「飯店同上」/「酒店同上」/「住宿：同上」/「同前」/「如上」/「như trên」/「khách sạn như ngày trước」 thay vì chép lại tên khách sạn.
- Đó VẪN LÀ MỘT ĐÊM PHÒNG PHẢI TRẢ TIỀN. TUYỆT ĐỐI KHÔNG bỏ qua, KHÔNG coi là "hạng mục không mất tiền".
- Cách làm: tự tra ngược lên đêm gần nhất phía trước có ghi tên khách sạn, rồi trả về item hotel cho ĐÊM NÀY với ĐÚNG tên + match (id khách sạn) của đêm đó — y như chép lại. ten_zh/ten_vi ghi TÊN KHÁCH SẠN thật (không ghi "同上"), ghi_chu ghi "住宿同上 — theo ngày N".
- Ghi rõ ngày nguồn ("同第2天", "同D2") thì lấy theo ngày đó. Đêm nguồn có NHIỀU khách sạn lựa chọn thì chép LẠI ĐỦ các phương án cho đêm này (mỗi phương án 1 item).
- Không tra ra được khách sạn nào phía trước → vẫn trả item hotel cho đêm đó với ten_zh chép nguyên văn dòng lịch trình và match=null, để người nhập tự chọn. Đừng im lặng bỏ dòng.

KHỚP: theo NGHĨA + ĐỊA ĐIỂM, chịu khác ngôn ngữ (西湖=Tây Hồ). Không chắc → match=null + confidence thấp. bua_an chỉ cho meal. Hạng mục không mất tiền (tự do, nghỉ) → BỎ QUA.

GIỮ NGUYÊN MỨC TIỀN GHI TRONG LỊCH TRÌNH — QUAN TRỌNG:
- "ten_zh" phải chép NGUYÊN VĂN dòng trong lịch trình, KỂ CẢ mức tiền ghi kèm: "越式料理 7USD", "中越式料理 8USD", "海鮮餐合菜 8美金", "$10". TUYỆT ĐỐI KHÔNG cắt bỏ con số đó, không làm tròn, không đổi đơn vị.
- Lý do: lịch trình đối tác hay ghi mức ăn chung chung không chỉ định nhà hàng. Không khớp được nhà hàng nào thì hệ thống lấy CHÍNH mức USD trong "ten_zh" để tính đơn giá suất ăn. Cắt mất con số = dòng đó thành 0 đồng, báo giá hụt tiền mà không ai thấy.
- "ten_vi" ngược lại: chỉ TÊN tiếng Việt cho gọn, KHÔNG kèm tiền.
- Chép lại con số CÓ SẴN trong text không phải là bịa giá. Cấm bịa nghĩa là: không có số thì để nguyên không có, đừng tự nghĩ ra.

QUÀ TẶNG VẪN LÀ MỘT KHOẢN CHI — QUAN TRỌNG, ĐỪNG NHẦM VỚI MỤC DƯỚI:
- Lịch trình ghi 贈 / 送 / 加贈 / 特別加贈 / 免費 / "tặng" / "biếu" / "miễn phí" nghĩa là
  KHÁCH không trả riêng khoản đó. Nhưng công ty VẪN TRẢ TIỀN cho nhà cung cấp.
- Vậy nên: hạng mục được tặng PHẢI trích thành một dòng RIÊNG, có khớp danh mục như
  mọi dòng khác. TUYỆT ĐỐI KHÔNG bỏ qua nó, KHÔNG gộp nó vào dòng khác, KHÔNG coi nó
  là "hạng mục không mất tiền".
- Ví dụ đúng: "電瓶車遊36古街(送古街下午茶)" → HAI dòng: vé xe điện 36 phố phường, VÀ
  trà chiều phố cổ. "加贈法國山城百年酒窖(含每人一杯葡萄酒)" → dòng hầm rượu.
- Phân biệt với mục ngay dưới: 贈/送 = khách được tặng nhưng công ty vẫn mua (TÍNH TIỀN).
  含 = đã nằm sẵn trong giá vé đó rồi (KHÔNG tính lần hai). Một dòng có thể có cả hai
  chữ — "加贈...(含每人一杯葡萄酒)" là quà tặng, không phải combo đã gồm bữa ăn.

COMBO ĐÃ GỒM BỮA ĂN (da_bao_gom) — chống tính tiền 2 lần:
- Lịch trình hay ghi vé và bữa ăn thành 2 ý riêng dù bán chung 1 vé combo (vd Bà Nà: cáp treo + buffet trưa; du thuyền 含午餐).
- Nếu text nói rõ vé/hoạt động đó ĐÃ BAO GỒM bữa ăn (含午餐, 含晚餐, 包含午餐, 套票含餐, "đã bao gồm ăn trưa", "vé combo cáp treo + buffet"...) → trên dòng VÉ đó đặt da_bao_gom = "trua" | "toi" | "ca_hai". Các dòng khác để null.
- Dòng canh_diem trong DANH MỤC có sẵn field bao_gom_bua_an nghĩa là vé đó vốn đã gồm bữa ăn — khớp vào đó thì cứ đặt da_bao_gom cho khớp.
- QUAN TRỌNG: VẪN trích ĐẦY ĐỦ dòng bữa ăn như bình thường, TUYỆT ĐỐI KHÔNG tự ý bỏ. Hệ thống sẽ tự trừ. Nhiệm vụ của bạn chỉ là BÁO CỜ.

CẤU TRÚC JSON: { "ten_chuong_trinh": string, "so_ngay": number, "items": [ { "ngay_so": number, "loai": "hotel|meal|ticket|transport|dich_vu", "bua_an": "trua|toi"|null, "da_bao_gom": "trua|toi|ca_hai"|null, "ten_zh": string, "ten_vi": string, "match": { "table": "khach_san|nha_hang|canh_diem|nha_xe_loai_xe", "id": number, "set_menu_id": number|null, "confidence": number } | null, "ghi_chu": string } ] }

DANH MỤC (JSON):
${JSON.stringify(catalog)}`;

    let userContent: unknown;
    if (hasFile) {
      // Chốt chống SSRF: chỉ cho tải file nằm trong Storage của chính dự án.
      // Nhận CẢ 2 dạng — `/public/` (bucket công khai) và `/sign/` (link ký tạm
      // của bucket riêng tư). File lịch trình nằm ở bucket riêng tư nên client
      // ký link trước khi gửi sang đây; thiếu nhánh `/sign/` là luồng AI trích
      // lịch trình từ file chết.
      const objectBase = (Deno.env.get("SUPABASE_URL") ?? "") + "/storage/v1/object/";
      const urlHopLe =
        fileUrl.startsWith(objectBase + "public/") || fileUrl.startsWith(objectBase + "sign/");
      if (!urlHopLe) return json({ error: "fileUrl không hợp lệ" }, 400);
      const fr = await fetch(fileUrl);
      if (!fr.ok) return json({ error: "Không tải được file lịch trình" }, 400);
      const b64 = encodeBase64(await fr.arrayBuffer());
      const ft = String(fileType ?? "");
      if (ft === "application/pdf") {
        userContent = [
          { type: "document", source: { type: "base64", media_type: "application/pdf", data: b64 } },
          { type: "text", text: "Đây là FILE lịch trình tour. Trích xuất + khớp danh mục theo yêu cầu ở system." },
        ];
      } else if (ft.startsWith("image/")) {
        userContent = [
          { type: "image", source: { type: "base64", media_type: ft, data: b64 } },
          { type: "text", text: "Đây là ẢNH lịch trình tour. Trích xuất + khớp danh mục theo yêu cầu ở system." },
        ];
      } else {
        return json({ error: "Định dạng file chưa đọc trực tiếp được (chỉ PDF/ảnh). Hãy dán text." }, 400);
      }
    } else {
      userContent = [{ type: "text", text: `LỊCH TRÌNH:\n\n${itinerary}` }];
    }

    const reqBody: Record<string, unknown> = {
      model,
      max_tokens: 16000,
      system: systemPrompt,
      messages: [{ role: "user", content: userContent }],
    };
    // output_config (structured output) chỉ gửi cho Anthropic chính chủ. Gateway
    // Keystone hay KHÔNG hỗ trợ param này → bỏ, dựa prompt ép JSON + parse khoan dung.
    if (!useKeystone) {
      reqBody.output_config = { effort: "medium", format: { type: "json_schema", schema: OUTPUT_SCHEMA } };
    }

    const claudeRes = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(reqBody),
    });

    if (!claudeRes.ok) {
      const errText = await claudeRes.text();
      console.error(`[bao-gia] ${useKeystone ? "keystone" : "anthropic"} ${claudeRes.status} model=${model}: ${errText.slice(0, 800)}`);
      throw new Error(`LLM error ${claudeRes.status}: ${errText.slice(0, 400)}`);
    }

    const data = await claudeRes.json();
    const textBlock = (data?.content ?? []).find((b: Record<string, unknown>) => b.type === "text");
    if (!textBlock?.text) throw new Error("AI không trả về kết quả");

    // Khoan dung: structured output → JSON thuần; nếu proxy trả JSON kèm chữ → lấy khối {...}.
    const rawText = String(textBlock.text);
    const m = rawText.match(/\{[\s\S]*\}/);
    const ketQua = JSON.parse(m ? m[0] : rawText);
    return json({ ketQua });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[bao-gia] failed: ${message}`);
    return json({ error: message || "Lỗi không xác định" }, 500);
  }
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
