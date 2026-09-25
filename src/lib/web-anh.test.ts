import { describe, it, expect } from "vitest";
import {
  buildWebAnhPath,
  chuanHoaSlideThuTu,
  fitLongEdge,
  kiemTraFileAnh,
  laAnhWikimedia,
  locWebRows,
  mergeShowcaseRows,
  pickOutput,
  WEB_ANH_MAX_BYTES,
  webAnhStoragePath,
} from "./web-anh";

const SB = "https://lflsbwoqzmbknzdpaequ.supabase.co/storage/v1/object/public";

describe("fitLongEdge", () => {
  it("co ảnh ngang theo cạnh dài, giữ tỷ lệ", () => {
    expect(fitLongEdge(4000, 3000, 1600)).toEqual({ width: 1600, height: 1200 });
  });
  it("co ảnh dọc theo chiều cao", () => {
    expect(fitLongEdge(3000, 4000, 1920)).toEqual({ width: 1440, height: 1920 });
  });
  it("không phóng to ảnh nhỏ hơn ngưỡng", () => {
    expect(fitLongEdge(800, 600, 1600)).toEqual({ width: 800, height: 600 });
  });
  it("kích thước hỏng → 0×0 để caller báo lỗi", () => {
    expect(fitLongEdge(0, 10, 100)).toEqual({ width: 0, height: 0 });
    expect(fitLongEdge(Number.NaN, 10, 100)).toEqual({ width: 0, height: 0 });
  });
});

describe("pickOutput", () => {
  it("logo giữ PNG, ảnh và slide ra JPEG có quality", () => {
    expect(pickOutput("logo")).toEqual({ mime: "image/png", ext: "png" });
    expect(pickOutput("anh")).toMatchObject({ mime: "image/jpeg", ext: "jpg" });
    expect(pickOutput("slide").quality).toBeGreaterThan(0.5);
  });
});

describe("kiemTraFileAnh", () => {
  const f = (type: string, name: string, size = 1000) => ({ type, name, size });
  it("nhận JPG/PNG/WEBP cho ảnh, SVG cho logo", () => {
    expect(kiemTraFileAnh(f("image/jpeg", "a.jpg"), "anh")).toBeNull();
    expect(kiemTraFileAnh(f("image/webp", "a.webp"), "slide")).toBeNull();
    expect(kiemTraFileAnh(f("image/svg+xml", "logo.svg"), "logo")).toBeNull();
  });
  it("không có MIME thì xét đuôi file", () => {
    expect(kiemTraFileAnh(f("", "anh.PNG"), "anh")).toBeNull();
    expect(kiemTraFileAnh(f("", "anh.heic"), "anh")).toMatch(/HEIC/);
  });
  it("từ chối HEIC, SVG cho ảnh chụp, file quá lớn", () => {
    expect(kiemTraFileAnh(f("image/heic", "a.heic"), "anh")).toMatch(/HEIC/);
    expect(kiemTraFileAnh(f("image/svg+xml", "a.svg"), "anh")).toMatch(/SVG/);
    expect(kiemTraFileAnh(f("image/jpeg", "a.jpg", WEB_ANH_MAX_BYTES + 1), "anh")).toMatch(/20 MB/);
  });
});

describe("buildWebAnhPath", () => {
  it("xếp theo loại / khoá / kind-ts", () => {
    expect(buildWebAnhPath("khach_san", 12, "anh", 1700, "jpg")).toBe("showcase/khach_san/12/anh-1700.jpg");
    expect(buildWebAnhPath("canh_diem", "cau-vang", "slide", 1, "jpg")).toBe("showcase/canh_diem/cau-vang/slide-1.jpg");
  });
  it("khoá có ký tự lạ thì thay bằng gạch — Storage không nhận dấu", () => {
    expect(buildWebAnhPath("nha_hang", "phố cổ/1", "logo", 5, "png")).toBe("showcase/nha_hang/ph-c-1/logo-5.png");
  });
});

describe("webAnhStoragePath", () => {
  it("file mình tải trong web-images/showcase → path để xoá", () => {
    expect(webAnhStoragePath(`${SB}/web-images/showcase/khach_san/12/anh-1.jpg`)).toBe("showcase/khach_san/12/anh-1.jpg");
  });
  it("nhánh khác của bucket, bucket khác, link ngoài, rỗng → null", () => {
    expect(webAnhStoragePath(`${SB}/web-images/site/logo.png`)).toBeNull();
    expect(webAnhStoragePath(`${SB}/doan-files/showcase/x.jpg`)).toBeNull();
    expect(webAnhStoragePath("https://upload.wikimedia.org/wikipedia/commons/a/ab/x.jpg")).toBeNull();
    expect(webAnhStoragePath("https://hotel.example.com/wp-content/x.jpg")).toBeNull();
    expect(webAnhStoragePath(null)).toBeNull();
    expect(webAnhStoragePath("")).toBeNull();
  });
});

describe("laAnhWikimedia", () => {
  it("nhận upload/thumb wikimedia, không nhận web khác", () => {
    expect(laAnhWikimedia("https://upload.wikimedia.org/wikipedia/commons/a/ab/x.jpg")).toBe(true);
    expect(laAnhWikimedia("https://thumb.wikimedia.org/wikipedia/commons/thumb/a/x.jpg/960px-x.jpg")).toBe(true);
    expect(laAnhWikimedia(`${SB}/web-images/showcase/canh_diem/x/anh-1.jpg`)).toBe(false);
    expect(laAnhWikimedia(null)).toBe(false);
  });
});

describe("chuanHoaSlideThuTu", () => {
  it("số dương → số; rỗng / 0 / chữ → null (bỏ khỏi slide)", () => {
    expect(chuanHoaSlideThuTu("3")).toBe(3);
    expect(chuanHoaSlideThuTu(" 7 ")).toBe(7);
    expect(chuanHoaSlideThuTu("")).toBeNull();
    expect(chuanHoaSlideThuTu("0")).toBeNull();
    expect(chuanHoaSlideThuTu("-2")).toBeNull();
    expect(chuanHoaSlideThuTu("abc")).toBeNull();
  });
});

describe("mergeShowcaseRows", () => {
  const master = [
    { id: 2, ten: "Zeta Hotel", dia_diem: "Hà Nội", dia_chi: "1 Phố A" },
    { id: 1, ten: "Alpha Resort", dia_diem: "  ", dia_chi: "Bãi Cháy, Hạ Long" },
    { id: 3, ten: "Đà Nẵng Beach", dia_diem: null, dia_chi: null },
  ];
  it("mỗi mục danh mục một dòng, chưa có nội dung = chưa ảnh và đang hiện", () => {
    const rows = mergeShowcaseRows(master, []);
    expect(rows).toHaveLength(3);
    expect(rows.every((r) => r.anh_url === null && r.logo_url === null && !r.an_tren_web)).toBe(true);
  });
  it("ghép ảnh / logo / cờ ẩn theo ref_id", () => {
    const rows = mergeShowcaseRows(master, [
      { ref_id: 2, anh_url: "a.jpg", logo_url: null, an_tren_web: true },
      { ref_id: 1, anh_url: null, logo_url: "l.png", an_tren_web: null },
      { ref_id: 99, anh_url: "mo-coi.jpg", logo_url: null, an_tren_web: false },
    ]);
    const zeta = rows.find((r) => r.id === 2)!;
    const alpha = rows.find((r) => r.id === 1)!;
    expect(zeta).toMatchObject({ anh_url: "a.jpg", logo_url: null, an_tren_web: true });
    expect(alpha).toMatchObject({ anh_url: null, logo_url: "l.png", an_tren_web: false });
    expect(rows.find((r) => r.id === 99)).toBeUndefined();
  });
  it("địa điểm trống lấy địa chỉ; xếp theo tên tiếng Việt", () => {
    const rows = mergeShowcaseRows(master, []);
    expect(rows.map((r) => r.ten)).toEqual(["Alpha Resort", "Đà Nẵng Beach", "Zeta Hotel"]);
    expect(rows[0].dia_diem).toBe("Bãi Cháy, Hạ Long");
    expect(rows[1].dia_diem).toBeNull();
    expect(rows[2].dia_diem).toBe("Hà Nội");
  });
});

describe("locWebRows", () => {
  const rows = [
    { id: 1, ten: "Khách sạn Hà Nội", dia_diem: "Hà Nội", anh_url: "a.jpg", an_tren_web: false },
    { id: 2, ten: "Resort Đà Nẵng", dia_diem: "Đà Nẵng", anh_url: null, an_tren_web: true },
    { id: 3, ten: "Sapa View", dia_diem: "Lào Cai", anh_url: null, an_tren_web: false },
  ];
  const vanBan = (r: (typeof rows)[number]) => `${r.ten} ${r.dia_diem}`;
  it("không lọc gì → trả nguyên", () => {
    expect(locWebRows(rows, { tim: "", chiChuaAnh: false, chiDangAn: false }, vanBan)).toHaveLength(3);
  });
  it("tìm không dấu, không phân biệt hoa thường, cả địa điểm", () => {
    expect(locWebRows(rows, { tim: "ha noi", chiChuaAnh: false, chiDangAn: false }, vanBan).map((r) => r.id)).toEqual([1]);
    expect(locWebRows(rows, { tim: "LAO CAI", chiChuaAnh: false, chiDangAn: false }, vanBan).map((r) => r.id)).toEqual([3]);
  });
  it("cờ chưa có ảnh / đang ẩn", () => {
    expect(locWebRows(rows, { tim: "", chiChuaAnh: true, chiDangAn: false }, vanBan).map((r) => r.id)).toEqual([2, 3]);
    expect(locWebRows(rows, { tim: "", chiChuaAnh: false, chiDangAn: true }, vanBan).map((r) => r.id)).toEqual([2]);
    expect(locWebRows(rows, { tim: "sapa", chiChuaAnh: true, chiDangAn: true }, vanBan)).toHaveLength(0);
  });
});
