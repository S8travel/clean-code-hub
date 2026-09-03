import { describe, it, expect } from "vitest";
import {
  doTyGiaMacDinh, tyGiaCuaBaoGia, tyGiaHopLe, TY_GIA_BAO_GIA_MAC_DINH,
} from "./bao-gia-ty-gia";

describe("tyGiaHopLe", () => {
  it("nhận tỷ giá VND/USD thực tế", () => {
    expect(tyGiaHopLe(25500)).toBe(true);
    expect(tyGiaHopLe(26000)).toBe(true);
  });
  it("loại số vô lý (gõ nhầm dấu chấm / thừa số 0)", () => {
    expect(tyGiaHopLe(25.5)).toBe(false);
    expect(tyGiaHopLe(2550000)).toBe(false);
    expect(tyGiaHopLe(0)).toBe(false);
    expect(tyGiaHopLe(-25500)).toBe(false);
  });
  it("loại giá trị không phải số", () => {
    expect(tyGiaHopLe(null)).toBe(false);
    expect(tyGiaHopLe(undefined)).toBe(false);
    expect(tyGiaHopLe(NaN)).toBe(false);
    expect(tyGiaHopLe(Infinity)).toBe(false);
  });
});

describe("doTyGiaMacDinh", () => {
  it("đọc được số lưu dạng chuỗi", () => {
    expect(doTyGiaMacDinh("25500")).toBe(25500);
    expect(doTyGiaMacDinh("25.800".replace(".", ""))).toBe(25800);
    expect(doTyGiaMacDinh(26000)).toBe(26000);
  });
  it("bỏ dấu phân cách người dùng gõ", () => {
    expect(doTyGiaMacDinh("25,500")).toBe(25500);
    expect(doTyGiaMacDinh(" 25 500 ")).toBe(25500);
  });
  it("thiếu / rỗng / rác → về hằng số code", () => {
    expect(doTyGiaMacDinh(null)).toBe(TY_GIA_BAO_GIA_MAC_DINH);
    expect(doTyGiaMacDinh(undefined)).toBe(TY_GIA_BAO_GIA_MAC_DINH);
    expect(doTyGiaMacDinh("")).toBe(TY_GIA_BAO_GIA_MAC_DINH);
    expect(doTyGiaMacDinh("abc")).toBe(TY_GIA_BAO_GIA_MAC_DINH);
  });
  it("giá trị ngoài biên → về hằng số code (không để 0 trôi vào phép chia)", () => {
    expect(doTyGiaMacDinh("0")).toBe(TY_GIA_BAO_GIA_MAC_DINH);
    expect(doTyGiaMacDinh("2550000")).toBe(TY_GIA_BAO_GIA_MAC_DINH);
    expect(doTyGiaMacDinh("-25500")).toBe(TY_GIA_BAO_GIA_MAC_DINH);
  });
});

describe("tyGiaCuaBaoGia — tỷ giá dùng để tính tiền một báo giá", () => {
  it("giữ nguyên tỷ giá đã lưu của báo giá", () => {
    expect(tyGiaCuaBaoGia(26000)).toBe(26000);
    expect(tyGiaCuaBaoGia(24800)).toBe(24800);
  });
  it("báo giá chưa có tỷ giá → hằng số, KHÔNG phải 0", () => {
    expect(tyGiaCuaBaoGia(null)).toBe(TY_GIA_BAO_GIA_MAC_DINH);
    expect(tyGiaCuaBaoGia(undefined)).toBe(TY_GIA_BAO_GIA_MAC_DINH);
  });
  it("tỷ giá 0 / âm KHÔNG được lọt ra (chia cho 0 → Infinity trong file Word)", () => {
    expect(tyGiaCuaBaoGia(0)).toBe(TY_GIA_BAO_GIA_MAC_DINH);
    expect(tyGiaCuaBaoGia(-26000)).toBe(TY_GIA_BAO_GIA_MAC_DINH);
    expect(tyGiaCuaBaoGia(NaN)).toBe(TY_GIA_BAO_GIA_MAC_DINH);
  });
  it("đổi mức mặc định của nhóm KHÔNG đụng báo giá đã có tỷ giá", () => {
    // Hằng số trong code là nơi duy nhất hàm này nhìn vào — cài đặt của nhóm
    // (bảng cai_dat_he_thong) cố ý KHÔNG được đọc ở đây.
    expect(tyGiaCuaBaoGia(26000)).toBe(26000);
  });
});
