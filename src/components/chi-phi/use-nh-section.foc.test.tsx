// HỒI QUY 28/09: "Ghi FOC 16免1 cho dòng NH rồi sửa đơn giá → FOC trở về 0-0".
// Chạy useNHSection THẬT + NHRow THẬT (ô FOC, số khách, đơn giá), database / mạng giả —
// khung ở src/test/nh-section-harness.tsx.
import { describe, it, expect, vi, afterEach } from "vitest";
import { fireEvent, waitFor, act, cleanup } from "@testing-library/react";
import { CHI_PHI_MUTATION_KEY } from "@/lib/chi-phi-writes";

vi.mock("@/lib/supabase-external", async () => ({ externalSupabase: (await import("@/test/nh-section-fakes")).fakeSupabase }));
vi.mock("sonner", async () => ({ toast: (await import("@/test/nh-section-fakes")).toast }));
vi.mock("@/hooks/use-chi-phi", async () => {
  const f = await import("@/test/nh-section-fakes");
  return {
    useChiPhiList: f.useChiPhiList, useUpsertChiPhi: f.useUpsertChiPhi, useDeleteChiPhi: f.useDeleteChiPhi,
    useDNTTList: f.useDNTTList, useInsertDNTT: f.useInsertDNTT, useUpdateChiPhiHoaDon: f.useUpdateChiPhiHoaDon,
  };
});
vi.mock("@/hooks/use-chi-phi-nh", async () => ({ useChiPhiNHSection: (await import("@/test/nh-section-fakes")).useChiPhiNHSection }));
vi.mock("@/hooks/use-activity-log", async () => ({ useAuditLogger: (await import("@/test/nh-section-fakes")).useAuditLogger }));
vi.mock("@/hooks/use-dntt", async () => {
  const f = await import("@/test/nh-section-fakes");
  return { useCancelDNTT: f.useCancelDNTT, useUpdateDNTT: f.useUpdateDNTT, recalcChiPhiStatus: f.recalcChiPhiStatus };
});
vi.mock("@/hooks/use-payments", async () => {
  const f = await import("@/test/nh-section-fakes");
  return { usePaymentsByChiPhi: f.usePaymentsByChiPhi, createCanTruPayments: f.createCanTruPayments };
});
vi.mock("@/hooks/use-cong-no", async () => {
  const f = await import("@/test/nh-section-fakes");
  return { useCongNoList: f.useCongNoList, isDnttPaidFromPrepaid: f.isDnttPaidFromPrepaid };
});
vi.mock("@/hooks/use-voucher", async () => {
  const f = await import("@/test/nh-section-fakes");
  return {
    useRedemptionsByDoan: f.useRedemptionsByDoan, useRedeemVoucher: f.useRedeemVoucher,
    useUndoRedemption: f.useUndoRedemption, useUpdateRedemption: f.useUpdateRedemption,
    useVoucherStockByIds: f.useVoucherStockByIds,
  };
});
vi.mock("@/hooks/use-doan", async () => ({ useCurrentUserName: (await import("@/test/nh-section-fakes")).useCurrentUserName }));

import { world } from "@/test/nh-section-fakes";
import {
  DOAN, seed, makeQc, mount, db, hookDbRow, stateRow, focInputs, soKhachInput,
  goFoc, opSuaFoc, opSuaGia, sleep, clearLatest,
} from "@/test/nh-section-harness";

afterEach(() => { cleanup(); clearLatest(); });

const focPayload = (p: Record<string, unknown>) => [p.foc_khach_snapshot, p.foc_mien_snapshot];

describe("FOC Nhà hàng không bị lần lưu dòng ghi đè về số cũ (useNHSection + NHRow thật)", () => {
  it("dòng 🔒, FOC trống → gõ 16免1 → sửa giá: giữ 16免1, tiền trừ 1 suất", async () => {
    seed({ isOverridden: true });
    const { container } = await mount(makeQc());
    await opSuaFoc(container, 16, 1);
    expect(db().tien_cong_ty).toBe(19 * 300000);
    // Bảng làm việc (nguồn của Tạo ĐNTT / xem trước ĐNTT) cũng đã nhận FOC mới.
    expect([stateRow().foc_khach_snapshot, stateRow().foc_mien_snapshot]).toEqual([16, 1]);
    const p = await opSuaGia(container, 350000);
    expect(focPayload(p)).toEqual([16, 1]);
    expect(p.tien_cong_ty).toBe(19 * 350000);
    expect(db().foc_khach_snapshot).toBe(16);
  });

  it("dòng 🔒 → gõ FOC → chỉ bấm vào ô giá rồi rời ra: không ghi FOC cũ", async () => {
    seed({ isOverridden: true });
    const { container } = await mount(makeQc());
    await opSuaFoc(container, 16, 1);
    const p = await opSuaGia(container, null);
    expect(focPayload(p)).toEqual([16, 1]);
    expect(p.tien_cong_ty).toBe(19 * 300000);
  });

  it("dòng 🔒, FOC đang 0/0 → gõ 16免1 → sửa giá: giữ 16免1", async () => {
    seed({ isOverridden: true, focK: 0, focM: 0 });
    const { container } = await mount(makeQc());
    await opSuaFoc(container, 16, 1);
    const p = await opSuaGia(container, 350000);
    expect(focPayload(p)).toEqual([16, 1]);
    expect(p.tien_cong_ty).toBe(19 * 350000);
  });

  it("danh mục có FOC 10免1 → OP gõ 16免1 → sửa giá: giữ số OP gõ, không về số danh mục", async () => {
    seed({ isOverridden: true, masterK: 10, masterM: 1 });
    const { container } = await mount(makeQc());
    await opSuaFoc(container, 16, 1);
    const p = await opSuaGia(container, 350000);
    expect(focPayload(p)).toEqual([16, 1]);
    expect(p.tien_cong_ty).toBe(19 * 350000);
  });

  it("dòng chưa 🔒: lần đầu giữ FOC; vòng 2 cùng lượt mở (dòng đã 🔒) cũng giữ FOC mới", async () => {
    seed({ isOverridden: false });
    const { container } = await mount(makeQc());
    await opSuaFoc(container, 16, 1);
    const p = await opSuaGia(container, 350000);
    expect(focPayload(p)).toEqual([16, 1]);
    expect(p.tien_cong_ty).toBe(19 * 350000);

    await opSuaFoc(container, 20, 2);
    const p2 = await opSuaGia(container, 360000);
    expect(focPayload(p2)).toEqual([20, 2]);
    expect(p2.tien_cong_ty).toBe(18 * 360000);
  });

  it("dòng chưa 🔒 nhưng đã rời ô số khách trước đó (thành 🔒) → vẫn giữ FOC mới", async () => {
    seed({ isOverridden: false });
    const { container } = await mount(makeQc());
    const sk = soKhachInput(container);
    fireEvent.focus(sk);
    fireEvent.blur(sk);
    await waitFor(() => expect(world.upserts.length).toBe(1));
    await waitFor(() => expect(hookDbRow().is_overridden).toBe(true));
    await act(async () => { await sleep(30); });
    await opSuaFoc(container, 16, 1);
    const p = await opSuaGia(container, 350000);
    expect(focPayload(p)).toEqual([16, 1]);
    expect(p.tien_cong_ty).toBe(19 * 350000);
  });

  it("ĐUA: sửa giá TRƯỚC khi bản tải lại sau lúc lưu FOC kịp về → vẫn giữ 16免1, màn hình hiện ngay", async () => {
    seed({ isOverridden: true });
    const { container } = await mount(makeQc());
    world.listDelayMs = 400; // tải lại danh sách chi phí chậm; lệnh ghi vẫn nhanh
    await opSuaFoc(container, 16, 1, false);
    expect(hookDbRow().foc_khach_snapshot).toBeNull(); // bản tải lại chưa về
    // Dòng NH (số vé cho "Dùng voucher", Thành tiền) đọc FOC từ bảng làm việc, không chờ cache.
    expect(container.textContent).toContain("(FOC -1)");
    const p = await opSuaGia(container, 350000);
    expect(focPayload(p)).toEqual([16, 1]);
    expect(p.tien_cong_ty).toBe(19 * 350000);
    await waitFor(() => expect(hookDbRow().foc_mien_snapshot).toBe(1), { timeout: 3000 });
    expect(db().foc_khach_snapshot).toBe(16);
  });

  it("gõ FOC rồi sửa ngược ngay trước khi bản tải lại về → lấy số sửa ngược", async () => {
    seed({ isOverridden: true, focK: 10, focM: 1 });
    const { container } = await mount(makeQc());
    world.listDelayMs = 400;
    goFoc(container, 0, 16);
    await waitFor(() => expect(db().foc_khach_snapshot).toBe(16));
    goFoc(container, 0, 10);
    await waitFor(() => expect(db().foc_khach_snapshot).toBe(10));
    await waitFor(() => expect(hookDbRow().foc_khach_snapshot).toBe(10), { timeout: 3000 });
    await act(async () => { await sleep(30); });
    expect([stateRow().foc_khach_snapshot, stateRow().foc_mien_snapshot]).toEqual([10, 1]);
    expect(focInputs(container)[0].value).toBe("10");
    expect(db().tien_cong_ty).toBe(18 * 300000);
  });

  it("máy khác sửa FOC dòng 🔒 (realtime tải lại) → sửa giá theo FOC mới trong DB", async () => {
    seed({ isOverridden: true });
    const qc = makeQc();
    const { container } = await mount(qc);
    Object.assign(world.chiPhi[0], { foc_khach_snapshot: 16, foc_mien_snapshot: 1, tien_cong_ty: 19 * 300000 });
    await act(async () => { await qc.invalidateQueries({ queryKey: ["doan_chi_phi", DOAN] }); });
    await waitFor(() => expect(stateRow().foc_khach_snapshot).toBe(16));
    const p = await opSuaGia(container, 350000);
    expect(focPayload(p)).toEqual([16, 1]);
    expect(p.tien_cong_ty).toBe(19 * 350000);
  });

  it("rời tab rồi quay lại sau khi gõ FOC → vẫn đúng", async () => {
    seed({ isOverridden: true });
    const qc = makeQc();
    const lan1 = await mount(qc);
    await opSuaFoc(lan1.container, 16, 1);
    lan1.unmount();
    const { container } = await mount(qc);
    const p = await opSuaGia(container, 350000);
    expect(focPayload(p)).toEqual([16, 1]);
    expect(p.tien_cong_ty).toBe(19 * 350000);
  });

  it("ô FOC lưu lỗi → báo lỗi, ô về số cũ, bảng làm việc theo DB ngay (không ghi số chưa lưu được)", async () => {
    seed({ isOverridden: true });
    const { container } = await mount(makeQc());
    world.failUpdate = true;
    goFoc(container, 0, 16);
    await waitFor(() => expect(world.toasts.some((x) => x.startsWith("error:"))).toBe(true));
    await waitFor(() => expect(focInputs(container)[0].value).toBe(""));
    expect(stateRow().foc_khach_snapshot).toBeNull();
    expect(world.logs).toEqual([]); // không ghi nhật ký cho lượt lưu thất bại
    world.failUpdate = false;
    const p = await opSuaGia(container, 350000);
    expect(p.foc_khach_snapshot).toBeNull();
    expect(world.logs.filter((x) => x.includes("FOC"))).toEqual([]);
  });

  it("gõ FOC ghi nhật ký thay đổi với đúng số cũ (trước đây ô FOC không để lại dấu vết)", async () => {
    seed({ isOverridden: true, focK: 10, focM: 2 });
    const { container } = await mount(makeQc());
    await opSuaFoc(container, 16, 1);
    expect(world.logs.some((x) => x.includes("FOC khách: 10 → 16"))).toBe(true);
    expect(world.logs.some((x) => x.includes("FOC miễn: 2 → 1"))).toBe(true);
    expect(world.logs.every((x) => !x.includes("— →"))).toBe(true);
  });

  it("dòng HDV trả → FOC tính lại vào tiền HDV, không sang tiền công ty", async () => {
    seed({ isOverridden: true });
    Object.assign(world.chiPhi[0], { tien_cong_ty: 0, tien_hdv: 6000000 });
    const { container } = await mount(makeQc());
    await opSuaFoc(container, 16, 1);
    expect(db().tien_hdv).toBe(19 * 300000);
    expect(db().tien_cong_ty).toBe(0);
  });

  it("lượt ghi FOC mang khóa ghi chi phí chung → bản in / xuất Excel chờ nó", async () => {
    seed({ isOverridden: true });
    const qc = makeQc();
    const { container } = await mount(qc);
    goFoc(container, 0, 16);
    expect(qc.isMutating({ mutationKey: CHI_PHI_MUTATION_KEY })).toBe(1);
    await waitFor(() => expect(qc.isMutating({ mutationKey: CHI_PHI_MUTATION_KEY })).toBe(0));
    expect(db().foc_khach_snapshot).toBe(16);
  });
});
