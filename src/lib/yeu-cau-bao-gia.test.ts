import { describe, expect, it } from "vitest";
import {
  coChuGon,
  demTheoTrangThai,
  soNgayTuNgay,
  tenChuongTrinhTuYeuCau,
} from "./yeu-cau-bao-gia";

describe("soNgayTuNgay", () => {
  it("đếm cả hai đầu — 02→06/11 là 5 ngày (5N4Đ)", () => {
    expect(soNgayTuNgay("2026-11-02", "2026-11-06")).toBe(5);
  });

  it("đi về trong ngày = 1 ngày", () => {
    expect(soNgayTuNgay("2026-11-02", "2026-11-02")).toBe(1);
  });

  it("thiếu một đầu ngày thì trả null, không đoán bừa", () => {
    expect(soNgayTuNgay("2026-11-02", null)).toBeNull();
    expect(soNgayTuNgay(null, "2026-11-06")).toBeNull();
    expect(soNgayTuNgay(null, null)).toBeNull();
    expect(soNgayTuNgay("", "")).toBeNull();
  });

  it("ngày về trước ngày đi thì trả null chứ không ra số âm", () => {
    expect(soNgayTuNgay("2026-11-06", "2026-11-02")).toBeNull();
  });

  it("chuỗi không phải ngày thì trả null", () => {
    expect(soNgayTuNgay("tháng 11", "2026-11-06")).toBeNull();
  });

  it("qua tháng và qua năm vẫn đúng", () => {
    expect(soNgayTuNgay("2026-10-30", "2026-11-03")).toBe(5);
    expect(soNgayTuNgay("2026-12-30", "2027-01-02")).toBe(4);
  });

  it("không lệch vì giờ mùa hè / múi giờ (khoảng dài)", () => {
    expect(soNgayTuNgay("2026-03-01", "2026-04-01")).toBe(32);
  });
});

describe("tenChuongTrinhTuYeuCau", () => {
  it("có tiêu đề thì dùng đúng tiêu đề đối tác đặt, không đánh dấu tự ghép", () => {
    expect(tenChuongTrinhTuYeuCau({ tieu_de: "河內－下龍 5天4夜", ten_agent: "Guo" }))
      .toEqual({ ten: "河內－下龍 5天4夜", tu_ghep: false });
  });

  it("tiêu đề toàn khoảng trắng coi như không có", () => {
    expect(tenChuongTrinhTuYeuCau({ tieu_de: "   ", noi_dung: "20 khách tháng 10", ten_agent: "Guo" }))
      .toEqual({ ten: "20 khách tháng 10", tu_ghep: true });
  });

  it("không tiêu đề thì lấy dòng đầu nội dung và ĐÁNH DẤU là tên tự ghép", () => {
    expect(tenChuongTrinhTuYeuCau({ noi_dung: "\n\nCần báo giá Hà Nội\nKhách sạn 4 sao", ten_agent: "Guo" }))
      .toEqual({ ten: "Cần báo giá Hà Nội", tu_ghep: true });
  });

  it("KHÔNG ghép tên đối tác vào tên chương trình (bảng tạo báo giá đã có ô Agent)", () => {
    const kq = tenChuongTrinhTuYeuCau({ noi_dung: "Cần báo giá Hà Nội", ten_agent: "Guo" });
    expect(kq.ten).toBe("Cần báo giá Hà Nội");
    expect(kq.ten).not.toContain("Guo");
  });

  it("dòng đầu quá dài thì cắt ở 80 ký tự", () => {
    const dai = "x".repeat(200);
    const { ten } = tenChuongTrinhTuYeuCau({ noi_dung: dai });
    expect(ten).toHaveLength(81); // 80 ký tự + dấu …
    expect(ten.endsWith("…")).toBe(true);
  });

  it("không có gì thì trả chuỗi rỗng, KHÔNG bịa tên", () => {
    expect(tenChuongTrinhTuYeuCau({})).toEqual({ ten: "", tu_ghep: false });
    expect(tenChuongTrinhTuYeuCau({ tieu_de: null, noi_dung: null, ten_agent: "Guo" }))
      .toEqual({ ten: "", tu_ghep: false });
  });
});

describe("demTheoTrangThai", () => {
  it("đếm theo trạng thái hiển thị", () => {
    const dem = demTheoTrangThai([
      { trang_thai_hien_thi: "moi" },
      { trang_thai_hien_thi: "moi" },
      { trang_thai_hien_thi: "da_bao_gia" },
      { trang_thai_hien_thi: "bo_qua" },
    ]);
    expect(dem).toEqual({ tat_ca: 4, moi: 2, da_bao_gia: 1, bo_qua: 1 });
  });

  it("danh sách rỗng ra toàn 0", () => {
    expect(demTheoTrangThai([])).toEqual({ tat_ca: 0, moi: 0, da_bao_gia: 0, bo_qua: 0 });
  });
});

describe("coChuGon", () => {
  it("đổi byte sang đơn vị người đọc được", () => {
    expect(coChuGon(512)).toBe("512 B");
    expect(coChuGon(2048)).toBe("2 KB");
    expect(coChuGon(1_500_000)).toBe("1,4 MB");
  });

  it("không có cỡ file thì không hiện gì", () => {
    expect(coChuGon(null)).toBe("");
    expect(coChuGon(0)).toBe("");
    expect(coChuGon(undefined)).toBe("");
  });
});
