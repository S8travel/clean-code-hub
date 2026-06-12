import { externalSupabase } from "@/lib/supabase-external";

// ĐNTT "hiệu lực" của 1 chi phí = các ĐNTT phân bổ tới chi_phi qua dntt_allocations
// MÀ chưa bị hủy/từ chối. Dùng cho mọi guard "không gỡ/xóa chi phí đã cam kết".
// Tách ra lib riêng (chỉ phụ thuộc supabase) để use-dieu-tour / use-doan /
// use-doan-nhom cùng dùng — tránh circular import giữa các hook.
export async function getActiveDnttIdsForChiPhi(chiPhiId: number): Promise<number[]> {
  const { data: rawAllocs } = await externalSupabase
    .from("dntt_allocations")
    .select("dntt_id")
    .eq("chi_phi_id", chiPhiId);
  if (!rawAllocs || rawAllocs.length === 0) return [];
  const dnttIds = [...new Set(rawAllocs.map((a) => a.dntt_id))];
  const { data: activeDntts } = await externalSupabase
    .from("de_nghi_thanh_toan")
    .select("id")
    .in("id", dnttIds)
    .not("trang_thai_duyet", "in", "(da_huy,tu_choi)");
  return (activeDntts ?? []).map((d) => d.id);
}
