import { useEffect } from "react";
import { externalSupabase } from "@/lib/supabase-external";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { buildAuditLogger } from "@/hooks/use-activity-log";

export interface Doan {
  id: number;
  ten_doan: string;
  agent_id: number | null;
  agent_huy_id: number | null;
  dia_diem_id: number | null;
  huong_dan_vien_id: number | null;
  huong_dan_vien_id_2: number | null;
  xe_id: number | null;
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
// vanPhongId=null → no filter; number → only doan có cùng van_phong_id.
// SCOPE filter cả 2 áp dụng cùng lúc (caller pass từ useDoanScope).
export function useDoanList(
  phanLoaiTour?: string[] | null,
  vanPhongId?: number | null,
) {
  return useQuery({
    queryKey: ["doan", phanLoaiTour ?? null, vanPhongId ?? null],
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
          xe:xe_id(id, ten_xe, so_cho, nha_xe:nha_xe_id(id, ten, email, so_dien_thoai, nha_cung_cap_id)),
          van_phong:van_phong_id(id, ten)
        `);
      if (phanLoaiTour && phanLoaiTour.length > 0) {
        query = query.in("thi_truong", phanLoaiTour);
      }
      if (vanPhongId != null) {
        query = query.eq("van_phong_id", vanPhongId);
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
  return useMutation({
    mutationFn: async ({ id, ...updates }: DoanInsert & { id: number }) => {
      // 1. Fetch OLD để detect so_khach change + lấy ngay_di/ve cho bao_hiem + diff log
      const { data: oldDoan, error: oldErr } = await externalSupabase
        .from("doan")
        .select("ten_doan, agent_id, agent_huy_id, dia_diem_id, huong_dan_vien_id, huong_dan_vien_id_2, xe_id, seri_id, chuyen_bay_don, chuyen_bay_tien, so_khach_lon, so_khach_em1, so_khach_em2, so_khach_tl, ngay_di, ngay_ve, trang_thai, ghi_chu, ghi_chu_dieu_tour, van_phong_id, loai_tour, thi_truong, shopping")
        .eq("id", id)
        .single();
      if (oldErr) throw oldErr;

      const oldTotal = (oldDoan.so_khach_lon ?? 0) + (oldDoan.so_khach_em1 ?? 0)
                    + (oldDoan.so_khach_em2 ?? 0) + (oldDoan.so_khach_tl ?? 0);

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

      if (so_khach_changed) {
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
          .select("id, danh_muc, mo_ta, so_luong, don_gia, tien_cong_ty, tien_hdv, is_overridden, trang_thai_thanh_toan, trang_thai_dntt")
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
          const newTotalCp = newSoLuong * Number(cp.don_gia ?? 0);
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
              await externalSupabase
                .from("doan_ngay")
                .insert({ doan_id: id, ngay_so: i, ngay_date: dateStr, thu: thuStr });
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

      return { ...data, thucTeClearCount, committedDnttAffected };
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ["doan"] });
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
    }) => {
      const { error } = await externalSupabase.from("doan").update(updates).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["doan"] }),
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
