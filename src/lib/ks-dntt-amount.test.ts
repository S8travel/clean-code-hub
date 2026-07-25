import { describe, it, expect } from "vitest";
import { calcKSDnttAmount } from "./ks-dntt-amount";

describe("calcKSDnttAmount — bất biến so_tien = cấn trừ + tiền mặt", () => {
  it("full mode: nghĩa vụ = toàn bộ còn lại, cấn trừ trừ ra tiền mặt", () => {
    // conLai 6.05tr, cấn trừ 3tr → phiếu 6.05tr, tiền mặt 3.05tr.
    const r = calcKSDnttAmount({ conLai: 6_050_000, canTruAmount: 3_000_000, mode: "full", depositAmount: 0 });
    expect(r.soTien).toBe(6_050_000);
    expect(r.tienMat).toBe(3_050_000);
    expect(r.conLaiSau).toBe(0);
    expect(r.hopLe).toBe(true);
    expect(r.soTien).toBe(r.tienMat + 3_000_000); // bất biến
  });

  it("deposit mode: cọc 3tr trả 100% bằng cấn trừ 3tr → tiền mặt 0, còn 3.05tr phiếu sau", () => {
    // ĐÂY là case đoàn thật: cọc 3tr, cấn trừ 3tr. Phiếu = 3tr (KHÔNG phải 6tr).
    const r = calcKSDnttAmount({ conLai: 6_050_000, canTruAmount: 3_000_000, mode: "deposit", depositAmount: 3_000_000 });
    expect(r.soTien).toBe(3_000_000);
    expect(r.tienMat).toBe(0);
    expect(r.conLaiSau).toBe(3_050_000);
    expect(r.hopLe).toBe(true);
  });

  it("deposit mode: cọc 3tr, cấn trừ 1tr → tiền mặt 2tr", () => {
    const r = calcKSDnttAmount({ conLai: 6_050_000, canTruAmount: 1_000_000, mode: "deposit", depositAmount: 3_000_000 });
    expect(r.soTien).toBe(3_000_000);
    expect(r.tienMat).toBe(2_000_000);
    expect(r.conLaiSau).toBe(3_050_000);
  });

  it("full mode không cấn trừ: tiền mặt = toàn bộ", () => {
    const r = calcKSDnttAmount({ conLai: 6_050_000, canTruAmount: 0, mode: "full", depositAmount: 0 });
    expect(r.soTien).toBe(6_050_000);
    expect(r.tienMat).toBe(6_050_000);
  });

  it("cọc = 0 → không hợp lệ", () => {
    const r = calcKSDnttAmount({ conLai: 6_050_000, canTruAmount: 0, mode: "deposit", depositAmount: 0 });
    expect(r.hopLe).toBe(false);
    expect(r.loi).toBe("Số tiền phải lớn hơn 0");
  });

  it("cọc vượt còn lại → không hợp lệ", () => {
    const r = calcKSDnttAmount({ conLai: 6_050_000, canTruAmount: 0, mode: "deposit", depositAmount: 7_000_000 });
    expect(r.hopLe).toBe(false);
    expect(r.loi).toBe("Số tiền vượt phần còn phải thanh toán");
  });

  it("cấn trừ vượt nghĩa vụ phiếu → không hợp lệ (không gạt nợ nhiều hơn số nợ phiếu)", () => {
    const r = calcKSDnttAmount({ conLai: 6_050_000, canTruAmount: 4_000_000, mode: "deposit", depositAmount: 3_000_000 });
    expect(r.hopLe).toBe(false);
    expect(r.loi).toBe("Cấn trừ vượt quá số tiền đề nghị");
  });

  it("full mode cấn trừ = toàn bộ → tiền mặt 0 (khớp #2737 thực tế)", () => {
    const r = calcKSDnttAmount({ conLai: 9_450_000, canTruAmount: 9_450_000, mode: "full", depositAmount: 0 });
    expect(r.soTien).toBe(9_450_000);
    expect(r.tienMat).toBe(0);
    expect(r.hopLe).toBe(true);
  });
});
