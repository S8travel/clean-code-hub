// Danh mục 5 đầu việc phân cho đoàn + luật "mục nào BẮT BUỘC phải có người".
// Tách khỏi use-phan-viec.ts để test được mà không cần render/Supabase.

export type PvKey = "pv_ks" | "pv_nh_dv" | "pv_xe" | "pv_visa" | "pv_ve_mb";

export const PHAN_VIEC_ITEMS: { key: PvKey; label: string }[] = [
  { key: "pv_ks",    label: "Khách sạn" },
  { key: "pv_nh_dv", label: "Nhà hàng & DV" },
  { key: "pv_xe",    label: "Xe" },
  { key: "pv_visa",  label: "Visa" },
  { key: "pv_ve_mb", label: "Vé máy bay" },
];

export interface PvDefault { key: PvKey; label: string; checked: boolean }

// Default theo loại tour (inbound/outbound/noi_dia) — xem DOAN_PHAN_VIEC.md §1
export function defaultPhanViec(loaiTour: string | null | undefined): PvDefault[] {
  // v = hiện trong modal, c = tích sẵn
  const m: Record<PvKey, { v: boolean; c: boolean }> = {
    pv_ks:    { v: true, c: true },
    pv_nh_dv: { v: true, c: true },
    pv_xe:    { v: true, c: true },
    pv_visa:  { v: true, c: false },
    pv_ve_mb: { v: true, c: false },
  };
  // Vé máy bay LUÔN hiện, KHÔNG tick sẵn (cần thì mới tick) — kể cả inbound
  if (loaiTour === "outbound") m.pv_visa = { v: true, c: true };
  else if (loaiTour === "noi_dia") m.pv_visa = { v: false, c: false };
  return PHAN_VIEC_ITEMS.filter((i) => m[i.key].v).map((i) => ({
    ...i, checked: m[i.key].c,
  }));
}

// Mục BẮT BUỘC phải có người thì đoàn mới coi là "đã phân xong".
//
// Vì sao cần: tour inbound (khách nước ngoài vào VN) thì Visa và Vé máy bay do
// khách/đối tác lo, không ai phân người cho 2 mục đó. Trước đây việc "cần phân
// người" chỉ đóng khi ĐỦ CẢ 5 mục → 28 đoàn đã phân đủ Khách sạn + Nhà hàng & DV
// + Xe vẫn bị báo "chưa phân người" mãi mãi, nhắc mỗi ngày, và OP nhờn thông báo.
// (Đo 05/09/2026: 28/77 đoàn đang treo là báo nhầm đúng kiểu này.)
//
// Luật: mục bắt buộc = mục được tích sẵn theo loại tour.
//   inbound / nội địa : Khách sạn, Nhà hàng & DV, Xe
//   outbound          : thêm Visa
// Mục không bắt buộc vẫn hiện trong bảng — cần thì phân người như thường, chỉ là
// để trống không còn bị tính là thiếu.
export function pvBatBuoc(loaiTour: string | null | undefined): PvKey[] {
  return defaultPhanViec(loaiTour).filter((i) => i.checked).map((i) => i.key);
}

// Đã phân xong chưa? `daChon` trả về người phụ trách (hoặc "không cần") của 1 mục;
// null/undefined/rỗng = còn để trống.
export function daPhanXong(
  loaiTour: string | null | undefined,
  daChon: (k: PvKey) => string | null | undefined,
): boolean {
  return pvBatBuoc(loaiTour).every((k) => {
    const v = daChon(k);
    return v != null && v !== "";
  });
}
