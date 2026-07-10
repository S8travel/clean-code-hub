import { describe, it, expect } from "vitest";
import {
  nhMainMoTa, nhMealSuffix, findNhMainChiPhi, resolveNhMainId, type ChiPhiLite,
} from "./nh-chi-phi-resolve";

const cp = (id: number, ref: number | null, moTa: string | null, dm = "nha_hang"): ChiPhiLite =>
  ({ id, danh_muc: dm, ref_doan_ngay_id: ref, mo_ta: moTa });

describe("nhMainMoTa / nhMealSuffix", () => {
  // Khuôn này phải khớp use-dieu-tour.ts:1101 (cascade) và use-nh-section (init/insert).
  // Lệch 1 ký tự → mất dấu dòng chi phí → ĐNTT trỏ sai / dòng trùng.
  it("khuôn chuẩn: TÊN (trưa) / TÊN (tối)", () => {
    expect(nhMainMoTa("STREET SIDE DINING", "trua")).toBe("STREET SIDE DINING (trưa)");
    expect(nhMainMoTa("STREET SIDE DINING", "toi")).toBe("STREET SIDE DINING (tối)");
  });
  it("hậu tố dùng chung với pre-check xóa NH của Điều tour", () => {
    expect(nhMealSuffix("trua")).toBe("(trưa)");
    expect(nhMealSuffix("toi")).toBe("(tối)");
  });
});

describe("findNhMainChiPhi", () => {
  const rows = [
    cp(1, 481, "STREET SIDE DINING (tối)"),
    cp(2, 481, "[toi] Suất trẻ em"),           // extra — không phải dòng chính
    cp(3, 480, "STREET SIDE DINING (tối)"),    // ngày khác
    cp(4, 481, "STREET SIDE DINING (tối)", "canh_diem"), // danh mục khác
  ];
  it("khớp đúng ngày + mo_ta + danh_muc", () => {
    expect(findNhMainChiPhi(rows, 481, "STREET SIDE DINING (tối)")?.id).toBe(1);
  });
  it("chỉ còn extras của bữa → không nhận nhầm extra làm dòng chính", () => {
    const chiExtras = [cp(2, 481, "[toi] Suất trẻ em")];
    expect(findNhMainChiPhi(chiExtras, 481, nhMainMoTa("STREET SIDE DINING", "toi"))).toBeUndefined();
  });

  it("không lấy dòng của ngày khác", () => {
    expect(findNhMainChiPhi(rows, 999, "STREET SIDE DINING (tối)")).toBeUndefined();
  });

  it("không lấy dòng danh mục khác dù trùng ngày + mo_ta", () => {
    const chiCanhDiem = [cp(4, 481, "STREET SIDE DINING (tối)", "canh_diem")];
    expect(findNhMainChiPhi(chiCanhDiem, 481, "STREET SIDE DINING (tối)")).toBeUndefined();
  });
});

describe("resolveNhMainId", () => {
  const moTa = "STREET SIDE DINING (tối)";

  it("cascade tạo lại dòng với id mới → NHẬN id mới (đúng ca 13474 → 13479)", () => {
    const r = resolveNhMainId({
      currentId: 13474, chiPhiRows: [cp(13479, 481, moTa)], doanNgayId: 481, moTa,
    });
    expect(r).toEqual({ id: 13479, adopted: true });
  });

  it("id đang giữ khớp dòng thật → giữ nguyên, không báo adopted", () => {
    const r = resolveNhMainId({
      currentId: 13479, chiPhiRows: [cp(13479, 481, moTa)], doanNgayId: 481, moTa,
    });
    expect(r).toEqual({ id: 13479, adopted: false });
  });

  it("chưa có id, tìm được dòng trong DB → lấy id đó", () => {
    const r = resolveNhMainId({
      currentId: undefined, chiPhiRows: [cp(77, 481, moTa)], doanNgayId: 481, moTa,
    });
    expect(r.id).toBe(77);
  });

  // Bất biến chống lỗi kép: KHÔNG xóa id chỉ vì nó vắng mặt trong cache.
  it("id vừa INSERT chưa kịp vào cache → KHÔNG bị xóa (tránh insert lần hai)", () => {
    const r = resolveNhMainId({
      currentId: 13479, chiPhiRows: [], doanNgayId: 481, moTa,
    });
    expect(r).toEqual({ id: 13479, adopted: false });
  });

  it("không id, không dòng nào → undefined để caller tra DB / tạo mới", () => {
    const r = resolveNhMainId({
      currentId: undefined, chiPhiRows: [], doanNgayId: 481, moTa,
    });
    expect(r).toEqual({ id: undefined, adopted: false });
  });

  it("dòng của bữa khác cùng ngày không bị nhận nhầm", () => {
    const r = resolveNhMainId({
      currentId: undefined,
      chiPhiRows: [cp(5, 481, "VUI GARDEN (trưa)")],
      doanNgayId: 481,
      moTa,
    });
    expect(r.id).toBeUndefined();
  });
});
