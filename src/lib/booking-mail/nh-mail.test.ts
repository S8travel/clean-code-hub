import { describe, it, expect } from "vitest";
import { buildNhMailFields, buildNhSubject, buildNhEmailHtml, type NhMailInput } from "./nh-mail";
import { hashMailContent, isMailDirty } from "@/lib/mail-content-hash";

const base: NhMailInput = {
  tenDoan: "S8HAN5D260801-XX",
  ngayDate: "2026-08-02",
  buaAn: "trua",
  nhaHangId: 42,
  nhaHangTen: "Nhà hàng Biển Đông",
  setMenuId: 7,
  tenSet: "Set 250k",
  gia: 250_000,
  donVi: "khách",
  monList: ["Gỏi cuốn", "Cá kho tộ", "Canh chua"],
  ghiChu: "Bàn gần cửa sổ",
  prevSnapshot: null,
  soKhach: 20,
  soKhachLon: 18,
  soKhachEm1: 2,
  soNoidBo: 2,
  chuThichKhach: "2 khách ăn chay",
  hdvText: "Nguyễn Văn A (0901234567)",
  senderName: "Trần B",
  senderPhone: "0912345678",
};

describe("buildNhSubject", () => {
  it("format chuẩn flow lẻ (Gmail thread theo Subject — không được lệch)", () => {
    expect(buildNhSubject(base)).toBe(
      "[S8 Travel] Đặt ăn trưa – S8HAN5D260801-XX – 02/08 – Nhà hàng Biển Đông",
    );
  });
  it("update → prefix Re:, phần còn lại GIỮ NGUYÊN", () => {
    expect(buildNhSubject(base, "update")).toBe(`Re: ${buildNhSubject(base, "first")}`);
  });
});

describe("buildNhMailFields + hash (dirty detection)", () => {
  it("cùng input → cùng hash (badge tắt đúng sau gửi)", () => {
    expect(hashMailContent(buildNhMailFields(base))).toBe(hashMailContent(buildNhMailFields({ ...base })));
  });
  it("đổi món → dirty; đổi field ngoài hash (ghi chú/HDV) → KHÔNG dirty", () => {
    const sentHash = hashMailContent(buildNhMailFields(base));
    const sentAt = "2026-08-01T02:00:00Z";
    expect(isMailDirty(sentAt, sentHash, buildNhMailFields({ ...base, monList: ["Món mới"] }))).toBe(true);
    expect(isMailDirty(sentAt, sentHash, buildNhMailFields({ ...base, ghiChu: "khác", hdvText: "HDV khác" }))).toBe(false);
  });
});

describe("buildNhEmailHtml", () => {
  it("first: đủ đoàn / ngày / set menu / món / lưu ý khách / người gửi", () => {
    const html = buildNhEmailHtml(base, "first");
    expect(html).toContain("S8HAN5D260801-XX");
    expect(html).toContain("Set 250k");
    expect(html).toContain("Cá kho tộ");
    expect(html).toContain("2 khách ăn chay");
    expect(html).toContain("Trần B");
    expect(html).toContain("Nguyễn Văn A");
    expect(html).toContain("Bàn gần cửa sổ");
  });
  it("update: diff old→new số khách từ mail_sent_snapshot", () => {
    const html = buildNhEmailHtml(
      { ...base, soKhachLon: 22, prevSnapshot: { so_khach_lon: 18, so_khach_em1: 2, ngay_date: "2026-08-02" } },
      "update",
      "Tăng khách do ghép đoàn",
    );
    expect(html).toContain("18 → 22");
    expect(html).toContain("Tăng khách do ghép đoàn");
  });
  it("update không có snapshot cũ → chỉ hiện giá trị hiện tại, không mũi tên", () => {
    const html = buildNhEmailHtml(base, "update");
    expect(html).not.toContain("→");
  });
});
