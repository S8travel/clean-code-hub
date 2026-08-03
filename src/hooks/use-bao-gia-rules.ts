import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { SupabaseClient } from "@supabase/supabase-js";
import { externalSupabase, EXTERNAL_SUPABASE_URL } from "@/lib/supabase-external";
import type { BaoGomBuaAn } from "@/lib/bao-gia-ai-resolve";

// Bảng bao_gia_rule còn mới (chưa vào database.types) → client untyped cục bộ,
// giống pattern use-bao-gia-aliases.
const db = externalSupabase as unknown as SupabaseClient;

const QK = "bao_gia_rules";

/** 1 quy tắc đã dạy (bảng bao_gia_rule) + tên KS join để hiển thị. */
export interface BaoGiaRuleRow {
  id: number;
  loai: string;
  khach_san_id: number | null;
  bua: BaoGomBuaAn | null;
  gia_phong: number | null;
  mo_ta_goc: string | null;
  dien_giai: string | null;
  tao_luc: string;
  khach_san: { ten: string } | null;
}

/** Danh sách quy tắc đang hiệu lực (mới nhất trước). */
export function useBaoGiaRuleList(enabled = true) {
  return useQuery({
    queryKey: [QK],
    enabled,
    staleTime: 60_000,
    queryFn: async (): Promise<BaoGiaRuleRow[]> => {
      const { data, error } = await db
        .from("bao_gia_rule")
        .select("id, loai, khach_san_id, bua, gia_phong, mo_ta_goc, dien_giai, tao_luc, khach_san:khach_san_id(ten)")
        .eq("active", true)
        .order("tao_luc", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as BaoGiaRuleRow[];
    },
  });
}

/** Kết quả AI parse câu dạy (edge fn bao-gia-teach-rule). */
export interface TeachRuleResult {
  hieu: boolean;
  /** Diễn giải quy tắc (khi hiểu) HOẶC lý do không hỗ trợ (khi không hiểu). */
  ly_do: string;
  rule: {
    loai: "ks_gia_kem_bua";
    khach_san_id: number;
    khach_san_ten: string;
    bua: BaoGomBuaAn;
    gia_phong: number;
  } | null;
}

/** Gửi câu dạy tiếng Việt cho AI parse thành quy tắc có cấu trúc (CHƯA lưu). */
export function useTeachBaoGiaRule() {
  return useMutation({
    mutationFn: async (text: string): Promise<TeachRuleResult> => {
      const session = await externalSupabase.auth.getSession();
      const token = session.data.session?.access_token;
      const resp = await fetch(`${EXTERNAL_SUPABASE_URL}/functions/v1/bao-gia-teach-rule`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ text }),
      });
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new Error(err.error ?? "Lỗi AI phân tích câu dạy");
      }
      const { ketQua } = await resp.json();
      return ketQua as TeachRuleResult;
    },
  });
}

/** Lưu quy tắc user ĐÃ XÁC NHẬN. Cùng KS + cùng loai → deactivate bản cũ trước
 *  (quy tắc mới thay thế, giữ lịch sử — không update đè). */
export function useSaveBaoGiaRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      rule: NonNullable<TeachRuleResult["rule"]>;
      mo_ta_goc: string;
      dien_giai: string;
      userId?: string | null;
    }) => {
      const { rule } = input;
      const { error: eOld } = await db
        .from("bao_gia_rule")
        .update({ active: false })
        .eq("khach_san_id", rule.khach_san_id)
        .eq("loai", rule.loai)
        .eq("active", true);
      if (eOld) throw eOld;
      const { error } = await db.from("bao_gia_rule").insert({
        loai: rule.loai,
        khach_san_id: rule.khach_san_id,
        bua: rule.bua,
        gia_phong: rule.gia_phong,
        mo_ta_goc: input.mo_ta_goc,
        dien_giai: input.dien_giai,
        tao_boi: input.userId ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [QK] }),
  });
}

/** Gỡ 1 quy tắc (soft delete — giữ audit). */
export function useDeactivateBaoGiaRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const { data, error } = await db
        .from("bao_gia_rule")
        .update({ active: false })
        .eq("id", id)
        .select("id");
      if (error) throw error;
      // RLS chặn UPDATE trả 0 dòng KHÔNG báo lỗi → check length kẻo toast giả.
      if (!data || data.length === 0) throw new Error("Không gỡ được quy tắc (thiếu quyền).");
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [QK] }),
  });
}
