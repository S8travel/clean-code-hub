// tour-profile.ts — LAYER CẤU HÌNH theo `doan.loai_tour`.
//
// CRM gốc xây cho INBOUND (đón khách vào VN). Outbound (khách VN đi nước ngoài)
// và nội địa dùng CHUNG luồng điều hành; điểm khác chỉ là vài bật/tắt + default.
// Thay vì rải `if (loai_tour === ...)` khắp nơi, gom về 1 object policy duy nhất:
// UI/calc đọc từ đây → dễ thêm type mới, dễ test, không lệch nhau.
//
// Quy tắc: đoàn cũ `loai_tour = null` ⇒ coi như inbound (giữ nguyên hành vi cũ).

export type LoaiTour = "inbound" | "outbound" | "noi_dia" | null | undefined;

/** Loại tiền mặc định cho khoản thu (tip / đầu khách / quỹ VP) khi đoàn chưa chọn. */
export type DefaultCurrency = "NDT" | "VND";

export interface TourProfile {
  /** Khoá chuẩn hoá (null/undefined → 'inbound'). */
  key: "inbound" | "outbound" | "noi_dia";
  label: string;
  /** Hiện phần Visa (booking "Visa & Xe" + section Chi phí Visa). Nội địa: ẩn. */
  showVisa: boolean;
  /** Hiện section "Vé máy bay" ở tab Chi phí. Inbound: ẩn (vé QT do khách tự lo). */
  showVeMayBay: boolean;
  /** Loại tiền mặc định của Tip khi `doan.tip_currency` null. Nội địa: VND. */
  defaultTipCurrency: DefaultCurrency;
}

const INBOUND: TourProfile = {
  key: "inbound",
  label: "Inbound",
  showVisa: true,
  showVeMayBay: false,
  defaultTipCurrency: "NDT",
};

const OUTBOUND: TourProfile = {
  key: "outbound",
  label: "Outbound",
  showVisa: true,
  showVeMayBay: true,
  defaultTipCurrency: "NDT",
};

const NOI_DIA: TourProfile = {
  key: "noi_dia",
  label: "Nội địa",
  showVisa: false,
  showVeMayBay: true,
  defaultTipCurrency: "VND",
};

/**
 * Lấy profile theo loai_tour. Nhận cả `string` thô (DB trả `string | null`) —
 * null/undefined/giá trị lạ → inbound (giữ hành vi cũ cho đoàn cũ).
 */
export function tourProfile(loaiTour: LoaiTour | string): TourProfile {
  switch (loaiTour) {
    case "outbound":
      return OUTBOUND;
    case "noi_dia":
      return NOI_DIA;
    default:
      return INBOUND;
  }
}
