import { describe, it, expect } from "vitest";
import { vaDanhSachDoan, vaMotDoan, dieuKienDanhSachDoan, type SuKienDoan } from "./doan-realtime-va";

const doan = (id: number, them: Record<string, unknown> = {}) => ({
  id, ten_doan: `Đoàn ${id}`, ngay_di: "2026-10-05", thi_truong: "inbound", van_phong_id: 1,
  agent_id: 7, huong_dan_vien_id: null, bang_don: "S8", so_khach: 20,
  agents: { id: 7, ten: "Agent 7" }, ...them,
});
const capNhat = (moi: Record<string, unknown>): SuKienDoan => ({
  eventType: "UPDATE", new: moi, old: { id: moi.id }, // RLS: old chỉ có khoá chính
});

describe("vaDanhSachDoan", () => {
  it("UPDATE cột thường → vá đúng dòng, giữ object nhúng, KHÔNG tải lại", () => {
    const ds = [doan(1), doan(2)];
    const kq = vaDanhSachDoan(ds, [capNhat({ ...doan(2), bang_don: "S8 TRAVEL", agents: undefined })]);
    expect(kq.canTaiLai).toBe(false);
    expect(kq.data[1].bang_don).toBe("S8 TRAVEL");
    expect(kq.data[1].agents).toEqual({ id: 7, ten: "Agent 7" });
    expect(kq.data[0]).toBe(ds[0]); // dòng khác giữ nguyên tham chiếu
  });

  it("UPDATE y nguyên → trả lại đúng mảng cũ (không render lại vô ích)", () => {
    const ds = [doan(1)];
    const kq = vaDanhSachDoan(ds, [capNhat(doan(1))]);
    expect(kq.data).toBe(ds);
    expect(kq.canTaiLai).toBe(false);
  });

  it("đổi khoá ngoại có object nhúng (HDV, agent, xe…) → tải lại", () => {
    expect(vaDanhSachDoan([doan(1)], [capNhat({ ...doan(1), huong_dan_vien_id: 9 })]).canTaiLai).toBe(true);
    expect(vaDanhSachDoan([doan(1)], [capNhat({ ...doan(1), agent_id: 8 })]).canTaiLai).toBe(true);
  });

  it("đổi ngày đi → tải lại (thứ tự danh sách đổi)", () => {
    expect(vaDanhSachDoan([doan(1)], [capNhat({ ...doan(1), ngay_di: "2026-11-01" })]).canTaiLai).toBe(true);
  });

  it("INSERT → tải lại; DELETE → bỏ dòng, không tải lại", () => {
    expect(vaDanhSachDoan([doan(1)], [{ eventType: "INSERT", new: doan(3), old: {} }]).canTaiLai).toBe(true);
    const kq = vaDanhSachDoan([doan(1), doan(2)], [{ eventType: "DELETE", new: {}, old: { id: 1 } }]);
    expect(kq.canTaiLai).toBe(false);
    expect(kq.data.map((d) => d.id)).toEqual([2]);
  });

  it("sự kiện báo lỗi / thiếu id → tải lại", () => {
    expect(vaDanhSachDoan([doan(1)], [{ ...capNhat(doan(1)), errors: ["Error 413: Payload Too Large"] }]).canTaiLai).toBe(true);
    expect(vaDanhSachDoan([doan(1)], [capNhat({ bang_don: "x" })]).canTaiLai).toBe(true);
  });

  it("giá trị thiếu trong payload (TOAST lược bớt) → giữ bản đang có", () => {
    const kq = vaDanhSachDoan([doan(1, { ghi_chu: "dài…" })], [capNhat({ id: 1, ghi_chu: undefined, so_khach: 21 })]);
    expect(kq.data[0].ghi_chu).toBe("dài…");
    expect(kq.data[0].so_khach).toBe(21);
  });

  describe("danh sách đã lọc (OP chỉ xem thị trường của mình)", () => {
    const thuoc = dieuKienDanhSachDoan(["inbound"], [1], null);

    it("đoàn KHÔNG thuộc danh sách đổi gì đó → bỏ qua, không tải lại", () => {
      const kq = vaDanhSachDoan([doan(1)], [capNhat(doan(5, { thi_truong: "outbound" }))], thuoc);
      expect(kq.canTaiLai).toBe(false);
      expect(kq.data.map((d) => d.id)).toEqual([1]);
    });

    it("đoàn ngoài danh sách vừa đổi sang thị trường của mình → tải lại (cần object nhúng)", () => {
      expect(vaDanhSachDoan([doan(1)], [capNhat(doan(5))], thuoc).canTaiLai).toBe(true);
    });

    it("đoàn trong danh sách đổi sang thị trường khác → rút khỏi danh sách, không tải lại", () => {
      const kq = vaDanhSachDoan([doan(1), doan(2)], [capNhat({ ...doan(2), thi_truong: "outbound" })], thuoc);
      expect(kq.canTaiLai).toBe(false);
      expect(kq.data.map((d) => d.id)).toEqual([1]);
    });

    it("đoàn chưa phân thị trường (NULL) vẫn hiện cho mọi OP — khớp câu query", () => {
      expect(thuoc({ thi_truong: null, van_phong_id: 1 })).toBe(true);
      expect(thuoc({ thi_truong: "inbound", van_phong_id: 2 })).toBe(false);
      expect(dieuKienDanhSachDoan(null, null, [7])({ agent_id: 8 })).toBe(false);
    });
  });
});

describe("vaMotDoan (trang chi tiết)", () => {
  it("UPDATE đúng đoàn → vá; đoàn khác → bỏ qua", () => {
    const d = doan(1);
    const kq = vaMotDoan(d, [capNhat({ ...doan(2), bang_don: "khác" }), capNhat({ ...doan(1), so_khach: 25 })]);
    expect(kq.canTaiLai).toBe(false);
    expect(kq.data.so_khach).toBe(25);
    expect(kq.data.bang_don).toBe("S8");
  });

  it("đổi ngày đi ở trang chi tiết → vá được (không phải sắp thứ tự)", () => {
    const kq = vaMotDoan(doan(1), [capNhat({ ...doan(1), ngay_di: "2026-11-01" })]);
    expect(kq.canTaiLai).toBe(false);
    expect(kq.data.ngay_di).toBe("2026-11-01");
  });

  it("đổi HDV / đoàn bị xoá → tải lại", () => {
    expect(vaMotDoan(doan(1), [capNhat({ ...doan(1), huong_dan_vien_id: 3 })]).canTaiLai).toBe(true);
    expect(vaMotDoan(doan(1), [{ eventType: "DELETE", new: {}, old: { id: 1 } }]).canTaiLai).toBe(true);
  });
});
