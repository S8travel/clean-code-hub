// Luật nhắc việc chưa hoàn thành (phần "Giao việc" trong Việc của tôi).
//
// ⚠️ Logic này có BẢN SAO bằng SQL trong hàm `fn_nhac_cong_viec()`
// (migration 20260910_nhac_cong_viec.sql) — chuông thật do cron bắn, file này
// chỉ để MÀN HÌNH hiển thị nhãn & chặn bấm "Nhắc ngay" quá dày. Sửa bên đây
// thì sửa cả bên đó, kẻo nhãn nói một đằng chuông bắn một nẻo.
//
// Phạm vi: CHỈ việc do người giao tay. Việc hệ thống tự sinh (nguoi_giao =
// SYSTEM_USER_ID hoặc nguon_tao = 'tu_dong') có luồng nhắc riêng, không đụng tới.
//
// MỌI so sánh đều theo NGÀY LỊCH VIỆT NAM, không theo số giờ trôi qua. Lý do:
// cron chỉ chạy một lần mỗi sáng, nên "đủ 24 giờ" so với một mốc cũng do chính
// cron ghi ra sẽ trượt kỳ — hôm sau cron chạy sớm hơn hôm trước vài mili-giây
// là điều kiện hụt, việc bị lùi thêm trọn một ngày.

export type TanSuatNhac = "khong" | "hang_ngay" | "ba_ngay" | "hang_tuan";

export const TAN_SUAT_VALUES: TanSuatNhac[] = ["khong", "hang_ngay", "ba_ngay", "hang_tuan"];

/** Nhãn tiếng Việt cho ô chọn + chỗ hiển thị. */
export const TAN_SUAT_LABEL: Record<TanSuatNhac, string> = {
  khong: "Không nhắc",
  hang_ngay: "Hàng ngày",
  ba_ngay: "3 ngày một lần",
  hang_tuan: "Hàng tuần",
};

/** Số ngày giữa 2 lần nhắc. `khong` = không bao giờ nhắc. */
const SO_NGAY: Record<TanSuatNhac, number | null> = {
  khong: null,
  hang_ngay: 1,
  ba_ngay: 3,
  hang_tuan: 7,
};

const MS_MOT_NGAY = 24 * 60 * 60 * 1000;

/** Việt Nam là GMT+7 quanh năm, không có giờ mùa hè. */
const LECH_VN_MS = 7 * 60 * 60 * 1000;

/** Giờ cron chạy mỗi sáng, tính theo giờ Việt Nam (09:15). */
export const GIO_CRON_VN = 9 + 15 / 60;

/**
 * Số thứ tự ngày lịch Việt Nam của một mốc thời gian.
 * Tự cộng lệch múi giờ thay vì dùng giờ máy, để máy chạy ở múi giờ nào cũng
 * ra cùng kết quả với hàm SQL (bản SQL đổi sang 'Asia/Ho_Chi_Minh' rồi mới ::date).
 */
function soNgayVN(thoiDiem: Date): number {
  return Math.floor((thoiDiem.getTime() + LECH_VN_MS) / MS_MOT_NGAY);
}

/** Số thứ tự ngày của hạn xử lý — cột kiểu date, người dùng nhập theo ngày VN. */
function soNgayCuaHan(hanXuLy: string): number {
  return Math.floor(Date.parse(`${hanXuLy}T00:00:00Z`) / MS_MOT_NGAY);
}

/** Giờ trong ngày theo giờ Việt Nam, dạng thập phân (9.25 = 9h15). */
function gioTrongNgayVN(thoiDiem: Date): number {
  const trongNgay = (thoiDiem.getTime() + LECH_VN_MS) % MS_MOT_NGAY;
  return trongNgay / (60 * 60 * 1000);
}

/** Đổi số thứ tự ngày về Date để màn hình định dạng dd/MM/yyyy. */
function ngayVeDate(soNgay: number): Date {
  // Giữa trưa giờ VN: định dạng ở múi giờ nào cũng ra đúng ngày đó.
  return new Date(soNgay * MS_MOT_NGAY + 12 * 60 * 60 * 1000 - LECH_VN_MS);
}

/** Việc đang chờ người nhận xử lý — chỉ những trạng thái này mới bị nhắc. */
export function dangTreo(trangThai: string): boolean {
  return trangThai === "cho_nhan" || trangThai === "dang_lam";
}

export interface ViecCanNhac {
  trang_thai: string;
  /** 'tay' = người tự bấm "Tạo việc"; 'tu_dong' = hệ thống sinh. */
  nguon_tao?: string;
  do_uu_tien: string | null;
  /** Người giao chọn khi tạo việc. Bỏ trống = để hệ thống suy theo mức ưu tiên. */
  tan_suat_nhac: string | null;
  han_xu_ly: string | null;
  nhac_lan_cuoi: string | null;
  created_at: string;
}

/**
 * Việc này có nằm trong luồng nhắc không.
 * Chỉ việc gõ tay ở màn "Tạo việc" và còn treo mới được nhắc — việc hệ thống
 * sinh (hóa đơn lệch, phân việc đoàn, hủy đoàn) đã có luồng riêng của nó.
 */
export function thuocLuongNhac(viec: Pick<ViecCanNhac, "trang_thai" | "nguon_tao">): boolean {
  return viec.nguon_tao === "tay" && dangTreo(viec.trang_thai);
}

/**
 * Tần suất mặc định khi người giao không chọn gì.
 * Gần như không ai nhập hạn xử lý nên mức ưu tiên là căn cứ duy nhất còn lại.
 */
export function tanSuatMacDinh(doUuTien: string | null | undefined): TanSuatNhac {
  if (doUuTien === "khan_cap" || doUuTien === "cao") return "hang_ngay";
  if (doUuTien === "thap") return "hang_tuan";
  return "ba_ngay";
}

/** Tần suất thực sự áp dụng: người giao chọn thắng, không chọn thì suy theo ưu tiên. */
export function tanSuatHieuLuc(viec: Pick<ViecCanNhac, "tan_suat_nhac" | "do_uu_tien">): TanSuatNhac {
  const chon = viec.tan_suat_nhac;
  if (chon && (TAN_SUAT_VALUES as string[]).includes(chon)) return chon as TanSuatNhac;
  return tanSuatMacDinh(viec.do_uu_tien);
}

/** Việc đã trễ hạn tính theo ngày lịch Việt Nam (đúng ngày hết hạn CHƯA tính là trễ). */
export function quaHan(hanXuLy: string | null, now: Date): boolean {
  if (!hanXuLy) return false;
  return soNgayCuaHan(hanXuLy) < soNgayVN(now);
}

/**
 * Khoảng cách giữa 2 lần nhắc, tính bằng ngày. `null` = không nhắc.
 * Việc đã quá hạn luôn nhắc hàng ngày, bất kể người giao chọn thưa hơn —
 * trừ khi họ tắt hẳn ("Không nhắc"), vì đó là ý muốn rõ ràng.
 */
export function soNgayGiuaNhac(tanSuat: TanSuatNhac, daQuaHan: boolean): number | null {
  if (tanSuat === "khong") return null;
  if (daQuaHan) return 1;
  return SO_NGAY[tanSuat];
}

/** Mốc tính kỳ nhắc: lần nhắc gần nhất, chưa nhắc lần nào thì lấy lúc giao việc. */
function mocTinh(viec: ViecCanNhac): Date {
  return new Date(viec.nhac_lan_cuoi ?? viec.created_at);
}

/**
 * Việc đã tới kỳ nhắc chưa — đúng điều kiện cron dùng để gom chuông:
 * ngày của mốc phải cách hôm nay đủ số ngày của tần suất.
 */
export function denKyNhac(viec: ViecCanNhac, now: Date): boolean {
  if (!dangTreo(viec.trang_thai)) return false;
  const soNgay = soNgayGiuaNhac(tanSuatHieuLuc(viec), quaHan(viec.han_xu_ly, now));
  if (soNgay == null) return false;
  return soNgayVN(mocTinh(viec)) <= soNgayVN(now) - soNgay;
}

/**
 * Ngày chuông kế tiếp thực sự nổ. `null` = không nhắc nữa.
 * Cron chỉ chạy một lần mỗi sáng, nên đây luôn là một ngày trong tương lai
 * (hoặc hôm nay nếu chưa tới giờ chạy) — không bao giờ là ngày đã qua.
 */
export function lanNhacKe(viec: ViecCanNhac, now: Date): Date | null {
  if (!dangTreo(viec.trang_thai)) return null;
  const soNgay = soNgayGiuaNhac(tanSuatHieuLuc(viec), quaHan(viec.han_xu_ly, now));
  if (soNgay == null) return null;

  const homNay = soNgayVN(now);
  const somNhat = soNgayVN(mocTinh(viec)) + soNgay;
  // Đã tới kỳ nhưng cron chưa chạy: chuông nổ ở lượt chạy gần nhất còn lại.
  const chuaChayHomNay = gioTrongNgayVN(now) < GIO_CRON_VN;
  const ngayNhac = Math.max(somNhat, chuaChayHomNay ? homNay : homNay + 1);
  return ngayVeDate(ngayNhac);
}

/**
 * Nút "Nhắc ngay" của người giao: chặn bấm lại trong 24 giờ để một việc không
 * thành hai chuông trong cùng ngày.
 */
export function coTheNhacNgay(viec: Pick<ViecCanNhac, "trang_thai" | "nhac_lan_cuoi">, now: Date): boolean {
  if (!dangTreo(viec.trang_thai)) return false;
  if (!viec.nhac_lan_cuoi) return true;
  return now.getTime() - new Date(viec.nhac_lan_cuoi).getTime() >= MS_MOT_NGAY;
}

/**
 * Số ngày trọn vẹn việc đã nằm im: đếm từ lần nhắc gần nhất, chưa nhắc lần nào
 * thì đếm từ lúc giao. Dùng cho nhãn "treo N ngày" — hầu hết việc không nhập
 * hạn xử lý nên đây là dấu hiệu duy nhất cho thấy việc đang mốc.
 */
export function soNgayTreo(viec: Pick<ViecCanNhac, "created_at">, now: Date): number {
  const ms = now.getTime() - new Date(viec.created_at).getTime();
  return Math.max(0, Math.floor(ms / MS_MOT_NGAY));
}
