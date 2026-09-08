import { describe, expect, it } from "vitest";
import { coQuyen, tinhQuyen, type QuyenRow } from "./quyen";

const row = (p: Partial<QuyenRow> = {}): QuyenRow => ({
  can_view: false,
  can_create: false,
  can_edit: false,
  can_delete: false,
  ...p,
});

const hoi = (
  role: string | null,
  theoVaiTro: QuyenRow | undefined,
  theoNguoi: QuyenRow | undefined,
  action: "view" | "create" | "edit" | "delete" = "view",
) => tinhQuyen({ role, resource: "bao_gia", action, theoVaiTro, theoNguoi });

describe("tinhQuyen", () => {
  it("chưa đăng nhập thì không được gì", () => {
    expect(hoi(null, row({ can_view: true }), row({ can_view: true }))).toBe(false);
  });

  it("admin được tất cả, kể cả khi không có dòng nào", () => {
    expect(hoi("admin", undefined, undefined)).toBe(true);
    expect(hoi("admin", undefined, undefined, "delete")).toBe(true);
  });

  // ── Nền: ma trận theo vai trò ──
  it("vai trò được phép thì được, không cần quyền riêng", () => {
    expect(hoi("truong_phong", row({ can_view: true }), undefined)).toBe(true);
  });

  it("vai trò không có dòng nào thì không được", () => {
    expect(hoi("nhan_vien", undefined, undefined)).toBe(false);
  });

  // ── Quyền riêng CHỈ cộng thêm ──
  it("vai trò cấm nhưng người này được cấp riêng → được (ca Thanh Thảo với Báo Giá)", () => {
    expect(hoi("nhan_vien_cao_cap", row({ can_view: false }), row({ can_view: true }))).toBe(true);
  });

  it("quyền riêng KHÔNG thu được quyền vai trò đang có", () => {
    // Dòng riêng cấm hết, nhưng vai trò cho xem → vẫn xem được.
    expect(hoi("truong_phong", row({ can_view: true }), row({ can_view: false }))).toBe(true);
  });

  it("cấp riêng đúng hành động nào thì mở đúng hành động đó", () => {
    const rieng = row({ can_view: true });
    expect(hoi("nhan_vien_cao_cap", row(), rieng, "view")).toBe(true);
    expect(hoi("nhan_vien_cao_cap", row(), rieng, "edit")).toBe(false);
    expect(hoi("nhan_vien_cao_cap", row(), rieng, "create")).toBe(false);
    expect(hoi("nhan_vien_cao_cap", row(), rieng, "delete")).toBe(false);
  });

  it("không có dòng riêng thì y như trước khi có tính năng cấp riêng", () => {
    expect(hoi("nhan_vien_cao_cap", row({ can_view: false }), undefined)).toBe(false);
    expect(hoi("giam_doc", row({ can_view: true }), undefined)).toBe(true);
  });

  // ── Hồi quy: specialist giữ nguyên luật cũ ──
  it("specialist CHỈ đọc quyền riêng, không hưởng ma trận vai trò", () => {
    expect(hoi("specialist", row({ can_view: true }), undefined)).toBe(false);
    expect(hoi("specialist", row({ can_view: true }), row({ can_view: false }))).toBe(false);
    expect(hoi("specialist", undefined, row({ can_view: true }))).toBe(true);
  });

  it("specialist không có dòng riêng nào thì không được gì", () => {
    expect(hoi("specialist", undefined, undefined)).toBe(false);
  });
});

describe("coQuyen", () => {
  it("không có dòng thì false", () => {
    expect(coQuyen(undefined, "view")).toBe(false);
  });

  it("đọc đúng cột theo hành động", () => {
    const r = row({ can_view: true, can_delete: true });
    expect(coQuyen(r, "view")).toBe(true);
    expect(coQuyen(r, "create")).toBe(false);
    expect(coQuyen(r, "edit")).toBe(false);
    expect(coQuyen(r, "delete")).toBe(true);
  });
});

describe("tinhQuyen — thu hồi theo người (user_quyen_bo)", () => {
  const hoiBo = (
    role: string | null,
    theoVaiTro: QuyenRow | undefined,
    biThuHoi: QuyenRow | undefined,
    action: "view" | "create" | "edit" | "delete" = "view",
  ) => tinhQuyen({ role, resource: "danh_muc", action, theoVaiTro, theoNguoi: undefined, biThuHoi });

  it("thu hồi thắng quyền của vai trò", () => {
    expect(hoiBo("truong_phong", row({ can_view: true }), row({ can_view: true }))).toBe(false);
  });

  it("thu hồi đúng ô nào mất ô đó, ô khác giữ nguyên", () => {
    const vaiTro = row({ can_view: true, can_edit: true });
    const bo = row({ can_edit: true });
    expect(hoiBo("truong_phong", vaiTro, bo)).toBe(true);            // xem: còn
    expect(hoiBo("truong_phong", vaiTro, bo, "edit")).toBe(false);   // sửa: mất
  });

  it("thu hồi cũng thắng quyền cấp thêm theo người", () => {
    expect(tinhQuyen({
      role: "nhan_vien", resource: "danh_muc", action: "view",
      theoVaiTro: undefined,
      theoNguoi: row({ can_view: true }),
      biThuHoi: row({ can_view: true }),
    })).toBe(false);
  });

  it("thu hồi áp cho cả specialist", () => {
    expect(tinhQuyen({
      role: "specialist", resource: "danh_muc", action: "view",
      theoVaiTro: undefined,
      theoNguoi: row({ can_view: true }),
      biThuHoi: row({ can_view: true }),
    })).toBe(false);
  });

  it("KHÔNG áp cho admin — admin là đường quay lại sửa phân quyền", () => {
    expect(hoiBo("admin", undefined, row({ can_view: true }))).toBe(true);
  });

  it("không có dòng thu hồi → giữ nguyên luật cũ", () => {
    expect(hoiBo("truong_phong", row({ can_view: true }), undefined)).toBe(true);
  });
});
