import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { externalSupabase } from "@/lib/supabase-external";

export interface DeadlineItem {
  type: "ks" | "nh" | "dv";       // type HIỂN THỊ (icon) — tàu ngày = "ks"
  rpcType: "ks" | "nh" | "dv";    // bảng NGUỒN thật để route mark_deadline_done
                                  // (tàu ngày lưu ở doan_booking_nh → "nh")
  bookingId: number;
  doanId: number;
  doanName: string;
  label: string;
  deadline: string;
  status: string;
}

// Quan hệ join doan: select chỉ lấy ten_doan + trang_thai. Supabase trả về
// object hoặc null tuỳ FK; chuẩn hoá thành shape tối thiểu cần dùng.
type JoinedDoan = { ten_doan: string | null; trang_thai: string | null } | null;
// Đoàn đã huỷ → không còn deadline cần đuổi NCC
const isDoanHuy = (row: { doan: JoinedDoan }) => row.doan?.trang_thai === "huy";
// Chỉ booking ĐÃ GỬI mới có deadline thật. Chưa gửi / không đặt → bỏ qua.
const ksSent = (r: { ks_final_status: string; ks_dat_truoc_status: string }) =>
  r.ks_final_status !== "chua_gui" || r.ks_dat_truoc_status !== "chua_gui";
const nhSent = (r: { booking_status: string }) =>
  r.booking_status !== "chua_gui" && r.booking_status !== "khong_dat";
const dvSent = (r: { booking_status: string }) => r.booking_status !== "chua_dat";

// Supabase trả quan hệ join là object hoặc array (tuỳ FK) — chuẩn hoá về 1 object.
function asJoined(rel: unknown): JoinedDoan {
  const o = Array.isArray(rel) ? rel[0] : rel;
  if (o == null || typeof o !== "object") return null;
  return o as NonNullable<JoinedDoan>;
}
// Quan hệ join chỉ cần `ten` (+ `loai` cho nhà hàng).
function asNamed(rel: unknown): { ten: string | null; loai?: string | null } | null {
  const o = Array.isArray(rel) ? rel[0] : rel;
  if (o == null || typeof o !== "object") return null;
  return o as { ten: string | null; loai?: string | null };
}

// Map loai nhà hàng → (type hiển thị, rpcType bảng nguồn).
// Tàu ngày (du thuyền) hiển thị icon "KS" nhưng vẫn lưu ở doan_booking_nh nên
// mark_deadline_done PHẢI route "nh". Nhầm → UPDATE doan_booking_ks 0 rows → lỗi.
export function nhDeadlineTypes(loai: string | null | undefined): {
  type: "ks" | "nh";
  rpcType: "nh";
} {
  return { type: loai === "tau_ngay" ? "ks" : "nh", rpcType: "nh" };
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
          .select("id, doan_id, deadline, ks_final_status, ks_dat_truoc_status, khach_san:khach_san_id(ten), doan:doan_id(ten_doan, trang_thai)")
          .in("doan_id", doanIds)
          .not("deadline", "is", null)
          .is("deadline_done_at", null),

        externalSupabase
          .from("doan_booking_nh")
          .select("id, doan_id, deadline, booking_status, bua_an, nha_hang:nha_hang_id(ten, loai), doan:doan_id(ten_doan, trang_thai)")
          .in("doan_id", doanIds)
          .not("deadline", "is", null)
          .is("deadline_done_at", null),

        externalSupabase
          .from("doan_booking_dv")
          .select("id, doan_id, deadline, booking_status, ten_nha_cung_cap, doan:doan_id(ten_doan, trang_thai)")
          .in("doan_id", doanIds)
          .not("deadline", "is", null)
          .is("deadline_done_at", null),
      ]);

      const items: DeadlineItem[] = [];

      for (const row of ksRes.data ?? []) {
        if (isDoanHuy(row) || !ksSent(row)) continue;
        items.push({
          type: "ks",
          rpcType: "ks",
          bookingId: row.id,
          doanId: row.doan_id,
          doanName: asJoined(row.doan)?.ten_doan ?? "",
          label: asNamed(row.khach_san)?.ten ?? "Khách sạn",
          deadline: row.deadline ?? "",
          status: row.ks_final_status,
        });
      }

      for (const row of nhRes.data ?? []) {
        if (isDoanHuy(row) || !nhSent(row)) continue;
        const buaLabel = row.bua_an === "trua" ? "Trưa" : "Tối";
        const loai = asNamed(row.nha_hang)?.loai ?? "nha_hang";
        items.push({
          ...nhDeadlineTypes(loai),   // luôn ở doan_booking_nh, kể cả tàu ngày
          bookingId: row.id,
          doanId: row.doan_id,
          doanName: asJoined(row.doan)?.ten_doan ?? "",
          label: `${asNamed(row.nha_hang)?.ten ?? (loai === "tau_ngay" ? "Tàu ngày" : "Nhà hàng")} (${buaLabel})`,
          deadline: row.deadline ?? "",
          status: row.booking_status,
        });
      }

      for (const row of dvRes.data ?? []) {
        if (isDoanHuy(row) || !dvSent(row)) continue;
        items.push({
          type: "dv",
          rpcType: "dv",
          bookingId: row.id,
          doanId: row.doan_id,
          doanName: asJoined(row.doan)?.ten_doan ?? "",
          label: row.ten_nha_cung_cap ?? "",
          deadline: row.deadline ?? "",
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
      const norm = (s: unknown) => (s == null ? "" : String(s)).trim().toLowerCase();
      const me = norm(hoTen);
      const [ksRes, nhRes, dvRes] = await Promise.all([
        externalSupabase
          .from("doan_booking_ks")
          .select("id, doan_id, deadline, ks_final_status, ks_dat_truoc_status, ks_final_sent_by, ks_dat_truoc_sent_by, khach_san:khach_san_id(ten), doan:doan_id(ten_doan, trang_thai)")
          .not("deadline", "is", null).is("deadline_done_at", null),
        externalSupabase
          .from("doan_booking_nh")
          .select("id, doan_id, deadline, booking_status, bua_an, sent_by, dat_truoc_sent_by, final_sent_by, nha_hang:nha_hang_id(ten, loai), doan:doan_id(ten_doan, trang_thai)")
          .not("deadline", "is", null).is("deadline_done_at", null),
        externalSupabase
          .from("doan_booking_dv")
          .select("id, doan_id, deadline, booking_status, sent_by, ten_nha_cung_cap, doan:doan_id(ten_doan, trang_thai)")
          .not("deadline", "is", null).is("deadline_done_at", null),
      ]);
      const items: DeadlineItem[] = [];
      for (const row of ksRes.data ?? []) {
        if (isDoanHuy(row) || !ksSent(row)) continue;
        if (![row.ks_final_sent_by, row.ks_dat_truoc_sent_by].some((v) => norm(v) === me)) continue;
        items.push({
          type: "ks", rpcType: "ks", bookingId: row.id, doanId: row.doan_id,
          doanName: asJoined(row.doan)?.ten_doan ?? "",
          label: asNamed(row.khach_san)?.ten ?? "Khách sạn",
          deadline: row.deadline ?? "", status: row.ks_final_status,
        });
      }
      for (const row of nhRes.data ?? []) {
        if (isDoanHuy(row) || !nhSent(row)) continue;
        if (![row.sent_by, row.dat_truoc_sent_by, row.final_sent_by].some((v) => norm(v) === me)) continue;
        const buaLabel = row.bua_an === "trua" ? "Trưa" : "Tối";
        const loai = asNamed(row.nha_hang)?.loai ?? "nha_hang";
        items.push({
          ...nhDeadlineTypes(loai), bookingId: row.id, doanId: row.doan_id,
          doanName: asJoined(row.doan)?.ten_doan ?? "",
          label: `${asNamed(row.nha_hang)?.ten ?? (loai === "tau_ngay" ? "Tàu ngày" : "Nhà hàng")} (${buaLabel})`,
          deadline: row.deadline ?? "", status: row.booking_status,
        });
      }
      for (const row of dvRes.data ?? []) {
        if (isDoanHuy(row) || !dvSent(row)) continue;
        if (norm(row.sent_by) !== me) continue;
        items.push({
          type: "dv", rpcType: "dv", bookingId: row.id, doanId: row.doan_id,
          doanName: asJoined(row.doan)?.ten_doan ?? "",
          label: row.ten_nha_cung_cap ?? "", deadline: row.deadline ?? "", status: row.booking_status,
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
      // Deadline hiển thị từ 2 query (phân việc + booking mình tự gửi/tạo) — phải
      // invalidate cả 2, nếu không item vẫn nằm lại dù RPC đã set deadline_done_at.
      qc.invalidateQueries({ queryKey: ["my_deadlines"] });
      qc.invalidateQueries({ queryKey: ["my_created_deadlines"] });
    },
  });
}
