// Giữ số FOC OP vừa gõ trong lúc ô FOC đang lưu (focDangLuuRef + lib/nh-foc-dong-bo.ts):
// một bản tải về từ TRƯỚC lúc lưu không được kéo bảng làm việc về số cũ; lưu xong thì
// thôi giữ để FOC người khác sửa về sau vẫn vào được. useNHSection + NHRow thật.
import { describe, it, expect, vi, afterEach } from "vitest";
import { waitFor, act, cleanup } from "@testing-library/react";

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
  DOAN, seed, makeQc, mount, db, hookDbRow, stateRow, goFoc, opSuaFoc, opSuaGia, sleep, clearLatest,
} from "@/test/nh-section-harness";

afterEach(() => { cleanup(); clearLatest(); });

describe("giữ FOC đang lưu trước bản tải cũ", () => {
  it("bản tải CŨ về giữa lúc ô FOC đang ghi → bảng làm việc vẫn giữ số vừa gõ", async () => {
    seed({ isOverridden: true });
    const qc = makeQc();
    const { container } = await mount(qc);
    world.netDelayMs = 200; // bản tải lại (200ms) về TRƯỚC khi lệnh ghi FOC xong (select 200 + update 200)
    void qc.invalidateQueries({ queryKey: ["doan_chi_phi", DOAN] });
    goFoc(container, 0, 16);
    await act(async () => { await sleep(300); });
    expect(db().foc_khach_snapshot).toBeNull(); // lệnh ghi FOC chưa xong
    expect(hookDbRow().foc_khach_snapshot).toBeNull(); // bản tải cũ đã về
    expect(stateRow().foc_khach_snapshot).toBe(16);
    const p = await opSuaGia(container, 350000);
    expect(p.foc_khach_snapshot).toBe(16);
  });

  it("lưu FOC xong + đã tải lại → máy khác đổi FOC → bảng làm việc theo DB (hết giữ)", async () => {
    seed({ isOverridden: true });
    const qc = makeQc();
    const { container } = await mount(qc);
    await opSuaFoc(container, 16, 1);
    Object.assign(world.chiPhi[0], { foc_khach_snapshot: 20, foc_mien_snapshot: 2 });
    await act(async () => { await qc.invalidateQueries({ queryKey: ["doan_chi_phi", DOAN] }); });
    await waitFor(() => expect(stateRow().foc_khach_snapshot).toBe(20));
  });

  it("máy khác đổi FOC ngay sau lúc lưu, bản tải đầu tiên đã khác → theo DB (hết giữ nhờ mốc lưu xong)", async () => {
    seed({ isOverridden: true });
    const { container } = await mount(makeQc());
    world.listDelayMs = 300;
    goFoc(container, 0, 16);
    await waitFor(() => expect(db().foc_khach_snapshot).toBe(16)); // ghi xong, tải lại đang chạy
    Object.assign(world.chiPhi[0], { foc_khach_snapshot: 20, foc_mien_snapshot: 2 }); // máy khác
    await waitFor(() => expect(hookDbRow().foc_khach_snapshot).toBe(20), { timeout: 3000 });
    await act(async () => { await sleep(30); });
    expect(stateRow().foc_khach_snapshot).toBe(20);
  });
});
