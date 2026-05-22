import { externalSupabase } from "@/lib/supabase-external";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { TablesInsert } from "@/lib/database.types";

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
  // Vé máy bay LUÔN hiện, KHÔNG tick sẵn (cần thì mới tick) — kể cả inbound
  if (loaiTour === "outbound") m.pv_visa = { v: true, c: true };
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
        .not("trang_thai", "in", "(huy,khong_can)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      const byDoan = new Map<number, string>();
      for (const r of data ?? []) {
        if (r.doan_id != null && !byDoan.has(r.doan_id)) byDoan.set(r.doan_id, r.nguoi_nhan);
      }
      const uids = [...new Set([...byDoan.values()])];
      const nameMap = new Map<string, string>();
      if (uids.length) {
        const { data: u } = await externalSupabase
          .from("user_roles").select("user_id, ho_ten").in("user_id", uids);
        (u ?? []).forEach((x) => nameMap.set(x.user_id, x.ho_ten ?? x.user_id));
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
      for (const r of data ?? []) {
        if (r.pv_default_for == null) continue;
        const key = r.pv_default_for as PvKey;
        if (!map[key]) {
          map[key] = { user_id: r.user_id, ten: r.ho_ten ?? r.user_id };
        }
      }
      return map;
    },
  });
}

// Ma trận phân việc theo đoàn (5 đầu việc) cho trang Theo dõi
export interface PvCell { user_id: string; ten: string; trang_thai: string }

export function useDoanPhanViecMatrix(doanIds: number[]) {
  const sorted = [...new Set(doanIds)].sort((a, b) => a - b);
  return useQuery({
    queryKey: ["doan_phan_viec_matrix", sorted.join(",")],
    enabled: sorted.length > 0,
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await externalSupabase
        .from("cong_viec")
        .select("doan_id, loai_viec, nguoi_nhan, trang_thai, created_at")
        .in("loai_viec", ["pv_ks", "pv_nh_dv", "pv_xe", "pv_visa", "pv_ve_mb"])
        .in("doan_id", sorted)
        .neq("trang_thai", "huy")
        .order("created_at", { ascending: false });
      if (error) throw error;
      const latest = new Map<string, { nguoi_nhan: string; trang_thai: string }>();
      for (const r of data ?? []) {
        const k = `${r.doan_id}|${r.loai_viec}`;
        if (!latest.has(k)) latest.set(k, { nguoi_nhan: r.nguoi_nhan, trang_thai: r.trang_thai });
      }
      const uids = [...new Set([...latest.values()].map((v) => v.nguoi_nhan))];
      const nameMap = new Map<string, string>();
      if (uids.length) {
        const { data: u } = await externalSupabase
          .from("user_roles").select("user_id, ho_ten").in("user_id", uids);
        (u ?? []).forEach((x) => nameMap.set(x.user_id, x.ho_ten ?? x.user_id));
      }
      const out = new Map<number, Partial<Record<PvKey, PvCell>>>();
      latest.forEach((v, k) => {
        const [did, lv] = k.split("|");
        const d = Number(did);
        if (!out.has(d)) out.set(d, {});
        out.get(d)![lv as PvKey] = {
          user_id: v.nguoi_nhan, ten: nameMap.get(v.nguoi_nhan) ?? "—", trang_thai: v.trang_thai,
        };
      });
      return out;
    },
  });
}

// Đánh dấu 1 đầu việc "Không cần" → loại khỏi theo dõi/thông báo sau.
// nguoi_nhan = Hệ thống (rời khỏi MyJob người cũ), trang_thai='khong_can'.
export function useSetPvKhongCan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (p: { doanId: number; doanTen: string; ngayDi: string | null; key: PvKey }) => {
      const { data: ex } = await externalSupabase
        .from("cong_viec")
        .select("id")
        .eq("doan_id", p.doanId).eq("loai_viec", p.key)
        .not("trang_thai", "in", "(huy,khong_can)")
        .order("created_at", { ascending: false }).limit(1).maybeSingle();
      if (ex) {
        await externalSupabase.from("cong_viec")
          .update({
            trang_thai: "khong_can",
            nguoi_nhan: SYSTEM_USER_ID,
            updated_at: new Date().toISOString(),
          })
          .eq("id", ex.id);
      } else {
        await externalSupabase.from("cong_viec").insert({
          tieu_de: `[${LABEL[p.key]}] ${p.doanTen} — Không cần`,
          mo_ta: `${LABEL[p.key]} không cần cho đoàn ${p.doanTen}`,
          doan_id: p.doanId, nguoi_giao: SYSTEM_USER_ID, nguoi_nhan: SYSTEM_USER_ID,
          loai_viec: p.key, do_uu_tien: "thap",
          han_xu_ly: p.ngayDi || null, trang_thai: "khong_can",
        });
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["doan_phan_viec_matrix"] });
      qc.invalidateQueries({ queryKey: ["doan_op_map"] });
      qc.invalidateQueries({ queryKey: ["cong_viec"] });
    },
  });
}

// Scope deadline theo phân việc của user hiện tại:
// pv_ks → xem deadline KS; pv_nh_dv → xem deadline NH + DV
export function useMyPhanViecScope(uid: string | null | undefined) {
  return useQuery({
    queryKey: ["my_phan_viec_scope", uid],
    enabled: !!uid,
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await externalSupabase
        .from("cong_viec")
        .select("doan_id, loai_viec")
        .eq("nguoi_nhan", uid!)
        .in("loai_viec", ["pv_ks", "pv_nh_dv"])
        .not("trang_thai", "in", "(huy,khong_can)");
      if (error) throw error;
      const m = new Map<number, Set<"ks" | "nh" | "dv">>();
      for (const r of data ?? []) {
        if (r.doan_id == null) continue;
        if (!m.has(r.doan_id)) m.set(r.doan_id, new Set());
        const s = m.get(r.doan_id)!;
        if (r.loai_viec === "pv_ks") s.add("ks");
        else if (r.loai_viec === "pv_nh_dv") { s.add("nh"); s.add("dv"); }
      }
      return m;
    },
  });
}

// Gán / đổi người 1 đầu việc từ trang Theo dõi
export function useAssignPvItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (p: {
      doanId: number; doanTen: string; ngayDi: string | null;
      key: PvKey; userId: string;
    }) => {
      // Gán cho ADMIN = đánh dấu "Không cần" (admin không làm việc điều hành)
      const { data: tgt } = await externalSupabase
        .from("user_roles").select("role").eq("user_id", p.userId).maybeSingle();
      if (tgt?.role === "admin") {
        const { data: exKC } = await externalSupabase
          .from("cong_viec").select("id")
          .eq("doan_id", p.doanId).eq("loai_viec", p.key)
          .not("trang_thai", "in", "(huy,khong_can)")
          .order("created_at", { ascending: false }).limit(1).maybeSingle();
        if (exKC) {
          await externalSupabase.from("cong_viec")
            .update({ trang_thai: "khong_can", nguoi_nhan: SYSTEM_USER_ID, updated_at: new Date().toISOString() })
            .eq("id", exKC.id);
        } else {
          await externalSupabase.from("cong_viec").insert({
            tieu_de: `[${LABEL[p.key]}] ${p.doanTen} — Không cần`,
            mo_ta: `${LABEL[p.key]} không cần cho đoàn ${p.doanTen} (admin)`,
            doan_id: p.doanId, nguoi_giao: SYSTEM_USER_ID, nguoi_nhan: SYSTEM_USER_ID,
            loai_viec: p.key, do_uu_tien: "thap",
            han_xu_ly: p.ngayDi || null, trang_thai: "khong_can",
          });
        }
        return;
      }
      const { data: ex } = await externalSupabase
        .from("cong_viec")
        .select("id, nguoi_nhan")
        .eq("doan_id", p.doanId).eq("loai_viec", p.key)
        .in("trang_thai", ["cho_nhan", "dang_lam"])
        .order("created_at", { ascending: false }).limit(1).maybeSingle();
      if (ex && ex.nguoi_nhan === p.userId) return;
      if (ex) {
        await externalSupabase.from("cong_viec")
          .update({ trang_thai: "huy", updated_at: new Date().toISOString() })
          .eq("id", ex.id);
        await externalSupabase.from("thong_bao").insert({
          user_id: ex.nguoi_nhan, doan_id: p.doanId, doan_ten: p.doanTen,
          loai: "giao_viec",
          tieu_de: `Đoàn ${p.doanTen}: việc ${LABEL[p.key]} đã chuyển người khác`,
          noi_dung: "Bạn không còn phụ trách việc này.", is_read: false,
        });
      }
      const { data: cv, error } = await externalSupabase
        .from("cong_viec")
        .insert({
          tieu_de: `[${LABEL[p.key]}] ${p.doanTen}`,
          mo_ta: `Phụ trách ${LABEL[p.key]} cho đoàn ${p.doanTen}`,
          doan_id: p.doanId, nguoi_giao: SYSTEM_USER_ID, nguoi_nhan: p.userId,
          loai_viec: p.key, do_uu_tien: p.key === "pv_ks" ? "cao" : "binh_thuong",
          han_xu_ly: p.ngayDi || null, trang_thai: "cho_nhan",
        })
        .select("id").single();
      if (error) throw error;
      await externalSupabase.from("thong_bao").insert({
        user_id: p.userId, cong_viec_id: cv.id, doan_id: p.doanId, doan_ten: p.doanTen,
        loai: "giao_viec",
        tieu_de: `Đoàn ${p.doanTen}: bạn phụ trách ${LABEL[p.key]}`,
        noi_dung: "Giao tự động bởi Hệ thống", is_read: false,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["doan_phan_viec_matrix"] });
      qc.invalidateQueries({ queryKey: ["doan_op_map"] });
      qc.invalidateQueries({ queryKey: ["cong_viec"] });
      qc.invalidateQueries({ queryKey: ["thong_bao"] });
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
      const done = new Set((existing ?? []).map((r) => r.loai_viec));

      // Admin được giao việc pv → coi là "Không cần" (admin không làm việc điều hành,
      // không nag điều phối, không thông báo). KHÔNG để thành "Chưa phân".
      const { data: admins } = await externalSupabase
        .from("user_roles").select("user_id").eq("role", "admin");
      const adminSet = new Set((admins ?? []).map((r) => r.user_id));

      const assigned = p.assignments.filter((a) => a.assignedTo && !adminSet.has(a.assignedTo!) && !done.has(a.key));
      const adminAssigned = p.assignments.filter((a) => a.assignedTo && adminSet.has(a.assignedTo!) && !done.has(a.key));
      const missing = p.assignments.filter((a) => !a.assignedTo && !done.has(a.key));

      // Tên người được giao (cho summary giám đốc)
      const uids = [...new Set(assigned.map((a) => a.assignedTo!))];
      const nameMap = new Map<string, string>();
      if (uids.length) {
        const { data: u } = await externalSupabase
          .from("user_roles").select("user_id, ho_ten").in("user_id", uids);
        (u ?? []).forEach((x) => nameMap.set(x.user_id, x.ho_ten ?? x.user_id));
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
            do_uu_tien: a.key === "pv_ks" ? "cao" : "binh_thuong",
            han_xu_ly: doan.ngay_di || null,
            trang_thai: "cho_nhan",
          } as unknown as TablesInsert<"cong_viec">)
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
        } as unknown as TablesInsert<"thong_bao">);
      }

      // 1b) Mục giao cho ADMIN → tạo dạng "Không cần" (đen, loại khỏi theo dõi/
      //     thông báo, KHÔNG nag điều phối, KHÔNG để "Chưa phân").
      for (const a of adminAssigned) {
        await externalSupabase.from("cong_viec").insert({
          tieu_de: `[${LABEL[a.key]}] ${doan.ten_doan} — Không cần`,
          mo_ta: `${LABEL[a.key]} không cần cho đoàn ${doan.ten_doan} (admin)`,
          doan_id: doan.id,
          nguoi_giao: SYSTEM_USER_ID,
          nguoi_nhan: SYSTEM_USER_ID,
          loai_viec: a.key,
          do_uu_tien: "thap",
          han_xu_ly: doan.ngay_di || null,
          trang_thai: "khong_can",
        });
      }

      // 2) Mục thiếu người → giao điều-phối (la_dieu_phoi; fallback giám đốc).
      //    Idempotent: nếu đã có pv_phancong đang mở cho đoàn thì không tạo trùng.
      if (missing.length) {
        const { data: pcExist } = await externalSupabase
          .from("cong_viec").select("id")
          .eq("doan_id", doan.id).eq("loai_viec", "pv_phancong")
          .in("trang_thai", ["cho_nhan", "dang_lam"]).limit(1);
        if (!pcExist || pcExist.length === 0) {
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
      }

      // 3) Giám đốc → thông báo thông tin đoàn + ai phụ trách gì (không tạo việc)
      const { data: directors } = await externalSupabase
        .from("user_roles").select("user_id").eq("active", true).eq("role", "giam_doc");
      const summary = [
        ...assigned.map((a) => `${LABEL[a.key]}: ${nameMap.get(a.assignedTo!) ?? "?"}`),
        ...adminAssigned.map((a) => `${LABEL[a.key]}: Không cần`),
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

// Đóng task pv_phancong của 1 đoàn (điều phối đã phân xong)
export function useResolvePhanCong() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (doanId: number) => {
      await externalSupabase
        .from("cong_viec")
        .update({ trang_thai: "hoan_thanh", updated_at: new Date().toISOString() })
        .eq("doan_id", doanId)
        .eq("loai_viec", "pv_phancong")
        .in("trang_thai", ["cho_nhan", "dang_lam"]);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["cong_viec"] });
      qc.invalidateQueries({ queryKey: ["thong_bao"] });
      qc.invalidateQueries({ queryKey: ["doan_phan_viec_matrix"] });
    },
  });
}
