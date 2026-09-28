// Khung test tab Chi phí Nhà hàng: useNHSection THẬT + NHRow THẬT (ô FOC, số khách,
// đơn giá y như app), database / mạng giả ở ./nh-section-fakes. File test phải tự
// vi.mock các module (xem use-nh-section.foc.test.tsx) — vi.mock chỉ có hiệu lực khi
// gọi trong chính file test.
import { expect } from "vitest";
import { render, fireEvent, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { world, resetWorld } from "./nh-section-fakes";
import NhSectionHarness from "./NhSectionHarness";
import { sec } from "./nh-section-store";
import { nhMainMoTa } from "@/lib/nh-chi-phi-resolve";

export { sec, clearLatest } from "./nh-section-store";

export const DOAN = 700;
const NGAY = 11;
const NH_ID = 5;
export const ROW_ID = 501;
const KEY = `${NGAY}_trua`;
const NH_TEN = "NH TEST";
export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export interface Seed {
  isOverridden: boolean;
  focK?: number | null;
  focM?: number | null;
  masterK?: number | null;
  masterM?: number | null;
}

export function seed(s: Seed) {
  resetWorld();
  world.nhSection = {
    meals: [{ doan_ngay_id: NGAY, ngay_so: 1, ngay_date: "2026-10-05", bua_an: "trua", nha_hang_id: NH_ID, set_menu_id: 3, gia_set_menu: 300000 }],
    nhaHangMap: {
      [NH_ID]: {
        id: NH_ID, ten: NH_TEN, dia_chi: null, thong_tin_chung: null,
        foc_khach: s.masterK ?? null, foc_mien: s.masterM ?? null,
        chiet_khau_phan_tram: null, nguoi_thanh_toan: "cong_ty", tai_khoan_thanh_toan: null,
        nha_cung_cap_id: 9, ten_ncc: "NCC", ncc_so_tai_khoan: null, ncc_ngan_hang: null,
        tinh_suat_tl: null, thanh_toan_dinh_ky_mac_dinh: null,
      },
    },
  };
  world.chiPhi = [{
    id: ROW_ID, doan_id: DOAN, ngay_so: 1, loai: "chi", danh_muc: "nha_hang",
    ref_doan_ngay_id: NGAY, ref_doan_ngay_item_id: null, mo_ta: nhMainMoTa(NH_TEN, "trua"),
    don_gia: 300000, so_luong: 20, tien_cong_ty: 6000000, tien_hdv: 0,
    foc_khach_snapshot: s.focK ?? null, foc_mien_snapshot: s.focM ?? null,
    chiet_khau_phan_tram_snapshot: null, is_overridden: s.isOverridden,
    thanh_tien_thuc_te: null, trang_thai_thanh_toan: "unpaid", thanh_toan_dinh_ky: false,
    nha_cung_cap_id: 9, so_tien_da_dntt: 0, so_tien_da_tt: 0, trang_thai_hoa_don: null, created_at: "2026-09-01",
  }];
}

/** Cùng mặc định như src/App.tsx (tắt retry cho tất định). */
export const makeQc = () => new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, gcTime: 300_000, refetchOnWindowFocus: false, retry: false } },
});

export async function mount(qc: QueryClient) {
  const utils = render(<QueryClientProvider client={qc}><NhSectionHarness doanId={DOAN} /></QueryClientProvider>);
  await waitFor(() => {
    expect(sec().isLoading).toBe(false);
    expect(sec().nhRowData.localRows[KEY]?.id).toBe(ROW_ID);
  });
  await act(async () => { await sleep(60); }); // để init / auto-fix chạy xong
  return utils;
}

export const db = () => world.chiPhi[0];
export const hookDbRow = () => sec().nhRowData.chiPhiRows.find((c) => c.id === ROW_ID)!;
export const stateRow = () => sec().nhRowData.localRows[KEY];
/** 2 ô FOC (khách, miễn) — input số có placeholder "—" của NHFocEditor. */
export const focInputs = (c: HTMLElement) =>
  Array.from(c.querySelectorAll('input[type="number"][placeholder="—"]')) as HTMLInputElement[];
export const priceInput = (c: HTMLElement) => c.querySelector('input[class*="w-[112px]"]') as HTMLInputElement;
export const soKhachInput = (c: HTMLElement) => c.querySelector('input[class*="w-[56px]"]') as HTMLInputElement;

/** OP gõ một ô FOC rồi rời ô — NHFocEditor.save() thật. */
export function goFoc(c: HTMLElement, o: 0 | 1, v: number | string) {
  const inp = focInputs(c)[o];
  fireEvent.change(inp, { target: { value: String(v) } });
  fireEvent.blur(inp);
}

/** OP gõ ô FOC khách rồi ô miễn, rời từng ô. */
export async function opSuaFoc(c: HTMLElement, k: number, m: number, choTaiLai = true) {
  goFoc(c, 0, k);
  await waitFor(() => expect(db().foc_khach_snapshot).toBe(k));
  if (choTaiLai) await waitFor(() => expect(hookDbRow().foc_khach_snapshot).toBe(k));
  goFoc(c, 1, m);
  await waitFor(() => expect(db().foc_mien_snapshot).toBe(m));
  if (choTaiLai) {
    await waitFor(() => expect(hookDbRow().foc_mien_snapshot).toBe(m));
    await act(async () => { await sleep(30); });
  }
}

/** OP sửa ô đơn giá (DecimalInput): focus → gõ → rời ô → onChange + setTimeout(handleSave). */
export async function opSuaGia(c: HTMLElement, gia: number | null) {
  const truoc = world.upserts.length;
  const inp = priceInput(c);
  fireEvent.focus(inp);
  if (gia != null) fireEvent.change(inp, { target: { value: String(gia) } });
  fireEvent.blur(inp);
  await waitFor(() => expect(world.upserts.length).toBe(truoc + 1));
  const payload = world.upserts[truoc];
  await waitFor(() => expect(hookDbRow().don_gia).toBe(payload.don_gia), { timeout: 3000 });
  await act(async () => { await sleep(30); });
  return payload;
}
