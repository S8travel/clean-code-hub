import { describe, it, expect } from "vitest";
import { locBaoGia, locDoan, NGAY_GIU_CAP_NHAT_DOAN, type DoanNguon } from "./portal-sync";

describe("locBaoGia — báo giá nào lên cổng", () => {
  it("đủ đối tác + đã chốt giá thì được hiển thị và đẩy", () => {
    const r = locBaoGia([{ id: 1, agent_id: 2, portal_noi_dung: { brackets: [] } }]);
    expect(r.hienThi).toEqual([1]);
    expect(r.canDay).toHaveLength(1);
    expect(r.boQua).toEqual([]);
  });

  it("chưa chọn đối tác → bỏ qua KÈM LÝ DO, không im lặng", () => {
    const r = locBaoGia([{ id: 7, agent_id: null, portal_noi_dung: { brackets: [] } }]);
    expect(r.hienThi).toEqual([]);
    expect(r.boQua).toEqual([
      { loai: "bao_gia", id: 7, ly_do: expect.stringContaining("Đối tác bán") },
    ]);
  });

  it("chưa chốt bảng giá → bỏ qua kèm hướng dẫn bấm nút nào", () => {
    const r = locBaoGia([{ id: 8, agent_id: 2, portal_noi_dung: null }]);
    expect(r.hienThi).toEqual([]);
    expect(r.boQua[0].ly_do).toContain("Gửi khách");
  });

  it("một dòng hỏng không kéo theo dòng lành", () => {
    const r = locBaoGia([
      { id: 1, agent_id: 2, portal_noi_dung: { brackets: [] } },
      { id: 2, agent_id: null, portal_noi_dung: null },
      { id: 3, agent_id: 5, portal_noi_dung: { brackets: [] } },
    ]);
    expect(r.hienThi).toEqual([1, 3]);
    expect(r.boQua).toHaveLength(1);
  });
});

describe("locDoan — đoàn nào lên cổng, đoàn nào bị gỡ", () => {
  const homNay = "2026-08-17";
  const doan = (over: Partial<DoanNguon> = {}): DoanNguon => ({
    id: 1, agent_id: 2, trang_thai: "dang_chay", ngay_ve: "2026-08-15", ...over,
  });

  it("đoàn đang chạy, mới về → vừa hiển thị vừa cập nhật", () => {
    const r = locDoan([doan()], homNay);
    expect(r.hienThi).toEqual([1]);
    expect(r.canDay).toHaveLength(1);
  });

  it("đoàn ĐÃ HỦY bị gỡ khỏi cổng, không chỉ ngừng cập nhật", () => {
    const r = locDoan([doan({ trang_thai: "huy" })], homNay);
    expect(r.hienThi).toEqual([]); // không nằm trong danh sách hiển thị → vòng xoá gỡ đi
    expect(r.canDay).toEqual([]);
    expect(r.boQua[0].ly_do).toContain("đã hủy");
  });

  it("đoàn về quá 30 ngày: NGỪNG CẬP NHẬT nhưng VẪN xem được bản cũ", () => {
    const r = locDoan([doan({ ngay_ve: "2026-06-01" })], homNay);
    expect(r.hienThi).toEqual([1]); // điểm mấu chốt: không bị xoá
    expect(r.canDay).toEqual([]);
    expect(r.boQua[0].ly_do).toContain("ngừng cập nhật");
  });

  it("đúng mốc 30 ngày vẫn còn được cập nhật (biên)", () => {
    expect(NGAY_GIU_CAP_NHAT_DOAN).toBe(30);
    const r = locDoan([doan({ ngay_ve: "2026-07-18" })], homNay); // 17/08 − 30 ngày
    expect(r.canDay).toHaveLength(1);
  });

  it("đoàn chưa có ngày về vẫn được cập nhật, không bị loại nhầm", () => {
    const r = locDoan([doan({ ngay_ve: null })], homNay);
    expect(r.hienThi).toEqual([1]);
    expect(r.canDay).toHaveLength(1);
  });

  it("đoàn chưa gắn đối tác → bỏ qua kèm lý do", () => {
    const r = locDoan([doan({ agent_id: null })], homNay);
    expect(r.hienThi).toEqual([]);
    expect(r.boQua[0].ly_do).toContain("chưa gắn đối tác");
  });

  it("hỗn hợp: mỗi đoàn rơi đúng nhóm của nó", () => {
    const r = locDoan([
      doan({ id: 1 }),
      doan({ id: 2, trang_thai: "huy" }),
      doan({ id: 3, ngay_ve: "2026-01-01" }),
      doan({ id: 4, agent_id: null }),
    ], homNay);
    expect(r.hienThi).toEqual([1, 3]);
    expect(r.canDay.map((d) => d.id)).toEqual([1]);
    expect(r.boQua.map((b) => b.id).sort()).toEqual([2, 3, 4]);
  });
});
