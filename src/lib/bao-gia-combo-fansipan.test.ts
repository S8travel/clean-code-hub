import { describe, it, expect } from "vitest";
import {
  apComboFansipan, laBuffetFansipan, laCapTreoFansipan, laTauMuongHoa, manhTauDinh, veComboFansipan,
} from "./bao-gia-combo-fansipan";
import { analyzeCombo, type ResolveMaps, type ResolvedItem } from "./bao-gia-ai-resolve";
import { chuThichLuat, dongDe0TheoLuat } from "./bao-gia-chu-thich-luat";

// Danh mục rút gọn theo đúng hình dạng thật (combo có bản trùng cũ, tàu leo đỉnh
// tách chiều lên / 2 chiều). Giá ở đây là số BỊA — repo công khai.
const maps: ResolveMaps = {
  canhDiem: new Map([
    [11, { ten: "Cáp treo FSP + BF + Mường Hoa", gia: 1_000_000 }],
    [12, { ten: "FANSIPAN COMBO CAPTREO + BUFFET + TÀU MƯỜNG HOA", gia: 1_000_000 }],
    [21, { ten: "Tàu leo đỉnh FSP(chiều lên)", gia: 150_000 }],
    [22, { ten: "FANSIPAN TÀU HỎA TUYẾN ĐỈNH CHIỀU LÊN", gia: 150_000 }],
    [23, { ten: "Tàu leo đỉnh ( 2 chiều)", gia: 280_000 }],
    [31, { ten: "Tàu hỏa Mường Hoa", gia: null }],
    [32, { ten: "thung lũng Mường Hoa", gia: null }],
  ]),
  nhaHang: new Map(),
  setMenu: new Map(),
  khachSan: new Map(),
  khachSanGia: new Map(),
  xe: new Map(),
};

const dong = (over: Partial<ResolvedItem>): ResolvedItem => ({
  ngay_so: 13, loai: "ticket", mo_ta: "", don_gia: 0, ten_zh: "", ten_vi: "",
  ghi_chu: "", confidence: 1, status: "matched", match_label: "", ...over,
});

/** Đúng dạng ngày Sa Pa máy đọc ra (ca thật 03/10): cả hai dòng tàu đều bị khớp vào
 *  vé tàu leo đỉnh, buffet trên núi để trống. */
const tauMuongHoa = (over: Partial<ResolvedItem> = {}) => dong({
  ten_zh: "登山小火車(SUN PLAZA SAPA站)", mo_ta: "Tàu leo núi (ga Sun Plaza Sapa)",
  don_gia: 150_000, match_table: "canh_diem", match_id: 21, match_label: "Tàu leo đỉnh FSP(chiều lên)",
  confidence: 0.75, ...over,
});
const capTreo = (over: Partial<ResolvedItem> = {}) => dong({
  ten_zh: "FANSIPAN LEGEND(雲頂纜車+攻頂小火車)", mo_ta: "Fansipan (cáp treo + tàu hỏa lên đỉnh)",
  don_gia: 150_000, match_table: "canh_diem", match_id: 22, match_label: "FANSIPAN TÀU HỎA TUYẾN ĐỈNH CHIỀU LÊN",
  confidence: 0.75, ...over,
});
const moana = (over: Partial<ResolvedItem> = {}) => dong({ ten_zh: "Moana Sapa虛擬天堂", mo_ta: "Moana Sapa", don_gia: 100_000, ...over });
const buffet = (over: Partial<ResolvedItem> = {}) => dong({
  loai: "meal", bua_an: "trua", ten_zh: "FANSIPAN LEGEND自助餐(不含酒水)", mo_ta: "Buffet Fansipan",
  status: "unmatched", match_label: "Chưa khớp", confidence: 0, ...over,
});
const toiSapa = (over: Partial<ResolvedItem> = {}) => dong({
  loai: "meal", bua_an: "toi", ten_zh: "沙壩紅瑤餐廳(鱘龍魚火鍋)USD16", mo_ta: "Lẩu cá tầm", don_gia: 340_000, ...over,
});
const ngaySapa = () => [tauMuongHoa(), capTreo(), moana(), buffet(), toiSapa()];

describe("nhận ra từng dòng của ngày đi Fansipan", () => {
  it("dòng cáp treo: phải nêu Fansipan — 纜車 không thôi còn là cáp treo Hạ Long, Bà Nà", () => {
    expect(laCapTreoFansipan(capTreo())).toBe(true);
    expect(laCapTreoFansipan(dong({ ten_zh: "芒花登山列車→番西邦傳奇纜車" }))).toBe(true);
    expect(laCapTreoFansipan(dong({ ten_zh: "番西邦峰（含來回纜車）" }))).toBe(true);
    expect(laCapTreoFansipan(dong({ mo_ta: "Cáp treo Fansipan" }))).toBe(true);
    expect(laCapTreoFansipan(dong({ ten_zh: "女皇雙層纜車" }))).toBe(false);
    expect(laCapTreoFansipan(dong({ mo_ta: "Cáp treo Bà Nà" }))).toBe(false);
    expect(laCapTreoFansipan(buffet())).toBe(false);
  });

  it("tàu Mường Hoa: Sun Plaza / 芒花 / tàu leo núi — không nhầm với tàu leo ĐỈNH hay thung lũng", () => {
    expect(laTauMuongHoa(tauMuongHoa())).toBe(true);
    expect(laTauMuongHoa(dong({ ten_zh: "芒花復古登山列車" }))).toBe(true);
    expect(laTauMuongHoa(dong({ mo_ta: "Tàu hỏa Mường Hoa" }))).toBe(true);
    expect(laTauMuongHoa(dong({ ten_zh: "番西邦攻頂小火車" }))).toBe(false);
    expect(laTauMuongHoa(dong({ mo_ta: "Thung lũng Mường Hoa" }))).toBe(false);
  });

  it("buffet trưa trên núi: nêu Fansipan / Hoàng Liên + buffet; bữa tối không tính", () => {
    expect(laBuffetFansipan(buffet())).toBe(true);
    expect(laBuffetFansipan(buffet({ ten_zh: "沙壩黃連山景區內用自助餐(套票)" }))).toBe(true);
    expect(laBuffetFansipan(buffet({ ten_zh: "沙壩 PHANXIPANG 山峰自助餐" }))).toBe(true);
    expect(laBuffetFansipan(buffet({ bua_an: "toi" }))).toBe(false);
    expect(laBuffetFansipan(toiSapa({ bua_an: "trua" }))).toBe(false);
  });

  it("tàu leo đỉnh viết chung dòng cáp treo: lấy đúng mảnh, nhận 2 chiều chỉ khi mảnh đó ghi", () => {
    expect(manhTauDinh(capTreo())).toEqual({ goc: "攻頂小火車", khuHoi: false });
    expect(manhTauDinh(dong({ ten_zh: "芒花復古登山列車 + 番西邦傳奇纜車 (單程+攻頂小火車)" })))
      .toEqual({ goc: "攻頂小火車", khuHoi: false });
    expect(manhTauDinh(dong({ ten_zh: "番西邦傳奇樂園 來回纜車、芒花單軌火車、登頂火車（雙程）+ 自助餐(套票)" })))
      .toEqual({ goc: "登頂火車（雙程）", khuHoi: true });
    // 來回 ở đây là cáp treo khứ hồi, dòng không có tàu leo đỉnh.
    expect(manhTauDinh(dong({ ten_zh: "番西邦峰（含來回纜車）" }))).toBeNull();
  });

  it("combo trong danh mục: tên đủ Fansipan + buffet + Mường Hoa, bản ghi mới nhất", () => {
    expect(veComboFansipan(maps)?.id).toBe(12);
  });
});

describe("apComboFansipan — ngày đi cáp treo Fansipan", () => {
  it("ca thật: cáp treo tính giá combo, buffet + tàu Mường Hoa về 0, tàu leo đỉnh tách dòng riêng", () => {
    const goc = ngaySapa();
    const ra = apComboFansipan(goc, maps);
    const [muongHoa, cap, , bf, toi] = ra;

    expect(cap).toMatchObject({
      don_gia: 1_000_000, match_table: "canh_diem", match_id: 12, confidence: 1,
      ai_bao_gom: "trua", da_tach: ["tau_dinh_fansipan"],
      combo_fansipan: { vai_tro: "cap_treo", gia: 1_000_000, gia_cu: 150_000, nguon_cu: "FANSIPAN TÀU HỎA TUYẾN ĐỈNH CHIỀU LÊN" },
    });
    expect(muongHoa).toMatchObject({ don_gia: 0, match_table: null, match_id: null, combo_fansipan: { vai_tro: "tau_muong_hoa" } });
    expect(bf).toMatchObject({ don_gia: 0, status: "matched", combo_fansipan: { vai_tro: "buffet" } });
    expect(ra[2]).toBe(goc[2]); // Moana không dính combo
    expect(toi).toBe(goc[4]);    // bữa tối không nằm trong combo

    // Dòng tàu leo đỉnh nối vào CUỐI mảng — chỉ số các dòng cũ giữ nguyên.
    expect(ra).toHaveLength(goc.length + 1);
    expect(ra[ra.length - 1]).toMatchObject({
      ngay_so: 13, loai: "ticket", ten_zh: "攻頂小火車", mo_ta: "Tàu leo đỉnh Fansipan (chiều lên)",
      don_gia: 150_000, match_table: "canh_diem", match_id: 22, confidence: 1,
      tach_tu: { khoa: "tau_dinh_fansipan", dong_goc: "FANSIPAN LEGEND(雲頂纜車+攻頂小火車)" },
    });
  });

  it("máy / người nhập đã chọn đúng một bản ghi combo → giữ bản ghi đó", () => {
    const [cap] = apComboFansipan([capTreo({ match_id: 11, don_gia: 1_000_000, match_label: "Cáp treo FSP + BF + Mường Hoa" })], maps);
    expect(cap.match_id).toBe(11);
    expect(cap.combo_fansipan?.gia_cu).toBeUndefined(); // giá không đổi thì không có "giá cũ"
  });

  it("tàu leo đỉnh 2 chiều → vé 2 chiều", () => {
    const ra = apComboFansipan([capTreo({ ten_zh: "番西邦傳奇纜車+登頂火車（雙程）" })], maps);
    expect(ra[1]).toMatchObject({ mo_ta: "Tàu leo đỉnh Fansipan (2 chiều)", don_gia: 280_000, match_id: 23 });
  });

  it("đối tác đã viết tàu leo đỉnh thành dòng riêng → không tách thêm, chỉ ghi dòng gốc đã tính", () => {
    const tauDinhRieng = dong({ ten_zh: "番西邦攻頂小火車", don_gia: 150_000, match_table: "canh_diem", match_id: 22 });
    const goc = [capTreo({ ten_zh: "芒花復古登山列車 + 番西邦傳奇纜車 (單程+攻頂小火車)" }), tauDinhRieng];
    const ra = apComboFansipan(goc, maps);
    expect(ra).toHaveLength(2);
    expect(ra[0].da_tach).toEqual(["tau_dinh_fansipan"]);
    expect(ra[1]).toBe(tauDinhRieng);
  });

  it("dòng ăn trưa khác (không phải buffet trên núi) → không tự để 0, chỉ CẢNH BÁO có thể trùng combo", () => {
    const anKhac = dong({ loai: "meal", bua_an: "trua", ten_zh: "沙壩中越式料理USD8", don_gia: 180_000 });
    const ra = apComboFansipan([capTreo(), anKhac], maps);
    expect(ra[1].don_gia).toBe(180_000);
    const combo = analyzeCombo(ra);
    expect(combo.warnings.get(0)?.mealIdxs).toEqual([1]);
    // Buffet đã nhận ra (để 0) thì không cảnh báo, không ẩn — còn chú thích của luật.
    const coBuffet = apComboFansipan([capTreo(), buffet()], maps);
    expect(analyzeCombo(coBuffet).warnings.size).toBe(0);
    expect(analyzeCombo(coBuffet).suppressed.size).toBe(0);
  });
});

describe("apComboFansipan — không đụng khi không chắc", () => {
  it("không đi cáp treo Fansipan (cáp treo Hạ Long) → không đụng gì", () => {
    const goc = [dong({ ten_zh: "女皇雙層纜車", don_gia: 300_000 }), tauMuongHoa({ ngay_so: 12 }), buffet({ ngay_so: 12 })];
    expect(apComboFansipan(goc, maps)).toEqual(goc);
  });

  it("danh mục chưa có combo → báo trên dòng cáp treo, buffet / tàu Mường Hoa giữ nguyên, không tách gì", () => {
    const khongCombo: ResolveMaps = {
      ...maps, canhDiem: new Map([...maps.canhDiem].filter(([id]) => id !== 11 && id !== 12)),
    };
    const goc = ngaySapa();
    const ra = apComboFansipan(goc, khongCombo);
    expect(ra).toHaveLength(goc.length);
    expect(ra[1]).toMatchObject({ don_gia: 150_000, combo_fansipan: { vai_tro: "cap_treo", ten: null } });
    expect(ra[0]).toBe(goc[0]);
    expect(ra[3]).toBe(goc[3]);
  });

  it("dòng cáp treo người nhập đã sửa tay → giữ nguyên, nhưng buffet / tàu Mường Hoa vẫn đã gồm", () => {
    const ra = apComboFansipan([tauMuongHoa(), capTreo({ sua_tay: true, don_gia: 1_100_000 }), buffet()], maps);
    expect(ra).toHaveLength(3); // dòng sửa tay không bị tách tàu leo đỉnh
    expect(ra[1].don_gia).toBe(1_100_000);
    expect(ra[1].combo_fansipan).toBeUndefined();
    expect(ra[0].don_gia).toBe(0);
    expect(ra[2].combo_fansipan?.vai_tro).toBe("buffet");
  });
});

describe("apComboFansipan — chạy lại (mở lại bản nháp)", () => {
  it("chạy lần hai cho kết quả y hệt, không tách tàu leo đỉnh lần nữa", () => {
    const mot = apComboFansipan(ngaySapa(), maps);
    expect(apComboFansipan(mot, maps)).toEqual(mot);
  });

  it("người nhập xoá dòng tàu leo đỉnh vừa tách → mở lại không tự mọc lại", () => {
    const daXoa = apComboFansipan(ngaySapa(), maps).slice(0, -1);
    expect(apComboFansipan(daXoa, maps)).toHaveLength(daXoa.length);
  });

  it("ngày đó nay không còn cáp treo (đã sửa dòng) → gỡ cờ cũ", () => {
    const [bf] = apComboFansipan([buffet({ combo_fansipan: { vai_tro: "buffet", ten: "Combo" } })], maps);
    expect(bf.combo_fansipan).toBeUndefined();
  });
});

describe("chú thích ngay dưới dịch vụ", () => {
  const ra = apComboFansipan(ngaySapa(), maps);

  it("dòng cáp treo: tên combo + giá, giá cũ đã thay, tàu leo đỉnh đã tách", () => {
    const ct = chuThichLuat(ra[1]).map((c) => `${c.muc}: ${c.noi_dung}`);
    expect(ct[0]).toBe(`thong_tin: Luật combo Fansipan: có đi cáp treo Fansipan → tính combo "FANSIPAN COMBO CAPTREO + BUFFET + TÀU MƯỜNG HOA" ${(1_000_000).toLocaleString("vi-VN")} ₫, đã gồm cáp treo + buffet trưa + tàu Mường Hoa; buffet và tàu Mường Hoa cùng ngày để 0.`);
    expect(ct).toContain(`thong_tin: Đã thay giá cũ ${(150_000).toLocaleString("vi-VN")} ₫ (FANSIPAN TÀU HỎA TUYẾN ĐỈNH CHIỀU LÊN).`);
    expect(ct).toContain("thong_tin: Tàu leo đỉnh trong dòng này không nằm trong combo — đã tách ra tính riêng ở dòng khác cùng ngày.");
  });

  it("buffet / tàu Mường Hoa: để 0 vì đã gồm, không bị đếm 'cần điền giá'", () => {
    expect(chuThichLuat(ra[3])[0].noi_dung).toContain("buffet trưa trên Fansipan đã gồm trong combo");
    expect(chuThichLuat(ra[0])[0].noi_dung).toContain("tàu Mường Hoa đã gồm trong combo");
    expect(dongDe0TheoLuat(ra[0])).toBe(true);
    expect(dongDe0TheoLuat(ra[3])).toBe(true);
  });

  it("dòng tàu leo đỉnh tách ra: nói rõ tách từ dòng nào", () => {
    const [c] = chuThichLuat(ra[ra.length - 1]);
    expect(c.noi_dung).toBe('Luật combo Fansipan: tàu leo đỉnh không nằm trong combo cáp treo + buffet + tàu Mường Hoa — tách từ dòng "FANSIPAN LEGEND(雲頂纜車+攻頂小火車)" để tính riêng.');
  });

  it("giá dòng cáp treo bị sửa khác giá combo → cảnh báo", () => {
    const ct = chuThichLuat({ ...ra[1], don_gia: 1_200_000, sua_tay: true });
    expect(ct.some((c) => c.muc === "canh_bao" && c.noi_dung.includes("khác giá combo"))).toBe(true);
  });
});
