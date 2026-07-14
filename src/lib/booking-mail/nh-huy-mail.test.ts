import { describe, it, expect } from "vitest";
import {
  buildNhDatSubjectFallback, buildNhHuySubject, buildNhHuyEmailHtml, buildNhHuyMailtoBody,
  type NhHuyMailInput,
} from "./nh-huy-mail";
import { buildNhSubject, type NhMailInput } from "./nh-mail";

const base: NhHuyMailInput = {
  tenDoan: "S8DAD5D260801-XX",
  nhaHangTen: "Nhà hàng Bé Mặn",
  buaAn: "trua",
  ngayDate: "2026-08-02",
  lyDo: "Đoàn hủy",
  senderName: "Trần B",
  senderPhone: "0912345678",
};

describe("buildNhDatSubjectFallback", () => {
  // Lưới chống lệch MẠNH NHẤT: dựng subject fallback phải TRÙNG với buildNhSubject
  // (khuôn booking thật ở nh-mail.ts). Ai đổi một trong hai chỗ → test đỏ ngay.
  const asNhInput = (i: NhHuyMailInput): NhMailInput => ({
    tenDoan: i.tenDoan, nhaHangTen: i.nhaHangTen, buaAn: i.buaAn, ngayDate: i.ngayDate,
    nhaHangId: null, setMenuId: null, tenSet: null, gia: null, donVi: null, monList: [],
    hdvText: "", senderName: i.senderName,
  });

  it("khớp từng ký tự với buildNhSubject (mode first) — trưa", () => {
    expect(buildNhDatSubjectFallback(base)).toBe(buildNhSubject(asNhInput(base), "first"));
  });

  it("khớp buildNhSubject — tối", () => {
    const toi = { ...base, buaAn: "toi" as const };
    expect(buildNhDatSubjectFallback(toi)).toBe(buildNhSubject(asNhInput(toi), "first"));
  });

  it("giá trị cụ thể: en-dash, 'ăn trưa', ngày dd/MM không năm", () => {
    expect(buildNhDatSubjectFallback(base)).toBe(
      "[S8 Travel] Đặt ăn trưa – S8DAD5D260801-XX – 02/08 – Nhà hàng Bé Mặn",
    );
  });

  it("không ngày → bỏ đuôi ngày", () => {
    expect(buildNhDatSubjectFallback({ ...base, ngayDate: null })).toBe(
      "[S8 Travel] Đặt ăn trưa – S8DAD5D260801-XX – Nhà hàng Bé Mặn",
    );
  });

  it("thiếu tên nhà hàng → fallback 'Nhà hàng'", () => {
    expect(buildNhDatSubjectFallback({ ...base, nhaHangTen: "" })).toBe(
      "[S8 Travel] Đặt ăn trưa – S8DAD5D260801-XX – 02/08 – Nhà hàng",
    );
  });
});

describe("buildNhHuySubject", () => {
  it("subject gốc đã lưu → Re: <gốc>", () => {
    expect(buildNhHuySubject(base, "[S8 Travel] Đặt ăn trưa – A – B")).toBe(
      "Re: [S8 Travel] Đặt ăn trưa – A – B",
    );
  });
  it("gốc đã có Re: → không chồng thêm", () => {
    expect(buildNhHuySubject(base, "Re: [S8 Travel] X")).toBe("Re: [S8 Travel] X");
  });
  it("booking cũ chưa lưu subject → dựng lại rồi Re:", () => {
    expect(buildNhHuySubject(base, null)).toBe(`Re: ${buildNhDatSubjectFallback(base)}`);
  });
  it("subject gốc chỉ khoảng trắng → coi như không có", () => {
    expect(buildNhHuySubject(base, "   ")).toBe(`Re: ${buildNhDatSubjectFallback(base)}`);
  });
});

describe("buildNhHuyEmailHtml", () => {
  it("đủ đoàn / nhà hàng / bữa / ngày / lý do / người gửi", () => {
    const html = buildNhHuyEmailHtml(base);
    expect(html).toContain("S8DAD5D260801-XX");
    expect(html).toContain("Nhà hàng Bé Mặn");
    expect(html).toContain("HỦY");
    expect(html).toContain("Ăn trưa");
    expect(html).toContain("02/08/2026");
    expect(html).toContain("Đoàn hủy");
    expect(html).toContain("0912345678");
  });
  it("không lý do → bỏ dòng Lý do", () => {
    expect(buildNhHuyEmailHtml({ ...base, lyDo: "  " })).not.toContain("Lý do");
  });
  it("không ngày → bỏ dòng Ngày", () => {
    const html = buildNhHuyEmailHtml({ ...base, ngayDate: null });
    expect(html).not.toContain("<td style=\"border:1px solid #e2e8f0;padding:8px 12px\">Ngày</td>");
  });
  it("escape HTML tên nhà hàng / lý do", () => {
    const html = buildNhHuyEmailHtml({ ...base, nhaHangTen: 'NH <b>"X"</b> & Co', lyDo: "a < b" });
    expect(html).toContain("NH &lt;b&gt;");
    expect(html).toContain("&amp; Co");
    expect(html).toContain("a &lt; b");
    expect(html).not.toContain("<b>\"X\"</b>");
  });
});

describe("buildNhHuyMailtoBody", () => {
  it("có đoàn, nhà hàng, bữa, ngày, lý do", () => {
    const body = buildNhHuyMailtoBody(base);
    expect(body).toContain("HỦY booking đặt bàn ăn trưa");
    expect(body).toContain("S8DAD5D260801-XX");
    expect(body).toContain("02/08/2026");
    expect(body).toContain("Đoàn hủy");
  });
  it("không ngày / không lý do → không dòng rỗng lạ", () => {
    const body = buildNhHuyMailtoBody({ ...base, ngayDate: null, lyDo: null });
    expect(body).not.toContain("Ngày:");
    expect(body).not.toContain("Lý do:");
  });
});
