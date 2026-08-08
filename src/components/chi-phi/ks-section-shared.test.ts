import { describe, it, expect } from "vitest";
import {
  calcKSPaidTotal, buildKSRowFromCp, resolveKsIds, resolveDayUseItemId,
  type KSPaidDnttInfo, type KSNgayInfo, type KSDayUseInfo,
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

// ── Link day-use cho dòng TẠO MỚI (bug: dòng dịch vụ mất link → vô hình sau reload) ──
describe("resolveDayUseItemId — dòng mới trên thẻ Day Use phải kế thừa item id", () => {
  const KS_GOLF = 1149, KS_KHAC = 1151;
  const map: Record<number, KSDayUseInfo> = {
    18770: { khach_san_id: KS_GOLF, ngay_date: "2026-08-10", doan_ngay_id: 3827 },
    18771: { khach_san_id: KS_KHAC, ngay_date: "2026-08-11", doan_ngay_id: 3828 },
  };

  it("KS + ngày khớp item day-use → trả item id", () => {
    expect(resolveDayUseItemId(map, KS_GOLF, "2026-08-10")).toBe(18770);
  });

  it("đúng KS nhưng khác ngày → undefined (không gán nhầm sang ngày khác)", () => {
    expect(resolveDayUseItemId(map, KS_GOLF, "2026-08-11")).toBeUndefined();
  });

  it("đúng ngày nhưng khác KS → undefined (không gán nhầm sang KS khác)", () => {
    expect(resolveDayUseItemId(map, KS_KHAC, "2026-08-10")).toBeUndefined();
  });

  it("KS ngủ (không có item day-use) → undefined → dòng dựng qua đường lịch trình", () => {
    expect(resolveDayUseItemId({}, KS_GOLF, "2026-08-10")).toBeUndefined();
  });

  it("nhiều item cùng KS cùng ngày → luôn lấy id nhỏ nhất (deterministic)", () => {
    const multi: Record<number, KSDayUseInfo> = {
      900: { khach_san_id: KS_GOLF, ngay_date: "2026-08-10", doan_ngay_id: 3827 },
      800: { khach_san_id: KS_GOLF, ngay_date: "2026-08-10", doan_ngay_id: 3827 },
    };
    expect(resolveDayUseItemId(multi, KS_GOLF, "2026-08-10")).toBe(800);
  });

  // Bảo đảm end-to-end: link resolve được → buildKSRowFromCp dựng lại dòng qua Path 1,
  // KHÔNG rơi xuống Path 2 (nơi ngày day-use không có khach_san_id → null → dòng biến mất).
  it("dòng dịch vụ có link day-use → dựng lại được dù ngày KHÔNG có KS ngủ", () => {
    const itemId = resolveDayUseItemId(map, KS_GOLF, "2026-08-10");
    const row = buildKSRowFromCp(
      {
        id: 18253, ref_doan_ngay_id: 3827, ref_doan_ngay_item_id: itemId ?? null,
        khach_san_id: KS_GOLF, mo_ta: "GOLF", so_luong: 2, don_gia: 2_100_000,
        tien_hdv: 0, foc_count: 0, loai_row: "dich_vu_khac",
        foc_khach_snapshot: null, foc_mien_snapshot: null, trang_thai_hoa_don: null,
      } as ChiPhiRow,
      { 3827: { ngay_date: "2026-08-10", khach_san_id: null } }, // ngày day-use: KHÔNG có KS ngủ
      map,
    );
    expect(row).not.toBeNull();
    expect(row?.khach_san_id).toBe(KS_GOLF);
    expect(row?.thanh_tien).toBe(4_200_000);
    expect(row?.loai_row).toBe("dich_vu_khac");
  });

  // NEO phải áp dụng cho CẢ nhánh day-use: `dayUseItemMap` dựng từ `canh_diem.khach_san_id`
  // đọc SỐNG từ danh mục. Nếu nhánh này ưu tiên danh mục thì đổi wrapper cảnh điểm sang KS
  // khác là dòng đã trả tiền nhảy thẻ — đúng thứ NEO (#272) sinh ra để chặn.
  it("dòng day-use ĐÃ NEO → giữ KS đã snapshot, KHÔNG theo danh mục cảnh điểm", () => {
    const mapDoiKs: Record<number, KSDayUseInfo> = {
      18770: { khach_san_id: KS_KHAC, ngay_date: "2026-08-10", doan_ngay_id: 3827 }, // master đã đổi
    };
    const row = buildKSRowFromCp(
      {
        id: 18253, ref_doan_ngay_id: 3827, ref_doan_ngay_item_id: 18770,
        khach_san_id: KS_GOLF, mo_ta: "GOLF", so_luong: 2, don_gia: 2_100_000,
        tien_hdv: 0, foc_count: 0, loai_row: "dich_vu_khac",
        foc_khach_snapshot: null, foc_mien_snapshot: null, trang_thai_hoa_don: null,
      } as ChiPhiRow,
      { 3827: { ngay_date: "2026-08-10", khach_san_id: null } },
      mapDoiKs,
    );
    expect(row?.khach_san_id).toBe(KS_GOLF);
  });

  it("dòng day-use CHƯA neo → fallback danh mục cảnh điểm (tương thích ngược)", () => {
    const row = buildKSRowFromCp(
      {
        id: 18253, ref_doan_ngay_id: 3827, ref_doan_ngay_item_id: 18770,
        khach_san_id: null, mo_ta: "GOLF", so_luong: 2, don_gia: 2_100_000,
        tien_hdv: 0, foc_count: 0, loai_row: "dich_vu_khac",
        foc_khach_snapshot: null, foc_mien_snapshot: null, trang_thai_hoa_don: null,
      } as ChiPhiRow,
      { 3827: { ngay_date: "2026-08-10", khach_san_id: null } },
      map,
    );
    expect(row?.khach_san_id).toBe(KS_GOLF);
  });

  it("cùng dòng đó NHƯNG mất link → null (đây chính là lỗi dòng vô hình)", () => {
    const row = buildKSRowFromCp(
      {
        id: 18253, ref_doan_ngay_id: 3827, ref_doan_ngay_item_id: null,
        khach_san_id: KS_GOLF, mo_ta: "GOLF", so_luong: 2, don_gia: 2_100_000,
        tien_hdv: 0, foc_count: 0, loai_row: "dich_vu_khac",
        foc_khach_snapshot: null, foc_mien_snapshot: null, trang_thai_hoa_don: null,
      } as ChiPhiRow,
      { 3827: { ngay_date: "2026-08-10", khach_san_id: null } },
      map,
    );
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
