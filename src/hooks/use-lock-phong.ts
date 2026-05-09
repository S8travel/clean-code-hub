import { externalSupabase } from "@/lib/supabase-external";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { BOOKING_CC } from "@/lib/booking-cc";

// ── Types ──

export interface LockPhong {
  id: number;
  ten_seri: string;
  seri_id: number | null;
  ten_doan: string;
  ngay_xuat_phat: string; // "yyyy-MM-dd"
  deadline: string | null; // "yyyy-MM-dd"
  ghi_chu: string | null;
  created_by: string | null;
  created_at: string;
}

export interface LockPhongKS {
  id: number;
  lock_phong_id: number;
  khach_san_id: number;
  check_in: string; // "yyyy-MM-dd"
  check_out: string; // "yyyy-MM-dd"
  so_phong: string | null;
  tinh_trang_phong: string | null;
  code_ncc: string | null;
  ghi_chu: string | null;
  email_status: string; // 'chua_gui' | 'cho_xac_nhan' | 'da_xac_nhan' | 'da_huy'
  email_sent_at: string | null;
  email_sent_by: string | null;
  email_confirm_at: string | null;
  email_thread_id: string | null;
  created_at: string;
}

export interface LockPhongKSDisplay extends LockPhongKS {
  khach_san_ten: string;
  khach_san_email: string | null;
  khach_san_dia_diem: string | null;
  so_dem: number; // computed: days between check_in and check_out
}

export interface LockPhongDisplay extends LockPhong {
  hotels: LockPhongKSDisplay[];
}

export interface LockPhongKSInput {
  id?: number; // existing id for update
  khach_san_id: number;
  check_in: string;
  check_out: string;
  so_phong?: string;
  tinh_trang_phong?: string;
  code_ncc?: string;
  ghi_chu?: string;
}

const QK = "lock_phong_list";

// ── Helpers ──

function calcSoDem(checkIn: string, checkOut: string): number {
  try {
    const a = new Date(checkIn + "T00:00:00");
    const b = new Date(checkOut + "T00:00:00");
    const diff = Math.round((b.getTime() - a.getTime()) / 86400000);
    return diff > 0 ? diff : 0;
  } catch {
    return 0;
  }
}

// ── Queries ──

export function useLockPhongList() {
  return useQuery<LockPhongDisplay[]>({
    queryKey: [QK],
    queryFn: async () => {
      // 1. Fetch all lock_phong records
      const { data: records, error: e1 } = await externalSupabase
        .from("lock_phong")
        .select("*")
        .order("ngay_xuat_phat", { ascending: false });
      if (e1) throw e1;
      if (!records || records.length === 0) return [];

      const ids = (records as any[]).map((r) => r.id);

      // 2. Fetch all lock_phong_ks rows
      const { data: ksRows, error: e2 } = await externalSupabase
        .from("lock_phong_ks")
        .select("*")
        .in("lock_phong_id", ids)
        .order("id", { ascending: true });
      if (e2) throw e2;

      if (!ksRows || ksRows.length === 0) {
        return (records as any[]).map((r): LockPhongDisplay => ({ ...r, hotels: [] }));
      }

      // 3. Fetch khach_san info
      const allKsIds = [...new Set((ksRows as any[]).map((r) => r.khach_san_id))];
      const { data: ksList, error: e3 } = await externalSupabase
        .from("khach_san")
        .select("id, ten, email, dia_diem")
        .in("id", allKsIds);
      if (e3) throw e3;

      const ksMap = new Map(((ksList || []) as any[]).map((k) => [k.id, k]));

      // 4. Group ks rows by lock_phong_id
      const ksGrouped = new Map<number, LockPhongKSDisplay[]>();
      for (const ks of ksRows as any[]) {
        if (!ksGrouped.has(ks.lock_phong_id)) ksGrouped.set(ks.lock_phong_id, []);
        const info = ksMap.get(ks.khach_san_id) || ({} as any);
        ksGrouped.get(ks.lock_phong_id)!.push({
          ...ks,
          khach_san_ten: info.ten || "—",
          khach_san_email: info.email || null,
          khach_san_dia_diem: info.dia_diem || null,
          so_dem: calcSoDem(ks.check_in, ks.check_out),
        });
      }

      // 5. Merge
      return (records as any[]).map((r): LockPhongDisplay => ({
        ...r,
        hotels: ksGrouped.get(r.id) || [],
      }));
    },
  });
}

// ── Mutations ──

export function useCreateLockPhong() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      header,
      hotels,
    }: {
      header: {
        ten_seri: string;
        seri_id: number | null;
        ten_doan: string;
        ngay_xuat_phat: string;
        deadline?: string | null;
        ghi_chu?: string;
      };
      hotels: LockPhongKSInput[];
    }) => {
      const { data: auth } = await externalSupabase.auth.getUser();
      const { data: newRecord, error: e1 } = await externalSupabase
        .from("lock_phong")
        .insert({ ...header, created_by: auth.user?.id || null })
        .select()
        .single();
      if (e1) throw e1;

      if (hotels.length > 0) {
        const inserts = hotels.map(({ id: _id, ...h }) => ({
          lock_phong_id: (newRecord as any).id,
          khach_san_id: h.khach_san_id,
          check_in: h.check_in,
          check_out: h.check_out,
          so_phong: h.so_phong || null,
          tinh_trang_phong: h.tinh_trang_phong || null,
          code_ncc: h.code_ncc || null,
          ghi_chu: h.ghi_chu || null,
        }));
        const { error: e2 } = await externalSupabase.from("lock_phong_ks").insert(inserts);
        if (e2) throw e2;
      }

      return newRecord as LockPhong;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [QK] }),
  });
}

export function useUpdateLockPhong() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      header,
      hotels,
    }: {
      id: number;
      header: {
        ten_seri: string;
        seri_id: number | null;
        ten_doan: string;
        ngay_xuat_phat: string;
        deadline?: string | null;
        ghi_chu?: string;
      };
      hotels: LockPhongKSInput[];
    }) => {
      // Update header
      const { error: e1 } = await externalSupabase
        .from("lock_phong")
        .update(header)
        .eq("id", id);
      if (e1) throw e1;

      // Delete all existing ks rows and re-insert
      // (simpler than reconciling — avoids sending-status issues)
      const existingIds = hotels.filter((h) => h.id).map((h) => h.id!);
      const allExisting = await externalSupabase
        .from("lock_phong_ks")
        .select("id")
        .eq("lock_phong_id", id);
      if (allExisting.error) throw allExisting.error;

      const existingInDB = ((allExisting.data || []) as any[]).map((r) => r.id);
      const toDelete = existingInDB.filter((dbId) => !existingIds.includes(dbId));

      if (toDelete.length > 0) {
        const { error: eDel } = await externalSupabase
          .from("lock_phong_ks")
          .delete()
          .in("id", toDelete);
        if (eDel) throw eDel;
      }

      // Upsert each hotel row
      for (const h of hotels) {
        if (h.id) {
          // Update existing (preserve email fields)
          const { error } = await externalSupabase
            .from("lock_phong_ks")
            .update({
              khach_san_id: h.khach_san_id,
              check_in: h.check_in,
              check_out: h.check_out,
              so_phong: h.so_phong || null,
              tinh_trang_phong: h.tinh_trang_phong || null,
              code_ncc: h.code_ncc || null,
              ghi_chu: h.ghi_chu || null,
            })
            .eq("id", h.id);
          if (error) throw error;
        } else {
          // Insert new
          const { error } = await externalSupabase.from("lock_phong_ks").insert({
            lock_phong_id: id,
            khach_san_id: h.khach_san_id,
            check_in: h.check_in,
            check_out: h.check_out,
            so_phong: h.so_phong || null,
            tinh_trang_phong: h.tinh_trang_phong || null,
            code_ncc: h.code_ncc || null,
            ghi_chu: h.ghi_chu || null,
          });
          if (error) throw error;
        }
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [QK] }),
  });
}

export function useDeleteLockPhong() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const { error } = await externalSupabase.from("lock_phong").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [QK] }),
  });
}

export function useUpdateLockPhongKSEmail() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      fields,
    }: {
      id: number;
      fields: Partial<Pick<LockPhongKS, "email_status" | "email_confirm_at">>;
    }) => {
      const { error } = await externalSupabase
        .from("lock_phong_ks")
        .update(fields)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [QK] }),
  });
}

// ── Deadline alerts ──

/** Returns locks belonging to currentUserId with deadline within the next `withinDays` days */
export function useLockPhongDeadlineAlerts(currentUserId: string | null, withinDays = 3) {
  const { data = [] } = useLockPhongList();
  if (!currentUserId) return [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const limit = new Date(today);
  limit.setDate(limit.getDate() + withinDays);
  return data.filter((lp) => {
    if (lp.created_by !== currentUserId) return false;
    if (!lp.deadline) return false;
    const dl = new Date(lp.deadline + "T00:00:00");
    return dl >= today && dl <= limit;
  });
}

// ── Email ──

const SUPABASE_EDGE_URL = "https://lflsbwoqzmbknzdpaequ.supabase.co/functions/v1";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxmbHNid29xem1ia256ZHBhZXF1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM3MDAzNzcsImV4cCI6MjA4OTI3NjM3N30.RLsKYfH6XZw3Mcmk2fm1R6rKKzrtm0MLrYhtjIT--T0";

export function useSendLockPhongBatchEmail() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: {
      ksIds: number[];
      to: string;
      subject: string;
      html: string;
      sentBy: string;
      replyTo?: string;
    }) => {
      if (params.ksIds.length === 0) return;
      const threadId = crypto.randomUUID();

      const res = await fetch(`${SUPABASE_EDGE_URL}/send-booking-email`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({
          to: params.to,
          cc: BOOKING_CC.ks,
          subject: params.subject,
          html: params.html,
          replyTo: params.replyTo,
          messageId: threadId,
        }),
      });

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(errText || "Lỗi gửi email qua server");
      }
      const data = await res.json();
      if (data?.error) throw new Error(data.error);

      const now = new Date().toISOString();
      const { error } = await externalSupabase
        .from("lock_phong_ks")
        .update({
          email_status: "cho_xac_nhan",
          email_sent_at: now,
          email_sent_by: params.sentBy,
          email_thread_id: threadId,
        })
        .in("id", params.ksIds);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [QK] }),
  });
}

export function useSendLockPhongEmail() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: {
      lockPhongKsId: number;
      to: string;
      subject: string;
      html: string;
      sentBy: string;
      replyTo?: string;
      emailThreadId?: string | null;
    }) => {
      const isFirst = !params.emailThreadId;
      const newThreadId = isFirst ? crypto.randomUUID() : null;

      const res = await fetch(`${SUPABASE_EDGE_URL}/send-booking-email`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({
          to: params.to,
          cc: BOOKING_CC.ks,
          subject: params.subject,
          html: params.html,
          replyTo:
            params.replyTo ||
            (await externalSupabase.auth.getSession()).data.session?.user?.email ||
            undefined,
          ...(isFirst
            ? { messageId: newThreadId }
            : { inReplyTo: params.emailThreadId }),
        }),
      });

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(errText || "Lỗi gửi email qua server");
      }
      const data = await res.json();
      if (data?.error) throw new Error(data.error);

      const threadId = isFirst ? newThreadId : params.emailThreadId;
      const now = new Date().toISOString();

      const { error } = await externalSupabase
        .from("lock_phong_ks")
        .update({
          email_status: "cho_xac_nhan",
          email_sent_at: now,
          email_sent_by: params.sentBy,
          email_thread_id: threadId,
        })
        .eq("id", params.lockPhongKsId);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [QK] }),
  });
}
