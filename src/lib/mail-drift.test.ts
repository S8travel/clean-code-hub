import { describe, it, expect } from "vitest";
import { soSanhMailKS, type KsMailSnapshot } from "./mail-drift";

const base: KsMailSnapshot = {
  khach_san_id: 101,
  check_in_dates: ["2026-11-26", "2026-11-27", "2026-11-28"],
  so_phong: "5TWIN 6DBL",
  ghi_chu: "",
};

describe("soSanhMailKS", () => {
  it("không có bản chốt → không báo lệch", () => {
    expect(soSanhMailKS(null, base)).toEqual([]);
    expect(soSanhMailKS(undefined, base)).toEqual([]);
  });

  it("dữ liệu y nguyên → không báo lệch", () => {
    expect(soSanhMailKS(base, { ...base, check_in_dates: [...base.check_in_dates] })).toEqual([]);
  });

  // Ca thật: mail dựng lúc mới lưu 3 đêm, đêm thứ 4 ghi xong ngay sau đó.
  it("thêm một đêm → báo cả số đêm lẫn danh sách ngày", () => {
    const sau = { ...base, check_in_dates: [...base.check_in_dates, "2026-11-29"] };
    expect(soSanhMailKS(base, sau)).toEqual([
      { nhan: "Số đêm", truoc: "3", sau: "4" },
      {
        nhan: "Ngày ở",
        truoc: "26/11, 27/11, 28/11",
        sau: "26/11, 27/11, 28/11, 29/11",
      },
    ]);
  });

  it("dời ngày nhưng giữ số đêm → chỉ báo danh sách ngày", () => {
    const sau = { ...base, check_in_dates: ["2026-11-27", "2026-11-28", "2026-11-29"] };
    expect(soSanhMailKS(base, sau)).toEqual([
      { nhan: "Ngày ở", truoc: "26/11, 27/11, 28/11", sau: "27/11, 28/11, 29/11" },
    ]);
  });

  it("bớt đêm → số đêm giảm", () => {
    const sau = { ...base, check_in_dates: ["2026-11-26", "2026-11-27"] };
    expect(soSanhMailKS(base, sau).map((i) => i.nhan)).toEqual(["Số đêm", "Ngày ở"]);
  });

  it("đổi số phòng / ghi chú → báo, khoảng trắng thừa thì không", () => {
    expect(soSanhMailKS(base, { ...base, so_phong: "6TWIN 5DBL" })).toEqual([
      { nhan: "Số phòng", truoc: "5TWIN 6DBL", sau: "6TWIN 5DBL" },
    ]);
    expect(soSanhMailKS(base, { ...base, ghi_chu: "Nhận phòng sớm" })).toEqual([
      { nhan: "Ghi chú", truoc: "—", sau: "Nhận phòng sớm" },
    ]);
    expect(soSanhMailKS(base, { ...base, so_phong: "  5TWIN 6DBL  " })).toEqual([]);
  });

  it("mất hết số phòng → hiện dấu — cho ô trống", () => {
    expect(soSanhMailKS(base, { ...base, so_phong: "" })).toEqual([
      { nhan: "Số phòng", truoc: "5TWIN 6DBL", sau: "—" },
    ]);
  });

  it("đổi khách sạn → báo mã KS", () => {
    expect(soSanhMailKS(base, { ...base, khach_san_id: 102 })).toEqual([
      { nhan: "Khách sạn", truoc: "#101", sau: "#102" },
    ]);
  });

  it("ngày không đúng định dạng → giữ nguyên văn", () => {
    const truoc = { ...base, check_in_dates: ["2026-11-26"] };
    const sau = { ...base, check_in_dates: ["ngay-la"] };
    expect(soSanhMailKS(truoc, sau)).toEqual([
      { nhan: "Ngày ở", truoc: "26/11", sau: "ngay-la" },
    ]);
  });
});
