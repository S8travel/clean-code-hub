import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { externalSupabase } from "@/lib/supabase-external";
import type { DongDeHoc, DongSoTay } from "@/lib/bao-gia-so-tay";

// Sổ tay báo giá — bộ nhớ tiếng Trung ↔ tiếng Việt ↔ giá vốn, dựng từ chính thao
// tác của người nhập. Phần tính nằm ở lib/bao-gia-so-tay.ts (thuần, có test);
// file này chỉ lo nạp và ghi.

const QK = "bao_gia_so_tay";

/**
 * Nạp TOÀN BỘ sổ tay một lần.
 *
 * Lấy hết thay vì hỏi từng dòng: bảng này chỉ dày lên bằng thứ công ty thực sự
 * chào, nhỏ hơn kho vận hành nhiều lần, và màn báo giá cần tra hàng chục dòng
 * cùng lúc — hỏi từng cái là hàng chục lượt gọi cho một lần bấm.
 */
export function useSoTay(enabled = true) {
  return useQuery({
    queryKey: [QK],
    enabled,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<DongSoTay[]> => {
      const { data, error } = await externalSupabase
        .from("bao_gia_so_tay")
        .select("id, khoa_zh, zh_goc, ten_vi, loai, don_gia, foc_khach, foc_mien, dia_diem, so_lan_dung, ngung")
        .eq("ngung", false)
        .order("so_lan_dung", { ascending: false });
      // Ném lỗi, KHÔNG `?? []`: sổ tay nạp hỏng mà im lặng thì mọi dòng ra "chưa
      // có trong sổ tay", người nhập gõ lại tay tất cả và tưởng sổ tay rỗng.
      if (error) throw error;
      return (data ?? []) as unknown as DongSoTay[];
    },
  });
}

/**
 * Ghi ngược những gì người nhập vừa gõ.
 *
 * Đi qua RPC `hoc_so_tay_bao_gia` chứ không upsert thẳng: một lượt học có thể
 * mang dòng CHỈ CÓ TÊN (người sửa mỗi bản dịch, chưa động tới giá). Upsert thẳng
 * sẽ ghi giá NULL đè lên giá đã học — mất tiền lặng lẽ. RPC gộp theo từng cột.
 */
export function useHocSoTay() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (items: DongDeHoc[]): Promise<number> => {
      if (!items.length) return 0;
      const { data, error } = await externalSupabase.rpc("hoc_so_tay_bao_gia", {
        p_items: items as unknown as never,
      });
      if (error) throw error;
      return (data as number) ?? 0;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: [QK] }); },
  });
}

/** Sửa tay một dòng sổ tay (màn quản lý): tên, giá, FOC, ngưng dùng. */
export function useSuaDongSoTay() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }: {
      id: number;
      patch: Partial<Pick<DongSoTay, "ten_vi" | "don_gia" | "foc_khach" | "foc_mien" | "dia_diem" | "ngung">>;
    }) => {
      const { data, error } = await externalSupabase
        .from("bao_gia_so_tay")
        .update(patch)
        .eq("id", id)
        .select("id")
        .single();
      // .select().single() sau UPDATE: RLS chặn thì trả 0 dòng → lỗi, chứ KHÔNG
      // im lặng báo "đã lưu" trong khi DB không đổi gì.
      if (error) throw error;
      return data;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: [QK] }); },
  });
}
