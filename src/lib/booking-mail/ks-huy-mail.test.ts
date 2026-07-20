import { describe, it, expect } from "vitest";
import { format } from "date-fns";
import { vi } from "date-fns/locale";
import {
  buildKsDatTruocSubject,
  buildKsHuySubject,
  buildKsHuyEmailHtml,
  buildKsHuyMailtoBody,
  fmtDateVi,
  type KsHuyMailInput,
} from "./ks-huy-mail";

const base: KsHuyMailInput = {
  tenDoan: "S8HAN5D260801-XX",
  khachSanTen: "Khách Sạn Demo Hạ Long",
  roomDates: ["2026-08-02", "2026-08-03"],
  lyDo: "Khách đổi lịch",
  senderName: "Trần B",
  senderPhone: "0912345678",
};

describe("fmtDateVi", () => {
  it("dd/MM/yyyy có pad 0", () => {
    expect(fmtDateVi("2026-08-02")).toBe("02/08/2026");
  });
});

describe("buildKsDatTruocSubject", () => {
  // Khuôn này PHẢI khớp BookingKSTab.openEmailModal:427-431 — lệch 1 ký tự là mail
  // hủy rơi ra ngoài thread Gmail của booking gốc (Gmail gom theo Subject + From).
  // Đặc biệt: BookingKSTab.fmtDate:63 là format(..., "dd/MM") — KHÔNG có năm.
  it("ngày trong subject là dd/MM (KHÔNG có năm) — khớp BookingKSTab.fmtDate", () => {
    expect(buildKsDatTruocSubject(base)).toBe(
      "[S8 Travel] Đặt phòng – S8HAN5D260801-XX – Khách Sạn Demo Hạ Long – 02/08, 03/08 (2 đêm)",
    );
  });

  // Tái dựng công thức của BookingKSTab bằng date-fns y hệt nó dùng, rồi so khớp.
  // Test này đỏ ngay khi ai đó đổi khuôn subject ở một trong hai chỗ.
  it("khớp từng ký tự với công thức đang chạy ở BookingKSTab", () => {
    const fmtDateNhuBookingKSTab = (d: string) =>
      format(new Date(d + "T00:00:00"), "dd/MM", { locale: vi });
    const datesStr = base.roomDates.length > 0
      ? base.roomDates.map(fmtDateNhuBookingKSTab).join(", ") + ` (${base.roomDates.length} đêm)`
      : "";
    const expected =
      `[S8 Travel] Đặt phòng – ${base.tenDoan} – ${base.khachSanTen}${datesStr ? ` – ${datesStr}` : ""}`;
    expect(buildKsDatTruocSubject(base)).toBe(expected);
  });

  it("không có ngày → bỏ hẳn đuôi ngày", () => {
    expect(buildKsDatTruocSubject({ ...base, roomDates: [] })).toBe(
      "[S8 Travel] Đặt phòng – S8HAN5D260801-XX – Khách Sạn Demo Hạ Long",
    );
  });
});

describe("buildKsHuySubject", () => {
  it("dùng subject gốc đã lưu → Re: <gốc> (cùng thread)", () => {
    expect(buildKsHuySubject(base, "[S8 Travel] Đặt phòng – A – B")).toBe(
      "Re: [S8 Travel] Đặt phòng – A – B",
    );
  });
  it("subject gốc đã có Re: → KHÔNG chồng thêm Re:", () => {
    expect(buildKsHuySubject(base, "Re: [S8 Travel] Đặt phòng – A – B")).toBe(
      "Re: [S8 Travel] Đặt phòng – A – B",
    );
  });
  it("booking cũ chưa lưu subject → dựng lại khuôn đặt trước rồi Re:", () => {
    expect(buildKsHuySubject(base, null)).toBe(`Re: ${buildKsDatTruocSubject(base)}`);
  });
  it("subject gốc rỗng/khoảng trắng → coi như không có", () => {
    expect(buildKsHuySubject(base, "   ")).toBe(`Re: ${buildKsDatTruocSubject(base)}`);
  });
});

describe("buildKsHuyEmailHtml", () => {
  it("đủ đoàn / KS / khoảng ngày check-out = đêm cuối + 1 / lý do / người gửi", () => {
    const html = buildKsHuyEmailHtml(base);
    expect(html).toContain("S8HAN5D260801-XX");
    expect(html).toContain("Khách Sạn Demo Hạ Long");
    expect(html).toContain("HỦY");
    expect(html).toContain("02/08/2026 – 04/08/2026 (2 đêm)");
    expect(html).toContain("Khách đổi lịch");
    expect(html).toContain("Trần B");
    expect(html).toContain("0912345678");
  });
  it("không lý do → bỏ hẳn dòng Lý do", () => {
    expect(buildKsHuyEmailHtml({ ...base, lyDo: "  " })).not.toContain("Lý do");
  });
  it("không ngày → bỏ hẳn dòng Ngày đã đặt", () => {
    expect(buildKsHuyEmailHtml({ ...base, roomDates: [] })).not.toContain("Ngày đã đặt");
  });
  it("escape HTML trong tên KS / lý do (chống vỡ layout mail)", () => {
    const html = buildKsHuyEmailHtml({
      ...base, khachSanTen: 'KS <b>"A"</b> & Co', lyDo: "a < b",
    });
    expect(html).toContain("KS &lt;b&gt;");
    expect(html).toContain("&amp; Co");
    expect(html).toContain("a &lt; b");
    expect(html).not.toContain("<b>A</b>");
  });
  it("1 đêm → check-out là hôm sau", () => {
    const html = buildKsHuyEmailHtml({ ...base, roomDates: ["2026-08-31"] });
    expect(html).toContain("31/08/2026 – 01/09/2026 (1 đêm)");
  });
});

describe("buildKsHuyMailtoBody", () => {
  it("có đoàn, KS, ngày, lý do, người gửi", () => {
    const body = buildKsHuyMailtoBody(base);
    expect(body).toContain("HỦY booking");
    expect(body).toContain("S8HAN5D260801-XX");
    expect(body).toContain("02/08/2026 -> 04/08/2026 (2 đêm)");
    expect(body).toContain("Khách đổi lịch");
    expect(body).toContain("Trần B");
  });
  it("không ngày / không lý do → không có dòng rỗng lạ", () => {
    const body = buildKsHuyMailtoBody({ ...base, roomDates: [], lyDo: null });
    expect(body).not.toContain("Ngày đã đặt");
    expect(body).not.toContain("Lý do");
  });
});
