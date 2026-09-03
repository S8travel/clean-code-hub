import { describe, it, expect } from "vitest";
import { apGiaTauHaLong, danhSachTau, tauTrongDong, VE_VINH_HA_LONG } from "./bao-gia-tau-ha-long";
import type { ResolveMaps, ResolvedItem } from "./bao-gia-ai-resolve";

// Danh mục rút gọn theo đúng HÌNH DẠNG dữ liệu thật: mỗi con tàu là một NHÀ
// HÀNG có set menu, vé vịnh là một dòng dịch vụ riêng. Giá ở đây là số BỊA —
// repo công khai, đừng đưa giá vốn của nhà cung cấp có tên vào test.
const maps: ResolveMaps = {
  canhDiem: new Map(),
  nhaHang: new Map([
    [130, { ten: "Sea Octopus", ten_zh: null, foc_khach: null, foc_mien: null }],
    [153, { ten: "Dolphin Cruise", ten_zh: "海豚號", foc_khach: null, foc_mien: null }],
    [151, { ten: "Ambassador Day Cruise", ten_zh: "國賓號日遊船", foc_khach: null, foc_mien: null }],
    [182, { ten: "TÀU CÂU MỰC", ten_zh: "章魚號船", foc_khach: null, foc_mien: null }],
    [128, { ten: "ĂN TRÊN TÀU", ten_zh: null, foc_khach: null, foc_mien: null }],
    [341, { ten: "AMBASSADOR CRUISE", ten_zh: null, foc_khach: null, foc_mien: null }],
  ]),
  setMenu: new Map([
    [1, { ten: "Sea Octopus Trưa ", gia: 600_000, nhaHangTen: "Sea Octopus", nhaHangId: 130 }],
    [2, { ten: "Sea Octopus Tối ", gia: 620_000, nhaHangTen: "Sea Octopus", nhaHangId: 130 }],
    [3, { ten: "Buffet ", gia: 1_000_000, nhaHangTen: "Dolphin Cruise", nhaHangId: 153 }],
    [4, { ten: "Buffet ", gia: 1_200_000, nhaHangTen: "Ambassador Day Cruise", nhaHangId: 151 }],
    [5, { ten: "Set menu ăn trên tàu", gia: null, nhaHangTen: "TÀU CÂU MỰC", nhaHangId: 182 }],
  ]),
  khachSan: new Map(),
  khachSanGia: new Map(),
  xe: new Map(),
};

const dong = (over: Partial<ResolvedItem>): ResolvedItem => ({
  ngay_so: 5, loai: "meal", mo_ta: "", don_gia: 0, ten_zh: "", ten_vi: "",
  ghi_chu: "", confidence: 1, status: "matched", match_label: "", ...over,
});

const buffetTrenTau = (over: Partial<ResolvedItem> = {}) => dong({
  loai: "meal", bua_an: "trua", ten_zh: "船上自助餐", mo_ta: "Buffet trưa trên tàu",
  don_gia: 600_000, nguon_gia: "so_tay", ...over,
});

const veDolphin = (over: Partial<ResolvedItem> = {}) => dong({
  loai: "ticket", ten_zh: "下龍灣最新6星級海豚號 Dolphin Cruise日遊船",
  mo_ta: "Dolphin Day Cruise vé vịnh", don_gia: 0, ...over,
});

describe("danhSachTau — dựng danh sách tàu từ danh mục nhà hàng", () => {
  const ds = danhSachTau(maps);

  it("bỏ nhà hàng tên toàn từ chung — 'ĂN TRÊN TÀU' mà nhận là tàu thì khớp bừa cả bảng", () => {
    expect(ds.some((t) => t.nhaHangId === 128)).toBe(false);
  });

  it("chỉ Sea Octopus bị đánh dấu là giá chưa gồm vé vịnh", () => {
    expect(ds.find((t) => t.nhaHangId === 130)?.chuaGomVeVinh).toBe(true);
    expect(ds.find((t) => t.nhaHangId === 153)?.chuaGomVeVinh).toBe(false);
    expect(ds.find((t) => t.nhaHangId === 151)?.chuaGomVeVinh).toBe(false);
  });
});

describe("tauTrongDong — đọc tên tàu trong một dòng", () => {
  const ds = danhSachTau(maps);

  it("đọc theo tên tiếng Việt AI dịch ra", () => {
    expect(tauTrongDong(veDolphin(), ds)?.nhaHangId).toBe(153);
  });

  it("đọc theo tên tiếng Trung trong danh mục khi dòng chỉ có chữ Hán", () => {
    const r = dong({ loai: "ticket", ten_zh: "國賓號AMBASSADOR CRUISE遊船", mo_ta: "" });
    expect(tauTrongDong(r, ds)?.nhaHangId).toBe(151);
  });

  it("章魚號SEA OCTOPUS: trùng tên Trung với TÀU CÂU MỰC nhưng tàu thật là Sea Octopus", () => {
    // Ca thật trong sổ tay. Tàu có giá set thắng tàu danh mục còn để trống giá.
    const r = dong({ loai: "ticket", ten_zh: "章魚號SEA OCTOPUS日遊船", mo_ta: "Sea Octopus (vé vịnh)" });
    expect(tauTrongDong(r, ds)?.nhaHangId).toBe(130);
  });

  it("dòng ăn phố cổ không dính tàu nào", () => {
    const r = dong({ loai: "meal", ten_zh: "蓮花自助餐18USD", mo_ta: "Sen buffet" });
    expect(tauTrongDong(r, ds)).toBeNull();
  });
});

describe("apGiaTauHaLong — áp giá theo đúng tàu của đoàn", () => {
  it("đoàn đi Dolphin: bữa trưa ăn giá Dolphin, KHÔNG còn giá Sea Octopus", () => {
    const [an, ve] = apGiaTauHaLong([buffetTrenTau(), veDolphin({ don_gia: 310_000 })], maps, "2026-09-01");
    expect(an.don_gia).toBe(1_000_000);
    expect(an.tau_ha_long?.ten).toBe("Dolphin Cruise");
    expect(an.tau_ha_long?.ve_vinh).toBe(0); // giá danh mục Dolphin đã gồm vé vịnh
    expect(an.match_table).toBe("nha_hang");
    expect(an.match_id).toBe(153);
    // giá không còn của sổ tay nữa → gỡ nhãn nguồn cũ cho khỏi nói dối bảng
    expect(an.nguon_gia).toBeUndefined();
    // vé vịnh đã nằm trong giá ăn → dòng vé về 0 kèm ghi chú, khỏi tính hai lần
    expect(ve.don_gia).toBe(0);
    expect(ve.ve_vinh_da_gom).toBe(true);
    expect(ve.ghi_chu).toContain("Đã gồm");
  });

  it("đoàn đi Sea Octopus: cộng thêm vé vịnh 310.000 vào giá bữa ăn", () => {
    const veSea = dong({ loai: "ticket", ten_zh: "亞特圖斯號遊船", mo_ta: "Du thuyền Sea Octopus (vé vịnh)", don_gia: 310_000 });
    const [an, ve] = apGiaTauHaLong([buffetTrenTau({ don_gia: 0 }), veSea], maps, "2026-09-01");
    expect(an.don_gia).toBe(600_000 + VE_VINH_HA_LONG);
    expect(an.tau_ha_long?.ve_vinh).toBe(VE_VINH_HA_LONG);
    expect(ve.don_gia).toBe(0);
  });

  it("bữa TỐI trên tàu Sea Octopus lấy set tối, không lấy set trưa", () => {
    const veSea = dong({ loai: "ticket", mo_ta: "Sea Octopus (vé vịnh)" });
    const [an] = apGiaTauHaLong(
      [buffetTrenTau({ bua_an: "toi", ten_zh: "船上晚餐", mo_ta: "Ăn tối trên tàu", don_gia: 0 }), veSea],
      maps, "2026-09-01",
    );
    expect(an.don_gia).toBe(620_000 + VE_VINH_HA_LONG);
  });

  it("không thấy tên tàu mà dòng ĐÃ có giá sổ tay → giữ giá, chỉ cảnh báo", () => {
    const [an] = apGiaTauHaLong([buffetTrenTau()], maps, "2026-09-01");
    expect(an.don_gia).toBe(600_000); // giá người mình từng gõ, không bị đè
    expect(an.tau_ha_long?.ten).toBeNull();
  });

  it("không thấy tên tàu và dòng chưa có giá → tàu mặc định + vé vịnh, gắn cờ đoán", () => {
    const [an] = apGiaTauHaLong([buffetTrenTau({ don_gia: 0, nguon_gia: "chua_co" })], maps, "2026-09-01");
    expect(an.don_gia).toBe(600_000 + VE_VINH_HA_LONG);
    expect(an.tau_ha_long?.doan).toBe(true);
  });

  it("KHÔNG đụng dòng người nhập vừa sửa tay", () => {
    const [an, ve] = apGiaTauHaLong(
      [buffetTrenTau({ don_gia: 1_400_000, sua_tay: true }), veDolphin({ don_gia: 310_000, sua_tay: true })],
      maps, "2026-09-01",
    );
    expect(an.don_gia).toBe(1_400_000);
    expect(ve.don_gia).toBe(310_000);
  });

  it("nhận ra tàu nhưng danh mục chưa có giá set → giữ nguyên, báo thiếu giá", () => {
    const veCauMuc = dong({ loai: "ticket", ten_zh: "章魚號船", mo_ta: "Tàu câu mực" });
    const [an] = apGiaTauHaLong([buffetTrenTau({ don_gia: 0 }), veCauMuc], maps, "2026-09-01");
    expect(an.don_gia).toBe(0);
    expect(an.tau_ha_long?.thieu_gia).toBe(true);
    expect(an.tau_ha_long?.ten).toBe("TÀU CÂU MỰC");
  });

  it("ngày không ăn trên tàu thì không đụng gì, kể cả có dòng du thuyền", () => {
    const goc = [
      dong({ loai: "meal", bua_an: "trua", mo_ta: "Sen buffet", ten_zh: "蓮花自助餐", don_gia: 400_000 }),
      veDolphin({ don_gia: 310_000 }),
    ];
    const ra = apGiaTauHaLong(goc, maps, "2026-09-01");
    expect(ra[0].don_gia).toBe(400_000);
    expect(ra[1].don_gia).toBe(310_000);
    expect(ra[1].ve_vinh_da_gom).toBeUndefined();
  });

  it("tàu ngày nào theo ngày đó — không lẫn tàu của ngày khác", () => {
    const veSea = dong({ ngay_so: 2, loai: "ticket", mo_ta: "Sea Octopus (vé vịnh)" });
    const ra = apGiaTauHaLong(
      [buffetTrenTau({ ngay_so: 2, don_gia: 0 }), veSea, buffetTrenTau({ ngay_so: 5, don_gia: 0 }), veDolphin({ ngay_so: 5 })],
      maps, "2026-09-01",
    );
    expect(ra[0].don_gia).toBe(600_000 + VE_VINH_HA_LONG); // ngày 2: Sea Octopus
    expect(ra[2].don_gia).toBe(1_000_000);                  // ngày 5: Dolphin
  });

  it("trả mảng MỚI, không sửa tại chỗ", () => {
    const goc = [buffetTrenTau(), veDolphin({ don_gia: 310_000 })];
    const ra = apGiaTauHaLong(goc, maps, "2026-09-01");
    expect(ra).not.toBe(goc);
    expect(goc[1].don_gia).toBe(310_000);
  });

  it("chạy lại lần hai cho kết quả y hệt (mở lại bản nháp không làm giá trôi)", () => {
    const mot = apGiaTauHaLong([buffetTrenTau(), veDolphin({ don_gia: 310_000 })], maps, "2026-09-01");
    const hai = apGiaTauHaLong(mot, maps, "2026-09-01");
    expect(hai.map((r) => r.don_gia)).toEqual(mot.map((r) => r.don_gia));
    expect(hai[1].ghi_chu).toBe(mot[1].ghi_chu);
  });
});
