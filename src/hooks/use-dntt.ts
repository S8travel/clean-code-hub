import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { externalSupabase } from "@/lib/supabase-external";
import { proRataInts } from "@/lib/pro-rata";
import { useAuth } from "@/hooks/use-auth";
import { isDnttPaidFromPrepaid } from "@/hooks/use-cong-no";
import type { Tables, TablesUpdate } from "@/lib/database.types";

export interface DNTTRow {
  id: number;
  doan_id: number | null;
  loai: string;
  mo_ta: string | null;
  nha_cung_cap_id: number | null;
  ten_nha_cung_cap: string | null;
  so_tai_khoan: string | null;
  ngan_hang: string | null;
  so_tien: number;
  trang_thai_duyet: "cho_duyet" | "da_duyet" | "tu_choi" | "da_huy" | string;
  la_coc: boolean | null;
  ty_le_coc: number | null;
  tao_boi: string | null;
  tao_luc: string | null;
  duyet_boi: string | null;
  duyet_luc: string | null;
  ghi_chu: string | null;
  ref_loai: string | null;
  ref_id: number | null;
  ngay_can_thanh_toan: string | null;
  hoa_don_url: string | null;
  unc_url: string | null;
  trang_thai_hoa_don: string;
  trang_thai_unc: string;
  created_at: string;
  // Derived from view
  paid_amount: number;
  payment_status: "unpaid" | "partial" | "paid";
  thanh_toan_luc: string | null;
  // 3-level approval
  tp_dh_duyet_boi: string | null;  // uuid
  tp_dh_duyet_luc: string | null;
  kttt_duyet_boi: string | null;
  kttt_duyet_luc: string | null;
  ktt_duyet_boi: string | null;
  ktt_duyet_luc: string | null;
  // Reject track (cấp nào reject, ai, khi nào)
  tu_choi_boi: string | null;
  tu_choi_luc: string | null;
  tu_choi_cap: number | null;
  // Hủy track (ai hủy, khi nào)
  huy_boi: string | null;
  huy_luc: string | null;
  // Hoàn ứng (loai='hoan_ung')
  loai_chi_hoan_ung: string | null;
  nguoi_ung_id: string | null;
  // Joined
  ten_doan?: string;
  ten_ncc?: string;
  ncc_so_tai_khoan?: string;
  ncc_ngan_hang?: string;
  tao_boi_ho_ten?: string | null;
}

export type ApprovalLevel = 1 | 2 | 3;
export const APPROVAL_LEVEL_LABEL: Record<ApprovalLevel, string> = {
  1: "Trưởng phòng Điều hành",
  2: "Kế toán Thanh toán",
  3: "Kế toán Trưởng",
};

// Có quyền duyệt cấp X không. admin/giam_doc override mọi cấp.
export function canApproveLevel(
  user: { role?: string | null; bo_phan?: string | null } | null | undefined,
  level: ApprovalLevel,
): boolean {
  if (!user) return false;
  if (user.role === "admin" || user.role === "giam_doc") return true;
  if (level === 1) return user.role === "truong_phong" && user.bo_phan === "dieu_hanh";
  if (level === 2) return user.role === "nhan_vien_cao_cap" && user.bo_phan === "ke_toan";
  if (level === 3) return user.role === "truong_phong" && user.bo_phan === "ke_toan";
  return false;
}

export interface PaymentRow {
  id: number;
  dntt_id: number;
  method: "cash" | "can_tru";
  so_tien: number;
  ngay_thanh_toan: string;
  cong_no_id: number | null;
  ghi_chu: string | null;
  tao_boi: string | null;
  tao_luc: string | null;
  created_at: string;
}

interface Filters {
  doanId?: number | null;
  fromDate?: string | null;
  toDate?: string | null;
  trangThaiDuyet?: string | null;
  paymentStatus?: "unpaid" | "partial" | "paid" | null;
  loai?: string | null;
}

// Row của dntt_with_payment_status kèm join doan + nha_cung_cap (useDNTTList).
type DnttListJoinedRow = Tables<"dntt_with_payment_status"> & {
  doan: { ten_doan: string | null } | null;
  nha_cung_cap: { ten: string | null; so_tai_khoan: string | null; ngan_hang: string | null } | null;
};

// Helper: lấy danh sách chi_phi_id được phân bổ cho 1 DNTT
export async function getChiPhiIdsForDNTT(dnttId: number): Promise<number[]> {
  const { data } = await externalSupabase
    .from("dntt_allocations")
    .select("chi_phi_id")
    .eq("dntt_id", dnttId);
  return (data || []).map((r) => r.chi_phi_id);
}

// Helper: gọi RPC tính lại trạng thái thanh toán của các chi phí
export async function recalcChiPhiStatus(chiPhiIds: number[]): Promise<void> {
  if (chiPhiIds.length === 0) return;
  await externalSupabase.rpc("recalc_chi_phi_payment_status", {
    p_chi_phi_ids: chiPhiIds,
  });
}

// Helper: lấy paid_amount của DNTT (sum payments)
export async function getPaidAmount(dnttId: number): Promise<number> {
  const { data } = await externalSupabase
    .from("payments")
    .select("so_tien")
    .eq("dntt_id", dnttId);
  return (data || []).reduce((s, p) => s + Number(p.so_tien), 0);
}

export function useDNTTList(filters: Filters) {
  return useQuery({
    queryKey: ["dntt-list", filters],
    queryFn: async () => {
      let q = externalSupabase
        .from("dntt_with_payment_status")
        .select(`
          *,
          doan:doan_id(ten_doan),
          nha_cung_cap:nha_cung_cap_id(ten, so_tai_khoan, ngan_hang)
        `)
        // Ngày cần TT ASC (sớm nhất lên đầu), NULL xuống cuối.
        // Tiebreak created_at DESC cho cùng deadline.
        .order("ngay_can_thanh_toan", { ascending: true, nullsFirst: false })
        .order("created_at", { ascending: false });

      if (filters.doanId) q = q.eq("doan_id", filters.doanId);
      if (filters.fromDate) q = q.gte("created_at", filters.fromDate);
      if (filters.toDate) q = q.lte("created_at", filters.toDate + "T23:59:59");
      if (filters.trangThaiDuyet) q = q.eq("trang_thai_duyet", filters.trangThaiDuyet);
      if (filters.paymentStatus) q = q.eq("payment_status", filters.paymentStatus);
      if (filters.loai) q = q.eq("loai", filters.loai);

      const { data, error } = await q;
      if (error) throw error;

      const rows = (data || []) as DnttListJoinedRow[];
      // Resolve tao_boi (uuid → ho_ten) qua user_roles
      const taoBoiIds = [...new Set(rows.map((r) => r.tao_boi).filter((x): x is string => !!x))];
      const taoBoiMap = new Map<string, string>();
      if (taoBoiIds.length > 0) {
        const { data: users } = await externalSupabase
          .from("user_roles")
          .select("user_id, ho_ten")
          .in("user_id", taoBoiIds);
        (users || []).forEach((u) => {
          if (u.user_id && u.ho_ten) taoBoiMap.set(u.user_id, u.ho_ten);
        });
      }

      return rows.map((row) => ({
        ...row,
        ten_doan: row.doan?.ten_doan || "",
        ten_ncc: row.nha_cung_cap?.ten || row.ten_nha_cung_cap || "",
        ncc_so_tai_khoan: row.nha_cung_cap?.so_tai_khoan || row.so_tai_khoan || "",
        ncc_ngan_hang: row.nha_cung_cap?.ngan_hang || row.ngan_hang || "",
        tao_boi_ho_ten: row.tao_boi ? (taoBoiMap.get(row.tao_boi) ?? null) : null,
      })) as unknown as DNTTRow[];
    },
  });
}

// Mapping cấp → user_id phải duyệt (đồng bộ với trigger notify_dntt_approval_user
// trong DB). Đổi user → phải đổi cả 2 chỗ.
export const APPROVAL_NOTIFY_USER_BY_LEVEL: Record<ApprovalLevel, string> = {
  1: "882d2911-5084-479c-a452-45b226045c6e", // Võ Thị Minh Xuân
  2: "f3a0420f-84a5-41d7-b83c-4aaee353d41c", // Trần Thị Ánh Hồng
  3: "0f9c9c0f-d949-4e04-85cf-185f924afcaf", // Nguyễn Chí Linh
};

export interface DNTTApprovalItem {
  id: number;
  doan_id: number | null;
  ten_doan: string;
  mo_ta: string | null;
  so_tien: number;
  cap: ApprovalLevel;
  created_at: string;
}

// List DNTT đang chờ user hiện tại duyệt (theo mapping cấp → user).
export function useDNTTNeedingApproval(currentUserId: string | null | undefined) {
  return useQuery({
    queryKey: ["dntt-needing-approval", currentUserId],
    enabled: !!currentUserId,
    refetchInterval: 60_000,
    queryFn: async (): Promise<DNTTApprovalItem[]> => {
      const myLevels = (Object.entries(APPROVAL_NOTIFY_USER_BY_LEVEL) as [string, string][])
        .filter(([, uid]) => uid === currentUserId)
        .map(([l]) => Number(l) as ApprovalLevel);
      if (myLevels.length === 0) return [];

      const { data, error } = await externalSupabase
        .from("dntt_with_payment_status")
        .select("id, doan_id, mo_ta, so_tien, tp_dh_duyet_luc, kttt_duyet_luc, ktt_duyet_luc, created_at, doan:doan_id(ten_doan)")
        .eq("trang_thai_duyet", "cho_duyet")
        .order("created_at", { ascending: false });
      if (error) throw error;

      type ApprovalQueryRow = Pick<
        Tables<"dntt_with_payment_status">,
        "id" | "doan_id" | "mo_ta" | "so_tien" | "tp_dh_duyet_luc"
        | "kttt_duyet_luc" | "ktt_duyet_luc" | "created_at"
      > & { doan: { ten_doan: string | null } | null };

      return ((data || []) as ApprovalQueryRow[])
        .filter((d) => {
          if (myLevels.includes(1) && !d.tp_dh_duyet_luc) return true;
          if (myLevels.includes(2) && d.tp_dh_duyet_luc && !d.kttt_duyet_luc) return true;
          if (myLevels.includes(3) && d.kttt_duyet_luc && !d.ktt_duyet_luc) return true;
          return false;
        })
        .map((d): DNTTApprovalItem => ({
          id: d.id ?? 0,
          doan_id: d.doan_id,
          ten_doan: d.doan?.ten_doan ?? "—",
          mo_ta: d.mo_ta,
          so_tien: d.so_tien ?? 0,
          cap: (!d.tp_dh_duyet_luc ? 1 : !d.kttt_duyet_luc ? 2 : 3) as ApprovalLevel,
          created_at: d.created_at ?? "",
        }));
    },
  });
}

// Tổng số ĐNTT toàn DB — không phụ thuộc filter của list. Dùng cho metric cards.
export function useDNTTSummary() {
  return useQuery({
    // Prefix-share với "dntt-list" → tự động refetch khi list invalidated.
    queryKey: ["dntt-list", "summary"],
    queryFn: async () => {
      const now = new Date();
      const t0 = new Date(now); t0.setHours(0, 0, 0, 0);
      const in7 = new Date(t0); in7.setDate(in7.getDate() + 7);
      const ago7 = new Date(now); ago7.setDate(ago7.getDate() - 7);
      const ymd = (d: Date) =>
        `${d.getFullYear()}-${`${d.getMonth() + 1}`.padStart(2, "0")}-${`${d.getDate()}`.padStart(2, "0")}`;
      const t0s = ymd(t0);
      const t7s = ymd(in7);
      const ago7iso = ago7.toISOString();

      // KHÔNG tính ĐNTT đã hủy. Lấy luôn so_tien để cộng tiền (số lượng ĐNTT ít, fetch nhẹ).
      const { data, error } = await externalSupabase
        .from("de_nghi_thanh_toan")
        .select("so_tien, trang_thai_duyet, ngay_can_thanh_toan, duyet_luc")
        .neq("trang_thai_duyet", "da_huy");
      if (error) throw error;

      let total = 0, choDuyet = 0, daDuyet = 0;
      let tongTien = 0, choDuyet7dTien = 0, daDuyet7dTien = 0;
      for (const r of data ?? []) {
        const st = Number(r.so_tien) || 0;
        total++;
        tongTien += st;
        if (r.trang_thai_duyet === "cho_duyet") {
          choDuyet++;
          if (r.ngay_can_thanh_toan && r.ngay_can_thanh_toan >= t0s && r.ngay_can_thanh_toan <= t7s) {
            choDuyet7dTien += st;
          }
        } else if (r.trang_thai_duyet === "da_duyet") {
          daDuyet++;
          if (r.duyet_luc && String(r.duyet_luc) >= ago7iso) daDuyet7dTien += st;
        }
      }
      return { total, choDuyet, daDuyet, tongTien, choDuyet7dTien, daDuyet7dTien };
    },
  });
}

export function useDoanOptions() {
  return useQuery({
    queryKey: ["doan-options-dntt"],
    queryFn: async () => {
      const { data } = await externalSupabase
        .from("doan")
        .select("id, ten_doan")
        .order("created_at", { ascending: false });
      return data || [];
    },
  });
}

// Approve theo cấp (1=TP ĐH, 2=KTTT, 3=KTT). Cấp 3 → set trang_thai_duyet='da_duyet'.
// Cấp 1, 2 chỉ stamp <prefix>_duyet_boi/luc, status vẫn 'cho_duyet'.
// Sequential gate (cấp X chỉ được duyệt khi cấp X-1 đã duyệt) check ở UI.
export function useApproveDNTT() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, level, userId }: {
      id: number;
      level: ApprovalLevel;
      userId: string;
    }) => {
      const { data: dntt, error: fetchErr } = await externalSupabase
        .from("de_nghi_thanh_toan")
        .select("id, doan_id, tp_dh_duyet_luc, kttt_duyet_luc, ktt_duyet_luc")
        .eq("id", id)
        .single();
      if (fetchErr) throw fetchErr;

      // Sanity check: cấp X-1 phải đã duyệt.
      // (Cấp 1 + cấp 2 hiện auto-pass bởi DB trigger trg_auto_pass_dntt_level_1 — bỏ qua check.)

      const now = new Date().toISOString();
      const update: TablesUpdate<"de_nghi_thanh_toan"> = {};
      if (level === 1) {
        update.tp_dh_duyet_boi = userId;
        update.tp_dh_duyet_luc = now;
      } else if (level === 2) {
        update.kttt_duyet_boi = userId;
        update.kttt_duyet_luc = now;
      } else {
        update.ktt_duyet_boi = userId;
        update.ktt_duyet_luc = now;
        update.trang_thai_duyet = "da_duyet";
        update.duyet_boi = userId;
        update.duyet_luc = now;
      }

      const { error } = await externalSupabase
        .from("de_nghi_thanh_toan")
        .update(update)
        .eq("id", id);
      if (error) throw error;

      // Chỉ recalc chi phí khi cấp 3 hoàn tất (mới chính thức được tính paid_amount commitment)
      if (level === 3) {
        const chiPhiIds = await getChiPhiIdsForDNTT(id);
        await recalcChiPhiStatus(chiPhiIds);
      }
      return dntt.doan_id as number;
    },
    onSuccess: (doanId) => {
      qc.invalidateQueries({ queryKey: ["dntt-list"] });
      qc.invalidateQueries({ queryKey: ["dinh_ky_dntt_list"] });
      qc.invalidateQueries({ queryKey: ["doan_chi_phi", doanId] });
      qc.invalidateQueries({ queryKey: ["de_nghi_thanh_toan", doanId] });
    },
  });
}

// Từ chối: track ai/khi nào/cấp nào reject. Cấp đã duyệt trước đó GIỮ NGUYÊN
// để UI vẫn show "✓ Tên + thời gian" cho cấp đã pass — chỉ cấp bị reject hiện
// "✗ Từ chối + Tên + thời gian", các cấp sau hiện "—".
export function useRejectDNTT() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ghiChu, level, userId }: {
      id: number; ghiChu: string; level: ApprovalLevel; userId: string;
    }) => {
      const { data: dntt, error: fetchErr } = await externalSupabase
        .from("de_nghi_thanh_toan")
        .select("id, doan_id")
        .eq("id", id)
        .single();
      if (fetchErr) throw fetchErr;

      const { error } = await externalSupabase
        .from("de_nghi_thanh_toan")
        .update({
          trang_thai_duyet: "tu_choi",
          ghi_chu: ghiChu,
          tu_choi_boi: userId,
          tu_choi_luc: new Date().toISOString(),
          tu_choi_cap: level,
        })
        .eq("id", id);
      if (error) throw error;

      // Dọn payment 'voucher' (phần suất chính trả bằng voucher) — ĐNTT bị từ chối
      // thì khoản này không còn hiệu lực, tránh payment mồ côi.
      await externalSupabase.from("payments").delete().eq("dntt_id", id).eq("method", "voucher");

      const chiPhiIds = await getChiPhiIdsForDNTT(id);
      await recalcChiPhiStatus(chiPhiIds);
      return dntt.doan_id as number;
    },
    onSuccess: (doanId) => {
      qc.invalidateQueries({ queryKey: ["dntt-list"] });
      qc.invalidateQueries({ queryKey: ["dinh_ky_dntt_list"] });
      qc.invalidateQueries({ queryKey: ["doan_chi_phi", doanId] });
      qc.invalidateQueries({ queryKey: ["de_nghi_thanh_toan", doanId] });
    },
  });
}

// Mark paid: tạo payment cash cho phần chưa thanh toán (so_tien - paid_amount)
async function markPaidImpl(id: number, ngayISO: string, nguon?: string | null): Promise<number> {
  const { data: dntt, error: fetchErr } = await externalSupabase
    .from("de_nghi_thanh_toan")
    .select("id, doan_id, so_tien, trang_thai_duyet, loai, nha_cung_cap_id, ten_nha_cung_cap")
    .eq("id", id)
    .single();
  if (fetchErr) throw fetchErr;

  // Auto-approve if not yet
  if (dntt.trang_thai_duyet === "cho_duyet") {
    await externalSupabase
      .from("de_nghi_thanh_toan")
      .update({ trang_thai_duyet: "da_duyet", duyet_luc: ngayISO })
      .eq("id", id);
  }

  const paidAlready = await getPaidAmount(id);
  const remaining = Number(dntt.so_tien) - paidAlready;
  if (remaining > 0) {
    const { error: payErr } = await externalSupabase
      .from("payments")
      .insert({
        dntt_id: id,
        method: "cash",
        so_tien: remaining,
        ngay_thanh_toan: ngayISO,
        nguon: nguon ?? null,
      });
    if (payErr) throw payErr;
  }

  const chiPhiIds = await getChiPhiIdsForDNTT(id);
  await recalcChiPhiStatus(chiPhiIds);

  // ĐNTT trả trước đã trả đủ → tự lập quỹ (cong_no con_du loai='tra_truoc').
  // Idempotent: chỉ tạo nếu CHƯA có cong_no nào gắn dntt_goc_id = id.
  if (dntt.loai === "tra_truoc") {
    const paidNow = await getPaidAmount(id);
    if (paidNow >= Number(dntt.so_tien)) {
      const { data: existed } = await externalSupabase
        .from("cong_no")
        .select("id")
        .eq("dntt_goc_id", id)
        .limit(1)
        .maybeSingle();
      if (!existed) {
        await externalSupabase.from("cong_no").insert({
          doan_id: null,
          dntt_goc_id: id,
          nha_cung_cap_id: dntt.nha_cung_cap_id ?? null,
          ten_nha_cung_cap: dntt.ten_nha_cung_cap ?? null,
          so_tien_goc: Number(dntt.so_tien),
          trang_thai: "con_du",
          loai: "tra_truoc",
          ly_do: "Quỹ trả trước dịch vụ",
          ngay_tao: ngayISO,
        });
      }
    }
  }
  return dntt.doan_id as number;
}

export function useMarkPaidDNTT() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => markPaidImpl(id, new Date().toISOString()),
    onSuccess: (doanId) => {
      qc.invalidateQueries({ queryKey: ["dntt-list"] });
      qc.invalidateQueries({ queryKey: ["dinh_ky_dntt_list"] });
      qc.invalidateQueries({ queryKey: ["hoa-don-unc"] });
      qc.invalidateQueries({ queryKey: ["cong-no"] });
      qc.invalidateQueries({ queryKey: ["cong-no-by-ncc"] });
      qc.invalidateQueries({ queryKey: ["doan_chi_phi", doanId] });
      qc.invalidateQueries({ queryKey: ["de_nghi_thanh_toan", doanId] });
    },
  });
}

export function useMarkPaidWithDate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ngayThanhToan, nguon }: { id: number; ngayThanhToan: string; nguon?: string | null }) =>
      markPaidImpl(id, new Date(ngayThanhToan).toISOString(), nguon ?? null),
    onSuccess: (doanId) => {
      qc.invalidateQueries({ queryKey: ["dntt-list"] });
      qc.invalidateQueries({ queryKey: ["dinh_ky_dntt_list"] });
      qc.invalidateQueries({ queryKey: ["hoa-don-unc"] });
      qc.invalidateQueries({ queryKey: ["cong-no"] });
      qc.invalidateQueries({ queryKey: ["cong-no-by-ncc"] });
      qc.invalidateQueries({ queryKey: ["doan_chi_phi", doanId] });
      qc.invalidateQueries({ queryKey: ["de_nghi_thanh_toan", doanId] });
    },
  });
}

/**
 * Hủy DNTT:
 * - mode = undefined: hủy trước khi thanh toán cash → xóa các can_tru payments để khôi phục cong_no nguồn
 * - mode = "cong_no": hủy sau khi đã thanh toán cash → tạo cong_no record (NCC giữ tiền làm credit)
 * - mode = "hoan_tien": hủy sau khi đã thanh toán cash → tạo cong_no với trang_thai='da_hoan_tien'
 *
 * Ghi chú: can_tru payments LUÔN bị xóa khi cancel (để khôi phục cong_no nguồn). Chỉ cash
 * payments mới có thể chuyển thành cong_no/hoan_tien.
 */
export function useCancelDNTT() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async ({ id, mode, userId }: { id: number; mode?: "cong_no" | "hoan_tien"; userId?: string | null }) => {
      const { data: dntt, error: fetchErr } = await externalSupabase
        .from("de_nghi_thanh_toan")
        .select("id, doan_id, ref_loai, ref_id, nha_cung_cap_id, ten_nha_cung_cap, loai, mo_ta")
        .eq("id", id)
        .single();
      if (fetchErr) throw fetchErr;

      // 1) Reverse adjustment artifacts: cong_no records do adjustment tạo (dntt_goc_id = id)
      //    Cũng xóa thanh_tien_thuc_te trên chi_phi linked
      const { data: relatedCongNos } = await externalSupabase
        .from("cong_no")
        .select("id")
        .eq("dntt_goc_id", id);
      if (relatedCongNos && relatedCongNos.length > 0) {
        const cnIds = relatedCongNos.map((c) => c.id);
        // Xóa payments tham chiếu các cong_no này (RESTRICT FK)
        await externalSupabase.from("payments").delete().in("cong_no_id", cnIds);
        await externalSupabase.from("cong_no").delete().in("id", cnIds);
      }
      // Reset thanh_tien_thuc_te trên các chi_phi có allocation với ĐNTT này
      const allocChiPhiIds = await getChiPhiIdsForDNTT(id);
      if (allocChiPhiIds.length > 0) {
        await externalSupabase
          .from("doan_chi_phi")
          .update({ thanh_tien_thuc_te: null })
          .in("id", allocChiPhiIds);
      }

      // 2) Lấy tất cả payments của ĐNTT này
      const { data: payments } = await externalSupabase
        .from("payments")
        .select("id, method, so_tien, cong_no_id")
        .eq("dntt_id", id);
      const allPayments = payments || [];
      const cashPaid = allPayments
        .filter((p) => p.method === "cash")
        .reduce((s, p) => s + Number(p.so_tien), 0);
      const canTruPayments = allPayments.filter((p) => p.method === "can_tru");
      const canTruPaymentIds = canTruPayments.map((p) => p.id);
      const affectedCongNoIds = [
        ...new Set(
          canTruPayments
            .filter((p): p is typeof p & { cong_no_id: number } => p.cong_no_id != null)
            .map((p) => p.cong_no_id),
        ),
      ];

      // Xóa can_tru payments → khôi phục balance của cong_no nguồn
      if (canTruPaymentIds.length > 0) {
        // Lấy tên đoàn để xóa log cấn trừ matching
        let tenDoan = "";
        if (dntt.doan_id) {
          const { data: doanRow } = await externalSupabase
            .from("doan").select("ten_doan").eq("id", dntt.doan_id).single();
          tenDoan = doanRow?.ten_doan || `#${dntt.doan_id}`;
        }

        // Xóa log cấn trừ trên cong_no nguồn TRƯỚC khi xóa payment (cần biết so_tien)
        const { removeCanTruLog } = await import("@/hooks/use-cong-no");
        for (const p of canTruPayments) {
          if (p.cong_no_id != null && tenDoan) {
            await removeCanTruLog(p.cong_no_id as number, Number(p.so_tien), tenDoan);
          }
        }

        await externalSupabase.from("payments").delete().in("id", canTruPaymentIds);

        // Reset trạng thái cong_no nguồn về 'con_du' nếu trước đó là 'da_can_tru'
        for (const cnId of affectedCongNoIds) {
          const { data: cnRow } = await externalSupabase
            .from("cong_no_with_status")
            .select("so_tien_con_lai, trang_thai")
            .eq("id", cnId)
            .single();
          if (cnRow && Number(cnRow.so_tien_con_lai) > 0 && cnRow.trang_thai === "da_can_tru") {
            await externalSupabase
              .from("cong_no")
              .update({ trang_thai: "con_du" })
              .eq("id", cnId);
          }
        }
      }

      // Xóa payment 'voucher' (phần suất chính trả bằng voucher) — hủy ĐNTT thì
      // khoản này không còn hiệu lực, tránh payment mồ côi. (Không tạo cong_no:
      // voucher đã trả trước, gỡ/hủy chỉ trả dòng về trạng thái chưa thanh toán.)
      const voucherPaymentIds = allPayments.filter((p) => p.method === "voucher").map((p) => p.id);
      if (voucherPaymentIds.length > 0) {
        await externalSupabase.from("payments").delete().in("id", voucherPaymentIds);
      }

      const { error } = await externalSupabase
        .from("de_nghi_thanh_toan")
        .update({
          trang_thai_duyet: "da_huy",
          ghi_chu: mode === "cong_no" ? "Cấn trừ công nợ" : mode === "hoan_tien" ? "Hoàn lại tiền" : null,
          // Caller có thể truyền userId; nếu không, fallback về user đang đăng nhập
          // → mọi đường hủy đều ghi lại người hủy (trước đây nhiều caller bỏ trống → huy_boi NULL).
          huy_boi: userId ?? user?.user_id ?? null,
          huy_luc: new Date().toISOString(),
        })
        .eq("id", id);
      if (error) throw error;

      // Nếu đã có cash payment và user chọn mode → tạo cong_no record (chỉ phần cash).
      // DNTT cọc KS/NH thường không có nha_cung_cap_id (vì NCC info nằm ở master
      // KS/NH master) → lookup từ ref. Cong_no có nha_cung_cap_id nullable nên
      // ngay cả khi không tìm được NCC vẫn tạo record để audit.
      if (mode && cashPaid > 0) {
        let nccId: number | null = dntt.nha_cung_cap_id;
        let nccTen: string | null = dntt.ten_nha_cung_cap;
        if (!nccId && dntt.ref_loai && dntt.ref_id) {
          const table = dntt.ref_loai === "khach_san" ? "khach_san"
            : dntt.ref_loai === "nha_hang" ? "nha_hang"
            : dntt.ref_loai === "canh_diem" ? "canh_diem"
            : null;
          if (table) {
            const { data: refRow } = await externalSupabase
              .from(table)
              .select("ten, nha_cung_cap_id, nha_cung_cap:nha_cung_cap_id(ten)")
              .eq("id", dntt.ref_id)
              .maybeSingle();
            if (refRow) {
              const r = refRow as {
                ten: string | null;
                nha_cung_cap_id: number | null;
                nha_cung_cap: { ten: string | null } | null;
              };
              nccId = r.nha_cung_cap_id ?? null;
              nccTen = r.nha_cung_cap?.ten ?? r.ten ?? null;
            }
          }
        }
        const { error: cnErr } = await externalSupabase.from("cong_no").insert({
          doan_id: dntt.doan_id,
          dntt_goc_id: id,
          nha_cung_cap_id: nccId,
          ten_nha_cung_cap: nccTen,
          so_tien_goc: cashPaid,
          trang_thai: mode === "hoan_tien" ? "da_hoan_tien" : "con_du",
          ly_do: `Hủy ĐNTT #${id}: ${dntt.mo_ta || ""}`.trim(),
        });
        if (cnErr) throw cnErr;
      }

      const chiPhiIds = await getChiPhiIdsForDNTT(id);
      await recalcChiPhiStatus(chiPhiIds);
      return dntt.doan_id as number;
    },
    onSuccess: (doanId) => {
      qc.invalidateQueries({ queryKey: ["dntt-list"] });
      qc.invalidateQueries({ queryKey: ["dinh_ky_dntt_list"] });
      qc.invalidateQueries({ queryKey: ["doan_chi_phi", doanId] });
      qc.invalidateQueries({ queryKey: ["de_nghi_thanh_toan", doanId] });
      qc.invalidateQueries({ queryKey: ["chi_phi_hdv_section", doanId] });
      qc.invalidateQueries({ queryKey: ["cong-no"] });
      qc.invalidateQueries({ queryKey: ["cong-no-by-ncc"] });
    },
  });
}

export function useUpdateDNTT() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, soTien }: { id: number; soTien: number }) => {
      const { data: dntt, error: fetchErr } = await externalSupabase
        .from("de_nghi_thanh_toan")
        .select("id, doan_id")
        .eq("id", id)
        .single();
      if (fetchErr) throw fetchErr;

      // Safety guard: không cho hạ so_tien xuống dưới paid_amount.
      // Nếu cho phép, view dntt_with_payment_status sẽ tính paid_amount >= so_tien
      // → false-positive payment_status='paid' khiến kế toán không thấy ĐNTT cần xử lý.
      const paidAmount = await getPaidAmount(id);
      if (soTien < paidAmount) {
        throw new Error(
          `Không thể hạ số tiền xuống dưới số đã thanh toán (${paidAmount.toLocaleString("vi-VN")}đ). ` +
          `Hủy ĐNTT (useCancelDNTT) hoặc tạo ĐNTT bổ sung thay thế.`
        );
      }

      const { error } = await externalSupabase
        .from("de_nghi_thanh_toan")
        .update({ so_tien: soTien })
        .eq("id", id)
        .eq("trang_thai_duyet", "cho_duyet");
      if (error) throw error;

      // Cập nhật allocations theo tỷ lệ
      const { data: allocs } = await externalSupabase
        .from("dntt_allocations")
        .select("id, chi_phi_id, so_tien")
        .eq("dntt_id", id);
      const allocList = allocs || [];
      if (allocList.length === 1) {
        await externalSupabase
          .from("dntt_allocations")
          .update({ so_tien: soTien })
          .eq("id", allocList[0].id);
      } else if (allocList.length > 1) {
        // Largest-remainder để SUM(allocs) === soTien (no rounding drift)
        const newAmts = proRataInts(soTien, allocList.map((a) => Number(a.so_tien)));
        for (let i = 0; i < allocList.length; i++) {
          await externalSupabase
            .from("dntt_allocations")
            .update({ so_tien: newAmts[i] })
            .eq("id", allocList[i].id);
        }
      }

      const chiPhiIds = await getChiPhiIdsForDNTT(id);
      await recalcChiPhiStatus(chiPhiIds);
      return dntt.doan_id as number;
    },
    onSuccess: (doanId) => {
      qc.invalidateQueries({ queryKey: ["dntt-list"] });
      qc.invalidateQueries({ queryKey: ["dinh_ky_dntt_list"] });
      qc.invalidateQueries({ queryKey: ["doan_chi_phi", doanId] });
      qc.invalidateQueries({ queryKey: ["de_nghi_thanh_toan", doanId] });
    },
  });
}

export function useDeleteDNTT() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      // 1) Reverse adjustment artifacts: xóa cong_no có dntt_goc_id = id
      const { data: relatedCongNos } = await externalSupabase
        .from("cong_no")
        .select("id")
        .eq("dntt_goc_id", id);
      if (relatedCongNos && relatedCongNos.length > 0) {
        const cnIds = relatedCongNos.map((c) => c.id);
        await externalSupabase.from("payments").delete().in("cong_no_id", cnIds);
        await externalSupabase.from("cong_no").delete().in("id", cnIds);
      }
      const allocChiPhiIds = await getChiPhiIdsForDNTT(id);
      if (allocChiPhiIds.length > 0) {
        await externalSupabase
          .from("doan_chi_phi")
          .update({ thanh_tien_thuc_te: null })
          .in("id", allocChiPhiIds);
      }

      // 2) Lấy cong_no IDs bị ảnh hưởng (can_tru source) để reset sau cascade
      const { data: payments } = await externalSupabase
        .from("payments")
        .select("cong_no_id")
        .eq("dntt_id", id)
        .eq("method", "can_tru");
      const affectedCongNoIds = [
        ...new Set(
          (payments || [])
            .map((p) => p.cong_no_id)
            .filter((x): x is number => x != null),
        ),
      ];

      // 3) Xóa DNTT (payments cascade)
      const { error } = await externalSupabase
        .from("de_nghi_thanh_toan")
        .delete()
        .eq("id", id);
      if (error) throw error;

      // 4) Reset cong_no nguồn về 'con_du' nếu balance khôi phục
      for (const cnId of affectedCongNoIds) {
        const { data: cnRow } = await externalSupabase
          .from("cong_no_with_status")
          .select("so_tien_con_lai, trang_thai")
          .eq("id", cnId)
          .single();
        if (cnRow && Number(cnRow.so_tien_con_lai) > 0 && cnRow.trang_thai === "da_can_tru") {
          await externalSupabase
            .from("cong_no")
            .update({ trang_thai: "con_du" })
            .eq("id", cnId);
        }
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["dntt-list"] });
      qc.invalidateQueries({ queryKey: ["dinh_ky_dntt_list"] });
      qc.invalidateQueries({ queryKey: ["cong-no"] });
      qc.invalidateQueries({ queryKey: ["cong-no-by-ncc"] });
    },
  });
}

/**
 * Điều chỉnh sau khi ĐNTT đã có payment (số phòng/khách thay đổi):
 * - delta > 0 (thiếu tiền): tạo ĐNTT bổ sung (cho_duyet) → flow bình thường
 * - delta < 0 (thừa tiền): tạo cong_no với so_tien_goc=abs(delta) trên đoàn này
 * Đồng thời cập nhật chi_phi.thanh_tien_thuc_te (pro-rata).
 */
export function useCreateAdjustment() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async ({
      dnttGoc,
      soTienThucTe,
      lyDo,
      surplusMode = "cong_no",
    }: {
      dnttGoc: DNTTRow;
      soTienThucTe: number;
      lyDo: string;
      surplusMode?: "cong_no" | "hoan_tien";
    }) => {
      // Pre-fetch allocations để biết các chi_phi liên quan.
      // currentTotal phải là COMMITMENT thật (so_tien_da_dntt — sum allocs trên các DNTT
      // không bị huỷ), KHÔNG dùng chi_phi.thanh_tien (phản ánh state edit của user).
      // Vì sao quan trọng: nếu OP edit chi_phi (đổi so_luong/don_gia) trước khi adjust,
      // chi_phi.thanh_tien auto-update theo edit → currentTotal sẽ khớp soTienThucTe
      // → delta=0 → KHÔNG tạo cong_no/supplementary, dù user vừa giảm so_luong.
      const { data: allocs } = await externalSupabase
        .from("dntt_allocations")
        .select("chi_phi_id, so_tien")
        .eq("dntt_id", dnttGoc.id);

      let currentTotal = dnttGoc.so_tien;

      if (allocs && allocs.length > 0) {
        const ids = allocs.map((a) => a.chi_phi_id);
        const { data: cpRows } = await externalSupabase
          .from("doan_chi_phi")
          .select("id, so_tien_da_dntt")
          .in("id", ids);
        if (cpRows && cpRows.length > 0) {
          // so_tien_da_dntt: sum allocs từ các DNTT không huỷ (computed bởi recalc RPC)
          // Phản ánh đúng commitment đã ràng buộc cho chi_phi này.
          currentTotal = cpRows.reduce(
            (s, r) => s + Number(r.so_tien_da_dntt ?? 0),
            0,
          );
        }
      }

      const delta = soTienThucTe - currentTotal;
      if (delta === 0) return null;

      const d = new Date();
      const dd = d.getDate().toString().padStart(2, "0");
      const mm = (d.getMonth() + 1).toString().padStart(2, "0");
      const yyyy = d.getFullYear();
      const dateStr = `${dd}/${mm}/${yyyy}`;
      const fmt = (n: number) => n.toLocaleString("vi-VN");

      if (delta > 0) {
        // Thiếu tiền → tạo ĐNTT bổ sung chờ duyệt
        const { data: authData } = await externalSupabase.auth.getUser();
        const taoBoi = authData?.user?.id ?? user?.user_id ?? null;
        const { error } = await externalSupabase
          .from("de_nghi_thanh_toan")
          .insert({
            doan_id: dnttGoc.doan_id,
            nha_cung_cap_id: dnttGoc.nha_cung_cap_id,
            ten_nha_cung_cap: dnttGoc.ten_nha_cung_cap,
            so_tai_khoan: dnttGoc.so_tai_khoan,
            ngan_hang: dnttGoc.ngan_hang,
            loai: dnttGoc.loai,
            mo_ta: `[Bổ sung] ${dnttGoc.mo_ta || ""}`.trim(),
            so_tien: delta,
            trang_thai_duyet: "cho_duyet",
            ghi_chu: `Điều chỉnh bổ sung từ ĐNTT #${dnttGoc.id}. Lý do: ${lyDo}`,
            tao_boi: taoBoi,
          });
        if (error) throw error;
      } else {
        // Thừa tiền → tạo cong_no
        if (dnttGoc.nha_cung_cap_id) {
          const cnTrangThai = surplusMode === "hoan_tien" ? "da_hoan_tien" : "con_du";
          const fromPrepaid =
            cnTrangThai === "con_du" && (await isDnttPaidFromPrepaid(dnttGoc.id));
          const { error } = await externalSupabase.from("cong_no").insert({
            doan_id: dnttGoc.doan_id,
            dntt_goc_id: dnttGoc.id,
            nha_cung_cap_id: dnttGoc.nha_cung_cap_id,
            ten_nha_cung_cap: dnttGoc.ten_nha_cung_cap,
            so_tien_goc: Math.abs(delta),
            trang_thai: cnTrangThai,
            loai: fromPrepaid ? "tra_truoc" : "phat_sinh",
            ly_do: `Điều chỉnh giảm ĐNTT #${dnttGoc.id}. Lý do: ${lyDo}`,
          });
          if (error) throw error;
        }
      }

      // Set thanh_tien_thuc_te ABSOLUTE (không cộng dồn delta).
      // = pro-rata soTienThucTe theo alloc proportion. SUM(per-row) === soTienThucTe.
      // Lý do: nếu cộng dồn (base + delta) và base đã chứa edit của user → sai.
      if (allocs && allocs.length > 0) {
        const newThucTeAmts = proRataInts(soTienThucTe, allocs.map((a) => Number(a.so_tien)));
        const chiPhiIds: number[] = [];

        for (let i = 0; i < allocs.length; i++) {
          const alloc = allocs[i];
          await externalSupabase
            .from("doan_chi_phi")
            .update({ thanh_tien_thuc_te: newThucTeAmts[i] })
            .eq("id", alloc.chi_phi_id);
          chiPhiIds.push(alloc.chi_phi_id);
        }

        await recalcChiPhiStatus(chiPhiIds);
      }

      // Ghi log vào ghi_chu của ĐNTT gốc
      const { data: goc } = await externalSupabase
        .from("de_nghi_thanh_toan")
        .select("ghi_chu")
        .eq("id", dnttGoc.id)
        .single();
      const logEntry = delta > 0
        ? `${dateStr}: Điều chỉnh +${fmt(delta)}đ (bổ sung). Lý do: ${lyDo}`
        : `${dateStr}: Điều chỉnh −${fmt(Math.abs(delta))}đ (thừa → ${surplusMode === "hoan_tien" ? "hoàn tiền" : "công nợ"}). Lý do: ${lyDo}`;
      const newGhiChu = goc?.ghi_chu ? `${goc.ghi_chu}\n${logEntry}` : logEntry;
      await externalSupabase
        .from("de_nghi_thanh_toan")
        .update({ ghi_chu: newGhiChu })
        .eq("id", dnttGoc.id);

      return { delta };
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["dntt-list"] });
      qc.invalidateQueries({ queryKey: ["dinh_ky_dntt_list"] });
      qc.invalidateQueries({ queryKey: ["de_nghi_thanh_toan", vars.dnttGoc.doan_id] });
      qc.invalidateQueries({ queryKey: ["doan_chi_phi", vars.dnttGoc.doan_id] });
      qc.invalidateQueries({ queryKey: ["cong-no"] });
      if (vars.dnttGoc.nha_cung_cap_id) {
        qc.invalidateQueries({ queryKey: ["cong-no-by-ncc", vars.dnttGoc.nha_cung_cap_id] });
      }
    },
  });
}
