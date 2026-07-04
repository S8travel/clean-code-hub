import { describe, it, expect } from "vitest";
import {
  resolveAiItems,
  toBaoGiaItems,
  hotelChoiceGroups,
  defaultHotelSelection,
  applyHotelSelection,
  type AiExtractResult,
  type AiExtractItem,
  type ResolveMaps,
  type ResolvedItem,
} from "./bao-gia-ai-resolve";
import type { GiaPhongRow } from "./khach-san-gia-phong";

const gp = (p: Partial<GiaPhongRow> & { id: number; gia: number }): GiaPhongRow => ({
  khach_san_id: 1, ten_giai_doan: null, tu_ngay: null, den_ngay: null,
  loai_phong: null, ghi_chu: null, active: true, ...p,
});

const maps: ResolveMaps = {
  canhDiem: new Map([[10, { ten: "Tây Hồ", gia: 120_000 }], [11, { ten: "Cảnh chưa có giá", gia: null }]]),
  setMenu: new Map([[5, { ten: "Set 300k", gia: 300_000, nhaHangTen: "NH ABC", nhaHangId: 3 }]]),
  nhaHang: new Map([[3, { ten: "NH ABC", foc_khach: null, foc_mien: null }]]),
  khachSan: new Map([[2, { ten: "KS Biển" }]]),
  khachSanGia: new Map([[2, [
    gp({ id: 1, gia: 1_500_000 }),
    gp({ id: 2, gia: 2_200_000, tu_ngay: "2026-06-01", den_ngay: "2026-08-31" }),
  ]]]),
  xe: new Map([[7, { ten: "Xe 16 chỗ", gia: 4_000_000 }]]),
};

const item = (p: Partial<AiExtractItem>): AiExtractItem => ({
  ngay_so: 1, loai: "ticket", bua_an: null, ten_zh: "", ten_vi: "", match: null, ghi_chu: "", ...p,
});
const wrap = (items: AiExtractItem[]): AiExtractResult => ({ ten_chuong_trinh: "T", so_ngay: 1, items });

describe("resolveAiItems — ghép AI với master", () => {
  it("cảnh điểm khớp → giá gia_mac_dinh, status matched", () => {
    const [r] = resolveAiItems(wrap([
      item({ loai: "ticket", ten_vi: "Hồ Tây", match: { table: "canh_diem", id: 10, set_menu_id: null, confidence: 0.9 } }),
    ]), maps);
    expect(r.don_gia).toBe(120_000);
    expect(r.status).toBe("matched");
    expect(r.loai).toBe("ticket");
    expect(r.match_label).toBe("Tây Hồ");
    expect(r.confidence).toBe(0.9);
  });

  it("dich_vu → loai ticket (cùng cách tính)", () => {
    const [r] = resolveAiItems(wrap([
      item({ loai: "dich_vu", match: { table: "canh_diem", id: 10, set_menu_id: null, confidence: 1 } }),
    ]), maps);
    expect(r.loai).toBe("ticket");
    expect(r.don_gia).toBe(120_000);
  });

  it("khớp nhưng cảnh điểm thiếu giá → no_price, don_gia 0", () => {
    const [r] = resolveAiItems(wrap([
      item({ match: { table: "canh_diem", id: 11, set_menu_id: null, confidence: 0.5 } }),
    ]), maps);
    expect(r.status).toBe("no_price");
    expect(r.don_gia).toBe(0);
  });

  it("match=null → unmatched, nhãn 'Chưa khớp'", () => {
    const [r] = resolveAiItems(wrap([item({ ten_vi: "Lạ", match: null })]), maps);
    expect(r.status).toBe("unmatched");
    expect(r.don_gia).toBe(0);
    expect(r.match_label).toBe("Chưa khớp");
  });

  it("id không có trong master → unmatched", () => {
    const [r] = resolveAiItems(wrap([
      item({ match: { table: "canh_diem", id: 999, set_menu_id: null, confidence: 0.3 } }),
    ]), maps);
    expect(r.status).toBe("unmatched");
  });

  it("nhà hàng có set_menu_id → giá set, nhãn 'NH · Set'", () => {
    const [r] = resolveAiItems(wrap([
      item({ loai: "meal", bua_an: "trua", match: { table: "nha_hang", id: 3, set_menu_id: 5, confidence: 0.8 } }),
    ]), maps);
    expect(r.don_gia).toBe(300_000);
    expect(r.status).toBe("matched");
    expect(r.loai).toBe("meal");
    expect(r.bua_an).toBe("trua");
    expect(r.match_label).toBe("NH ABC · Set 300k");
  });

  it("nhà hàng KHÔNG set_menu_id → no_price (chờ user chọn set)", () => {
    const [r] = resolveAiItems(wrap([
      item({ loai: "meal", bua_an: "toi", match: { table: "nha_hang", id: 3, set_menu_id: null, confidence: 0.6 } }),
    ]), maps);
    expect(r.status).toBe("no_price");
    expect(r.don_gia).toBe(0);
    expect(r.match_label).toBe("NH ABC");
  });

  it("khách sạn → giá theo ngày tour (resolveGiaPhong)", () => {
    const mk = (date: string) => resolveAiItems(wrap([
      item({ loai: "hotel", match: { table: "khach_san", id: 2, set_menu_id: null, confidence: 0.95 } }),
    ]), maps, date)[0];
    expect(mk("2026-07-15").don_gia).toBe(2_200_000); // mùa hè
    expect(mk("2026-03-10").don_gia).toBe(1_500_000); // mặc định
    expect(mk("2026-07-15").loai).toBe("hotel");
  });

  it("xe → giá nha_xe_loai_xe", () => {
    const [r] = resolveAiItems(wrap([
      item({ loai: "transport", match: { table: "nha_xe_loai_xe", id: 7, set_menu_id: null, confidence: 1 } }),
    ]), maps);
    expect(r.don_gia).toBe(4_000_000);
    expect(r.loai).toBe("transport");
  });

  it("mo_ta ưu tiên ten_vi, fallback ten_zh", () => {
    const [a] = resolveAiItems(wrap([item({ ten_vi: "Tây Hồ", ten_zh: "西湖" })]), maps);
    expect(a.mo_ta).toBe("Tây Hồ");
    const [b] = resolveAiItems(wrap([item({ ten_vi: "", ten_zh: "西湖" })]), maps);
    expect(b.mo_ta).toBe("西湖");
  });

  it("bua_an chỉ giữ cho meal", () => {
    const [r] = resolveAiItems(wrap([item({ loai: "ticket", bua_an: "trua" })]), maps);
    expect(r.bua_an).toBeUndefined();
  });
});

describe("hotel choice groups — 1 đêm nhiều KS, chọn 1", () => {
  const ri = (p: Partial<ResolvedItem> & { ngay_so: number; loai: ResolvedItem["loai"]; don_gia: number; mo_ta: string }): ResolvedItem => ({
    bua_an: undefined, foc: 0, ten_zh: "", ten_vi: "", ghi_chu: "", confidence: 1,
    status: p.don_gia > 0 ? "matched" : "no_price", match_label: "", ...p,
  });

  // Đêm 1: 2 KS (phương án). Đêm 2: 1 KS. + 1 vé.
  const rows: ResolvedItem[] = [
    ri({ ngay_so: 1, loai: "hotel", mo_ta: "KS A 3*", don_gia: 1_000_000 }),
    ri({ ngay_so: 1, loai: "hotel", mo_ta: "KS B 4*", don_gia: 1_800_000 }),
    ri({ ngay_so: 1, loai: "ticket", mo_ta: "Vé", don_gia: 100_000 }),
    ri({ ngay_so: 2, loai: "hotel", mo_ta: "KS C", don_gia: 1_200_000 }),
  ];

  it("chỉ gom đêm có ≥2 KS (đêm 1), bỏ qua đêm 1-KS + non-hotel", () => {
    const g = hotelChoiceGroups(rows);
    expect([...g.keys()]).toEqual([1]);
    expect(g.get(1)).toEqual([0, 1]);
  });

  it("default chọn KS có giá đầu tiên", () => {
    const g = hotelChoiceGroups(rows);
    expect(defaultHotelSelection(rows, g)).toEqual({ 1: 0 });
  });

  it("default: nếu KS đầu chưa có giá, chọn KS có giá", () => {
    const r2 = [
      ri({ ngay_so: 1, loai: "hotel", mo_ta: "KS A", don_gia: 0 }),
      ri({ ngay_so: 1, loai: "hotel", mo_ta: "KS B", don_gia: 1_800_000 }),
    ];
    const g = hotelChoiceGroups(r2);
    expect(defaultHotelSelection(r2, g)).toEqual({ 1: 1 });
  });

  it("apply: giữ KS được chọn + vé + KS đêm 2; bỏ KS không chọn", () => {
    const g = hotelChoiceGroups(rows);
    const kept = applyHotelSelection(rows, g, { 1: 1 }); // chọn KS B
    expect(kept.map((r) => r.mo_ta)).toEqual(["KS B 4*", "Vé", "KS C"]);
  });

  it("không có nhóm phương án → giữ nguyên tất cả", () => {
    const single = [ri({ ngay_so: 1, loai: "hotel", mo_ta: "KS A", don_gia: 1_000_000 })];
    const g = hotelChoiceGroups(single);
    expect(g.size).toBe(0);
    expect(applyHotelSelection(single, g, {})).toHaveLength(1);
  });
});

describe("toBaoGiaItems — chuyển sang BaoGiaItem", () => {
  it("map đủ field + giữ bua_an khi có", () => {
    const rows = resolveAiItems(wrap([
      item({ loai: "meal", bua_an: "trua", ten_vi: "Cơm", match: { table: "nha_hang", id: 3, set_menu_id: 5, confidence: 1 } }),
      item({ loai: "ticket", ten_vi: "Vé", match: { table: "canh_diem", id: 10, set_menu_id: null, confidence: 1 } }),
    ]), maps);
    const items = toBaoGiaItems(rows);
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({ loai: "meal", mo_ta: "Cơm", don_gia: 300_000, ngay_so: 1, bua_an: "trua", foc: 0 });
    expect(items[1].bua_an).toBeUndefined();
    expect(items[1]).toMatchObject({ loai: "ticket", don_gia: 120_000 });
  });
});
