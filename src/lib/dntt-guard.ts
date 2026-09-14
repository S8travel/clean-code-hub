import { externalSupabase } from "@/lib/supabase-external";

// ĐNTT "hiệu lực" của 1 chi phí = các ĐNTT phân bổ tới chi_phi qua dntt_allocations
// MÀ chưa bị hủy/từ chối. Dùng cho mọi guard "không gỡ/xóa chi phí đã cam kết".
// Tách ra lib riêng (chỉ phụ thuộc supabase) để use-dieu-tour / use-doan /
// use-doan-nhom cùng dùng — tránh circular import giữa các hook.
// NÉM LỖI khi query hỏng, KHÔNG nuốt — y như bản batch bên dưới: "không đọc được
// ĐNTT" ≠ "không có ĐNTT". Nuốt lỗi ở đây làm mọi guard gọi nó mở toang đúng lúc
// mạng chập chờn → cho xoá chi phí đã cam kết → CASCADE mất dấu tiền.
export async function getActiveDnttIdsForChiPhi(chiPhiId: number): Promise<number[]> {
  const { data: rawAllocs, error: eAlloc } = await externalSupabase
    .from("dntt_allocations")
    .select("dntt_id")
    .eq("chi_phi_id", chiPhiId);
  if (eAlloc) throw eAlloc;
  if (!rawAllocs || rawAllocs.length === 0) return [];
  const dnttIds = [...new Set(rawAllocs.map((a) => a.dntt_id))];
  const { data: activeDntts, error: eDntt } = await externalSupabase
    .from("de_nghi_thanh_toan")
    .select("id")
    .in("id", dnttIds)
    .not("trang_thai_duyet", "in", "(da_huy,tu_choi)");
  if (eDntt) throw eDntt;
  return (activeDntts ?? []).map((d) => d.id);
}

/**
 * Bản BATCH: chi_phi_id → ĐNTT hiệu lực. Hai truy vấn cho N dòng, thay vì 2N.
 * Dùng cho backstop chạy trước khi ghi DB (kiểm cả loạt rồi mới quyết định).
 *
 * NÉM LỖI khi query hỏng, KHÔNG nuốt: guard đọc rỗng vì lỗi mạng sẽ kết luận
 * "không có ĐNTT nào" → cho xóa chi phí đã cam kết → CASCADE mất dấu tiền.
 */
export async function getActiveDnttIdsForChiPhiBatch(
  chiPhiIds: number[],
): Promise<Map<number, number[]>> {
  const out = new Map<number, number[]>();
  if (chiPhiIds.length === 0) return out;

  const { data: allocs, error: eAlloc } = await externalSupabase
    .from("dntt_allocations")
    .select("chi_phi_id, dntt_id")
    .in("chi_phi_id", chiPhiIds);
  if (eAlloc) throw eAlloc;
  if (!allocs || allocs.length === 0) return out;

  const dnttIds = [...new Set(allocs.map((a) => a.dntt_id as number))];
  const { data: activeDntts, error: eDntt } = await externalSupabase
    .from("de_nghi_thanh_toan")
    .select("id")
    .in("id", dnttIds)
    .not("trang_thai_duyet", "in", "(da_huy,tu_choi)");
  if (eDntt) throw eDntt;

  const activeIds = new Set((activeDntts ?? []).map((d) => d.id as number));
  for (const a of allocs) {
    const dnttId = a.dntt_id as number;
    if (!activeIds.has(dnttId)) continue;
    const cpId = a.chi_phi_id as number;
    const cur = out.get(cpId);
    if (cur) { if (!cur.includes(dnttId)) cur.push(dnttId); }
    else out.set(cpId, [dnttId]);
  }
  return out;
}
