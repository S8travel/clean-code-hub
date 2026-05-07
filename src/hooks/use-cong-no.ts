import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { externalSupabase } from "@/lib/supabase-external";

export interface CongNoRow {
  id: number;
  doan_id: number | null;
  dntt_goc_id: number | null;
  nha_cung_cap_id: number | null;
  ten_nha_cung_cap: string | null;
  so_tien_goc: number;
  trang_thai: "con_du" | "da_can_tru" | "da_hoan_tien";
  ly_do: string | null;
  ngay_tao: string;
  ghi_chu: string | null;
  created_at: string;
  // Derived from view
  so_tien_da_dung: number;
  so_tien_con_lai: number;
  // Joined
  ten_doan?: string;
  ten_ncc?: string;
}

interface CongNoFilters {
  nccId?: number | null;
  doanId?: number | null;
  trangThai?: CongNoRow["trang_thai"] | null;
  onlyConDu?: boolean;
}

// List cong_no với derived status (so_tien_con_lai)
export function useCongNoList(filters: CongNoFilters = {}) {
  return useQuery({
    queryKey: ["cong-no", filters],
    queryFn: async () => {
      let q = externalSupabase
        .from("cong_no_with_status")
        .select(`
          *,
          doan:doan_id(ten_doan),
          nha_cung_cap:nha_cung_cap_id(ten)
        `)
        .order("created_at", { ascending: false });

      if (filters.nccId) q = q.eq("nha_cung_cap_id", filters.nccId);
      if (filters.doanId) q = q.eq("doan_id", filters.doanId);
      if (filters.trangThai) q = q.eq("trang_thai", filters.trangThai);
      if (filters.onlyConDu) q = q.gt("so_tien_con_lai", 0).eq("trang_thai", "con_du");

      const { data, error } = await q;
      if (error) throw error;

      return (data || []).map((row: any) => ({
        ...row,
        ten_doan: row.doan?.ten_doan || "",
        ten_ncc: row.nha_cung_cap?.ten || row.ten_nha_cung_cap || "",
      })) as CongNoRow[];
    },
  });
}

// Lấy danh sách công nợ còn dư cho 1 NCC (để dùng cấn trừ)
export function useCongNoByNCC(nccId: number | null | undefined) {
  return useQuery({
    queryKey: ["cong-no-by-ncc", nccId],
    enabled: !!nccId,
    queryFn: async () => {
      const { data, error } = await externalSupabase
        .from("cong_no_with_status")
        .select(`
          *,
          doan:doan_id(ten_doan)
        `)
        .eq("nha_cung_cap_id", nccId!)
        .eq("trang_thai", "con_du")
        .gt("so_tien_con_lai", 0)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []).map((row: any) => ({
        ...row,
        ten_doan: row.doan?.ten_doan || "",
      })) as CongNoRow[];
    },
  });
}

// Đổi trạng thái cong_no (typically 'con_du' ↔ 'da_hoan_tien')
export function useUpdateCongNoStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, trangThai }: { id: number; trangThai: CongNoRow["trang_thai"] }) => {
      const { error } = await externalSupabase
        .from("cong_no")
        .update({ trang_thai: trangThai })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["cong-no"] });
      qc.invalidateQueries({ queryKey: ["cong-no-by-ncc"] });
    },
  });
}

// Append log vào ghi_chu của cong_no
export async function appendCanTruLog(
  congNoId: number,
  soTien: number,
  tenDoanMoi: string,
) {
  const { data } = await externalSupabase
    .from("cong_no")
    .select("ghi_chu")
    .eq("id", congNoId)
    .single();

  const d = new Date();
  const dd = d.getDate().toString().padStart(2, "0");
  const mm = (d.getMonth() + 1).toString().padStart(2, "0");
  const yyyy = d.getFullYear();
  const entry = `${dd}/${mm}/${yyyy}: Cấn trừ ${soTien.toLocaleString("vi-VN")}đ → Đoàn ${tenDoanMoi}`;
  const existing = data?.ghi_chu;
  const newGhiChu = existing ? `${existing}\n${entry}` : entry;

  await externalSupabase
    .from("cong_no")
    .update({ ghi_chu: newGhiChu })
    .eq("id", congNoId);
}
