// i18n cho form khảo sát khách hàng CÔNG KHAI (KhaoSatPublicPage).
// KHÔNG dùng hệ t() nội bộ (cookie-based, chỉ vi/zh-TW) — form public cần đổi
// ngôn ngữ tức thời theo lựa chọn khách. Nhúng dict tĩnh 4 ngôn ngữ ở đây.
// Nguồn thuật ngữ chuẩn: zh-TW (thị trường chính Đài Loan).
//
// LƯU Ý: các tiêu chí điểm (ScoreKey/SCORE_KEYS/CRITERIA_LABELS) + vocab dropdown
// KHÔNG còn định nghĩa ở đây — nguồn DUY NHẤT là "@/lib/khao-sat-vocab".
// File này chỉ giữ chrome strings (tiêu đề/nút/màn phụ...) của form.
import type { Lang } from "@/lib/khao-sat-vocab";

export type { Lang };

// Nút chuyển ngôn ngữ — nhãn hiển thị bằng chính ngôn ngữ đó.
export const LANGS: { code: Lang; label: string }[] = [
  { code: "zh-TW", label: "繁中" },
  { code: "zh-CN", label: "简中" },
  { code: "en", label: "EN" },
  { code: "vi", label: "VN" },
];

export interface UIStrings {
  brandTag: string;
  title: string;
  teamNo: string;
  guide: string;
  leader: string;
  guestSection: string;
  name: string;
  genderLabel: string;
  male: string;
  female: string;
  ageLabel: string;
  jobLabel: string;
  phoneLabel: string;
  emailLabel: string;
  ratingSection: string;
  ratingHint: string;
  commentsPlaceholder: string;
  nextTripPlaceholder: string;
  multiHint: string;
  optionalNote: string;
  submit: string;
  submitting: string;
  submitError: string;
  emptyError: string;
  thankTitle: string;
  thankSub: string;
  fillAnother: string;
  invalidTitle: string;
  invalidSub: string;
  loading: string;
}

export const T: Record<Lang, UIStrings> = {
  "zh-TW": {
    brandTag: "感謝您參加 S8 Travel 旅遊",
    title: "旅遊意見調查表",
    teamNo: "團號",
    guide: "導遊",
    leader: "領隊",
    guestSection: "旅客資料",
    name: "旅客姓名",
    genderLabel: "性別",
    male: "男",
    female: "女",
    ageLabel: "年齡",
    jobLabel: "職業",
    phoneLabel: "聯絡電話",
    emailLabel: "電子郵件",
    ratingSection: "各項評分（1-5 分）",
    ratingHint: "點選星星評分，5 分表示最滿意（可留空不評）",
    commentsPlaceholder: "歡迎給我們任何建議或回饋…",
    nextTripPlaceholder: "例如：日本、韓國、歐洲…",
    multiHint: "可複選",
    optionalNote: "所有欄位皆為選填",
    submit: "提交",
    submitting: "提交中…",
    submitError: "提交失敗，請稍後再試。",
    emptyError: "請至少填寫一項評分或資料後再提交。",
    thankTitle: "感謝您的寶貴意見！",
    thankSub: "您的意見將幫助我們持續進步。",
    fillAnother: "填寫另一份",
    invalidTitle: "連結無效或已過期",
    invalidSub: "此意見調查連結無效，或該團已超過調查期限。",
    loading: "載入中…",
  },
  "zh-CN": {
    brandTag: "感谢您参加 S8 Travel 旅游",
    title: "旅游意见调查表",
    teamNo: "团号",
    guide: "导游",
    leader: "领队",
    guestSection: "旅客资料",
    name: "旅客姓名",
    genderLabel: "性别",
    male: "男",
    female: "女",
    ageLabel: "年龄",
    jobLabel: "职业",
    phoneLabel: "联系电话",
    emailLabel: "电子邮箱",
    ratingSection: "各项评分（1-5 分）",
    ratingHint: "点击星星评分，5 分表示最满意（可留空不评）",
    commentsPlaceholder: "欢迎给我们任何建议或反馈…",
    nextTripPlaceholder: "例如：日本、韩国、欧洲…",
    multiHint: "可多选",
    optionalNote: "所有栏位均为选填",
    submit: "提交",
    submitting: "提交中…",
    submitError: "提交失败，请稍后再试。",
    emptyError: "请至少填写一项评分或资料后再提交。",
    thankTitle: "感谢您的宝贵意见！",
    thankSub: "您的意见将帮助我们持续进步。",
    fillAnother: "填写另一份",
    invalidTitle: "链接无效或已过期",
    invalidSub: "此意见调查链接无效，或该团已超过调查期限。",
    loading: "加载中…",
  },
  en: {
    brandTag: "Thank you for travelling with S8 Travel",
    title: "Travel Feedback Survey",
    teamNo: "Tour code",
    guide: "Guide",
    leader: "Tour leader",
    guestSection: "Your information",
    name: "Your name",
    genderLabel: "Gender",
    male: "Male",
    female: "Female",
    ageLabel: "Age",
    jobLabel: "Occupation",
    phoneLabel: "Phone",
    emailLabel: "Email",
    ratingSection: "Ratings (1-5)",
    ratingHint: "Tap the stars to rate — 5 = most satisfied (leave blank to skip)",
    commentsPlaceholder: "Any suggestions or feedback for us…",
    nextTripPlaceholder: "e.g. Japan, Korea, Europe…",
    multiHint: "You can select more than one",
    optionalNote: "All fields are optional",
    submit: "Submit",
    submitting: "Submitting…",
    submitError: "Submission failed. Please try again later.",
    emptyError: "Please rate at least one item or fill in some info before submitting.",
    thankTitle: "Thank you for your feedback!",
    thankSub: "Your feedback helps us keep improving.",
    fillAnother: "Fill another",
    invalidTitle: "Invalid or expired link",
    invalidSub: "This survey link is invalid, or the tour is past the survey window.",
    loading: "Loading…",
  },
  vi: {
    brandTag: "Cảm ơn quý khách đã đồng hành cùng S8 Travel",
    title: "Phiếu khảo sát ý kiến khách hàng",
    teamNo: "Mã đoàn",
    guide: "Hướng dẫn viên",
    leader: "Trưởng đoàn",
    guestSection: "Thông tin khách",
    name: "Họ và tên",
    genderLabel: "Giới tính",
    male: "Nam",
    female: "Nữ",
    ageLabel: "Độ tuổi",
    jobLabel: "Nghề nghiệp",
    phoneLabel: "Số điện thoại",
    emailLabel: "Email",
    ratingSection: "Đánh giá (1-5 sao)",
    ratingHint: "Chạm vào sao để chấm điểm — 5 sao là hài lòng nhất (có thể bỏ trống)",
    commentsPlaceholder: "Mọi góp ý, phản hồi cho chúng tôi…",
    nextTripPlaceholder: "VD: Nhật Bản, Hàn Quốc, Châu Âu…",
    multiHint: "Có thể chọn nhiều mục",
    optionalNote: "Tất cả các mục đều không bắt buộc",
    submit: "Gửi",
    submitting: "Đang gửi…",
    submitError: "Gửi không thành công. Vui lòng thử lại sau.",
    emptyError: "Vui lòng chấm ít nhất một mục hoặc điền thông tin trước khi gửi.",
    thankTitle: "Cảm ơn ý kiến quý báu của quý khách!",
    thankSub: "Ý kiến của quý khách giúp chúng tôi ngày càng hoàn thiện.",
    fillAnother: "Điền phiếu khác",
    invalidTitle: "Link không hợp lệ hoặc đã quá hạn",
    invalidSub: "Đường dẫn khảo sát không hợp lệ, hoặc đoàn đã quá hạn khảo sát.",
    loading: "Đang tải…",
  },
};

// Auto-detect ngôn ngữ từ navigator.language lần đầu vào trang.
// zh-TW là mặc định (thị trường chính Đài Loan).
export function detectLang(nav?: string | null): Lang {
  const s = (nav ?? "").toLowerCase();
  if (s.startsWith("vi")) return "vi";
  if (s.startsWith("en")) return "en";
  if (s.startsWith("zh")) {
    if (s.includes("cn") || s.includes("hans") || s.includes("sg")) return "zh-CN";
    return "zh-TW";
  }
  return "zh-TW";
}
