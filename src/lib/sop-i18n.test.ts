import { describe, it, expect } from "vitest";
import { dichSopMuc, chuZhCuaMuc } from "@/lib/sop-i18n";
import { SOP_ZH } from "@/lib/sop-data-zh";
import { SOP_DATA, type SopMuc } from "@/lib/sop-data";

const goc = (id: string): SopMuc => SOP_DATA.find((m) => m.id === id)!;

describe("dichSopMuc", () => {
  it("không ở chế độ zh → giữ nguyên tiếng Việt", () => {
    const m = dichSopMuc(goc("qt-1"), false);
    expect(m.title).toBe("I. Tiếp nhận đoàn");
  });

  it("ở chế độ zh → trả bản tiếng Trung", () => {
    const m = dichSopMuc(goc("qt-1"), true);
    expect(m.title).toBe("一、接收團組");
    expect(m.buoc?.[0].title).toBe("確認訂單來源");
  });

  it("dịch đủ cả 3 loại mục", () => {
    expect(dichSopMuc(goc("th-1"), true).tinhHuong).toContain("雙床房");
    expect(dichSopMuc(goc("th-1"), true).cachXuLy?.[0]).toContain("加床");
    expect(dichSopMuc(goc("cl-1"), true).items?.[0]).toContain("團號");
    expect(dichSopMuc(goc("qt-2"), true).uuTien?.[0]).toContain("指定飯店");
  });

  it("id không có bản dịch → giữ nguyên tiếng Việt", () => {
    const la: SopMuc = { id: "khong-co", cat: "quy_trinh", icon: "x", title: "Mục lạ", sub: "abc" };
    expect(dichSopMuc(la, true).title).toBe("Mục lạ");
  });

  // Dịch thiếu vài dòng mà ghép lẫn thì người đọc MẤT dòng — nguy hiểm hơn là
  // hiện nguyên tiếng Việt.
  it("mảng dịch thiếu phần tử → giữ nguyên mảng tiếng Việt", () => {
    const m: SopMuc = {
      id: "cl-1", cat: "checklist", icon: "x", title: "x", sub: "x",
      items: ["a", "b", "c", "d", "e", "f", "g"], // 7 mục, bản dịch chỉ có 5
    };
    expect(dichSopMuc(m, true).items).toEqual(["a", "b", "c", "d", "e", "f", "g"]);
  });

  it("rơi về tiếng Việt theo TỪNG trường, không phải cả mục", () => {
    const m = dichSopMuc({ ...goc("qt-1"), sub: "Phần phụ đề mới chưa dịch" }, true);
    expect(m.title).toBe("一、接收團組");          // trường đã dịch
    expect(m.buoc?.[0].title).toBe("確認訂單來源"); // trường đã dịch
  });
});

describe("chuZhCuaMuc", () => {
  it("gom được chữ tiếng Trung để tìm kiếm", () => {
    expect(chuZhCuaMuc("qt-2")).toContain("飯店");
    expect(chuZhCuaMuc("qt-2")).toContain("房型");
  });

  it("id lạ → chuỗi rỗng, không ném lỗi", () => {
    expect(chuZhCuaMuc("khong-co")).toBe("");
  });
});

describe("SOP_ZH phủ đủ nội dung", () => {
  it("mọi mục đều có bản dịch", () => {
    const thieu = SOP_DATA.filter((m) => !SOP_ZH[m.id]).map((m) => m.id);
    expect(thieu).toEqual([]);
  });

  it("mọi mục dịch đủ tiêu đề + phụ đề", () => {
    for (const m of SOP_DATA) {
      expect(SOP_ZH[m.id].title, m.id).toBeTruthy();
      expect(SOP_ZH[m.id].sub, m.id).toBeTruthy();
    }
  });

  it("mảng dịch khớp SỐ PHẦN TỬ với bản tiếng Việt", () => {
    for (const m of SOP_DATA) {
      const d = SOP_ZH[m.id];
      if (m.buoc) expect(d.buoc?.length, `buoc ${m.id}`).toBe(m.buoc.length);
      if (m.uuTien) expect(d.uuTien?.length, `uuTien ${m.id}`).toBe(m.uuTien.length);
      if (m.cachXuLy) expect(d.cachXuLy?.length, `cachXuLy ${m.id}`).toBe(m.cachXuLy.length);
      if (m.items) expect(d.items?.length, `items ${m.id}`).toBe(m.items.length);
    }
  });

  it("tình huống nào có mẫu câu thì bản dịch cũng phải có", () => {
    for (const m of SOP_DATA) {
      if (m.mauCau) expect(SOP_ZH[m.id].mauCau, m.id).toBeTruthy();
      if (m.tinhHuong) expect(SOP_ZH[m.id].tinhHuong, m.id).toBeTruthy();
    }
  });
});
