import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { externalSupabase } from "@/lib/supabase-external";

export interface DeadlineItem {
  type: "ks" | "nh" | "dv";
  bookingId: number;
  doanId: number;
  doanName: string;
  label: string;
  deadline: string;
  status: string;
}

export function useMyDeadlines(doanIds: number[]) {
  return useQuery<DeadlineItem[]>({
    queryKey: ["my_deadlines", doanIds],
    enabled: doanIds.length > 0,
    staleTime: 30_000,
    queryFn: async () => {
      const [ksRes, nhRes, dvRes] = await Promise.all([
        externalSupabase
          .from("doan_booking_ks")
          .select("id, doan_id, deadline, ks_final_status, khach_san:khach_san_id(ten), doan:doan_id(ten_doan)")
          .in("doan_id", doanIds)
          .not("deadline", "is", null)
          .is("deadline_done_at", null),

        externalSupabase
          .from("doan_booking_nh")
          .select("id, doan_id, deadline, booking_status, bua_an, nha_hang:nha_hang_id(ten, loai), doan:doan_id(ten_doan)")
          .in("doan_id", doanIds)
          .not("deadline", "is", null)
          .is("deadline_done_at", null),

        externalSupabase
          .from("doan_booking_dv")
          .select("id, doan_id, deadline, booking_status, ten_nha_cung_cap, doan:doan_id(ten_doan)")
          .in("doan_id", doanIds)
          .not("deadline", "is", null)
          .is("deadline_done_at", null),
      ]);

      const items: DeadlineItem[] = [];

      for (const row of ksRes.data ?? []) {
        items.push({
          type: "ks",
          bookingId: row.id,
          doanId: row.doan_id,
          doanName: (row.doan as any)?.ten_doan ?? "",
          label: (row.khach_san as any)?.ten ?? "Khách sạn",
          deadline: row.deadline,
          status: row.ks_final_status,
        });
      }

      for (const row of nhRes.data ?? []) {
        const buaLabel = row.bua_an === "trua" ? "Trưa" : "Tối";
        const loai = (row.nha_hang as any)?.loai ?? "nha_hang";
        items.push({
          type: loai === "tau_ngay" ? "ks" : "nh",
          bookingId: row.id,
          doanId: row.doan_id,
          doanName: (row.doan as any)?.ten_doan ?? "",
          label: `${(row.nha_hang as any)?.ten ?? (loai === "tau_ngay" ? "Tàu ngày" : "Nhà hàng")} (${buaLabel})`,
          deadline: row.deadline,
          status: row.booking_status,
        });
      }

      for (const row of dvRes.data ?? []) {
        items.push({
          type: "dv",
          bookingId: row.id,
          doanId: row.doan_id,
          doanName: (row.doan as any)?.ten_doan ?? "",
          label: row.ten_nha_cung_cap,
          deadline: row.deadline,
          status: row.booking_status,
        });
      }

      return items.sort((a, b) => a.deadline.localeCompare(b.deadline));
    },
  });
}

// Deadline của booking do CHÍNH user gửi/tạo (theo *_sent_by = ho_ten),
// bất kể phân việc. Shape giống useMyDeadlines để merge + dedupe.
export function useMyCreatedBookingDeadlines(hoTen: string | null | undefined) {
  return useQuery<DeadlineItem[]>({
    queryKey: ["my_created_deadlines", hoTen],
    enabled: !!hoTen,
    staleTime: 30_000,
    queryFn: async () => {
      const norm = (s: any) => (s == null ? "" : String(s)).trim().toLowerCase();
      const me = norm(hoTen);
      const [ksRes, nhRes, dvRes] = await Promise.all([
        externalSupabase
          .from("doan_booking_ks")
          .select("id, doan_id, deadline, ks_final_status, ks_final_sent_by, ks_dat_truoc_sent_by, khach_san:khach_san_id(ten), doan:doan_id(ten_doan)")
          .not("deadline", "is", null).is("deadline_done_at", null),
        externalSupabase
          .from("doan_booking_nh")
          .select("id, doan_id, deadline, booking_status, bua_an, sent_by, dat_truoc_sent_by, final_sent_by, nha_hang:nha_hang_id(ten, loai), doan:doan_id(ten_doan)")
          .not("deadline", "is", null).is("deadline_done_at", null),
        externalSupabase
          .from("doan_booking_dv")
          .select("id, doan_id, deadline, booking_status, sent_by, ten_nha_cung_cap, doan:doan_id(ten_doan)")
          .not("deadline", "is", null).is("deadline_done_at", null),
      ]);
      const items: DeadlineItem[] = [];
      for (const row of ksRes.data ?? []) {
        if (![row.ks_final_sent_by, row.ks_dat_truoc_sent_by].some((v) => norm(v) === me)) continue;
        items.push({
          type: "ks", bookingId: row.id, doanId: row.doan_id,
          doanName: (row.doan as any)?.ten_doan ?? "",
          label: (row.khach_san as any)?.ten ?? "Khách sạn",
          deadline: row.deadline, status: row.ks_final_status,
        });
      }
      for (const row of nhRes.data ?? []) {
        if (![row.sent_by, row.dat_truoc_sent_by, row.final_sent_by].some((v) => norm(v) === me)) continue;
        const buaLabel = row.bua_an === "trua" ? "Trưa" : "Tối";
        const loai = (row.nha_hang as any)?.loai ?? "nha_hang";
        items.push({
          type: loai === "tau_ngay" ? "ks" : "nh", bookingId: row.id, doanId: row.doan_id,
          doanName: (row.doan as any)?.ten_doan ?? "",
          label: `${(row.nha_hang as any)?.ten ?? (loai === "tau_ngay" ? "Tàu ngày" : "Nhà hàng")} (${buaLabel})`,
          deadline: row.deadline, status: row.booking_status,
        });
      }
      for (const row of dvRes.data ?? []) {
        if (norm(row.sent_by) !== me) continue;
        items.push({
          type: "dv", bookingId: row.id, doanId: row.doan_id,
          doanName: (row.doan as any)?.ten_doan ?? "",
          label: row.ten_nha_cung_cap, deadline: row.deadline, status: row.booking_status,
        });
      }
      return items.sort((a, b) => a.deadline.localeCompare(b.deadline));
    },
  });
}

export function useMarkDeadlineDone() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ type, bookingId }: { type: "ks" | "nh" | "dv"; bookingId: number }) => {
      // RPC SECURITY DEFINER — tránh trường hợp RLS UPDATE silent fail
      const { data, error } = await externalSupabase.rpc("mark_deadline_done", {
        p_type: type,
        p_booking_id: bookingId,
      });
      if (error) throw error;
      if (!data || data === 0) {
        throw new Error("Không update được — booking có thể đã bị xoá");
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["my_deadlines"] });
    },
  });
}
