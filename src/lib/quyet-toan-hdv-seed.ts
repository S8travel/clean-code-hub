// Giá trị mặc định cho modal "Tạo quyết toán HDV" (form S8 BM02.1-20).
//
// VÌ SAO TỒN TẠI: modal trước đây TỰ CHÉP LẠI phép tính của bảng "Phải thu" và trôi
// khỏi nó theo thời gian. Cụ thể (báo cáo 10/07/2026, đoàn VDA061805JX6):
//   - Tỷ giá tip đọc từ localStorage, BỎ QUA `doan.tip_ty_gia` → OP sửa tỷ giá 800 → 795
//     ở Phải thu, quyết toán vẫn in 800 (26 đoàn dính).
//   - Bỏ qua `tip_so_ngay_override` (12 đoàn), `tip_lump_sum` (2 đoàn),
//     `tip_currency` (tip VND vẫn bị nhân tỷ giá), `tip_nguoi_thu` (công ty thu vẫn
//     cộng vào Tổng thu của HDV).
//
// Nay seed được DỰNG TRÊN `computePhaiThu` — cùng một nguồn với bảng Phải thu — nên
// hai màn hình không thể lệch. Có test khoá bất biến: số tiền seed tính ra phải BẰNG
// đúng số của Phải thu.

import {
  computePhaiThu, TY_GIA_NDT_DEFAULT,
  type PhaiThuDoanInput, type PhaiThuItem,
} from "./phai-thu-calc";

export interface QuyetToanSeed {
  tip: {
    soKhach: number;
    /** Đơn giá theo đơn vị gốc của tip (NDT / VND / …). */
    donGiaNT: number;
    soNgay: number;
    /** 1 khi tip tính bằng VND. */
    tyGia: number;
    /** Tổng tip theo đơn vị gốc khi đoàn dùng tip KHOÁN (tip_lump_sum); null = tính theo công thức. */
    tongNT: number | null;
  };
  /** donGia đã quy về VND (Phải thu cho phép đầu khách có ngoại tệ riêng). */
  dauKhach: { soKhach: number; donGia: number };
  /** donGia đã quy về VND; soLuong luôn 1 (khoản khoán). */
  quyVp: { soLuong: number; donGia: number };
  /** Tổng các khoản "thu thêm tay" (extras) mà HDV thu, quy VND. */
  thuKhac: number;
  /** Số ngày tip (đã tính override) — dùng cho mô tả "19p 5". */
  soNgay: number;
}

const pick = (items: PhaiThuItem[], key: PhaiThuItem["key"]) =>
  items.find((i) => i.key === key);

/** Khoản chỉ vào quyết toán HDV khi HDV là người thu và khoản thực sự được thu. */
const hdvThu = (it: PhaiThuItem | undefined): boolean =>
  !!it && it.show && it.nguoiThu === "hdv";

/**
 * Dựng giá trị mặc định cho modal quyết toán từ cùng nguồn với bảng Phải thu.
 * @param tyGiaFallback tỷ giá NDT→VND khi đoàn chưa chốt `tip_ty_gia` (UI truyền localStorage).
 */
export function buildQuyetToanSeed(
  doan: PhaiThuDoanInput | null | undefined,
  tyGiaFallback: number = TY_GIA_NDT_DEFAULT,
): QuyetToanSeed {
  const { items } = computePhaiThu(doan, tyGiaFallback);

  const tipItem = pick(items, "tip");
  const dkItem = pick(items, "dau_khach");
  const vpItem = pick(items, "quy_vp");

  const tipOn = hdvThu(tipItem);
  const soNgay = tipItem?.soNgay ?? 0;

  // tip_lump_sum: tongGoc ≠ soKhach × soNgay × donGia. Giữ lại tongNT để công thức
  // của quyết toán không tính ra số khác với Phải thu.
  const formulaNT = (tipItem?.soKhach ?? 0) * soNgay * (tipItem?.donGia ?? 0);
  const tongGocNT = tipItem?.tongGoc ?? 0;
  const laKhoan = tipOn && Math.round(tongGocNT) !== Math.round(formulaNT);

  return {
    tip: {
      soKhach: tipOn ? (tipItem?.soKhach ?? 0) : 0,
      donGiaNT: tipItem?.donGia ?? 0,
      soNgay,
      tyGia: tipItem?.tyGia ?? 1,
      tongNT: laKhoan ? tongGocNT : null,
    },
    dauKhach: {
      soKhach: hdvThu(dkItem) ? (dkItem?.soKhach ?? 0) : 0,
      // Quy về VND: Phải thu tính dkVnd = soKhach × donGia × tyGia.
      donGia: (dkItem?.donGia ?? 0) * (dkItem?.tyGia ?? 1),
    },
    quyVp: {
      soLuong: 1,
      donGia: hdvThu(vpItem) ? (vpItem?.donGia ?? 0) * (vpItem?.tyGia ?? 1) : 0,
    },
    thuKhac: items
      .filter((i) => i.key === "extra" && i.show && i.nguoiThu === "hdv")
      .reduce((s, i) => s + i.thanhTienVND, 0),
    soNgay,
  };
}
