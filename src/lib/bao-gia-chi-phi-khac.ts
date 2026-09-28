// Chi phí khác của báo giá — các khoản thu thêm NGOÀI dịch vụ theo ngày (khách
// sạn, ăn, vé, xe) và ngoài 3 định mức công HDV · bảo hiểm · tip: nón lá, ảnh kỷ
// niệm, bia nước ngọt, nước suối, công tác phí tài xế…
//
// Lưu ở ket_qua.chi_phi_khac, cùng luật với công HDV / tip:
//   - null / vắng → hệ thống TỰ ĐẶT theo tuyến: đoàn miền Trung / miền Nam nhận
//     bộ mẫu của vùng đó (chạm cả hai → gộp), tuyến khác không có dòng nào.
//   - mảng        → OP đã chốt cho báo giá này (mảng rỗng = đã xoá hết). Lịch
//     trình đổi tuyến sau đó cũng không đụng tới.
// Sửa BẤT KỲ dòng nào là chốt CẢ danh sách: sửa một dòng mà các dòng còn lại vẫn
// trôi theo tuyến thì không ai đoán được bảng sẽ ra sao.
//
// File này không tự dò tuyến: nơi gọi dò (vungChiPhiKhac ở
// components/bao-gia/detail/helpers.ts) rồi truyền danh sách vùng vào.

import type { BaoGiaItem, BaoGiaKetQua, ChiPhiKhacItem } from "@/hooks/use-bao-gia";
import type { ChiPhiKhacTinh } from "./bao-gia-calc";

/**
 * Bộ mẫu đoàn MIỀN TRUNG — chép từ bảng tính giá phòng điều hành đang dùng.
 * Hai dòng của bảng đó KHÔNG lặp lại ở đây vì đã có ô riêng dưới bảng chi phí:
 * 行程保險 (bảo hiểm / khách) và 導遊出差費 (công HDV / ngày, miền Trung 600k).
 */
export const MAU_CHI_PHI_KHAC_MIEN_TRUNG: readonly Readonly<ChiPhiKhacItem>[] = [
  { ten: "Nón lá", ten_zh: "斗笠", don_gia: 20_000, tinh_theo: "khach" },
  { ten: "Ảnh kỷ niệm", ten_zh: "紀念照片", don_gia: 15_000, tinh_theo: "khach" },
  // Mỗi khách một lon mỗi bữa → N chạy theo số bữa ăn trong bảng.
  { ten: "Bia / nước ngọt", ten_zh: "啤酒汽水", don_gia: 12_000, tinh_theo: "khach", n_theo: "bua" },
  { ten: "Nước suối", ten_zh: "礦泉水", don_gia: 100_000, tinh_theo: "doan", n_theo: "ngay" },
  { ten: "Công tác phí tài xế", ten_zh: "司機出差費", don_gia: 300_000, tinh_theo: "doan", n_theo: "ngay" },
  // Chỉ phát sinh khi đoàn ngủ ngoài Đà Nẵng (Hội An, Huế…) — bảng gốc để trống
  // N. Mặc định 0 đêm: dòng vẫn hiện để nhắc, có thì OP gõ số đêm.
  {
    ten: "Phòng tài xế + HDV (đoàn không ở Đà Nẵng)", ten_zh: "司機導遊住宿（團體不住峴港）",
    don_gia: 200_000, tinh_theo: "doan", so_lan: 0,
  },
  // Bảng gốc chưa ghi giá — để 0, ô giá tô cam cho OP điền.
  { ten: "Dừa", ten_zh: "椰子", don_gia: 0, tinh_theo: "khach" },
];

/**
 * Bộ mẫu đoàn MIỀN NAM — bảng tính giá miền Nam của phòng điều hành. Cũng không
 * lặp 行程保險 (bảo hiểm) và 導遊出差費 (công HDV — tuyến TP HCM đã là 1tr/ngày).
 * Khác miền Trung: tài xế 200k/ngày, phòng tài xế + HDV tính MỌI đêm (bảng gốc
 * ghi 4 cho tour 5 ngày), không có dừa.
 */
export const MAU_CHI_PHI_KHAC_MIEN_NAM: readonly Readonly<ChiPhiKhacItem>[] = [
  { ten: "Nón lá", ten_zh: "斗笠", don_gia: 20_000, tinh_theo: "khach" },
  { ten: "Ảnh kỷ niệm", ten_zh: "紀念照片", don_gia: 15_000, tinh_theo: "khach" },
  { ten: "Bia / nước ngọt", ten_zh: "啤酒汽水", don_gia: 12_000, tinh_theo: "khach", n_theo: "bua" },
  { ten: "Nước suối", ten_zh: "礦泉水", don_gia: 100_000, tinh_theo: "doan", n_theo: "ngay" },
  { ten: "Công tác phí tài xế", ten_zh: "司機出差費", don_gia: 200_000, tinh_theo: "doan", n_theo: "ngay" },
  // Bảng gốc chép nhãn từ bảng miền Trung (…團體不住峴港) — ở đây bỏ điều kiện
  // Đà Nẵng cho khỏi đọc nhầm.
  { ten: "Phòng tài xế + HDV", ten_zh: "司機導遊住宿", don_gia: 300_000, tinh_theo: "doan", n_theo: "dem" },
];

/** Vùng có bộ mẫu chi phí khác riêng. */
export type VungMau = "mien_trung" | "mien_nam";

export const VUNG_MAU: Record<VungMau, { nhan: string; ds: readonly Readonly<ChiPhiKhacItem>[] }> = {
  mien_trung: { nhan: "miền Trung", ds: MAU_CHI_PHI_KHAC_MIEN_TRUNG },
  mien_nam: { nhan: "miền Nam", ds: MAU_CHI_PHI_KHAC_MIEN_NAM },
};

const chuanTen = (s: string | undefined): string =>
  (s ?? "").trim().toLowerCase().replace(/\s+/g, " ");

/** "Cùng một khoản" = trùng tên 中文 hoặc trùng tên Việt (OP hay sửa một trong hai). */
function cungKhoan(a: ChiPhiKhacItem, b: ChiPhiKhacItem): boolean {
  const zhA = chuanTen(a.ten_zh);
  if (zhA && zhA === chuanTen(b.ten_zh)) return true;
  const viA = chuanTen(a.ten);
  return viA !== "" && viA === chuanTen(b.ten);
}

/** Bộ mẫu cho các vùng tour chạm tới (BẢN SAO — sửa không làm bẩn hằng số).
 *  Chạm nhiều vùng → gộp; khoản có ở cả hai lấy ĐƠN GIÁ CAO HƠN, cùng luật "chạm
 *  nhiều nơi lấy mức cao nhất" của công HDV / tip. */
export function mauTheoVung(vung: readonly VungMau[]): ChiPhiKhacItem[] {
  const out: ChiPhiKhacItem[] = [];
  for (const v of vung) {
    for (const m of VUNG_MAU[v].ds) {
      const i = out.findIndex((r) => cungKhoan(r, m));
      if (i < 0) out.push({ ...m });
      else if (m.don_gia > out[i].don_gia) out[i] = { ...m };
    }
  }
  return out;
}

/** Một dòng chi phí khác đã resolve — đủ để tính tiền lẫn để vẽ bảng. */
export interface ChiPhiKhacDong extends ChiPhiKhacTinh {
  ten: string;
  ten_zh: string;
  n_theo?: "ngay" | "dem" | "bua";
  /** N hệ thống tự tính (số ngày / đêm / bữa). null = dòng không có luật tự tính. */
  n_tu_dong: number | null;
  /** true = N đang lấy số tự tính; false = số OP gõ, hoặc N cố định của dòng. */
  n_la_tu_dong: boolean;
}

/** Số bữa ăn của báo giá = tổng N các dòng nhóm Ăn uống. Ô ăn TRỐNG (chưa tên,
 *  chưa giá — khung sẵn của báo giá mới tạo) không phải một bữa thật. */
export function demSoBua(items: BaoGiaItem[] | null | undefined): number {
  return (items ?? [])
    .filter((i) => i.loai === "meal" && ((i.mo_ta ?? "").trim() !== "" || (i.don_gia ?? 0) > 0))
    .reduce((s, i) => {
      const n = i.so_luong ?? 1;
      return s + (Number.isFinite(n) && n > 0 ? n : 0);
    }, 0);
}

/** Số ngày cho N "theo ngày" — cùng `so_ngay` mà công HDV / tip đang nhân. */
function soNgayCua(ket: BaoGiaKetQua | null | undefined): number {
  const n = ket?.so_ngay;
  return typeof n === "number" && Number.isFinite(n) && n >= 0 ? n : 1;
}

export function resolveDongChiPhiKhac(
  r: ChiPhiKhacItem,
  ctx: { soNgay: number; soBua: number },
): ChiPhiKhacDong {
  const n_tu_dong =
    r.n_theo === "ngay" ? ctx.soNgay
      // Đêm = ngày − 1 (tour 5 ngày 4 đêm). Bay đêm về thì OP gõ đè.
      : r.n_theo === "dem" ? Math.max(0, ctx.soNgay - 1)
        : r.n_theo === "bua" ? ctx.soBua
          : null;
  // 0 là số HỢP LỆ (OP chốt "không phát sinh"); số âm / rác coi như chưa gõ.
  const tay = r.so_lan != null && Number.isFinite(r.so_lan) && r.so_lan >= 0 ? r.so_lan : null;
  return {
    ten: r.ten ?? "",
    ten_zh: r.ten_zh ?? "",
    don_gia: Number.isFinite(r.don_gia) && r.don_gia > 0 ? r.don_gia : 0,
    // Dữ liệu hỏng thì nghiêng về "theo khách": tính dư thì còn thấy mà sửa,
    // tính hụt là báo giá lỗ âm thầm.
    tinh_theo: r.tinh_theo === "doan" ? "doan" : "khach",
    so_lan: tay ?? n_tu_dong ?? 1,
    n_theo: n_tu_dong != null ? r.n_theo : undefined,
    n_tu_dong,
    n_la_tu_dong: tay == null && n_tu_dong != null,
  };
}

/** OP đã chốt danh sách cho báo giá này chưa (mảng rỗng cũng là đã chốt). */
export function daChotChiPhiKhac(ket: BaoGiaKetQua | null | undefined): boolean {
  return Array.isArray(ket?.chi_phi_khac);
}

/** Danh sách GỐC đang hiệu lực: bản OP đã chốt, hoặc mẫu theo vùng nếu chưa chốt. */
export function dsChiPhiKhacGoc(
  ket: BaoGiaKetQua | null | undefined,
  vung: readonly VungMau[],
): ChiPhiKhacItem[] {
  const luu = ket?.chi_phi_khac;
  if (Array.isArray(luu)) return luu;
  return mauTheoVung(vung);
}

/** Chi phí khác dùng để tính báo giá — N đã tính xong. */
export function resolveChiPhiKhac(
  ket: BaoGiaKetQua | null | undefined,
  vung: readonly VungMau[],
): ChiPhiKhacDong[] {
  const ctx = { soNgay: soNgayCua(ket), soBua: demSoBua(ket?.items) };
  return dsChiPhiKhacGoc(ket, vung).map((r) => resolveDongChiPhiKhac(r, ctx));
}

// ── Sửa trên bảng ────────────────────────────────────────────────────────────

/** "Cách tính" gộp hai trục (nhân theo khách hay trọn đoàn × N theo gì) vào MỘT
 *  ô chọn — đỡ thêm cột cho bảng vốn đã rộng. */
export type CachTinhChiPhiKhac =
  | "khach" | "khach_bua" | "khach_ngay" | "khach_dem"
  | "doan" | "doan_bua" | "doan_ngay" | "doan_dem";

export const CACH_TINH_CHI_PHI_KHAC: readonly { value: CachTinhChiPhiKhac; nhan: string; giai_thich: string }[] = [
  { value: "khach", nhan: "/khách", giai_thich: "Mỗi khách (khách + 1 HDV) × N" },
  { value: "khach_bua", nhan: "/khách × bữa", giai_thich: "Mỗi khách × số bữa ăn trong bảng" },
  { value: "khach_ngay", nhan: "/khách × ngày", giai_thich: "Mỗi khách × số ngày tour" },
  { value: "khach_dem", nhan: "/khách × đêm", giai_thich: "Mỗi khách × số đêm (số ngày − 1)" },
  { value: "doan", nhan: "/đoàn", giai_thich: "Trọn đoàn × N" },
  { value: "doan_bua", nhan: "/đoàn × bữa", giai_thich: "Trọn đoàn × số bữa ăn trong bảng" },
  { value: "doan_ngay", nhan: "/đoàn × ngày", giai_thich: "Trọn đoàn × số ngày tour" },
  { value: "doan_dem", nhan: "/đoàn × đêm", giai_thich: "Trọn đoàn × số đêm (số ngày − 1)" },
];

export function cachTinhCua(r: Pick<ChiPhiKhacItem, "tinh_theo" | "n_theo">): CachTinhChiPhiKhac {
  const goc = r.tinh_theo === "doan" ? "doan" : "khach";
  if (r.n_theo === "ngay") return `${goc}_ngay`;
  if (r.n_theo === "dem") return `${goc}_dem`;
  if (r.n_theo === "bua") return `${goc}_bua`;
  return goc;
}

/** Đổi cách tính một dòng.
 *  - Sang kiểu N tự tính → N chạy theo ngày/đêm/bữa; chỉ giữ số OP gõ khi vẫn
 *    cùng kiểu tự tính cũ (đổi khách ↔ đoàn thôi).
 *  - Sang kiểu N cố định → GIỮ N đang dùng, kẻo tiền nhảy bất ngờ ("nước suối
 *    /đoàn × ngày" đang 5 ngày → "/đoàn" vẫn là 5 lần). */
export function doiCachTinh(
  r: ChiPhiKhacItem,
  cach: CachTinhChiPhiKhac,
  nDangDung: number,
): ChiPhiKhacItem {
  const tinh_theo: ChiPhiKhacItem["tinh_theo"] = cach.startsWith("doan") ? "doan" : "khach";
  const n_theo: ChiPhiKhacItem["n_theo"] =
    cach.endsWith("_ngay") ? "ngay" : cach.endsWith("_dem") ? "dem" : cach.endsWith("_bua") ? "bua" : undefined;
  const coBan = { ten: r.ten, ten_zh: r.ten_zh, don_gia: r.don_gia, tinh_theo };
  if (n_theo) return { ...coBan, n_theo, so_lan: n_theo === r.n_theo ? (r.so_lan ?? null) : null };
  return { ...coBan, so_lan: nDangDung };
}

/** Dòng trống OP tự thêm: tính theo khách, N = 1, tên + giá điền ngay trên bảng. */
export function dongChiPhiKhacMoi(): ChiPhiKhacItem {
  return { ten: "", ten_zh: "", don_gia: 0, tinh_theo: "khach" };
}

/** Các dòng mẫu của một vùng còn THIẾU trong danh sách. Nút "nạp mẫu" chỉ thêm
 *  những dòng này — không nhân đôi dòng đã có, kể cả dòng OP đã sửa giá. */
export function mauConThieu(ds: readonly ChiPhiKhacItem[], vung: VungMau): ChiPhiKhacItem[] {
  return VUNG_MAU[vung].ds
    .filter((m) => !ds.some((r) => cungKhoan(r, m)))
    .map((m) => ({ ...m }));
}
