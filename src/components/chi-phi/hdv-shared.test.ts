import { describe, it, expect } from "vitest";
import {
  giftMoTa,
  isGiftRow,
  GIFT_DON_GIA,
  isTipLaiXeRow,
  TIP_LAI_XE_MO_TA,
  TIP_LAI_XE_REF,
  resolveHoTroNguoiTt,
} from "./hdv-shared";

describe("quà tặng khách (hdv_ho_tro)", () => {
  it("giftMoTa ghép mô tả '{Quà} tặng khách'", () => {
    expect(giftMoTa("Sim")).toBe("Sim tặng khách");
    expect(giftMoTa("Nón")).toBe("Nón tặng khách");
    expect(giftMoTa("Mũ lưỡi trai")).toBe("Mũ lưỡi trai tặng khách");
  });

  it("isGiftRow nhận đúng row quà, bỏ qua row thường", () => {
    expect(isGiftRow("Sim tặng khách")).toBe(true);
    expect(isGiftRow("Nước tặng khách")).toBe(true);
    expect(isGiftRow("  Quạt tặng khách  ")).toBe(true); // trim
    expect(isGiftRow("Công tác phí")).toBe(false);
    expect(isGiftRow("Tip lái xe")).toBe(false);
    expect(isGiftRow("")).toBe(false);
    expect(isGiftRow(null)).toBe(false);
    expect(isGiftRow(undefined)).toBe(false);
  });

  it("đơn giá mặc định / khách: Sim + Nón/Ảnh/Dầu/Nước có giá, quà khác = 0 (OP nhập)", () => {
    expect(GIFT_DON_GIA.Sim).toBe(75_000);
    expect(GIFT_DON_GIA["Nón"]).toBe(20_000);
    expect(GIFT_DON_GIA["Ảnh"]).toBe(10_000);
    expect(GIFT_DON_GIA["Dầu"]).toBe(8_000);
    expect(GIFT_DON_GIA["Nước"]).toBe(2_500);
    expect(GIFT_DON_GIA["Túi xách"] ?? 0).toBe(0);
    expect(GIFT_DON_GIA["Mũ lưỡi trai"] ?? 0).toBe(0);
    expect(GIFT_DON_GIA["Quạt"] ?? 0).toBe(0);
  });
});

describe("Tip lái xe", () => {
  it("isTipLaiXeRow chỉ khớp đúng mô tả 'Tip lái xe'", () => {
    expect(isTipLaiXeRow(TIP_LAI_XE_MO_TA)).toBe(true);
    expect(isTipLaiXeRow("Tip lái xe")).toBe(true);
    expect(isTipLaiXeRow("  Tip lái xe  ")).toBe(true);
    expect(isTipLaiXeRow("Tip lái xe 16C")).toBe(false);
    expect(isTipLaiXeRow("Sim tặng khách")).toBe(false);
    expect(isTipLaiXeRow(null)).toBe(false);
  });

  it("bảng giá tham khảo: 3 mức chỗ × 3 miền, khớp số liệu gốc", () => {
    expect(TIP_LAI_XE_REF.map((r) => r.seats)).toEqual(["16C", "35C", "45C"]);
    // 16C: MT 150k / PQ 200k / MN 200k
    expect(TIP_LAI_XE_REF[0]).toEqual({ seats: "16C", mt: 150_000, pq: 200_000, mn: 200_000 });
    // 35C: MT 200k / PQ 250k / MN 250k
    expect(TIP_LAI_XE_REF[1]).toEqual({ seats: "35C", mt: 200_000, pq: 250_000, mn: 250_000 });
    // 45C: MT 250k / PQ 300k / MN 300k
    expect(TIP_LAI_XE_REF[2]).toEqual({ seats: "45C", mt: 250_000, pq: 300_000, mn: 300_000 });
  });
});

describe("resolveHoTroNguoiTt — nguồn người trả mặc định", () => {
  it("tien_hdv > 0 → HDV (ưu tiên)", () => {
    expect(resolveHoTroNguoiTt({ tien_cong_ty: 0, tien_hdv: 500 })).toBe("hdv");
    // HDV thắng kể cả khi cả 2 > 0
    expect(resolveHoTroNguoiTt({ tien_cong_ty: 100, tien_hdv: 500 })).toBe("hdv");
  });

  it("tien_cong_ty > 0 (HDV = 0) → Công ty", () => {
    expect(resolveHoTroNguoiTt({ tien_cong_ty: 975_000, tien_hdv: 0 })).toBe("cong_ty");
  });

  it("cả 2 = 0 → HDV (mặc định cho mọi row, kể cả quà & tip lái xe)", () => {
    expect(resolveHoTroNguoiTt({ tien_cong_ty: 0, tien_hdv: 0 })).toBe("hdv");
  });
});
