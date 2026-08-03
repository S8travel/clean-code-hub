import { describe, it, expect } from "vitest";
import {
  getSoKhachText, groupKsRows, ksLeftoverDisplay,
  getActualSummaryValue, getChiPhiNetBase, getChiPhiThucTe,
  parseNHMoTa, mergeNHRows, buildVoucherNote,
} from "./export-chi-phi-excel";
import type { ExportDoan } from "./export-chi-phi-excel";
import type { ChiPhiRow } from "@/hooks/use-chi-phi";
import type { CoveredInfo } from "@/lib/voucher";

const doan = (p: Partial<ExportDoan>): ExportDoan => p;

// Tạo ChiPhiRow KS tối giản cho test grouping.
const ksRow = (p: Partial<ChiPhiRow> & { id: number }): ChiPhiRow => ({
  doan_id: 78, ngay_so: null, loai: "chi", danh_muc: "khach_san",
  ref_doan_ngay_item_id: null, ref_doan_ngay_id: null, mo_ta: "", don_gia: 0,
  so_luong: 0, thanh_tien: 0, trang_thai_thanh_toan: "unpaid", ngay_thanh_toan: null,
  created_at: "", tien_cong_ty: 0, tien_hdv: 0, nha_cung_cap_id: null,
  trang_thai_dntt: "chua_gui", de_nghi_tt_id: null, so_tien_da_dntt: 0, so_tien_da_tt: 0,
  thanh_tien_thuc_te: null, thanh_toan_dinh_ky: false, foc_khach_snapshot: null,
  foc_mien_snapshot: null, chiet_khau_phan_tram_snapshot: null, loai_row: "phong",
  foc_count: 0, is_overridden: false, tien_te_loai: null, ty_gia: null,
  chiet_khau_pct: null, don_gia_raw: null, vat_pct: null, trang_thai_hoa_don: null,
  ...p,
}) as ChiPhiRow;

// Chi phí NET vs GROSS — bug đoàn PQC06VJ260528YJ: nhà hàng có chiết khấu 5%
// (món BABABA: gross 4.185.000, HDV trả net 3.975.750, chênh 209.250). row.thanh_tien
// là GROSS (don_gia*so_luong) → KHÔNG dùng cho "Thành tiền"/"Thực tế"; phải dùng NET.
describe("getChiPhiNetBase / getChiPhiThucTe — dùng NET, không dùng thanh_tien gross", () => {
  it("NH HDV trả + chiết khấu 5% → net = tien_hdv (3.975.750), KHÔNG phải gross 4.185.000", () => {
    const r = ksRow({ id: 1, danh_muc: "nha_hang", thanh_tien: 4185000, tien_cong_ty: 0, tien_hdv: 3975750 });
    expect(getChiPhiNetBase(r)).toBe(3975750);
    expect(getChiPhiThucTe(r)).toBe(3975750);
  });

  it("NH công ty trả + chiết khấu → net = tien_cong_ty (sau CK), KHÔNG phải gross", () => {
    const r = ksRow({ id: 2, danh_muc: "nha_hang", thanh_tien: 4185000, tien_cong_ty: 3975750, tien_hdv: 0 });
    expect(getChiPhiNetBase(r)).toBe(3975750);
  });

  it("có điều chỉnh (thanh_tien_thuc_te) → getChiPhiThucTe ưu tiên số điều chỉnh", () => {
    const r = ksRow({ id: 3, danh_muc: "nha_hang", thanh_tien: 4185000, tien_cong_ty: 4050000, tien_hdv: 0, thanh_tien_thuc_te: 5000000 });
    expect(getChiPhiThucTe(r)).toBe(5000000);
    expect(getChiPhiNetBase(r)).toBe(4050000); // base vẫn net, không dính điều chỉnh
  });
});

describe("getActualSummaryValue — bảng CÔNG TY THANH TOÁN chỉ tính phần công ty", () => {
  it("NH HDV trả (cong_ty=0) → 0, KHÔNG lấy gross thanh_tien", () => {
    const r = ksRow({ id: 1, danh_muc: "nha_hang", thanh_tien: 4185000, tien_cong_ty: 0, tien_hdv: 3975750 });
    expect(getActualSummaryValue(r)).toBe(0);
  });

  it("NH công ty trả + chiết khấu → tien_cong_ty (net), KHÔNG phải gross", () => {
    const r = ksRow({ id: 2, danh_muc: "nha_hang", thanh_tien: 4185000, tien_cong_ty: 3975750, tien_hdv: 0 });
    expect(getActualSummaryValue(r)).toBe(3975750);
  });

  it("có điều chỉnh → dùng thanh_tien_thuc_te", () => {
    const r = ksRow({ id: 3, danh_muc: "khach_san", thanh_tien: 4000000, tien_cong_ty: 4000000, thanh_tien_thuc_te: 4200000 });
    expect(getActualSummaryValue(r)).toBe(4200000);
  });

  it("hạng mục khác (xe) → tien_cong_ty", () => {
    const r = ksRow({ id: 4, danh_muc: "xe", loai: "xe", thanh_tien: 21792240, tien_cong_ty: 21792240, tien_hdv: 0 });
    expect(getActualSummaryValue(r)).toBe(21792240);
  });

  it("kịch bản đoàn 246: tổng NH theo getActualSummaryValue = 24.984.000 (công ty), KHÔNG phải gross 31.297.301", () => {
    // 2 dòng đại diện: 1 công ty (4.050.000) + 1 HDV trả có CK (gross 4.185.000 / hdv 3.975.750)
    const congTy = ksRow({ id: 10, danh_muc: "nha_hang", thanh_tien: 4050000, tien_cong_ty: 4050000, tien_hdv: 0 });
    const hdvCK = ksRow({ id: 11, danh_muc: "nha_hang", thanh_tien: 4185000, tien_cong_ty: 0, tien_hdv: 3975750 });
    const sumCty = [congTy, hdvCK].reduce((s, r) => s + getActualSummaryValue(r), 0);
    expect(sumCty).toBe(4050000); // chỉ phần công ty; gross sẽ là 8.235.000 (sai)
  });
});

describe("getSoKhachText", () => {
  it("ghép đủ breakdown NL · TE 50% · TE free · TL + tổng (khớp trang điều tour)", () => {
    // Ca thực tế đoàn SHI-PQC6D-260604: NL 42, TE 50% 5, TE free 1, TL 1 → tổng 49
    expect(
      getSoKhachText(
        doan({ so_khach_lon: 42, so_khach_em1: 5, so_khach_em2: 1, so_khach_tl: 1 })
      )
    ).toBe("49 khách (42 NL, 5 TE 50%, 1 TE free, 1 TL)");
  });

  it("bỏ qua category = 0 cho gọn", () => {
    expect(getSoKhachText(doan({ so_khach_lon: 30, so_khach_tl: 1 }))).toBe(
      "31 khách (30 NL, 1 TL)"
    );
  });

  it("không có breakdown chi tiết → fallback dùng so_khach tổng", () => {
    expect(getSoKhachText(doan({ so_khach: 20 }))).toBe("20 khách");
  });

  it("rỗng → 0 khách (không crash)", () => {
    expect(getSoKhachText(doan({}))).toBe("0 khách");
  });
});

describe("groupKsRows — tách day-use khỏi KS qua đêm (bug đoàn S8SAPA6D0529-FY)", () => {
  // Mô phỏng data thật: đêm 469 (01/06) & 470 (02/06) = The Watson (ks 30);
  // day-use item 12742 (01/06) + 9502 (02/06) cũng mang ref_doan_ngay_id 469/470.
  const dayUseItemMap = {
    12742: { khach_san_id: 99, ngay_date: "2026-06-01", canh_diem_ten: "Watson Day Use" },
    9502: { khach_san_id: 88, ngay_date: "2026-06-02", canh_diem_ten: "Sea Octopus Day Cruise" },
  };
  const rows: ChiPhiRow[] = [
    // overnight 01/06
    ksRow({ id: 2878, mo_ta: "7 twn 1 trip", so_luong: 8, ref_doan_ngay_id: 469, tien_cong_ty: 8_400_000 }),
    ksRow({ id: 3548, mo_ta: "phụ thu trẻ em", so_luong: 1, ref_doan_ngay_id: 469, tien_cong_ty: 200_000 }),
    // day-use 01/06 (CÓ cả ref_doan_ngay_id 469 lẫn item 12742)
    ksRow({ id: 2870, mo_ta: "Day Use 7 twn 1 trip", so_luong: 8, ref_doan_ngay_id: 469, ref_doan_ngay_item_id: 12742, tien_cong_ty: 8_400_000 }),
    // overnight 02/06
    ksRow({ id: 2880, mo_ta: "7 twn 1 trip", so_luong: 8, ref_doan_ngay_id: 470, tien_cong_ty: 8_400_000 }),
    // day-use 02/06 (Sea Octopus) — 2 row cùng item 9502
    ksRow({ id: 2883, mo_ta: "17 pax vé vịnh", so_luong: 17, ref_doan_ngay_id: 470, ref_doan_ngay_item_id: 9502, tien_cong_ty: 5_270_000 }),
    ksRow({ id: 2884, mo_ta: "1 trẻ em 10 tuổi", so_luong: 1, ref_doan_ngay_id: 470, ref_doan_ngay_item_id: 9502, tien_cong_ty: 540_000 }),
  ];

  it("day-use KHÔNG lọt vào KS qua đêm; gom riêng theo (ks|ngày)", () => {
    const g = groupKsRows(rows, dayUseItemMap);
    // Đêm 469/470 chỉ còn phòng overnight (KHÔNG có Day Use / vé vịnh)
    expect(g.ksCostByNgay.get(469)!.map((r) => r.id)).toEqual([2878, 3548]);
    expect(g.ksCostByNgay.get(470)!.map((r) => r.id)).toEqual([2880]);
    // Day-use tách thành 2 nhóm riêng
    expect(g.dayUseGroups.size).toBe(2);
    expect(g.dayUseGroups.get("99|2026-06-01")!.rows.map((r) => r.id)).toEqual([2870]);
    expect(g.dayUseGroups.get("88|2026-06-02")!.rows.map((r) => r.id)).toEqual([2883, 2884]);
  });

  it("tổng tiền cộng đủ MỌI row (day-use vẫn trong tổng KS — không lệch grand-total)", () => {
    const g = groupKsRows(rows, dayUseItemMap);
    expect(g.totalCtyKS).toBe(8_400_000 + 200_000 + 8_400_000 + 8_400_000 + 5_270_000 + 540_000);
  });

  it("không có dayUseItemMap → hành vi cũ (gom hết theo đêm)", () => {
    const g = groupKsRows(rows, {});
    expect(g.dayUseGroups.size).toBe(0);
    expect(g.ksCostByNgay.get(469)!.map((r) => r.id)).toEqual([2878, 3548, 2870]);
    expect(g.ksCostByNgay.get(470)!.map((r) => r.id)).toEqual([2880, 2883, 2884]);
  });
});

// Dòng KS ngoài tour (ref NULL) có neo khach_san_id + ngoai_tour_ci/co trong DB
// (bug đoàn S8DAD260717-K: bản in ra "—" hết dù DB đủ tên KS + ngày).
describe("ksLeftoverDisplay — dòng KS ngoài tour phải in tên KS + C/I-C/O", () => {
  const khachSanMap = { 58: { ten: "Wyndham Soleil Danang" } };

  it("có neo + ngày → tên KS + ngày định dạng dd/MM/yyyy", () => {
    const d = ksLeftoverDisplay(
      { khach_san_id: 58, ngoai_tour_ci: "2026-07-17", ngoai_tour_co: "2026-07-21" },
      khachSanMap,
    );
    expect(d).toEqual({ ksTen: "Wyndham Soleil Danang", ci: "17/07/2026", co: "21/07/2026" });
  });

  it("không neo / KS thiếu trong map / không ngày → giữ '—'", () => {
    expect(ksLeftoverDisplay({ khach_san_id: null, ngoai_tour_ci: null, ngoai_tour_co: null }, khachSanMap))
      .toEqual({ ksTen: "—", ci: "—", co: "—" });
    expect(ksLeftoverDisplay({ khach_san_id: 999, ngoai_tour_ci: null, ngoai_tour_co: null }, khachSanMap).ksTen)
      .toBe("—");
  });
});

// Voucher trên bản in Excel — bug thật đã xảy ra: bữa tối phủ voucher tặng nguyên
// đoàn (17 vé) → tien_cong_ty = 0, Excel trống ô CTY TT mà không nói lý do.
// buildVoucherNote sinh ghi chú từ redemption map.
describe("buildVoucherNote — ghi chú voucher cho dòng chi phí trên Excel", () => {
  const covered = (p: Partial<CoveredInfo>): CoveredInfo => ({
    redemptionId: 33, voucherId: 7, giaTri: 20_400_000, soVe: 17,
    voucherTen: "Voucher NH Động X", voucherLoai: "tang", dnttId: null,
    ...p,
  });

  it("dòng phủ voucher → 'Voucher N vé'; kèm tên khi withTen (sheet Chi tiết)", () => {
    const map = { 5108: covered({}) };
    expect(buildVoucherNote([5108], map)).toBe("Voucher 17 vé");
    expect(buildVoucherNote([5108], map, true)).toBe("Voucher 17 vé — Voucher NH Động X");
  });

  it("dòng không phủ / map rỗng → '' (không đụng dòng thường)", () => {
    expect(buildVoucherNote([5108], {})).toBe("");
    expect(buildVoucherNote([1, 2], { 5108: covered({}) })).toBe("");
  });

  it("redemption legacy soVe = 0 → vẫn ghi 'Voucher' (không ghi '0 vé')", () => {
    expect(buildVoucherNote([5108], { 5108: covered({ soVe: 0 }) })).toBe("Voucher");
  });

  it("nhóm gộp nhiều dòng phủ → cộng vé, tên không lặp", () => {
    const map = { 1: covered({ soVe: 10 }), 2: covered({ redemptionId: 34, soVe: 7 }) };
    expect(buildVoucherNote([1, 2], map)).toBe("Voucher 17 vé");
    expect(buildVoucherNote([1, 2], map, true)).toBe("Voucher 17 vé — Voucher NH Động X");
  });
});

describe("mergeNHRows — gộp dòng NH giữ đủ id gốc để tra voucher", () => {
  it("2 dòng cùng (tên, đơn giá) gộp 1 dòng in, mergedIds giữ CẢ 2 id (voucher có thể gắn dòng sau)", () => {
    const rows = [
      ksRow({ id: 5107, danh_muc: "nha_hang", mo_ta: "[toi] NHÀ HÀNG X", so_luong: 5, don_gia: 1_200_000, tien_cong_ty: 6_000_000 }),
      ksRow({ id: 5108, danh_muc: "nha_hang", mo_ta: "[toi] NHÀ HÀNG X", so_luong: 12, don_gia: 1_200_000, tien_cong_ty: 0 }),
    ];
    const merged = mergeNHRows(rows);
    expect(merged).toHaveLength(1);
    expect(merged[0].mergedIds).toEqual([5107, 5108]);
    expect(merged[0].so_luong).toBe(17);
    // Voucher gắn dòng ĐỨNG SAU (5108) vẫn dò ra qua mergedIds
    const map: Record<number, CoveredInfo> = {
      5108: { redemptionId: 33, voucherId: 7, giaTri: 20_400_000, soVe: 17, voucherTen: "Voucher NH Động X", voucherLoai: "tang", dnttId: null },
    };
    expect(buildVoucherNote(merged[0].mergedIds, map)).toBe("Voucher 17 vé");
  });

  it("khác đơn giá → KHÔNG gộp, mỗi dòng mang id riêng", () => {
    const rows = [
      ksRow({ id: 1, danh_muc: "nha_hang", mo_ta: "[trua] NHÀ HÀNG Y", so_luong: 17, don_gia: 666_424 }),
      ksRow({ id: 2, danh_muc: "nha_hang", mo_ta: "[trua] NHÀ HÀNG Y", so_luong: 1, don_gia: 120_000 }),
    ];
    const merged = mergeNHRows(rows);
    expect(merged).toHaveLength(2);
    expect(merged.map((r) => r.mergedIds)).toEqual([[1], [2]]);
  });
});

describe("parseNHMoTa", () => {
  it("prefix [trua]/[toi] + hậu tố '(trưa)/(tối)' + mo_ta trơn", () => {
    expect(parseNHMoTa("[trua] NHÀ HÀNG Y")).toEqual({ bua: "trua", name: "NHÀ HÀNG Y" });
    expect(parseNHMoTa("[toi] NHÀ HÀNG X")).toEqual({ bua: "toi", name: "NHÀ HÀNG X" });
    expect(parseNHMoTa("NHÀ HÀNG X (tối)")).toEqual({ bua: "toi", name: "NHÀ HÀNG X" });
    expect(parseNHMoTa("NƯỚC SUỐI ĐOÀN")).toEqual({ bua: null, name: "NƯỚC SUỐI ĐOÀN" });
    expect(parseNHMoTa(null)).toEqual({ bua: null, name: "—" });
  });
});
