import { useMutation, useQueryClient } from "@tanstack/react-query";
import { EXTERNAL_SUPABASE_URL } from "@/lib/supabase-external";
import { edgeAuthHeaders } from "@/lib/edge-fn-auth";

// Link xem báo giá cho người KHÔNG có tài khoản cổng — khách lẻ và những đối tác
// chưa được cấp tài khoản (nhóm đông hơn nhóm có cổng).
//
// Gọi bằng danh tính người đang đăng nhập, không phải publishable key: hàm phía
// sau quyết định thứ gì được mở ra internet.

export interface KetQuaLink {
  url: string;
  token: string;
  het_han: string;
  so_ban: number;
}

/**
 * Tạo hoặc làm mới link.
 *
 * Gọi lại nhiều lần là an toàn và ĐÚNG QUY TRÌNH: token giữ nguyên, chỉ danh sách
 * bản chào được đồng bộ lại. Chào thêm bản v3 thì bấm lại một cái, link cũ đã gửi
 * trong mail tuần trước vẫn mở ra bản mới nhất.
 */
export function useTaoLinkBaoGia() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ baoGiaId }: { baoGiaId: number }): Promise<KetQuaLink> => {
      const resp = await fetch(`${EXTERNAL_SUPABASE_URL}/functions/v1/tao-link-bao-gia`, {
        method: "POST",
        headers: await edgeAuthHeaders(),
        body: JSON.stringify({ bao_gia_id: baoGiaId }),
      });
      const body = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error(body.error ?? "Tạo link thất bại");
      return body as KetQuaLink;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["bao_gia"] }),
  });
}

/** Thu hồi link. Tắt ở cả hai đầu — tắt mỗi bên CRM thì trang ngoài kia vẫn mở được. */
export function useThuHoiLinkBaoGia() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ baoGiaId }: { baoGiaId: number }) => {
      const resp = await fetch(`${EXTERNAL_SUPABASE_URL}/functions/v1/tao-link-bao-gia`, {
        method: "POST",
        headers: await edgeAuthHeaders(),
        body: JSON.stringify({ bao_gia_id: baoGiaId, thu_hoi: true }),
      });
      const body = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error(body.error ?? "Thu hồi link thất bại");
      return body as { thu_hoi: boolean };
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["bao_gia"] }),
  });
}
