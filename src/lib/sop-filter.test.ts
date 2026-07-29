import { describe, it, expect } from "vitest";
import { boDau, locSop, nhomTheoCat } from "@/lib/sop-filter";
import { SOP_DATA, type SopMuc } from "@/lib/sop-data";

describe("boDau", () => {
  it("bỏ dấu thanh + dấu mũ", () => {
    expect(boDau("Khách sạn")).toBe("khach san");
    expect(boDau("Nhà hàng")).toBe("nha hang");
    expect(boDau("Quyết toán")).toBe("quyet toan");
  });

  it("đ/Đ → d", () => {
    expect(boDau("Đoàn")).toBe("doan");
    expect(boDau("điều hành")).toBe("dieu hanh");
  });

  it("chuỗi không dấu giữ nguyên", () => {
    expect(boDau("COD RML")).toBe("cod rml");
  });
});

const mau: SopMuc[] = [
  { id: "a", cat: "quy_trinh", icon: "x", title: "Đặt khách sạn", sub: "gửi booking",
    buoc: [{ title: "Check tình trạng phòng", note: "twin/double/triple" }] },
  { id: "b", cat: "tinh_huong", icon: "x", title: "Xe đón trễ", sub: "sự cố",
    tinhHuong: "Xe đón đoàn trễ hơn giờ hẹn",
    cachXuLy: ["Liên hệ ngay với nhà xe"], mauCau: "Anh/chị ơi, xe đang bị [lý do]" },
  { id: "c", cat: "checklist", icon: "x", title: "Checklist sau tour", sub: "3 ngày",
    items: ["Đối chiếu chi phí thực tế với dự toán"] },
];

describe("locSop", () => {
  it("không lọc gì → trả hết", () => {
    expect(locSop(mau, null, "").length).toBe(3);
  });

  it("lọc theo nhóm", () => {
    expect(locSop(mau, "checklist", "").map((m) => m.id)).toEqual(["c"]);
  });

  it("tìm theo tiêu đề, gõ KHÔNG dấu vẫn ra", () => {
    expect(locSop(mau, null, "khach san").map((m) => m.id)).toEqual(["a"]);
    expect(locSop(mau, null, "xe don tre").map((m) => m.id)).toEqual(["b"]);
  });

  // Người dùng thường nhớ một câu bên trong hơn là nhớ tên quy trình.
  it("tìm được cả chữ nằm SÂU trong mục", () => {
    expect(locSop(mau, null, "triple").map((m) => m.id)).toEqual(["a"]);      // trong note của bước
    expect(locSop(mau, null, "nha xe").map((m) => m.id)).toEqual(["b"]);      // trong cách xử lý
    expect(locSop(mau, null, "du toan").map((m) => m.id)).toEqual(["c"]);     // trong checklist
    expect(locSop(mau, null, "ly do").map((m) => m.id)).toEqual(["b"]);       // trong mẫu câu
  });

  it("không phân biệt hoa thường", () => {
    expect(locSop(mau, null, "KHÁCH SẠN").map((m) => m.id)).toEqual(["a"]);
  });

  it("kết hợp nhóm + từ khóa", () => {
    expect(locSop(mau, "quy_trinh", "xe").length).toBe(0);
  });

  it("không khớp → rỗng", () => {
    expect(locSop(mau, null, "zzzz").length).toBe(0);
  });

  it("khoảng trắng thừa không làm hỏng tìm kiếm", () => {
    expect(locSop(mau, null, "  khach san  ").map((m) => m.id)).toEqual(["a"]);
  });
});

describe("nhomTheoCat", () => {
  it("giữ thứ tự quy trình → tình huống → checklist", () => {
    expect(nhomTheoCat(mau).map((g) => g.cat)).toEqual(["quy_trinh", "tinh_huong", "checklist"]);
  });

  it("bỏ nhóm rỗng", () => {
    expect(nhomTheoCat(mau.filter((m) => m.cat === "checklist")).map((g) => g.cat)).toEqual(["checklist"]);
  });
});

describe("SOP_DATA", () => {
  it("id không trùng nhau", () => {
    const ids = SOP_DATA.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("đủ 9 quy trình, 7 tình huống, 7 checklist", () => {
    expect(nhomTheoCat(SOP_DATA).map((g) => [g.cat, g.muc.length])).toEqual([
      ["quy_trinh", 9], ["tinh_huong", 7], ["checklist", 7],
    ]);
  });

  it("mỗi mục có đúng phần nội dung của loại mình", () => {
    for (const m of SOP_DATA) {
      if (m.cat === "quy_trinh") expect(m.buoc?.length, m.id).toBeGreaterThan(0);
      if (m.cat === "tinh_huong") {
        expect(m.tinhHuong, m.id).toBeTruthy();
        expect(m.cachXuLy?.length, m.id).toBeGreaterThan(0);
      }
      if (m.cat === "checklist") expect(m.items?.length, m.id).toBeGreaterThan(0);
    }
  });
});
