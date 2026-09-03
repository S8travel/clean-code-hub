import { describe, it, expect } from "vitest";
import { banDoDoiChieu, chiSoDongGoc, nanDoiChieu, tachDongGoc } from "./bao-gia-doi-chieu";

// Chương trình gốc rút gọn theo đúng dáng file đối tác Đài Loan gửi.
const CHUONG_TRINH = `第一天 桃園機場／河內
搭乘豪華客機飛往越南首都河內
午餐：BAY海鮮自助餐吃到跑US15
晚餐：CHO PHIEN QUAN 山城 燒烤風味 US15
住宿：下龍灣五星CENTRAL LUXURY HALONG

第二天 河內／沙壩
沙壩黃連山景區內用自助餐(套票)
晚餐：紅瑤餐廳-鮭魚火鍋 15USD`;

const dong = tachDongGoc(CHUONG_TRINH);
const nan = dong.map(nanDoiChieu);

describe("nanDoiChieu", () => {
  it("gộp phồn thể với giản thể về một dạng", () => {
    expect(nanDoiChieu("紅瑤餐廳")).toBe(nanDoiChieu("红瑶餐厅"));
  });

  it("bỏ dấu câu và khoảng trắng, GIỮ số — mức tiền là dấu hiệu phân biệt tốt", () => {
    expect(nanDoiChieu("晚餐：紅瑤餐廳 - 鮭魚火鍋 15USD")).toContain("15usd");
  });
});

describe("chiSoDongGoc", () => {
  it("tìm đúng dòng khi ten_zh chép nguyên văn (kể cả khác phồn/giản thể)", () => {
    expect(chiSoDongGoc(nan, "紅瑤餐廳-鮭魚火鍋 15USD")).toBe(dong.indexOf("晚餐：紅瑤餐廳-鮭魚火鍋 15USD"));
    expect(chiSoDongGoc(nan, "红瑶餐厅-鲑鱼火锅 15USD")).toBe(dong.indexOf("晚餐：紅瑤餐廳-鮭魚火鍋 15USD"));
  });

  it("chọn dòng NGẮN NHẤT khi nhiều dòng cùng chứa — dòng sát nghĩa, không phải cả đoạn", () => {
    const d = tachDongGoc("午餐：船上自助餐 之後前往下龍灣搭船遊覽並享用船上自助餐\n船上自助餐");
    expect(chiSoDongGoc(d.map(nanDoiChieu), "船上自助餐")).toBe(1);
  });

  it("ten_zh trải hai dòng (model gộp dòng bị ngắt) → tô dòng ĐẦU của đoạn", () => {
    const d = tachDongGoc("下龍灣最新6星級海豚號\nDolphin Cruise日遊船");
    expect(chiSoDongGoc(d.map(nanDoiChieu), "下龍灣最新6星級海豚號 Dolphin Cruise日遊船")).toBe(0);
  });

  it("model sửa vài ký tự thì tầng giống chữ vẫn bắt", () => {
    expect(chiSoDongGoc(nan, "沙壩黃連山景區內用自助餐")).toBe(dong.indexOf("沙壩黃連山景區內用自助餐(套票)"));
  });

  it("KHÔNG dò ra thì trả null — tô sáng nhầm dòng còn tệ hơn không tô", () => {
    expect(chiSoDongGoc(nan, "峴港巴拿山纜車一日遊")).toBeNull();
  });

  it("ten_zh rỗng hoặc quá ngắn → null, không khớp bừa vào dòng đầu", () => {
    expect(chiSoDongGoc(nan, "")).toBeNull();
    expect(chiSoDongGoc(nan, null)).toBeNull();
    expect(chiSoDongGoc(nan, "餐")).toBeNull();
  });

  it("chương trình rỗng thì không nổ", () => {
    expect(chiSoDongGoc([], "紅瑤餐廳")).toBeNull();
  });
});

describe("banDoDoiChieu", () => {
  it("trả bản đồ cùng thứ tự với danh sách mục chi phí", () => {
    const ra = banDoDoiChieu(dong, ["BAY海鮮自助餐吃到跑US15", "峴港巴拿山", "下龍灣五星CENTRAL LUXURY HALONG"]);
    expect(ra[0]).toBe(dong.indexOf("午餐：BAY海鮮自助餐吃到跑US15"));
    expect(ra[1]).toBeNull();
    expect(ra[2]).toBe(dong.indexOf("住宿：下龍灣五星CENTRAL LUXURY HALONG"));
  });
});

describe("tachDongGoc", () => {
  it("giữ dòng trống (bố cục chương trình) và cắt \\r của file Windows", () => {
    expect(tachDongGoc("a\r\n\r\nb")).toEqual(["a", "", "b"]);
  });
});
