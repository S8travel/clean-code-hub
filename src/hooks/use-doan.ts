import { useEffect } from "react";
import { externalSupabase } from "@/lib/supabase-external";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { buildAuditLogger } from "@/hooks/use-activity-log";
import { calcSoKhachThucTe } from "@/lib/foc-calc";
import { applyChietKhau } from "@/lib/chi-phi-calc";
import { resolveNhom1SoKhach } from "@/lib/doan-nhom-sync";
import { isChiPhiLocked } from "@/lib/chi-phi-lock";
import { getActiveDnttIdsForChiPhi } from "@/lib/dntt-guard";

export interface Doan {
  id: number;
  ten_doan: string;
  agent_id: number | null;
  agent_huy_id: number | null;
  dia_diem_id: number | null;
  huong_dan_vien_id: number | null;
  huong_dan_vien_id_2: number | null;
  xe_id: number | null;
  xe_da_huy: boolean | null;
  xe_id_2: number | null;
  xe_da_huy_2: boolean | null;
  seri_id: number | null;
  chuyen_bay_don: string | null;
  chuyen_bay_tien: string | null;
  booking_khach_san_id: number | null;
  booking_nha_hang_id: number | null;
  so_khach: number | null;
  so_khach_lon: number | null;
  so_khach_em1: number | null;
  so_khach_em2: number | null;
  so_khach_tl: number | null;
  ngay_di: string | null;
  ngay_ve: string | null;
  trang_thai: string | null;
  ghi_chu: string | null;
  ghi_chu_dieu_tour: string | null;
  assigned_to: string | null;
  created_by: string | null;
  van_phong_id: number | null;
  van_phong?: { id: number; ten: string } | null;
  loai_tour: "inbound" | "outbound" | "noi_dia" | null;
  thi_truong: string | null;
  thu_tip: boolean | null;
  tip_rate: number | null;
  tip_so_ngay_override: number | null;
  tip_so_khach_override: number | null;
  tip_lump_sum: number | null;
  // Phải thu — Thu tiền đầu khách: per-pax × đơn giá (no nhân ngày)
  dau_khach_rate: number | null;
  dau_khach_currency: string | null;
  dau_khach_ty_gia: number | null;
  dau_khach_nguoi_thu: string | null;
  dau_khach_so_khach_override: number | null;
  // Phải thu — Thu tiền quỹ VP: lump-sum cho cả đoàn
  quy_vp_amount: number | null;
  quy_vp_currency: string | null;
  quy_vp_ty_gia: number | null;
  quy_vp_nguoi_thu: string | null;
  // Cờ tay (kế toán/admin) — checklist ở danh sách đoàn
  da_check_quyet_toan: boolean | null;
  da_thu_visa: boolean | null;
  created_at?: string;
}

export const THI_TRUONG_OPTS: { value: string; label: string; loai_tour: string }[] = [
  { value: "ib_trung_quoc", label: "Trung Quốc", loai_tour: "inbound" },
  { value: "ib_dai_loan",   label: "Đài Loan",   loai_tour: "inbound" },
  { value: "ob_nhat_ban",   label: "Nhật Bản",   loai_tour: "outbound" },
  { value: "ob_dai_loan",   label: "Đài Loan",   loai_tour: "outbound" },
  { value: "ob_thai_lan",   label: "Thái Lan",   loai_tour: "outbound" },
  { value: "noi_dia",       label: "Nội địa",    loai_tour: "noi_dia" },
];

export interface DoanInsert {
  ten_doan: string;
  agent_id?: number | null;
  agent_huy_id?: number | null;
  dia_diem_id?: number | null;
  huong_dan_vien_id?: number | null;
  huong_dan_vien_id_2?: number | null;
  xe_id?: number | null;
  xe_da_huy?: boolean | null;
  xe_id_2?: number | null;
  xe_da_huy_2?: boolean | null;
  seri_id?: number | null;
  chuyen_bay_don?: string | null;
  chuyen_bay_tien?: string | null;
  booking_khach_san_id?: number | null;
  booking_nha_hang_id?: number | null;
  so_khach?: number | null;
  so_khach_lon?: number | null;
  so_khach_em1?: number | null;
  so_khach_em2?: number | null;
  so_khach_tl?: number | null;
  ngay_di?: string | null;
  ngay_ve?: string | null;
  trang_thai?: string | null;
  ghi_chu?: string | null;
  ghi_chu_dieu_tour?: string | null;
  assigned_to?: string | null;
  created_by?: string | null;
  van_phong_id?: number | null;
  khach_hang_id?: number | null;
  loai_tour?: "inbound" | "outbound" | "noi_dia" | null;
  thi_truong?: string | null;
  shopping?: boolean | null;
}

export interface LookupItem {
  id: number;
  ten: string;
}

export interface DiaDiemItem {
  id: number;
  ten: string;
  mien: string | null;
}

export interface AgentItem {
  id: number;
  ten: string;
}

export interface UserRole {
  id: string;
  user_id: string;
  role: string;
  ho_ten: string;
}

export interface DoanPermission {
  id: number;
  doan_id: number;
  user_id: string;
  ho_ten: string | null;
  quyen: string;
  created_at: string;
}

// Lookup hooks
export function useAgents() {
  return useQuery({
    queryKey: ["agents"],
    staleTime: 10 * 60_000,
    queryFn: async () => {
      const { data, error } = await externalSupabase.from("agents").select("id, ten").order("ten");
      if (error) throw error;
      return data as AgentItem[];
    },
  });
}

export function useCreateAgent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (ten: string) => {
      const trimmed = ten.trim();
      if (!trimmed) throw new Error("Tên agent không được trống");
      const { data, error } = await externalSupabase
        .from("agents")
        .insert({ ten: trimmed })
        .select("id, ten")
        .single();
      if (error) throw error;
      return data as AgentItem;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["agents"] }),
  });
}

export function useDiaDiem() {
  return useQuery({
    queryKey: ["dia_diem"],
    staleTime: 10 * 60_000,
    queryFn: async () => {
      const { data, error } = await externalSupabase.from("dia_diem").select("id, ten, mien").order("ten");
      if (error) throw error;
      return data as DiaDiemItem[];
    },
  });
}

/** Chú thích khách của 1 đoàn (ăn chay / dị ứng / VIP…) — dùng cho mail booking. */
export function useDoanChuThich(doanId: number | null | undefined) {
  return useQuery({
    queryKey: ["doan-chu-thich", doanId],
    enabled: !!doanId,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await externalSupabase
        .from("doan")
        .select("chu_thich_khach")
        .eq("id", doanId!)
        .maybeSingle();
      if (error) throw error;
      return (data?.chu_thich_khach ?? null) as string | null;
    },
  });
}

export function useHuongDanVien() {
  return useQuery({
    queryKey: ["huong_dan_vien"],
    staleTime: 10 * 60_000,
    queryFn: async () => {
      const { data, error } = await externalSupabase.from("huong_dan_vien").select("id, ten").order("ten");
      if (error) throw error;
      return data as LookupItem[];
    },
  });
}

export function useXeList() {
  return useQuery({
    queryKey: ["xe_list"],
    staleTime: 10 * 60_000,
    queryFn: async () => {
      const { data: loaiXe, error: e1 } = await externalSupabase
        .from("nha_xe_loai_xe")
        .select("id, ten_xe, so_cho, ghi_chu, nha_xe_id")
        .order("ten_xe");
      if (e1) throw e1;

      const { data: nhaXe, error: e2 } = await externalSupabase
        .from("nha_xe")
        .select("id, ten");
      if (e2) throw e2;

      const nhaXeMap = Object.fromEntries((nhaXe ?? []).map((n) => [n.id, n.ten]));
      return (loaiXe ?? []).map((x) => ({
        ...x,
        nha_xe: { id: x.nha_xe_id, ten: nhaXeMap[x.nha_xe_id] ?? "" },
      }));
    },
  });
}

export function useTrangThai() {
  return useQuery({
    queryKey: ["trang_thai"],
    staleTime: 10 * 60_000,
    queryFn: async () => {
      const { data, error } = await externalSupabase.from("trang_thai").select("id, ten").order("ten");
      if (error) throw error;
      return data as LookupItem[];
    },
  });
}

// Set doan_id của các đoàn đã có DNTT QT HDV thanh toán xong → dùng cho
// trạng thái "Đã quyết toán" (computed). Loại DNTT đã hủy.
export function useDoanQuyetToanPaidSet() {
  return useQuery({
    queryKey: ["doan-qt-paid-set"],
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await externalSupabase
        .from("dntt_with_payment_status")
        .select("doan_id")
        .eq("ref_loai", "hdv_quyet_toan")
        .eq("payment_status", "paid")
        .neq("trang_thai_duyet", "da_huy");
      if (error) throw error;
      return new Set((data ?? []).map((d) => d.doan_id).filter((x): x is number => x != null));
    },
  });
}

export function useUserRoles() {
  return useQuery({
    queryKey: ["user_roles"],
    staleTime: 10 * 60_000,
    queryFn: async () => {
      const { data, error } = await externalSupabase
        .from("user_roles")
        .select("id, user_id, role, ho_ten")
        .order("ho_ten");
      if (error) throw error;
      return data as UserRole[];
    },
  });
}

export function useCurrentUserName() {
  return useQuery({
    queryKey: ["current-user-name"],
    staleTime: 10 * 60_000,
    queryFn: async () => {
      const { data: auth } = await externalSupabase.auth.getUser();
      if (!auth.user) return "";
      const { data } = await externalSupabase
        .from("user_roles")
        .select("ho_ten")
        .eq("user_id", auth.user.id)
        .maybeSingle();
      return (data?.ho_ten || auth.user.email || "") as string;
    },
  });
}

export function useCurrentUserProfile() {
  return useQuery({
    queryKey: ["current-user-profile"],
    staleTime: 10 * 60_000,
    queryFn: async () => {
      const { data: auth } = await externalSupabase.auth.getUser();
      if (!auth.user) return { ho_ten: "", so_dien_thoai: null as string | null, email: null as string | null };
      const { data } = await externalSupabase
        .from("user_roles")
        .select("ho_ten, so_dien_thoai")
        .eq("user_id", auth.user.id)
        .maybeSingle();
      return {
        ho_ten: (data?.ho_ten || auth.user.email || "") as string,
        so_dien_thoai: (data?.so_dien_thoai || null) as string | null,
        email: (auth.user.email || null) as string | null,
      };
    },
  });
}

// Doan list — phanLoaiTour=null → no filter (admin/giám đốc); array → filter by thi_truong.
// vanPhongIds=null/undefined → no filter (cross-VP); mảng → chỉ doan có van_phong_id ∈ mảng.
// SCOPE filter cả 2 áp dụng cùng lúc (caller pass từ useDoanScope).
// LƯU Ý: filter VP ở đây CHỈ để UX (list gọn); enforce thật là RLS tường cứng (DB).
export function useDoanList(
  phanLoaiTour?: string[] | null,
  vanPhongIds?: number[] | null,
) {
  return useQuery({
    queryKey: ["doan", phanLoaiTour ?? null, vanPhongIds ?? null],
    staleTime: 30_000,
    queryFn: async () => {
      let query = externalSupabase
        .from("doan")
        .select(`
          *,
          agents:agent_id(id, ten),
          agent_huy:agent_huy_id(id, ten),
          dia_diem:dia_diem_id(ten),
          huong_dan_vien:huong_dan_vien!huong_dan_vien_id(id, ten, so_dien_thoai),
          huong_dan_vien_2:huong_dan_vien!huong_dan_vien_id_2(id, ten, so_dien_thoai),
          xe:nha_xe_loai_xe!xe_id(id, ten_xe, so_cho, nha_xe:nha_xe_id(id, ten, email, so_dien_thoai, nha_cung_cap_id, tai_khoan_thanh_toan)),
          xe_2:nha_xe_loai_xe!xe_id_2(id, ten_xe, so_cho, nha_xe:nha_xe_id(id, ten, email, so_dien_thoai, nha_cung_cap_id, tai_khoan_thanh_toan)),
          van_phong:van_phong_id(id, ten)
        `);
      if (phanLoaiTour && phanLoaiTour.length > 0) {
        // Fail-open: đoàn CHƯA phân thị trường (thi_truong NULL) vẫn hiện cho mọi OP —
        // tránh "biến mất" khi đoàn tạo thiếu phân loại (vd giám đốc tạo, hoặc clone từ nguồn NULL).
        query = query.or(`thi_truong.in.(${phanLoaiTour.join(",")}),thi_truong.is.null`);
      }
      if (vanPhongIds && vanPhongIds.length > 0) {
        query = query.in("van_phong_id", vanPhongIds);
      }
      const { data, error } = await query.order("ngay_di", { ascending: true });
      if (error) throw error;
      return data;
    },
  });
}

// Subscribe to realtime changes on doan table
export function useDoanRealtime() {
  const qc = useQueryClient();

  useQuery({
    queryKey: ["doan_realtime_sub"],
    queryFn: () => {
      const channel = externalSupabase
        .channel("doan_changes")
        .on("postgres_changes", { event: "*", schema: "public", table: "doan" }, () => {
          qc.invalidateQueries({ queryKey: ["doan"] });
        })
        .subscribe();
      return channel;
    },
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });
}

// Realtime cho TRANG CHI TIẾT đoàn: nghe doan + doan_ngay + doan_ngay_item
// của 1 đoàn từ máy khác → invalidate query tương ứng. An toàn vì local
// state điều tour có chốt hasPendingChangesRef (chỉ merge lại khi không
// đang nhập dở) — khác Chi phí KS/NH (sticky sessionStorage).
export function useDoanDetailRealtime(doanId: number | null | undefined) {
  const qc = useQueryClient();
  useEffect(() => {
    if (!doanId || Number.isNaN(doanId)) return;
    const channel = externalSupabase
      .channel(`doan_detail_${doanId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "doan", filter: `id=eq.${doanId}` },
        () => qc.invalidateQueries({ queryKey: ["doan"] }),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "doan_ngay", filter: `doan_id=eq.${doanId}` },
        () => qc.invalidateQueries({ queryKey: ["doan_ngay", doanId] }),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "doan_ngay_item", filter: `doan_id=eq.${doanId}` },
        () => qc.invalidateQueries({ queryKey: ["doan_ngay_item", doanId] }),
      )
      .subscribe();
    return () => {
      externalSupabase.removeChannel(channel);
    };
  }, [doanId, qc]);
}

// Doan permissions
export function useDoanPermissions(doanId: number | null) {
  return useQuery({
    queryKey: ["doan_permissions", doanId],
    queryFn: async () => {
      if (!doanId) return [];
      const { data, error } = await externalSupabase
        .from("doan_permissions")
        .select("*")
        .eq("doan_id", doanId)
        .order("created_at");
      if (error) throw error;
      return data as DoanPermission[];
    },
    enabled: !!doanId,
  });
}

export function useAddDoanPermission() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (perm: { doan_id: number; user_id: string; ho_ten: string; quyen?: string }) => {
      const { data, error } = await externalSupabase
        .from("doan_permissions")
        .insert({ ...perm, quyen: perm.quyen || "view" })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (_, vars) => qc.invalidateQueries({ queryKey: ["doan_permissions", vars.doan_id] }),
  });
}

export function useRemoveDoanPermission() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, doan_id }: { id: number; doan_id: number }) => {
      const { error } = await externalSupabase.from("doan_permissions").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_, vars) => qc.invalidateQueries({ queryKey: ["doan_permissions", vars.doan_id] }),
  });
}

export function useCreateDoan() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (doan: DoanInsert) => {
      const { data, error } = await externalSupabase.from("doan").insert(doan).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["doan"] });
      const log = buildAuditLogger(user?.user_id, user?.ho_ten);
      log({ doan_id: data.id, action: "tao", table_name: "doan", record_id: data.id, mo_ta: `Tạo đoàn: ${data.ten_doan}` });
    },
  });
}

export function useUpdateDoan() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const { data: qtPaidSet } = useDoanQuyetToanPaidSet();
  return useMutation({
    mutationFn: async ({ id, ...updates }: DoanInsert & { id: number }) => {
      // 1. Fetch OLD để detect so_khach change + lấy ngay_di/ve cho bao_hiem + diff log
      const { data: oldDoan, error: oldErr } = await externalSupabase
        .from("doan")
        .select("ten_doan, agent_id, agent_huy_id, dia_diem_id, huong_dan_vien_id, huong_dan_vien_id_2, xe_id, xe_id_2, seri_id, chuyen_bay_don, chuyen_bay_tien, so_khach_lon, so_khach_em1, so_khach_em2, so_khach_tl, ngay_di, ngay_ve, trang_thai, ghi_chu, ghi_chu_dieu_tour, van_phong_id, loai_tour, thi_truong, shopping")
        .eq("id", id)
        .single();
      if (oldErr) throw oldErr;

      const oldTotal = (oldDoan.so_khach_lon ?? 0) + (oldDoan.so_khach_em1 ?? 0)
                    + (oldDoan.so_khach_em2 ?? 0) + (oldDoan.so_khach_tl ?? 0);

      // Đoàn đã quyết toán: đổi số khách sẽ cascade sửa chi phí → chặn (trừ admin).
      // Field khác (ghi chú, agent…) vẫn cho sửa.
      const soKhachKeysGuard = ["so_khach_lon", "so_khach_em1", "so_khach_em2", "so_khach_tl"] as const;
      const soKhachChangedGuard = soKhachKeysGuard.some(
        (k) => updates[k] !== undefined && updates[k] !== oldDoan[k],
      );
      if (soKhachChangedGuard && isChiPhiLocked(user?.role ?? null, qtPaidSet ?? null, id)) {
        throw new Error("Đoàn đã quyết toán — không thể đổi số khách (ảnh hưởng chi phí). Chỉ admin mới sửa được.");
      }

      // 1b. GUARD rút ngắn ngày tour: KHÔNG được cắt mất ngày đang có chi phí đã
      // trả / có ĐNTT, hoặc booking nhà hàng đã gửi. Chạy TRƯỚC mọi ghi DB → throw
      // = chưa đụng gì (caller hiển thị lỗi, không lưu). Số ngày = (ngay_ve - ngay_di + 1).
      {
        const newNgayDi = updates.ngay_di ?? oldDoan.ngay_di;
        const newNgayVe = updates.ngay_ve ?? oldDoan.ngay_ve;
        const datesChanged =
          (updates.ngay_di !== undefined && updates.ngay_di !== oldDoan.ngay_di) ||
          (updates.ngay_ve !== undefined && updates.ngay_ve !== oldDoan.ngay_ve);
        if (datesChanged && newNgayDi && newNgayVe) {
          const parseUTC = (s: string) => {
            const [y, m, d] = s.split("-").map(Number);
            return Date.UTC(y, m - 1, d);
          };
          const newNumDays = Math.max(
            0,
            Math.round((parseUTC(newNgayVe) - parseUTC(newNgayDi)) / 86400000) + 1,
          );
          const { data: droppedDays, error: eDropped } = await externalSupabase
            .from("doan_ngay")
            .select("id, ngay_so")
            .eq("doan_id", id)
            .gt("ngay_so", newNumDays);
          if (eDropped) throw eDropped; // fail-safe: không verify được thì KHÔNG cho rút ngắn
          if (droppedDays && droppedDays.length > 0) {
            const droppedNgaySo = [...new Set(droppedDays.map((r) => r.ngay_so))];
            const droppedNgayIds = droppedDays.map((r) => r.id);
            const blocked: string[] = [];

            // (a) Chi phí có tiền cam kết (đã trả / ĐNTT hiệu lực) trên ngày bị cắt
            const { data: cpRows, error: eCp } = await externalSupabase
              .from("doan_chi_phi")
              .select("id, ngay_so, mo_ta, so_tien_da_tt")
              .eq("doan_id", id)
              .in("ngay_so", droppedNgaySo);
            if (eCp) throw eCp; // fail-safe
            for (const cp of cpRows ?? []) {
              const paid = Number(cp.so_tien_da_tt ?? 0) > 0;
              const activeDnttIds = await getActiveDnttIdsForChiPhi(cp.id);
              if (paid || activeDnttIds.length > 0) {
                const tag = activeDnttIds.length > 0
                  ? ` (ĐNTT ${activeDnttIds.map((i) => `#${i}`).join(", ")})`
                  : " (đã thanh toán)";
                blocked.push(`ngày ${cp.ngay_so} "${cp.mo_ta}"${tag}`);
              }
            }

            // (b) Booking nhà hàng đã gửi / NH xác nhận trên ngày bị cắt
            const { data: bkNh, error: eBk } = await externalSupabase
              .from("doan_booking_nh")
              .select("id, booking_status")
              .in("doan_ngay_id", droppedNgayIds)
              .in("booking_status", ["da_gui", "nh_xac_nhan"]);
            if (eBk) throw eBk; // fail-safe
            if (bkNh && bkNh.length > 0) {
              blocked.push(`${bkNh.length} booking nhà hàng đã gửi`);
            }

            if (blocked.length > 0) {
              throw new Error(
                `Không thể rút ngắn ngày tour: ngày ${droppedNgaySo.sort((a, b) => a - b).join(", ")} còn ràng buộc — ${blocked.join("; ")}. ` +
                `Hủy ĐNTT/booking và gỡ các bữa khỏi những ngày đó trước khi rút ngắn.`,
              );
            }
          }
        }
      }

      // 2. UPDATE doan
      const { data, error } = await externalSupabase.from("doan").update(updates).eq("id", id).select().single();
      if (error) throw error;

      // 3. Detect BẤT KỲ so_khach_* field thay đổi
      const soKhachKeys = ["so_khach_lon", "so_khach_em1", "so_khach_em2", "so_khach_tl"] as const;
      const so_khach_changed = soKhachKeys.some(
        (k) => updates[k] !== undefined && updates[k] !== oldDoan[k]
      );
      const newTotal = (data.so_khach_lon ?? 0) + (data.so_khach_em1 ?? 0)
                    + (data.so_khach_em2 ?? 0) + (data.so_khach_tl ?? 0);

      let thucTeClearCount = 0;
      let committedDnttAffected = 0;
      let soKhachMultiNhomSkipped = false;

      // Đoàn nhiều nhóm: số khách mỗi nhóm độc lập, quản lý qua SplitNhomModal
      // ("Chia lại"). Cascade theo "tổng đoàn" sẽ ghi SAI chi phí nhóm-specific
      // (vd NH chỉ 1 nhóm ăn → bị set = tổng đoàn). → SKIP cascade khi >1 nhóm,
      // chỉ update field đoàn. Caller toast hướng dẫn user dùng "Chia lại".
      let nhomCount = 1;
      if (so_khach_changed) {
        const { count } = await externalSupabase
          .from("doan_nhom")
          .select("id", { count: "exact", head: true })
          .eq("doan_id", id);
        nhomCount = count ?? 1;
        if (nhomCount > 1) soKhachMultiNhomSkipped = true;

        // 4.0. Đẩy DELTA số khách vào nhóm thu_tu=1 ("Toàn đoàn"). Nhóm khác giữ
        // nguyên — user dùng "Chia lại" modal nếu cần phân bổ lại.
        // Phép tính: nhom1.field_new = nhom1.field_old + (doan.field_new - doan.field_old)
        const diffLon = (data.so_khach_lon ?? 0) - (oldDoan.so_khach_lon ?? 0);
        const diffEm1 = (data.so_khach_em1 ?? 0) - (oldDoan.so_khach_em1 ?? 0);
        const diffEm2 = (data.so_khach_em2 ?? 0) - (oldDoan.so_khach_em2 ?? 0);
        const diffTl  = (data.so_khach_tl  ?? 0) - (oldDoan.so_khach_tl  ?? 0);
        if (diffLon !== 0 || diffEm1 !== 0 || diffEm2 !== 0 || diffTl !== 0) {
          const { data: nhom1 } = await externalSupabase
            .from("doan_nhom")
            .select("id, so_khach_lon, so_khach_em1, so_khach_em2, so_khach_tl")
            .eq("doan_id", id)
            .eq("thu_tu", 1)
            .maybeSingle();
          if (nhom1) {
            // 1 nhóm → SET nhóm "Toàn đoàn" = đoàn (hết drift cũ); nhiều nhóm → dồn
            // delta vào nhóm 1 để giữ tổng = đoàn. (logic tách ở lib/doan-nhom-sync.ts)
            const nhom1New = resolveNhom1SoKhach({
              nhomCount,
              nhom1: {
                so_khach_lon: nhom1.so_khach_lon ?? 0,
                so_khach_em1: nhom1.so_khach_em1 ?? 0,
                so_khach_em2: nhom1.so_khach_em2 ?? 0,
                so_khach_tl: nhom1.so_khach_tl ?? 0,
              },
              doanOld: {
                so_khach_lon: oldDoan.so_khach_lon ?? 0,
                so_khach_em1: oldDoan.so_khach_em1 ?? 0,
                so_khach_em2: oldDoan.so_khach_em2 ?? 0,
                so_khach_tl: oldDoan.so_khach_tl ?? 0,
              },
              doanNew: {
                so_khach_lon: data.so_khach_lon ?? 0,
                so_khach_em1: data.so_khach_em1 ?? 0,
                so_khach_em2: data.so_khach_em2 ?? 0,
                so_khach_tl: data.so_khach_tl ?? 0,
              },
            });
            await externalSupabase
              .from("doan_nhom")
              .update(nhom1New)
              .eq("id", nhom1.id);
          }
        }
      }

      // Cascade chi phí/item theo TỔNG ĐOÀN chỉ an toàn khi 1 nhóm. Đoàn nhiều
      // nhóm: chi phí nhóm-specific (vd NH chỉ 1 nhóm ăn) sẽ bị set sai = tổng đoàn
      // → SKIP, để SplitNhomModal "Chia lại" + save Điều Tour lo phần cập nhật.
      if (so_khach_changed && nhomCount <= 1) {
        // 4a. Sync doan_ngay_item.so_luong cho items chưa customized (= old total)
        if (oldTotal > 0 && newTotal !== oldTotal) {
          await externalSupabase
            .from("doan_ngay_item")
            .update({ so_luong: newTotal })
            .eq("doan_id", id)
            .eq("so_luong", oldTotal);
        }

        // 4b. Compute soNgay (bao_hiem dùng so_luong = soKhach × soNgay)
        let soNgay = 1;
        const ngayDi = data.ngay_di ?? oldDoan.ngay_di;
        const ngayVe = data.ngay_ve ?? oldDoan.ngay_ve;
        if (ngayDi && ngayVe) {
          const di = new Date(ngayDi);
          const ve = new Date(ngayVe);
          const diffMs = ve.getTime() - di.getTime();
          soNgay = Math.max(1, Math.round(diffMs / 86400000) + 1);
        }

        // 4c. Cascade chi_phi (canh_diem + NH + bao_hiem). Skip override + paid + extras.
        // Extras (DV [dvps_X], NH [trua]/[toi]) là dịch vụ thêm độc lập, KHÔNG sync số khách.
        // Cho_duyet/da_duyet vẫn cascade — caller hiển thị warning toast + UI badge mismatch.
        const { data: chiPhis } = await externalSupabase
          .from("doan_chi_phi")
          .select("id, danh_muc, mo_ta, so_luong, don_gia, tien_cong_ty, tien_hdv, is_overridden, trang_thai_thanh_toan, trang_thai_dntt, foc_khach_snapshot, foc_mien_snapshot, chiet_khau_phan_tram_snapshot")
          .eq("doan_id", id)
          .in("danh_muc", ["canh_diem", "nha_hang", "bao_hiem"]);

        const idsToRecalc: number[] = [];

        for (const cp of chiPhis ?? []) {
          if (cp.is_overridden) continue;
          const tt = cp.trang_thai_thanh_toan;
          if (tt === "paid" || tt === "partial_paid") continue;

          // Skip extras — dịch vụ phát sinh độc lập với tổng số khách
          const moTa = String(cp.mo_ta ?? "");
          if (/^\[dvps_\d+\]\s/.test(moTa)) continue;
          if (moTa.startsWith("[trua] ") || moTa.startsWith("[toi] ")) continue;

          const newSoLuong = cp.danh_muc === "bao_hiem" ? newTotal * soNgay : newTotal;
          if (Number(cp.so_luong) === newSoLuong) continue;

          // Track rows committed-DNTT bị thay đổi → caller toast warning
          const td = cp.trang_thai_dntt;
          if (td === "cho_duyet" || td === "da_duyet") committedDnttAffected++;

          const isHdv = Number(cp.tien_hdv) > 0;
          // PHẢI trừ FOC khi rebooking, nếu không tien_cong_ty (gross) sẽ KHÔNG khớp
          // "Thành tiền"/ĐNTT (đều trừ FOC) → modal/đối soát đọc số gross sai.
          // - NH: trừ FOC + CK (snapshot per-row).
          // - DV (canh_diem): trừ FOC (snapshot per-row) từ 2026-06-20, KHÔNG có CK.
          // - bao_hiem: không FOC → giữ công thức thô.
          let newTotalCp: number;
          if (cp.danh_muc === "nha_hang") {
            const skTT = calcSoKhachThucTe(
              newSoLuong,
              cp.foc_khach_snapshot ?? null,
              cp.foc_mien_snapshot ?? null,
            );
            newTotalCp = applyChietKhau(skTT * Number(cp.don_gia ?? 0), cp.chiet_khau_phan_tram_snapshot ?? null);
          } else if (cp.danh_muc === "canh_diem") {
            const skTT = calcSoKhachThucTe(
              newSoLuong,
              cp.foc_khach_snapshot ?? null,
              cp.foc_mien_snapshot ?? null,
            );
            newTotalCp = skTT * Number(cp.don_gia ?? 0);
          } else {
            newTotalCp = newSoLuong * Number(cp.don_gia ?? 0);
          }
          await externalSupabase.from("doan_chi_phi").update({
            so_luong: newSoLuong,
            tien_cong_ty: isHdv ? 0 : newTotalCp,
            tien_hdv:     isHdv ? newTotalCp : 0,
            thanh_tien_thuc_te: null,
          }).eq("id", cp.id);
          thucTeClearCount++;
          idsToRecalc.push(cp.id);
        }

        // 4d. Recalc statuses cho rows đã update
        if (idsToRecalc.length > 0) {
          await externalSupabase.rpc("recalc_chi_phi_payment_status", { p_chi_phi_ids: idsToRecalc });
        }
      }

      // 5. Cascade ngay_di/ngay_ve → doan_ngay.ngay_date (theo ngay_so)
      // Khi user sửa lại ngày bắt đầu/kết thúc tour, doan_ngay rows phải shift theo.
      // doan_booking_nh, doan_chi_phi đều join qua doan_ngay → tự cập nhật.
      const ngayDiChanged = updates.ngay_di !== undefined && updates.ngay_di !== oldDoan.ngay_di;
      const ngayVeChanged = updates.ngay_ve !== undefined && updates.ngay_ve !== oldDoan.ngay_ve;
      if (ngayDiChanged || ngayVeChanged) {
        const newNgayDi = data.ngay_di;
        const newNgayVe = data.ngay_ve;
        if (newNgayDi && newNgayVe) {
          const thuMap = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];
          const parseUTC = (s: string) => {
            const [y, m, d] = s.split("-").map(Number);
            return new Date(Date.UTC(y, m - 1, d));
          };
          const start = parseUTC(newNgayDi);
          const end = parseUTC(newNgayVe);
          const newNumDays = Math.max(0, Math.round((end.getTime() - start.getTime()) / 86400000) + 1);

          const { data: existingNgay } = await externalSupabase
            .from("doan_ngay")
            .select("id, ngay_so")
            .eq("doan_id", id)
            .order("ngay_so", { ascending: true });
          const existingMap = new Map<number, number>(
            (existingNgay || []).map((r) => [r.ngay_so, r.id])
          );

          // Lấy nhóm "Toàn đoàn" (thu_tu=1) cho INSERT row mới (mở rộng ngày)
          const { data: nhomDefault } = await externalSupabase
            .from("doan_nhom")
            .select("id")
            .eq("doan_id", id)
            .eq("thu_tu", 1)
            .maybeSingle();
          const defaultNhomId = nhomDefault?.id ?? null;

          // Update từng ngay_so có trong newRange → ngay_date + thu mới
          for (let i = 1; i <= newNumDays; i++) {
            const d = new Date(start);
            d.setUTCDate(d.getUTCDate() + (i - 1));
            const dateStr = d.toISOString().split("T")[0];
            const thuStr = thuMap[d.getUTCDay()];
            const existingId = existingMap.get(i);
            if (existingId) {
              await externalSupabase
                .from("doan_ngay")
                .update({ ngay_date: dateStr, thu: thuStr })
                .eq("id", existingId);
            } else {
              if (!defaultNhomId) continue; // không có nhóm → skip insert (sẽ không xảy ra với đoàn hợp lệ)
              await externalSupabase
                .from("doan_ngay")
                .insert({
                  doan_id: id,
                  doan_nhom_id: defaultNhomId,
                  ngay_so: i,
                  ngay_date: dateStr,
                  thu: thuStr,
                });
            }
          }
          // Rows vượt newNumDays (tour ngắn lại) → giữ lại, không tự xóa
          // (có thể còn booking/chi phí đính kèm). User cần xóa thủ công nếu cần.
        }
      }

      // Diff log per field — bỏ qua field undefined (không update)
      const diffLogs: string[] = [];
      const labelTxt = (v: unknown) => (v == null || v === "") ? "—" : String(v);
      if (so_khach_changed && oldTotal !== newTotal) {
        diffLogs.push(`Đổi số khách ${oldTotal} → ${newTotal}`);
      }
      // Các key dưới đây tồn tại trên cả DoanInsert (updates) lẫn oldDoan select.
      const textFields: Array<[keyof DoanInsert, string]> = [
        ["ten_doan", "tên đoàn"],
        ["chuyen_bay_don", "chuyến bay đón"],
        ["chuyen_bay_tien", "chuyến bay tiễn"],
        ["ngay_di", "ngày đi"],
        ["ngay_ve", "ngày về"],
        ["ghi_chu", "ghi chú"],
        ["ghi_chu_dieu_tour", "ghi chú điều tour"],
        ["trang_thai", "trạng thái"],
        ["thi_truong", "thị trường"],
        ["loai_tour", "loại tour"],
      ];
      const oldDoanRec = oldDoan as Record<string, unknown>;
      for (const [k, label] of textFields) {
        const newV = updates[k];
        if (newV === undefined) continue;
        const oldV = oldDoanRec[k];
        if ((oldV ?? "") !== (newV ?? "")) {
          diffLogs.push(`Đổi ${label} "${labelTxt(oldV)}" → "${labelTxt(newV)}"`);
        }
      }
      const idFields: Array<[keyof DoanInsert, string]> = [
        ["agent_id", "agent"],
        ["agent_huy_id", "agent hủy"],
        ["dia_diem_id", "địa điểm"],
        ["huong_dan_vien_id", "HDV"],
        ["huong_dan_vien_id_2", "HDV phụ"],
        ["xe_id", "xe"],
        ["xe_id_2", "xe phụ"],
        ["seri_id", "seri tour"],
        ["van_phong_id", "văn phòng"],
      ];
      for (const [k, label] of idFields) {
        const newV = updates[k];
        if (newV === undefined) continue;
        const oldV = oldDoanRec[k];
        if ((oldV ?? null) !== (newV ?? null)) {
          diffLogs.push(`Đổi ${label}: ${labelTxt(oldV)} → ${labelTxt(newV)}`);
        }
      }
      if (updates.shopping !== undefined && oldDoanRec.shopping !== updates.shopping) {
        diffLogs.push(updates.shopping ? "Bật shopping" : "Tắt shopping");
      }
      // Gộp cascade thành 1 log thay vì log từng chi phí
      if (thucTeClearCount > 0) {
        diffLogs.push(`Cập nhật ${thucTeClearCount} chi phí theo số khách mới`);
      }
      if (diffLogs.length > 0) {
        const log = buildAuditLogger(user?.user_id, user?.ho_ten);
        for (const moTa of diffLogs) {
          log({ doan_id: id, action: "sua", table_name: "doan", record_id: id, mo_ta: moTa });
        }
      }

      return { ...data, thucTeClearCount, committedDnttAffected, soKhachMultiNhomSkipped };
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ["doan"] });
      qc.invalidateQueries({ queryKey: ["doan_nhom", vars.id] });
      qc.invalidateQueries({ queryKey: ["doan_ngay", vars.id] });
      qc.invalidateQueries({ queryKey: ["doan_ngay_item", vars.id] });
      qc.invalidateQueries({ queryKey: ["doan_chi_phi", vars.id] });
      qc.invalidateQueries({ queryKey: ["doan_booking_nh", vars.id] });
      qc.invalidateQueries({ queryKey: ["doan_booking_ks", vars.id] });
      qc.invalidateQueries({ queryKey: ["doan_booking_dv", vars.id] });
      qc.invalidateQueries({ queryKey: ["chi_phi_nh_section", vars.id] });
    },
  });
}

export function useDeleteDoan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const { error } = await externalSupabase.from("doan").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["doan"] }),
  });
}

// Lightweight mutation cho tip fields (dùng từ ChiPhiPhasThuSection để sync 2 chiều
// với Điều tour > TipSection). KHÔNG dùng useUpdateDoan vì nó kéo theo cascade
// so_khach/ngay_di phức tạp không cần thiết cho tip-only update.
export function useUpdateDoanTip() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      ...updates
    }: {
      id: number;
      tip_rate?: number | null;
      tip_so_khach_override?: number | null;
      tip_so_ngay_override?: number | null;
      tip_lump_sum?: number | null;
      tip_currency?: string | null;
      tip_nguoi_thu?: string | null;
      tip_ty_gia?: number | null;
      phai_thu_extras?: unknown;
      dau_khach_rate?: number | null;
      dau_khach_currency?: string | null;
      dau_khach_ty_gia?: number | null;
      dau_khach_nguoi_thu?: string | null;
      dau_khach_so_khach_override?: number | null;
      quy_vp_amount?: number | null;
      quy_vp_currency?: string | null;
      quy_vp_ty_gia?: number | null;
      quy_vp_nguoi_thu?: string | null;
    }) => {
      const { error } = await externalSupabase.from("doan").update(updates).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["doan"] }),
  });
}

// Toggle cờ tay (da_check_quyet_toan / da_thu_visa) ở danh sách đoàn.
// Update nhẹ + optimistic (không cascade, không reload cả list) cho mượt khi tick.
export type DoanFlagField = "da_check_quyet_toan" | "da_thu_visa";
export function useToggleDoanFlag() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, field, value }: { id: number; field: DoanFlagField; value: boolean }) => {
      const { error } = await externalSupabase.from("doan").update({ [field]: value }).eq("id", id);
      if (error) throw error;
    },
    onMutate: async ({ id, field, value }) => {
      await qc.cancelQueries({ queryKey: ["doan"] });
      const prev = qc.getQueriesData({ queryKey: ["doan"] });
      qc.setQueriesData({ queryKey: ["doan"] }, (old: unknown) => {
        if (!Array.isArray(old)) return old;
        return old.map((d) =>
          d && typeof d === "object" && (d as { id?: number }).id === id
            ? { ...(d as object), [field]: value }
            : d,
        );
      });
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      ctx?.prev?.forEach(([key, data]) => qc.setQueryData(key, data));
    },
    onSettled: () => { qc.invalidateQueries({ queryKey: ["doan"] }); },
  });
}

export function useCancelDoan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const { error } = await externalSupabase
        .from("doan")
        .update({ trang_thai: "huy" })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["doan"] }),
  });
}
