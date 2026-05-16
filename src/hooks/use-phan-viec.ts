import { externalSupabase } from "@/lib/supabase-external";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

// Bộ đầu việc phân cho đoàn (rows cong_viec với loai_viec prefix pv_)
// "Người giao" cho việc auto khi tạo đoàn = Hệ thống.
// cong_viec.nguoi_giao KHÔNG có FK → dùng UUID sentinel an toàn.
// Hiển thị "Hệ thống" xử lý ở use-cong-viec (không cần auth.users).
export const SYSTEM_USER_ID = "00000000-0000-0000-0000-000000000000";

export type PvKey = "pv_ks" | "pv_nh_dv" | "pv_xe" | "pv_visa" | "pv_ve_mb";

export const PHAN_VIEC_ITEMS: { key: PvKey; label: string }[] = [
  { key: "pv_ks",    label: "Khách sạn" },
  { key: "pv_nh_dv", label: "Nhà hàng & DV" },
  { key: "pv_xe",    label: "Xe" },
  { key: "pv_visa",  label: "Visa" },
  { key: "pv_ve_mb", label: "Vé máy bay" },
];
const LABEL: Record<string, string> = Object.fromEntries(
  PHAN_VIEC_ITEMS.map((i) => [i.key, i.label]),
);

export interface PvDefault { key: PvKey; label: string; checked: boolean }

// Default theo loại tour (inbound/outbound/noi_dia) — xem DOAN_PHAN_VIEC.md §1
export function defaultPhanViec(loaiTour: string | null | undefined): PvDefault[] {
  // v = hiện trong modal, c = tích sẵn
  const m: Record<PvKey, { v: boolean; c: boolean }> = {
    pv_ks:    { v: true, c: true },
    pv_nh_dv: { v: true, c: true },
    pv_xe:    { v: true, c: true },
    pv_visa:  { v: true, c: false },
    pv_ve_mb: { v: true, c: false },
  };
  if (loaiTour === "outbound") m.pv_visa = { v: true, c: true };
  else if (loaiTour === "inbound") m.pv_ve_mb = { v: false, c: false };
  else if (loaiTour === "noi_dia") m.pv_visa = { v: false, c: false };
  return PHAN_VIEC_ITEMS.filter((i) => m[i.key].v).map((i) => ({
    ...i, checked: m[i.key].c,
  }));
}

// Cột OP của danh sách đoàn = người phụ trách Nhà hàng & DV (pv_nh_dv)
export function useDoanOpMap(doanIds: number[]) {
  const sorted = [...new Set(doanIds)].sort((a, b) => a - b);
  return useQuery({
    queryKey: ["doan_op_map", sorted.join(",")],
    enabled: sorted.length > 0,
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await externalSupabase
        .from("cong_viec")
        .select("doan_id, nguoi_nhan, created_at")
        .eq("loai_viec", "pv_nh_dv")
        .in("doan_id", sorted)
        .neq("trang_thai", "huy")
        .order("created_at", { ascending: false });
      if (error) throw error;
      const byDoan = new Map<number, string>();
      for (const r of (data ?? []) as any[]) {
        if (r.doan_id != null && !byDoan.has(r.doan_id)) byDoan.set(r.doan_id, r.nguoi_nhan);
      }
      const uids = [...new Set([...byDoan.values()])];
      const nameMap = new Map<string, string>();
      if (uids.length) {
        const { data: u } = await externalSupabase
          .from("user_roles").select("user_id, ho_ten").in("user_id", uids);
        (u ?? []).forEach((x: any) => nameMap.set(x.user_id, x.ho_ten ?? x.user_id));
      }
      const out = new Map<number, { user_id: string; ten: string }>();
      byDoan.forEach((uid, did) => out.set(did, { user_id: uid, ten: nameMap.get(uid) ?? "—" }));
      return out;
    },
  });
}

// Người mặc định phụ trách theo cấu hình (user_roles.pv_default_for)
export function useDefaultAssignees() {
  return useQuery({
    queryKey: ["pv_default_assignees"],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await externalSupabase
        .from("user_roles")
        .select("user_id, ho_ten, pv_default_for")
        .eq("active", true)
        .in("pv_default_for", ["pv_xe", "pv_visa", "pv_ve_mb"]);
      if (error) throw error;
      const map: Partial<Record<PvKey, { user_id: string; ten: string }>> = {};
      for (const r of (data ?? []) as any[]) {
        if (!map[r.pv_default_for as PvKey]) {
          map[r.pv_default_for as PvKey] = { user_id: r.user_id, ten: r.ho_ten ?? r.user_id };
        }
      }
      return map;
    },
  });
}

interface CreatePhanViecInput {
  doan: { id: number; ten_doan: string; loai_tour: string | null; ngay_di: string | null };
  creatorId: string;
  creatorName: string;
  assignments: { key: PvKey; assignedTo: string | null }[]; // các mục user giữ lại
}

export function useCreatePhanViec() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (p: CreatePhanViecInput) => {
      const { doan } = p;

      // Idempotent: bỏ qua loai_viec đã tồn tại (chưa huỷ) cho đoàn này
      const { data: existing } = await externalSupabase
        .from("cong_viec")
        .select("loai_viec")
        .eq("doan_id", doan.id)
        .like("loai_viec", "pv_%")
        .neq("trang_thai", "huy");
      const done = new Set((existing ?? []).map((r: any) => r.loai_viec));

      const assigned = p.assignments.filter((a) => a.assignedTo && !done.has(a.key));
      const missing = p.assignments.filter((a) => !a.assignedTo && !done.has(a.key));

      // Tên người được giao (cho summary giám đốc)
      const uids = [...new Set(assigned.map((a) => a.assignedTo!))];
      const nameMap = new Map<string, string>();
      if (uids.length) {
        const { data: u } = await externalSupabase
          .from("user_roles").select("user_id, ho_ten").in("user_id", uids);
        (u ?? []).forEach((x: any) => nameMap.set(x.user_id, x.ho_ten ?? x.user_id));
      }

      // 1) Mục có người → cong_viec + thong_bao cho người nhận
      for (const a of assigned) {
        const { data: cv, error } = await externalSupabase
          .from("cong_viec")
          .insert({
            tieu_de: `[${LABEL[a.key]}] ${doan.ten_doan}`,
            mo_ta: `Phụ trách ${LABEL[a.key]} cho đoàn ${doan.ten_doan}`,
            doan_id: doan.id,
            nguoi_giao: SYSTEM_USER_ID,
            nguoi_nhan: a.assignedTo,
            loai_viec: a.key,
            do_uu_tien: "binh_thuong",
            han_xu_ly: doan.ngay_di || null,
            trang_thai: "cho_nhan",
          })
          .select("id")
          .single();
        if (error) throw error;
        await externalSupabase.from("thong_bao").insert({
          user_id: a.assignedTo,
          cong_viec_id: cv.id,
          doan_id: doan.id,
          doan_ten: doan.ten_doan,
          loai: "giao_viec",
          tieu_de: `Đoàn ${doan.ten_doan}: bạn phụ trách ${LABEL[a.key]}`,
          noi_dung: `Giao tự động bởi Hệ thống (tạo đoàn ${doan.ten_doan})`,
          is_read: false,
        });
      }

      // 2) Mục thiếu người → giao điều-phối (la_dieu_phoi; fallback giám đốc)
      if (missing.length) {
        let { data: dp } = await externalSupabase
          .from("user_roles").select("user_id").eq("active", true).eq("la_dieu_phoi", true);
        if (!dp || dp.length === 0) {
          const { data: gd } = await externalSupabase
            .from("user_roles").select("user_id").eq("active", true).eq("role", "giam_doc");
          dp = gd ?? [];
        }
        const missLabels = missing.map((a) => LABEL[a.key]).join(", ");
        for (const d of dp) {
          const { data: cv, error } = await externalSupabase
            .from("cong_viec")
            .insert({
              tieu_de: `Đoàn ${doan.ten_doan}: cần phân người`,
              mo_ta: `Đầu việc chưa có người: ${missLabels}. Vui lòng phân người phụ trách.`,
              doan_id: doan.id,
              nguoi_giao: SYSTEM_USER_ID,
              nguoi_nhan: d.user_id,
              loai_viec: "pv_phancong",
              do_uu_tien: "cao",
              han_xu_ly: doan.ngay_di || null,
              trang_thai: "cho_nhan",
            })
            .select("id")
            .single();
          if (error) throw error;
          await externalSupabase.from("thong_bao").insert({
            user_id: d.user_id,
            cong_viec_id: cv.id,
            doan_id: doan.id,
            doan_ten: doan.ten_doan,
            loai: "giao_viec",
            tieu_de: `Đoàn ${doan.ten_doan}: cần phân người (${missLabels})`,
            noi_dung: `Giao tự động bởi Hệ thống (tạo đoàn ${doan.ten_doan})`,
            is_read: false,
          });
        }
      }

      // 3) Giám đốc → thông báo thông tin đoàn + ai phụ trách gì (không tạo việc)
      const { data: directors } = await externalSupabase
        .from("user_roles").select("user_id").eq("active", true).eq("role", "giam_doc");
      const summary = [
        ...assigned.map((a) => `${LABEL[a.key]}: ${nameMap.get(a.assignedTo!) ?? "?"}`),
        ...(missing.length ? [`⚠ Thiếu người: ${missing.map((a) => LABEL[a.key]).join(", ")}`] : []),
      ].join(" · ");
      for (const g of directors ?? []) {
        await externalSupabase.from("thong_bao").insert({
          user_id: g.user_id,
          doan_id: doan.id,
          doan_ten: doan.ten_doan,
          loai: "thong_tin_doan",
          tieu_de: `Đoàn mới: ${doan.ten_doan}`,
          noi_dung: summary || "Chưa phân việc",
          is_read: false,
        });
      }

      return { assignedCount: assigned.length, missingCount: missing.length };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["cong_viec"] });
      qc.invalidateQueries({ queryKey: ["thong_bao"] });
      qc.invalidateQueries({ queryKey: ["doan_op_map"] });
    },
  });
}
