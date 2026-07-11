import { describe, it, expect } from "vitest";
import {
  buildXeDatSubjectFallback, buildXeHuySubject, buildXeHuyEmailHtml, buildXeHuyMailtoBody,
  type XeHuyMailInput,
} from "./xe-huy-mail";
import { formatXeForEmail } from "@/lib/xe-email";

const base: XeHuyMailInput = {
  tenDoan: "S8DAD5D260801-XX",
  tenNhaXe: "Nhà xe Phương Trang",
  tenXe: "45c",
  soCho: 45,
  ngayDi: "2026-08-01",
  lyDo: "Đoàn hủy",
  senderName: "Trần B",
  senderPhone: "0912345678",
};

describe("buildXeDatSubjectFallback", () => {
  // Khớp BookingXeCard.openEmailModal:238 — en-dash, formatXeForEmail, ngày đi dd/MM/yyyy (CÓ năm).
  it("khớp công thức card (xe thường → '45 chỗ', ngày dd/MM/yyyy)", () => {
    const xeStr = formatXeForEmail(base.tenXe, base.soCho);
    expect(buildXeDatSubjectFallback(base)).toBe(
      `[S8 Travel] Đặt xe – ${base.tenDoan} – ${xeStr} – 01/08/2026`,
    );
  });
  it("ngày đi CÓ năm (khác NH/DV dùng dd/MM)", () => {
    expect(buildXeDatSubjectFallback(base)).toContain("01/08/2026");
  });
  it("limousine → giữ tên loại + số chỗ", () => {
    const s = buildXeDatSubjectFallback({ ...base, tenXe: "LMS 9C", soCho: 9 });
    expect(s).toContain("LMS 9C (9 chỗ)");
  });
  it("không xe (—) → bỏ phần xe", () => {
    const s = buildXeDatSubjectFallback({ ...base, tenXe: null, soCho: null });
    expect(s).toBe("[S8 Travel] Đặt xe – S8DAD5D260801-XX – 01/08/2026");
  });
  it("không ngày đi → bỏ đuôi ngày", () => {
    const s = buildXeDatSubjectFallback({ ...base, ngayDi: null });
    expect(s).toBe("[S8 Travel] Đặt xe – S8DAD5D260801-XX – 45 chỗ");
  });
});

describe("buildXeHuySubject", () => {
  it("xe không lưu subject → luôn dựng lại rồi Re:", () => {
    expect(buildXeHuySubject(base)).toBe(`Re: ${buildXeDatSubjectFallback(base)}`);
  });
});

describe("buildXeHuyEmailHtml", () => {
  it("đủ đoàn / nhà xe / xe / ngày đi / lý do", () => {
    const html = buildXeHuyEmailHtml(base);
    expect(html).toContain("S8DAD5D260801-XX");
    expect(html).toContain("Nhà xe Phương Trang");
    expect(html).toContain("HỦY");
    expect(html).toContain("45 chỗ");
    expect(html).toContain("01/08/2026");
    expect(html).toContain("Đoàn hủy");
  });
  it("escape HTML tên nhà xe", () => {
    const html = buildXeHuyEmailHtml({ ...base, tenNhaXe: "Xe <b>&Co</b>" });
    expect(html).toContain("Xe &lt;b&gt;&amp;Co");
    expect(html).not.toContain("<b>&Co</b>");
  });
});

describe("buildXeHuyMailtoBody", () => {
  it("có đoàn, xe, ngày, lý do", () => {
    const body = buildXeHuyMailtoBody(base);
    expect(body).toContain("HỦY booking đặt xe");
    expect(body).toContain("45 chỗ");
    expect(body).toContain("Đoàn hủy");
  });
});
