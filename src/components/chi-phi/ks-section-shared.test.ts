import { describe, it, expect } from "vitest";
import {
  calcKSPaidTotal, buildKSRowFromCp, resolveKsIds,
  type KSPaidDnttInfo, type KSNgayInfo,
} from "./ks-section-shared";
import type { ChiPhiRow } from "@/hooks/use-chi-phi";

const dntt = (over: Partial<KSPaidDnttInfo> = {}): KSPaidDnttInfo => ({
  id: 1,
  trang_thai_duyet: "da_duyet",
  ref_loai: "khach_san",
  ref_id: 1034,
  paid_amount: 0,
  ...over,
});

describe("calcKSPaidTotal", () => {
  it("cộng paid_amount của ĐNTT non-cọc đã trả 1 phần (bug gốc)", () => {
    // Phiếu trước đã trả một phần dù la_coc=false → phải tính vào "đã trả" của phiếu
    // còn lại đang in, nếu không bản in sẽ đòi NCC nguyên số tiền.
    const list = [
      dntt({ id: 1, paid_amount: 58_760_000 }),
      dntt({ id: 2, paid_amount: 0 }),
    ];
    expect(calcKSPaidTotal(list, 2, 1034)).toBe(58_760_000);
  });

  it("loại ĐNTT đang in khỏi tổng", () => {
    const list = [dntt({ id: 858, paid_amount: 24_440_000 })];
    expect(calcKSPaidTotal(list, 858, 1034)).toBe(0);
  });

  it("loại ĐNTT đã hủy / từ chối", () => {
    const list = [
      dntt({ id: 743, paid_amount: 10_000_000, trang_thai_duyet: "da_huy" }),
      dntt({ id: 744, paid_amount: 20_000_000, trang_thai_duyet: "tu_choi" }),
      dntt({ id: 745, paid_amount: 30_000_000 }),
    ];
    expect(calcKSPaidTotal(list, 858, 1034)).toBe(30_000_000);
  });

  it("chỉ cộng ĐNTT cùng khách sạn (ref_loai + ref_id khớp)", () => {
    const list = [
      dntt({ id: 743, paid_amount: 10_000_000, ref_id: 9999 }),
      dntt({ id: 744, paid_amount: 20_000_000, ref_loai: "doan_chi_phi" }),
      dntt({ id: 745, paid_amount: 30_000_000 }),
    ];
    expect(calcKSPaidTotal(list, 858, 1034)).toBe(30_000_000);
  });

  it("gộp nhiều ĐNTT đã trả của cùng KS (cọc + bổ sung)", () => {
    const list = [
      dntt({ id: 743, paid_amount: 58_760_000 }),
      dntt({ id: 744, paid_amount: 10_000_000 }),
    ];
    expect(calcKSPaidTotal(list, 858, 1034)).toBe(68_760_000);
  });
});

// ── NEO khach_san_id vào dòng chi phí (chống "tiền nhảy sang KS mới") ──────────
describe("buildKSRowFromCp — danh tính KS ưu tiên dòng, fallback lịch trình", () => {
  const KS_CU = 501, KS_MOI = 502;
  const cp = (over: Partial<ChiPhiRow> = {}): ChiPhiRow => ({
    id: 1, ref_doan_ngay_id: 30, ref_doan_ngay_item_id: null,
    khach_san_id: null, mo_ta: "TWN", so_luong: 5, don_gia: 1_000_000,
    tien_hdv: 0, foc_count: 0, loai_row: "phong",
    foc_khach_snapshot: null, foc_mien_snapshot: null, trang_thai_hoa_don: null,
    ...over,
  } as ChiPhiRow);
  // Ngày 30 hiện đã bị đổi sang KS MỚI trong lịch trình.
  const ngayMap: Record<number, KSNgayInfo> = { 30: { ngay_date: "2026-07-12", khach_san_id: KS_MOI } };

  // ĐÂY LÀ BẢO ĐẢM CỐT LÕI: dòng đã trả tiền cho KS cũ, lịch trình đổi sang KS mới →
  // dòng PHẢI ở lại KS cũ, KHÔNG nhảy theo lịch trình.
  it("dòng ĐÃ NEO KS cũ → giữ KS cũ dù lịch trình đã đổi sang KS mới", () => {
    const row = buildKSRowFromCp(cp({ khach_san_id: KS_CU }), ngayMap, {});
    expect(row?.khach_san_id).toBe(KS_CU);
  });

  it("dòng CHƯA neo (khach_san_id null) → fallback lịch trình (tương thích ngược)", () => {
    const row = buildKSRowFromCp(cp({ khach_san_id: null }), ngayMap, {});
    expect(row?.khach_san_id).toBe(KS_MOI);
  });

  it("neo trùng lịch trình → vẫn ra đúng KS đó", () => {
    const row = buildKSRowFromCp(cp({ khach_san_id: KS_MOI }), ngayMap, {});
    expect(row?.khach_san_id).toBe(KS_MOI);
  });

  it("ngày không còn trong lịch trình (mồ côi) → null như cũ (chưa đổi hành vi này)", () => {
    const row = buildKSRowFromCp(cp({ khach_san_id: KS_CU, ref_doan_ngay_id: 99 }), ngayMap, {});
    expect(row).toBeNull();
  });
});

describe("resolveKsIds — card KS phải hiện cho MỌI KS có dòng chi phí", () => {
  // REGRESSION do việc neo KS: dòng neo KS_A, đêm đổi lịch trình sang KS_B, KS_A CHƯA
  // có ĐNTT. Thiếu nguồn chiPhi → KS_A không có card → dòng tàng hình nhưng vẫn cộng tổng.
  it("KS đã neo trên dòng nhưng rời lịch trình + chưa ĐNTT → vẫn là orphaned (có card)", () => {
    const r = resolveKsIds({ ngay: [502], dntt: [], dayUse: [], chiPhi: [501] });
    expect(r.allKsIds).toEqual(expect.arrayContaining([501, 502]));
    expect(r.orphanedKsIds).toContain(501); // 501 có dòng nhưng không ở lịch trình → card
  });

  it("KS còn trong lịch trình → KHÔNG orphaned (đã có card từ ngayRows)", () => {
    const r = resolveKsIds({ ngay: [501], dntt: [], dayUse: [], chiPhi: [501] });
    expect(r.orphanedKsIds).not.toContain(501);
  });

  it("gộp cả ĐNTT lẫn dòng chi phí vào orphaned, khử trùng", () => {
    const r = resolveKsIds({ ngay: [], dntt: [501], dayUse: [], chiPhi: [501, 503] });
    expect([...r.orphanedKsIds].sort()).toEqual([501, 503]);
  });

  it("day-use không bị coi là orphaned", () => {
    const r = resolveKsIds({ ngay: [], dntt: [], dayUse: [700], chiPhi: [700] });
    expect(r.orphanedKsIds).not.toContain(700);
    expect(r.allKsIds).toContain(700);
  });

  it("rỗng hoàn toàn → rỗng", () => {
    expect(resolveKsIds({ ngay: [], dntt: [], dayUse: [], chiPhi: [] })).toEqual({
      allKsIds: [], orphanedKsIds: [],
    });
  });
});
