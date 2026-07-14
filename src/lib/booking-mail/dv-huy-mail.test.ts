import { describe, it, expect } from "vitest";
import {
  buildDvDateStr, buildDvDatSubjectFallback, buildDvHuySubject,
  buildDvHuyEmailHtml, buildDvHuyMailtoBody, type DvHuyMailInput,
} from "./dv-huy-mail";

const base: DvHuyMailInput = {
  tenDoan: "S8DAD5D260801-XX",
  tenNhaCungCap: "CTY Du Thuyền Xanh",
  dichVuList: [
    { ten_dv: "Vé cáp treo", ngay_date: "2026-08-02", so_khach: 20 },
    { ten_dv: "Xuồng cao tốc", ngay_date: "2026-08-04", so_khach: 20 },
  ],
  lyDo: "Đoàn hủy",
  senderName: "Trần B",
  senderPhone: "0912345678",
};

describe("buildDvDateStr", () => {
  it("1 ngày → dd/MM", () => {
    expect(buildDvDateStr([{ ten_dv: "X", ngay_date: "2026-08-02" }])).toBe("02/08");
  });
  it("nhiều ngày → dd/MM–dd/MM (en-dash), lấy min→max", () => {
    expect(buildDvDateStr(base.dichVuList)).toBe("02/08–04/08");
  });
  it("dedupe + sort trước khi lấy đầu/cuối", () => {
    expect(
      buildDvDateStr([
        { ten_dv: "a", ngay_date: "2026-08-05" },
        { ten_dv: "b", ngay_date: "2026-08-01" },
        { ten_dv: "c", ngay_date: "2026-08-05" },
      ]),
    ).toBe("01/08–05/08");
  });
  it("không ngày → rỗng", () => {
    expect(buildDvDateStr([{ ten_dv: "x", ngay_date: null }])).toBe("");
  });
});

describe("buildDvDatSubjectFallback", () => {
  // Khớp BookingDVCard.openEmailModal:290 — en-dash `–`, ngày dùng dịch vụ.
  it("giá trị cụ thể khớp khuôn card", () => {
    expect(buildDvDatSubjectFallback(base)).toBe(
      "[S8 Travel] Đặt dịch vụ – S8DAD5D260801-XX – 02/08–04/08 – CTY Du Thuyền Xanh",
    );
  });
  it("không ngày → bỏ đuôi ngày", () => {
    expect(
      buildDvDatSubjectFallback({ ...base, dichVuList: [{ ten_dv: "x", ngay_date: null }] }),
    ).toBe("[S8 Travel] Đặt dịch vụ – S8DAD5D260801-XX – CTY Du Thuyền Xanh");
  });
});

describe("buildDvHuySubject", () => {
  it("subject gốc đã lưu → Re: <gốc>", () => {
    expect(buildDvHuySubject(base, "[S8 Travel] Đặt dịch vụ – A")).toBe(
      "Re: [S8 Travel] Đặt dịch vụ – A",
    );
  });
  it("gốc đã có Re: → không chồng", () => {
    expect(buildDvHuySubject(base, "Re: [S8 Travel] X")).toBe("Re: [S8 Travel] X");
  });
  it("chưa lưu → dựng lại rồi Re:", () => {
    expect(buildDvHuySubject(base, null)).toBe(`Re: ${buildDvDatSubjectFallback(base)}`);
  });
});

describe("buildDvHuyEmailHtml", () => {
  it("liệt kê dịch vụ + ngày + số khách", () => {
    const html = buildDvHuyEmailHtml(base);
    expect(html).toContain("S8DAD5D260801-XX");
    expect(html).toContain("CTY Du Thuyền Xanh");
    expect(html).toContain("HỦY");
    expect(html).toContain("Vé cáp treo");
    expect(html).toContain("02/08/2026, 20 khách");
    expect(html).toContain("Xuồng cao tốc");
    expect(html).toContain("Đoàn hủy");
  });
  it("dịch vụ không số khách → không '(... khách)'", () => {
    const html = buildDvHuyEmailHtml({
      ...base, dichVuList: [{ ten_dv: "Lệ phí", ngay_date: null }],
    });
    expect(html).toContain("Lệ phí");
    expect(html).not.toContain("khách)");
  });
  it("escape HTML tên NCC / tên dịch vụ", () => {
    const html = buildDvHuyEmailHtml({
      ...base, tenNhaCungCap: "A & <b>B</b>",
      dichVuList: [{ ten_dv: "Vé <x>", ngay_date: null }],
    });
    expect(html).toContain("A &amp; &lt;b&gt;");
    expect(html).toContain("Vé &lt;x&gt;");
    expect(html).not.toContain("<b>B</b>");
  });
});

describe("buildDvHuyMailtoBody", () => {
  it("có đoàn, NCC, danh sách dịch vụ, lý do", () => {
    const body = buildDvHuyMailtoBody(base);
    expect(body).toContain("HỦY booking dịch vụ");
    expect(body).toContain("Vé cáp treo (02/08/2026, 20 khách)");
    expect(body).toContain("Đoàn hủy");
  });
});
