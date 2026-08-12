import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { parseISO, isToday, isBefore, differenceInDays } from "date-fns";
import { externalSupabase } from "@/lib/supabase-external";
import { useMyPhanViecScope } from "@/hooks/use-phan-viec";

/**
 * Nhóm deadline theo độ gấp. Badge sidebar + tab Deadline đếm mọi nhóm TRỪ "later"
 * → phải dùng CHUNG hàm này, đừng chép lại (chép chính là gốc của bug badge lệch).
 */
export function deadlineGroup(deadline: string): "overdue" | "today" | "week" | "later" {
  const d = parseISO(deadline);
  const now = new Date(); now.setHours(0, 0, 0, 0);
  if (isBefore(d, now)) return "overdue";
  if (isToday(d)) return "today";
  if (differenceInDays(d, now) <= 7) return "week";
  return "later";
}

/**
 * Hợp nhất deadline "mình phụ trách (phân việc)" + "booking mình tự gửi/tạo".
 *
 * - Phần phân việc phải lọc lại theo scope: được giao pv_ks thì chỉ nhận deadline KS.
 * - Dedupe theo BẢNG NGUỒN thật (`rpcType`) chứ không theo `type` hiển thị — id của
 *   doan_booking_ks và doan_booking_nh là 2 sequence riêng nên có thể trùng số, dedupe
 *   theo type sẽ gộp nhầm tàu ngày (lưu ở bảng nh, hiện icon ks) với khách sạn.
 */
export function mergeMyDeadlines(
  pvDeadlines: DeadlineItem[],
  pvScope: Map<number, Set<"ks" | "nh" | "dv">> | undefined,
  createdDeadlines: DeadlineItem[],
): DeadlineItem[] {
  const pvPart = pvDeadlines.filter((it) => pvScope?.get(it.doanId)?.has(it.type) ?? false);
  const map = new Map<string, DeadlineItem>();
  for (const it of [...pvPart, ...createdDeadlines]) map.set(`${it.rpcType}-${it.bookingId}`, it);
  return [...map.values()].sort((a, b) => a.deadline.localeCompare(b.deadline));
}

/** Số deadline CẦN XỬ LÝ = mọi nhóm trừ "later". Dùng cho badge + tab. */
export function countDeadlineCanXuLy(items: DeadlineItem[]): number {
  return items.filter((d) => deadlineGroup(d.deadline) !== "later").length;
}

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

// Quan hệ join doan: select lấy ten_doan + trang_thai + ngay_ve. Supabase trả về
// object hoặc null tuỳ FK; chuẩn hoá thành shape tối thiểu cần dùng.
type JoinedDoan = { ten_doan: string | null; trang_thai: string | null; ngay_ve?: string | null } | null;
// Đoàn đã huỷ → không còn deadline cần đuổi NCC
const isDoanHuy = (row: { doan: JoinedDoan }) => row.doan?.trang_thai === "huy";

/** Hôm nay dạng YYYY-MM-DD theo giờ máy — KHÔNG dùng toISOString() (quy sang UTC,
 *  tối muộn ở VN sẽ ra ngày hôm trước). */
export function ngayHomNay(d: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/**
 * Đoàn đã về → booking không còn gì để đuổi NCC nữa, ngừng nhắc.
 *
 * Trước đây chỉ lọc đoàn huỷ, nên deadline của đoàn đi xong từ lâu vẫn nằm trong
 * badge/brief ở nhóm "quá hạn" vĩnh viễn — OP không xử lý được mà cũng không tắt
 * được, riết rồi bỏ qua luôn cả cảnh báo thật.
 *
 * `ngay_ve` rỗng → KHÔNG đoán, vẫn nhắc như cũ. So sánh chuỗi YYYY-MM-DD (đúng
 * định dạng DB trả về) nên không dính lệch múi giờ.
 * Ngày về = hôm nay thì VẪN nhắc; chỉ tắt từ hôm sau trở đi.
 */
export function isDoanDaVe(row: { doan: JoinedDoan }, homNay: string = ngayHomNay()): boolean {
  const ngayVe = row.doan?.ngay_ve;
  return !!ngayVe && ngayVe < homNay;
}

/** Deadline của đoàn này còn đáng nhắc không (chưa huỷ + chưa về). */
export function conDangNhac(row: { doan: JoinedDoan }, homNay: string = ngayHomNay()): boolean {
  return !isDoanHuy(row) && !isDoanDaVe(row, homNay);
}
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
          .select("id, doan_id, deadline, ks_final_status, ks_dat_truoc_status, khach_san:khach_san_id(ten), doan:doan_id(ten_doan, trang_thai, ngay_ve)")
          .in("doan_id", doanIds)
          .not("deadline", "is", null)
          .is("deadline_done_at", null),

        externalSupabase
          .from("doan_booking_nh")
          .select("id, doan_id, deadline, booking_status, bua_an, nha_hang:nha_hang_id(ten, loai), doan:doan_id(ten_doan, trang_thai, ngay_ve)")
          .in("doan_id", doanIds)
          .not("deadline", "is", null)
          .is("deadline_done_at", null),

        externalSupabase
          .from("doan_booking_dv")
          .select("id, doan_id, deadline, booking_status, ten_nha_cung_cap, doan:doan_id(ten_doan, trang_thai, ngay_ve)")
          .in("doan_id", doanIds)
          .not("deadline", "is", null)
          .is("deadline_done_at", null),
      ]);

      const items: DeadlineItem[] = [];

      for (const row of ksRes.data ?? []) {
        if (!conDangNhac(row) || !ksSent(row)) continue;
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
        if (!conDangNhac(row) || !nhSent(row)) continue;
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
        if (!conDangNhac(row) || !dvSent(row)) continue;
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
          .select("id, doan_id, deadline, ks_final_status, ks_dat_truoc_status, ks_final_sent_by, ks_dat_truoc_sent_by, khach_san:khach_san_id(ten), doan:doan_id(ten_doan, trang_thai, ngay_ve)")
          .not("deadline", "is", null).is("deadline_done_at", null),
        externalSupabase
          .from("doan_booking_nh")
          .select("id, doan_id, deadline, booking_status, bua_an, sent_by, dat_truoc_sent_by, final_sent_by, nha_hang:nha_hang_id(ten, loai), doan:doan_id(ten_doan, trang_thai, ngay_ve)")
          .not("deadline", "is", null).is("deadline_done_at", null),
        externalSupabase
          .from("doan_booking_dv")
          .select("id, doan_id, deadline, booking_status, sent_by, ten_nha_cung_cap, doan:doan_id(ten_doan, trang_thai, ngay_ve)")
          .not("deadline", "is", null).is("deadline_done_at", null),
      ]);
      const items: DeadlineItem[] = [];
      for (const row of ksRes.data ?? []) {
        if (!conDangNhac(row) || !ksSent(row)) continue;
        if (![row.ks_final_sent_by, row.ks_dat_truoc_sent_by].some((v) => norm(v) === me)) continue;
        items.push({
          type: "ks", rpcType: "ks", bookingId: row.id, doanId: row.doan_id,
          doanName: asJoined(row.doan)?.ten_doan ?? "",
          label: asNamed(row.khach_san)?.ten ?? "Khách sạn",
          deadline: row.deadline ?? "", status: row.ks_final_status,
        });
      }
      for (const row of nhRes.data ?? []) {
        if (!conDangNhac(row) || !nhSent(row)) continue;
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
        if (!conDangNhac(row) || !dvSent(row)) continue;
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

/** Số việc giao còn phải làm (nhận về mình, chưa xong). Query đếm thuần — nhẹ. */
export function useGiaoViecPendingCount(uid: string | null | undefined) {
  return useQuery<number>({
    queryKey: ["giao_viec_pending_count", uid],
    enabled: !!uid,
    refetchInterval: 60_000,
    queryFn: async () => {
      const { count, error } = await externalSupabase
        .from("cong_viec")
        .select("id", { count: "exact", head: true })
        .eq("nguoi_nhan", uid!)
        .in("trang_thai", ["cho_nhan", "dang_lam"]);
      if (error) throw error;
      return count ?? 0;
    },
  });
}

/**
 * Badge "Công việc của tôi" = SỐ VIỆC CÒN PHẢI XỬ LÝ (deadline + việc giao),
 * đúng bằng tổng 2 con số trên tab của trang.
 *
 * TRƯỚC 22/07/2026 badge lấy `useThongBaoCount(uid, "giao_viec")` — tức đếm THÔNG BÁO
 * CHƯA ĐỌC, không phải việc. Thông báo chỉ được set is_read khi bấm vào chuông, nên
 * OP xử lý hết việc mà badge vẫn đứng nguyên (ca thật: tab hiện 47+17 nhưng badge 105).
 *
 * Dùng lại ĐÚNG các hook/hàm mà trang dùng (react-query cache chung key nên mở trang
 * không tốn thêm request) — để badge không thể trôi khỏi trang lần nữa.
 */
export function useMyJobCount(uid: string | null | undefined, hoTen: string | null | undefined) {
  const { data: pvScope } = useMyPhanViecScope(uid);
  const pvDoanIds = pvScope ? [...pvScope.keys()] : [];
  const { data: pvDeadlines = [] } = useMyDeadlines(pvDoanIds);
  const { data: createdDeadlines = [] } = useMyCreatedBookingDeadlines(hoTen);
  const { data: giaoViecPending = 0 } = useGiaoViecPendingCount(uid);

  const deadlineCount = countDeadlineCanXuLy(
    mergeMyDeadlines(pvDeadlines, pvScope, createdDeadlines),
  );
  return deadlineCount + giaoViecPending;
}
