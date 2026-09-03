import { externalSupabase } from "@/lib/supabase-external";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { KHOA_TY_GIA_MAC_DINH, doTyGiaMacDinh } from "@/lib/bao-gia-ty-gia";

/** Cài đặt hệ thống dùng chung (bảng cai_dat_he_thong, key-value).
 *  Chỉ dùng cho giá trị ĐIỀN SẴN khi tạo mới — KHÔNG dùng để tính lại dữ liệu cũ
 *  (dữ liệu cũ luôn giữ giá trị đã snapshot của nó). */

const QK = "cai_dat_he_thong";
const STALE = 5 * 60_000;

async function docCaiDat(khoa: string): Promise<string | null> {
  const { data, error } = await externalSupabase
    .from("cai_dat_he_thong")
    .select("gia_tri")
    .eq("khoa", khoa)
    .maybeSingle();
  if (error) throw error;
  return data?.gia_tri ?? null;
}

export function useCaiDat(khoa: string) {
  return useQuery<string | null>({
    queryKey: [QK, khoa],
    staleTime: STALE,
    queryFn: () => docCaiDat(khoa),
  });
}

export function useLuuCaiDat() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { khoa: string; gia_tri: string; mo_ta?: string }) => {
      const { data: auth } = await externalSupabase.auth.getUser();
      // Chỉ ghi mo_ta khi có truyền — upsert kèm undefined sẽ xoá mất mô tả cũ.
      const row = {
        khoa: payload.khoa,
        gia_tri: payload.gia_tri,
        cap_nhat_luc: new Date().toISOString(),
        cap_nhat_boi: auth.user?.id ?? null,
        ...(payload.mo_ta != null ? { mo_ta: payload.mo_ta } : {}),
      };
      const { error } = await externalSupabase
        .from("cai_dat_he_thong")
        .upsert(row, { onConflict: "khoa" });
      if (error) throw error;
    },
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: [QK, v.khoa] });
    },
  });
}

/** Tỷ giá mặc định cho nút "Mặc định" ở màn báo giá (hiển thị ngay, có cache). */
export function useTyGiaMacDinh() {
  const q = useCaiDat(KHOA_TY_GIA_MAC_DINH);
  return { ...q, tyGia: doTyGiaMacDinh(q.data) };
}

/** Đọc tỷ giá mặc định NGAY LÚC CẦN (dùng khi tạo báo giá mới).
 *  Khác useTyGiaMacDinh: chờ query xong thay vì trả tạm hằng số — tránh cảnh
 *  vừa mở trang đã bấm "Tạo" và báo giá bị seed bằng hằng số cũ. */
export function useLayTyGiaMacDinh() {
  const qc = useQueryClient();
  return async (): Promise<number> => {
    try {
      const raw = await qc.fetchQuery({
        queryKey: [QK, KHOA_TY_GIA_MAC_DINH],
        queryFn: () => docCaiDat(KHOA_TY_GIA_MAC_DINH),
        staleTime: STALE,
      });
      return doTyGiaMacDinh(raw);
    } catch {
      // Mất mạng / RLS chặn → vẫn tạo được báo giá với hằng số trong code.
      return doTyGiaMacDinh(null);
    }
  };
}
