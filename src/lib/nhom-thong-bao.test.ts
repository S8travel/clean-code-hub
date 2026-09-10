import { describe, it, expect } from "vitest";
import {
  chuanHoaTat,
  dangNhan,
  datTrangThai,
  tomTatTat,
  NHOM_THONG_BAO,
} from "./nhom-thong-bao";

describe("chuanHoaTat", () => {
  it("chưa cấu hình gì → danh sách tắt rỗng", () => {
    expect(chuanHoaTat(null)).toEqual([]);
    expect(chuanHoaTat(undefined)).toEqual([]);
    expect(chuanHoaTat([])).toEqual([]);
  });
  it("bỏ tên nhóm lạ còn sót trong dữ liệu", () => {
    expect(chuanHoaTat(["doan", "linh_tinh"])).toEqual(["doan"]);
  });
  it("bỏ trùng và giữ thứ tự khai báo, không theo thứ tự lưu", () => {
    expect(chuanHoaTat(["lead", "doan", "lead"])).toEqual(["doan", "lead"]);
  });
});

describe("dangNhan", () => {
  it("mặc định nhận hết", () => {
    for (const n of NHOM_THONG_BAO) {
      expect(dangNhan(n.key, null)).toBe(true);
    }
  });
  it("nhóm nằm trong danh sách tắt thì không nhận nữa", () => {
    expect(dangNhan("doan", ["doan"])).toBe(false);
    expect(dangNhan("cong_viec", ["doan"])).toBe(true);
  });
});

describe("datTrangThai", () => {
  it("tắt một nhóm từ trạng thái mặc định", () => {
    expect(datTrangThai("doan", false, null)).toEqual(["doan"]);
  });
  it("tắt thêm nhóm thứ hai, giữ nhóm cũ", () => {
    expect(datTrangThai("lead", false, ["doan"])).toEqual(["doan", "lead"]);
  });
  it("tắt lại nhóm đang tắt thì không nhân đôi", () => {
    expect(datTrangThai("doan", false, ["doan"])).toEqual(["doan"]);
  });
  it("bật lại thì nhóm đó rời khỏi danh sách tắt", () => {
    expect(datTrangThai("doan", true, ["doan", "lead"])).toEqual(["lead"]);
  });
  it("bật một nhóm vốn đang nhận thì không đổi gì", () => {
    expect(datTrangThai("ke_toan", true, ["doan"])).toEqual(["doan"]);
  });
  it("không sửa mảng gốc", () => {
    const goc = ["doan"];
    datTrangThai("lead", false, goc);
    expect(goc).toEqual(["doan"]);
  });
  it("cấu hình đúng ý đã chốt: giữ công việc và báo giá, bỏ đoàn và lead", () => {
    let tat = datTrangThai("doan", false, null);
    tat = datTrangThai("lead", false, tat);
    expect(dangNhan("cong_viec", tat)).toBe(true);
    expect(dangNhan("bao_gia", tat)).toBe(true);
    expect(dangNhan("doan", tat)).toBe(false);
    expect(dangNhan("lead", tat)).toBe(false);
  });
});

describe("tomTatTat", () => {
  it("chưa tắt gì", () => {
    expect(tomTatTat(null)).toBe("Nhận tất cả");
  });
  it("tắt vài nhóm thì kể tên", () => {
    expect(tomTatTat(["doan", "lead"])).toBe("Tắt: Đoàn, Khách tiềm năng");
  });
  it("tắt hết thì nói thẳng là im lặng hoàn toàn", () => {
    expect(tomTatTat(NHOM_THONG_BAO.map((n) => n.key))).toBe("Tắt hết thông báo");
  });
});
