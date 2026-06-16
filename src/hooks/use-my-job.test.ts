import { describe, it, expect } from "vitest";
import { nhDeadlineTypes } from "./use-my-job";

// Bug: deadline tàu ngày (du thuyền) hiển thị icon "KS" nhưng lưu ở
// doan_booking_nh. Nút "Đã xong" route mark_deadline_done theo rpcType — nếu
// dùng type hiển thị ("ks") sẽ UPDATE nhầm doan_booking_ks → 0 rows → lỗi.
describe("nhDeadlineTypes", () => {
  it("tàu ngày: hiển thị KS nhưng route về bảng nh", () => {
    expect(nhDeadlineTypes("tau_ngay")).toEqual({ type: "ks", rpcType: "nh" });
  });

  it("nhà hàng thường: hiển thị NH, route nh", () => {
    expect(nhDeadlineTypes("nha_hang")).toEqual({ type: "nh", rpcType: "nh" });
  });

  it("loai null/undefined: mặc định NH", () => {
    expect(nhDeadlineTypes(null)).toEqual({ type: "nh", rpcType: "nh" });
    expect(nhDeadlineTypes(undefined)).toEqual({ type: "nh", rpcType: "nh" });
  });

  it("rpcType LUÔN là 'nh' bất kể loai (chống regression route nhầm)", () => {
    for (const loai of ["tau_ngay", "tau_dem", "nha_hang", "buffet", ""]) {
      expect(nhDeadlineTypes(loai).rpcType).toBe("nh");
    }
  });
});
