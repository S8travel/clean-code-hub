import { describe, it, expect } from "vitest";
import { pvBatBuoc, daPhanXong, defaultPhanViec, type PvKey } from "./phan-viec-muc";

describe("pvBatBuoc", () => {
  it("inbound: chỉ KS, NH&DV, Xe — Visa và Vé máy bay do khách lo", () => {
    expect(pvBatBuoc("inbound")).toEqual(["pv_ks", "pv_nh_dv", "pv_xe"]);
  });

  it("outbound: thêm Visa vì mình lo visa cho khách", () => {
    expect(pvBatBuoc("outbound")).toEqual(["pv_ks", "pv_nh_dv", "pv_xe", "pv_visa"]);
  });

  it("nội địa: không có Visa", () => {
    expect(pvBatBuoc("noi_dia")).toEqual(["pv_ks", "pv_nh_dv", "pv_xe"]);
  });

  it("chưa chọn loại tour thì theo mặc định, KHÔNG đòi Visa/Vé máy bay", () => {
    expect(pvBatBuoc(null)).toEqual(["pv_ks", "pv_nh_dv", "pv_xe"]);
    expect(pvBatBuoc(undefined)).toEqual(["pv_ks", "pv_nh_dv", "pv_xe"]);
  });

  it("mục bắt buộc luôn là tập con của mục hiện trong bảng", () => {
    for (const lt of ["inbound", "outbound", "noi_dia", null]) {
      const hien = defaultPhanViec(lt).map((i) => i.key);
      for (const k of pvBatBuoc(lt)) expect(hien).toContain(k);
    }
  });
});

describe("daPhanXong", () => {
  const chon = (m: Partial<Record<PvKey, string>>) => (k: PvKey) => m[k] ?? null;

  it("inbound: đủ KS + NH&DV + Xe là xong, dù Visa/Vé máy bay để trống", () => {
    expect(daPhanXong("inbound", chon({ pv_ks: "u1", pv_nh_dv: "u2", pv_xe: "u3" }))).toBe(true);
  });

  it("inbound: thiếu Nhà hàng & DV thì chưa xong — đây là 49 đoàn thiếu thật", () => {
    expect(daPhanXong("inbound", chon({ pv_ks: "u1", pv_xe: "u3" }))).toBe(false);
  });

  it("outbound: đủ 3 mục nhưng trống Visa thì chưa xong", () => {
    expect(daPhanXong("outbound", chon({ pv_ks: "u1", pv_nh_dv: "u2", pv_xe: "u3" }))).toBe(false);
    expect(daPhanXong("outbound", chon({ pv_ks: "u1", pv_nh_dv: "u2", pv_xe: "u3", pv_visa: "u4" }))).toBe(true);
  });

  it("chọn 'Không cần' cũng tính là đã xử lý, không phải để trống", () => {
    expect(daPhanXong("inbound", chon({ pv_ks: "u1", pv_nh_dv: "__kc__", pv_xe: "u3" }))).toBe(true);
  });

  it("chuỗi rỗng vẫn coi là để trống", () => {
    expect(daPhanXong("inbound", chon({ pv_ks: "u1", pv_nh_dv: "", pv_xe: "u3" }))).toBe(false);
  });
});
