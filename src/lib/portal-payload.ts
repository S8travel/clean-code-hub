// Payload đẩy sang CỔNG ĐỐI TÁC (外網) — nơi DUY NHẤT dựng dữ liệu rời khỏi CRM.
//
// Nguyên tắc: cổng đối tác chỉ chứa GIÁ BÁN. Mọi con số giá vốn (đơn giá dịch vụ,
// tiền công ty / HDV, chi phí, lợi nhuận, thông tin nhà cung cấp, số tài khoản) đều
// KHÔNG được rời CRM. `assertNoCostLeak` chặn ở tầng code, có test đi kèm — nếu sau
// này ai thêm field vào snapshot mà lỡ mang theo giá vốn thì test đỏ ngay.
//
// Báo giá: snapshot ĐÓNG BĂNG lúc bấm "Gửi cho đối tác" (bản đã chào không được đổi
// theo giá vốn sửa sau). Đoàn: dựng bằng SQL lúc đẩy (chương trình đổi thì đối tác
// phải thấy bản mới) — xem hàm build_portal_doan_noi_dung trong migration.

import type { BaoGiaKetQua, BaoGiaRow } from "@/hooks/use-bao-gia";
import { taiwanQuoteContent, type TaiwanQuoteContent } from "./bao-gia-taiwan-content";

/** Hiệu lực báo giá mặc định — khớp câu in trên file Word: 報價效期：3 個月. */
export const HIEU_LUC_MAC_DINH_NGAY = 90;

/** Tên field CẤM xuất hiện trong bất kỳ payload nào gửi ra ngoài CRM.
 *  So khớp không phân biệt hoa thường, theo dạng "key có chứa chuỗi này". */
export const PORTAL_FORBIDDEN_KEYS = [
  "don_gia", "thanh_tien", "tien_cong_ty", "tien_hdv", "chi_phi", "gia_von",
  "profit", "loi_nhuan", "vcb_rate", "exchange_rate", "phu_thu", "xe_gia",
  "nha_cung_cap", "so_tai_khoan", "ngan_hang", "dntt", "de_nghi_thanh_toan",
  "cong_no", "payment", "booking_status", "dat_truoc", "foc",
] as const;

// Bỏ hết ký tự không phải chữ/số rồi hạ chữ thường: "NhaCungCapId" và
// "nha_cung_cap_id" cùng ra "nhacungcapid" → một danh sách cấm bắt được cả
// snake_case của DB lẫn camelCase của TS.
const chuanHoaKey = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]/g, "");
const FORBIDDEN_NORM = PORTAL_FORBIDDEN_KEYS.map((k) => ({ raw: k, norm: chuanHoaKey(k) }));

/** Duyệt sâu payload, ném lỗi nếu gặp key thuộc danh sách cấm. Gọi ngay trong
 *  hàm dựng payload → không có đường nào đẩy đi mà bỏ qua được kiểm tra này. */
export function assertNoCostLeak(payload: unknown, path = "$"): void {
  if (Array.isArray(payload)) {
    payload.forEach((v, i) => assertNoCostLeak(v, `${path}[${i}]`));
    return;
  }
  if (payload === null || typeof payload !== "object") return;
  for (const [key, value] of Object.entries(payload)) {
    const norm = chuanHoaKey(key);
    const hit = FORBIDDEN_NORM.find((k) => norm.includes(k.norm))?.raw;
    if (hit) {
      throw new Error(
        `Payload cổng đối tác chứa field cấm "${path}.${key}" (khớp "${hit}") — ` +
        `dữ liệu giá vốn không được rời CRM.`,
      );
    }
    assertNoCostLeak(value, `${path}.${key}`);
  }
}

/** Bản báo giá đóng băng gửi sang cổng. Chỉ giá bán USD/khách + text mô tả. */
export interface PortalBaoGiaSnapshot {
  version: 1;
  ma_bg: string;
  tieu_de: string;
  /** Ngày chào giá (ISO date) — hiện trên đầu bảng giá bên cổng. */
  chao_ngay: string;
  /** Hết hiệu lực (ISO date). */
  hieu_luc_den: string;
  ngay_di: string | null;
  ngay_ve: string | null;
  noi_dung: TaiwanQuoteContent;
}

const isoDate = (d: Date): string => d.toISOString().slice(0, 10);

const maBaoGia = (row: Pick<BaoGiaRow, "id" | "ma_bg">): string =>
  row.ma_bg ?? `BG${row.id.toString().padStart(5, "0")}`;

/** Dựng snapshot báo giá cho cổng đối tác.
 *  `ketQua` phải là bản đã tính lại (liveKetQua) — cùng nguồn với file Word. */
export function buildPortalBaoGiaSnapshot(
  row: BaoGiaRow,
  ketQua: BaoGiaKetQua,
  now: Date = new Date(),
): PortalBaoGiaSnapshot {
  const hieuLuc = row.hieu_luc_ngay ?? HIEU_LUC_MAC_DINH_NGAY;
  const den = new Date(now);
  den.setDate(den.getDate() + hieuLuc);

  const snapshot: PortalBaoGiaSnapshot = {
    version: 1,
    ma_bg: maBaoGia(row),
    tieu_de: row.tieu_de ?? ketQua.ten_chuong_trinh ?? "",
    chao_ngay: isoDate(now),
    hieu_luc_den: isoDate(den),
    ngay_di: row.ngay_di,
    ngay_ve: row.ngay_ve,
    noi_dung: taiwanQuoteContent(ketQua, ketQua.items ?? [], row.exchange_rate ?? 26000),
  };

  assertNoCostLeak(snapshot);
  return snapshot;
}
