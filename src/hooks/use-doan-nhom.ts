import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { externalSupabase } from "@/lib/supabase-external";
import type { TablesInsert, TablesUpdate } from "@/lib/database.types";
import { getActiveDnttIdsForChiPhi } from "@/lib/dntt-guard";

/**
 * Hook quản lý nhóm trong đoàn (1 đoàn → N nhóm).
 *
 * Phase 2: cho phép user thêm nhóm 2 (vd "Tham quan 75 khách" + "Golf 25 khách").
 * Mỗi nhóm có lịch trình `doan_ngay` riêng.
 *
 * Khi đoàn chỉ có 1 nhóm "Toàn đoàn" (mặc định), UI ẩn tabs — UX hệt như cũ.
 */

export interface DoanNhomRow {
  id: number;
  doan_id: number;
  ten_nhom: string;
  thu_tu: number;
  so_khach_lon: number | null;
  so_khach_em1: number | null;
  so_khach_em2: number | null;
  so_khach_tl: number | null;
  hdv_id: number | null;
  xe_id: number | null;
  ghi_chu: string | null;
  created_at: string;
  updated_at: string;
}

const QK = "doan_nhom";

export function useDoanNhomList(doanId?: number | null) {
  return useQuery({
    queryKey: [QK, doanId],
    enabled: !!doanId,
    queryFn: async (): Promise<DoanNhomRow[]> => {
      const { data, error } = await externalSupabase
        .from("doan_nhom")
        .select("*")
        .eq("doan_id", doanId!)
        .order("thu_tu", { ascending: true });
      if (error) throw error;
      return (data ?? []) as DoanNhomRow[];
    },
  });
}

/**
 * Tạo nhóm mới cho đoàn. thu_tu auto = max(thu_tu hiện tại) + 1.
 * Default ten_nhom = "Nhóm N".
 */
export function useCreateDoanNhom() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: {
      doanId: number;
      tenNhom?: string;
      soKhachLon?: number | null;
      soKhachEm1?: number | null;
      soKhachEm2?: number | null;
      soKhachTl?: number | null;
      hdvId?: number | null;
      xeId?: number | null;
      ghiChu?: string | null;
    }): Promise<DoanNhomRow> => {
      const { doanId } = params;
      const { data: existing } = await externalSupabase
        .from("doan_nhom")
        .select("thu_tu")
        .eq("doan_id", doanId)
        .order("thu_tu", { ascending: false })
        .limit(1);
      const nextThuTu = ((existing?.[0]?.thu_tu ?? 0) as number) + 1;

      const payload: TablesInsert<"doan_nhom"> = {
        doan_id: doanId,
        ten_nhom: params.tenNhom?.trim() || `Nhóm ${nextThuTu}`,
        thu_tu: nextThuTu,
        so_khach_lon: params.soKhachLon ?? null,
        so_khach_em1: params.soKhachEm1 ?? null,
        so_khach_em2: params.soKhachEm2 ?? null,
        so_khach_tl: params.soKhachTl ?? null,
        hdv_id: params.hdvId ?? null,
        xe_id: params.xeId ?? null,
        ghi_chu: params.ghiChu ?? null,
      };
      const { data, error } = await externalSupabase
        .from("doan_nhom")
        .insert(payload)
        .select("*")
        .single();
      if (error) throw error;
      return data as DoanNhomRow;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: [QK, vars.doanId] });
    },
  });
}

export function useUpdateDoanNhom() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: {
      id: number;
      doanId: number;
      updates: Omit<TablesUpdate<"doan_nhom">, "id" | "doan_id" | "created_at" | "updated_at">;
    }) => {
      const { error } = await externalSupabase
        .from("doan_nhom")
        .update(params.updates)
        .eq("id", params.id);
      if (error) throw error;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: [QK, vars.doanId] });
    },
  });
}

/**
 * Xóa nhóm. CASCADE sẽ xóa toàn bộ doan_ngay/doan_ngay_item của nhóm đó.
 * KHÔNG cho phép xóa nhóm cuối cùng (đoàn phải có ít nhất 1 nhóm).
 *
 * Defensive cleanup trước khi xóa: NULL ref_doan_ngay_id / ref_doan_ngay_item_id
 * của doan_chi_phi trỏ vào nhóm này. FK 2 cột trên là NO ACTION → nếu không null
 * trước, CASCADE chain (nhom → ngay → item) sẽ bị chặn FK violation.
 * Chi phí gộp nhóm (Approach A) chỉ giữ 1 ref tới nhóm save đầu — sau khi xóa
 * nhóm đó, ref orphan. Set NULL an toàn vì so_luong đã aggregate trong row.
 */
export function useDeleteDoanNhom() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: { id: number; doanId: number }) => {
      // Guard: phải còn ít nhất 1 nhóm sau khi xóa
      const { count } = await externalSupabase
        .from("doan_nhom")
        .select("id", { count: "exact", head: true })
        .eq("doan_id", params.doanId);
      if ((count ?? 0) <= 1) {
        throw new Error("Đoàn phải có ít nhất 1 nhóm — không thể xóa nhóm cuối cùng");
      }

      // Lấy ngày + item của nhóm sắp xóa (dùng cho cả GUARD lẫn null-refs bên dưới)
      const { data: ngayRows, error: eNgay } = await externalSupabase
        .from("doan_ngay")
        .select("id")
        .eq("doan_nhom_id", params.id);
      if (eNgay) throw eNgay; // fail-safe: không verify được thì KHÔNG cho xóa nhóm
      const ngayIds = (ngayRows ?? []).map((r) => r.id);
      const { data: itemRows, error: eItem } = ngayIds.length > 0
        ? await externalSupabase
            .from("doan_ngay_item")
            .select("id")
            .in("doan_ngay_id", ngayIds)
        : { data: [] as { id: number }[], error: null };
      if (eItem) throw eItem; // fail-safe
      const itemIds = (itemRows ?? []).map((r) => r.id);

      // GUARD: xóa nhóm sẽ CASCADE xóa doan_ngay + NULL ref chi phí → mất dấu cam kết.
      // Chặn nếu nhóm còn chi phí đã trả / có ĐNTT hiệu lực, hoặc booking NH đã gửi.
      // Chạy TRƯỚC mọi ghi DB → throw = chưa đụng gì.
      if (ngayIds.length > 0) {
        const refOr = [
          `ref_doan_ngay_id.in.(${ngayIds.join(",")})`,
          ...(itemIds.length > 0 ? [`ref_doan_ngay_item_id.in.(${itemIds.join(",")})`] : []),
        ].join(",");
        const { data: cpRows, error: eCp } = await externalSupabase
          .from("doan_chi_phi")
          .select("id, mo_ta, so_tien_da_tt")
          .or(refOr);
        if (eCp) throw eCp; // fail-safe
        const blocked: string[] = [];
        for (const cp of cpRows ?? []) {
          const paid = Number(cp.so_tien_da_tt ?? 0) > 0;
          const activeDnttIds = await getActiveDnttIdsForChiPhi(cp.id);
          if (paid || activeDnttIds.length > 0) {
            const tag = activeDnttIds.length > 0
              ? ` (ĐNTT ${activeDnttIds.map((i) => `#${i}`).join(", ")})`
              : " (đã thanh toán)";
            blocked.push(`"${cp.mo_ta}"${tag}`);
          }
        }
        const { data: bkNh, error: eBk } = await externalSupabase
          .from("doan_booking_nh")
          .select("id, booking_status")
          .in("doan_ngay_id", ngayIds)
          .in("booking_status", ["da_gui", "nh_xac_nhan"]);
        if (eBk) throw eBk; // fail-safe
        if (bkNh && bkNh.length > 0) {
          blocked.push(`${bkNh.length} booking nhà hàng đã gửi`);
        }
        if (blocked.length > 0) {
          throw new Error(
            `Không thể xóa nhóm: còn ràng buộc — ${blocked.join("; ")}. ` +
            `Hủy ĐNTT/booking liên quan trước khi xóa nhóm.`,
          );
        }
      }

      // Null chi_phi refs trỏ vào doan_ngay/doan_ngay_item của nhóm sắp xóa
      if (ngayIds.length > 0) {
        if (itemIds.length > 0) {
          await externalSupabase
            .from("doan_chi_phi")
            .update({ ref_doan_ngay_item_id: null })
            .in("ref_doan_ngay_item_id", itemIds);
        }
        await externalSupabase
          .from("doan_chi_phi")
          .update({ ref_doan_ngay_id: null })
          .in("ref_doan_ngay_id", ngayIds);
      }

      const { error } = await externalSupabase
        .from("doan_nhom")
        .delete()
        .eq("id", params.id);
      if (error) throw error;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: [QK, vars.doanId] });
      qc.invalidateQueries({ queryKey: ["doan_ngay", vars.doanId] });
      qc.invalidateQueries({ queryKey: ["doan_ngay_item", vars.doanId] });
      qc.invalidateQueries({ queryKey: ["doan_chi_phi", vars.doanId] });
    },
  });
}
