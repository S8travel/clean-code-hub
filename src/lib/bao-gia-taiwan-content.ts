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

/** Bậc giá của bảng báo giá Đài Loan — chênh lệch USD/khách so với bậc LIỀN KỀ,
 *  neo ở 15-19 pax. Chính sách 09/2026. Sửa mức ở đây là đổi cả bảng mặc định. */
export const BAC_GIA_TAIWAN = [
  { label: "6-9 pax",   chenh_usd: 70,  xe: "29人坐" },  // = 10-14 + 70
  { label: "10-14 pax", chenh_usd: 30,  xe: "35人坐" },  // = 15-19 + 30
  { label: "15-19 pax", chenh_usd: 0,   xe: "45人坐" },  // NEO — đúng giá chuẩn 16 pax
  { label: "20-24 pax", chenh_usd: -15, xe: "45人坐" },  // = 15-19 − 15
  { label: "25-29 pax", chenh_usd: -7,  xe: "45人坐" },  // = 20-24 − 7
  { label: "30pax以上",  chenh_usd: -7,  xe: "45人坐" },  // = 25-29 − 7
] as const;

/** Vị trí bậc neo (15-19 pax) trong BAC_GIA_TAIWAN. */
export const BAC_NEO_INDEX = 2;

/** Mốc 4-5 pax — CHỈ bảng chào của chương trình đánh golf.
 *  Khách golf đi theo flight 4 người nên đoàn 4-5 khách là chuyện thường, đi xe
 *  16 chỗ. Tour thường không chào cỡ đoàn này — đừng thêm vào cho đủ bảng.
 *  Giá để TRỐNG (`price_usd: null`), OP tự điền: cơ cấu chi phí đoàn 4-5 khách
 *  khác hẳn nên KHÔNG suy được từ bậc thang neo 16 pax. Điền sẵn 0 thì file gửi
 *  khách in "$0" — thà để trắng. */
export const BAC_4_5_PAX = { label: "4-5pax", xe: "16人坐" } as const;

// Nhận diện chương trình golf qua chữ. Chứa cả bản giản thể lẫn "高球" (viết
// tắt đối tác Đài Loan hay dùng). So sau khi NFKC + hạ chữ thường → bắt được
// cả "ＧＯＬＦ" toàn chiều rộng đối tác dán sang.
const TU_KHOA_GOLF = ["golf", "高爾夫", "高尔夫", "高球"];

const coTuGolf = (s: string): boolean => {
  const t = s.normalize("NFKC").toLowerCase();
  return TU_KHOA_GOLF.some((k) => t.includes(k));
};

/** Báo giá này có đánh golf không?
 *
 *  Soát tên chương trình + các dòng VÉ (`loai === "ticket"`) — green fee nằm ở đó.
 *  CỐ Ý không soát dòng khách sạn: ngủ ở một resort có chữ "golf" trong tên
 *  không có nghĩa là khách ra sân đánh.
 *
 *  Đoán sai thì không chết ai: OP thấy cột thừa trong "Nội dung file xuất" và xoá
 *  bằng nút ✕, hoặc tự thêm lại nếu thiếu. */
export function laChuongTrinhGolf(ketQua: BaoGiaKetQua, items?: BaoGiaItem[]): boolean {
  if (coTuGolf(ketQua.ten_chuong_trinh ?? "")) return true;
  return (items ?? ketQua.items ?? [])
    .filter((i) => i.loai === "ticket")
    .some((i) => coTuGolf(i.mo_ta ?? "") || coTuGolf(i.ten_zh ?? ""));
}

// Tra cỡ xe mặc định theo NHÃN bậc — để báo giá lưu TRƯỚC khi có cột xe vẫn hiện
// được dòng xe mà không phải sửa tay từng bản.
const XE_THEO_NHAN = new Map<string, string>([
  [BAC_4_5_PAX.label, BAC_4_5_PAX.xe],
  ...BAC_GIA_TAIWAN.map((b) => [b.label, b.xe] as [string, string]),
]);

/** Cỡ xe mặc định của một nhãn bậc ("15-19 pax" → "45人坐"). Nhãn lạ → undefined. */
export const xeMacDinhTheoNhan = (label: string): string | undefined =>
  XE_THEO_NHAN.get(label.trim());

// 備註 mặc định: giá chào tính theo đúng khách sạn ghi trong chương trình — mùa
// cao điểm hết phòng cùng hạng phải chuyển khách sạn đắt hơn thì thu bù chênh
// lệch. Nói trước ở mọi bản chào, đừng đợi lúc phát sinh mới báo.
const DEFAULT_NOTES_ZH = [
  "以上價格使用行程寫上的飯店為主",
  "若遇到高峰期間 同等級都沒有房 需要拿到其他酒店價格過高 一定需要補價差的 價差多少會以實際狀況回報正確的價格",
];

// 報價包含 mặc định mỗi báo giá đều có 5 mục này, rồi thêm các cảnh điểm (mất phí)
// của chương trình vào sau.
// 升等車資 — bảng giá chào tính theo xe du lịch thường; đối tác muốn xe bảo mẫu
// hoặc ghế VIP 3 dãy thì bù chênh TIỀN XE CẢ CHIẾC (không chia đầu khách).
// Mức bù gắn đúng cỡ xe in ở dòng ngay dưới nhãn pax — sửa cỡ xe thì soi lại cả đây.
const DEFAULT_XE_NANG_CAP_ZH = [
  "本報價用普通的遊覽車車資估價，若想升等保姆車或VIP三排椅 我們用補一台車資的價差來算，如下：",
  "1. 16人坐改 9人坐保姆車 要補 250USD/台",
  "2. 29人坐改VIP三排椅 要補 300USD/台",
  "3. 35人坐改VIP三排椅 要補 250USD/台",
  "4. 45人坐改 VIP 三排椅 要補 200USD/台",
];

const DEFAULT_INCLUDED_ZH = [
  "全程新款冷氣巴士",
  "華語導遊",
  "景點門票",
  "餐食費用。餐標如行程上。",
  "全程住宿飯店",
];

/** Mốc giá MẶC ĐỊNH của bảng báo giá Đài Loan (chính sách 09/2026):
 *    15-19  → đúng giá chuẩn bậc 16 pax  ← NEO của cả bảng
 *    10-14  → 15-19 + 30      ·  6-9   → 10-14 + 70
 *    20-24  → 15-19 − 15      ·  25-29 → 20-24 − 7   ·  30+ → 25-29 − 7
 *  Cả bảng suy ra từ MỘT mốc chuẩn (16 pax) bằng bậc thang cố định
 *  (BAC_GIA_TAIWAN) — mốc chào khách KHÔNG còn kéo theo bậc 20 pax, cũng không
 *  trôi theo `tier_guests` (OP đổi cỡ đoàn trên bảng chi phí để xem thử thì giá
 *  chào phải đứng yên). Thiếu `case_16` (báo giá cũ) → lùi về giá trung bình.
 *  OP sửa tay trong "Nội dung file xuất" vẫn đè được toàn bộ. */
export function taiwanDefaultBrackets(
  ketQua: BaoGiaKetQua,
  items?: BaoGiaItem[],
): BaoGiaExportBracket[] {
  const p16 = Math.round(ketQua.case_16?.final_price_usd ?? ketQua.gia_trung_binh_usd);
  const gia: number[] = BAC_GIA_TAIWAN.map(() => 0);
  gia[BAC_NEO_INDEX] = p16;
  // Xuống dưới bậc neo (đoàn to dần): mỗi bậc bớt tiếp so với bậc ngay trên.
  for (let i = BAC_NEO_INDEX + 1; i < gia.length; i++) {
    gia[i] = gia[i - 1] + BAC_GIA_TAIWAN[i].chenh_usd;
  }
  // Lên trên bậc neo (đoàn nhỏ dần): mỗi bậc cộng thêm so với bậc ngay dưới.
  for (let i = BAC_NEO_INDEX - 1; i >= 0; i--) {
    gia[i] = gia[i + 1] + BAC_GIA_TAIWAN[i].chenh_usd;
  }
  const out: BaoGiaExportBracket[] = BAC_GIA_TAIWAN.map((b, i) => ({
    label: b.label, price_usd: gia[i], xe: b.xe,
  }));
  // Mốc 4-5 pax đứng ĐẦU bảng (đoàn nhỏ nhất), giá để trống — xem BAC_4_5_PAX.
  return laChuongTrinhGolf(ketQua, items)
    ? [{ label: BAC_4_5_PAX.label, price_usd: null, xe: BAC_4_5_PAX.xe }, ...out]
    : out;
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
    brackets: taiwanDefaultBrackets(ketQua, items),
    // `|| 1` cũ biến tỷ giá 0 thành 單房差 khổng lồ trong file gửi khách — thà ra 0.
    single_supplement_usd: exchangeRate > 0
      ? Math.round(totalHotelVnd / 2 / exchangeRate) + 10
      : 0,
    above_notes: `1. 司機導遊小費：150NTD/PAX*${soNgay}天（有領隊團）、300NTD/PAX*${soNgay}天（無領隊團）\n2. 簽證、機票、私人費用\n3. 越南特殊節日另外報價`,
    included: DEFAULT_INCLUDED_ZH.join("\n"),
    xe_nang_cap: DEFAULT_XE_NANG_CAP_ZH.join("\n"),
    notes: DEFAULT_NOTES_ZH.join("\n"),
  };
}

/** Merge config đã lưu lên mặc định (chỉ field có giá trị mới override). */
export function mergeExportConfig(
  base: Required<BaoGiaExportConfig>,
  cfg?: BaoGiaExportConfig | null,
): Required<BaoGiaExportConfig> {
  const c = cfg ?? {};
  return {
    // Báo giá lưu TRƯỚC khi bảng có dòng cỡ xe → điền cỡ mặc định theo nhãn bậc.
    // `??` chứ không `||`: OP xoá trắng ô xe thì tôn trọng, không dựng lại.
    brackets: c.brackets && c.brackets.length
      ? c.brackets.map((b) => ({ ...b, xe: b.xe ?? xeMacDinhTheoNhan(b.label) }))
      : base.brackets,
    single_supplement_usd: c.single_supplement_usd ?? base.single_supplement_usd,
    above_notes: c.above_notes ?? base.above_notes,
    included: c.included ?? base.included,
    notes: c.notes ?? base.notes,
    xe_nang_cap: c.xe_nang_cap ?? base.xe_nang_cap,
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
  /** 報價不含 — BỎ 09/2026, LUÔN rỗng.
   *  Nội dung trùng hệt `above_notes` nên bản chào in "không bao gồm" hai lần.
   *  Giữ lại Ô RỖNG chứ không xóa hẳn field: cổng đối tác (repo riêng) đọc
   *  `noi_dung.excluded` và ẩn hẳn khối khi mảng rỗng — bỏ field là cổng vỡ.
   *  @deprecated */
  excluded: string[];
  /** 備註 */
  notes: string[];
  /** 升等車資 — bù tiền đổi loại xe. Dòng đầu là câu dẫn, các dòng sau là mức bù. */
  xe_nang_cap: string[];
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
  const cfg = mergeExportConfig(
    taiwanExportDefaults(ketQua, items, exchangeRate),
    ketQua.export_config,
  );

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
    excluded: [],  // BỎ — xem ghi chú trên field
    notes: lines(cfg.notes),
    xe_nang_cap: lines(cfg.xe_nang_cap),
    sights,
  };
}
