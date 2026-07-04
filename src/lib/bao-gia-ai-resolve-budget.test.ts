import { describe, it, expect } from "vitest";
import {
  parseUsdAmount, resolveAiItems, USD_BUDGET_RATE,
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

describe("resolveAiItems — fallback định mức USD × 20.000", () => {
  it("bữa ăn chung chung 8USD, không khớp NH → 160.000₫, status matched", () => {
    const result: AiExtractResult = {
      ten_chuong_trinh: "", so_ngay: 1,
      items: [aiItem({ ten_zh: "海鮮餐合菜 8USD", ten_vi: "Set hải sản", match: null })],
    };
    const [r] = resolveAiItems(result, emptyMaps());
    expect(r.don_gia).toBe(8 * USD_BUDGET_RATE); // 160.000
    expect(r.status).toBe("matched");
    expect(r.match_label).toContain("8 USD");
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
