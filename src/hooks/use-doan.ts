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
  loai_tour: "inbound" | "outbound" | "noi_dia" | null;
  created_at?: string;
}

export interface DoanInsert {
  ten_doan: string;
  agent_id?: number | null;
  agent_huy_id?: number | null;
  dia_diem_id?: number | null;
  huong_dan_vien_id?: number | null;
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
  shopping?: boolean | null;
}

export interface LookupItem {
  id: number;
  ten: string;
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
    queryFn: async () => {
      const { data, error } = await externalSupabase.from("agents").select("id, ten").order("ten");
      if (error) throw error;
      return data as AgentItem[];
    },
  });
}

export function useDiaDiem() {
  return useQuery({
    queryKey: ["dia_diem"],
    queryFn: async () => {
      const { data, error } = await externalSupabase.from("dia_diem").select("id, ten").order("ten");
      if (error) throw error;
      return data as LookupItem[];
    },
  });
}

export function useHuongDanVien() {
  return useQuery({
    queryKey: ["huong_dan_vien"],
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

      const nhaXeMap = Object.fromEntries((nhaXe ?? []).map((n: any) => [n.id, n.ten]));
      return (loaiXe ?? []).map((x: any) => ({
        ...x,
        nha_xe: { id: x.nha_xe_id, ten: nhaXeMap[x.nha_xe_id] ?? "" },
      })) as any[];
    },
  });
}

export function useTrangThai() {
  return useQuery({
    queryKey: ["trang_thai"],
    queryFn: async () => {
      const { data, error } = await externalSupabase.from("trang_thai").select("id, ten").order("ten");
      if (error) throw error;
      return data as LookupItem[];
    },
  });
}

export function useUserRoles() {
  return useQuery({
    queryKey: ["user_roles"],
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

// Doan list — vanPhongId=null → no filter (admin/no office); vanPhongId=number → filter by office
export function useDoanList(vanPhongId?: number | null) {
  return useQuery({
    queryKey: ["doan", vanPhongId ?? null],
    queryFn: async () => {
      let query = externalSupabase
        .from("doan")
        .select(`
          *,
          agents:agent_id(id, ten),
          agent_huy:agent_huy_id(id, ten),
          dia_diem:dia_diem_id(ten),
          huong_dan_vien:huong_dan_vien_id(id, ten),
          xe:xe_id(id, ten_xe, so_cho, nha_xe:nha_xe_id(id, ten, email, so_dien_thoai))
        `);
      if (vanPhongId != null) {
        query = query.or(`van_phong_id.eq.${vanPhongId},van_phong_id.is.null`);
      }
      const { data, error } = await query.order("ngay_di", { ascending: true });
      if (error) {
        console.error("useDoanList error:", JSON.stringify(error));
        throw error;
      }
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
      log({ doan_id: (data as any).id, action: "tao", table_name: "doan", record_id: (data as any).id, mo_ta: `Tạo đoàn: ${(data as any).ten_doan}` });
    },
  });
}

export function useUpdateDoan() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async ({ id, ...updates }: DoanInsert & { id: number }) => {
      const { data, error } = await externalSupabase.from("doan").update(updates).eq("id", id).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: (data, vars) => {
      qc.invalidateQueries({ queryKey: ["doan"] });
      const log = buildAuditLogger(user?.user_id, user?.ho_ten);
      log({ doan_id: vars.id, action: "sua", table_name: "doan", record_id: vars.id, mo_ta: `Cập nhật thông tin đoàn` });
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
