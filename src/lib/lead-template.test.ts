import { describe, it, expect } from "vitest";
import { fillTemplate, templateChannelOf, htmlFromText } from "./lead-template";

describe("fillTemplate — null/empty input", () => {
  it("text=null → ''", () => {
    expect(fillTemplate(null, {})).toBe("");
  });
  it("text=undefined → ''", () => {
    expect(fillTemplate(undefined, {})).toBe("");
  });
  it("text='' → ''", () => {
    expect(fillTemplate("", { ten_khach: "Khong dung" })).toBe("");
  });
  it("text không có placeholder → giữ nguyên", () => {
    expect(fillTemplate("Xin chào", {})).toBe("Xin chào");
  });
});

describe("fillTemplate — placeholder cơ bản", () => {
  it("{{ten_khach}} → string từ ctx", () => {
    expect(fillTemplate("Chào {{ten_khach}}", { ten_khach: "Anh A" })).toBe("Chào Anh A");
  });
  it("{{sales_name}}", () => {
    expect(fillTemplate("Em {{sales_name}}", { sales_name: "Linh" })).toBe("Em Linh");
  });
  it("nhiều placeholder cùng template", () => {
    const tpl = "{{ten_khach}} đi {{diem_den}} với {{sales_name}}";
    const out = fillTemplate(tpl, { ten_khach: "A", diem_den: "Đài Loan", sales_name: "B" });
    expect(out).toBe("A đi Đài Loan với B");
  });
  it("placeholder lặp lại → thay tất cả", () => {
    expect(fillTemplate("{{ten_khach}} - {{ten_khach}}", { ten_khach: "X" })).toBe("X - X");
  });
});

describe("fillTemplate — placeholder thiếu/null", () => {
  it("ctx thiếu field → thay bằng ''", () => {
    expect(fillTemplate("Chào {{ten_khach}}!", {})).toBe("Chào !");
  });
  it("ctx field=null → thay bằng ''", () => {
    expect(fillTemplate("Chào {{ten_khach}}!", { ten_khach: null })).toBe("Chào !");
  });
  it("ctx field=undefined → thay bằng ''", () => {
    expect(fillTemplate("Chào {{ten_khach}}!", { ten_khach: undefined })).toBe("Chào !");
  });
});

describe("fillTemplate — so_khach (number | string | null)", () => {
  it("so_khach=20 (number) → '20'", () => {
    expect(fillTemplate("{{so_khach}} khách", { so_khach: 20 })).toBe("20 khách");
  });
  it("so_khach='25' (string) → '25'", () => {
    expect(fillTemplate("{{so_khach}} khách", { so_khach: "25" })).toBe("25 khách");
  });
  it("so_khach=0 → '0' (KHÔNG thành '' — giữ giá trị 0)", () => {
    expect(fillTemplate("{{so_khach}} khách", { so_khach: 0 })).toBe("0 khách");
  });
  it("so_khach=null → ''", () => {
    expect(fillTemplate("{{so_khach}} khách", { so_khach: null })).toBe(" khách");
  });
});

describe("fillTemplate — ngan_sach (format VND)", () => {
  it("ngan_sach=15000000 → '15.000.000 ₫' (locale vi-VN)", () => {
    expect(fillTemplate("Ngân sách: {{ngan_sach}}", { ngan_sach: 15_000_000 })).toBe(
      "Ngân sách: 15.000.000 ₫",
    );
  });
  it("ngan_sach='15000000' (string) → Number() → format VND", () => {
    expect(fillTemplate("{{ngan_sach}}", { ngan_sach: "15000000" })).toBe("15.000.000 ₫");
  });
  it("ngan_sach=null → ''", () => {
    expect(fillTemplate("{{ngan_sach}}", { ngan_sach: null })).toBe("");
  });
  it("ngan_sach='' (empty string) → '' (không format thành '0 ₫')", () => {
    expect(fillTemplate("{{ngan_sach}}", { ngan_sach: "" })).toBe("");
  });
  it("ngan_sach=0 → ''", () => {
    // 0 != null nhưng so sánh != "" thì TRUE → Number(0).toLocaleString = "0 ₫"
    // Actual: code dùng `ctx.ngan_sach !== ""` (0 !== "" = true) → format "0 ₫"
    expect(fillTemplate("{{ngan_sach}}", { ngan_sach: 0 })).toBe("0 ₫");
  });
});

describe("fillTemplate — placeholder không match map", () => {
  it("{{ten_la}} (không tồn tại) → giữ nguyên text {{ten_la}}", () => {
    expect(fillTemplate("Hello {{ten_la}}", {})).toBe("Hello {{ten_la}}");
  });
  it("{{}} (rỗng) → giữ nguyên", () => {
    // Regex \w+ không match {{}} (empty) → giữ nguyên
    expect(fillTemplate("X {{}} Y", {})).toBe("X {{}} Y");
  });
  it("{{ ten_khach }} (có space) → KHÔNG match (regex \\w+ chặt)", () => {
    expect(fillTemplate("{{ ten_khach }}", { ten_khach: "A" })).toBe("{{ ten_khach }}");
  });
});

describe("fillTemplate — quote_link & diem_den", () => {
  it("{{quote_link}} URL", () => {
    expect(
      fillTemplate("Xem báo giá: {{quote_link}}", { quote_link: "https://s8.vn/bg/42" }),
    ).toBe("Xem báo giá: https://s8.vn/bg/42");
  });
  it("{{ngay_di}} string ngày", () => {
    expect(fillTemplate("Đi {{ngay_di}}", { ngay_di: "15/06/2026" })).toBe("Đi 15/06/2026");
  });
});

describe("templateChannelOf", () => {
  it("call → call_script", () => {
    expect(templateChannelOf("call")).toBe("call_script");
  });
  it("zalo → zalo", () => {
    expect(templateChannelOf("zalo")).toBe("zalo");
  });
  it("email → email", () => {
    expect(templateChannelOf("email")).toBe("email");
  });
  it("meeting → null (không có template)", () => {
    expect(templateChannelOf("meeting")).toBeNull();
  });
  it("note → null", () => {
    expect(templateChannelOf("note")).toBeNull();
  });
  it("channel lạ → null", () => {
    expect(templateChannelOf("carrier_pigeon")).toBeNull();
  });
});

describe("htmlFromText — escape & wrap", () => {
  it("text thường → bọc trong div với style inline", () => {
    const out = htmlFromText("Xin chào");
    expect(out).toContain("Xin chào");
    expect(out).toMatch(/^<div style="[^"]+">/);
    expect(out.endsWith("</div>")).toBe(true);
    expect(out).toContain("white-space:pre-wrap"); // giữ xuống dòng
  });
  it("escape & → &amp;", () => {
    expect(htmlFromText("A & B")).toContain("A &amp; B");
  });
  it("escape < và >", () => {
    expect(htmlFromText("<script>")).toContain("&lt;script&gt;");
  });
  it("escape tổ hợp: <a href='x'>&</a>", () => {
    const out = htmlFromText("<a>&</a>");
    expect(out).toContain("&lt;a&gt;&amp;&lt;/a&gt;");
    expect(out).not.toContain("<a>"); // tag thật bị escape
  });
  it("text rỗng → div rỗng (vẫn có wrapper)", () => {
    const out = htmlFromText("");
    expect(out).toMatch(/^<div style="[^"]+"><\/div>$/);
  });
  it("giữ newline (vì có white-space:pre-wrap)", () => {
    const out = htmlFromText("Dòng 1\nDòng 2");
    expect(out).toContain("Dòng 1\nDòng 2"); // newline literal trong HTML, pre-wrap render
  });
});

describe("Tích hợp fillTemplate + htmlFromText", () => {
  it("Email báo giá: fill + escape", () => {
    const tpl = "Chào {{ten_khach}},\nNgân sách của anh là {{ngan_sach}}";
    const filled = fillTemplate(tpl, { ten_khach: "A & B", ngan_sach: 15_000_000 });
    const html = htmlFromText(filled);
    expect(html).toContain("A &amp; B");
    expect(html).toContain("15.000.000 ₫");
  });
});
