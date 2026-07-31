import { describe, it, expect } from "vitest";
import {
  resolveAiItems,
  toBaoGiaItems,
  hotelChoiceGroups,
  defaultHotelSelection,
  applyHotelSelection,
  applyExclusions,
  analyzeCombo,
  comboCoversBua,
  comboPatchForRef,
  detectComboTuText,
  droppedByHotel,
  sanitizeDraftRows,
  giaPhongWritebacks,
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
  canhDiem: new Map([
    [10, { ten: "Tây Hồ", gia: 120_000 }],
    [11, { ten: "Cảnh chưa có giá", gia: null }],
    [12, {
      ten: "Bà Nà — combo cáp treo + buffet",
      gia: 900_000,
      bao_gom_bua_an: "trua" as const,
      bao_gom_ghi_chu: "buffet trưa trên đỉnh",
    }],
    [13, { ten: "Du thuyền trọn gói", gia: 2_000_000, bao_gom_bua_an: "ca_hai" as const }],
  ]),
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

describe("combo đã gồm bữa ăn — chống tính tiền 2 lần", () => {
  const ri = (p: Partial<ResolvedItem> & { ngay_so: number; loai: ResolvedItem["loai"]; mo_ta: string }): ResolvedItem => ({
    don_gia: 100_000, bua_an: undefined, foc: 0, ten_zh: "", ten_vi: "", ghi_chu: "",
    confidence: 1, status: "matched", match_label: "", ...p,
  });
  const ve = (p: Partial<ResolvedItem> = {}) =>
    ri({ ngay_so: 1, loai: "ticket", mo_ta: "Bà Nà combo", don_gia: 900_000, ...p });
  const an = (p: Partial<ResolvedItem> = {}) =>
    ri({ ngay_so: 1, loai: "meal", bua_an: "trua", mo_ta: "Buffet trưa", don_gia: 300_000, ...p });

  it("comboCoversBua: ca_hai phủ mọi bữa; trua KHÔNG phủ dòng ăn thiếu bua_an", () => {
    expect(comboCoversBua("ca_hai", "trua")).toBe(true);
    expect(comboCoversBua("ca_hai", "toi")).toBe(true);
    expect(comboCoversBua("ca_hai", undefined)).toBe(true);
    expect(comboCoversBua("trua", "trua")).toBe(true);
    expect(comboCoversBua("trua", "toi")).toBe(false);
    expect(comboCoversBua("trua", undefined)).toBe(false); // không đoán bừa
  });

  it("detectComboTuText: bắt được bữa, hoặc 'khong_ro', hoặc null", () => {
    expect(detectComboTuText("九猴山纜車含午餐")).toBe("trua");
    expect(detectComboTuText("Du thuyền (bao gồm ăn tối)")).toBe("toi");
    expect(detectComboTuText("套票含午餐", "và ăn tối")).toBe("ca_hai");
    expect(detectComboTuText("Vé combo cáp treo Bà Nà")).toBe("khong_ro");
    expect(detectComboTuText("Vé tham quan Tây Hồ")).toBe(null);
    expect(detectComboTuText("")).toBe(null);
  });

  it("cờ danh mục → ẩn dòng ăn cùng ngày, KHÔNG vào báo giá", () => {
    const rows = [ve({ bao_gom_bua_an: "trua", bao_gom_nguon: "master" }), an()];
    const c = analyzeCombo(rows);
    expect(c.suppressed.get(1)).toMatchObject({ byIdx: 0, bua: "trua" });
    expect(c.warnings.size).toBe(0);
    const kept = applyExclusions(rows, new Map(), {}, c);
    expect(kept.map((r) => r.mo_ta)).toEqual(["Bà Nà combo"]);
  });

  it("combo trưa KHÔNG đụng bữa tối, cũng không đụng ngày khác", () => {
    const rows = [
      ve({ bao_gom_bua_an: "trua" }),
      an({ bua_an: "toi", mo_ta: "Ăn tối" }),
      an({ ngay_so: 2, mo_ta: "Trưa ngày 2" }),
    ];
    expect(analyzeCombo(rows).suppressed.size).toBe(0);
  });

  it("ca_hai phủ cả trưa lẫn tối lẫn dòng ăn không khai bữa", () => {
    const rows = [
      ve({ bao_gom_bua_an: "ca_hai" }),
      an({ mo_ta: "Trưa" }),
      an({ bua_an: "toi", mo_ta: "Tối" }),
      an({ bua_an: undefined, mo_ta: "Bữa không rõ" }),
    ];
    expect([...analyzeCombo(rows).suppressed.keys()]).toEqual([1, 2, 3]);
  });

  it("2 combo cùng phủ 1 bữa → combo ĐẦU TIÊN làm chủ, không nhân đôi", () => {
    const rows = [
      ve({ bao_gom_bua_an: "trua", mo_ta: "Combo A" }),
      ve({ bao_gom_bua_an: "ca_hai", mo_ta: "Combo B" }),
      an(),
    ];
    const c = analyzeCombo(rows);
    expect(c.suppressed.size).toBe(1);
    expect(c.suppressed.get(2)?.byIdx).toBe(0);
  });

  it("tinh_rieng → tính lại bình thường, ghi vào overridden để UI hoàn tác", () => {
    const rows = [ve({ bao_gom_bua_an: "trua" }), an({ tinh_rieng: true })];
    const c = analyzeCombo(rows);
    expect(c.suppressed.size).toBe(0);
    expect(c.overridden.has(1)).toBe(true);
    expect(applyExclusions(rows, new Map(), {}, c)).toHaveLength(2);
  });

  it("AI khai da_bao_gom → CHỈ cảnh báo, TUYỆT ĐỐI không tự bỏ dòng ăn", () => {
    const rows = [ve({ ai_bao_gom: "trua" }), an()];
    const c = analyzeCombo(rows);
    expect(c.suppressed.size).toBe(0); // bỏ theo phỏng đoán của model = báo giá hụt tiền
    expect(c.warnings.get(0)).toMatchObject({ bua: "trua", mealIdxs: [1], nguon: "ai" });
    expect(applyExclusions(rows, new Map(), {}, c)).toHaveLength(2);
  });

  it("từ khoá trong tên → cảnh báo nguon 'text', bữa null khi không rõ", () => {
    const rows = [ve({ mo_ta: "Vé combo cáp treo Bà Nà" }), an()];
    const w = analyzeCombo(rows).warnings.get(0);
    expect(w).toMatchObject({ bua: null, nguon: "text" });
    expect(w?.mealIdxs).toEqual([1]);
  });

  it("bo_qua_combo → tắt cảnh báo; ngày không có dòng ăn → không cảnh báo", () => {
    expect(analyzeCombo([ve({ ai_bao_gom: "trua", bo_qua_combo: true }), an()]).warnings.size).toBe(0);
    expect(analyzeCombo([ve({ ai_bao_gom: "trua" }), an({ ngay_so: 3 })]).warnings.size).toBe(0);
  });

  it("đã xác nhận cờ combo → hết cảnh báo (không vừa ẩn vừa nhắc)", () => {
    const c = analyzeCombo([ve({ bao_gom_bua_an: "trua", ai_bao_gom: "trua" }), an()]);
    expect(c.suppressed.size).toBe(1);
    expect(c.warnings.size).toBe(0);
  });

  it("resolve: lấy cờ combo từ danh mục + giữ cờ AI riêng", () => {
    const [combo, thuong] = resolveAiItems(wrap([
      item({ loai: "ticket", match: { table: "canh_diem", id: 12, set_menu_id: null, confidence: 0.9 }, da_bao_gom: "trua" }),
      item({ loai: "ticket", match: { table: "canh_diem", id: 10, set_menu_id: null, confidence: 0.9 } }),
    ]), maps);
    expect(combo).toMatchObject({
      don_gia: 900_000, bao_gom_bua_an: "trua", bao_gom_nguon: "master",
      bao_gom_ghi_chu: "buffet trưa trên đỉnh", ai_bao_gom: "trua",
    });
    expect(thuong.bao_gom_bua_an).toBeUndefined();
    expect(thuong.ai_bao_gom).toBeNull();
  });

  it("AI trả cờ rác ('lunch') → bỏ qua, không thành nhãn undefined", () => {
    const [r] = resolveAiItems(wrap([
      item({ loai: "ticket", da_bao_gom: "lunch" as unknown as "trua" }),
    ]), maps);
    expect(r.ai_bao_gom).toBeNull();
  });

  it("resolve đầu-cuối: vé Bà Nà + buffet trưa → chỉ còn tiền vé", () => {
    const rows = resolveAiItems(wrap([
      item({ ngay_so: 2, loai: "ticket", ten_vi: "Bà Nà", match: { table: "canh_diem", id: 12, set_menu_id: null, confidence: 0.9 } }),
      item({ ngay_so: 2, loai: "meal", bua_an: "trua", ten_vi: "Buffet", match: { table: "nha_hang", id: 3, set_menu_id: 5, confidence: 0.9 } }),
    ]), maps);
    const kept = applyExclusions(rows, new Map(), {}, analyzeCombo(rows));
    expect(kept.reduce((s, r) => s + r.don_gia, 0)).toBe(900_000); // KHÔNG cộng 300k buffet
  });

  it("applyExclusions gộp cả 2 lý do loại: KS không chọn + bữa đã gồm", () => {
    const rows = [
      ri({ ngay_so: 1, loai: "hotel", mo_ta: "KS A", don_gia: 1_000_000 }),
      ri({ ngay_so: 1, loai: "hotel", mo_ta: "KS B", don_gia: 1_800_000 }),
      ve({ bao_gom_bua_an: "trua" }),
      an(),
    ];
    const g = hotelChoiceGroups(rows);
    const kept = applyExclusions(rows, g, { 1: 1 }, analyzeCombo(rows));
    expect(kept.map((r) => r.mo_ta)).toEqual(["KS B", "Bà Nà combo"]);
  });

  it("toBaoGiaItems: vé combo ghi rõ đã gồm bữa nào (bữa ăn đã bị ẩn)", () => {
    const [it1] = toBaoGiaItems([ve({ bao_gom_bua_an: "trua", bao_gom_ghi_chu: "buffet trên đỉnh" })]);
    expect(it1.ghi_chu).toBe("Đã gồm ăn trưa (buffet trên đỉnh)");
    const [it2] = toBaoGiaItems([ve({ bao_gom_bua_an: "toi", ghi_chu: "Vé vào cổng" })]);
    expect(it2.ghi_chu).toBe("Vé vào cổng · Đã gồm ăn tối");
    const [it3] = toBaoGiaItems([ve({ ghi_chu: "Vé thường" })]);
    expect(it3.ghi_chu).toBe("Vé thường");
  });

  // ── Các lỗi bắt được ở vòng soát phản biện ──

  it("khai gồm trưa mà dòng ăn KHÔNG rõ bữa → không trừ được thì phải CẢNH BÁO, không im lặng", () => {
    const rows = [ve({ bao_gom_bua_an: "trua" }), an({ bua_an: undefined, mo_ta: "Buffet trên đỉnh" })];
    const c = analyzeCombo(rows);
    expect(c.suppressed.size).toBe(0); // không đoán bừa
    expect(c.warnings.get(0)).toMatchObject({ bua: "trua", mealIdxs: [1], nguon: "khong_ro_bua" });
  });

  it("khai gồm trưa, ngày chỉ có bữa TỐI → bình thường, không cảnh báo nhiễu", () => {
    const c = analyzeCombo([ve({ bao_gom_bua_an: "trua" }), an({ bua_an: "toi", mo_ta: "Ăn tối" })]);
    expect(c.suppressed.size).toBe(0);
    expect(c.warnings.size).toBe(0);
  });

  it("trừ được rồi thì thôi cảnh báo, dù ngày còn dòng ăn khác", () => {
    const c = analyzeCombo([ve({ bao_gom_bua_an: "trua" }), an(), an({ bua_an: "toi", mo_ta: "Ăn tối" })]);
    expect(c.suppressed.size).toBe(1);
    expect(c.warnings.size).toBe(0);
  });

  it("du thuyền (loai='hotel') / xe trọn gói cũng là nguồn combo hợp lệ", () => {
    const rows = [
      ri({ ngay_so: 1, loai: "hotel", mo_ta: "Du thuyền Hạ Long", don_gia: 2_000_000, bao_gom_bua_an: "toi" }),
      an({ bua_an: "toi", mo_ta: "Ăn tối trên tàu" }),
    ];
    expect(analyzeCombo(rows).suppressed.get(1)).toMatchObject({ byIdx: 0, bua: "toi" });
    // AI khai cờ trên dòng hotel → vẫn được cảnh báo (trước đây bị bỏ qua hoàn toàn)
    const rows2 = [
      ri({ ngay_so: 1, loai: "hotel", mo_ta: "Du thuyền Hạ Long", don_gia: 2_000_000, ai_bao_gom: "toi" }),
      an({ bua_an: "toi", mo_ta: "Ăn tối trên tàu" }),
    ];
    expect(analyzeCombo(rows2).warnings.get(0)).toMatchObject({ bua: "toi", nguon: "ai" });
  });

  it("bua_an rác từ model ('午餐') → coi như không rõ bữa, KHÔNG lọt vào quyết định tiền", () => {
    const [r] = resolveAiItems(wrap([
      item({ loai: "meal", bua_an: "午餐" as unknown as "trua", ten_vi: "Buffet" }),
    ]), maps);
    expect(r.bua_an).toBeUndefined();
  });

  it("comboPatchForRef: nạp cờ dòng danh mục MỚI, và xoá sạch khi dòng mới không phải combo", () => {
    expect(comboPatchForRef(maps, "canh_diem", 12)).toEqual({
      bao_gom_bua_an: "trua", bao_gom_nguon: "master",
      bao_gom_ghi_chu: "buffet trưa trên đỉnh", bo_qua_combo: undefined,
    });
    const xoa = { bao_gom_bua_an: null, bao_gom_nguon: undefined, bao_gom_ghi_chu: undefined, bo_qua_combo: undefined };
    expect(comboPatchForRef(maps, "canh_diem", 10)).toEqual(xoa);   // vé thường
    expect(comboPatchForRef(maps, "khach_san", 2)).toEqual(xoa);    // đổi sang KS
    expect(comboPatchForRef(maps, null, null)).toEqual(xoa);        // gõ tên tay
    expect(comboPatchForRef(undefined, "canh_diem", 12)).toEqual(xoa); // maps chưa tải
  });

  it("đổi dòng danh mục: patch của picker phải xoá cờ cũ, hết ẩn oan bữa ăn", () => {
    const truoc = ve({ bao_gom_bua_an: "trua", bao_gom_nguon: "master", match_table: "canh_diem", match_id: 12 });
    expect(analyzeCombo([truoc, an()]).suppressed.size).toBe(1);
    // OP đổi sang "Tây Hồ" (id 10, vé thường) — mô phỏng đúng patch của pickCatalogForRow
    const sau: ResolvedItem = {
      ...truoc, mo_ta: "Tây Hồ", match_label: "Tây Hồ", match_id: 10, don_gia: 120_000,
      ...comboPatchForRef(maps, "canh_diem", 10),
    };
    expect(analyzeCombo([sau, an()]).suppressed.size).toBe(0);
  });

  it("phương án KS KHÔNG được chọn thì không được trừ bữa ăn", () => {
    const rows = [
      ri({ ngay_so: 2, loai: "hotel", mo_ta: "KS Hạ Long 4*", don_gia: 1_200_000 }),
      ri({ ngay_so: 2, loai: "hotel", mo_ta: "Du thuyền (含晚餐)", don_gia: 3_000_000, bao_gom_bua_an: "toi" }),
      an({ ngay_so: 2, bua_an: "toi", mo_ta: "Ăn tối", don_gia: 400_000 }),
    ];
    const g = hotelChoiceGroups(rows);
    // OP chọn KS thường (index 0) → du thuyền rớt khỏi báo giá, không được ẩn bữa tối.
    const bo = droppedByHotel(g, { 2: 0 });
    const c = analyzeCombo(rows, bo);
    expect(c.suppressed.size).toBe(0);
    expect(applyExclusions(rows, g, { 2: 0 }, c).reduce((s, r) => s + r.don_gia, 0)).toBe(1_600_000);
    // Chọn du thuyền → bữa tối mới bị trừ.
    const c2 = analyzeCombo(rows, droppedByHotel(g, { 2: 1 }));
    expect(c2.suppressed.size).toBe(1);
    expect(applyExclusions(rows, g, { 2: 1 }, c2).reduce((s, r) => s + r.don_gia, 0)).toBe(3_000_000);
  });

  it("từ khoá: không bắt nhầm 'quán trưa', không bắt khi text nói tự túc", () => {
    expect(detectComboTuText("Quán trưa Cầu Vàng")).toBe(null);
    expect(detectComboTuText("Vé tham quan tối Phượng Hoàng Cổ Trấn")).toBe(null);
    expect(detectComboTuText("Vé tàu cao tốc, ăn trưa tự túc")).toBe(null);
    expect(detectComboTuText("門票不含餐")).toBe(null);
    // vẫn phải bắt được combo thật
    expect(detectComboTuText("Sunworld Hòn Thơm (cáp treo 2 chiều + buffet)")).toBe("khong_ro");
    expect(detectComboTuText("Vé du thuyền, đã bao gồm ăn trưa")).toBe("trua");
  });

  it("đoán theo từ khoá chỉ áp cho dòng VÉ — xe/KS không bắn cảnh báo rác", () => {
    const xe = ri({ ngay_so: 1, loai: "transport", mo_ta: "Xe 45 chỗ trọn gói", don_gia: 5_000_000 });
    const ks = ri({ ngay_so: 1, loai: "hotel", mo_ta: "KS 4* (đã gồm buffet sáng)", don_gia: 1_000_000 });
    expect(analyzeCombo([xe, ks, an()]).warnings.size).toBe(0);
    // nhưng cờ AI trên chính dòng xe/KS thì vẫn nhận
    expect(analyzeCombo([{ ...xe, ai_bao_gom: "trua" }, an()]).warnings.size).toBe(1);
  });

  it("sanitizeDraftRows: nháp cũ có bua_an rác → hết lọt qua cả 2 lưới", () => {
    const nhap = [
      ve({ bao_gom_bua_an: "trua" }),
      an({ bua_an: "午餐" as unknown as "trua" }),
    ];
    // Trước khi lọc: không trừ được mà cũng không cảnh báo (rác là truthy).
    expect(analyzeCombo(nhap).warnings.size).toBe(0);
    const sach = sanitizeDraftRows(nhap);
    expect(sach[1].bua_an).toBeUndefined();
    expect(analyzeCombo(sach).warnings.get(0)).toMatchObject({ nguon: "khong_ro_bua" });
  });

  it("ghi chú 'Đã gồm' chỉ dán lên dòng THỰC SỰ đã trừ được bữa", () => {
    const veCombo = ve({ bao_gom_bua_an: "trua" });
    const anRieng = an({ tinh_rieng: true });
    const rows = [veCombo, anRieng];
    const c = analyzeCombo(rows);
    const daTru = new Set<ResolvedItem>();
    for (const s of c.suppressed.values()) daTru.add(rows[s.byIdx]);
    // Chưa trừ được gì (OP bắt tính riêng) → không được ghi "Đã gồm ăn trưa",
    // kẻo người duyệt đọc rồi xoá dòng ăn = hụt tiền.
    expect(toBaoGiaItems([veCombo], daTru)[0].ghi_chu).toBe("");
    // Dòng ĂN lỡ còn cờ cũ cũng không bao giờ mang ghi chú combo.
    expect(toBaoGiaItems([an({ bao_gom_bua_an: "trua", ghi_chu: "Cơm phần" })])[0].ghi_chu).toBe("Cơm phần");
  });
});

describe("giaPhongWritebacks — ghi ngược giá KS nhập tay vào master", () => {
  const hotelRow = (p: Partial<ResolvedItem>): ResolvedItem => ({
    ngay_so: 1, loai: "hotel", mo_ta: "KS Mới", don_gia: 1_200_000,
    ten_zh: "", ten_vi: "KS Mới", ghi_chu: "", confidence: 1,
    status: "matched", match_label: "KS Mới",
    match_table: "khach_san", match_id: 99, match_set_menu_id: null,
    ...p,
  });

  it("KS khớp danh mục + có giá nhập tay + master trống giá → ghi ngược", () => {
    const wb = giaPhongWritebacks([hotelRow({})], maps.khachSanGia);
    expect(wb).toEqual([{ khach_san_id: 99, gia: 1_200_000, ten: "KS Mới" }]);
  });

  it("KS đã có dòng giá trong master → KHÔNG đụng (không đè giá sẵn có)", () => {
    // KS id=2 có 2 dòng giá trong maps.khachSanGia.
    const wb = giaPhongWritebacks([hotelRow({ match_id: 2 })], maps.khachSanGia);
    expect(wb).toEqual([]);
  });

  it("bỏ qua dòng chưa khớp danh mục / chưa có giá / không phải hotel", () => {
    const wb = giaPhongWritebacks([
      hotelRow({ match_table: null, match_id: null }),          // tự nhập, không ref
      hotelRow({ don_gia: 0, status: "no_price" }),              // chưa điền giá
      hotelRow({ loai: "ticket", match_table: "canh_diem" }),    // không phải KS
    ], maps.khachSanGia);
    expect(wb).toEqual([]);
  });

  it("KS ở nhiều đêm → chỉ 1 dòng, lấy giá đêm đầu", () => {
    const wb = giaPhongWritebacks([
      hotelRow({ ngay_so: 1, don_gia: 1_200_000 }),
      hotelRow({ ngay_so: 2, don_gia: 1_500_000 }),
    ], maps.khachSanGia);
    expect(wb).toEqual([{ khach_san_id: 99, gia: 1_200_000, ten: "KS Mới" }]);
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
