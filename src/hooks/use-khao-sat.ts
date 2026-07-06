import { useQuery } from "@tanstack/react-query";
import { externalSupabase } from "@/lib/supabase-external";
import { CRITERIA_LABELS, SCORE_KEYS, type ScoreKey } from "@/lib/khao-sat-vocab";

// Response khảo sát của 1 đoàn (bảng khach_hang_khao_sat) — mô hình phiếu Đài Loan.
export interface KhaoSatRow {
  id: number;
  doan_id: number | null;
  ma_doan_snapshot: string | null;
  ten_khach: string | null;
  gioi_tinh: string | null;
  tuoi_range: string | null;
  nghe_nghiep: string | null;
  so_dien_thoai: string | null;
  email: string | null;
  ngon_ngu: string | null;
  // 7 tiêu chí điểm sao
  dg_khach_hang: number | null;
  dg_lich_trinh: number | null;
  dg_am_thuc: number | null;
  dg_luu_tru: number | null;
  dg_xe: number | null;
  dg_truong_doan: number | null;
  dg_huong_dan_vien: number | null;
  // Free text + lựa chọn
  next_trip: string | null;
  y_kien_khac: string | null;
  diem_ban: string | null;
  nguon_thong_tin: string[] | null;
  yeu_to_mua: string[] | null;
  // Snapshot
  hdv_ten_snapshot: string | null;
  truong_doan_ten_snapshot: string | null;
  created_at: string;
}

// 7 tiêu chí điểm — dùng chung cho hiển thị + tính trung bình. Nhãn = tiếng Việt (vocab).
export const KHAO_SAT_TIEU_CHI: { key: ScoreKey; label: string }[] = SCORE_KEYS.map(
  (key) => ({ key, label: CRITERIA_LABELS[key].vi }),
);

export function useKhaoSatList(doanId?: number) {
  return useQuery({
    queryKey: ["khach_hang_khao_sat", doanId],
    enabled: !!doanId,
    queryFn: async () => {
      const { data, error } = await externalSupabase
        .from("khach_hang_khao_sat")
        .select("*")
        .eq("doan_id", doanId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as KhaoSatRow[];
    },
  });
}

// Dòng tổng hợp toàn hệ thống (view khao_sat_overview) — cho màn 1.
export interface KhaoSatOverviewRow {
  doan_id: number | null;
  ngay_di: string | null;
  ngay_ve: string | null;
  ten_doan: string | null;
  team_name: string | null;
  op_name: string | null;
  so_khach: number | null;
  so_response: number | null;
  so_thap_diem: number | null;
  tb_chung: number | null;
}

/** Danh sách đoàn kèm tổng hợp khảo sát, lọc theo khoảng ngày khởi hành (ngay_di). */
export function useKhaoSatOverview(fromDate?: string, toDate?: string) {
  return useQuery({
    queryKey: ["khao_sat_overview", fromDate, toDate],
    queryFn: async () => {
      let q = externalSupabase.from("khao_sat_overview").select("*");
      if (fromDate) q = q.gte("ngay_di", fromDate);
      if (toDate) q = q.lte("ngay_di", toDate);
      const { data, error } = await q.order("ngay_di", { ascending: true });
      if (error) throw error;
      return (data ?? []) as KhaoSatOverviewRow[];
    },
  });
}
