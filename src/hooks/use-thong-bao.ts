import { useEffect, useRef } from "react";
import { externalSupabase } from "@/lib/supabase-external";
import { useQuery, useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { showDesktopNotif } from "@/lib/desktop-notify";

export interface ThongBaoRow {
  id: number;
  user_id: string;
  log_id: number | null;
  doan_id: number | null;
  doan_ten: string | null;
  loai: string;
  tieu_de: string;
  noi_dung: string | null;
  is_read: boolean;
  created_at: string;
  cong_viec_id: number | null;
  dntt_id: number | null;
  lead_id: number | null;
  /** Đối tác yêu cầu sửa một báo giá — chuông trỏ về /bao-gia/:id. */
  bao_gia_id: number | null;
}

const QK = "thong_bao";

export function useThongBaoList(userId: string | null | undefined) {
  return useQuery<ThongBaoRow[]>({
    queryKey: [QK, userId],
    enabled: !!userId,
    refetchInterval: 60_000,
    queryFn: async () => {
      const { data, error } = await externalSupabase
        .from("thong_bao")
        .select("*")
        .eq("user_id", userId!)
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return data as ThongBaoRow[];
    },
  });
}

const PAGE_SIZE = 30;

// Trang "Tất cả thông báo" — phân trang server-side theo tab.
// Điều kiện loai phải khớp TAB_FILTER (src/lib/thong-bao-utils.ts) — sửa 1 bên thì sửa cả 2.
export function useThongBaoInfinite(userId: string | null | undefined, tab: string) {
  return useInfiniteQuery({
    queryKey: [QK, "infinite", userId, tab],
    enabled: !!userId,
    initialPageParam: 0,
    queryFn: async ({ pageParam }) => {
      let q = externalSupabase
        .from("thong_bao")
        .select("*", { count: "exact" })
        .eq("user_id", userId!);
      if (tab === "deadline") {
        q = q.or("loai.like.deadline%,loai.in.(lead_qua_han,lead_follow_up_today)");
      } else if (tab === "cong_viec") {
        q = q.in("loai", ["giao_viec", "dntt_can_duyet", "thong_tin_doan"]);
      } else if (tab === "khac") {
        q = q
          .not("loai", "like", "deadline%")
          .not("loai", "in", "(giao_viec,dntt_can_duyet,thong_tin_doan,lead_qua_han,lead_follow_up_today)");
      }
      const { data, error, count } = await q
        .order("created_at", { ascending: false })
        .range(pageParam, pageParam + PAGE_SIZE - 1);
      if (error) throw error;
      return { rows: (data ?? []) as ThongBaoRow[], total: count ?? 0, offset: pageParam };
    },
    getNextPageParam: (last) =>
      last.offset + PAGE_SIZE < last.total ? last.offset + PAGE_SIZE : undefined,
  });
}

export function useThongBaoCount(userId: string | null | undefined, loai?: string) {
  return useQuery<number>({
    queryKey: [QK, "count", userId, loai],
    enabled: !!userId,
    refetchInterval: 60_000,
    queryFn: async () => {
      let q = externalSupabase
        .from("thong_bao")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId!)
        .eq("is_read", false);
      if (loai) q = q.eq("loai", loai);
      const { count, error } = await q;
      if (error) throw error;
      return count ?? 0;
    },
  });
}

export function useMarkThongBaoRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ userId, loai }: { userId: string; loai?: string }) => {
      let q = externalSupabase
        .from("thong_bao")
        .update({ is_read: true })
        .eq("user_id", userId)
        .eq("is_read", false);
      if (loai) q = q.eq("loai", loai);
      const { error } = await q;
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [QK] });
    },
  });
}

// Tổng unread của user (mọi loại) — alias rõ nghĩa cho header bell
export function useThongBaoTotalUnread(userId: string | null | undefined) {
  return useThongBaoCount(userId);
}

// Mark all unread = read (không filter loại)
export function useMarkAllRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (userId: string) => {
      const { error } = await externalSupabase
        .from("thong_bao")
        .update({ is_read: true })
        .eq("user_id", userId)
        .eq("is_read", false);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [QK] }),
  });
}

// Mark single notification = read
export function useMarkOneRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const { error } = await externalSupabase
        .from("thong_bao")
        .update({ is_read: true })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [QK] }),
  });
}

// Realtime subscribe: mỗi INSERT vào thong_bao của user →
//  - invalidate queries (chuông in-app cập nhật ngay)
//  - bắn popup desktop (Tier 1, chỉ khi user đã bật & không focus app)
// onClickNotif: callback khi user click vào popup desktop (điều hướng).
// getNotifUrl: resolve URL đích cho đường SW (Android — click xử lý trong SW,
// không gọi được onClickNotif).
export function useRealtimeThongBao(
  userId: string | null | undefined,
  onClickNotif?: (row: ThongBaoRow) => void,
  getNotifUrl?: (row: ThongBaoRow) => string | null,
) {
  const qc = useQueryClient();
  // Ref để channel callback (đăng ký 1 lần) luôn gọi handler mới nhất.
  const cbRef = useRef(onClickNotif);
  const urlRef = useRef(getNotifUrl);
  useEffect(() => {
    cbRef.current = onClickNotif;
    urlRef.current = getNotifUrl;
  }, [onClickNotif, getNotifUrl]);

  useQuery({
    queryKey: [QK, "realtime_sub", userId],
    enabled: !!userId,
    queryFn: () => {
      const channel = externalSupabase
        .channel(`thong_bao_user_${userId}`)
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "thong_bao",
            filter: `user_id=eq.${userId}`,
          },
          (payload) => {
            qc.invalidateQueries({ queryKey: [QK] });
            const row = payload.new as ThongBaoRow | undefined;
            if (row?.id) {
              showDesktopNotif(
                {
                  id: row.id,
                  title: row.tieu_de,
                  body: row.noi_dung,
                  url: urlRef.current?.(row) ?? null,
                },
                () => cbRef.current?.(row),
              );
            }
          },
        )
        .subscribe();
      return channel;
    },
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });
}
