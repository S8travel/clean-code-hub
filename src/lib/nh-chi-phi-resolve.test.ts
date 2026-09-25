import { describe, it, expect } from "vitest";
import {
  nhMainMoTa, nhMealSuffix, findNhMainChiPhi, resolveNhMainId, type ChiPhiLite,
  oBuaCanDungLai, tenNhaHangDeGhi, dangGiuCacheCu,
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

// ── Ô bữa đổi nhà hàng trong lúc tab Chi phí đang giữ state ──────────────────
// Tên nhà hàng ở đây là tên giả; con số id chỉ để phân biệt.
const NH_CU = 11;  // nhà hàng lịch trình có LÚC dựng bảng
const NH_MOI = 22; // nhà hàng OP đổi sang ở Điều tour
const nhaHangMapSauKhiDoi = { [NH_MOI]: { ten: "TÀU MỚI" } }; // map chỉ chứa NH của lịch trình hiện tại
const slot = (ngay: number, bua: "trua" | "toi", nh: number) =>
  ({ doan_ngay_id: ngay, bua_an: bua, nha_hang_id: nh });

describe("oBuaCanDungLai", () => {
  it("ô bữa chưa có trong state → cần dựng", () => {
    expect(oBuaCanDungLai([slot(481, "trua", NH_MOI)], {})).toHaveLength(1);
  });

  it("ô bữa giữ nguyên nhà hàng → KHÔNG dựng lại (giữ edit của OP)", () => {
    const state = { "481_trua": { nha_hang_id: NH_MOI } };
    expect(oBuaCanDungLai([slot(481, "trua", NH_MOI)], state)).toEqual([]);
  });

  it("lịch trình đổi nhà hàng của ô bữa → phải dựng lại ô đó", () => {
    const state = { "481_trua": { nha_hang_id: NH_CU }, "481_toi": { nha_hang_id: 56 } };
    const meals = [slot(481, "trua", NH_MOI), slot(481, "toi", 56)];
    expect(oBuaCanDungLai(meals, state)).toEqual([slot(481, "trua", NH_MOI)]);
  });

  it("bữa trưa và tối cùng ngày là hai ô riêng", () => {
    const state = { "481_trua": { nha_hang_id: NH_MOI } };
    expect(oBuaCanDungLai([slot(481, "toi", NH_MOI)], state)).toEqual([slot(481, "toi", NH_MOI)]);
  });
});

describe("tenNhaHangDeGhi", () => {
  it("state khớp lịch trình + có tên → trả đúng tên", () => {
    expect(tenNhaHangDeGhi({
      nhaHangIdState: NH_MOI, nhaHangIdLichTrinh: NH_MOI, nhaHangMap: nhaHangMapSauKhiDoi,
    })).toEqual({ ok: true, ten: "TÀU MỚI" });
  });

  // Đúng ca sự cố: state còn nhà hàng cũ, lịch trình đã là nhà hàng mới.
  it("state còn nhà hàng CŨ → từ chối, KHÔNG ghi chữ dự phòng \"Nhà hàng\"", () => {
    const r = tenNhaHangDeGhi({
      nhaHangIdState: NH_CU, nhaHangIdLichTrinh: NH_MOI, nhaHangMap: nhaHangMapSauKhiDoi,
    });
    expect(r.ok).toBe(false);
  });

  it("bữa không còn trong lịch trình → từ chối", () => {
    const r = tenNhaHangDeGhi({
      nhaHangIdState: NH_MOI, nhaHangIdLichTrinh: undefined, nhaHangMap: nhaHangMapSauKhiDoi,
    });
    expect(r.ok).toBe(false);
  });

  it("không tra được tên (thiếu trong map / tên rỗng) → từ chối", () => {
    expect(tenNhaHangDeGhi({ nhaHangIdState: 7, nhaHangIdLichTrinh: 7, nhaHangMap: {} }).ok).toBe(false);
    expect(tenNhaHangDeGhi({
      nhaHangIdState: 7, nhaHangIdLichTrinh: 7, nhaHangMap: { 7: { ten: "   " } },
    }).ok).toBe(false);
    expect(tenNhaHangDeGhi({
      nhaHangIdState: 7, nhaHangIdLichTrinh: 7, nhaHangMap: { 7: { ten: null } },
    }).ok).toBe(false);
  });

  it("giữ nguyên chuỗi tên gốc (không trim) để mo_ta khớp cascade Điều tour", () => {
    const r = tenNhaHangDeGhi({
      nhaHangIdState: 7, nhaHangIdLichTrinh: 7, nhaHangMap: { 7: { ten: "QUÁN A " } },
    });
    expect(r).toEqual({ ok: true, ten: "QUÁN A " });
  });

  it("dựng lại ô bữa xong (state = nhà hàng mới) → mo_ta ghi ra khớp dòng cascade đã tạo", () => {
    const state = { "481_trua": { nha_hang_id: NH_CU } };
    const meals = [slot(481, "trua", NH_MOI)];
    // Trước khi dựng lại: bị chặn.
    expect(tenNhaHangDeGhi({
      nhaHangIdState: state["481_trua"].nha_hang_id, nhaHangIdLichTrinh: NH_MOI, nhaHangMap: nhaHangMapSauKhiDoi,
    }).ok).toBe(false);
    // Dựng lại theo lịch trình → ghi đúng tên → tìm lại được đúng dòng cascade.
    const [dungLai] = oBuaCanDungLai(meals, state);
    const r = tenNhaHangDeGhi({
      nhaHangIdState: dungLai.nha_hang_id, nhaHangIdLichTrinh: NH_MOI, nhaHangMap: nhaHangMapSauKhiDoi,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const cascadeRow = cp(26, 481, "TÀU MỚI (trưa)");
    expect(findNhMainChiPhi([cascadeRow], 481, nhMainMoTa(r.ten, "trua"))?.id).toBe(26);
  });
});

describe("dangGiuCacheCu", () => {
  it("cache cũ, chưa tải lại kể từ khi mở tab → đang giữ cache cũ", () => {
    expect(dangGiuCacheCu({ isStale: true, isFetchedAfterMount: false })).toBe(true);
  });
  it("đã tải lại sau khi mở tab → không còn là cache cũ (dù sau đó lại hết hạn)", () => {
    expect(dangGiuCacheCu({ isStale: true, isFetchedAfterMount: true })).toBe(false);
  });
  it("cache còn trong hạn → coi là tươi", () => {
    expect(dangGiuCacheCu({ isStale: false, isFetchedAfterMount: false })).toBe(false);
    expect(dangGiuCacheCu({ isStale: false, isFetchedAfterMount: true })).toBe(false);
  });
});
