// Nội dung báo giá kiểu Đài Loan (報價) — NGUỒN DUY NHẤT.
//
// Dùng chung cho: file Word gửi đối tác (export-bao-gia-word.ts), ô cấu hình
// "Nội dung file xuất" (TaiwanExportSection), và payload đẩy sang cổng đối tác
// (portal-payload.ts). Tách khỏi export-bao-gia-word.ts để trang web của đối tác
// và file Word KHÔNG BAO GIỜ lệch số: cùng gọi taiwanQuoteContent().
//
// File này thuần tính toán — không docx, không DOM, không network.

import type {
  BaoGiaExportBracket,
  BaoGiaExportConfig,
  BaoGiaItem,
  BaoGiaKetQua,
} from "@/hooks/use-bao-gia";

/** Bớt so với giá chuẩn 20 pax (USD/khách) cho các mốc đoàn lớn. */
export const BOT_25PAX_USD = 7;
export const BOT_30PAX_USD = 12;

// 報價包含 mặc định mỗi báo giá đều có 5 mục này, rồi thêm các cảnh điểm (mất phí)
// của chương trình vào sau.
const DEFAULT_INCLUDED_ZH = [
  "全程新款冷氣巴士",
  "華語導遊",
  "景點門票",
  "餐食費用。餐標如行程上。",
  "全程住宿飯店",
];

/** Mốc giá MẶC ĐỊNH của bảng báo giá Đài Loan (chính sách 08/2026):
 *    10-14  → giữ nguyên cách cũ (giá trung bình + 30)
 *    15-19  → đúng giá chuẩn bậc 16 pax
 *    20-24  → đúng giá chuẩn bậc 20 pax
 *    25-29  → giá 20 pax − 7 USD
 *    30+    → giá 20 pax − 12 USD
 *  Lấy `case_16`/`case_20` (luôn tính cho đúng 16 và 20 khách) chứ KHÔNG lấy
 *  theo `tier_guests` — OP đổi cỡ đoàn trên bảng chi phí không được làm trôi
 *  mốc giá chào khách. Thiếu case (báo giá cũ) → lùi về giá trung bình.
 *  OP sửa tay trong "Nội dung file xuất" vẫn đè được toàn bộ. */
export function taiwanDefaultBrackets(ketQua: BaoGiaKetQua): BaoGiaExportBracket[] {
  const base = Math.round(ketQua.gia_trung_binh_usd);
  const p16 = Math.round(ketQua.case_16?.final_price_usd ?? ketQua.gia_trung_binh_usd);
  const p20 = Math.round(ketQua.case_20?.final_price_usd ?? ketQua.gia_trung_binh_usd);
  return [
    { label: "10-14 pax", price_usd: base + 30 },
    { label: "15-19 pax", price_usd: p16 },
    { label: "20-24 pax", price_usd: p20 },
    { label: "25-29 pax", price_usd: p20 - BOT_25PAX_USD },
    { label: "30pax以上", price_usd: p20 - BOT_30PAX_USD },
  ];
}

/** Giá trị MẶC ĐỊNH (tính live) cho cấu hình xuất báo giá Đài Loan. Editor +
 *  export dùng chung; ket_qua.export_config override từng field. */
export function taiwanExportDefaults(
  ketQua: BaoGiaKetQua,
  items: BaoGiaItem[],
  exchangeRate: number,
): Required<BaoGiaExportConfig> {
  const soNgay = ketQua.so_ngay ?? 1;
  const totalHotelVnd = items.filter((i) => i.loai === "hotel").reduce((s, i) => s + (i.don_gia || 0), 0);
  return {
    brackets: taiwanDefaultBrackets(ketQua),
    single_supplement_usd: Math.round(totalHotelVnd / 2 / (exchangeRate || 1)) + 10,
    above_notes: `1. 司機導遊小費：150NTD/PAX*${soNgay}天（有領隊團）、300NTD/PAX*${soNgay}天（無領隊團）\n2. 簽證、機票、私人費用\n3. 越南特殊節日另外報價`,
    included: DEFAULT_INCLUDED_ZH.join("\n"),
    excluded: `司機導遊小費：150NTD/PAX*${soNgay}天（有領隊團）、300NTD/PAX*${soNgay}天（無領隊團）\n簽證、機票、私人費用`,
    notes: "",
  };
}

/** Merge config đã lưu lên mặc định (chỉ field có giá trị mới override). */
export function mergeExportConfig(
  base: Required<BaoGiaExportConfig>,
  cfg?: BaoGiaExportConfig | null,
): Required<BaoGiaExportConfig> {
  const c = cfg ?? {};
  return {
    brackets: c.brackets && c.brackets.length ? c.brackets : base.brackets,
    single_supplement_usd: c.single_supplement_usd ?? base.single_supplement_usd,
    above_notes: c.above_notes ?? base.above_notes,
    included: c.included ?? base.included,
    excluded: c.excluded ?? base.excluded,
    notes: c.notes ?? base.notes,
  };
}

/** 1 dòng khách sạn trong bảng giá (vd ngày 1 — Hotel ABC). */
export interface TaiwanHotelDay {
  ngay: number;
  ten: string;
}

/** Nội dung 報價 đã giải xong — mọi số/chuỗi hiển thị đều nằm ở đây.
 *  KHÔNG chứa giá vốn: chỉ giá BÁN (USD/khách) + text mô tả. */
export interface TaiwanQuoteContent {
  ten_chuong_trinh: string;
  so_ngay: number;
  /** Bậc giá bán (USD/khách) theo khoảng số khách. */
  brackets: BaoGiaExportBracket[];
  /** 單房差 — phụ thu phòng đơn (USD). */
  single_supplement_usd: number;
  /** Khách sạn theo ngày, đã sắp xếp tăng dần. */
  hotel_days: TaiwanHotelDay[];
  /** 以上價格不含 — từng dòng, đã bỏ dòng trống. */
  above_notes: string[];
  /** 報價包含 — đã nối sẵn danh sách cảnh điểm mất phí. */
  included: string[];
  /** 報價不含 */
  excluded: string[];
  /** 備註 */
  notes: string[];
  /** Cảnh điểm mất phí (ưu tiên tên tiếng Trung), đã lọc trùng. */
  sights: string[];
}

const lines = (s: string): string[] => s.split(/\r?\n/).filter((l) => l.trim());

/** Cắt mức tiền khỏi một dòng trưng cho khách, giữ nguyên phần chữ.
 *
 *  Bắt các dạng OP hay gõ: "$700/位", "7USD", "8 美金", "NT$1200", "700元",
 *  "US$10". KHÔNG đụng số đi kèm đơn vị vô hại ("90分鐘", "36古街", "4小時",
 *  "四人一艘") — cắt nhầm mấy cái đó là làm hỏng chính tên dịch vụ.
 *
 *  Thuần + có test: đây là hàng rào cuối trước khi chữ rời CRM. */
export function boMucTien(s: string): string {
  return s
    // số đứng TRƯỚC đơn vị tiền: 7USD · 8 美金 · 700元 · 10 US$
    .replace(/\d+(?:[.,]\d+)?\s*(?:usd|us\$|美金|美元|元|nt\$|ntd|vnd|đ|₫)/gi, "")
    // ký hiệu tiền đứng TRƯỚC số: $700 · US$10 · NT$1200 — kèm phần "/người" nếu có
    .replace(/(?:us\$|nt\$|\$|₫)\s*\d+(?:[.,]\d+)?(?:\s*\/\s*(?:位|人|pax|khách))?/gi, "")
    // dọn rác còn lại: dấu ngoặc rỗng, dấu câu thừa, khoảng trắng đôi
    .replace(/[（(]\s*[)）]/g, "")
    .replace(/\s{2,}/g, " ")
    .replace(/[\s、,，/·]+$/g, "")
    .trim();
}

/** Giải toàn bộ nội dung 報價 từ báo giá: mặc định tính live + phần OP sửa tay
 *  (ket_qua.export_config) đè lên. File Word và cổng đối tác đều gọi hàm này. */
export function taiwanQuoteContent(
  ketQua: BaoGiaKetQua,
  items: BaoGiaItem[],
  exchangeRate: number,
): TaiwanQuoteContent {
  const cfg = mergeExportConfig(taiwanExportDefaults(ketQua, items, exchangeRate), ketQua.export_config);

  const hotel_days = items
    .filter((i) => i.loai === "hotel" && (i.mo_ta || "").trim())
    .map((i) => ({ ngay: i.ngay_so ?? 1, ten: i.mo_ta.trim() }))
    .sort((a, b) => a.ngay - b.ngay);

  // Cảnh điểm mất phí (ưu tiên tên tiếng Trung), lọc trùng — nối thêm vào 報價包含.
  //
  // ten_zh là dòng NGUYÊN VĂN chép từ lịch trình đối tác, và OP được dặn giữ cả
  // mức tiền ghi kèm để hệ thống còn tính được đơn giá ("越式料理 7USD"). Nhưng
  // chuỗi này lại đi thẳng vào ô 報價包含 của file Word VÀ bản đẩy sang cổng —
  // tức mức tiền nội bộ được in cho khách đọc. Đã có trong kho:
  // "越式SPA／按摩 90分鐘$700/位".
  //
  // Cắt mức tiền, GIỮ NGUYÊN phần còn lại: "送古街下午茶", "加贈...紅酒一杯" là
  // điểm bán, khách phải thấy — chỉ con số là thứ không được ra ngoài.
  const sights = [...new Set(
    items
      .filter((i) => i.loai === "ticket")
      .map((i) => boMucTien(i.ten_zh || "") || (i.mo_ta || "").trim())
      .filter(Boolean),
  )];

  return {
    ten_chuong_trinh: ketQua.ten_chuong_trinh || "",
    so_ngay: ketQua.so_ngay ?? 1,
    brackets: cfg.brackets,
    single_supplement_usd: cfg.single_supplement_usd,
    hotel_days,
    above_notes: lines(cfg.above_notes),
    included: [...lines(cfg.included), ...sights],
    excluded: lines(cfg.excluded),
    notes: lines(cfg.notes),
    sights,
  };
}
