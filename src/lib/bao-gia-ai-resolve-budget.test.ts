import { describe, it, expect } from "vitest";
import {
  parseUsdAmount, resolveAiItems, USD_BUDGET_RATE, usdBudgetPrice,
  normalizeAliasKey, aliasKeyOf, aliasesToLearn,
  type ResolveMaps, type AiExtractResult, type AiExtractItem,
  type AliasEntry, type ResolvedItem,
} from "./bao-gia-ai-resolve";

const emptyMaps = (): ResolveMaps => ({
  canhDiem: new Map(), setMenu: new Map(), nhaHang: new Map(),
  khachSan: new Map(), khachSanGia: new Map(), xe: new Map(),
});

const aiItem = (over: Partial<AiExtractItem>): AiExtractItem => ({
  ngay_so: 1, loai: "meal", bua_an: "toi", ten_zh: "", ten_vi: "", match: null, ghi_chu: "", ...over,
});

describe("parseUsdAmount", () => {
  it("bắt các format USD phổ biến", () => {
    expect(parseUsdAmount("海鮮餐合菜 8USD")).toBe(8);
    expect(parseUsdAmount("Set menu 20 USD")).toBe(20);
    expect(parseUsdAmount("USD 12")).toBe(12);
    expect(parseUsdAmount("$15 net")).toBe(15);
    expect(parseUsdAmount("10$")).toBe(10);
    expect(parseUsdAmount("特色餐 8美金")).toBe(8);
    expect(parseUsdAmount("7.5usd/khách")).toBe(7.5);
    expect(parseUsdAmount("7,5usd")).toBe(7.5);
  });
  it("không có USD → null", () => {
    expect(parseUsdAmount("Cơm phong vị Tây Bắc")).toBeNull();
    expect(parseUsdAmount("")).toBeNull();
    expect(parseUsdAmount(null)).toBeNull();
  });
});

describe("usdBudgetPrice", () => {
  it("dòng ăn: usd × 20.000 + 20.000 (7USD=160k, 8USD=180k)", () => {
    expect(usdBudgetPrice(7, "meal")).toBe(160_000);
    expect(usdBudgetPrice(8, "meal")).toBe(180_000);
    expect(usdBudgetPrice(10, "meal")).toBe(220_000);
    expect(usdBudgetPrice(7.5, "meal")).toBe(170_000);
  });
  it("loại khác: usd × 20.000, KHÔNG cộng thêm", () => {
    expect(usdBudgetPrice(7, "ticket")).toBe(140_000);
    expect(usdBudgetPrice(8, "hotel")).toBe(160_000);
    expect(usdBudgetPrice(8, "transport")).toBe(160_000);
  });
});

describe("resolveAiItems — fallback định mức USD", () => {
  it("bữa ăn chung chung 8USD, không khớp NH → 180.000₫, status matched", () => {
    const result: AiExtractResult = {
      ten_chuong_trinh: "", so_ngay: 1,
      items: [aiItem({ ten_zh: "海鮮餐合菜 8USD", ten_vi: "Set hải sản", match: null })],
    };
    const [r] = resolveAiItems(result, emptyMaps());
    expect(r.don_gia).toBe(180_000);
    expect(r.status).toBe("matched");
    expect(r.match_label).toContain("8 USD");
    expect(r.match_label).toContain("+ 20.000");
  });

  it("mức ăn kiểu 越式料理 / 中越式料理 / 中式料理 → 160k / 180k", () => {
    const result: AiExtractResult = {
      ten_chuong_trinh: "", so_ngay: 3,
      items: [
        aiItem({ ngay_so: 1, bua_an: "trua", ten_zh: "越式料理 7USD", ten_vi: "Món Việt", match: null }),
        aiItem({ ngay_so: 2, bua_an: "toi", ten_zh: "中越式料理 8USD", ten_vi: "Món Trung - Việt", match: null }),
        aiItem({ ngay_so: 3, bua_an: "trua", ten_zh: "中式料理 8USD", ten_vi: "Món Trung", match: null }),
      ],
    };
    const rows = resolveAiItems(result, emptyMaps());
    expect(rows.map((r) => r.don_gia)).toEqual([160_000, 180_000, 180_000]);
    expect(rows.every((r) => r.status === "matched")).toBe(true);
  });

  it("dòng KHÔNG phải ăn vẫn giữ định mức × 20.000, không cộng thêm", () => {
    const result: AiExtractResult = {
      ten_chuong_trinh: "", so_ngay: 1,
      items: [aiItem({ loai: "ticket", bua_an: null, ten_zh: "門票 8USD", ten_vi: "Vé lạ", match: null })],
    };
    const [r] = resolveAiItems(result, emptyMaps());
    expect(r.don_gia).toBe(8 * USD_BUDGET_RATE); // 160.000
    expect(r.match_label).not.toContain("+");
  });

  it("bữa ăn khớp set menu có giá → giữ giá danh mục, KHÔNG áp định mức", () => {
    const maps = emptyMaps();
    maps.nhaHang.set(3, { ten: "NH X", foc_khach: null, foc_mien: null });
    maps.setMenu.set(77, { ten: "Set 250k", gia: 250_000, nhaHangTen: "NH X", nhaHangId: 3 });
    const result: AiExtractResult = {
      ten_chuong_trinh: "", so_ngay: 1,
      items: [aiItem({ ten_zh: "中式料理 8USD", ten_vi: "NH X - Set 250k",
        match: { table: "nha_hang", id: 3, set_menu_id: 77, confidence: 0.9 } })],
    };
    const [r] = resolveAiItems(result, maps);
    expect(r.don_gia).toBe(250_000);
  });

  it("không có USD trong mô tả → vẫn chưa khớp, giá 0", () => {
    const result: AiExtractResult = {
      ten_chuong_trinh: "", so_ngay: 1,
      items: [aiItem({ ten_vi: "Cơm phong vị Tây Bắc", match: null })],
    };
    const [r] = resolveAiItems(result, emptyMaps());
    expect(r.don_gia).toBe(0);
    expect(r.status).toBe("unmatched");
  });

  it("đã khớp catalog có giá → KHÔNG override bằng định mức USD", () => {
    const maps = emptyMaps();
    maps.canhDiem.set(5, { ten: "Vé A", gia: 300_000 });
    const result: AiExtractResult = {
      ten_chuong_trinh: "", so_ngay: 1,
      items: [aiItem({ loai: "ticket", bua_an: null, ten_zh: "门票 8USD", ten_vi: "Vé A",
        match: { table: "canh_diem", id: 5, set_menu_id: null, confidence: 0.9 } })],
    };
    const [r] = resolveAiItems(result, maps);
    expect(r.don_gia).toBe(300_000); // giữ giá catalog, không thành 160.000
  });
});

describe("normalizeAliasKey", () => {
  it("bỏ dấu tiếng Việt + lowercase + bỏ token USD", () => {
    expect(normalizeAliasKey("Cầu Kính Rồng Mây")).toBe("cau kinh rong may");
    expect(normalizeAliasKey("玻璃桥 8USD")).toBe("玻璃桥");
    expect(normalizeAliasKey("Set hải sản 8USD")).toBe("set hai san");
    expect(normalizeAliasKey("Đà Nẵng")).toBe("da nang");
  });
  it("idempotent", () => {
    const k = normalizeAliasKey("Cầu Kính 8USD");
    expect(normalizeAliasKey(k)).toBe(k);
  });
});

describe("resolveAiItems — bộ nhớ alias", () => {
  it("alias khớp danh mục: item chưa khớp → tự khớp + lấy giá catalog", () => {
    const maps = emptyMaps();
    maps.canhDiem.set(7, { ten: "Cầu kính Rồng Mây", gia: 200_000 });
    const aliasMap = new Map<string, AliasEntry>([
      [aliasKeyOf("玻璃桥", "ticket"), {
        loai: "ticket", match_table: "canh_diem", target_id: 7, set_menu_id: null,
        ten_hien_thi: "Cầu kính Rồng Mây", gia_override: null,
      }],
    ]);
    const result: AiExtractResult = {
      ten_chuong_trinh: "", so_ngay: 1,
      items: [aiItem({ loai: "ticket", bua_an: null, ten_zh: "玻璃桥", ten_vi: "Cầu kính", match: null })],
    };
    const [r] = resolveAiItems(result, maps, null, aliasMap);
    expect(r.don_gia).toBe(200_000);
    expect(r.from_alias).toBe(true);
    expect(r.status).toBe("matched");
    expect(r.match_label).toContain("↺");
  });

  it("alias chỉ-giá (không ref danh mục) → điền giá đã học", () => {
    const aliasMap = new Map<string, AliasEntry>([
      [aliasKeyOf("海鮮餐", "meal"), {
        loai: "meal", match_table: null, target_id: null, set_menu_id: null,
        ten_hien_thi: "Set hải sản", gia_override: 180_000,
      }],
    ]);
    const result: AiExtractResult = {
      ten_chuong_trinh: "", so_ngay: 1,
      items: [aiItem({ ten_zh: "海鮮餐", ten_vi: "Set hải sản", match: null })],
    };
    const [r] = resolveAiItems(result, emptyMaps(), null, aliasMap);
    expect(r.don_gia).toBe(180_000);
    expect(r.from_alias).toBe(true);
  });

  it("alias do NGƯỜI SỬA TAY thắng cả khi AI khớp chắc", () => {
    const maps = emptyMaps();
    maps.canhDiem.set(5, { ten: "Vé A", gia: 300_000 });
    maps.canhDiem.set(7, { ten: "Vé B (đúng)", gia: 500_000 });
    const aliasMap = new Map<string, AliasEntry>([
      [aliasKeyOf("门票X", "ticket"), {
        loai: "ticket", match_table: "canh_diem", target_id: 7, set_menu_id: null,
        ten_hien_thi: "Vé B (đúng)", gia_override: null, sua_tay: true,
      }],
    ]);
    const result: AiExtractResult = {
      ten_chuong_trinh: "", so_ngay: 1,
      items: [aiItem({ loai: "ticket", bua_an: null, ten_zh: "门票X", ten_vi: "Vé A",
        match: { table: "canh_diem", id: 5, set_menu_id: null, confidence: 0.95 } })],
    };
    const [r] = resolveAiItems(result, maps, null, aliasMap);
    expect(r.match_id).toBe(7);
    expect(r.don_gia).toBe(500_000); // người dạy thắng AI tự tin
    expect(r.from_alias).toBe(true);
  });

  it("alias CHỈ-TÊN (dạy bản dịch): đổi tên, GIỮ nguyên giá đã khớp", () => {
    const maps = emptyMaps();
    maps.canhDiem.set(5, { ten: "Vé A", gia: 300_000 });
    const aliasMap = new Map<string, AliasEntry>([
      [aliasKeyOf("门票X", "ticket"), {
        loai: "ticket", match_table: null, target_id: null, set_menu_id: null,
        ten_hien_thi: "Chùa Một Cột (vé vào)", gia_override: null, sua_tay: true,
      }],
    ]);
    const result: AiExtractResult = {
      ten_chuong_trinh: "", so_ngay: 1,
      items: [aiItem({ loai: "ticket", bua_an: null, ten_zh: "门票X", ten_vi: "Vé dịch sai",
        match: { table: "canh_diem", id: 5, set_menu_id: null, confidence: 0.95 } })],
    };
    const [r] = resolveAiItems(result, maps, null, aliasMap);
    expect(r.mo_ta).toBe("Chùa Một Cột (vé vào)");
    expect(r.don_gia).toBe(300_000); // dạy dịch KHÔNG được làm rơi giá
    expect(r.match_id).toBe(5);
    expect(r.from_alias).toBe(true);
  });

  it("alias CHỈ-TÊN trên dòng ăn ghi USD → giữ tên đã dạy + vẫn điền định mức", () => {
    const aliasMap = new Map<string, AliasEntry>([
      [aliasKeyOf("越式料理", "meal"), {
        loai: "meal", match_table: null, target_id: null, set_menu_id: null,
        ten_hien_thi: "Cơm Việt set 5 món", gia_override: null, sua_tay: true,
      }],
    ]);
    const result: AiExtractResult = {
      ten_chuong_trinh: "", so_ngay: 1,
      items: [aiItem({ ten_zh: "越式料理 7USD", ten_vi: "Món Việt", match: null })],
    };
    const [r] = resolveAiItems(result, emptyMaps(), null, aliasMap);
    expect(r.mo_ta).toBe("Cơm Việt set 5 món");
    expect(r.don_gia).toBe(160_000);
    expect(r.status).toBe("matched");
  });

  it("KHÔNG override khi AI đã khớp chắc (confidence ≥ 0.6)", () => {
    const maps = emptyMaps();
    maps.canhDiem.set(5, { ten: "Vé A", gia: 300_000 });
    const aliasMap = new Map<string, AliasEntry>([
      [aliasKeyOf("vé a", "ticket"), {
        loai: "ticket", match_table: null, target_id: null, set_menu_id: null,
        ten_hien_thi: "Khác", gia_override: 999_000,
      }],
    ]);
    const result: AiExtractResult = {
      ten_chuong_trinh: "", so_ngay: 1,
      items: [aiItem({ loai: "ticket", bua_an: null, ten_zh: "vé a", ten_vi: "Vé A",
        match: { table: "canh_diem", id: 5, set_menu_id: null, confidence: 0.9 } })],
    };
    const [r] = resolveAiItems(result, maps, null, aliasMap);
    expect(r.don_gia).toBe(300_000); // giữ match chắc, không lấy alias 999k
    expect(r.from_alias).toBeUndefined();
  });
});

describe("aliasesToLearn", () => {
  const res = (over: Partial<ResolvedItem>): ResolvedItem => ({
    ngay_so: 1, loai: "ticket", mo_ta: "", don_gia: 0, foc: 0,
    ten_zh: "", ten_vi: "", ghi_chu: "", confidence: 0, status: "unmatched", match_label: "",
    ...over,
  });

  it("OP sửa tay mỗi TÊN (không giá, không ref) → VẪN học, đánh dấu sua_tay", () => {
    const rows = [
      res({ loai: "meal", ten_zh: "越式料理", ten_vi: "Món Việt",
        mo_ta: "Cơm Việt set 5 món", don_gia: 0, sua_tay: true }),
    ];
    const [a] = aliasesToLearn(rows, "user-1");
    expect(a.text_key).toBe("越式料理");
    expect(a.ten_hien_thi).toBe("Cơm Việt set 5 món");
    expect(a.gia_override).toBeNull();
    expect(a.match_table).toBeNull();
    expect(a.sua_tay).toBe(true);
  });

  it("dòng AI để nguyên (không sửa tay, không giá, không ref) → KHÔNG học", () => {
    const rows = [res({ loai: "meal", ten_zh: "越式料理", mo_ta: "Món Việt", don_gia: 0 })];
    expect(aliasesToLearn(rows, "user-1")).toEqual([]);
  });

  it("sửa tay nhưng tên rỗng → không ghi rác vào bộ nhớ chung", () => {
    const rows = [res({ loai: "meal", ten_zh: "越式料理", mo_ta: "   ", don_gia: 0, sua_tay: true })];
    expect(aliasesToLearn(rows, "user-1")).toEqual([]);
  });

  it("dòng học thụ động (có giá, không ai sửa) → sua_tay false", () => {
    const rows = [res({ loai: "meal", ten_zh: "海鮮 8USD", mo_ta: "Set hải sản", don_gia: 180_000 })];
    expect(aliasesToLearn(rows, "user-1")[0].sua_tay).toBe(false);
  });

  it("dòng có ref danh mục → gia_override null (giá động); chỉ-giá → học giá; rỗng → bỏ", () => {
    const rows = [
      res({ loai: "hotel", ten_zh: "某酒店", mo_ta: "KS X", don_gia: 1_500_000,
        match_table: "khach_san", match_id: 9 }),
      res({ loai: "meal", ten_zh: "海鮮 8USD", mo_ta: "Set hải sản", don_gia: 160_000 }),
      res({ loai: "ticket", ten_zh: "", ten_vi: "", mo_ta: "", don_gia: 0 }),
    ];
    const learned = aliasesToLearn(rows, "user-1");
    expect(learned.length).toBe(2);
    const ks = learned.find((l) => l.loai === "hotel")!;
    expect(ks.target_id).toBe(9);
    expect(ks.gia_override).toBeNull(); // có ref → giá lấy catalog
    const meal = learned.find((l) => l.loai === "meal")!;
    expect(meal.match_table).toBeNull();
    expect(meal.gia_override).toBe(160_000);
    expect(meal.text_key).toBe("海鮮"); // token USD bị bỏ
    expect(meal.tao_boi).toBe("user-1");
  });
});
