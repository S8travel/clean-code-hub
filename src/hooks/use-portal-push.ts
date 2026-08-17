import { useMutation, useQueryClient } from "@tanstack/react-query";
import { externalSupabase, EXTERNAL_SUPABASE_URL } from "@/lib/supabase-external";
import { edgeAuthHeaders } from "@/lib/edge-fn-auth";

// Điều khiển việc chia sẻ dữ liệu sang CỔNG ĐỐI TÁC (外網 — project Supabase riêng).
//
// Cổng chỉ nhận thứ đã được mở rõ ràng: bật cờ portal_enabled trên báo giá / đoàn.
// Cron 30 phút/lần đẩy lại toàn bộ những gì đang bật; nút "Đẩy ngay" chỉ để không
// phải chờ. Muốn thu hồi thì tắt cờ — lần đẩy sau đối tác không thấy nữa.

export interface DongBoQua {
  loai: "bao_gia" | "doan";
  id: number;
  ly_do: string;
}

// Khớp với những gì edge function push-portal trên prod trả về.
export interface KetQuaDay {
  bao_gia: number;
  doan: number;
  /** Số dòng bị gỡ khỏi cổng (tắt chia sẻ, đoàn hủy...). */
  xoa: number;
  /** Dòng đủ điều kiện nhưng thiếu thứ gì đó — kèm lý do để nói lại cho OP. */
  bo_qua: DongBoQua[];
  /** Đối tác đã nhận dữ liệu nhưng CHƯA có tài khoản đăng nhập cổng. */
  agent_thieu_tai_khoan: Array<{ crm_agent_id: number; ten: string }>;
  luc?: string;
}

/** Gọi edge function push-portal bằng danh tính người đang đăng nhập. */
export function usePushPortal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (): Promise<KetQuaDay> => {
      const resp = await fetch(`${EXTERNAL_SUPABASE_URL}/functions/v1/push-portal`, {
        method: "POST",
        headers: await edgeAuthHeaders(),
        body: JSON.stringify({}),
      });
      const body = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error(body.error ?? "Đẩy sang cổng đối tác thất bại");
      return body as KetQuaDay;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["bao_gia"] });
      qc.invalidateQueries({ queryKey: ["doan"] });
    },
  });
}

/** Bật/tắt chia sẻ 1 báo giá hoặc 1 đoàn cho đối tác. */
export function useSetPortalEnabled(bang: "bao_gia" | "doan") {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, bat }: { id: number; bat: boolean }) => {
      const { error } = await externalSupabase.from(bang).update({ portal_enabled: bat }).eq("id", id);
      if (error) throw error;
      return { id, bat };
    },
    onSuccess: ({ id }) => {
      qc.invalidateQueries({ queryKey: [bang] });
      qc.invalidateQueries({ queryKey: [bang, id] });
    },
  });
}
