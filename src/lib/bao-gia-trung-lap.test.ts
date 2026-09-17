import { describe, it, expect } from "vitest";
import { locDongMayDocTrung, ngayCuaDongGoc } from "./bao-gia-trung-lap";
import type { DongCoTheTrung } from "./bao-gia-trung-lap";

// Bản gốc rút gọn từ báo giá thật 北越5日 — chỗ model đọc 文廟 thành hai dòng.
const GOC = [
  "D4",
  "河內- 36古街含電瓶車-環劍湖-河內大教堂-巴亭廣場-胡志明陵寢-主席府-一柱廟-飯店",
  "午餐：越式料理10USD",
  "D5",
  "河內-西湖-鎮國寺-文廟-機場/台灣",
  "午餐：英和餐廳越式料理10usd",
].join("\n");

const ve = (ngay_so: number, ten_zh: string, mo_ta = ""): DongCoTheTrung =>
  ({ ngay_so, loai: "ticket", ten_zh, mo_ta });

describe("ngayCuaDongGoc", () => {
  it("gán ngày theo mốc đầu dòng, giữ tới mốc kế tiếp", () => {
    expect(ngayCuaDongGoc(GOC.split("\n"))).toEqual([4, 4, 4, 5, 5, 5]);
  });

  it("đoạn trước mốc đầu tiên chưa thuộc ngày nào", () => {
    expect(ngayCuaDongGoc(["※預計 出發日期", "D1", "台灣/河內"])).toEqual([null, 1, 1]);
  });

  it("nhận cả 第3天 / DAY 3 / Ngày 3", () => {
    expect(ngayCuaDongGoc(["第3天 河內", "DAY 4 下龍灣", "Ngày 5 về"])).toEqual([3, 4, 5]);
  });

  it("KHÔNG nhận chữ giữa câu làm mốc — 'Da Nang' không phải ngày", () => {
    expect(ngayCuaDongGoc(["D2", "Da Nang 2 ngày tự do"])).toEqual([2, 2]);
  });
});

describe("locDongMayDocTrung", () => {
  it("bỏ đúng dòng lạc ngày, giữ dòng có trong bản gốc", () => {
    const kq = locDongMayDocTrung(
      [ve(4, "36古街含電瓶車"), ve(4, "文廟", "Văn Miếu"), ve(5, "文廟", "Văn Miếu")],
      GOC,
    );
    expect(kq.rows.map((r) => r.ngay_so)).toEqual([4, 5]);
    expect(kq.rows[1].ten_zh).toBe("文廟");
    expect(kq.daBo).toEqual([{ ngay_so: 4, ten: "Văn Miếu" }]);
  });

  it("bản gốc nhắc ĐỦ số lần → giữ cả hai (điểm đi thật hai ngày)", () => {
    const goc = ["D1", "河內-文廟", "D2", "河內-文廟-機場"].join("\n");
    const kq = locDongMayDocTrung([ve(1, "文廟"), ve(2, "文廟")], goc);
    expect(kq.rows).toHaveLength(2);
    expect(kq.daBo).toHaveLength(0);
  });

  it("không dò ra chữ trong bản gốc → KHÔNG bỏ gì (model diễn đạt lại)", () => {
    const kq = locDongMayDocTrung([ve(1, "孔廟"), ve(2, "孔廟")], GOC);
    expect(kq.rows).toHaveLength(2);
  });

  it("thiếu bản gốc dạng chữ, hoặc bản gốc đọc thiếu trang → không đụng", () => {
    const rows = [ve(4, "文廟"), ve(5, "文廟")];
    expect(locDongMayDocTrung(rows, null).rows).toHaveLength(2);
    expect(locDongMayDocTrung(rows, "").rows).toHaveLength(2);
    expect(locDongMayDocTrung(rows, GOC, true).rows).toHaveLength(2);
  });

  it("khách sạn lặp tên là CỐ Ý (住宿同上) — không được bỏ đêm nào", () => {
    const goc = ["D1", "住宿：PEACE HOTEL或同級", "D2", "住宿：同上"].join("\n");
    const ks = (ngay_so: number): DongCoTheTrung =>
      ({ ngay_so, loai: "hotel", ten_zh: "PEACE HOTEL或同級", mo_ta: "Peace Hotel" });
    expect(locDongMayDocTrung([ks(1), ks(2)], goc).rows).toHaveLength(2);
  });

  it("dòng người nhập tự sửa không bị coi là máy đọc trùng", () => {
    const rows: DongCoTheTrung[] = [
      { ...ve(4, "文廟", "Văn Miếu"), sua_tay: true },
      ve(5, "文廟", "Văn Miếu"),
    ];
    expect(locDongMayDocTrung(rows, GOC).rows).toHaveLength(2);
  });

  it("cùng chữ nhưng KHÁC loại thì không gom chung nhóm", () => {
    const rows: DongCoTheTrung[] = [
      { ngay_so: 5, loai: "ticket", ten_zh: "文廟", mo_ta: "Văn Miếu" },
      { ngay_so: 5, loai: "meal", ten_zh: "文廟", mo_ta: "Ăn ở Văn Miếu" },
    ];
    expect(locDongMayDocTrung(rows, GOC).rows).toHaveLength(2);
  });

  it("model bỏ tiền tố 午餐 vẫn dò ra dòng gốc — bỏ dòng ăn lạc ngày", () => {
    const an = (ngay_so: number): DongCoTheTrung =>
      ({ ngay_so, loai: "meal", ten_zh: "英和餐廳越式料理10usd", mo_ta: "Anh Hòa món Việt" });
    const kq = locDongMayDocTrung([an(3), an(5)], GOC);
    expect(kq.rows.map((r) => r.ngay_so)).toEqual([5]);
    expect(kq.daBo).toEqual([{ ngay_so: 3, ten: "Anh Hòa món Việt" }]);
  });

  it("bản gốc không có mốc ngày → giữ theo thứ tự xuất hiện, đủ số lần nhắc", () => {
    const kq = locDongMayDocTrung([ve(4, "文廟"), ve(5, "文廟")], "河內-西湖-文廟-機場");
    expect(kq.rows.map((r) => r.ngay_so)).toEqual([4]);
  });
});
