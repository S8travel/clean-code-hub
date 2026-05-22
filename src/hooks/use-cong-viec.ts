import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { externalSupabase } from "@/lib/supabase-external";
import { SYSTEM_USER_ID } from "@/hooks/use-phan-viec";

// ── Types ──────────────────────────────────────────────────────────────────────

export interface CongViecRow {
  id: number;
  tieu_de: string;
  mo_ta: string | null;
  doan_id: number | null;
  nguoi_giao: string;
  nguoi_nhan: string;
  loai_viec: string;
  do_uu_tien: string;
  han_xu_ly: string | null;
  trang_thai: string;
  ghi_chu_ket_qua: string | null;
  created_at: string;
  updated_at: string;
  // Enriched
  ten_nguoi_giao: string | null;
  ten_nguoi_nhan: string | null;
  ten_doan: string | null;
  comment_count: number;
}

export interface CongViecComment {
  id: number;
  cong_viec_id: number;
  user_id: string;
  noi_dung: string;
  created_at: string;
  ho_ten: string | null;
}

export interface UserForAssign {
  user_id: string;
  ho_ten: string;
  role: string;
  bo_phan: string | null;
}

// ── Query keys ─────────────────────────────────────────────────────────────────

export const CV_QK = "cong_viec";
export const CV_CMT_QK = "cong_viec_comment";
export const USER_ASSIGN_QK = "user_roles_active";

// ── Helpers ────────────────────────────────────────────────────────────────────

// Ưu tiên → số để sort
const UU_TIEN_ORDER: Record<string, number> = {
  khan_cap: 0, cao: 1, binh_thuong: 2, thap: 3,
};

// ── Hooks ──────────────────────────────────────────────────────────────────────

export function useCongViecList(userId: string | null | undefined) {
  return useQuery<CongViecRow[]>({
    queryKey: [CV_QK, userId],
    enabled: !!userId,
    refetchInterval: 30_000,
    queryFn: async () => {
      // Fetch tasks
      const { data: tasks, error } = await externalSupabase
        .from("cong_viec")
        .select("*")
        .or(`nguoi_giao.eq.${userId},nguoi_nhan.eq.${userId}`)
        .order("created_at", { ascending: false });
      if (error) throw error;
      if (!tasks || tasks.length === 0) return [];

      // Collect unique user ids
      const userIds = [...new Set(tasks.flatMap((t) => [t.nguoi_giao, t.nguoi_nhan]))];
      const { data: userRoles } = await externalSupabase
        .from("user_roles")
        .select("user_id, ho_ten")
        .in("user_id", userIds);
      const nameMap: Record<string, string> = {};
      (userRoles ?? []).forEach((u) => { nameMap[u.user_id] = u.ho_ten ?? u.user_id; });

      // Collect doan ids
      const doanIds = [...new Set(tasks.map((t) => t.doan_id).filter((id): id is number => id != null))];
      const doanNameMap: Record<number, string> = {};
      if (doanIds.length > 0) {
        const { data: doans } = await externalSupabase
          .from("doan")
          .select("id, ten_doan")
          .in("id", doanIds);
        (doans ?? []).forEach((d) => { doanNameMap[d.id] = d.ten_doan ?? ""; });
      }

      // Fetch comment counts
      const taskIds = tasks.map((t) => t.id);
      const { data: commentCounts } = await externalSupabase
        .from("cong_viec_comment")
        .select("cong_viec_id")
        .in("cong_viec_id", taskIds);
      const countMap: Record<number, number> = {};
      (commentCounts ?? []).forEach((c) => {
        countMap[c.cong_viec_id] = (countMap[c.cong_viec_id] ?? 0) + 1;
      });

      return tasks.map((t): CongViecRow => ({
        ...t,
        created_at: t.created_at ?? "",
        updated_at: t.updated_at ?? "",
        ten_nguoi_giao: t.nguoi_giao === SYSTEM_USER_ID ? "Hệ thống" : (nameMap[t.nguoi_giao] ?? null),
        ten_nguoi_nhan: nameMap[t.nguoi_nhan] ?? null,
        ten_doan: t.doan_id ? (doanNameMap[t.doan_id] ?? null) : null,
        comment_count: countMap[t.id] ?? 0,
      })).sort((a: CongViecRow, b: CongViecRow) => {
        const pa = UU_TIEN_ORDER[a.do_uu_tien] ?? 2;
        const pb = UU_TIEN_ORDER[b.do_uu_tien] ?? 2;
        if (pa !== pb) return pa - pb;
        if (a.han_xu_ly && b.han_xu_ly) return a.han_xu_ly.localeCompare(b.han_xu_ly);
        if (a.han_xu_ly) return -1;
        if (b.han_xu_ly) return 1;
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      });
    },
  });
}

export function useCongViecComments(congViecId: number | null | undefined) {
  return useQuery<CongViecComment[]>({
    queryKey: [CV_CMT_QK, congViecId],
    enabled: !!congViecId,
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await externalSupabase
        .from("cong_viec_comment")
        .select("*")
        .eq("cong_viec_id", congViecId!)
        .order("created_at", { ascending: true });
      if (error) throw error;
      if (!data || data.length === 0) return [];

      const userIds = [...new Set(data.map((c) => c.user_id))];
      const { data: userRoles } = await externalSupabase
        .from("user_roles")
        .select("user_id, ho_ten")
        .in("user_id", userIds);
      const nameMap: Record<string, string> = {};
      (userRoles ?? []).forEach((u) => { nameMap[u.user_id] = u.ho_ten ?? ""; });

      return data.map((c): CongViecComment => ({
        ...c,
        created_at: c.created_at ?? "",
        ho_ten: nameMap[c.user_id] ?? null,
      }));
    },
  });
}

export function useUserListForAssign() {
  return useQuery<UserForAssign[]>({
    queryKey: [USER_ASSIGN_QK],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await externalSupabase
        .from("user_roles")
        .select("user_id, ho_ten, role, bo_phan")
        .eq("active", true)
        .order("ho_ten");
      if (error) throw error;
      return (data ?? []).map((u): UserForAssign => ({
        user_id: u.user_id,
        ho_ten: u.ho_ten ?? u.user_id,
        role: u.role,
        bo_phan: u.bo_phan,
      }));
    },
  });
}

// ── Mutations ──────────────────────────────────────────────────────────────────

interface CreateCongViecPayload {
  tieu_de: string;
  mo_ta?: string;
  doan_id?: number | null;
  nguoi_giao: string;
  nguoi_nhan: string;
  loai_viec: string;
  do_uu_tien: string;
  han_xu_ly?: string | null;
  ten_nguoi_giao: string;
  ten_doan?: string | null;
}

export function useCreateCongViec() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (p: CreateCongViecPayload) => {
      const { data, error } = await externalSupabase
        .from("cong_viec")
        .insert({
          tieu_de: p.tieu_de,
          mo_ta: p.mo_ta || null,
          doan_id: p.doan_id || null,
          nguoi_giao: p.nguoi_giao,
          nguoi_nhan: p.nguoi_nhan,
          loai_viec: p.loai_viec,
          do_uu_tien: p.do_uu_tien,
          han_xu_ly: p.han_xu_ly || null,
          trang_thai: "cho_nhan",
        })
        .select("id")
        .single();
      if (error) throw error;

      // Thông báo cho người nhận
      await externalSupabase.from("thong_bao").insert({
        user_id: p.nguoi_nhan,
        cong_viec_id: data.id,
        loai: "giao_viec",
        tieu_de: `Bạn có việc mới: ${p.tieu_de}`,
        noi_dung: `Giao bởi: ${p.ten_nguoi_giao}${p.ten_doan ? ` · Đoàn: ${p.ten_doan}` : ""}`,
        is_read: false,
      });

      return data;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: [CV_QK, vars.nguoi_giao] });
      qc.invalidateQueries({ queryKey: [CV_QK, vars.nguoi_nhan] });
      qc.invalidateQueries({ queryKey: ["thong_bao", "count", vars.nguoi_nhan] });
    },
  });
}

interface UpdateStatusPayload {
  id: number;
  trang_thai: "dang_lam" | "hoan_thanh" | "tu_choi";
  ghi_chu_ket_qua?: string;
  userId: string;
  nguoi_giao: string;
  nguoi_nhan: string;
  tieu_de: string;
  ten_nguoi_nhan: string;
}

export function useUpdateCongViecStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (p: UpdateStatusPayload) => {
      const { error } = await externalSupabase
        .from("cong_viec")
        .update({
          trang_thai: p.trang_thai,
          ghi_chu_ket_qua: p.ghi_chu_ket_qua || null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", p.id);
      if (error) throw error;

      const statusText: Record<string, string> = {
        dang_lam: "đã nhận việc",
        hoan_thanh: "đã hoàn thành",
        tu_choi: "không thể làm",
      };

      // Thông báo cho người giao
      await externalSupabase.from("thong_bao").insert({
        user_id: p.nguoi_giao,
        cong_viec_id: p.id,
        loai: "cap_nhat_viec",
        tieu_de: `${p.ten_nguoi_nhan} ${statusText[p.trang_thai] ?? "đã cập nhật"}: ${p.tieu_de}`,
        noi_dung: p.ghi_chu_ket_qua || null,
        is_read: false,
      });
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: [CV_QK, vars.nguoi_giao] });
      qc.invalidateQueries({ queryKey: [CV_QK, vars.nguoi_nhan] });
      qc.invalidateQueries({ queryKey: ["thong_bao", "count", vars.nguoi_giao] });
    },
  });
}

interface CreateCommentPayload {
  cong_viec_id: number;
  user_id: string;
  noi_dung: string;
  ho_ten: string;
  notify_user_id: string; // người còn lại
  tieu_de_task: string;
}

export function useCreateCongViecComment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (p: CreateCommentPayload) => {
      const { error } = await externalSupabase
        .from("cong_viec_comment")
        .insert({
          cong_viec_id: p.cong_viec_id,
          user_id: p.user_id,
          noi_dung: p.noi_dung,
        });
      if (error) throw error;

      // Cập nhật updated_at trên task
      await externalSupabase
        .from("cong_viec")
        .update({ updated_at: new Date().toISOString() })
        .eq("id", p.cong_viec_id);

      // Thông báo cho người còn lại
      await externalSupabase.from("thong_bao").insert({
        user_id: p.notify_user_id,
        cong_viec_id: p.cong_viec_id,
        loai: "comment_viec",
        tieu_de: `${p.ho_ten} bình luận: ${p.tieu_de_task}`,
        noi_dung: p.noi_dung.slice(0, 100),
        is_read: false,
      });
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: [CV_CMT_QK, vars.cong_viec_id] });
      qc.invalidateQueries({ queryKey: ["thong_bao", "count", vars.notify_user_id] });
    },
  });
}
