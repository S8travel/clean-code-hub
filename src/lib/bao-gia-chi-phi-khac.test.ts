import { describe, it, expect } from "vitest";
import {
  CACH_TINH_CHI_PHI_KHAC, MAU_CHI_PHI_KHAC_MIEN_NAM, MAU_CHI_PHI_KHAC_MIEN_TRUNG, cachTinhCua,
  daChotChiPhiKhac, demSoBua, doiCachTinh, dongChiPhiKhacMoi, dsChiPhiKhacGoc, mauConThieu,
  mauTheoVung, resolveChiPhiKhac, resolveDongChiPhiKhac,
} from "./bao-gia-chi-phi-khac";
import { calcTier, tienChiPhiKhac } from "./bao-gia-calc";
import type { BaoGiaItem, BaoGiaKetQua, ChiPhiKhacItem } from "@/hooks/use-bao-gia";

const bua = (mo_ta: string, so_luong?: number): BaoGiaItem =>
  ({ loai: "meal", mo_ta, don_gia: 150_000, ghi_chu: "", ngay_so: 1, so_luong });

// 5 ngày, 7 bữa — đúng tình huống bảng tính giá mẫu (啤酒汽水 × 7, 礦泉水 × 5).
const BAY_BUA: BaoGiaItem[] = [
  bua("Trưa D1"), bua("Tối D1"), bua("Trưa D2"), bua("Tối D2"), bua("Trưa D3"), bua("Tối D3"), bua("Trưa D4"),
];

const ketOf = (over: Partial<BaoGiaKetQua> = {}): BaoGiaKetQua => ({
  ten_chuong_trinh: "Tour 5 ngày",
  so_ngay: 5,
  items: BAY_BUA,
  case_16: {} as BaoGiaKetQua["case_16"],
  case_20: {} as BaoGiaKetQua["case_20"],
  gia_trung_binh_vnd: 0,
  gia_trung_binh_usd: 0,
  ...over,
});

const theoZh = (ds: readonly ChiPhiKhacItem[], zh: string) => ds.find((r) => r.ten_zh === zh);
// Tách riêng 3 định mức cũ để số tiền trong test chỉ là chi phí khác.
const KHONG_DINH_MUC = { hdvGiaNgay: 0, baoHiemMoiKhach: 0, tipNgay: 0 };

describe("Mẫu chi phí khác đoàn miền Trung", () => {
  it("đủ các khoản của bảng tính giá mẫu, đúng đơn giá và cách tính", () => {
    const m = MAU_CHI_PHI_KHAC_MIEN_TRUNG;
    expect(m.map((r) => r.ten_zh)).toEqual([
      "斗笠", "紀念照片", "啤酒汽水", "礦泉水", "司機出差費", "司機導遊住宿（團體不住峴港）", "椰子",
    ]);
    expect(theoZh(m, "斗笠")).toMatchObject({ don_gia: 20_000, tinh_theo: "khach" });
    expect(theoZh(m, "紀念照片")).toMatchObject({ don_gia: 15_000, tinh_theo: "khach" });
    expect(theoZh(m, "啤酒汽水")).toMatchObject({ don_gia: 12_000, tinh_theo: "khach", n_theo: "bua" });
    expect(theoZh(m, "礦泉水")).toMatchObject({ don_gia: 100_000, tinh_theo: "doan", n_theo: "ngay" });
    expect(theoZh(m, "司機出差費")).toMatchObject({ don_gia: 300_000, tinh_theo: "doan", n_theo: "ngay" });
  });

  it("phòng tài xế + HDV mặc định 0 đêm: chỉ phát sinh khi đoàn ngủ ngoài Đà Nẵng", () => {
    expect(theoZh(MAU_CHI_PHI_KHAC_MIEN_TRUNG, "司機導遊住宿（團體不住峴港）"))
      .toMatchObject({ don_gia: 200_000, so_lan: 0 });
  });
});

describe("Mẫu chi phí khác đoàn miền Nam", () => {
  it("đủ các khoản của bảng miền Nam: tài xế 200k/ngày, phòng tài xế + HDV 300k × số đêm, không có dừa", () => {
    const m = MAU_CHI_PHI_KHAC_MIEN_NAM;
    expect(m.map((r) => r.ten_zh)).toEqual(["斗笠", "紀念照片", "啤酒汽水", "礦泉水", "司機出差費", "司機導遊住宿"]);
    expect(theoZh(m, "斗笠")).toMatchObject({ don_gia: 20_000, tinh_theo: "khach" });
    expect(theoZh(m, "紀念照片")).toMatchObject({ don_gia: 15_000, tinh_theo: "khach" });
    expect(theoZh(m, "啤酒汽水")).toMatchObject({ don_gia: 12_000, tinh_theo: "khach", n_theo: "bua" });
    expect(theoZh(m, "礦泉水")).toMatchObject({ don_gia: 100_000, tinh_theo: "doan", n_theo: "ngay" });
    expect(theoZh(m, "司機出差費")).toMatchObject({ don_gia: 200_000, tinh_theo: "doan", n_theo: "ngay" });
    expect(theoZh(m, "司機導遊住宿")).toMatchObject({ don_gia: 300_000, tinh_theo: "doan", n_theo: "dem" });
    expect(theoZh(m, "椰子")).toBeUndefined();
  });

  it("tour 5 ngày: phòng tài xế + HDV tự lấy 4 đêm — đúng số 4 của bảng gốc", () => {
    const ds = resolveChiPhiKhac(ketOf(), ["mien_nam"]);
    expect(ds.find((r) => r.ten_zh === "司機導遊住宿")).toMatchObject({ so_lan: 4, n_tu_dong: 4, n_la_tu_dong: true });
  });

  it("5 ngày 7 bữa: 16 khách 4.723.000 · 20 khách 5.199.000", () => {
    const ds = resolveChiPhiKhac(ketOf(), ["mien_nam"]);
    // 16 khách → pax 17: nón 340k + ảnh 255k + bia 12k×7×17 = 1.428k
    //   + nước suối 100k×5 + tài xế 200k×5 + phòng tài xế/HDV 300k×4
    expect(calcTier([], 5, 26_000, 0, 16, 0, 0, { ...KHONG_DINH_MUC, chiPhiKhac: ds }).others).toBe(4_723_000);
    expect(calcTier([], 5, 26_000, 0, 20, 0, 0, { ...KHONG_DINH_MUC, chiPhiKhac: ds }).others).toBe(5_199_000);
  });
});

describe("Không lặp khoản đã có ô riêng dưới bảng chi phí", () => {
  it("cả hai vùng đều KHÔNG có bảo hiểm (行程保險) và công HDV (導遊出差費)", () => {
    for (const m of [MAU_CHI_PHI_KHAC_MIEN_TRUNG, MAU_CHI_PHI_KHAC_MIEN_NAM]) {
      const zh = m.map((r) => r.ten_zh);
      expect(zh).not.toContain("行程保險");
      expect(zh).not.toContain("導遊出差費");
    }
  });
});

describe("mauTheoVung — tour chạm nhiều vùng", () => {
  it("không chạm vùng nào → không có dòng nào", () => {
    expect(mauTheoVung([])).toEqual([]);
  });

  it("một vùng → đúng bộ mẫu vùng đó (bản sao, sửa không làm bẩn hằng số)", () => {
    const ds = mauTheoVung(["mien_nam"]);
    expect(ds).toEqual(MAU_CHI_PHI_KHAC_MIEN_NAM.map((r) => ({ ...r })));
    ds[0].don_gia = 999;
    expect(MAU_CHI_PHI_KHAC_MIEN_NAM[0].don_gia).toBe(20_000);
  });

  it("chạm cả hai → gộp, khoản trùng lấy mức CAO NHẤT (như công HDV), khoản riêng giữ đủ", () => {
    const ds = mauTheoVung(["mien_trung", "mien_nam"]);
    // Tài xế: miền Trung 300k > miền Nam 200k.
    expect(ds.filter((r) => r.ten_zh === "司機出差費")).toEqual([
      expect.objectContaining({ don_gia: 300_000 }),
    ]);
    // Nón lá / nước suối… giống hệt nhau → một dòng.
    expect(ds.filter((r) => r.ten_zh === "斗笠")).toHaveLength(1);
    // Hai kiểu phòng tài xế + HDV là hai khoản khác nhau → giữ cả hai, và dừa.
    expect(ds.map((r) => r.ten_zh)).toEqual(expect.arrayContaining([
      "司機導遊住宿（團體不住峴港）", "司機導遊住宿", "椰子",
    ]));
    expect(ds).toHaveLength(MAU_CHI_PHI_KHAC_MIEN_TRUNG.length + 1);
  });
});

describe("dsChiPhiKhacGoc / daChotChiPhiKhac — tự đặt theo tuyến hay OP đã chốt", () => {
  it("chưa chốt → nhận bộ mẫu của vùng tour chạm tới", () => {
    const ket = ketOf();
    expect(daChotChiPhiKhac(ket)).toBe(false);
    expect(dsChiPhiKhacGoc(ket, ["mien_trung"])).toHaveLength(MAU_CHI_PHI_KHAC_MIEN_TRUNG.length);
    expect(dsChiPhiKhacGoc(ket, ["mien_nam"])).toHaveLength(MAU_CHI_PHI_KHAC_MIEN_NAM.length);
  });

  it("chưa chốt + tuyến khác → không có dòng nào", () => {
    expect(dsChiPhiKhacGoc(ketOf(), [])).toEqual([]);
    expect(dsChiPhiKhacGoc(null, [])).toEqual([]);
  });

  it("OP đã chốt thì dùng nguyên bản đó, tuyến không còn chi phối", () => {
    const rieng: ChiPhiKhacItem[] = [{ ten: "Nón lá", ten_zh: "斗笠", don_gia: 25_000, tinh_theo: "khach" }];
    expect(dsChiPhiKhacGoc(ketOf({ chi_phi_khac: rieng }), ["mien_trung"])).toEqual(rieng);
    // Tour miền Bắc mà OP tự thêm dòng → vẫn dùng.
    expect(dsChiPhiKhacGoc(ketOf({ chi_phi_khac: rieng }), [])).toEqual(rieng);
  });

  it("mảng rỗng = OP đã xoá hết, KHÔNG phải chưa nhập — mẫu không được chui lại", () => {
    const ket = ketOf({ chi_phi_khac: [] });
    expect(daChotChiPhiKhac(ket)).toBe(true);
    expect(dsChiPhiKhacGoc(ket, ["mien_trung", "mien_nam"])).toEqual([]);
  });

  it("null = trả lại cho hệ thống tự đặt", () => {
    expect(daChotChiPhiKhac(ketOf({ chi_phi_khac: null }))).toBe(false);
    expect(dsChiPhiKhacGoc(ketOf({ chi_phi_khac: null }), ["mien_trung"])).toHaveLength(MAU_CHI_PHI_KHAC_MIEN_TRUNG.length);
  });
});

describe("demSoBua — N của bia / nước ngọt", () => {
  it("đếm các dòng nhóm Ăn uống, cộng cả N của dòng", () => {
    expect(demSoBua(BAY_BUA)).toBe(7);
    expect(demSoBua([bua("Buffet"), bua("Set 2 lần", 2)])).toBe(3);
  });

  it("ô ăn TRỐNG của báo giá mới tạo không phải bữa thật; dòng vé / KS không tính", () => {
    const items: BaoGiaItem[] = [
      bua("Trưa D1"),
      { loai: "meal", bua_an: "toi", mo_ta: "", don_gia: 0, ghi_chu: "", ngay_so: 1 },
      { loai: "meal", mo_ta: "  ", don_gia: 0, ghi_chu: "", ngay_so: 2 },
      { loai: "ticket", mo_ta: "Bà Nà", don_gia: 900_000, ghi_chu: "", ngay_so: 2 },
      { loai: "hotel", mo_ta: "KS A", don_gia: 1_000_000, ghi_chu: "", ngay_so: 1 },
    ];
    expect(demSoBua(items)).toBe(1);
  });

  it("dòng ăn chưa đặt tên nhưng đã có giá vẫn là một bữa", () => {
    expect(demSoBua([{ loai: "meal", mo_ta: "", don_gia: 120_000, ghi_chu: "", ngay_so: 1 }])).toBe(1);
  });

  it("không có dòng nào → 0", () => {
    expect(demSoBua(undefined)).toBe(0);
    expect(demSoBua([])).toBe(0);
  });
});

describe("resolveDongChiPhiKhac — N tự tính / gõ đè", () => {
  const ctx = { soNgay: 5, soBua: 7 };

  it("N theo ngày / đêm / bữa lấy đúng số ngày tour / số ngày − 1 / số bữa", () => {
    expect(resolveDongChiPhiKhac({ ten: "a", don_gia: 1, tinh_theo: "doan", n_theo: "ngay" }, ctx))
      .toMatchObject({ so_lan: 5, n_tu_dong: 5, n_la_tu_dong: true });
    expect(resolveDongChiPhiKhac({ ten: "a", don_gia: 1, tinh_theo: "doan", n_theo: "dem" }, ctx))
      .toMatchObject({ so_lan: 4, n_tu_dong: 4, n_la_tu_dong: true });
    expect(resolveDongChiPhiKhac({ ten: "b", don_gia: 1, tinh_theo: "khach", n_theo: "bua" }, ctx))
      .toMatchObject({ so_lan: 7, n_tu_dong: 7, n_la_tu_dong: true });
  });

  it("tour 1 ngày (hoặc số ngày hỏng = 0) → 0 đêm, không ra số âm", () => {
    const dem: ChiPhiKhacItem = { ten: "a", don_gia: 1, tinh_theo: "doan", n_theo: "dem" };
    expect(resolveDongChiPhiKhac(dem, { soNgay: 1, soBua: 0 }).so_lan).toBe(0);
    expect(resolveDongChiPhiKhac(dem, { soNgay: 0, soBua: 0 }).so_lan).toBe(0);
  });

  it("OP gõ đè thì thắng số tự tính — kể cả gõ 0", () => {
    expect(resolveDongChiPhiKhac({ ten: "a", don_gia: 1, tinh_theo: "doan", n_theo: "ngay", so_lan: 4 }, ctx))
      .toMatchObject({ so_lan: 4, n_tu_dong: 5, n_la_tu_dong: false });
    expect(resolveDongChiPhiKhac({ ten: "a", don_gia: 1, tinh_theo: "doan", n_theo: "dem", so_lan: 0 }, ctx))
      .toMatchObject({ so_lan: 0, n_la_tu_dong: false });
  });

  it("số âm / rác coi như chưa gõ — không âm thầm kéo lệch tiền", () => {
    expect(resolveDongChiPhiKhac({ ten: "a", don_gia: 1, tinh_theo: "doan", n_theo: "ngay", so_lan: -3 }, ctx).so_lan).toBe(5);
    expect(resolveDongChiPhiKhac({ ten: "a", don_gia: 1, tinh_theo: "doan", n_theo: "ngay", so_lan: NaN }, ctx).so_lan).toBe(5);
  });

  it("dòng không có luật tự tính: N cố định, vắng = 1", () => {
    expect(resolveDongChiPhiKhac({ ten: "a", don_gia: 1, tinh_theo: "khach" }, ctx))
      .toMatchObject({ so_lan: 1, n_tu_dong: null, n_la_tu_dong: false });
    expect(resolveDongChiPhiKhac({ ten: "a", don_gia: 1, tinh_theo: "doan", so_lan: 3 }, ctx).so_lan).toBe(3);
  });

  it("đơn giá âm / rác → 0; cách tính hỏng → nghiêng về theo khách (tính dư còn thấy mà sửa)", () => {
    expect(resolveDongChiPhiKhac({ ten: "a", don_gia: -5, tinh_theo: "doan" }, ctx).don_gia).toBe(0);
    const hong = { ten: "a", don_gia: 1, tinh_theo: "???" } as unknown as ChiPhiKhacItem;
    expect(resolveDongChiPhiKhac(hong, ctx).tinh_theo).toBe("khach");
  });
});

describe("tienChiPhiKhac + engine — cộng vào tổng vốn", () => {
  it("theo khách nhân pax (khách + 1 HDV); trọn đoàn không nhân", () => {
    expect(tienChiPhiKhac({ don_gia: 20_000, so_lan: 1, tinh_theo: "khach" }, 17)).toBe(340_000);
    expect(tienChiPhiKhac({ don_gia: 100_000, so_lan: 5, tinh_theo: "doan" }, 17)).toBe(500_000);
  });

  it("đơn giá / N âm hoặc rác → 0, không kéo cả báo giá xuống âm", () => {
    expect(tienChiPhiKhac({ don_gia: -1, so_lan: 5, tinh_theo: "doan" }, 17)).toBe(0);
    expect(tienChiPhiKhac({ don_gia: 100, so_lan: NaN, tinh_theo: "khach" }, 17)).toBe(0);
  });

  it("mẫu miền Trung, 5 ngày 7 bữa: 16 khách 4.023.000 · 20 khách 4.499.000", () => {
    const ds = resolveChiPhiKhac(ketOf(), ["mien_trung"]);
    // 16 khách → pax 17: nón 340k + ảnh 255k + bia 12k×7×17 = 1.428k
    //                    + nước suối 100k×5 + công tác phí tài xế 300k×5 (phòng 0 đêm, dừa chưa giá)
    const c16 = calcTier([], 5, 26_000, 0, 16, 0, 0, { ...KHONG_DINH_MUC, chiPhiKhac: ds });
    const c20 = calcTier([], 5, 26_000, 0, 20, 0, 0, { ...KHONG_DINH_MUC, chiPhiKhac: ds });
    expect(c16.others).toBe(4_023_000);
    expect(c20.others).toBe(4_499_000);
    expect(c16.total_cost).toBe(4_023_000);
    expect(c16.final_price_vnd).toBe(Math.round(4_023_000 / 16));
  });

  it("không truyền chi phí khác → others = 0, tổng vốn y như trước (báo giá cũ không nhảy)", () => {
    const c = calcTier([], 5, 26_000, 0, 16);
    expect(c.others).toBe(0);
    // HDV 200k×5 + bảo hiểm 100k×17 + tip 200k×5
    expect(c.total_cost).toBe(1_000_000 + 1_700_000 + 1_000_000);
  });
});

describe("cách tính — một ô chọn gộp khách/đoàn × N theo gì", () => {
  it("đọc đúng cách tính của dòng", () => {
    expect(cachTinhCua({ tinh_theo: "khach" })).toBe("khach");
    expect(cachTinhCua({ tinh_theo: "khach", n_theo: "bua" })).toBe("khach_bua");
    expect(cachTinhCua({ tinh_theo: "doan", n_theo: "ngay" })).toBe("doan_ngay");
    expect(cachTinhCua({ tinh_theo: "doan", n_theo: "dem" })).toBe("doan_dem");
    expect(cachTinhCua({ tinh_theo: "doan" })).toBe("doan");
  });

  it("chọn cách nào thì đọc lại ra đúng cách đó — đủ 8 lựa chọn", () => {
    const r: ChiPhiKhacItem = { ten: "x", ten_zh: "X", don_gia: 1_000, tinh_theo: "khach" };
    expect(CACH_TINH_CHI_PHI_KHAC).toHaveLength(8);
    for (const o of CACH_TINH_CHI_PHI_KHAC) {
      expect(cachTinhCua(doiCachTinh(r, o.value, 1))).toBe(o.value);
    }
  });

  it("bỏ tự tính → GIỮ N đang dùng, tiền không nhảy", () => {
    const nuoc: ChiPhiKhacItem = { ten: "Nước suối", don_gia: 100_000, tinh_theo: "doan", n_theo: "ngay" };
    const sau = doiCachTinh(nuoc, "doan", 5);
    expect(sau.n_theo).toBeUndefined();
    expect(sau.so_lan).toBe(5);
    expect(sau.don_gia).toBe(100_000);
  });

  it("sang kiểu tự tính → N chạy theo ngày/đêm/bữa, bỏ số gõ tay của kiểu cũ", () => {
    const non: ChiPhiKhacItem = { ten: "Nón lá", don_gia: 20_000, tinh_theo: "khach", so_lan: 2 };
    expect(doiCachTinh(non, "khach_ngay", 2)).toMatchObject({ n_theo: "ngay", so_lan: null });
    const phong: ChiPhiKhacItem = { ten: "Phòng", don_gia: 300_000, tinh_theo: "doan", n_theo: "ngay", so_lan: 3 };
    expect(doiCachTinh(phong, "doan_dem", 3)).toMatchObject({ n_theo: "dem", so_lan: null });
  });

  it("chỉ đổi khách ↔ đoàn, cùng kiểu tự tính → giữ số OP đã gõ đè", () => {
    const r: ChiPhiKhacItem = { ten: "x", don_gia: 1, tinh_theo: "khach", n_theo: "ngay", so_lan: 4 };
    expect(doiCachTinh(r, "doan_ngay", 4)).toMatchObject({ tinh_theo: "doan", n_theo: "ngay", so_lan: 4 });
  });
});

describe("mauConThieu — nút nạp mẫu không nhân đôi dòng", () => {
  it("danh sách rỗng → thiếu đủ bộ mẫu (bản sao)", () => {
    const thieu = mauConThieu([], "mien_trung");
    expect(thieu).toHaveLength(MAU_CHI_PHI_KHAC_MIEN_TRUNG.length);
    thieu[0].ten = "đổi";
    expect(MAU_CHI_PHI_KHAC_MIEN_TRUNG[0].ten).toBe("Nón lá");
  });

  it("đủ mẫu → không thiếu gì", () => {
    expect(mauConThieu(MAU_CHI_PHI_KHAC_MIEN_TRUNG.map((r) => ({ ...r })), "mien_trung")).toEqual([]);
  });

  it("dòng mẫu OP đã sửa giá / sửa tên Việt vẫn là dòng đó (khớp theo tên 中文)", () => {
    const ds: ChiPhiKhacItem[] = [{ ten: "Nón lá Huế", ten_zh: "斗笠", don_gia: 30_000, tinh_theo: "khach" }];
    expect(mauConThieu(ds, "mien_trung").map((r) => r.ten_zh)).not.toContain("斗笠");
  });

  it("dòng OP tự gõ chỉ có tên Việt cũng được nhận ra (khớp theo tên Việt)", () => {
    const ds: ChiPhiKhacItem[] = [{ ten: " nón  LÁ ", don_gia: 20_000, tinh_theo: "khach" }];
    expect(mauConThieu(ds, "mien_trung").map((r) => r.ten)).not.toContain("Nón lá");
    expect(mauConThieu(ds, "mien_trung")).toHaveLength(MAU_CHI_PHI_KHAC_MIEN_TRUNG.length - 1);
  });

  it("đang dùng mẫu miền Trung → nạp thêm mẫu miền Nam chỉ ra đúng khoản miền Nam riêng", () => {
    const ds = MAU_CHI_PHI_KHAC_MIEN_TRUNG.map((r) => ({ ...r }));
    expect(mauConThieu(ds, "mien_nam").map((r) => r.ten_zh)).toEqual(["司機導遊住宿"]);
  });

  it("dòng trống vừa thêm không che mất dòng mẫu nào", () => {
    expect(mauConThieu([dongChiPhiKhacMoi()], "mien_nam")).toHaveLength(MAU_CHI_PHI_KHAC_MIEN_NAM.length);
  });
});
