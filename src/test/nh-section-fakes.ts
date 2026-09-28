// "Database" trong bộ nhớ + hook giả cho test chạy useNHSection / NHFocEditor THẬT.
// Truy vấn / mutation vẫn đi qua React Query THẬT nên invalidate + tải lại có đúng nhịp
// như app (staleTime 30s như App.tsx). Chỉ giả những gì section Nhà hàng đụng tới.
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { CHI_PHI_MUTATION_KEY } from "@/lib/chi-phi-writes";

type Row = Record<string, unknown>;

export const world = {
  chiPhi: [] as Row[],
  nhSection: { meals: [] as Row[], nhaHangMap: {} as Record<number, Row> },
  /** payload gửi vào useUpsertChiPhi().mutate, theo thứ tự */
  upserts: [] as Row[],
  /** nhật ký (useAuditLogger) */
  logs: [] as string[],
  toasts: [] as string[],
  /** độ trễ mạng giả mỗi lượt gọi */
  netDelayMs: 5,
  /** trễ thêm cho lượt tải LẠI danh sách chi phí (ca đua) */
  listDelayMs: 0,
  /** lệnh update doan_chi_phi của ô FOC trả lỗi */
  failUpdate: false,
};

export function resetWorld() {
  world.chiPhi = [];
  world.nhSection = { meals: [], nhaHangMap: {} };
  world.upserts = [];
  world.logs = [];
  world.toasts = [];
  world.netDelayMs = 5;
  world.listDelayMs = 0;
  world.failUpdate = false;
}

const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x));
const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

type KetQua = { data: unknown; error: { message: string } | null };

// ── externalSupabase giả (chỉ phần NHFocEditor dùng trên doan_chi_phi) ──────────
class Builder implements PromiseLike<KetQua> {
  private op: "select" | "update" = "select";
  private payload: Row | null = null;
  private filters: [string, unknown][] = [];
  private cols: string[] | null = null;
  constructor(private table: string) {}
  // Trả ĐÚNG các cột được hỏi, như PostgREST — thiếu cột trong select là lộ ngay.
  select(c?: string) {
    if (c && c.trim() !== "*") this.cols = c.split(",").map((x) => x.trim());
    return this;
  }
  update(p: Row) { this.op = "update"; this.payload = p; return this; }
  eq(c: string, v: unknown) { this.filters.push([c, v]); return this; }
  private async exec(): Promise<{ data: Row[]; error: { message: string } | null }> {
    await delay(world.netDelayMs);
    if (this.table !== "doan_chi_phi") return { data: [], error: null };
    if (this.op === "update" && world.failUpdate) return { data: [], error: { message: "mất kết nối" } };
    const rows = world.chiPhi.filter((r) => this.filters.every(([c, v]) => r[c] === v));
    if (this.op === "update" && this.payload) for (const r of rows) Object.assign(r, clone(this.payload));
    const out = rows.map(clone);
    const cols = this.cols;
    if (this.op === "select" && cols) {
      return { data: out.map((r) => Object.fromEntries(cols.filter((k) => k in r).map((k) => [k, r[k]]))), error: null };
    }
    return { data: out, error: null };
  }
  maybeSingle(): Promise<KetQua> { return this.exec().then(({ data, error }) => ({ data: data[0] ?? null, error })); }
  then<A = KetQua, B = never>(
    res?: ((v: KetQua) => A | PromiseLike<A>) | null,
    rej?: ((e: unknown) => B | PromiseLike<B>) | null,
  ): PromiseLike<A | B> {
    return this.exec().then(res, rej);
  }
}
export const fakeSupabase = { from: (table: string) => new Builder(table) };

// ── @/hooks/use-chi-phi ─────────────────────────────────────────────────────────
const EMPTY: never[] = [];
const stubMut = { mutate: () => {}, mutateAsync: async () => ({}), isPending: false };

export function useChiPhiList(doanId?: number, doanNhomId?: number | null) {
  return useQuery({
    queryKey: ["doan_chi_phi", doanId, doanNhomId ?? null],
    enabled: !!doanId,
    queryFn: async () => {
      await delay(world.netDelayMs + world.listDelayMs);
      return world.chiPhi.map(clone);
    },
  });
}

export function useUpsertChiPhi() {
  const qc = useQueryClient();
  return useMutation({
    mutationKey: CHI_PHI_MUTATION_KEY,
    mutationFn: async (payload: Row & { doan_id: number }) => {
      world.upserts.push(clone(payload));
      await delay(world.netDelayMs);
      const { thanh_tien: _bo, ...sach } = payload;
      void _bo;
      if (sach.id != null) {
        const r = world.chiPhi.find((x) => x.id === sach.id);
        if (r) Object.assign(r, clone(sach));
        return { id: sach.id as number, old: null };
      }
      const id = 9000 + world.chiPhi.length;
      world.chiPhi.push({ ...clone(sach), id });
      return { id, old: null };
    },
    onSuccess: (_d, variables) => {
      qc.invalidateQueries({ queryKey: ["doan_chi_phi", variables.doan_id] });
    },
  });
}
export const useDeleteChiPhi = () => stubMut;
export const useDNTTList = () => ({ data: EMPTY });
export const useInsertDNTT = () => stubMut;
export const useUpdateChiPhiHoaDon = () => stubMut;

// ── @/hooks/use-chi-phi-nh ──────────────────────────────────────────────────────
export function useChiPhiNHSection(doanId?: number, doanNhomId?: number | null) {
  return useQuery({
    queryKey: ["chi_phi_nh_section", doanId, doanNhomId ?? null],
    enabled: !!doanId,
    queryFn: async () => {
      await delay(world.netDelayMs);
      return clone(world.nhSection);
    },
  });
}

// ── hook lặt vặt ────────────────────────────────────────────────────────────────
const ghiLog = (v: { mo_ta: string }) => { world.logs.push(v.mo_ta); };
export const useAuditLogger = () => ghiLog;
export const useCancelDNTT = () => stubMut;
export const useUpdateDNTT = () => stubMut;
export const recalcChiPhiStatus = async () => {};
export const usePaymentsByChiPhi = () => ({ data: EMPTY });
export const createCanTruPayments = async () => {};
export const useCongNoList = () => ({ data: EMPTY });
export const isDnttPaidFromPrepaid = () => false;
export const useRedemptionsByDoan = () => ({ data: EMPTY });
export const useRedeemVoucher = () => stubMut;
export const useUndoRedemption = () => stubMut;
export const useUpdateRedemption = () => stubMut;
export const useVoucherStockByIds = () => ({ data: EMPTY });
const tenNguoiDung = { data: "tester" };
export const useCurrentUserName = () => tenNguoiDung;

const ghiToast = (loai: string) => (m: unknown) => { world.toasts.push(`${loai}: ${String(m)}`); };
export const toast = Object.assign(ghiToast("toast"), {
  success: ghiToast("success"), error: ghiToast("error"), warning: ghiToast("warning"),
  info: ghiToast("info"), message: ghiToast("message"), dismiss: () => {},
});
