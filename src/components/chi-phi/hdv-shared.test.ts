import { describe, it, expect } from "vitest";
import {
  giftMoTa,
  isGiftRow,
  GIFT_DON_GIA,
  isTipLaiXeRow,
  TIP_LAI_XE_MO_TA,
  TIP_LAI_XE_REF,
  resolveHoTroNguoiTt,
  DEFAULT_KHAC_MO_TAS,
  SYSTEM_KHAC_ORDER,
  missingDefaultKhacMoTas,
  orderKhacItems,
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

describe("khoản Khác mặc định (DEFAULT_KHAC_MO_TAS)", () => {
  it("đúng 7 khoản chuẩn theo thứ tự user chốt", () => {
    expect(DEFAULT_KHAC_MO_TAS).toEqual([
      "Nước Aqua",
      "Nước Pocari",
      "Tiền ngủ",
      "CTP HDV",
      "Tiền nước mùa hè",
      "Ăn nội bộ lái xe",
      "Bia, nước ngọt nhà hàng",
    ]);
  });

  it("SYSTEM_KHAC_ORDER = Tip lái xe trước, rồi 7 khoản mặc định", () => {
    expect(SYSTEM_KHAC_ORDER).toEqual([TIP_LAI_XE_MO_TA, ...DEFAULT_KHAC_MO_TAS]);
  });
});

describe("missingDefaultKhacMoTas — danh sách cần auto-thêm", () => {
  it("đoàn đang chạy, trống trơn → thiếu Tip + cả 7 khoản (đúng thứ tự)", () => {
    expect(missingDefaultKhacMoTas([], true)).toEqual(SYSTEM_KHAC_ORDER);
  });

  it("đoàn cũ (isActive=false) → CHỈ ép Tip lái xe, KHÔNG ép 7 khoản", () => {
    expect(missingDefaultKhacMoTas([], false)).toEqual([TIP_LAI_XE_MO_TA]);
    // đoàn cũ đã có Tip → không thiếu gì
    expect(missingDefaultKhacMoTas([TIP_LAI_XE_MO_TA], false)).toEqual([]);
  });

  it("đã có sẵn vài khoản → chỉ trả phần còn thiếu", () => {
    const existing = [TIP_LAI_XE_MO_TA, "CTP HDV", "Tiền ngủ"];
    expect(missingDefaultKhacMoTas(existing, true)).toEqual([
      "Nước Aqua",
      "Nước Pocari",
      "Tiền nước mùa hè",
      "Ăn nội bộ lái xe",
      "Bia, nước ngọt nhà hàng",
    ]);
  });

  it("so khớp sau khi trim (dòng chuẩn có khoảng trắng thừa → không nhân đôi)", () => {
    expect(missingDefaultKhacMoTas(["  CTP HDV  "], true)).not.toContain("CTP HDV");
  });

  it("phân biệt hoa/thường: 'ctp hdv' gõ tay KHÔNG khớp → vẫn seed dòng chuẩn 'CTP HDV'", () => {
    expect(missingDefaultKhacMoTas(["ctp hdv"], true)).toContain("CTP HDV");
  });

  it("bỏ qua null/undefined trong danh sách hiện có", () => {
    expect(missingDefaultKhacMoTas([null, undefined, TIP_LAI_XE_MO_TA], true)).toEqual(
      DEFAULT_KHAC_MO_TAS,
    );
  });
});

describe("orderKhacItems — sắp xếp dòng Khác", () => {
  it("dòng hệ thống lên đầu theo SYSTEM_KHAC_ORDER, phần còn lại giữ thứ tự (sort ổn định)", () => {
    const rows = [
      { id: 1, mo_ta: "Sim tặng khách" },   // không thuộc hệ thống
      { id: 2, mo_ta: "CTP HDV" },
      { id: 3, mo_ta: "Khoản OP tự thêm" }, // không thuộc hệ thống
      { id: 4, mo_ta: TIP_LAI_XE_MO_TA },
      { id: 5, mo_ta: "Nước Aqua" },
    ];
    expect(orderKhacItems(rows).map((r) => r.id)).toEqual([4, 5, 2, 1, 3]);
  });

  it("không đột biến mảng gốc", () => {
    const rows = [{ id: 1, mo_ta: "CTP HDV" }, { id: 2, mo_ta: TIP_LAI_XE_MO_TA }];
    const out = orderKhacItems(rows);
    expect(rows.map((r) => r.id)).toEqual([1, 2]); // gốc nguyên vẹn
    expect(out.map((r) => r.id)).toEqual([2, 1]);
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
