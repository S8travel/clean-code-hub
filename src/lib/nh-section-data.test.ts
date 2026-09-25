import { describe, it, expect } from "vitest";
import {
  gomBuaAnNhaHang, mapGiaBooking, setMenuCanGiaMaster, ganGiaSetMenu, dungNhaHangMap, locBuaKhachTra,
  type NgayBuaAnRow, type NhaHangVoiNcc, type NHMealRow,
} from "./nh-section-data";

const ngay = (id: number, ngaySo: number, p: Partial<NgayBuaAnRow> = {}): NgayBuaAnRow => ({
  id, ngay_so: ngaySo, ngay_date: `2026-10-0${ngaySo}`,
  an_trua_nha_hang_id: null, an_toi_nha_hang_id: null,
  an_trua_set_menu_id: null, an_toi_set_menu_id: null,
  ...p,
});

const meal = (doanNgayId: number, bua: "trua" | "toi", p: Partial<NHMealRow> = {}): NHMealRow => ({
  doan_ngay_id: doanNgayId, ngay_so: 1, ngay_date: "2026-10-01", bua_an: bua,
  nha_hang_id: 1, set_menu_id: null, gia_set_menu: null, ...p,
});

const nhaHang = (id: number, p: Partial<NhaHangVoiNcc> = {}): NhaHangVoiNcc => ({
  id, ten: `NH ${id}`, dia_chi: null, thong_tin_chung: null, foc_khach: 16, foc_mien: 1,
  chiet_khau_phan_tram: null, nguoi_thanh_toan: "cong_ty", tai_khoan_thanh_toan: null,
  nha_cung_cap_id: null, tinh_suat_tl: null, thanh_toan_dinh_ky_mac_dinh: false,
  nha_cung_cap: null, ...p,
});

describe("gomBuaAnNhaHang", () => {
  it("tách bữa trưa / tối có nhà hàng, bỏ bữa trống", () => {
    const meals = gomBuaAnNhaHang([
      ngay(10, 1, { an_trua_nha_hang_id: 5, an_trua_set_menu_id: 50, an_toi_nha_hang_id: 6 }),
      ngay(11, 2),
    ]);
    expect(meals).toEqual([
      { doan_ngay_id: 10, ngay_so: 1, ngay_date: "2026-10-01", bua_an: "trua", nha_hang_id: 5, set_menu_id: 50, gia_set_menu: null },
      { doan_ngay_id: 10, ngay_so: 1, ngay_date: "2026-10-01", bua_an: "toi", nha_hang_id: 6, set_menu_id: null, gia_set_menu: null },
    ]);
  });

  it("ngay_date null → chuỗi rỗng", () => {
    expect(gomBuaAnNhaHang([ngay(10, 1, { ngay_date: null, an_trua_nha_hang_id: 5 })])[0].ngay_date).toBe("");
  });

  it("2 nhóm cùng NH cùng bữa cùng ngày → gộp, giữ doan_ngay_id thấp nhất", () => {
    const meals = gomBuaAnNhaHang([
      ngay(30, 1, { an_trua_nha_hang_id: 5 }),
      ngay(20, 1, { an_trua_nha_hang_id: 5 }),
    ]);
    expect(meals).toHaveLength(1);
    expect(meals[0].doan_ngay_id).toBe(20);
  });

  it("khác NH cùng bữa cùng ngày → KHÔNG gộp", () => {
    const meals = gomBuaAnNhaHang([
      ngay(20, 1, { an_trua_nha_hang_id: 5 }),
      ngay(30, 1, { an_trua_nha_hang_id: 6 }),
    ]);
    expect(meals.map((m) => m.nha_hang_id).sort()).toEqual([5, 6]);
  });

  it("sắp theo ngày, trong ngày trưa trước tối", () => {
    const meals = gomBuaAnNhaHang([
      ngay(12, 2, { an_toi_nha_hang_id: 8, an_trua_nha_hang_id: 7 }),
      ngay(11, 1, { an_toi_nha_hang_id: 6 }),
    ]);
    expect(meals.map((m) => `${m.ngay_so}${m.bua_an}`)).toEqual(["1toi", "2trua", "2toi"]);
  });
});

describe("setMenuCanGiaMaster", () => {
  const meals = [
    meal(1, "trua", { set_menu_id: 100 }), // có snapshot → không cần
    meal(1, "toi", { set_menu_id: 101 }),  // snapshot null → cần
    meal(2, "trua", { set_menu_id: 101 }), // chưa có dòng booking → cần (trùng id)
    meal(2, "toi"),                        // không set menu → không cần
  ];
  const bkMap = mapGiaBooking([
    { doan_ngay_id: 1, bua_an: "trua", gia_snapshot: 250000 },
    { doan_ngay_id: 1, bua_an: "toi", gia_snapshot: null },
  ]);

  it("chỉ lấy set menu thiếu snapshot, không trùng", () => {
    expect(setMenuCanGiaMaster(meals, bkMap)).toEqual([101]);
  });

  it("không có bữa nào thiếu → mảng rỗng (khỏi gọi DB)", () => {
    expect(setMenuCanGiaMaster([meals[0], meals[3]], bkMap)).toEqual([]);
  });
});

describe("ganGiaSetMenu", () => {
  const bkMap = mapGiaBooking([
    { doan_ngay_id: 1, bua_an: "trua", gia_snapshot: 250000 },
    { doan_ngay_id: 1, bua_an: "toi", gia_snapshot: 0 },
  ]);

  it("snapshot booking thắng giá master (kể cả snapshot 0)", () => {
    const out = ganGiaSetMenu(
      [meal(1, "trua", { set_menu_id: 100 }), meal(1, "toi", { set_menu_id: 101 })],
      bkMap,
      { 100: 999, 101: 999 },
    );
    expect(out.map((m) => m.gia_set_menu)).toEqual([250000, 0]);
  });

  it("thiếu snapshot → giá master; master không có → null; không set menu → null", () => {
    const out = ganGiaSetMenu(
      [meal(2, "trua", { set_menu_id: 100 }), meal(2, "toi", { set_menu_id: 102 }), meal(3, "trua")],
      bkMap,
      { 100: 180000 },
    );
    expect(out.map((m) => m.gia_set_menu)).toEqual([180000, null, null]);
  });

  it("không sửa mảng đầu vào", () => {
    const input = [meal(1, "trua", { set_menu_id: 100 })];
    ganGiaSetMenu(input, bkMap, {});
    expect(input[0].gia_set_menu).toBeNull();
  });
});

describe("dungNhaHangMap", () => {
  it("gắn thông tin NCC embed, chuẩn hoá chuỗi rỗng về null", () => {
    const map = dungNhaHangMap([
      nhaHang(5, {
        ten: null, tai_khoan_thanh_toan: "", nha_cung_cap_id: 9,
        nha_cung_cap: { ten: "Cty ABC", so_tai_khoan: "0123", ngan_hang: "" },
      }),
    ]);
    expect(map[5]).toMatchObject({
      id: 5, ten: "", tai_khoan_thanh_toan: null, nha_cung_cap_id: 9,
      ten_ncc: "Cty ABC", ncc_so_tai_khoan: "0123", ncc_ngan_hang: null,
      foc_khach: 16, foc_mien: 1,
    });
    expect(map[5]).not.toHaveProperty("nha_cung_cap");
  });

  it("chưa gán NCC → các trường NCC null", () => {
    const map = dungNhaHangMap([nhaHang(6)]);
    expect(map[6]).toMatchObject({ ten_ncc: null, ncc_so_tai_khoan: null, ncc_ngan_hang: null });
  });
});

describe("locBuaKhachTra", () => {
  it("bỏ bữa nhà hàng khách tự trả, giữ bữa của NH không tải được", () => {
    const map = dungNhaHangMap([nhaHang(5, { nguoi_thanh_toan: "khach" }), nhaHang(6, { nguoi_thanh_toan: "hdv" })]);
    const out = locBuaKhachTra(
      [meal(1, "trua", { nha_hang_id: 5 }), meal(1, "toi", { nha_hang_id: 6 }), meal(2, "trua", { nha_hang_id: 7 })],
      map,
    );
    expect(out.map((m) => m.nha_hang_id)).toEqual([6, 7]);
  });
});
