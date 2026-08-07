import { describe, it, expect } from "vitest";
import { calcTier, effItemFoc, type ManualItem } from "@/lib/bao-gia-calc";
import { aiPreviewSheet, costingSheet, emptyBaoGiaCase } from "./helpers";
import type { BaoGiaRow, BaoGiaItem, BaoGiaKetQua } from "@/hooks/use-bao-gia";

function makeDraft(items: BaoGiaItem[], over: Partial<BaoGiaRow> = {}): BaoGiaRow {
  const ket: BaoGiaKetQua = {
    ten_chuong_trinh: "Tour test",
    so_ngay: 3,
    items,
    case_16: emptyBaoGiaCase(16),
    case_20: emptyBaoGiaCase(20),
    gia_trung_binh_vnd: 0,
    gia_trung_binh_usd: 0,
    tier_guests: [16, 20],
  };
  return {
    id: 1, tieu_de: null, noi_dung_goc: null, ket_qua: ket,
    exchange_rate: 26000, profit_usd: 0, trang_thai: "draft",
    created_at: "", created_by: null, ngay_di: null, ngay_ve: null,
    ghi_chu: null, hieu_luc_ngay: null, ma_bg: null, lead_id: null,
    xe_ten: null, xe_gia: null, phu_thu: 0, vcb_rate: null,
    agent_id: null, loai_tour: null, loai_bao_gia: "tu_tinh", lich_trinh_files: [],
    ...over,
  };
}

describe("calcCase — N (so_luong) nhân thành tiền", () => {
  it("hotel so_luong=2 (2 đêm) → rooms × giá × 2", () => {
    const items: ManualItem[] = [
      { id: "h", ngay: 1, loai: "hotel", mo_ta: "", bang_gia_ten: "", gia: 1_000_000, so_luong: 2 },
    ];
    const c = calcTier(items, 3, 26000, 0, 16); // rooms 9
    expect(c.hotel).toBe(18_000_000); // 1M × 9 × 2
  });

  it("meal so_luong=3 + foc=1 → (pax − foc) × giá × 3", () => {
    const items: ManualItem[] = [
      { id: "m", ngay: 1, loai: "meal", mo_ta: "", bang_gia_ten: "", gia: 100_000, foc: 1, so_luong: 3 },
    ];
    const c = calcTier(items, 3, 26000, 0, 16); // pax 17
    expect(c.meal).toBe(4_800_000); // (17−1) × 100k × 3
  });

  it("so_luong vắng → mặc định 1 (back-compat)", () => {
    const items: ManualItem[] = [
      { id: "t", ngay: 1, loai: "ticket", mo_ta: "", bang_gia_ten: "", gia: 50_000 },
    ];
    const c = calcTier(items, 3, 26000, 0, 16); // pax 17
    expect(c.ticket).toBe(850_000); // 50k × 17 × 1
  });
});

describe("costingSheet — bố cục nhóm + nhiều bậc", () => {
  const items: BaoGiaItem[] = [
    { loai: "hotel", mo_ta: "KS A", don_gia: 1_000_000, ghi_chu: "", ngay_so: 1 },
    { loai: "meal", bua_an: "trua", mo_ta: "Trưa", don_gia: 100_000, ghi_chu: "", ngay_so: 1, foc: 1 },
    { loai: "meal", bua_an: "toi", mo_ta: "Tối", don_gia: 120_000, ghi_chu: "", ngay_so: 1 },
    { loai: "ticket", mo_ta: "Vé", don_gia: 50_000, ghi_chu: "", ngay_so: 2 },
  ];
  const draft = makeDraft(items, { xe_gia: 10_000_000, xe_ten: "Xe 45 chỗ", phu_thu: 500_000 });

  it("4 nhóm Xe/KS/Ăn/Vé + bậc theo tier_guests", () => {
    const s = costingSheet(draft)!;
    expect(s.groups.map((g) => g.key)).toEqual(["transport", "hotel", "meal", "ticket"]);
    expect(s.guests).toEqual([16, 20]);
    // Nhóm Xe gồm xe lump + phụ thu (không có transport item)
    expect(s.groups[0].rows.map((r) => r.mo_ta)).toEqual(["Xe 45 chỗ", "Phụ thu (cầu đường, trung chuyển…)"]);
    expect(s.groups[0].rows.every((r) => !r.editable)).toBe(true);
  });

  it("meal sort trưa trước tối; subtotal theo bậc đúng", () => {
    const s = costingSheet(draft)!;
    const meal = s.groups[2];
    expect(meal.rows.map((r) => r.bua_an)).toEqual(["trua", "toi"]);
    // bậc 16 (pax 17): trưa (17−1)×100k=1.6M + tối 17×120k=2.04M = 3.64M
    expect(meal.subtotals[0]).toBe(3_640_000);
    // bậc 20 (pax 21): trưa 20×100k=2M + tối 21×120k=2.52M = 4.52M
    expect(meal.subtotals[1]).toBe(4_520_000);
  });

  it("hotel dùng rooms, không trừ foc xe; xe lump không nhân pax", () => {
    const s = costingSheet(draft)!;
    expect(s.groups[1].subtotals).toEqual([9_000_000, 11_000_000]); // rooms 9 / 11
    expect(s.groups[0].subtotals).toEqual([10_500_000, 10_500_000]); // xe+phụ thu lump, mọi bậc như nhau
  });

  it("footer GIÁ BÁN/khách khớp đúng calcTier (cùng nguồn tính)", () => {
    const s = costingSheet(draft)!;
    const giaPax = s.footer.find((f) => f.key === "gia_pax")!;
    const manual: ManualItem[] = items.map((it, i) => ({
      id: `${i}`, ngay: it.ngay_so ?? 1, loai: it.loai,
      mo_ta: it.mo_ta, bang_gia_ten: it.mo_ta, gia: it.don_gia, foc: it.foc ?? 0,
    }));
    [16, 20].forEach((g, ti) => {
      const c = calcTier(manual, 3, 26000, 0, g, 10_000_000, 500_000);
      expect(giaPax.values[ti]).toBe(c.final_price_vnd);
    });
  });

  it("ten_zh truyền qua row để hiển thị song ngữ", () => {
    const d = makeDraft([
      { loai: "ticket", mo_ta: "Cầu kính", ten_zh: "玻璃桥", don_gia: 100_000, ghi_chu: "", ngay_so: 1 },
    ]);
    const s = costingSheet(d)!;
    expect(s.groups[3].rows[0].ten_zh).toBe("玻璃桥");
  });
});

describe("aiPreviewSheet — preview review AI khớp costingSheet sau Áp dụng", () => {
  const reviewItems: BaoGiaItem[] = [
    { loai: "hotel", mo_ta: "KS A", don_gia: 1_000_000, ghi_chu: "", ngay_so: 1 },
    { loai: "meal", bua_an: "trua", mo_ta: "Trưa", don_gia: 100_000, ghi_chu: "", ngay_so: 1, foc_khach: 16, foc_mien: 1 },
    { loai: "ticket", mo_ta: "Vé", don_gia: 50_000, ghi_chu: "", ngay_so: 2 },
  ];

  it("số giống HỆT costingSheet của draft đã áp items (cùng xe/phụ thu/profit)", () => {
    // Draft đang mở modal: items CŨ trong ket_qua (khác items đang review).
    const draftDangReview = makeDraft(
      [{ loai: "ticket", mo_ta: "Item cũ", don_gia: 999_999, ghi_chu: "", ngay_so: 1 }],
      { xe_gia: 12_000_000, xe_ten: "Xe 45", phu_thu: 300_000, profit_usd: 10 },
    );
    const preview = aiPreviewSheet(draftDangReview, reviewItems, 5)!;

    // Draft SAU khi bấm Áp dụng: items = reviewItems, so_ngay = 5.
    const draftDaApDung = makeDraft(reviewItems, {
      xe_gia: 12_000_000, xe_ten: "Xe 45", phu_thu: 300_000, profit_usd: 10,
    });
    draftDaApDung.ket_qua!.so_ngay = 5;
    const applied = costingSheet(draftDaApDung)!;

    expect(preview.guests).toEqual(applied.guests);
    expect(preview.groups.map((g) => g.subtotals)).toEqual(applied.groups.map((g) => g.subtotals));
    expect(preview.footer).toEqual(applied.footer);
  });

  it("dùng tier_guests + xe/phụ thu của draft hiện tại", () => {
    const draft = makeDraft([], { xe_gia: 5_000_000, phu_thu: 200_000 });
    draft.ket_qua!.tier_guests = [10, 30];
    const s = aiPreviewSheet(draft, reviewItems, 3)!;
    expect(s.guests).toEqual([10, 30]);
    expect(s.groups[0].subtotals).toEqual([5_200_000, 5_200_000]); // xe + phụ thu lump
  });

  it("ket_qua null → null", () => {
    const draft = makeDraft([], {});
    expect(aiPreviewSheet({ ...draft, ket_qua: null }, reviewItems, 3)).toBeNull();
  });
});

describe("effItemFoc — FOC tự tính / override", () => {
  it("override (foc) thắng chính sách", () => {
    expect(effItemFoc({ foc: 2, foc_khach: 16, foc_mien: 1 }, 17)).toBe(2);
    expect(effItemFoc({ foc: 0, foc_khach: 16, foc_mien: 1 }, 17)).toBe(0); // 0 = ghi đè "không miễn"
  });
  it("auto theo chính sách 16免1 scale theo count", () => {
    expect(effItemFoc({ foc_khach: 16, foc_mien: 1 }, 17)).toBe(1);
    expect(effItemFoc({ foc_khach: 16, foc_mien: 1 }, 33)).toBe(2);
    expect(effItemFoc({ foc_khach: 16, foc_mien: 1 }, 15)).toBe(0);
  });
  it("không policy, không override → 0", () => {
    expect(effItemFoc({}, 50)).toBe(0);
  });
});

describe("calcCase — FOC nhà hàng auto theo cỡ đoàn", () => {
  it("meal policy 16免1: cỡ 16 (pax17) miễn 1; cỡ 40 (pax41) miễn 2", () => {
    const items: ManualItem[] = [
      { id: "m", ngay: 1, loai: "meal", mo_ta: "", bang_gia_ten: "", gia: 100_000, foc_khach: 16, foc_mien: 1 },
    ];
    expect(calcTier(items, 3, 26000, 0, 16).meal).toBe(1_600_000); // (17−1)×100k
    expect(calcTier(items, 3, 26000, 0, 40).meal).toBe(3_900_000); // (41−2)×100k
  });
  it("override foc=0 → không miễn dù có chính sách", () => {
    const items: ManualItem[] = [
      { id: "m", ngay: 1, loai: "meal", mo_ta: "", bang_gia_ten: "", gia: 100_000, foc: 0, foc_khach: 16, foc_mien: 1 },
    ];
    expect(calcTier(items, 3, 26000, 0, 16).meal).toBe(1_700_000); // 17×100k (không trừ)
  });
});

describe("costingSheet — FOC per-tier", () => {
  it("cell.foc tự tính theo từng cỡ đoàn cho meal có policy", () => {
    const draft = makeDraft(
      [{ loai: "meal", bua_an: "trua", mo_ta: "Set", don_gia: 100_000, ghi_chu: "", ngay_so: 1, foc_khach: 16, foc_mien: 1 }],
      {},
    );
    // tier_guests mặc định [16,20] → pax 17 & 21 → foc 1 & 1
    const s = costingSheet({ ...draft, ket_qua: { ...draft.ket_qua!, tier_guests: [16, 40] } })!;
    const meal = s.groups[2].rows[0];
    expect(meal.cells[0].foc).toBe(1); // pax 17
    expect(meal.cells[1].foc).toBe(2); // pax 41
    expect(meal.foc_manual).toBeNull(); // auto
    expect(meal.cells[0].total).toBe(1_600_000);
    expect(meal.cells[1].total).toBe(3_900_000);
  });
});
