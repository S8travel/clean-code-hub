import { useMutation, useQueryClient } from "@tanstack/react-query";
import { externalSupabase } from "@/lib/supabase-external";
import type { DoanInsert } from "@/hooks/use-doan";

/**
 * Nhân bản đoàn KÈM chương trình điều tour:
 *   doan → doan_nhom → doan_ngay → doan_ngay_item.
 *
 * KHÔNG copy chi phí / booking / ĐNTT — đoàn mới bắt đầu sạch; chi phí cảnh điểm/NH
 * tự cascade lại khi user lưu Điều Tour.
 *
 * Trigger DB `doan_auto_create_nhom_default` tạo sẵn nhóm thu_tu=1 khi INSERT doan →
 * tái dùng nhóm đó cho nhóm thu_tu=1 của nguồn, INSERT mới cho các nhóm còn lại.
 */
export function useCloneDoan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      payload,
      sourceDoanId,
    }: {
      payload: DoanInsert;
      sourceDoanId: number;
    }) => {
      // 1. Tạo đoàn mới (trigger tự tạo nhóm mặc định thu_tu=1)
      const { data: created, error } = await externalSupabase
        .from("doan")
        .insert(payload)
        .select()
        .single();
      if (error) throw error;
      const newId = created.id;

      // 2. Map nhóm nguồn → nhóm mới. Tái dùng nhóm default (thu_tu=1) trigger vừa tạo.
      const { data: srcNhom } = await externalSupabase
        .from("doan_nhom")
        .select(
          "id, ten_nhom, thu_tu, so_khach_lon, so_khach_em1, so_khach_em2, so_khach_tl, hdv_id, xe_id, ghi_chu",
        )
        .eq("doan_id", sourceDoanId)
        .order("thu_tu", { ascending: true });
      const { data: defNhom } = await externalSupabase
        .from("doan_nhom")
        .select("id")
        .eq("doan_id", newId)
        .eq("thu_tu", 1)
        .maybeSingle();

      if (!defNhom) {
        throw new Error("Đoàn mới chưa có nhóm mặc định (trigger doan_auto_create_nhom_default)");
      }
      const nhomMap = new Map<number, number>();
      for (const n of srcNhom ?? []) {
        const fields = {
          ten_nhom: n.ten_nhom,
          thu_tu: n.thu_tu,
          so_khach_lon: n.so_khach_lon,
          so_khach_em1: n.so_khach_em1,
          so_khach_em2: n.so_khach_em2,
          so_khach_tl: n.so_khach_tl,
          hdv_id: n.hdv_id,
          xe_id: n.xe_id,
          ghi_chu: n.ghi_chu,
        };
        if (n.thu_tu === 1 && defNhom) {
          await externalSupabase.from("doan_nhom").update(fields).eq("id", defNhom.id);
          nhomMap.set(n.id, defNhom.id);
        } else {
          const { data: ins } = await externalSupabase
            .from("doan_nhom")
            .insert({ doan_id: newId, ...fields })
            .select("id")
            .single();
          if (ins) nhomMap.set(n.id, ins.id);
        }
      }
      const fallbackNhom = defNhom.id;

      // 3. Copy doan_ngay (giữ nội dung chương trình: thành phố, bữa ăn, set menu, KS)
      const { data: srcDays } = await externalSupabase
        .from("doan_ngay")
        .select(
          "id, doan_nhom_id, ngay_so, ngay_date, thu, thanh_pho, an_trua_nha_hang_id, an_trua_set_menu_id, an_trua_so_khach, an_trua_ghi_chu, an_toi_nha_hang_id, an_toi_set_menu_id, an_toi_so_khach, an_toi_ghi_chu, khach_san_id, ks_ma_code, ks_loai_phong",
        )
        .eq("doan_id", sourceDoanId)
        .order("ngay_so", { ascending: true });
      const dayMap = new Map<number, number>();
      for (const day of srcDays ?? []) {
        const { id, doan_nhom_id, ...rest } = day;
        const newNhomId =
          (doan_nhom_id != null ? nhomMap.get(doan_nhom_id) : null) ?? fallbackNhom;
        const { data: ins } = await externalSupabase
          .from("doan_ngay")
          .insert({ ...rest, doan_id: newId, doan_nhom_id: newNhomId })
          .select("id")
          .single();
        if (ins) dayMap.set(id, ins.id);
      }

      // 4. Copy doan_ngay_item (cảnh điểm). thanh_tien là generated column → KHÔNG insert.
      const { data: srcItems } = await externalSupabase
        .from("doan_ngay_item")
        .select(
          "doan_ngay_id, canh_diem_id, thu_tu, co_phi, don_gia, so_luong, trang_thai, ghi_chu, nguoi_thanh_toan",
        )
        .eq("doan_id", sourceDoanId);
      const itemsPayload = (srcItems ?? [])
        .map((it) => {
          const { doan_ngay_id, ...rest } = it;
          const newDayId = doan_ngay_id != null ? dayMap.get(doan_ngay_id) : undefined;
          return newDayId ? { ...rest, doan_id: newId, doan_ngay_id: newDayId } : null;
        })
        .filter((x): x is NonNullable<typeof x> => x != null);
      if (itemsPayload.length > 0) {
        await externalSupabase.from("doan_ngay_item").insert(itemsPayload);
      }

      return created;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["doan"] });
    },
  });
}
