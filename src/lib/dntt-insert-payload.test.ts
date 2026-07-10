import { describe, it, expect } from "vitest";
import { splitDnttPayload, chiPhiIdsOf } from "./dntt-insert-payload";

describe("splitDnttPayload", () => {
  it("bóc allocations ra khỏi payload ĐNTT", () => {
    const r = splitDnttPayload({
      doan_id: 80, loai: "nha_hang", so_tien: 3_850_000, trang_thai_duyet: "cho_duyet",
      allocations: [{ chi_phi_id: 13479, so_tien: 3_850_000 }],
    });
    expect(r.p_dntt).toEqual({
      doan_id: 80, loai: "nha_hang", so_tien: 3_850_000, trang_thai_duyet: "cho_duyet",
    });
    expect(r.p_dntt).not.toHaveProperty("allocations");
    expect(r.p_allocations).toEqual([{ chi_phi_id: 13479, so_tien: 3_850_000, ghi_chu: null }]);
  });

  it("không có allocations → mảng rỗng (hoàn ứng / HDV)", () => {
    const r = splitDnttPayload({ doan_id: 1, loai: "hoan_ung" });
    expect(r.p_allocations).toEqual([]);
    expect(chiPhiIdsOf(r)).toEqual([]);
  });

  it("GỘP dòng trùng chi_phi_id — nếu không sẽ vi phạm UNIQUE(dntt_id, chi_phi_id)", () => {
    const r = splitDnttPayload({
      doan_id: 1, loai: "dich_vu",
      allocations: [
        { chi_phi_id: 10, so_tien: 100 },
        { chi_phi_id: 11, so_tien: 200 },
        { chi_phi_id: 10, so_tien: 50 },
      ],
    });
    expect(r.p_allocations).toEqual([
      { chi_phi_id: 10, so_tien: 150, ghi_chu: null },
      { chi_phi_id: 11, so_tien: 200, ghi_chu: null },
    ]);
  });

  it("gộp dòng trùng vẫn giữ ghi chú khác rỗng đầu tiên", () => {
    const r = splitDnttPayload({
      loai: "dich_vu", doan_id: 1,
      allocations: [
        { chi_phi_id: 10, so_tien: 100, ghi_chu: null },
        { chi_phi_id: 10, so_tien: 50, ghi_chu: "cọc" },
      ],
    });
    expect(r.p_allocations[0].ghi_chu).toBe("cọc");
  });

  it("loại dòng so_tien <= 0 (CHECK so_tien > 0) và dòng FOC 0đ", () => {
    const r = splitDnttPayload({
      loai: "khach_san", doan_id: 1,
      allocations: [
        { chi_phi_id: 1, so_tien: 0 },       // FOC
        { chi_phi_id: 2, so_tien: -5 },      // rác
        { chi_phi_id: 3, so_tien: 1_000 },
      ],
    });
    expect(r.p_allocations).toEqual([{ chi_phi_id: 3, so_tien: 1_000, ghi_chu: null }]);
  });

  it("làm tròn về đồng nguyên (pro-rata sinh số lẻ)", () => {
    const r = splitDnttPayload({
      loai: "nha_hang", doan_id: 1,
      allocations: [{ chi_phi_id: 1, so_tien: 3_333.4 }, { chi_phi_id: 2, so_tien: 3_333.6 }],
    });
    expect(r.p_allocations.map((a) => a.so_tien)).toEqual([3_333, 3_334]);
  });

  it("gộp rồi mới loại: hai dòng cùng chi_phi triệt tiêu nhau vẫn bị loại", () => {
    const r = splitDnttPayload({
      loai: "nha_hang", doan_id: 1,
      allocations: [{ chi_phi_id: 1, so_tien: 100 }, { chi_phi_id: 1, so_tien: -100 }],
    });
    // dòng -100 bị loại TRƯỚC khi gộp → còn lại 100 (không triệt tiêu thành 0)
    expect(r.p_allocations).toEqual([{ chi_phi_id: 1, so_tien: 100, ghi_chu: null }]);
  });

  it("chiPhiIdsOf trả đúng danh sách để recalc", () => {
    const r = splitDnttPayload({
      loai: "dich_vu", doan_id: 1,
      allocations: [{ chi_phi_id: 7, so_tien: 1 }, { chi_phi_id: 9, so_tien: 2 }],
    });
    expect(chiPhiIdsOf(r)).toEqual([7, 9]);
  });
});
