// Nguồn vocab DÙNG CHUNG cho khảo sát khách hàng (phiếu định dạng Đài Loan).
// Dùng cho: form public 4 ngôn ngữ (zh-TW/zh-CN/en/vi) + lưới nội bộ.
// File KHÔNG chứa React — chỉ dữ liệu + helper thuần.

export type Lang = "zh-TW" | "zh-CN" | "en" | "vi";

// 7 tiêu chí điểm sao — đúng thứ tự hiển thị & lưới (khớp phiếu Đài Loan).
export type ScoreKey =
  | "dg_khach_hang"
  | "dg_lich_trinh"
  | "dg_am_thuc"
  | "dg_luu_tru"
  | "dg_xe"
  | "dg_truong_doan"
  | "dg_huong_dan_vien";

export const SCORE_KEYS: ScoreKey[] = [
  "dg_khach_hang",
  "dg_lich_trinh",
  "dg_am_thuc",
  "dg_luu_tru",
  "dg_xe",
  "dg_truong_doan",
  "dg_huong_dan_vien",
];

// Nhãn 4 ngôn ngữ cho 7 tiêu chí.
export const CRITERIA_LABELS: Record<ScoreKey, Record<Lang, string>> = {
  dg_khach_hang: { "zh-TW": "客服評價", "zh-CN": "客服评价", en: "Customer service", vi: "Dịch vụ khách hàng" },
  dg_lich_trinh: { "zh-TW": "行程評價", "zh-CN": "行程评价", en: "Itinerary", vi: "Lịch trình" },
  dg_am_thuc: { "zh-TW": "餐點評價", "zh-CN": "餐点评价", en: "Meals", vi: "Bữa ăn" },
  dg_luu_tru: { "zh-TW": "住宿評價", "zh-CN": "住宿评价", en: "Accommodation", vi: "Lưu trú" },
  dg_xe: { "zh-TW": "巴士評價", "zh-CN": "巴士评价", en: "Bus", vi: "Xe bus" },
  dg_truong_doan: { "zh-TW": "領隊評價", "zh-CN": "领队评价", en: "Tour leader", vi: "Trưởng đoàn" },
  dg_huong_dan_vien: { "zh-TW": "導遊評價", "zh-CN": "导游评价", en: "Guide", vi: "Hướng dẫn viên" },
};

export interface VocabOption {
  code: string;
  labels: Record<Lang, string>;
}

// 營業據點 (SINGLE-select) — lưu CODE.
export const DIEM_BAN_OPTIONS: VocabOption[] = [
  { code: "tpe", labels: { "zh-TW": "台北", "zh-CN": "台北", en: "Taipei", vi: "Đài Bắc" } },
  { code: "tyn", labels: { "zh-TW": "桃園", "zh-CN": "桃园", en: "Taoyuan", vi: "Đào Viên" } },
  { code: "hsz", labels: { "zh-TW": "新竹", "zh-CN": "新竹", en: "Hsinchu", vi: "Tân Trúc" } },
  { code: "txg", labels: { "zh-TW": "台中", "zh-CN": "台中", en: "Taichung", vi: "Đài Trung" } },
  { code: "tnn", labels: { "zh-TW": "台南", "zh-CN": "台南", en: "Tainan", vi: "Đài Nam" } },
  { code: "khh", labels: { "zh-TW": "高雄", "zh-CN": "高雄", en: "Kaohsiung", vi: "Cao Hùng" } },
];

// 獲得資訊 (MULTI-select) — mảng CODE.
export const NGUON_OPTIONS: VocabOption[] = [
  { code: "internet", labels: { "zh-TW": "網路", "zh-CN": "网路", en: "Internet", vi: "Internet" } },
  { code: "newspaper", labels: { "zh-TW": "報紙", "zh-CN": "报纸", en: "Newspaper", vi: "Báo" } },
  { code: "referral", labels: { "zh-TW": "親友介紹", "zh-CN": "亲友介绍", en: "Friend referral", vi: "Người quen giới thiệu" } },
  { code: "line", labels: { "zh-TW": "LINE@", "zh-CN": "LINE@", en: "LINE@", vi: "LINE@" } },
  { code: "facebook", labels: { "zh-TW": "Facebook", "zh-CN": "Facebook", en: "Facebook", vi: "Facebook" } },
  { code: "tv", labels: { "zh-TW": "電視", "zh-CN": "电视", en: "TV", vi: "Truyền hình" } },
  { code: "fair", labels: { "zh-TW": "旅展", "zh-CN": "旅展", en: "Travel fair", vi: "Hội chợ du lịch" } },
  { code: "other", labels: { "zh-TW": "其他", "zh-CN": "其他", en: "Other", vi: "Khác" } },
];

// 購買因素 (MULTI-select) — mảng CODE.
export const YEUTO_OPTIONS: VocabOption[] = [
  { code: "price", labels: { "zh-TW": "價格合理", "zh-CN": "价格合理", en: "Reasonable price", vi: "Giá hợp lý" } },
  { code: "reputation", labels: { "zh-TW": "旅行社口碑", "zh-CN": "旅行社口碑", en: "Agency reputation", vi: "Uy tín công ty" } },
  { code: "referral", labels: { "zh-TW": "親友介紹", "zh-CN": "亲友介绍", en: "Friend referral", vi: "Người quen giới thiệu" } },
  { code: "guide", labels: { "zh-TW": "導遊或領隊", "zh-CN": "导游或领队", en: "Guide or leader", vi: "HDV hoặc trưởng đoàn" } },
  { code: "itinerary", labels: { "zh-TW": "行程內容", "zh-CN": "行程内容", en: "Itinerary", vi: "Nội dung lịch trình" } },
  { code: "other", labels: { "zh-TW": "其他", "zh-CN": "其他", en: "Other", vi: "Khác" } },
];

// Nhãn cột / trường (4 ngôn ngữ).
export const FIELD_LABELS: Record<
  "next_trip" | "y_kien_khac" | "diem_ban" | "nguon_thong_tin" | "yeu_to_mua",
  Record<Lang, string>
> = {
  next_trip: { "zh-TW": "下次旅程", "zh-CN": "下次旅程", en: "Next trip", vi: "Chuyến đi lần sau" },
  y_kien_khac: { "zh-TW": "旅遊建議", "zh-CN": "旅游建议", en: "Travel suggestions", vi: "Góp ý du lịch" },
  diem_ban: { "zh-TW": "營業據點", "zh-CN": "营业据点", en: "Branch", vi: "Điểm bán" },
  nguon_thong_tin: { "zh-TW": "獲得資訊", "zh-CN": "获得资讯", en: "How did you hear about us", vi: "Nguồn biết đến" },
  yeu_to_mua: { "zh-TW": "購買因素", "zh-CN": "购买因素", en: "Why you booked", vi: "Lý do đặt tour" },
};

/** Nhãn theo ngôn ngữ từ map 4 ngôn ngữ (fallback vi rồi zh-TW). */
export function labelForLang(map: Record<Lang, string>, lang: Lang): string {
  return map[lang] ?? map.vi ?? map["zh-TW"];
}

/** Nhãn của 1 option theo code + ngôn ngữ; fallback về chính code nếu không tìm thấy. */
export function optionLabel(opts: VocabOption[], code: string, lang: Lang): string {
  const opt = opts.find((o) => o.code === code);
  return opt ? labelForLang(opt.labels, lang) : code;
}
