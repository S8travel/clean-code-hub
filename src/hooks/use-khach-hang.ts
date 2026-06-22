import { externalSupabase } from "@/lib/supabase-external";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { Database } from "@/lib/database.types";
import { normalizePhone } from "@/lib/phone";

export type KhachHang = Database["public"]["Tables"]["khach_hang"]["Row"];
export type KhachHangInsert = Database["public"]["Tables"]["khach_hang"]["Insert"];
export type KhachHangUpdate = Database["public"]["Tables"]["khach_hang"]["Update"];
export type KhachHangWithStats = Database["public"]["Views"]["khach_hang_with_stats"]["Row"];

const QK = "khach_hang";

// ── Danh sách + thống kê (view derived) ─────────────────────────────────────
export function useKhachHangList() {
  return useQuery<KhachHangWithStats[]>({
    queryKey: [QK, "list"],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await externalSupabase
        .from("khach_hang_with_stats")
        .select("*")
        .order("ho_ten", { ascending: true });
      if (error) throw error;
      return data as KhachHangWithStats[];
    },
  });
}

export function useKhachHang(id: number | null | undefined) {
  return useQuery<KhachHangWithStats | null>({
    queryKey: [QK, "detail", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await externalSupabase
        .from("khach_hang_with_stats")
        .select("*")
        .eq("id", id!)
        .maybeSingle();
      if (error) throw error;
      return data as KhachHangWithStats | null;
    },
  });
}

// ── Lịch sử: các lead + đoàn gắn với 1 khách ────────────────────────────────
export interface KhachHangLeadRow {
  id: number;
  ho_ten: string;
  trang_thai: string;
  loai_tour: string;
  created_at: string | null;
  doan_id: number | null;
}
export interface KhachHangDoanRow {
  id: number;
  ten_doan: string | null;
  trang_thai: string | null;
  ngay_di: string | null;
  ngay_ve: string | null;
}
export interface KhachHangHistory {
  leads: KhachHangLeadRow[];
  doans: KhachHangDoanRow[];
}

export function useKhachHangHistory(id: number | null | undefined) {
  return useQuery<KhachHangHistory>({
    queryKey: [QK, "history", id],
    enabled: !!id,
    queryFn: async () => {
      const [leadsRes, doansRes] = await Promise.all([
        externalSupabase
          .from("lead")
          .select("id, ho_ten, trang_thai, loai_tour, created_at, doan_id")
          .eq("khach_hang_id", id!)
          .order("created_at", { ascending: false }),
        externalSupabase
          .from("doan")
          .select("id, ten_doan, trang_thai, ngay_di, ngay_ve")
          .eq("khach_hang_id", id!)
          .order("ngay_di", { ascending: false, nullsFirst: false }),
      ]);
      if (leadsRes.error) throw leadsRes.error;
      if (doansRes.error) throw doansRes.error;
      return {
        leads: (leadsRes.data ?? []) as KhachHangLeadRow[],
        doans: (doansRes.data ?? []) as KhachHangDoanRow[],
      };
    },
  });
}

// ── Dedup: tìm khách theo SĐT (gợi ý "khách cũ" lúc tạo/liên kết lead) ───────
export function useFindKhachHangByPhone(phone: string | null | undefined) {
  const norm = normalizePhone(phone);
  return useQuery<KhachHangWithStats[]>({
    queryKey: [QK, "by-phone", norm],
    enabled: norm.length >= 6, // chỉ tra khi SĐT đủ dài, tránh match rác
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await externalSupabase
        .from("khach_hang_with_stats")
        .select("*")
        .eq("sdt_norm", norm);
      if (error) throw error;
      return data as KhachHangWithStats[];
    },
  });
}

// ── Mutations ───────────────────────────────────────────────────────────────
export function useCreateKhachHang() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: KhachHangInsert) => {
      const { data, error } = await externalSupabase
        .from("khach_hang")
        .insert(payload)
        .select()
        .single();
      if (error) throw error;
      return data as KhachHang;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [QK] }),
  });
}

// Patch cho update: bỏ field generated/khóa (id, sdt_norm) khỏi Update để rest
// destructuring không vỡ (id?: never trong type generated).
export type KhachHangPatch = Omit<KhachHangUpdate, "id" | "sdt_norm">;

export function useUpdateKhachHang() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...patch }: KhachHangPatch & { id: number }) => {
      const { error } = await externalSupabase
        .from("khach_hang")
        .update(patch)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [QK] }),
  });
}

export function useDeleteKhachHang() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const { error } = await externalSupabase.from("khach_hang").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [QK] }),
  });
}

// Gắn / gỡ liên kết 1 lead với 1 khách hàng
export function useLinkLeadKhachHang() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ leadId, khachHangId }: { leadId: number; khachHangId: number | null }) => {
      const { error } = await externalSupabase
        .from("lead")
        .update({ khach_hang_id: khachHangId })
        .eq("id", leadId);
      if (error) throw error;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["leads"] });
      qc.invalidateQueries({ queryKey: ["lead", vars.leadId] });
      qc.invalidateQueries({ queryKey: [QK] });
    },
  });
}
