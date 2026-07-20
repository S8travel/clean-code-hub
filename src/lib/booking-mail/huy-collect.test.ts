import { describe, it, expect } from "vitest";
import {
  collectHuyItems, buildHuyDraft, type HuyCollectInput, type HuyCollectCtx, type HuyItem,
} from "./huy-collect";

const empty: HuyCollectInput = { ks: [], nhDays: [], dv: [], tau: [], xe: [], visa: [] };
const ctx: HuyCollectCtx = { tenDoan: "S8DAD5D260801-XX", soKhach: 20, ngayDi: "2026-08-01", lyDo: "Đoàn hủy" };

const byKind = (items: HuyItem[]) => items.map((i) => i.kind);

describe("KS", () => {
  const ks = (over = {}) => ({
    id: 1, ks_dat_truoc_status: "da_gui", ks_final_status: "chua_gui",
    khach_san_ten: "KS Demo", khach_san_email: "ks@a.com", email_subject: "[S8 Travel] Đặt phòng – X", ngay_dates: ["2026-08-02"],
    ...over,
  });

  it("đã gửi & chưa hủy → vào danh sách, là blocker, giữ subject gốc", () => {
    const items = collectHuyItems({ ...empty, ks: [ks()] }, ctx);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ kind: "ks", bookingIds: [1], nccTen: "KS Demo", isBlocker: true, originalSubject: "[S8 Travel] Đặt phòng – X" });
    expect(items[0].skipReason).toBeUndefined();
  });

  it("chưa gửi (chua_gui) → bỏ qua", () => {
    expect(collectHuyItems({ ...empty, ks: [ks({ ks_dat_truoc_status: "chua_gui", ks_final_status: "chua_gui" })] }, ctx)).toHaveLength(0);
  });

  it("đã hủy (ks_final_status huy) → bỏ qua", () => {
    expect(collectHuyItems({ ...empty, ks: [ks({ ks_final_status: "cho_ks_xac_nhan_huy" })] }, ctx)).toHaveLength(0);
  });

  it("thiếu email → vẫn hiện nhưng có skipReason", () => {
    const items = collectHuyItems({ ...empty, ks: [ks({ khach_san_email: null })] }, ctx);
    expect(items[0].skipReason).toBe("Thiếu email NCC");
  });
});

describe("NH slot + orphan", () => {
  const day = (over = {}) => ({
    doan_ngay_id: 10, ngay_date: "2026-08-02",
    booking_trua: { id: 100, booking_status: "da_gui", email_subject: "S" },
    booking_toi: null,
    an_trua_nha_hang_ten: "NH Bé Mặn", an_trua_nha_hang_email: "nh@a.com", an_trua_nha_hang_loai: "nha_hang",
    an_toi_nha_hang_ten: null, an_toi_nha_hang_email: null, an_toi_nha_hang_loai: null,
    orphan_trua: null, orphan_toi: null,
    ...over,
  });

  it("slot da_gui nhà hàng thường → blocker", () => {
    const items = collectHuyItems({ ...empty, nhDays: [day()] }, ctx);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ kind: "nh", bookingIds: [100], nccTen: "NH Bé Mặn", isBlocker: true });
  });

  it("slot là tàu (loai tau_ngay) → KHÔNG gom ở nhánh NH", () => {
    const items = collectHuyItems({ ...empty, nhDays: [day({ an_trua_nha_hang_loai: "tau_ngay" })] }, ctx);
    expect(items).toHaveLength(0);
  });

  it("slot chua_gui/da_huy → bỏ qua", () => {
    expect(collectHuyItems({ ...empty, nhDays: [day({ booking_trua: { id: 100, booking_status: "da_huy", email_subject: null } })] }, ctx)).toHaveLength(0);
  });

  // Orphan là blocker (fetchCancelBlockers đếm mọi da_gui) — collect PHẢI bắt.
  it("orphan_trua da_gui → vào danh sách (không bỏ sót blocker)", () => {
    const items = collectHuyItems({ ...empty, nhDays: [day({
      booking_trua: null,
      orphan_trua: { booking: { id: 900, booking_status: "da_gui", email_subject: "O" }, nha_hang_ten: "NH cũ", nha_hang_email: "old@a.com" },
    })] }, ctx);
    expect(items.map((i) => i.bookingIds[0])).toContain(900);
  });
});

describe("Tàu", () => {
  const tau = (over = {}) => ({
    booking_id: 200, ngay_date: "2026-08-02", ngay_so: 2, bua_an: "trua" as const,
    nha_hang_ten: "Du thuyền Paradise", nha_hang_email: "tau@a.com", email_subject: null,
    dat_truoc_status: "cho_xac_nhan", final_status: "chua_gui", ...over,
  });

  it("đã gửi (dat_truoc) & chưa hủy → blocker, truyền soKhach từ ctx", () => {
    const items = collectHuyItems({ ...empty, tau: [tau()] }, ctx);
    expect(items).toHaveLength(1);
    expect(items[0].kind).toBe("tau");
    const draft = buildHuyDraft(items[0], { name: "A", phone: null });
    expect(draft.subject).toContain("20 khách"); // soKhach từ ctx
  });

  it("final đã hủy → bỏ qua", () => {
    expect(collectHuyItems({ ...empty, tau: [tau({ final_status: "xac_nhan_huy" })] }, ctx)).toHaveLength(0);
  });

  it("chưa có booking_id → bỏ qua", () => {
    expect(collectHuyItems({ ...empty, tau: [tau({ booking_id: null })] }, ctx)).toHaveLength(0);
  });
});

describe("DV gom nhóm theo email", () => {
  const dv = (id: number, email: string | null, status = "cho_xac_nhan") => ({
    id, ten_nha_cung_cap: `NCC ${id}`, email_nha_cung_cap: email,
    dich_vu_list: [{ ten_dv: `DV${id}`, ngay_date: "2026-08-02", so_khach: 20 }],
    booking_status: status, email_subject: null,
  });

  it("nhiều row cùng email → 1 item, gộp bookingIds + dịch vụ", () => {
    const items = collectHuyItems({ ...empty, dv: [dv(1, "x@a.com"), dv(2, "X@A.com")] }, ctx);
    expect(items).toHaveLength(1);
    expect(items[0].bookingIds.sort()).toEqual([1, 2]);
    const draft = buildHuyDraft(items[0], { name: "A", phone: null });
    expect(draft.html).toContain("DV1");
    expect(draft.html).toContain("DV2");
  });

  it("email khác nhau → item riêng", () => {
    const items = collectHuyItems({ ...empty, dv: [dv(1, "a@a.com"), dv(2, "b@b.com")] }, ctx);
    expect(items).toHaveLength(2);
  });

  it("thiếu email → mỗi row 1 item + skipReason", () => {
    const items = collectHuyItems({ ...empty, dv: [dv(1, null), dv(2, "")] }, ctx);
    expect(items).toHaveLength(2);
    expect(items.every((i) => i.skipReason === "Thiếu email NCC")).toBe(true);
  });

  it("da_huy → bỏ qua", () => {
    expect(collectHuyItems({ ...empty, dv: [dv(1, "a@a.com", "da_huy")] }, ctx)).toHaveLength(0);
  });
});

describe("Xe/Visa — thông báo, KHÔNG chặn", () => {
  it("xe đã gửi → item isBlocker=false", () => {
    const items = collectHuyItems({ ...empty, xe: [{ id: 5, booking_status: "da_xac_nhan", tenNhaXe: "Phương Trang", email: "xe@a.com", tenXe: "45c", soCho: 45 }] }, ctx);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ kind: "xe", isBlocker: false });
  });

  it("visa đã gửi → item isBlocker=false, subject dựng lại (null gốc)", () => {
    const items = collectHuyItems({ ...empty, visa: [{ id: 6, booking_status: "cho_xac_nhan", tenDonVi: "Visa ABC", email: "v@a.com" }] }, ctx);
    expect(items[0]).toMatchObject({ kind: "visa", isBlocker: false, originalSubject: null });
    const draft = buildHuyDraft(items[0], { name: "A", phone: null });
    expect(draft.subject).toContain("Xin visa");
  });

  it("xe chua_dat → bỏ qua", () => {
    expect(collectHuyItems({ ...empty, xe: [{ id: 5, booking_status: "chua_dat", tenNhaXe: "X", email: "x@a.com", tenXe: null, soCho: null }] }, ctx)).toHaveLength(0);
  });
});

describe("gom hỗn hợp", () => {
  it("đủ 6 kênh → đúng thứ tự ks→nh→tau→dv→xe→visa, blocker đúng", () => {
    const items = collectHuyItems({
      ks: [{ id: 1, ks_dat_truoc_status: "da_gui", ks_final_status: "chua_gui", khach_san_ten: "KS", khach_san_email: "k@a.com", email_subject: null, ngay_dates: ["2026-08-02"] }],
      nhDays: [{ doan_ngay_id: 10, ngay_date: "2026-08-02", booking_trua: { id: 100, booking_status: "da_gui", email_subject: null }, booking_toi: null,
        an_trua_nha_hang_ten: "NH", an_trua_nha_hang_email: "n@a.com", an_trua_nha_hang_loai: "nha_hang",
        an_toi_nha_hang_ten: null, an_toi_nha_hang_email: null, an_toi_nha_hang_loai: null, orphan_trua: null, orphan_toi: null }],
      tau: [{ booking_id: 200, ngay_date: "2026-08-02", ngay_so: 2, bua_an: "trua", nha_hang_ten: "Tàu", nha_hang_email: "t@a.com", email_subject: null, dat_truoc_status: "cho_xac_nhan", final_status: "chua_gui" }],
      dv: [{ id: 300, ten_nha_cung_cap: "DV", email_nha_cung_cap: "d@a.com", dich_vu_list: [], booking_status: "cho_xac_nhan", email_subject: null }],
      xe: [{ id: 400, booking_status: "da_xac_nhan", tenNhaXe: "Xe", email: "x@a.com", tenXe: null, soCho: 45 }],
      visa: [{ id: 500, booking_status: "cho_xac_nhan", tenDonVi: "Visa", email: "v@a.com" }],
    }, ctx);
    expect(byKind(items)).toEqual(["ks", "nh", "tau", "dv", "xe", "visa"]);
    expect(items.filter((i) => i.isBlocker).map((i) => i.kind)).toEqual(["ks", "nh", "tau", "dv"]);
  });

  it("rỗng hoàn toàn → []", () => {
    expect(collectHuyItems(empty, ctx)).toEqual([]);
  });
});
