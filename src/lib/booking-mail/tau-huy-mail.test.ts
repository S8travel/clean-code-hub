import { describe, it, expect } from "vitest";
import {
  buildTauDatSubjectFallback, buildTauHuySubject, buildTauHuyEmailHtml, buildTauHuyMailtoBody,
  type TauHuyMailInput,
} from "./tau-huy-mail";
import { fmtNgayTau } from "@/hooks/use-booking-tau";

const base: TauHuyMailInput = {
  tenDoan: "S8HLG3D260801-XX",
  nhaHangTen: "Du thuyền Paradise",
  ngayDate: "2026-08-02",
  ngaySo: 2,
  buaAn: "trua",
  soKhach: 20,
  lyDo: "Đoàn hủy",
  senderName: "Trần B",
  senderPhone: "0912345678",
};

describe("buildTauDatSubjectFallback", () => {
  // Khớp TauNgayCard.openEmailModal:204 — dựng lại bằng chính fmtNgayTau card dùng.
  it("khớp công thức card (fmtNgayTau + 'Trưa'/'Tối' + en-dash)", () => {
    const ngayStr = fmtNgayTau(base.ngayDate, base.ngaySo);
    expect(buildTauDatSubjectFallback(base)).toBe(
      `[S8 Travel] Đặt tàu – ${base.tenDoan} – ${ngayStr} – Trưa – 20 khách`,
    );
  });
  it("bữa tối → 'Tối'", () => {
    const s = buildTauDatSubjectFallback({ ...base, buaAn: "toi" });
    expect(s).toContain(" – Tối");
  });
  it("không số khách → bỏ đuôi khách", () => {
    const s = buildTauDatSubjectFallback({ ...base, soKhach: null });
    expect(s.endsWith("– Trưa")).toBe(true);
  });
});

describe("buildTauHuySubject", () => {
  it("subject gốc đã lưu → Re: <gốc>", () => {
    expect(buildTauHuySubject(base, "[S8 Travel] Đặt tàu – A")).toBe("Re: [S8 Travel] Đặt tàu – A");
  });
  it("gốc có Re: → không chồng", () => {
    expect(buildTauHuySubject(base, "Re: X")).toBe("Re: X");
  });
  it("chưa lưu → dựng lại rồi Re:", () => {
    expect(buildTauHuySubject(base, null)).toBe(`Re: ${buildTauDatSubjectFallback(base)}`);
  });
});

describe("buildTauHuyEmailHtml", () => {
  it("đủ đoàn / du thuyền / ngày / bữa / số khách / lý do", () => {
    const html = buildTauHuyEmailHtml(base);
    expect(html).toContain("S8HLG3D260801-XX");
    expect(html).toContain("Du thuyền Paradise");
    expect(html).toContain("HỦY");
    expect(html).toContain("Bữa trưa");
    expect(html).toContain("20 khách");
    expect(html).toContain("Đoàn hủy");
  });
  it("escape HTML tên du thuyền", () => {
    const html = buildTauHuyEmailHtml({ ...base, nhaHangTen: "Tàu <b>&A</b>" });
    expect(html).toContain("Tàu &lt;b&gt;&amp;A");
    expect(html).not.toContain("<b>&A</b>");
  });
});

describe("buildTauHuyMailtoBody", () => {
  it("có đoàn, ngày, bữa, lý do", () => {
    const body = buildTauHuyMailtoBody(base);
    expect(body).toContain("HỦY booking đặt tàu");
    expect(body).toContain("S8HLG3D260801-XX");
    expect(body).toContain("Đoàn hủy");
  });
});
