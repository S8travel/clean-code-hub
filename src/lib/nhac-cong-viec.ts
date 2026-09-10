// Luật nhắc việc chưa hoàn thành (phần "Giao việc" trong Việc của tôi).
//
// ⚠️ Logic này có BẢN SAO bằng SQL trong hàm `fn_nhac_cong_viec()`
// (migration 20260910_nhac_cong_viec.sql) — chuông thật do cron bắn, file này
// chỉ để MÀN HÌNH hiển thị nhãn & chặn bấm "Nhắc ngay" quá dày. Sửa bên đây
// thì sửa cả bên đó, kẻo nhãn nói một đằng chuông bắn một nẻo.
//
// Phạm vi: CHỈ việc do người giao tay. Việc hệ thống tự sinh (nguoi_giao =
// SYSTEM_USER_ID) có luồng nhắc riêng, không đụng tới.

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

/** Việc đang chờ người nhận xử lý — chỉ những trạng thái này mới bị nhắc. */
export function dangTreo(trangThai: string): boolean {
  return trangThai === "cho_nhan" || trangThai === "dang_lam";
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

/** Tần suất thực sự áp dụng: người giao chọn thắng, không chọn thì suy theo ưu tiên. */
export function tanSuatHieuLuc(viec: Pick<ViecCanNhac, "tan_suat_nhac" | "do_uu_tien">): TanSuatNhac {
  const chon = viec.tan_suat_nhac;
  if (chon && (TAN_SUAT_VALUES as string[]).includes(chon)) return chon as TanSuatNhac;
  return tanSuatMacDinh(viec.do_uu_tien);
}

/** Việc đã trễ hạn tính đến ngày `now` (so theo ngày, không theo giờ). */
export function quaHan(hanXuLy: string | null, now: Date): boolean {
  if (!hanXuLy) return false;
  const homNay = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  return new Date(`${hanXuLy}T00:00:00Z`).getTime() < homNay.getTime();
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
function mocTinh(viec: ViecCanNhac): number {
  return new Date(viec.nhac_lan_cuoi ?? viec.created_at).getTime();
}

/** Thời điểm việc này được nhắc lần kế tiếp. `null` = không nhắc nữa. */
export function lanNhacKe(viec: ViecCanNhac, now: Date): Date | null {
  if (!dangTreo(viec.trang_thai)) return null;
  const soNgay = soNgayGiuaNhac(tanSuatHieuLuc(viec), quaHan(viec.han_xu_ly, now));
  if (soNgay == null) return null;
  return new Date(mocTinh(viec) + soNgay * MS_MOT_NGAY);
}

/** Việc đã tới kỳ nhắc chưa — đúng điều kiện cron dùng để gom chuông. */
export function denKyNhac(viec: ViecCanNhac, now: Date): boolean {
  const ke = lanNhacKe(viec, now);
  return ke != null && ke.getTime() <= now.getTime();
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
