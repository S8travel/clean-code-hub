import { describe, it, expect } from "vitest";
import {
  boDau, chuanHoaGia, chuanHoaFoc, locBangGia, tenBiTrung, loiDongBangGia,
  MAX_GIA_VND, type BangGiaRowLite,
} from "./bang-gia-sua-tay";

const r = (ten: string, loai: string, gia: number | null = 100_000): BangGiaRowLite =>
  ({ ten, loai, gia });

describe("boDau", () => {
  it("bỏ dấu + lowercase, giữ chữ Hán", () => {
    expect(boDau("Lẩu Cầm Nam")).toBe("lau cam nam");
    expect(boDau("Mgallery Cát Bà")).toBe("mgallery cat ba");
    expect(boDau("越式料理")).toBe("越式料理");
    expect(boDau("  Ga   Hải  sản ")).toBe("ga hai san");
  });
});

describe("chuanHoaGia", () => {
  it("nhận mọi cách gõ tiền", () => {
    expect(chuanHoaGia("450.000")).toBe(450_000);
    expect(chuanHoaGia("450,000 ₫")).toBe(450_000);
    expect(chuanHoaGia("450000")).toBe(450_000);
    expect(chuanHoaGia(1_390_000)).toBe(1_390_000);
    expect(chuanHoaGia(450_000.4)).toBe(450_000);
  });
  it("rỗng / 0 / âm / vượt trần → null", () => {
    expect(chuanHoaGia("")).toBeNull();
    expect(chuanHoaGia(null)).toBeNull();
    expect(chuanHoaGia("abc")).toBeNull();
    expect(chuanHoaGia("0")).toBeNull();
    expect(chuanHoaGia(-5)).toBeNull();
    expect(chuanHoaGia(MAX_GIA_VND)).toBe(MAX_GIA_VND);
    expect(chuanHoaGia(MAX_GIA_VND + 1)).toBeNull();
  });
  it("gõ thừa số 0 vượt trần thì KHÔNG lưu bừa", () => {
    expect(chuanHoaGia("450000000000")).toBeNull(); // 450 tỷ
  });
});

describe("chuanHoaFoc", () => {
  it("giữ thập phân (16 免 1.5 có thật)", () => {
    expect(chuanHoaFoc("1")).toBe(1);
    expect(chuanHoaFoc("1.5")).toBe(1.5);
    expect(chuanHoaFoc("1,5")).toBe(1.5);
    expect(chuanHoaFoc(2)).toBe(2);
  });
  it("rỗng / rác / âm → 0", () => {
    expect(chuanHoaFoc("")).toBe(0);
    expect(chuanHoaFoc(null)).toBe(0);
    expect(chuanHoaFoc("abc")).toBe(0);
    expect(chuanHoaFoc(-3)).toBe(0);
  });
});

describe("locBangGia", () => {
  const rows = [
    r("Ga Hải sản", "nha_hang", 360_000),
    r("IRIS CRUISE", "nha_hang", 1_390_000),
    r("Lẩu Cầm Nam+1 tôm", "nha_hang", 690_000),
    r("Mgallery Cát Bà", "hotel", 600_000),
    r("Xe 45 chỗ", "xe", 17_580_000),
  ];

  it("không lọc gì → giữ nguyên cả danh sách VÀ thứ tự", () => {
    expect(locBangGia(rows)).toEqual(rows);
    expect(locBangGia(rows, { q: "", loai: "tat_ca" })).toEqual(rows);
  });
  it("tìm theo tên, không cần gõ dấu", () => {
    expect(locBangGia(rows, { q: "lau cam" }).map((x) => x.ten)).toEqual(["Lẩu Cầm Nam+1 tôm"]);
    expect(locBangGia(rows, { q: "LẨU" }).map((x) => x.ten)).toEqual(["Lẩu Cầm Nam+1 tôm"]);
    expect(locBangGia(rows, { q: "hai san" }).map((x) => x.ten)).toEqual(["Ga Hải sản"]);
  });
  it("lọc theo loại + kết hợp từ khoá", () => {
    expect(locBangGia(rows, { loai: "hotel" }).map((x) => x.ten)).toEqual(["Mgallery Cát Bà"]);
    expect(locBangGia(rows, { loai: "nha_hang", q: "cruise" }).map((x) => x.ten)).toEqual(["IRIS CRUISE"]);
    expect(locBangGia(rows, { loai: "xe", q: "cruise" })).toEqual([]);
  });
});

describe("tenBiTrung", () => {
  it("bắt tên trùng kể cả khác dấu / khác hoa thường", () => {
    const dup = tenBiTrung([
      r("Lẩu Cầm Nam", "nha_hang", 230_000),
      r("lau cam nam", "nha_hang", 250_000),
      r("Ga Hải sản", "nha_hang"),
    ]);
    expect(dup.has("lau cam nam")).toBe(true);
    expect(dup.has("ga hai san")).toBe(false);
  });
  it("tên rỗng không bị coi là trùng nhau", () => {
    expect(tenBiTrung([r("", "nha_hang"), r("  ", "nha_hang")]).size).toBe(0);
  });
});

describe("loiDongBangGia", () => {
  it("chặn dòng thiếu tên / thiếu giá", () => {
    expect(loiDongBangGia({ ten: "", gia: 100 })).toBe("Chưa có tên dịch vụ");
    expect(loiDongBangGia({ ten: "   ", gia: 100 })).toBe("Chưa có tên dịch vụ");
    expect(loiDongBangGia({ ten: "Ga Hải sản", gia: null })).toBe("Giá phải lớn hơn 0");
    expect(loiDongBangGia({ ten: "Ga Hải sản", gia: 0 })).toBe("Giá phải lớn hơn 0");
  });
  it("dòng đủ tên + giá → hợp lệ", () => {
    expect(loiDongBangGia({ ten: "Ga Hải sản", gia: 360_000 })).toBeNull();
  });
});
