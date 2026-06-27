import { describe, it, expect } from "vitest";
import { resolveCanhDiemChiPhiTarget } from "./canh-diem-cascade";

const rowMoTa = { id: 1 };
const rowRef = { id: 2 };

describe("resolveCanhDiemChiPhiTarget", () => {
  it("merge cross-nhóm: có dòng theo mo_ta → UPDATE dòng đó", () => {
    expect(resolveCanhDiemChiPhiTarget(rowMoTa, null)).toBe(rowMoTa);
  });

  it("đổi tên cảnh điểm: mo_ta trượt nhưng ref khớp → UPDATE dòng cũ (KHÔNG INSERT đụng UNIQUE)", () => {
    expect(resolveCanhDiemChiPhiTarget(null, rowRef)).toBe(rowRef);
  });

  it("cảnh điểm mới hoàn toàn: cả 2 trượt → INSERT (null)", () => {
    expect(resolveCanhDiemChiPhiTarget(null, null)).toBeNull();
    expect(resolveCanhDiemChiPhiTarget(undefined, undefined)).toBeNull();
  });

  it("ưu tiên byMoTa khi cả 2 tồn tại nhưng khác dòng (giữ merge, không đụng dòng ref)", () => {
    expect(resolveCanhDiemChiPhiTarget(rowMoTa, rowRef)).toBe(rowMoTa);
  });
});
