import { describe, it, expect } from "vitest";
import { calcTier, effItemFoc, effItemQty, slOverrideOf, type ManualItem } from "@/lib/bao-gia-calc";
import {
  aiPreviewSheet, clampNgay, costingSheet, emptyBaoGiaCase, isSapaTour,
  newBaoGiaItem, resolveHdvGiaNgay, setSlOverride,
} from "./helpers";
import type { BaoGiaRow, BaoGiaItem, BaoGiaKetQua } from "@/hooks/use-bao-gia";
import { TY_GIA_BAO_GIA_MAC_DINH } from "@/lib/bao-gia-ty-gia";

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
    so_phien_ban_cuoi: 0, phien_ban_hien_hanh_id: null,
    link_token: null, link_het_han: null, link_thu_hoi: false,
    link_tao_luc: null, link_so_lan_mo: 0, link_mo_gan_nhat: null,
  portal_noi_dung: null, portal_enabled: false, portal_pushed_at: null, yeu_cau_id: null,
    ...over,
  };
}

describe("costingSheet — báo giá không có tỷ giá dùng được", () => {
  const sheetVoiXr = (xr: number | null) => {
    const item = newBaoGiaItem("ticket", 1);
    item.don_gia = 100_000;
    return costingSheet(makeDraft([item], { exchange_rate: xr }));
  };

  it("exchange_rate NULL → dùng hằng số mặc định", () => {
    expect(sheetVoiXr(null)?.xr).toBe(TY_GIA_BAO_GIA_MAC_DINH);
  });

  it("exchange_rate = 0 cũng phải về hằng số — `??` không bắt được số 0", () => {
    const sheet = sheetVoiXr(0);
    expect(sheet?.xr).toBe(TY_GIA_BAO_GIA_MAC_DINH);
    // Không dòng nào của bảng costing được ra Infinity/NaN.
    expect(sheet?.footer.every((f) => f.values.every((v) => Number.isFinite(v)))).toBe(true);
    const usd = sheet?.footer.find((f) => f.kind === "usd");
    expect(usd?.values.some((v) => v > 0)).toBe(true);
  });

  it("có tỷ giá riêng thì giữ nguyên, không bị mức mặc định đè", () => {
    expect(sheetVoiXr(26_000)?.xr).toBe(26_000);
  });
});

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

describe("HDV / ngày — tuyến Sapa 700k cho CẢ tour", () => {
  const ve = (mo_ta: string, ten_zh = ""): BaoGiaItem =>
    ({ loai: "ticket", mo_ta, ten_zh, don_gia: 0, ghi_chu: "", ngay_so: 1 });
  const ketOf = (items: BaoGiaItem[], ten = "Tour test", over: Partial<BaoGiaKetQua> = {}) =>
    ({ ...makeDraft(items).ket_qua!, ten_chuong_trinh: ten, ...over });

  it("nhận Sapa qua tên chương trình — mọi cách gõ", () => {
    for (const ten of ["Hà Nội - Sapa 4N3Đ", "HÀ NỘI SA PA", "tour sapa mùa lúa", "北越海陸空~如夢沙壩6日"]) {
      expect(isSapaTour(ketOf([], ten)), ten).toBe(true);
    }
  });

  it("nhận Sapa qua tên dòng dịch vụ (kể cả chỉ có bản tiếng Trung)", () => {
    expect(isSapaTour(ketOf([ve("KK SAPA HOTEL")]))).toBe(true);
    expect(isSapaTour(ketOf([ve("Nhà hàng Hải Yến", "沙壩海燕餐廳")]))).toBe(true);
  });

  it("KHÔNG nhận nhầm: 沙巴 là Sabah (Malaysia), và chữ sapa lọt giữa từ khác", () => {
    expect(isSapaTour(ketOf([], "馬來西亞沙巴5日"))).toBe(false);
    expect(isSapaTour(ketOf([ve("Casapark Hotel")]))).toBe(false);
    expect(isSapaTour(ketOf([ve("Hạ Long - Ninh Bình")], "Đông Bắc 5N"))).toBe(false);
    expect(isSapaTour(null)).toBe(false);
  });

  it("chưa gõ tay → tự đặt 700k cho tour Sapa, 200k cho tour thường", () => {
    expect(resolveHdvGiaNgay(ketOf([], "Tour Sapa"))).toBe(700_000);
    expect(resolveHdvGiaNgay(ketOf([], "Tour Đà Nẵng"))).toBe(200_000);
  });

  it("OP gõ tay thì tôn trọng tuyệt đối, kể cả 0 và kể cả tour Sapa", () => {
    expect(resolveHdvGiaNgay(ketOf([], "Tour Sapa", { hdv_gia_ngay: 500_000 }))).toBe(500_000);
    expect(resolveHdvGiaNgay(ketOf([], "Tour Sapa", { hdv_gia_ngay: 0 }))).toBe(0);
    // null = trả về cho hệ thống tự đặt (nút "↺ về tự đặt")
    expect(resolveHdvGiaNgay(ketOf([], "Tour Sapa", { hdv_gia_ngay: null }))).toBe(700_000);
  });

  it("footer bảng chi phí + giá bán/khách chạy theo mức HDV đã resolve", () => {
    const items: BaoGiaItem[] = [ve("Vé")];
    const thuong = costingSheet(makeDraft(items))!;                       // so_ngay = 3
    const sapa = costingSheet(makeDraft(items, {
      ket_qua: { ...makeDraft(items).ket_qua!, ten_chuong_trinh: "Tour Sapa" },
    }))!;
    const hdvOf = (s: typeof thuong) => s.footer.find((f) => f.key === "hdv")!;
    expect(hdvOf(thuong).values).toEqual([600_000, 600_000]);            // 200k × 3
    expect(hdvOf(sapa).values).toEqual([2_100_000, 2_100_000]);          // 700k × 3
    expect(hdvOf(sapa).label).toContain("700.000 ₫/ngày");               // hiện rõ mức đang dùng
    // Chênh 1,5tr dồn hết vào tổng vốn → giá bán/khách bậc 16 tăng đúng 1.5M/16.
    const gia = (s: typeof thuong) => s.footer.find((f) => f.key === "gia_pax")!.values[0];
    expect(gia(sapa) - gia(thuong)).toBe(1_500_000 / 16);
  });

  it("calcTier (ma trận giá) dùng CÙNG mức HDV với bảng chi phí", () => {
    const items: BaoGiaItem[] = [ve("Vé")];
    const draft = makeDraft(items, {
      ket_qua: { ...makeDraft(items).ket_qua!, ten_chuong_trinh: "Tour Sapa" },
    });
    const s = costingSheet(draft)!;
    const manual: ManualItem[] = [{ id: "0", ngay: 1, loai: "ticket", mo_ta: "Vé", bang_gia_ten: "Vé", gia: 0 }];
    const c = calcTier(manual, 3, 26000, 0, 16, 0, 0, 700_000);
    expect(s.footer.find((f) => f.key === "gia_pax")!.values[0]).toBe(c.final_price_vnd);
  });
});

describe("newBaoGiaItem / clampNgay — thêm dòng tay khi AI đọc sót", () => {
  it("dòng mới rỗng tên + giá, N = 1, FOC để auto", () => {
    const it = newBaoGiaItem("ticket", 3);
    expect(it).toEqual({ loai: "ticket", mo_ta: "", don_gia: 0, ghi_chu: "", ngay_so: 3, so_luong: 1 });
    expect(it.foc).toBeUndefined();       // để auto theo chính sách, không ép 0
  });

  it("bua_an CHỈ gắn cho dòng ăn — dòng vé mang bữa sẽ bị máy combo trừ oan", () => {
    expect(newBaoGiaItem("meal", 2, "toi").bua_an).toBe("toi");
    expect(newBaoGiaItem("ticket", 2, "toi").bua_an).toBeUndefined();
    expect(newBaoGiaItem("hotel", 2, "trua").bua_an).toBeUndefined();
    expect(newBaoGiaItem("meal", 2).bua_an).toBeUndefined();
  });

  it("ngày rác (0, âm, NaN, lẻ) không lọt xuống bảng", () => {
    expect(newBaoGiaItem("meal", 0).ngay_so).toBe(1);
    expect(newBaoGiaItem("meal", -5).ngay_so).toBe(1);
    expect(newBaoGiaItem("meal", NaN).ngay_so).toBe(1);
    expect(newBaoGiaItem("meal", 2.6).ngay_so).toBe(3);
    expect(clampNgay(NaN, 5)).toBe(1);
    expect(clampNgay(0, 5)).toBe(1);
    expect(clampNgay(9, 5)).toBe(5);      // quá số ngày tour → kẹp về ngày cuối
    expect(clampNgay(3, 5)).toBe(3);
    expect(clampNgay(2, 0)).toBe(1);      // tour chưa khai số ngày
  });

  it("dòng thêm tay vào ĐÚNG nhóm + đúng thứ tự ngày, chưa có giá thì không cộng tiền", () => {
    const base: BaoGiaItem[] = [
      { loai: "ticket", mo_ta: "Vé D2", don_gia: 50_000, ghi_chu: "", ngay_so: 2 },
    ];
    const s = costingSheet(makeDraft([...base, newBaoGiaItem("ticket", 1)]))!;
    const ve = s.groups[3];
    expect(ve.rows.map((r) => r.ngay_so)).toEqual([1, 2]);   // dòng mới D1 xếp lên trước
    expect(ve.rows[0].mo_ta).toBe("");
    expect(ve.rows[0].editable).toBe(true);                  // sửa inline được ngay
    expect(ve.subtotals[0]).toBe(50_000 * 17);               // dòng rỗng cộng 0 đồng
  });

  it("thêm dòng ăn tối D1 → nằm sau dòng trưa cùng ngày", () => {
    const items: BaoGiaItem[] = [
      { loai: "meal", bua_an: "trua", mo_ta: "Trưa", don_gia: 100_000, ghi_chu: "", ngay_so: 1 },
    ];
    const s = costingSheet(makeDraft([...items, newBaoGiaItem("meal", 1, "toi")]))!;
    expect(s.groups[2].rows.map((r) => r.bua_an)).toEqual(["trua", "toi"]);
  });

  it("xoá dòng: itemIndex của các dòng còn lại vẫn trỏ đúng item", () => {
    const items: BaoGiaItem[] = [
      { loai: "ticket", mo_ta: "A", don_gia: 10_000, ghi_chu: "", ngay_so: 1 },
      { loai: "ticket", mo_ta: "B", don_gia: 20_000, ghi_chu: "", ngay_so: 2 },
      { loai: "ticket", mo_ta: "C", don_gia: 30_000, ghi_chu: "", ngay_so: 3 },
    ];
    const conLai = items.filter((_, i) => i !== 1);           // xoá "B"
    const s = costingSheet(makeDraft(conLai))!;
    const ve = s.groups[3];
    expect(ve.rows.map((r) => r.mo_ta)).toEqual(["A", "C"]);
    expect(ve.rows.map((r) => r.itemIndex)).toEqual([0, 1]);
    expect(ve.rows.map((r) => conLai[r.itemIndex].mo_ta)).toEqual(["A", "C"]);
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

// ── SL nhập tay theo cỡ đoàn (đoàn FIT) ──────────────────────────────────────
// Đoàn FIT không theo công thức rooms = ceil(khách/2)+1 / pax = khách+1 →
// OP phải chốt đúng số phòng / số suất cho từng cột cỡ đoàn.

describe("slOverrideOf / effItemQty — SL nhập tay theo bậc", () => {
  it("có số cho bậc nào thì dùng số đó, bậc khác vẫn tự tính", () => {
    const it = { sl_override: { "16": 7 } };
    expect(effItemQty(it, 16, 9)).toBe(7);
    expect(effItemQty(it, 20, 11)).toBe(11); // bậc 20 chưa nhập → auto
  });

  it("0 là số hợp lệ (FIT không dùng dịch vụ đó ở cỡ này)", () => {
    expect(slOverrideOf({ sl_override: { "16": 0 } }, 16)).toBe(0);
    expect(effItemQty({ sl_override: { "16": 0 } }, 16, 9)).toBe(0);
  });

  it("số âm / rác / vắng → coi như chưa nhập, KHÔNG âm thầm làm lệch giá", () => {
    expect(effItemQty({ sl_override: { "16": -3 } }, 16, 9)).toBe(9);
    expect(effItemQty({ sl_override: { "16": NaN } }, 16, 9)).toBe(9);
    expect(effItemQty({}, 16, 9)).toBe(9);
  });
});

describe("setSlOverride — sửa ô SL của 1 cột", () => {
  it("gõ số → ghi vào đúng bậc, các bậc khác giữ nguyên", () => {
    expect(setSlOverride({ "20": 11 }, 16, "7")).toEqual({ "16": 7, "20": 11 });
  });

  it("xoá trắng ô → bậc đó về tự tính, bậc khác còn nguyên", () => {
    expect(setSlOverride({ "16": 7, "20": 11 }, 16, "")).toEqual({ "20": 11 });
  });

  it("xoá khoá cuối cùng → undefined (không đọng object rỗng trong JSON)", () => {
    expect(setSlOverride({ "16": 7 }, 16, "")).toBeUndefined();
  });

  it("số lẻ / số âm: làm tròn, số âm coi như xoá", () => {
    expect(setSlOverride(undefined, 16, "7.4")).toEqual({ "16": 7 });
    expect(setSlOverride({ "16": 7 }, 16, "-2")).toBeUndefined();
  });
});

describe("calcCase — SL nhập tay đổi tiền vốn", () => {
  it("hotel: 7 phòng nhập tay thay cho 9 phòng tự tính (bậc 16)", () => {
    const items: ManualItem[] = [
      { id: "h", ngay: 1, loai: "hotel", mo_ta: "", bang_gia_ten: "", gia: 1_000_000,
        so_luong: 1, sl_override: { "16": 7 } },
    ];
    expect(calcTier(items, 3, 26000, 0, 16).hotel).toBe(7_000_000);  // 7 phòng × 1M
    expect(calcTier(items, 3, 26000, 0, 20).hotel).toBe(11_000_000); // bậc 20 vẫn auto 11 phòng
  });

  it("meal: FOC tự tính chạy theo SL nhập tay, không theo pax gốc", () => {
    const items: ManualItem[] = [
      { id: "m", ngay: 1, loai: "meal", mo_ta: "", bang_gia_ten: "", gia: 100_000,
        foc_khach: 16, foc_mien: 1, sl_override: { "16": 10 } },
    ];
    // SL 10 < 16 → chưa đủ suất miễn nào (pax gốc 17 thì được miễn 1)
    expect(calcTier(items, 3, 26000, 0, 16).meal).toBe(1_000_000);
  });

  it("SL nhập tay = 0 → dòng đó không tính tiền ở bậc đó", () => {
    const items: ManualItem[] = [
      { id: "t", ngay: 1, loai: "ticket", mo_ta: "", bang_gia_ten: "", gia: 50_000,
        sl_override: { "16": 0 } },
    ];
    expect(calcTier(items, 3, 26000, 0, 16).ticket).toBe(0);
    expect(calcTier(items, 3, 26000, 0, 20).ticket).toBe(1_050_000); // 50k × 21
  });
});

describe("costingSheet — ô SL nhập tay", () => {
  const hotelFit: BaoGiaItem = {
    loai: "hotel", mo_ta: "KS test", don_gia: 1_000_000, ghi_chu: "", ngay_so: 1,
    so_luong: 1, sl_override: { "16": 7 },
  };

  it("cell mang cả SL đang dùng, SL tự tính và cờ sửa tay", () => {
    const s = costingSheet(makeDraft([hotelFit]))!;
    const row = s.groups[1].rows[0];
    expect(row.cells[0]).toMatchObject({ guests: 16, qty: 7, auto: 9, manual: true });
    expect(row.cells[1]).toMatchObject({ guests: 20, qty: 11, auto: 11, manual: false });
    expect(row.sl_override).toEqual({ "16": 7 });
  });

  it("thành tiền + cộng nhóm dùng SL nhập tay", () => {
    const s = costingSheet(makeDraft([hotelFit]))!;
    expect(s.groups[1].rows[0].cells[0].total).toBe(7_000_000);
    expect(s.groups[1].subtotals[0]).toBe(7_000_000);
    expect(s.groups[1].subtotals[1]).toBe(11_000_000); // bậc 20 vẫn auto 11 phòng
  });

  it("bảng khớp calcTier — giá bán cuối cùng cũng đổi theo SL nhập tay", () => {
    const draft = makeDraft([hotelFit], { xe_gia: 10_000_000, profit_usd: 10 });
    const s = costingSheet(draft)!;
    const manual: ManualItem[] = [
      { id: "0", ngay: 1, loai: "hotel", mo_ta: "KS test", bang_gia_ten: "KS test",
        gia: 1_000_000, so_luong: 1, sl_override: { "16": 7 } },
    ];
    const tongVon = s.footer.find((f) => f.key === "tong_von")!;
    const giaPax = s.footer.find((f) => f.key === "gia_pax")!;
    s.configs.forEach((c, ti) => {
      const ref = calcTier(manual, 3, 26000, 10, c.guests, 10_000_000, 0);
      expect(tongVon.values[ti]).toBe(ref.total_cost);
      expect(giaPax.values[ti]).toBe(ref.final_price_vnd);
    });
  });

  it("xe (lump) không nhận SL nhập tay — vẫn là dòng trọn gói", () => {
    const s = costingSheet(makeDraft([
      { loai: "transport", mo_ta: "Xe thêm", don_gia: 2_000_000, ghi_chu: "", ngay_so: 1,
        so_luong: 1, sl_override: { "16": 5 } },
    ]))!;
    const row = s.groups[0].rows[0];
    expect(row.cells[0]).toMatchObject({ qty: 1, auto: 1, manual: false });
    expect(row.cells[0].total).toBe(2_000_000);
  });
});
