import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { SupabaseClient } from "@supabase/supabase-js";
import { externalSupabase, EXTERNAL_SUPABASE_URL } from "@/lib/supabase-external";
import { edgeAuthHeaders } from "@/lib/edge-fn-auth";

// database.types.ts chưa biết bảng doan_trao_doi: file đó sinh từ schema PROD, mà
// migration 20260818_portal_tai_lieu_ks_trao_doi chưa chạy. Dùng client không gắn
// generic cho tới khi apply migration rồi generate lại types — bỏ đúng một chỗ,
// không rải `as any` khắp file.
const db = externalSupabase as unknown as SupabaseClient;

// Hỏi/đáp với đối tác trên cổng 外網. CRM là bản gốc; bảng doan_trao_doi ở đây,
// cổng chỉ giữ bản sao cho đối tác đọc.
//
// ĐỌC trực tiếp từ bảng (RLS lo phần quyền), GHI qua edge function `trao-doi`:
// mỗi lần ghi còn phải đẩy tiếp sang cổng, mà PORTAL_SERVICE_KEY thì không được
// nằm trong bundle trình duyệt.

/** MỘT DÒNG = MỘT LƯỢT HỎI + LƯỢT ĐÁP của nó. */
export interface TraoDoiRow {
  id: number;
  doan_id: number;
  ben_gui: "doi_tac" | "s8";
  nguoi_gui: string | null;
  noi_dung: string;
  gui_luc: string;
  tra_loi: string | null;
  nguoi_tra_loi: string | null;
  tra_loi_luc: string | null;
}

const QK = "doan_trao_doi";

export function useTraoDoiList(doanId?: number | null) {
  return useQuery({
    queryKey: [QK, doanId],
    enabled: !!doanId,
    queryFn: async (): Promise<TraoDoiRow[]> => {
      const { data, error } = await db
        .from("doan_trao_doi")
        .select("id, doan_id, ben_gui, nguoi_gui, noi_dung, gui_luc, tra_loi, nguoi_tra_loi, tra_loi_luc")
        .eq("doan_id", doanId!)
        .order("gui_luc", { ascending: false });
      if (error) throw error;
      return (data ?? []) as TraoDoiRow[];
    },
  });
}

/** Số lượt đối tác hỏi mà chưa ai trả lời — dùng cho badge trên tab. */
export function demChuaTraLoi(rows: TraoDoiRow[] | undefined): number {
  return (rows ?? []).filter((r) => r.ben_gui === "doi_tac" && !r.tra_loi).length;
}

async function goiTraoDoi(payload: Record<string, unknown>): Promise<{ id: number }> {
  const resp = await fetch(`${EXTERNAL_SUPABASE_URL}/functions/v1/trao-doi`, {
    method: "POST",
    headers: await edgeAuthHeaders(),
    body: JSON.stringify(payload),
  });
  const body = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new Error(body.error ?? "Không gửi được sang cổng đối tác");
  return body as { id: number };
}

/** Trả lời một lượt hỏi đã có. */
export function useTraLoiTraoDoi(doanId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, traLoi }: { id: number; traLoi: string }) =>
      goiTraoDoi({ id, tra_loi: traLoi }),
    onSuccess: () => qc.invalidateQueries({ queryKey: [QK, doanId] }),
  });
}

/** S8 chủ động mở một lượt (báo đối tác một việc gì đó). */
export function useGuiTraoDoi(doanId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (noiDung: string) => goiTraoDoi({ doan_id: doanId, noi_dung: noiDung }),
    onSuccess: () => qc.invalidateQueries({ queryKey: [QK, doanId] }),
  });
}
