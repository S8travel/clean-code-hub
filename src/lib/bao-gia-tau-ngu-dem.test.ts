import { describe, it, expect } from "vitest";
import { apTauNguDem, laDuThuyenNguDem, monGoiThem } from "./bao-gia-tau-ngu-dem";
import { apGiaTauHaLong } from "./bao-gia-tau-ha-long";
import {
  analyzeCombo, usdBudgetLabel, usdBudgetPrice,
  type ResolveMaps, type ResolvedItem,
} from "./bao-gia-ai-resolve";
import { chuThichLuat, dongDe0TheoLuat } from "./bao-gia-chu-thich-luat";

// Tên tàu + giá ở đây là BỊA — repo công khai, đừng đưa giá vốn / nhà cung cấp
// thật vào test. Hình dạng thì đúng dữ liệu thật: tàu đi trong ngày là một NHÀ
// HÀNG có set menu; du thuyền ngủ đêm là một dòng KHÁCH SẠN.
const maps: ResolveMaps = {
  canhDiem: new Map(),
  nhaHang: new Map([
    [10, { ten: "Alpha Day Cruise", ten_zh: "阿爾法號日遊船", foc_khach: null, foc_mien: null }],
  ]),
  setMenu: new Map([
    [100, { ten: "Buffet ", gia: 1_200_000, nhaHangTen: "Alpha Day Cruise", nhaHangId: 10 }],
  ]),
  khachSan: new Map(),
  khachSanGia: new Map(),
  xe: new Map(),
};

const dong = (over: Partial<ResolvedItem>): ResolvedItem => ({
  ngay_so: 9, loai: "meal", mo_ta: "", don_gia: 0, ten_zh: "", ten_vi: "",
  ghi_chu: "", confidence: 1, status: "matched", match_label: "", ...over,
});

const GIA_15_USD = usdBudgetPrice(15, "meal");

/** Đêm 9 ngủ trên du thuyền — đúng dạng dòng máy đọc ra từ lịch trình Đài Loan. */
const ksTau = (over: Partial<ResolvedItem> = {}) => dong({
  loai: "hotel", ten_zh: "下龍移動VillaALPHA CRUISE I或同級",
  mo_ta: "Alpha Cruise Hạ Long (du thuyền ngủ đêm)", match_label: "Alpha Cruise Hạ Long",
  match_table: "khach_san", match_id: 900, don_gia: 5_000_000, ai_bao_gom: "ca_hai", ...over,
});
const truaTau = (over: Partial<ResolvedItem> = {}) => dong({
  bua_an: "trua", ten_zh: "船上自助餐(不含酒水)", mo_ta: "Buffet trên tàu (không rượu nước)", ...over,
});
const toiTau = (over: Partial<ResolvedItem> = {}) => dong({
  bua_an: "toi", ten_zh: "船上 set menu晚宴(不含酒水)", mo_ta: "Set tối trên du thuyền", ...over,
});
/** Brunch sáng hôm sau + món gọi thêm, giá theo mức USD đối tác ghi. */
const brunchThem = (over: Partial<ResolvedItem> = {}) => dong({
  ngay_so: 10, bua_an: "trua", ten_zh: "船上早午餐(不含酒水)+九層海鮮塔(含酒水)USD15",
  mo_ta: "Brunch trên tàu + tháp hải sản 9 tầng",
  don_gia: GIA_15_USD, match_label: usdBudgetLabel(15, "meal"), ...over,
});
const toiHaNoi = (over: Partial<ResolvedItem> = {}) => dong({
  ngay_so: 10, bua_an: "toi", ten_zh: "河內中越式料理USD8", mo_ta: "Cơm Trung-Việt Hà Nội", don_gia: 180_000, ...over,
});
/** Giá máy khớp vào nhà hàng-tàu đi trong ngày. */
const khopTauNgay: Partial<ResolvedItem> = {
  don_gia: 1_200_000, match_table: "nha_hang", match_id: 10, match_set_menu_id: 100,
  match_label: "Alpha Day Cruise · Buffet",
};

describe("laDuThuyenNguDem — dòng khách sạn là du thuyền", () => {
  it("chữ CRUISE / du thuyền trong tên, hoặc 郵輪 / 遊船 chữ Hán", () => {
    expect(laDuThuyenNguDem(ksTau())).toBe(true);
    expect(laDuThuyenNguDem(dong({ loai: "hotel", ten_zh: "阿爾法號郵輪" }))).toBe(true);
    expect(laDuThuyenNguDem(dong({ loai: "hotel", ten_zh: "下龍灣遊船" }))).toBe(true);
    expect(laDuThuyenNguDem(dong({ loai: "hotel", mo_ta: "Du thuyền Alpha" }))).toBe(true);
  });

  it("tàu đi trong ngày / tàu ăn tối / tàu hoả không phải chỗ ngủ đêm", () => {
    expect(laDuThuyenNguDem(dong({ loai: "hotel", mo_ta: "Alpha Day Cruise" }))).toBe(false);
    expect(laDuThuyenNguDem(dong({ loai: "hotel", mo_ta: "Alpha Dinner Cruise" }))).toBe(false);
    expect(laDuThuyenNguDem(dong({ loai: "hotel", ten_zh: "阿爾法號日遊船" }))).toBe(false);
    expect(laDuThuyenNguDem(dong({ loai: "hotel", mo_ta: "Tàu ngày Alpha" }))).toBe(false);
    expect(laDuThuyenNguDem(dong({ loai: "hotel", ten_zh: "Sapa 火車", mo_ta: "Tàu hỏa Sapa" }))).toBe(false);
  });

  it("khách sạn trên bờ — kể cả tên có Yacht hay Vũng Tàu — không phải du thuyền", () => {
    expect(laDuThuyenNguDem(dong({ loai: "hotel", mo_ta: "The Yacht Hotel" }))).toBe(false);
    expect(laDuThuyenNguDem(dong({ loai: "hotel", mo_ta: "Marina Bay Vũng Tàu Resort" }))).toBe(false);
    expect(laDuThuyenNguDem(dong({ loai: "hotel", ten_zh: "Grand Hotel Ha Noi", mo_ta: "Grand Hotel Hà Nội" }))).toBe(false);
  });

  it("chỉ xét dòng khách sạn", () => {
    expect(laDuThuyenNguDem(truaTau())).toBe(false);
  });
});

describe("monGoiThem — món gọi thêm trong dòng ăn trên tàu", () => {
  it("tách theo dấu +, bỏ mức tiền khỏi tên món", () => {
    expect(monGoiThem(brunchThem())).toBe("九層海鮮塔(含酒水)");
  });

  it("chỉ có bữa trên tàu → không có món thêm", () => {
    expect(monGoiThem(truaTau())).toBeNull();
    expect(monGoiThem(dong({ ten_zh: "船上午餐+船上晚餐" }))).toBeNull();
  });

  it("加贈 (tặng thêm) vẫn là món công ty phải trả tiền", () => {
    expect(monGoiThem(dong({ ten_zh: "船上自助餐加贈海鮮拼盤" }))).toBe("加贈海鮮拼盤");
  });

  it("dòng không có chữ Hán thì đọc tên tiếng Việt", () => {
    expect(monGoiThem(dong({ mo_ta: "Brunch trên tàu + tháp hải sản 9 tầng" }))).toBe("tháp hải sản 9 tầng");
  });
});

describe("apTauNguDem — đêm ngủ trên du thuyền", () => {
  it("hai bữa trên tàu hôm lên tàu → 0, ghi rõ du thuyền + đêm", () => {
    const [trua, toi, ks] = apTauNguDem(
      [truaTau(khopTauNgay), toiTau({ don_gia: 600_000, nguon_gia: "so_tay" }), ksTau()], maps,
    );
    expect(trua).toMatchObject({
      don_gia: 0, status: "matched", match_table: null, match_id: null, match_set_menu_id: null,
      tau_ngu_dem: { ten: "Alpha Cruise Hạ Long", dem: 9 },
    });
    expect(trua.tau_ngu_dem?.goi_them).toBeUndefined();
    expect(toi).toMatchObject({ don_gia: 0, nguon_gia: undefined, tau_ngu_dem: { dem: 9 } });
    expect(ks.don_gia).toBe(5_000_000); // giá du thuyền ở dòng khách sạn giữ nguyên
  });

  it("brunch sáng hôm sau trên tàu → 0; có món gọi thêm → chỉ tính món đó", () => {
    const [, brunch, them] = apTauNguDem([
      ksTau(),
      dong({ ngay_so: 10, bua_an: "trua", ten_zh: "船上早午餐(不含酒水)", don_gia: 400_000, nguon_gia: "so_tay" }),
      brunchThem(),
    ], maps);
    expect(brunch).toMatchObject({ don_gia: 0, tau_ngu_dem: { dem: 9 } });
    expect(them.don_gia).toBe(GIA_15_USD); // mức đối tác ghi — giờ là giá món gọi thêm
    expect(them.tau_ngu_dem).toEqual({ ten: "Alpha Cruise Hạ Long", dem: 9, goi_them: "九層海鮮塔(含酒水)" });
  });

  it("brunch hôm sau chỉ ghi 早午餐, không nhắc chữ 船 → vẫn là bữa trên tàu", () => {
    const [, brunch] = apTauNguDem([ksTau(), dong({ ngay_so: 10, bua_an: "trua", ten_zh: "早午餐Brunch", don_gia: 300_000 })], maps);
    expect(brunch.don_gia).toBe(0);
  });

  it("bữa trên bờ cùng ngày lên tàu, bữa tối hôm sau ở Hà Nội → không đụng", () => {
    const goc = [
      ksTau(),
      dong({ bua_an: "trua", ten_zh: "下龍海鮮餐USD10", mo_ta: "Hải sản Hạ Long", don_gia: 220_000 }),
      toiHaNoi(),
    ];
    const ra = apTauNguDem(goc, maps);
    expect(ra[1]).toBe(goc[1]);
    expect(ra[2]).toBe(goc[2]);
  });

  it("ngủ tàu 2 đêm: bữa giữa hai đêm và brunch sau đêm cuối đều đã gồm", () => {
    const ra = apTauNguDem([
      ksTau(), ksTau({ ngay_so: 10 }),
      truaTau({ ngay_so: 10, don_gia: 600_000 }), toiTau({ ngay_so: 10, don_gia: 600_000 }),
      dong({ ngay_so: 11, bua_an: "trua", ten_zh: "船上早午餐", don_gia: 400_000 }),
    ], maps);
    expect(ra.slice(2).map((r) => [r.don_gia, r.tau_ngu_dem?.dem])).toEqual([[0, 10], [0, 10], [0, 10]]);
  });
});

describe("apTauNguDem — không chắc đoàn ngủ tàu thì không đụng (để 0 theo phỏng đoán = báo giá hụt tiền)", () => {
  it("đêm còn phương án khách sạn trên bờ → không đụng", () => {
    const ra = apTauNguDem([
      ksTau(), dong({ loai: "hotel", ten_zh: "Grand Hotel Ha Long", mo_ta: "Grand Hotel Hạ Long" }),
      truaTau({ don_gia: 600_000 }),
    ], maps);
    expect(ra[2].don_gia).toBe(600_000);
    expect(ra[2].tau_ngu_dem).toBeUndefined();
  });

  it("đêm ngủ trên bờ, bữa trưa trên tàu đi trong ngày → không đụng", () => {
    const goc = [
      truaTau({ don_gia: 600_000 }),
      dong({ loai: "ticket", ten_zh: "阿爾法號日遊船" }),
      dong({ loai: "hotel", ten_zh: "Grand Hotel Ha Long", mo_ta: "Grand Hotel Hạ Long" }),
    ];
    expect(apTauNguDem(goc, maps)).toEqual(goc);
  });

  it("bữa TỐI hôm sau trên tàu (đã rời du thuyền, đi tàu ăn tối) → không đụng", () => {
    const toiHomSau = dong({ ngay_so: 10, bua_an: "toi", ten_zh: "船上晚宴", don_gia: 700_000 });
    expect(apTauNguDem([ksTau(), toiHomSau], maps)[1]).toBe(toiHomSau);
  });

  it("dòng người nhập vừa sửa tay → không đụng", () => {
    const suaTay = truaTau({ don_gia: 800_000, sua_tay: true });
    expect(apTauNguDem([ksTau(), suaTay], maps)[1]).toBe(suaTay);
  });
});

describe("apTauNguDem — giá món gọi thêm", () => {
  it("giá đang là giá một bữa tàu ngày (máy khớp nhà hàng-tàu) → đổi sang mức đối tác ghi", () => {
    const [, them] = apTauNguDem([ksTau(), brunchThem(khopTauNgay)], maps);
    expect(them).toMatchObject({
      don_gia: GIA_15_USD, nguon_gia: "dong_ghi", match_table: null,
      match_label: usdBudgetLabel(15, "meal"),
    });
  });

  it("giá do luật tàu ngày áp ở bản nháp cũ → cũng đổi, bỏ luôn dấu vết luật tàu", () => {
    const [, them] = apTauNguDem([ksTau(), brunchThem({
      don_gia: 1_200_000, tau_ha_long: { ten: "Alpha Day Cruise", ve_vinh: 0, gia_set: 1_200_000, set_ten: "Buffet" },
    })], maps);
    expect(them.don_gia).toBe(GIA_15_USD);
    expect(them.tau_ha_long).toBeNull();
  });

  it("không có mức đối tác ghi → để 0, chờ người nhập gõ", () => {
    const [, them] = apTauNguDem([ksTau(), dong({
      ngay_so: 10, bua_an: "trua", ten_zh: "船上早午餐+龍蝦", ...khopTauNgay,
    })], maps);
    expect(them).toMatchObject({ don_gia: 0, status: "no_price", nguon_gia: "chua_co", tau_ngu_dem: { goi_them: "龍蝦" } });
  });
});

describe("apTauNguDem — chạy lại (mở lại bản nháp)", () => {
  const goc = () => [truaTau(khopTauNgay), toiTau(), ksTau(), brunchThem(), toiHaNoi()];

  it("chạy lần hai cho kết quả y hệt", () => {
    const mot = apTauNguDem(goc(), maps);
    expect(apTauNguDem(mot, maps)).toEqual(mot);
  });

  it("đêm đó nay không còn ngủ tàu (đã đổi khách sạn) → gỡ cờ cũ để luật tàu tính lại", () => {
    const [an] = apTauNguDem([
      truaTau({ tau_ngu_dem: { ten: "Alpha Cruise Hạ Long", dem: 9 } }),
      dong({ loai: "hotel", ten_zh: "Grand Hotel Ha Long", mo_ta: "Grand Hotel Hạ Long" }),
    ], maps);
    expect(an.tau_ngu_dem).toBeUndefined();
  });

  it("trả mảng MỚI, không sửa tại chỗ", () => {
    const rows = goc();
    const ra = apTauNguDem(rows, maps);
    expect(ra).not.toBe(rows);
    expect(rows[0].don_gia).toBe(1_200_000);
  });
});

describe("nối với luật tàu Hạ Long, combo và chú thích", () => {
  it("ca thật: bữa của đêm ngủ tàu từng bị tính giá buffet tàu ngày — chạy luật này trước thì về 0", () => {
    const rows = [truaTau(), toiTau(), ksTau(), brunchThem(), toiHaNoi()];
    // Không có luật: tên tàu đọc từ dòng khách sạn → hai bữa ăn giá buffet tàu ngày.
    expect(apGiaTauHaLong(rows, maps, "2026-10-10").slice(0, 2).map((r) => r.don_gia)).toEqual([1_200_000, 1_200_000]);

    const ra = apGiaTauHaLong(apTauNguDem(rows, maps), maps, "2026-10-10");
    expect(ra.map((r) => r.don_gia)).toEqual([0, 0, 5_000_000, GIA_15_USD, 180_000]);
    // Brunch hôm sau không còn câu "Luật tàu Hạ Long chưa áp… vé vịnh".
    expect(ra[3].tau_ha_long).toBeNull();
  });

  it("dòng khách sạn AI khai gồm bữa: không còn cảnh báo nghi trùng; xác nhận cờ combo cũng không ẩn món gọi thêm", () => {
    expect(analyzeCombo([truaTau(), toiTau(), ksTau()]).warnings.size).toBe(1); // trước luật
    expect(analyzeCombo(apTauNguDem([truaTau(), toiTau(), ksTau()], maps)).warnings.size).toBe(0);

    const tomHum = dong({ bua_an: "toi", ten_zh: "船上晚宴+龍蝦USD30", don_gia: usdBudgetPrice(30, "meal") });
    const daXacNhan = apTauNguDem([ksTau({ bao_gom_bua_an: "ca_hai" }), tomHum], maps);
    expect(daXacNhan[1].tau_ngu_dem?.goi_them).toBe("龍蝦");
    expect(analyzeCombo(daXacNhan).suppressed.size).toBe(0);
  });

  it("chú thích nói rõ vì sao 0 / chỉ tính phần nào; dòng để 0 không bị đếm 'cần điền giá'", () => {
    const [trua, , , them] = apTauNguDem([truaTau(), toiTau(), ksTau(), brunchThem()], maps);
    const ct = chuThichLuat(trua);
    expect(ct).toHaveLength(1);
    expect(ct[0].muc).toBe("thong_tin");
    expect(ct[0].noi_dung).toContain("đoàn ngủ trên Alpha Cruise Hạ Long (đêm ngày 9)");
    expect(ct[0].noi_dung).toContain("→ để 0");
    expect(dongDe0TheoLuat(trua)).toBe(true);

    const ctThem = chuThichLuat(them).map((c) => c.noi_dung);
    expect(ctThem[0]).toContain("chỉ tính món gọi thêm: 九層海鮮塔(含酒水)");
    expect(ctThem.some((s) => s.startsWith("Luật định mức USD"))).toBe(true);
    expect(dongDe0TheoLuat(them)).toBe(false);
  });
});
