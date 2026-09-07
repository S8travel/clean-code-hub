// Helpers cho trang chi tiết Báo giá. Wrap logic format / status / mã BG /
// cost breakdown để các sub-components share consistent output.

import type { BaoGiaCase, BaoGiaItem, BaoGiaKetQua, BaoGiaRow } from "@/hooks/use-bao-gia";
import {
  calcBaoGia, calcTiers, tierConfig, effItemFoc, effItemQty, slOverrideOf,
  HDV_GIA_NGAY_MAC_DINH, HDV_GIA_NGAY_SAPA, HDV_GIA_NGAY_MIEN_TRUNG, HDV_GIA_NGAY_HCM,
  BAO_HIEM_MOI_KHACH_MAC_DINH, TIP_DOAN_MAC_DINH, type DinhMuc, type ManualItem,
} from "@/lib/bao-gia-calc";
import { TY_GIA_BAO_GIA_MAC_DINH, tyGiaCuaBaoGia } from "@/lib/bao-gia-ty-gia";

export const fmtVnd = (n: number | null | undefined) =>
  Math.round(Number(n) || 0).toLocaleString("vi-VN");

export const fmtUsd = (n: number | null | undefined) =>
  (Number(n) || 0).toFixed(2);

/** Mã báo giá hiển thị. Ưu tiên field thực ma_bg (generated col), fallback
 *  derive từ id cho trường hợp gọi sớm trước khi row load đủ. */
export const baoGiaCode = (row: { id: number; ma_bg?: string | null }): string =>
  row.ma_bg ?? `BG${row.id.toString().padStart(5, "0")}`;

export const STATUS_INFO: Record<string, { label: string; dotCls: string; textCls: string }> = {
  draft: { label: "Draft",     dotCls: "bg-emerald-500", textCls: "text-emerald-700" },
  final: { label: "Chính thức", dotCls: "bg-blue-500",    textCls: "text-blue-700" },
  sent:  { label: "Đã gửi",     dotCls: "bg-violet-500",  textCls: "text-violet-700" },
};

/** Lấy "primary" case từ ket_qua — ưu tiên case_16, fallback case_20. */
export function primaryCase(ket: BaoGiaKetQua | null): BaoGiaCase | null {
  if (!ket) return null;
  return ket.case_16 ?? ket.case_20 ?? null;
}

/** Số pax hiển thị — lấy từ case primary. */
export function paxOf(ket: BaoGiaKetQua | null): number {
  return primaryCase(ket)?.guests ?? 0;
}

/** Group items theo loai. */
export function groupItemsByLoai(items: BaoGiaItem[] | undefined): Record<BaoGiaItem["loai"], BaoGiaItem[]> {
  const out: Record<BaoGiaItem["loai"], BaoGiaItem[]> = {
    hotel: [], meal: [], ticket: [], transport: [],
  };
  (items || []).forEach((it) => { (out[it.loai] ||= []).push(it); });
  return out;
}

/** Filter items thuộc 1 ngày cụ thể (1-based). Item KHÔNG có ngay_so → coi
 *  như Day 1 (back-compat cho data AI cũ).
 *  Trả về object grouped theo loai để DayPanel render từng category. */
export function itemsOfDay(items: BaoGiaItem[] | undefined, day: number): Record<BaoGiaItem["loai"], BaoGiaItem[]> {
  const filtered = (items || []).filter((it) => (it.ngay_so ?? 1) === day);
  return groupItemsByLoai(filtered);
}

/** 4 slot mặc định mỗi ngày: cảnh điểm, ăn trưa, ăn tối, khách sạn.
 *  Empty rows (don_gia=0) — calcBaoGia bỏ qua items không có giá nên an toàn. */
export function defaultDayItems(dayIdx: number): BaoGiaItem[] {
  return [
    { loai: "ticket", mo_ta: "", don_gia: 0, ghi_chu: "", ngay_so: dayIdx },
    { loai: "meal", bua_an: "trua", mo_ta: "", don_gia: 0, ghi_chu: "", ngay_so: dayIdx },
    { loai: "meal", bua_an: "toi",  mo_ta: "", don_gia: 0, ghi_chu: "", ngay_so: dayIdx },
    { loai: "hotel", mo_ta: "", don_gia: 0, ghi_chu: "", ngay_so: dayIdx },
  ];
}

/** Case trống (giá 0) — báo giá vừa tạo, user điền ở detail page. */
export function emptyBaoGiaCase(guests: number): BaoGiaCase {
  return {
    guests, pax: 0, rooms: 0,
    hotel: 0, meal: 0, ticket: 0, transport: 0,
    insurance: 0, guide: 0, tips: 0,
    total_cost: 0, profit_vnd: 0,
    final_price_vnd: 0, final_price_usd: 0,
  };
}

/** Skeleton ket_qua trống cho báo giá mới (N ngày, 4 slot/ngày). Dùng chung
 *  cho "Tạo báo giá" ở trang Báo giá lẫn tab Báo giá trong Lead. */
export function emptyBaoGiaKetQua(soNgay = 1, tenChuongTrinh = ""): BaoGiaKetQua {
  const days = Math.max(1, soNgay);
  const items = Array.from({ length: days }, (_, i) => defaultDayItems(i + 1)).flat();
  return {
    ten_chuong_trinh: tenChuongTrinh,
    so_ngay: days,
    items,
    case_16: emptyBaoGiaCase(16),
    case_20: emptyBaoGiaCase(20),
    gia_trung_binh_vnd: 0,
    gia_trung_binh_usd: 0,
  };
}

/** Skeleton ket_qua cho báo giá GIÁ CUỐI (land tour — giá chốt sẵn). KHÔNG có
 *  slot dịch vụ (items rỗng); giá nhập thẳng theo bậc số khách (gia_cuoi_tiers). */
export function emptyGiaCuoiKetQua(soNgay = 1, tenChuongTrinh = ""): BaoGiaKetQua {
  return {
    ten_chuong_trinh: tenChuongTrinh,
    so_ngay: Math.max(1, soNgay),
    items: [],
    case_16: emptyBaoGiaCase(16),
    case_20: emptyBaoGiaCase(20),
    gia_trung_binh_vnd: 0,
    gia_trung_binh_usd: 0,
    gia_cuoi_tiers: [
      { guests: 10, gia_ban_vnd: 0 },
      { guests: 20, gia_ban_vnd: 0 },
    ],
  };
}

/** Live-recompute case_16 + case_20 + giá trung bình từ items[] + xe_gia +
 *  draft fields. Trả về BaoGiaKetQua "tươi" để các tổng hợp (panel UI, Word
 *  export) dùng chung — KHÔNG đọc case frozen từ AI extract.
 *  Giữ nguyên `items[]` gốc (full metadata: ghi_chu, bua_an, ngay_so) +
 *  giữ `guests` user đã nhập (calcBaoGia hardcode 16/20 trong CASES). */
export function liveKetQua(draft: BaoGiaRow): BaoGiaKetQua | null {
  const ket = draft.ket_qua;
  if (!ket) return null;

  const manualItems: ManualItem[] = (ket.items ?? []).map((it, i) => ({
    id: `${i}`,
    ngay: it.ngay_so ?? 1,
    loai: it.loai,
    mo_ta: it.mo_ta,
    bang_gia_ten: it.mo_ta,
    gia: it.don_gia,
    foc: it.foc,
    foc_khach: it.foc_khach,
    foc_mien: it.foc_mien,
    so_luong: it.so_luong ?? 1,
    sl_override: it.sl_override,
  }));

  const phuThu = draft.phu_thu ?? 0;
  const live = calcBaoGia(
    manualItems,
    ket.ten_chuong_trinh,
    ket.so_ngay ?? 1,
    tyGiaCuaBaoGia(draft.exchange_rate),
    draft.profit_usd ?? 0,
    draft.xe_gia ?? 0,
    phuThu, // lump-sum vào transport
    dinhMucCuaBaoGia(ket),
  );

  return {
    ...ket,
    items: ket.items, // KEEP original items (bao gồm bua_an, ghi_chu, ngay_so)
    case_16: { ...live.case_16, guests: ket.case_16?.guests ?? live.case_16.guests },
    case_20: { ...live.case_20, guests: ket.case_20?.guests ?? live.case_20.guests },
    gia_trung_binh_vnd: live.gia_trung_binh_vnd,
    gia_trung_binh_usd: live.gia_trung_binh_usd,
  };
}

export interface CaseLine {
  khach_san: number;
  an_uong: number;
  xe: number;
  phu_thu_xe: number;
  ve_tham_quan: number;
  hdv: number;
  khac: number;
  tong_von: number;
  profit_vnd: number;
  chenh_lech_xr: number; // chênh lệch tỷ giá VCB vs báo giá rate
  gia_ban: number;
  gia_ban_per_pax: number;
  bien_loi_nhuan_pct: number; // = (profit + chenh_lech) / gia_ban × 100
}

function buildCase(c: BaoGiaCase, guests: number, phuThu: number, profitUsd: number, xr: number, vcbRate: number | null): CaseLine {
  const tongVon = c.total_cost + phuThu;
  const profitVnd = Math.round(profitUsd * guests * xr);
  const giaBan = tongVon + profitVnd;
  // Chênh lệch tỷ giá: customer trả USD = gia_ban / xr; agency thực thu
  // VND = USD × vcb_rate → chênh lệch = USD × (vcb − xr) = gia_ban × (vcb − xr) / xr.
  // Dương khi vcb > xr (agency lời), âm khi vcb < xr (agency lỗ).
  const chenhLech = vcbRate && xr > 0 ? Math.round(giaBan * (vcbRate - xr) / xr) : 0;
  return {
    khach_san:   c.hotel,
    an_uong:     c.meal,
    xe:          c.transport,
    phu_thu_xe:  phuThu,
    ve_tham_quan:c.ticket,
    hdv:         c.guide,
    khac:        c.tips + c.insurance,
    tong_von:    tongVon,
    profit_vnd:  profitVnd,
    chenh_lech_xr: chenhLech,
    gia_ban:     giaBan,
    gia_ban_per_pax: guests > 0 ? Math.round(giaBan / guests) : 0,
    bien_loi_nhuan_pct: giaBan > 0 ? ((profitVnd + chenhLech) / giaBan) * 100 : 0,
  };
}

/** Cost breakdown — 2 phương án 16/20 khách (hardcoded multipliers từ calcBaoGia).
 *  GIÁ BÁN TOUR final = trung bình per-pax của 2 phương án. */
export function costBreakdown(args: {
  ket: BaoGiaKetQua | null;
  exchangeRate: number;
  profitUsd: number;
  xeGia: number | null;
  phuThu: number | null;
  vcbRate: number | null;
}) {
  const { ket, exchangeRate, profitUsd, xeGia, vcbRate } = args;
  if (!ket) return null;

  const manualItems: ManualItem[] = (ket.items ?? []).map((it, i) => ({
    id: `${i}`, ngay: it.ngay_so ?? 1, loai: it.loai,
    mo_ta: it.mo_ta, bang_gia_ten: it.mo_ta, gia: it.don_gia,
    foc: it.foc, foc_khach: it.foc_khach, foc_mien: it.foc_mien, so_luong: it.so_luong ?? 1,
    sl_override: it.sl_override,
  }));
  // Truyền 0 cho phuThu trong calc — phụ thu hiển thị dòng riêng (KHÔNG gộp
  // vào "Xe vận chuyển"). Cộng vào tổng cost vốn ngoài calc.
  const live = calcBaoGia(
    manualItems, ket.ten_chuong_trinh, ket.so_ngay ?? 1,
    exchangeRate, profitUsd, xeGia ?? 0, 0, dinhMucCuaBaoGia(ket),
  );
  const phuThuVal = args.phuThu ?? 0;
  const case16 = buildCase(live.case_16, 16, phuThuVal, profitUsd, exchangeRate, vcbRate);
  const case20 = buildCase(live.case_20, 20, phuThuVal, profitUsd, exchangeRate, vcbRate);
  const giaBanTbPerPax = Math.round((case16.gia_ban_per_pax + case20.gia_ban_per_pax) / 2);
  const bienTb = (case16.bien_loi_nhuan_pct + case20.bien_loi_nhuan_pct) / 2;
  return {
    case16,
    case20,
    profit_target_usd: profitUsd,
    gia_ban_tb_per_pax: giaBanTbPerPax,
    gia_ban_tb_per_pax_usd: exchangeRate > 0 ? giaBanTbPerPax / exchangeRate : 0,
    bien_loi_nhuan_tb_pct: bienTb,
    exchange_rate: exchangeRate,
    vcb_rate: vcbRate,
  };
}

// ── Ma trận giá nhiều bậc ────────────────────────────────────────────────────

/** Danh sách số khách mỗi bậc. Vắng/rỗng → mặc định [16, 20] (back-compat). */
export function tierGuestsOf(ket: BaoGiaKetQua | null | undefined): number[] {
  const g = ket?.tier_guests;
  if (g && g.length > 0) return [...g].sort((a, b) => a - b);
  return [16, 20];
}

export interface TierLine {
  guests: number;
  line: CaseLine;
}

/** Live ma trận giá theo từng bậc số khách (tier_guests). Mỗi bậc → CaseLine
 *  (breakdown vốn + giá bán/khách). Dùng chung calc với panel 2-case. */
export function liveTierBreakdown(draft: BaoGiaRow): TierLine[] {
  const ket = draft.ket_qua;
  if (!ket) return [];
  const guestsList = tierGuestsOf(ket);
  const manualItems: ManualItem[] = (ket.items ?? []).map((it, i) => ({
    id: `${i}`, ngay: it.ngay_so ?? 1, loai: it.loai,
    mo_ta: it.mo_ta, bang_gia_ten: it.mo_ta, gia: it.don_gia, foc: it.foc,
    foc_khach: it.foc_khach, foc_mien: it.foc_mien, so_luong: it.so_luong ?? 1,
    sl_override: it.sl_override,
  }));
  const xr = tyGiaCuaBaoGia(draft.exchange_rate);
  const profitUsd = draft.profit_usd ?? 0;
  const phuThu = draft.phu_thu ?? 0;
  // phuThu = 0 trong calc (hiển thị dòng riêng), cộng ngoài qua buildCase — KHỚP costBreakdown.
  const cases = calcTiers(
    manualItems, ket.so_ngay ?? 1, xr, profitUsd, guestsList,
    draft.xe_gia ?? 0, 0, dinhMucCuaBaoGia(ket),
  );
  return cases.map((c) => ({
    guests: c.guests,
    line: buildCase(c, c.guests, phuThu, profitUsd, xr, draft.vcb_rate ?? null),
  }));
}

// ── Định mức tiền cố định: công HDV · bảo hiểm · tip ─────────────────────────
// Công HDV/ngày tự đặt theo tuyến, vì một HDV đi suốt hành trình. Tour chạm
// NHIỀU nơi thì lấy mức CAO NHẤT — trả theo nơi đắt nhất đoàn có ghé.

/** Bỏ dấu tiếng Việt + gộp khoảng trắng để dò từ khoá không phụ thuộc cách gõ.
 *  Dải U+0300–U+036F viết bằng escape, KHÔNG dán ký tự thật: chúng vô hình,
 *  editor/diff nuốt mất là hàm lặng lẽ ngừng bỏ dấu. */
function boDau(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d").replace(/\s+/g, " ");
}

/** Các chuỗi đem đi dò tuyến.
 *
 *  `boDongAn` = bỏ các dòng ăn uống. Tên nhà hàng hay mang địa danh của nơi
 *  KHÁC: trong danh mục có nhà hàng tên "Sài Gòn" nằm ở Hà Nội và nhà hàng tên
 *  "Hội An" nằm ở TP HCM — đủ để gán nhầm cả tuyến. Khách sạn thì sạch, đã
 *  kiểm: 10 khách sạn tên Sài Gòn / 24 khách sạn tên Đà Nẵng, không cái nào
 *  nằm sai nơi. */
function nguonDoTuyen(ket: BaoGiaKetQua | null | undefined, boDongAn: boolean): string[] {
  if (!ket) return [];
  const items = (ket.items ?? []).filter((i) => !(boDongAn && i.loai === "meal"));
  return [ket.ten_chuong_trinh ?? "", ...items.flatMap((i) => [i.mo_ta ?? "", i.ten_zh ?? ""])]
    .filter(Boolean);
}

/** Tour có ghé Sapa? Dò tên chương trình + tên mọi dòng dịch vụ (VI lẫn 中文).
 *  Tiếng Việt dò theo BIÊN TỪ (\bsa ?pa\b) để "casapark" không dính.
 *  Tiếng Trung CHỈ nhận 沙壩/沙坝 — 沙巴 là Sabah (Malaysia), gộp vào sẽ đội
 *  giá HDV của tour Malaysia lên 700k.
 *
 *  CỐ Ý vẫn đọc cả dòng ăn uống (khác hai hàm dưới): đã có test nhận Sapa qua
 *  tên nhà hàng, siết lại là mở đường cho hồi quy không cần thiết. */
export function isSapaTour(ket: BaoGiaKetQua | null | undefined): boolean {
  return nguonDoTuyen(ket, false).some((raw) => {
    if (raw.includes("沙壩") || raw.includes("沙坝")) return true;
    return /\bsa ?pa\b/.test(boDau(raw));
  });
}

/** Tour có ghé miền Trung? Gồm Đà Nẵng · Bà Nà · Hội An · Huế (chốt 07/09/2026).
 *
 *  Phải nhận cả vệ tinh chứ không chỉ chữ "Đà Nẵng": có tour miền Trung thật
 *  trong hệ thống mà cả chương trình không hề có chữ Đà Nẵng nào, chỉ có 巴拿山
 *  (Bà Nà) và 會安 (Hội An).
 *  "danang" viết LIỀN rất phổ biến trong tên khách sạn nên dấu cách phải tuỳ chọn. */
export function isMienTrungTour(ket: BaoGiaKetQua | null | undefined): boolean {
  return nguonDoTuyen(ket, true).some((raw) => {
    if (/峴港|岘港|巴拿山|會安|会安|順化|顺化/.test(raw)) return true;
    return /\bda ?nang\b|\bba ?na\b|\bhoi ?an\b|\bhue\b/.test(boDau(raw));
  });
}

/** Xoá các cụm LĂNG / PHỦ / BẢO TÀNG Hồ Chí Minh trước khi dò TP HCM.
 *
 *  Đây là cái bẫy đắt nhất của cả hàm: lăng Bác nằm ở HÀ NỘI. Đo trên dữ liệu
 *  thật — 5 dòng có chữ 胡志明 thì 3 dòng là 胡志明陵寢 của tour Bắc; trong danh
 *  mục cảnh điểm, nhóm lăng/quảng trường Ba Đình/phủ chủ tịch nhiều gấp khoảng
 *  18 lần số cảnh điểm HCM thật. Không xoá trước là MỌI tour Hà Nội ăn mức
 *  1.000.000 ₫/ngày mà nhìn bảng không thấy gì bất thường. */
function chuoiDoHcm(raw: string): string {
  return boDau(raw)
    .replace(/胡志明(?:主席)?(?:陵寢|陵寝|陵|紀念堂|纪念堂|博物館|博物馆|故居)/g, " ")
    .replace(/(lang|phu|bao tang|nha san|khu di tich)[^,;./]{0,24}ho chi minh/g, " ");
}

/** Tour có ghé TP Hồ Chí Minh? */
export function isHcmTour(ket: BaoGiaKetQua | null | undefined): boolean {
  return nguonDoTuyen(ket, true).some((raw) => {
    const t = chuoiDoHcm(raw);
    // 胡志明市 gần như KHÔNG bao giờ được viết đủ chữ 市 trong dữ liệu thật, nên
    // vẫn phải nhận 胡志明 trần — nhưng chỉ phần CÒN LẠI sau khi xoá cụm lăng.
    if (/西貢|西贡|胡志明|古芝|獨立宮|独立宫|統一宮|统一宫/.test(t)) return true;
    return /\bsai ?gon\b|\bho chi minh\b|hcm\b/.test(t);
  });
}

/** Công HDV/ngày hệ thống TỰ ĐẶT theo tuyến (chưa xét việc OP gõ tay).
 *  Chạm nhiều nơi → lấy mức cao nhất, kèm tên tuyến để màn hình nói được vì sao. */
export function hdvGiaNgayTheoTuyen(
  ket: BaoGiaKetQua | null | undefined,
): { gia: number; tuyen: string } {
  const nen = [{ gia: HDV_GIA_NGAY_MAC_DINH, tuyen: "" }];
  if (isHcmTour(ket)) nen.push({ gia: HDV_GIA_NGAY_HCM, tuyen: "TP Hồ Chí Minh" });
  if (isSapaTour(ket)) nen.push({ gia: HDV_GIA_NGAY_SAPA, tuyen: "Sapa" });
  if (isMienTrungTour(ket)) nen.push({ gia: HDV_GIA_NGAY_MIEN_TRUNG, tuyen: "miền Trung" });
  return nen.reduce((a, b) => (b.gia > a.gia ? b : a));
}

/** Công HDV/ngày dùng để tính báo giá này. OP đã gõ số → tôn trọng tuyệt đối
 *  (kể cả 0); chưa gõ → tự đặt theo tuyến. */
export function resolveHdvGiaNgay(ket: BaoGiaKetQua | null | undefined): number {
  const v = ket?.hdv_gia_ngay;
  if (v != null && Number.isFinite(v) && v >= 0) return v;
  return hdvGiaNgayTheoTuyen(ket).gia;
}

/** Bảo hiểm / khách. OP gõ số → tôn trọng tuyệt đối, kể cả 0. */
export function resolveBaoHiemMoiKhach(ket: BaoGiaKetQua | null | undefined): number {
  const v = ket?.bao_hiem_moi_khach;
  if (v != null && Number.isFinite(v) && v >= 0) return v;
  return BAO_HIEM_MOI_KHACH_MAC_DINH;
}

/** Tip / đoàn (lump-sum). OP gõ số → tôn trọng tuyệt đối, kể cả 0. */
export function resolveTipDoan(ket: BaoGiaKetQua | null | undefined): number {
  const v = ket?.tip_doan;
  if (v != null && Number.isFinite(v) && v >= 0) return v;
  return TIP_DOAN_MAC_DINH;
}

/** Gói 3 định mức để truyền vào engine tính tiền. Dùng ở MỌI nơi gọi engine —
 *  quên một chỗ là màn hình một giá, file Word một giá. */
export function dinhMucCuaBaoGia(ket: BaoGiaKetQua | null | undefined): DinhMuc {
  return {
    hdvGiaNgay: resolveHdvGiaNgay(ket),
    baoHiemMoiKhach: resolveBaoHiemMoiKhach(ket),
    tipDoan: resolveTipDoan(ket),
  };
}

/** Ép ngày của dòng thêm tay về [1, soNgay]. Ngày ngoài khoảng làm dòng biến
 *  mất khỏi mắt OP (bảng gom theo ngày) mà tiền vẫn tính — chặn ngay ở ô nhập. */
export function clampNgay(v: number, soNgay: number): number {
  const max = Math.max(1, Math.round(soNgay) || 1);
  if (!Number.isFinite(v)) return 1;
  return Math.min(max, Math.max(1, Math.round(v)));
}

/** Dòng dịch vụ TRỐNG do OP tự thêm (AI đọc thiếu / phát sinh sau). Tên + giá
 *  để rỗng, OP điền inline ngay trên bảng. `so_luong` = 1 (N), FOC để auto.
 *  `bua_an` chỉ gắn cho dòng ăn — dòng vé/KS/xe mang bua_an sẽ làm máy combo
 *  hiểu nhầm là bữa ăn cần trừ. */
export function newBaoGiaItem(
  loai: BaoGiaItem["loai"],
  ngay_so: number,
  bua_an?: "trua" | "toi",
): BaoGiaItem {
  return {
    loai,
    mo_ta: "",
    don_gia: 0,
    ghi_chu: "",
    ngay_so: Math.max(1, Math.round(ngay_so) || 1),
    so_luong: 1,
    ...(loai === "meal" && bua_an ? { bua_an } : {}),
  };
}

/** Ghi đè / xoá SL nhập tay của MỘT bậc số khách trên 1 dòng dịch vụ.
 *  Ô để trống (hoặc số không hợp lệ) → xoá khoá của bậc đó, bậc quay về tự
 *  tính; hết khoá → trả `undefined` để JSON gọn, không đọng object rỗng.
 *  Các bậc khác GIỮ NGUYÊN — sửa cột 16 khách không được đụng cột 20 khách. */
export function setSlOverride(
  cur: Record<string, number> | undefined,
  guests: number,
  raw: string,
): Record<string, number> | undefined {
  const next = { ...(cur ?? {}) };
  const s = raw.trim();
  const v = Number(s);
  if (s === "" || !Number.isFinite(v) || v < 0) delete next[String(guests)];
  else next[String(guests)] = Math.round(v);
  return Object.keys(next).length > 0 ? next : undefined;
}

// ── Costing sheet (bố cục Excel: nhóm Xe/KS/Ăn/Vé × nhiều cột số khách) ───────

export type CostingUnit = "rooms" | "pax" | "lump";

/** 1 ô (cell) chi phí của 1 item ở 1 bậc số khách. */
export interface CostingTierCell {
  guests: number;
  qty: number;    // SL dùng để tính: số phòng (hotel) | pax (meal/ticket) | 1 (lump)
  auto: number;   // SL hệ thống tự tính cho bậc này (placeholder ô nhập)
  manual: boolean;// true = SL do OP nhập tay cho bậc này (đoàn FIT), khác auto
  foc: number;    // số miễn áp dụng cho bậc này (auto theo chính sách hoặc override)
  total: number;  // don_gia × so_luong × max(0, qty − foc)  (lump: × so_luong)
}

/** 1 dòng item trong bảng costing. itemIndex = vị trí trong ket.items (để sửa);
 *  -1 = dòng tổng hợp (xe lump / phụ thu) lấy từ field draft, KHÔNG sửa inline. */
export interface CostingRow {
  itemIndex: number;
  loai: BaoGiaItem["loai"];
  unit: CostingUnit;
  ngay_so: number;            // 0 = không gắn ngày (xe lump / phụ thu)
  bua_an?: "trua" | "toi";
  mo_ta: string;
  ten_zh?: string;
  don_gia: number;
  don_gia_usd: number;
  so_luong: number;           // N (次/N数)
  foc_manual: number | null;  // số miễn nhập tay (override). null = auto theo policy
  foc_khach?: number;         // chính sách FOC nhà hàng (auto)
  foc_mien?: number;
  sl_override?: Record<string, number>; // SL nhập tay theo bậc (khoá = số khách)
  editable: boolean;
  cells: CostingTierCell[];   // 1 cell / bậc số khách
}

export interface CostingGroup {
  key: "transport" | "hotel" | "meal" | "ticket";
  label: string;
  rows: CostingRow[];
  subtotals: number[];        // tổng theo từng bậc
}

export interface CostingFooterRow {
  key: string;
  label: string;
  values: number[];           // theo từng bậc
  kind: "cost" | "total" | "profit" | "price" | "usd" | "pct";
  /** Dòng cho OP gõ đè đơn giá. Chỉ MÀN HÌNH dùng — Excel và bảng xem trước AI
   *  bỏ qua và vẫn đọc `label` như cũ, nên thêm field này không vỡ chỗ nào. */
  oNhap?: {
    truong: "hdv_gia_ngay" | "bao_hiem_moi_khach" | "tip_doan";
    nhan: string;             // nhãn KHÔNG kèm số (số nằm trong ô nhập)
    donGia: number;
    donVi: string;            // "₫/ngày" | "₫/khách" | "₫/đoàn"
    tuDat: boolean;           // true = đang để hệ thống tự đặt, OP chưa gõ
    ghiChuTuDat?: string;     // vì sao ra con số này, vd "tuyến Đà Nẵng"
  };
}

export interface CostingSheet {
  guests: number[];
  configs: { guests: number; pax: number; rooms: number }[];
  xr: number;
  groups: CostingGroup[];
  footer: CostingFooterRow[];
}

const GROUP_LABEL: Record<CostingGroup["key"], string> = {
  transport: "Xe / Vận chuyển",
  hotel: "Khách sạn",
  meal: "Ăn uống",
  ticket: "Vé tham quan",
};

// Thứ tự trong nhóm Ăn: trưa → tối → generic.
function buaOrder(it: { bua_an?: "trua" | "toi" }): number {
  if (it.bua_an === "trua") return 0;
  if (it.bua_an === "toi") return 1;
  return 2;
}

/** Dựng bảng costing theo bố cục Excel: gom theo nhóm Xe/KS/Ăn/Vé, mỗi item có
 *  per-bậc (qty/thành tiền), footer (cộng dịch vụ → tổng vốn → giá bán/khách).
 *  Footer khớp đúng calcCase/costBreakdown (giá/khách = round((tổng vốn+LN)/khách)). */
export function costingSheet(draft: BaoGiaRow): CostingSheet | null {
  const ket = draft.ket_qua;
  if (!ket) return null;

  const xr = tyGiaCuaBaoGia(draft.exchange_rate);
  const profitUsd = draft.profit_usd ?? 0;
  const soNgay = ket.so_ngay ?? 1;
  const vcb = draft.vcb_rate ?? null;
  const guests = tierGuestsOf(ket);
  const configs = guests.map(tierConfig);
  const items = ket.items ?? [];

  const unitFor = (loai: BaoGiaItem["loai"]): CostingUnit =>
    loai === "hotel" ? "rooms" : loai === "transport" ? "lump" : "pax";

  const cellsFor = (it: BaoGiaItem, don_gia: number, sl: number): CostingTierCell[] =>
    configs.map((c) => {
      const auto = it.loai === "hotel" ? c.rooms : it.loai === "transport" ? 1 : c.pax;
      // Xe (lump) không tính theo đầu khách → không cho ghi đè SL.
      const manual = it.loai !== "transport" && slOverrideOf(it, c.guests) != null;
      const qty = it.loai === "transport" ? auto : effItemQty(it, c.guests, auto);
      const foc = it.loai === "transport" ? 0 : effItemFoc(it, qty); // số miễn theo SL thực
      const eff = Math.max(0, qty - foc);
      return { guests: c.guests, qty, auto, manual, foc, total: don_gia * sl * eff };
    });

  const rowFromItem = (it: BaoGiaItem, idx: number): CostingRow => {
    const don_gia = it.don_gia ?? 0;
    const sl = it.so_luong ?? 1;
    return {
      itemIndex: idx, loai: it.loai, unit: unitFor(it.loai),
      ngay_so: it.ngay_so ?? 1, bua_an: it.bua_an, mo_ta: it.mo_ta, ten_zh: it.ten_zh,
      don_gia, don_gia_usd: xr > 0 ? don_gia / xr : 0, so_luong: sl,
      foc_manual: it.foc ?? null, foc_khach: it.foc_khach, foc_mien: it.foc_mien,
      sl_override: it.sl_override,
      editable: true, cells: cellsFor(it, don_gia, sl),
    };
  };

  const rowsOf = (loai: BaoGiaItem["loai"]): CostingRow[] =>
    items
      .map((it, i) => ({ it, i }))
      .filter(({ it }) => it.loai === loai)
      .sort((a, b) => ((a.it.ngay_so ?? 1) - (b.it.ngay_so ?? 1)) || (buaOrder(a.it) - buaOrder(b.it)))
      .map(({ it, i }) => rowFromItem(it, i));

  const lumpRow = (label: string, gia: number): CostingRow => ({
    itemIndex: -1, loai: "transport", unit: "lump", ngay_so: 0, mo_ta: label,
    don_gia: gia, don_gia_usd: xr > 0 ? gia / xr : 0, so_luong: 1,
    foc_manual: null, editable: false,
    cells: configs.map((c) => ({ guests: c.guests, qty: 1, auto: 1, manual: false, foc: 0, total: gia })),
  });

  // Nhóm Xe = xe (lump từ draft) + transport items + phụ thu (lump từ draft).
  const xeRows: CostingRow[] = [];
  if ((draft.xe_gia ?? 0) > 0) xeRows.push(lumpRow(draft.xe_ten || "Xe", draft.xe_gia!));
  rowsOf("transport").forEach((r) => xeRows.push(r));
  if ((draft.phu_thu ?? 0) > 0) xeRows.push(lumpRow("Phụ thu (cầu đường, trung chuyển…)", draft.phu_thu));

  const rawGroups: { key: CostingGroup["key"]; rows: CostingRow[] }[] = [
    { key: "transport", rows: xeRows },
    { key: "hotel", rows: rowsOf("hotel") },
    { key: "meal", rows: rowsOf("meal") },
    { key: "ticket", rows: rowsOf("ticket") },
  ];
  const groups: CostingGroup[] = rawGroups.map((g) => ({
    key: g.key,
    label: GROUP_LABEL[g.key],
    rows: g.rows,
    subtotals: configs.map((_, ti) => g.rows.reduce((s, r) => s + r.cells[ti].total, 0)),
  }));

  // Footer — khớp calcCase: tổng vốn = dịch vụ + HDV + BH + tip.
  const dichVu = configs.map((_, ti) => groups.reduce((s, g) => s + g.subtotals[ti], 0));
  // Ba định mức lấy CHUNG một nguồn với engine (dinhMucCuaBaoGia). Trước đây
  // chỗ này chép lại công thức và đóng cứng 100.000 / 500.000 — sửa một bên là
  // cùng một báo giá ra hai giá ở hai màn hình.
  const hdvGiaNgay = resolveHdvGiaNgay(ket);
  const baoHiemMoiKhach = resolveBaoHiemMoiKhach(ket);
  const tipDoan = resolveTipDoan(ket);
  const tuyenHdv = hdvGiaNgayTheoTuyen(ket);
  const hdv = configs.map(() => hdvGiaNgay * soNgay);
  const baoHiem = configs.map((c) => baoHiemMoiKhach * c.pax);
  const tip = configs.map(() => tipDoan);
  const tongVon = configs.map((_, ti) => dichVu[ti] + hdv[ti] + baoHiem[ti] + tip[ti]);
  const loiNhuan = configs.map((c) => Math.round(profitUsd * xr * c.guests));
  const giaBan = configs.map((_, ti) => tongVon[ti] + loiNhuan[ti]);
  const chenh = configs.map((_, ti) => (vcb && xr > 0 ? Math.round(giaBan[ti] * (vcb - xr) / xr) : 0));
  const giaPerPax = configs.map((c, ti) => (c.guests > 0 ? Math.round(giaBan[ti] / c.guests) : 0));
  const usdPerPax = configs.map((_, ti) => (xr > 0 ? giaPerPax[ti] / xr : 0));
  const bienPct = configs.map((_, ti) => (giaBan[ti] > 0 ? (loiNhuan[ti] + chenh[ti]) / giaBan[ti] * 100 : 0));

  const footer: CostingFooterRow[] = [
    { key: "dich_vu", label: "Cộng dịch vụ", values: dichVu, kind: "cost" },
    {
      key: "hdv",
      // `label` GIỮ NGUYÊN kèm số — file Excel và bảng xem trước AI đọc nó.
      label: `Hướng dẫn viên (${fmtVnd(hdvGiaNgay)} ₫/ngày)`,
      values: hdv, kind: "cost",
      oNhap: {
        truong: "hdv_gia_ngay", nhan: "Hướng dẫn viên", donGia: hdvGiaNgay, donVi: "₫/ngày",
        tuDat: ket.hdv_gia_ngay == null,
        ghiChuTuDat: tuyenHdv.tuyen ? `tuyến ${tuyenHdv.tuyen}` : "mức chung",
      },
    },
    {
      key: "bao_hiem",
      label: `Bảo hiểm (${fmtVnd(baoHiemMoiKhach)} ₫/khách)`,
      values: baoHiem, kind: "cost",
      oNhap: {
        truong: "bao_hiem_moi_khach", nhan: "Bảo hiểm", donGia: baoHiemMoiKhach, donVi: "₫/khách",
        tuDat: ket.bao_hiem_moi_khach == null,
      },
    },
    {
      key: "tip",
      label: `Tip (${fmtVnd(tipDoan)} ₫/đoàn)`,
      values: tip, kind: "cost",
      oNhap: {
        truong: "tip_doan", nhan: "Tip", donGia: tipDoan, donVi: "₫/đoàn",
        tuDat: ket.tip_doan == null,
      },
    },
    { key: "tong_von", label: "TỔNG CHI PHÍ VỐN", values: tongVon, kind: "total" },
    { key: "loi_nhuan", label: `Lợi nhuận (${fmtUsd(profitUsd)} USD/khách)`, values: loiNhuan, kind: "profit" },
    { key: "gia_pax", label: "GIÁ BÁN / KHÁCH", values: giaPerPax, kind: "price" },
    { key: "usd_pax", label: "≈ USD / khách", values: usdPerPax, kind: "usd" },
    { key: "bien", label: "Biên lợi nhuận %", values: bienPct, kind: "pct" },
  ];

  return { guests, configs, xr, groups, footer };
}

/** Bảng costing XEM TRƯỚC cho màn review AI: tính trên các dòng ĐANG review
 *  (chưa Áp dụng) nhưng chạy CHÍNH costingSheet với draft hiện tại (xe_gia,
 *  phu_thu, profit_usd, tỷ giá, tier_guests) → số hiển thị khớp 100% bảng
 *  chi phí sau khi bấm Áp dụng. */
export function aiPreviewSheet(
  draft: BaoGiaRow,
  previewItems: BaoGiaItem[],
  soNgay: number,
): CostingSheet | null {
  const ket = draft.ket_qua;
  if (!ket) return null;
  return costingSheet({
    ...draft,
    ket_qua: { ...ket, items: previewItems, so_ngay: Math.max(1, soNgay) },
  });
}
