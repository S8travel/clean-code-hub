import { useQuery } from "@tanstack/react-query";
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
          .not("deadline", "is", null),

        externalSupabase
          .from("doan_booking_nh")
          .select("id, doan_id, deadline, booking_status, bua_an, nha_hang:nha_hang_id(ten), doan:doan_id(ten_doan)")
          .in("doan_id", doanIds)
          .not("deadline", "is", null),

        externalSupabase
          .from("doan_booking_dv")
          .select("id, doan_id, deadline, booking_status, ten_nha_cung_cap, doan:doan_id(ten_doan)")
          .in("doan_id", doanIds)
          .not("deadline", "is", null),
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
        items.push({
          type: "nh",
          bookingId: row.id,
          doanId: row.doan_id,
          doanName: (row.doan as any)?.ten_doan ?? "",
          label: `${(row.nha_hang as any)?.ten ?? "Nhà hàng"} (${buaLabel})`,
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
