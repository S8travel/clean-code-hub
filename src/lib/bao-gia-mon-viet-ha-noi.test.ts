import { describe, it, expect } from "vitest";
import { apMonVietHaNoi, laMonVietKhongGioiHan, SET_MON_VIET_HA_NOI_ID } from "./bao-gia-mon-viet-ha-noi";
import { chuThichLuat } from "./bao-gia-chu-thich-luat";
import { dongChuaChac, type ResolveMaps, type ResolvedItem } from "./bao-gia-ai-resolve";

// Danh mục rút gọn theo đúng hình dạng thật. GIÁ Ở ĐÂY LÀ SỐ GIẢ — giá set là
// giá vốn đàm phán với nhà hàng, repo công khai thì không được chép vào.
const GIA_MAMMOM = 111_000;
const GIA_HOME_HOI_AN = 222_000;
const NH_MAMMOM = 1;
const NH_HOME_HOI_AN = 2;
const SET_HOME_HOI_AN = 7;

const maps: ResolveMaps = {
  canhDiem: new Map(),
  nhaHang: new Map([
    [NH_MAMMOM, { ten: "MAMMOM", ten_zh: "MAMMOM", foc_khach: 16, foc_mien: 1 }],
    [NH_HOME_HOI_AN, { ten: "NHÀ HÀNG X HỘI AN", ten_zh: "會安X餐廳", foc_khach: 16, foc_mien: 1 }],
  ]),
  setMenu: new Map([
    [SET_MON_VIET_HA_NOI_ID, { ten: "Set ăn không giới hạn ", gia: GIA_MAMMOM, nhaHangTen: "MAMMOM", nhaHangId: NH_MAMMOM }],
    [SET_HOME_HOI_AN, { ten: "Set không giới hạn", gia: GIA_HOME_HOI_AN, nhaHangTen: "NHÀ HÀNG X HỘI AN", nhaHangId: NH_HOME_HOI_AN }],
  ]),
  khachSan: new Map([
    [1, { ten: "Khách sạn A Ha Noi", dia_diem: "Hà Nội" }],
    [2, { ten: "Khách sạn B Ha Noi", dia_diem: "HÀ NỘI " }],
    [3, { ten: "Khách sạn D Hội An", dia_diem: "Hội An" }],
    [4, { ten: "Khách sạn chưa ghi nơi", dia_diem: null }],
  ]),
  khachSanGia: new Map(),
  xe: new Map(),
};

const dong = (over: Partial<ResolvedItem>): ResolvedItem => ({
  ngay_so: 11, loai: "meal", mo_ta: "", don_gia: 0, ten_zh: "", ten_vi: "",
  ghi_chu: "", confidence: 1, status: "matched", match_label: "", ...over,
});
const ks = (ngay_so: number, id: number | null, ten: string): ResolvedItem => dong({
  ngay_so, loai: "hotel", ten_zh: ten, mo_ta: ten, match_label: ten,
  match_table: id != null ? "khach_san" : null, match_id: id,
});

/** Dòng ăn đúng như ca thật 02/10: máy khớp nhầm vào Home Hội An, dịch luôn tên
 *  Việt theo cái nhầm đó. */
const buaHome = (over: Partial<ResolvedItem> = {}) => dong({
  bua_an: "toi",
  ten_zh: "Home越式料理單點吃到飽(不含酒水)USD16",
  ten_vi: "Home Hội An - món Việt gọi món ăn no",
  mo_ta: "Home Hội An - món Việt gọi món ăn no",
  don_gia: GIA_HOME_HOI_AN, confidence: 0.5,
  match_table: "nha_hang", match_id: NH_HOME_HOI_AN, match_set_menu_id: SET_HOME_HOI_AN,
  match_label: "NHÀ HÀNG X HỘI AN · Set không giới hạn",
  ...over,
});

describe("laMonVietKhongGioiHan — set món Việt ăn không giới hạn", () => {
  it("các cách đối tác viết thật → nhận", () => {
    expect(laMonVietKhongGioiHan("Home越式料理單點吃到飽(不含酒水)USD16")).toBe(true);
    expect(laMonVietKhongGioiHan("MAMMOM 越式料理吃到飽 不含酒水 US$18")).toBe(true);
    expect(laMonVietKhongGioiHan("米其林推薦 mam mom單點吃到飽")).toBe(true);       // không có 越 nhưng nêu tên quán
    expect(laMonVietKhongGioiHan("米其林推薦 ~ MOMAN越式料理單點吃到飽18USD")).toBe(true);
    expect(laMonVietKhongGioiHan("home moc mam mon越式單點吃到飽us18")).toBe(true);
  });

  it("set tôm hùm, buffet, ẩm thực khác → không phải set này", () => {
    expect(laMonVietKhongGioiHan("MAM MOM越式單點吃到飽+每人龍蝦半隻(US25)")).toBe(false);
    expect(laMonVietKhongGioiHan("Saju Sushi & BBQ Restaurant 日式料理吃到飽 USD25")).toBe(false);
    expect(laMonVietKhongGioiHan("海鮮火鍋打邊爐&無限單點吃到飽(飲料暢飲)")).toBe(false);
    expect(laMonVietKhongGioiHan("燒肉吃到飽 啤酒或軟飲一杯 USD15")).toBe(false);
    expect(laMonVietKhongGioiHan("越式自助餐吃到飽")).toBe(false);
  });

  it("không ăn no, hoặc chỉ UỐNG không giới hạn → không nhận", () => {
    expect(laMonVietKhongGioiHan("河內中越式料理USD8")).toBe(false);
    expect(laMonVietKhongGioiHan("越式料理(酒水無限暢飲)")).toBe(false);
  });

  it("CHỮ HÁN GỐC thắng tên Việt — tên Việt có thể là nhãn của lần khớp nhầm", () => {
    expect(laMonVietKhongGioiHan("河內中越式料理USD8", "Mammom - ăn không giới hạn")).toBe(false);
  });

  it("không có chữ Hán (OP gõ tay) thì mới xét tiếng Việt", () => {
    expect(laMonVietKhongGioiHan("", "Mammom - món Việt ăn không giới hạn")).toBe(true);
    expect(laMonVietKhongGioiHan("", "Buffet hải sản ăn không giới hạn")).toBe(false);
    expect(laMonVietKhongGioiHan("", "Mammom ăn no + tôm hùm")).toBe(false);
  });
});

describe("apMonVietHaNoi — Hà Nội thì mặc định MAMMOM", () => {
  it("ca thật 02/10: đoàn ngủ Hà Nội, máy khớp nhầm Home Hội An → về MAMMOM", () => {
    const rows = [
      ks(11, 1, "Khách sạn A Ha Noi"),
      ks(11, 2, "Khách sạn B Ha Noi"),
      ks(11, null, "Khách sạn C Hanoi"),
      buaHome(),
    ];
    const r = apMonVietHaNoi(rows, maps)[3];
    expect(r).toMatchObject({
      don_gia: GIA_MAMMOM,
      match_table: "nha_hang", match_id: NH_MAMMOM, match_set_menu_id: SET_MON_VIET_HA_NOI_ID,
      match_label: "MAMMOM · Set ăn không giới hạn",
      mo_ta: "MAMMOM - món Việt ăn không giới hạn",
      foc_khach: 16, foc_mien: 1,
      nguon_gia: undefined,
    });
    expect(r.mon_viet_ha_noi).toMatchObject({
      can_cu: "khach_san", khach_san: "Khách sạn A Ha Noi",
      nha_hang: "MAMMOM", gia_set: GIA_MAMMOM,
      gia_cu: GIA_HOME_HOI_AN, nguon_cu: "NHÀ HÀNG X HỘI AN · Set không giới hạn",
    });
    // Giá do luật → không bắt người nhập tick "đã xem" như một lời đoán.
    expect(dongChuaChac([r])).toEqual([]);
  });

  it("dòng ăn tự ghi 河內 → áp, không cần khách sạn", () => {
    const r = apMonVietHaNoi([buaHome({ ten_zh: "河內 Home越式料理單點吃到飽" })], maps)[0];
    expect(r.match_id).toBe(NH_MAMMOM);
    expect(r.mon_viet_ha_noi?.can_cu).toBe("chu");
  });

  it("ngày cuối không ngủ lại → theo khách sạn đêm trước", () => {
    const r = apMonVietHaNoi([ks(14, 1, "Khách sạn A Ha Noi"), buaHome({ ngay_so: 15, bua_an: "trua" })], maps)[1];
    expect(r.match_id).toBe(NH_MAMMOM);
    expect(r.mon_viet_ha_noi).toMatchObject({ can_cu: "khach_san", dem_truoc: true });
  });

  it("đoàn ngủ Hội An → KHÔNG đụng (Home Hội An là đúng)", () => {
    const rows = [ks(11, 3, "Khách sạn D Hội An"), buaHome()];
    expect(apMonVietHaNoi(rows, maps)[1]).toBe(rows[1]);
  });

  it("dòng ăn ghi rõ nơi khác thì thắng khách sạn Hà Nội", () => {
    const rows = [ks(11, 1, "Khách sạn A Ha Noi"), buaHome({ ten_zh: "會安HOME單點吃到飽(含冰茶)(餐標USD15)" })];
    expect(apMonVietHaNoi(rows, maps)[1]).toBe(rows[1]);
  });

  it("không biết chắc là Hà Nội → không đụng", () => {
    // Không có khách sạn nào cả.
    expect(apMonVietHaNoi([buaHome()], maps)[0].mon_viet_ha_noi).toBeUndefined();
    // Phương án KS ở hai nơi khác nhau.
    const haiNoi = [ks(11, 1, "Khách sạn A Ha Noi"), ks(11, 3, "Khách sạn D Hội An"), buaHome()];
    expect(apMonVietHaNoi(haiNoi, maps)[2].mon_viet_ha_noi).toBeUndefined();
    // KS đêm đó không đọc được nơi → không lùi về đêm trước để đoán.
    const khongRo = [ks(10, 1, "Khách sạn A Ha Noi"), ks(11, null, "Khu nghỉ dưỡng F"), buaHome()];
    expect(apMonVietHaNoi(khongRo, maps)[2].mon_viet_ha_noi).toBeUndefined();
  });

  it("KS đã khớp mà danh mục chưa ghi nơi → đọc tên trên dòng", () => {
    const rows = [ks(11, 4, "Khách sạn E Hanoi"), buaHome()];
    expect(apMonVietHaNoi(rows, maps)[1].match_id).toBe(NH_MAMMOM);
  });

  it("dòng người nhập vừa sửa tay → không đụng", () => {
    const rows = [ks(11, 1, "Khách sạn A Ha Noi"), buaHome({ sua_tay: true })];
    expect(apMonVietHaNoi(rows, maps)[1]).toBe(rows[1]);
  });

  it("set tôm hùm → không đụng", () => {
    const rows = [ks(11, 1, "Khách sạn A Ha Noi"), buaHome({ ten_zh: "MAM MOM越式單點吃到飽+每人龍蝦半隻(US25)" })];
    expect(apMonVietHaNoi(rows, maps)[1]).toBe(rows[1]);
  });

  it("danh mục không còn set của luật → giữ giá, gắn cờ thiếu để cảnh báo", () => {
    const thieu: ResolveMaps = { ...maps, setMenu: new Map([...maps.setMenu].filter(([id]) => id !== SET_MON_VIET_HA_NOI_ID)) };
    const r = apMonVietHaNoi([ks(11, 1, "Khách sạn A Ha Noi"), buaHome()], thieu)[1];
    expect(r.don_gia).toBe(GIA_HOME_HOI_AN);
    expect(r.mon_viet_ha_noi).toMatchObject({ thieu_gia: true, can_cu: "khach_san" });
  });

  it("đã đúng MAMMOM, đúng giá → không ghi 'thay giá cũ'", () => {
    const rows = [ks(11, 1, "Khách sạn A Ha Noi"), buaHome({ don_gia: GIA_MAMMOM })];
    expect(apMonVietHaNoi(rows, maps)[1].mon_viet_ha_noi?.gia_cu).toBeUndefined();
  });
});

describe("chú thích luật món Việt Hà Nội", () => {
  const daAp = () => apMonVietHaNoi([ks(11, 1, "Khách sạn A Ha Noi"), buaHome()], maps)[1];

  it("nói rõ vì sao là Hà Nội, nhà hàng, set, và giá cũ đã thay", () => {
    const c = chuThichLuat(daAp());
    expect(c[0]).toMatchObject({ muc: "thong_tin" });
    expect(c[0].noi_dung).toContain("Luật món Việt Hà Nội");
    expect(c[0].noi_dung).toContain("Khách sạn A Ha Noi");
    expect(c[0].noi_dung).toContain('set "Set ăn không giới hạn"');
    expect(c[0].noi_dung).toContain("Home Hà Nội");
    expect(c[1].noi_dung).toContain("NHÀ HÀNG X HỘI AN");
  });

  it("người nhập sửa giá sau đó → cảnh báo đã sửa tay", () => {
    const c = chuThichLuat({ ...daAp(), don_gia: 99_000, sua_tay: true });
    expect(c.some((x) => x.muc === "canh_bao" && x.noi_dung.includes("đã sửa tay"))).toBe(true);
  });

  it("người nhập chọn nhà hàng khác → câu về MAMMOM không còn hiện", () => {
    const c = chuThichLuat({ ...daAp(), match_id: NH_HOME_HOI_AN, sua_tay: true });
    expect(c.some((x) => x.noi_dung.includes("Luật món Việt Hà Nội"))).toBe(false);
  });

  it("danh mục thiếu set → cảnh báo chọn tay", () => {
    const c = chuThichLuat(dong({ mon_viet_ha_noi: { thieu_gia: true, can_cu: "chu" } }));
    expect(c).toEqual([expect.objectContaining({ muc: "canh_bao" })]);
    expect(c[0].noi_dung).toContain("chọn nhà hàng / set tay");
  });
});
