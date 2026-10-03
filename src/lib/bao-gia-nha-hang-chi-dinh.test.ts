import { describe, it, expect } from "vitest";
import { apMenuNhaHangChiDinh } from "./bao-gia-nha-hang-chi-dinh";
import { usdBudgetLabel, usdBudgetPrice, type ResolveMaps, type ResolvedItem } from "./bao-gia-ai-resolve";
import { chuThichLuat } from "./bao-gia-chu-thich-luat";

// Danh mục rút gọn theo đúng hình dạng thật: buffet 4 set (trưa/tối × thường/cuối
// tuần), nhà hàng nhiều set không ghi bữa, nhà hàng chưa có menu, "nhà hàng" chung
// theo mức USD. Tên + giá ở đây là BỊA — repo công khai.
const maps: ResolveMaps = {
  canhDiem: new Map(),
  nhaHang: new Map([
    [1, { ten: "Buffet Sen A", ten_zh: "蓮花餐廳", foc_khach: 16, foc_mien: 1 }],
    [2, { ten: "Dao Đỏ", ten_zh: "瑤族餐廳", foc_khach: 16, foc_mien: 1 }],
    [3, { ten: "Maison X", ten_zh: null, foc_khach: null, foc_mien: null }],
    [4, { ten: "Chung", ten_zh: null, foc_khach: null, foc_mien: null }],
    [5, { ten: "Chỉ bán tối", ten_zh: null, foc_khach: null, foc_mien: null }],
  ]),
  setMenu: new Map([
    [11, { ten: "SET BF TRƯA ( T2 - T6)", gia: 300_000, nhaHangTen: "Buffet Sen A", nhaHangId: 1 }],
    [12, { ten: "SET BF TRƯA ( T7 - CN)", gia: 350_000, nhaHangTen: "Buffet Sen A", nhaHangId: 1 }],
    [13, { ten: "SET BF TỐI ( T2 - T6)", gia: 360_000, nhaHangTen: "Buffet Sen A", nhaHangId: 1 }],
    [14, { ten: "SET BF TỐI ( T7 - CN)", gia: 380_000, nhaHangTen: "Buffet Sen A", nhaHangId: 1 }],
    [15, { ten: "BUFFET TE (90cm – dưới 1m4)", gia: 200_000, nhaHangTen: "Buffet Sen A", nhaHangId: 1 }],
    // Cùng giá với "Set lẩu cá" và đứng TRƯỚC nó — để test thấy được phân xử theo tên món.
    [20, { ten: "Set menu C", gia: 320_000, nhaHangTen: "Dao Đỏ", nhaHangId: 2 }],
    [21, { ten: "Set menu A", gia: 250_000, nhaHangTen: "Dao Đỏ", nhaHangId: 2 }],
    [22, { ten: "Set lẩu cá", gia: 320_000, nhaHangTen: "Dao Đỏ", nhaHangId: 2 }],
    [23, { ten: "Set menu B", gia: 200_000, nhaHangTen: "Dao Đỏ", nhaHangId: 2 }],
    [41, { ten: "Món việt 7usd", gia: 160_000, nhaHangTen: "Chung", nhaHangId: 4 }],
    [42, { ten: "Món việt 8usd", gia: 180_000, nhaHangTen: "Chung", nhaHangId: 4 }],
    [43, { ten: "Món trung 11usd", gia: null, nhaHangTen: "Chung", nhaHangId: 4 }],
    [51, { ten: "Set TỐI", gia: 400_000, nhaHangTen: "Chỉ bán tối", nhaHangId: 5 }],
  ]),
  khachSan: new Map(),
  khachSanGia: new Map(),
  xe: new Map(),
};

const an = (over: Partial<ResolvedItem>): ResolvedItem => ({
  ngay_so: 2, loai: "meal", bua_an: "trua", mo_ta: "", don_gia: 0, ten_zh: "", ten_vi: "",
  ghi_chu: "", confidence: 0.8, status: "matched", match_label: "",
  match_table: "nha_hang", match_id: 1, match_set_menu_id: null, ...over,
});

/** Đúng dạng dòng trước luật: khớp đúng nhà hàng, máy không chọn được set → rơi về công thức USD. */
const theoUsd = (usd: number, over: Partial<ResolvedItem> = {}) => an({
  ten_zh: `蓮花自助餐USD${usd}`, don_gia: usdBudgetPrice(usd, "meal"),
  match_label: usdBudgetLabel(usd, "meal"), gia_dong_ghi: usdBudgetPrice(usd, "meal"), ...over,
});

describe("apMenuNhaHangChiDinh — nhà hàng chỉ định thì giá theo menu danh mục", () => {
  it("chưa có ngày đi, máy không chọn được set → không còn theo công thức USD: lấy set gần mức đối tác ghi", () => {
    const [r] = apMenuNhaHangChiDinh([theoUsd(16)], maps, null);
    expect(r).toMatchObject({
      don_gia: 350_000, match_set_menu_id: 12, status: "matched",
      match_label: "Buffet Sen A · SET BF TRƯA ( T7 - CN)",
      set_tu_chon: { id: 12, gia: 350_000, ly_do: "gần mức đối tác ghi 16 USD nhất" },
      nh_chi_dinh: { nha_hang: "Buffet Sen A", gia_menu: 350_000, gia_cu: usdBudgetPrice(16, "meal") },
    });
    expect(r.nh_chi_dinh?.nguon_cu).toBe("công thức USD — đối tác ghi 16 USD");
  });

  it("có ngày đi → luật bữa + thứ chọn đúng set (trưa ngày thường)", () => {
    // Ngày 2 của tour đi 04/10/2026 là thứ Hai.
    const [r] = apMenuNhaHangChiDinh([theoUsd(16)], maps, "2026-10-04");
    expect(r).toMatchObject({ don_gia: 300_000, match_set_menu_id: 11 });
    expect(r.set_tu_chon?.ly_do).toBe("đúng bữa trưa, hôm đó thứ Hai — ngày thường");
  });

  it("dòng không ghi mức USD, máy chưa chọn set → tạm lấy set giá cao nhất của đúng bữa", () => {
    const [r] = apMenuNhaHangChiDinh([an({ ten_zh: "蓮花自助餐", bua_an: "toi" })], maps, null);
    expect(r).toMatchObject({ don_gia: 380_000, match_set_menu_id: 14 });
    expect(r.set_tu_chon?.ly_do).toBe("chưa đủ căn cứ chọn — tạm lấy set giá cao nhất");
    expect(r.nh_chi_dinh?.gia_cu).toBeUndefined(); // trước đó 0₫, không có gì để "thay"
  });

  it("không bao giờ tự chọn set TRẺ EM cho suất người lớn, kể cả khi nó gần mức đối tác ghi nhất", () => {
    // 10 USD → mức đối tác ghi gần giá set trẻ em hơn giá set người lớn.
    const [r] = apMenuNhaHangChiDinh([theoUsd(10)], maps, null);
    expect(r.match_set_menu_id).toBe(11);
    expect(r.don_gia).toBe(300_000);
  });

  it("nhiều set ngang nhau → set có tên trùng món lịch trình ghi", () => {
    const coUsd = an({ match_id: 2, mo_ta: "Dao Đỏ - lẩu cá", ten_zh: "紅瑤餐廳火鍋USD15", don_gia: usdBudgetPrice(15, "meal") });
    expect(apMenuNhaHangChiDinh([coUsd], maps, null)[0].match_set_menu_id).toBe(22);
    const [khongUsd] = apMenuNhaHangChiDinh([an({ match_id: 2, mo_ta: "Dao Đỏ - lẩu cá", ten_zh: "紅瑤餐廳火鍋" })], maps, null);
    expect(khongUsd).toMatchObject({ match_set_menu_id: 22, don_gia: 320_000 });
    expect(khongUsd.set_tu_chon?.ly_do).toBe("tên set trùng món lịch trình ghi nhất");
  });

  it("máy đã chọn đúng set và giá đúng menu → không đụng", () => {
    const goc = an({ match_id: 2, match_set_menu_id: 22, don_gia: 320_000, ten_zh: "紅瑤餐廳USD16" });
    expect(apMenuNhaHangChiDinh([goc], maps, null)[0]).toBe(goc);
  });

  it("sổ tay đè menu bằng con số học từ công thức USD → trả lại giá menu", () => {
    const [r] = apMenuNhaHangChiDinh([an({
      match_id: 2, match_set_menu_id: 22, ten_zh: "紅瑤餐廳USD16",
      don_gia: usdBudgetPrice(16, "meal"), nguon_gia: "so_tay",
    })], maps, null);
    expect(r).toMatchObject({ don_gia: 320_000, match_set_menu_id: 22, nguon_gia: undefined });
    expect(r.nh_chi_dinh?.nguon_cu).toBe("công thức USD — đối tác ghi 16 USD");
    expect(r.set_tu_chon).toBeUndefined(); // set do máy chọn, không phải luật chọn
  });

  it("sổ tay ghi giá người từng gõ (khác menu) → menu vẫn thắng, nói rõ đã thay giá sổ tay", () => {
    const [r] = apMenuNhaHangChiDinh([an({
      match_id: 2, match_set_menu_id: 22, ten_zh: "紅瑤餐廳", don_gia: 290_000, nguon_gia: "so_tay",
    })], maps, null);
    expect(r.don_gia).toBe(320_000);
    expect(r.nh_chi_dinh).toMatchObject({ gia_cu: 290_000, nguon_cu: "sổ tay" });
  });
});

describe("apMenuNhaHangChiDinh — không đụng / chỉ cảnh báo", () => {
  it("nhà hàng chưa có menu có giá → giữ mức USD nhưng cảnh báo là đang tạm", () => {
    const [r] = apMenuNhaHangChiDinh([theoUsd(20, { match_id: 3, ten_zh: "Maison X Buffet自助餐USD20" })], maps, null);
    expect(r.don_gia).toBe(usdBudgetPrice(20, "meal"));
    expect(r.nh_chi_dinh).toEqual({ nha_hang: "Maison X", thieu_menu: true });
    expect(chuThichLuat(r).some((c) => c.muc === "canh_bao" && c.noi_dung.includes("chưa có set menu có giá"))).toBe(true);
  });

  it("nhà hàng chỉ có set bữa khác → coi như chưa có menu cho bữa này", () => {
    const [r] = apMenuNhaHangChiDinh([theoUsd(18, { match_id: 5 })], maps, null);
    expect(r.don_gia).toBe(usdBudgetPrice(18, "meal"));
    expect(r.nh_chi_dinh?.thieu_menu).toBe(true);
  });

  it("'nhà hàng' chung theo mức USD (set đặt tên theo USD) → không phải chỉ định, không đụng", () => {
    const goc = an({ match_id: 4, match_set_menu_id: 43, ten_zh: "中式料理USD11", don_gia: usdBudgetPrice(11, "meal") });
    expect(apMenuNhaHangChiDinh([goc], maps, null)[0]).toBe(goc);
  });

  it("máy khớp nhà hàng chưa chắc → không lấy menu của nhà hàng đoán", () => {
    const goc = theoUsd(16, { confidence: 0.4 });
    expect(apMenuNhaHangChiDinh([goc], maps, null)[0]).toBe(goc);
  });

  it("khớp qua bộ nhớ đã học thì tính là chắc", () => {
    const [r] = apMenuNhaHangChiDinh([theoUsd(16, { confidence: 0, from_alias: true })], maps, null);
    expect(r.match_set_menu_id).toBe(12);
  });

  it("dòng người nhập vừa sửa tay, bữa trên tàu, dòng luật khác đã quyết → không đụng", () => {
    const suaTay = theoUsd(16, { sua_tay: true });
    const trenTau = theoUsd(16, { ten_zh: "船上自助餐USD16" });
    const luatTau = theoUsd(16, { tau_ha_long: { ten: "Tàu A", ve_vinh: 0 } });
    const ra = apMenuNhaHangChiDinh([suaTay, trenTau, luatTau], maps, null);
    expect(ra[0]).toBe(suaTay);
    expect(ra[1].don_gia).toBe(trenTau.don_gia);
    expect(ra[2].don_gia).toBe(luatTau.don_gia);
  });

  it("chạy lại (mở lại bản nháp) cho kết quả y hệt; dòng không còn khớp nhà hàng thì gỡ cờ", () => {
    const mot = apMenuNhaHangChiDinh([theoUsd(16), theoUsd(20, { match_id: 3 })], maps, null);
    expect(apMenuNhaHangChiDinh(mot, maps, null)).toEqual(mot);
    const [doiKhop] = apMenuNhaHangChiDinh([{ ...mot[0], match_table: null, match_id: null }], maps, null);
    expect(doiKhop.nh_chi_dinh).toBeUndefined();
  });
});

describe("chú thích ngay dưới dịch vụ", () => {
  it("nói rõ luật, set nào + vì sao; mức đối tác ghi đã có câu 'Luật giá' nêu nên không lặp", () => {
    const [r] = apMenuNhaHangChiDinh([theoUsd(16)], maps, null);
    const ct = chuThichLuat(r).map((c) => `${c.muc}: ${c.noi_dung}`);
    expect(ct).toContain("thong_tin: Luật nhà hàng chỉ định: lịch trình nêu đích danh Buffet Sen A → giá theo menu trong danh mục, đứng trên công thức USD và số sổ tay.");
    expect(ct).toContain('thong_tin: Luật chọn set: nhà hàng có nhiều set, tự chọn "SET BF TRƯA ( T7 - CN)" (gần mức đối tác ghi 16 USD nhất). Đoàn ăn set khác thì chọn lại.');
    expect(ct.some((s) => s.startsWith("canh_bao: Luật giá: đối tác ghi mức"))).toBe(true);
    expect(ct.some((s) => s.includes("Đã thay giá cũ"))).toBe(false);
  });

  it("thay giá sổ tay → ghi giá cũ; giá bị sửa tay khác menu → cảnh báo", () => {
    const [r] = apMenuNhaHangChiDinh([an({
      match_id: 2, match_set_menu_id: 22, ten_zh: "紅瑤餐廳", don_gia: 290_000, nguon_gia: "so_tay",
    })], maps, null);
    expect(chuThichLuat(r).map((c) => c.noi_dung)).toContain(`Đã thay giá cũ ${(290_000).toLocaleString("vi-VN")} ₫ (sổ tay).`);
    const suaTay = chuThichLuat({ ...r, don_gia: 330_000, sua_tay: true });
    expect(suaTay.some((c) => c.muc === "canh_bao" && c.noi_dung.includes("khác giá menu"))).toBe(true);
  });
});
