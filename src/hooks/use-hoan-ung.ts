// Hoàn ứng (tạm ứng): user ứng tiền chi cho công ty (VPP, tiếp khách, taxi...)
// → tạo DNTT với loai='hoan_ung' để kế toán hoàn lại.
// Reuse bảng de_nghi_thanh_toan + flow duyệt sẵn có (DNTTPage).
// 2 field thêm: loai_chi_hoan_ung (enum), nguoi_ung_id (uuid → auth.users).
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { externalSupabase } from "@/lib/supabase-external";
import type { TablesInsert } from "@/lib/database.types";

export const LOAI_CHI_HOAN_UNG_OPTS: { value: string; label: string }[] = [
  { value: "vpp",          label: "Văn phòng phẩm" },
  { value: "tiep_khach",   label: "Tiếp khách" },
  { value: "taxi",         label: "Taxi / Đi lại" },
  { value: "khac",         label: "Khác" },
];

export interface HoanUngItem {
  loai_chi: string;
  mo_ta: string;
  so_tien: number;
  hoa_don_url?: string | null;
}

export interface HoanUngRow {
  id: number;
  loai_chi_hoan_ung: string | null;     // null khi multi-line (dùng hoan_ung_items)
  hoan_ung_items: HoanUngItem[] | null; // array dòng chi phí
  nguoi_ung_id: string | null;
  mo_ta: string | null;                  // summary "3 mục: VPP + Taxi"
  so_tien: number;                       // SUM(items.so_tien)
  ten_nha_cung_cap: string | null;       // tên người ứng (snapshot)
  so_tai_khoan: string | null;
  ngan_hang: string | null;
  trang_thai_duyet: string;
  ngay_can_thanh_toan: string | null;
  hoa_don_url: string | null;           // legacy 1-file, NULL khi dùng items
  tao_boi: string | null;
  tao_luc: string | null;
  duyet_boi: string | null;
  duyet_luc: string | null;
  // Derived
  paid_amount: number;
  payment_status: "unpaid" | "partial" | "paid";
  thanh_toan_luc: string | null;
  // Joined
  nguoi_ung_ho_ten?: string | null;
}

export interface HoanUngInsert {
  items: HoanUngItem[];                  // BẮT BUỘC >= 1 dòng
  nguoi_ung_id: string;
  ten_nguoi_ung: string;                 // snapshot vào ten_nha_cung_cap
  so_tai_khoan?: string | null;
  ngan_hang?: string | null;
  ngay_can_thanh_toan?: string | null;
  tao_boi: string;
}

// Build summary mô tả từ items: "3 mục: VPP + Taxi + Khác" hoặc "VPP: Mua giấy A4"
export function buildHoanUngSummary(items: HoanUngItem[]): string {
  if (items.length === 0) return "";
  if (items.length === 1) {
    const it = items[0];
    const lc = LOAI_CHI_HOAN_UNG_OPTS.find((o) => o.value === it.loai_chi)?.label ?? it.loai_chi;
    return `${lc}: ${it.mo_ta}`.slice(0, 200);
  }
  const labels = items.map((it) =>
    LOAI_CHI_HOAN_UNG_OPTS.find((o) => o.value === it.loai_chi)?.label ?? it.loai_chi
  );
  const unique = [...new Set(labels)];
  return `${items.length} mục: ${unique.join(" + ")}`;
}

// List hoàn ứng — query DNTT view với filter loai='hoan_ung'
export function useHoanUngList(filter?: {
  loai_chi?: string | null;
  trang_thai?: string | null;
  nguoi_ung_id?: string | null;
}) {
  return useQuery({
    queryKey: ["hoan_ung_list", filter ?? null],
    queryFn: async () => {
      let q = externalSupabase
        .from("dntt_with_payment_status")
        .select("*")
        .eq("loai", "hoan_ung")
        .order("tao_luc", { ascending: false });
      if (filter?.loai_chi)     q = q.eq("loai_chi_hoan_ung", filter.loai_chi);
      if (filter?.trang_thai)   q = q.eq("trang_thai_duyet",  filter.trang_thai);
      if (filter?.nguoi_ung_id) q = q.eq("nguoi_ung_id",      filter.nguoi_ung_id);
      const { data, error } = await q;
      if (error) throw error;

      // Lookup ho_ten người ứng từ user_roles
      const ids = [...new Set((data ?? []).map((r: any) => r.nguoi_ung_id).filter(Boolean))];
      const nameMap: Record<string, string> = {};
      if (ids.length > 0) {
        const { data: roles } = await externalSupabase
          .from("user_roles")
          .select("user_id, ho_ten")
          .in("user_id", ids);
        for (const r of roles ?? []) nameMap[r.user_id] = r.ho_ten ?? "";
      }
      return (data ?? []).map((r: any) => ({
        ...r,
        nguoi_ung_ho_ten: r.nguoi_ung_id ? nameMap[r.nguoi_ung_id] ?? null : null,
      })) as HoanUngRow[];
    },
  });
}

// Tạo yêu cầu hoàn ứng — insert DNTT loai='hoan_ung'
export function useCreateHoanUng() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: HoanUngInsert) => {
      if (payload.items.length === 0) throw new Error("Cần ít nhất 1 dòng chi phí");
      const totalAmount = payload.items.reduce((s, it) => s + Number(it.so_tien || 0), 0);
      if (totalAmount <= 0) throw new Error("Tổng số tiền phải lớn hơn 0");

      // loai_chi_hoan_ung: nếu chỉ 1 loại → lưu để filter dễ; nhiều loại → null
      const uniqueLoaiChi = [...new Set(payload.items.map((it) => it.loai_chi))];
      const singleLoaiChi = uniqueLoaiChi.length === 1 ? uniqueLoaiChi[0] : null;

      const { data, error } = await externalSupabase
        .from("de_nghi_thanh_toan")
        .insert({
          loai: "hoan_ung",
          doan_id: null,
          nha_cung_cap_id: null,
          ten_nha_cung_cap: payload.ten_nguoi_ung,
          loai_chi_hoan_ung: singleLoaiChi,
          hoan_ung_items: payload.items,
          nguoi_ung_id: payload.nguoi_ung_id,
          mo_ta: buildHoanUngSummary(payload.items),
          so_tien: totalAmount,
          so_tai_khoan: payload.so_tai_khoan ?? null,
          ngan_hang: payload.ngan_hang ?? null,
          ngay_can_thanh_toan: payload.ngay_can_thanh_toan ?? null,
          tao_boi: payload.tao_boi,
          trang_thai_duyet: "cho_duyet",
        } as unknown as TablesInsert<"de_nghi_thanh_toan">)
        .select("id")
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["hoan_ung_list"] });
      qc.invalidateQueries({ queryKey: ["dntt-list"] });
    },
  });
}

// Xóa — chỉ cho khi trang_thai_duyet='tu_choi' (giống DNTT thường)
export function useDeleteHoanUng() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const { error } = await externalSupabase
        .from("de_nghi_thanh_toan")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["hoan_ung_list"] });
      qc.invalidateQueries({ queryKey: ["dntt-list"] });
    },
  });
}
