import { describe, it, expect } from "vitest";
import { CAN_TRU_DOAN_PREFIX, canTruGhiChu, buildCanTruNote } from "./can-tru-note";

describe("canTruGhiChu", () => {
  it("tạo ghi_chu có prefix + tên đoàn nguồn", () => {
    expect(canTruGhiChu("VDC052705BR6")).toBe("Cấn trừ từ đoàn: VDC052705BR6");
  });
});

describe("buildCanTruNote", () => {
  const pay = (ghi_chu: string | null) => ({ ghi_chu });

  it("gộp 1 đoàn nguồn (nhiều payment cùng đoàn → bỏ trùng)", () => {
    // 2 công nợ cùng đoàn VDC052705BR6 (case Vinpearl Quảng Nam thực tế)
    expect(
      buildCanTruNote([pay(canTruGhiChu("VDC052705BR6")), pay(canTruGhiChu("VDC052705BR6"))]),
    ).toBe("Cấn trừ từ đoàn: VDC052705BR6");
  });

  it("gộp nhiều đoàn nguồn khác nhau", () => {
    expect(
      buildCanTruNote([pay(canTruGhiChu("ĐOÀN A")), pay(canTruGhiChu("ĐOÀN B"))]),
    ).toBe("Cấn trừ từ đoàn: ĐOÀN A, ĐOÀN B");
  });

  it("bỏ qua payment không phải cấn trừ / ghi_chu rỗng", () => {
    expect(buildCanTruNote([pay(null), pay("Thanh toán tiền mặt"), pay(canTruGhiChu("ĐOÀN X"))]))
      .toBe("Cấn trừ từ đoàn: ĐOÀN X");
  });

  it("không có cấn trừ → undefined", () => {
    expect(buildCanTruNote([pay(null), pay("abc")])).toBeUndefined();
    expect(buildCanTruNote([])).toBeUndefined();
  });

  it("prefix khớp hằng số export (chống lệch định dạng)", () => {
    expect(canTruGhiChu("X").startsWith(CAN_TRU_DOAN_PREFIX)).toBe(true);
  });
});
