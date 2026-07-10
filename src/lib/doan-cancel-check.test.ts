import { describe, it, expect } from "vitest";
import {
  buildCancelBlockers, parseDoanTab, isKsCancelled, isKsSent, isTau, isTauCancelled,
  ROUTE_DINH_KY, type KsStatusRow, type NhStatusRow,
} from "./doan-cancel-check";

const ks = (dt: string | null, fn: string | null): KsStatusRow =>
  ({ ks_dat_truoc_status: dt, ks_final_status: fn });

const nh = (over: Partial<NhStatusRow> = {}): NhStatusRow => ({
  booking_status: null, dat_truoc_status: null, final_status: null, nha_hang: { loai: "nha_hang" }, ...over,
});

const tau = (over: Partial<NhStatusRow> = {}): NhStatusRow =>
  nh({ nha_hang: { loai: "tau_dem" }, ...over });

const empty = { ks: [], nh: [], dvActiveCount: 0, dnttActiveCount: 0, dnttDinhKyCount: 0 };

describe("parseDoanTab", () => {
  it("nhận tab hợp lệ", () => {
    expect(parseDoanTab("booking-ks")).toBe("booking-ks");
    expect(parseDoanTab("chi-phi")).toBe("chi-phi");
  });
  it("từ chối rác / null → null (Tabs không rỗng ruột)", () => {
    expect(parseDoanTab("../../etc")).toBeNull();
    expect(parseDoanTab(null)).toBeNull();
    expect(parseDoanTab("")).toBeNull();
    expect(parseDoanTab("dieu-tour")).toBeNull(); // không nằm trong whitelist deep-link
  });
});

describe("khách sạn", () => {
  it("chưa gửi mail → không chặn", () => {
    expect(buildCancelBlockers({ ...empty, ks: [ks("chua_gui", "chua_gui")] })).toEqual([]);
  });

  it("đã gửi, chưa hủy → chặn", () => {
    const b = buildCancelBlockers({ ...empty, ks: [ks("da_gui", "chua_gui")] });
    expect(b).toEqual([{ kind: "ks", count: 1, tab: "booking-ks" }]);
  });

  // Final là phase quyết định: đặt trước còn ks_xac_nhan nhưng Final đã hủy → coi như hủy.
  it("Final đã hủy thắng ks_dat_truoc_status còn sống", () => {
    expect(isKsCancelled(ks("ks_xac_nhan", "ks_xac_nhan_huy"))).toBe(true);
    expect(buildCancelBlockers({ ...empty, ks: [ks("ks_xac_nhan", "ks_xac_nhan_huy")] })).toEqual([]);
  });

  it("Final rỗng → xét ks_dat_truoc_status", () => {
    expect(isKsCancelled(ks("cho_ks_xac_nhan_huy", null))).toBe(true);
    expect(isKsSent(ks("cho_ks_xac_nhan_huy", null))).toBe(true);
  });

  it("đếm gộp nhiều khách sạn còn sống", () => {
    const b = buildCancelBlockers({ ...empty, ks: [ks("da_gui", null), ks("ks_xac_nhan", null), ks("chua_gui", "chua_gui")] });
    expect(b[0].count).toBe(2);
  });
});

describe("nhà hàng vs du thuyền (cùng bảng doan_booking_nh)", () => {
  it("nhà hàng thường: booking_status da_gui/nh_xac_nhan → chặn", () => {
    const b = buildCancelBlockers({ ...empty, nh: [nh({ booking_status: "da_gui" }), nh({ booking_status: "nh_xac_nhan" })] });
    expect(b).toEqual([{ kind: "nh", count: 2, tab: "menu" }]);
  });

  it("nhà hàng da_huy → không chặn", () => {
    expect(buildCancelBlockers({ ...empty, nh: [nh({ booking_status: "da_huy" })] })).toEqual([]);
  });

  // Bẫy thật: tàu hủy qua final_status, booking_status vẫn 'da_gui' → nếu dùng
  // booking_status cho tàu sẽ chặn nhầm, không đời nào hủy được đoàn.
  it("du thuyền đã hủy ở final_status nhưng booking_status còn da_gui → KHÔNG chặn", () => {
    const t = tau({ booking_status: "da_gui", dat_truoc_status: "da_gui", final_status: "xac_nhan_huy" });
    expect(isTau(t)).toBe(true);
    expect(isTauCancelled(t)).toBe(true);
    expect(buildCancelBlockers({ ...empty, nh: [t] })).toEqual([]);
  });

  it("du thuyền đã gửi chưa hủy → chặn ở nhóm tàu, không lẫn vào nhóm nhà hàng", () => {
    const b = buildCancelBlockers({ ...empty, nh: [tau({ booking_status: "da_gui", dat_truoc_status: "da_gui" })] });
    expect(b).toEqual([{ kind: "tau", count: 1, tab: "menu" }]);
  });

  it("du thuyền chưa gửi gì → không chặn", () => {
    expect(buildCancelBlockers({ ...empty, nh: [tau({ dat_truoc_status: "chua_gui", final_status: "chua_gui" })] })).toEqual([]);
  });

  it("nha_hang trả về mảng (embed PostgREST) vẫn nhận đúng loại", () => {
    const t = tau({ nha_hang: [{ loai: "tau_ngay" }], dat_truoc_status: "da_gui" });
    expect(isTau(t)).toBe(true);
  });

  it("nha_hang null → coi là nhà hàng thường", () => {
    expect(isTau(nh({ nha_hang: null }))).toBe(false);
  });
});

// Cổng cũ lọc ĐNTT theo doan_id, mà ĐNTT định kỳ có doan_id = NULL → mù hoàn
// toàn. Prod 10/07/2026: 13 đoàn đang chạy, 17 phân bổ, 172.465.120 đ cam kết.
describe("ĐNTT định kỳ (doan_id = NULL)", () => {
  it("chặn hủy, và đích là trang định kỳ chứ không phải tab của đoàn", () => {
    const b = buildCancelBlockers({ ...empty, dnttDinhKyCount: 2 });
    expect(b).toEqual([
      { kind: "dntt_dinh_ky", count: 2, tab: null, route: ROUTE_DINH_KY },
    ]);
  });

  it("đếm riêng, không lẫn với ĐNTT của chính đoàn", () => {
    const b = buildCancelBlockers({ ...empty, dnttActiveCount: 1, dnttDinhKyCount: 3 });
    expect(b.map((x) => [x.kind, x.count])).toEqual([["dntt", 1], ["dntt_dinh_ky", 3]]);
  });
});

describe("thứ tự & gộp", () => {
  it("dọn booking trước, tiền sau cùng", () => {
    const b = buildCancelBlockers({
      ks: [ks("da_gui", null)],
      nh: [nh({ booking_status: "da_gui" }), tau({ dat_truoc_status: "da_gui" })],
      dvActiveCount: 3,
      dnttActiveCount: 2,
      dnttDinhKyCount: 1,
    });
    expect(b.map((x) => x.kind)).toEqual(["ks", "nh", "tau", "dv", "dntt", "dntt_dinh_ky"]);
    expect(b.map((x) => x.tab)).toEqual(["booking-ks", "menu", "menu", "booking-dv", "chi-phi", null]);
  });

  it("sạch hoàn toàn → mảng rỗng (được hủy)", () => {
    expect(buildCancelBlockers(empty)).toEqual([]);
  });
});
