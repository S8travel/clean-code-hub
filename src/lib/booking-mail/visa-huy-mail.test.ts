import { describe, it, expect } from "vitest";
import {
  buildVisaDatSubjectFallback, buildVisaHuySubject, buildVisaHuyEmailHtml, buildVisaHuyMailtoBody,
  type VisaHuyMailInput,
} from "./visa-huy-mail";

const base: VisaHuyMailInput = {
  tenDoan: "S8JPN7D260801-XX",
  tenDonVi: "Đơn vị Visa ABC",
  ngayDi: "2026-08-01",
  lyDo: "Đoàn hủy",
  senderName: "Trần B",
  senderPhone: "0912345678",
};

describe("buildVisaDatSubjectFallback", () => {
  // Khớp BookingVisaCard.openEmailModal:205 — "Xin visa" (không phải "Đặt"), dd/MM/yyyy.
  it("khớp công thức card ('Xin visa', ngày đi có năm)", () => {
    expect(buildVisaDatSubjectFallback(base)).toBe(
      "[S8 Travel] Xin visa – S8JPN7D260801-XX – 01/08/2026",
    );
  });
  it("không ngày đi → bỏ đuôi ngày", () => {
    expect(buildVisaDatSubjectFallback({ ...base, ngayDi: null })).toBe(
      "[S8 Travel] Xin visa – S8JPN7D260801-XX",
    );
  });
});

describe("buildVisaHuySubject", () => {
  it("visa không lưu subject → luôn dựng lại rồi Re:", () => {
    expect(buildVisaHuySubject(base)).toBe(`Re: ${buildVisaDatSubjectFallback(base)}`);
  });
});

describe("buildVisaHuyEmailHtml", () => {
  it("đủ đoàn / đơn vị / ngày đi / lý do, và dùng 'yêu cầu xin visa'", () => {
    const html = buildVisaHuyEmailHtml(base);
    expect(html).toContain("S8JPN7D260801-XX");
    expect(html).toContain("Đơn vị Visa ABC");
    expect(html).toContain("HỦY");
    expect(html).toContain("xin visa");
    expect(html).toContain("01/08/2026");
    expect(html).toContain("Đoàn hủy");
  });
  it("escape HTML tên đơn vị", () => {
    const html = buildVisaHuyEmailHtml({ ...base, tenDonVi: "DV <b>&X</b>" });
    expect(html).toContain("DV &lt;b&gt;&amp;X");
    expect(html).not.toContain("<b>&X</b>");
  });
});

describe("buildVisaHuyMailtoBody", () => {
  it("có đoàn, ngày, lý do", () => {
    const body = buildVisaHuyMailtoBody(base);
    expect(body).toContain("HỦY yêu cầu xin visa");
    expect(body).toContain("S8JPN7D260801-XX");
    expect(body).toContain("Đoàn hủy");
  });
});
