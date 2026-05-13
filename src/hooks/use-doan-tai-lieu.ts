import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { externalSupabase } from "@/lib/supabase-external";

export type DoanTaiLieuLoai = "bao_gia" | "hop_dong" | "danh_sach_khach";

export const TAI_LIEU_LABEL: Record<DoanTaiLieuLoai, string> = {
  bao_gia: "Báo giá",
  hop_dong: "Hợp đồng",
  danh_sach_khach: "Danh sách khách",
};

export interface DoanTaiLieuRow {
  id: number;
  doan_id: number;
  loai: DoanTaiLieuLoai;
  file_url: string;
  file_name: string | null;
  uploaded_at: string;
  uploaded_by: string | null;
}

const QK = "doan_tai_lieu";
const BUCKET = "dntt-documents"; // reuse existing public bucket

export function useDoanTaiLieuList(doanId?: number | null) {
  return useQuery({
    queryKey: [QK, doanId],
    enabled: !!doanId,
    queryFn: async (): Promise<DoanTaiLieuRow[]> => {
      const { data, error } = await externalSupabase
        .from("doan_tai_lieu")
        .select("*")
        .eq("doan_id", doanId!);
      if (error) throw error;
      return (data ?? []) as DoanTaiLieuRow[];
    },
  });
}

/**
 * Bulk-fetch tài liệu cho nhiều đoàn (cho HoaDonUNCPage hiện báo giá / hợp đồng).
 * Trả map: doan_id → { loai → row }
 */
export function useDoanTaiLieuByDoanIds(doanIds: number[]) {
  const ids = [...new Set(doanIds.filter((id): id is number => id != null))].sort();
  return useQuery({
    queryKey: [QK, "bulk", ids.join(",")],
    enabled: ids.length > 0,
    queryFn: async () => {
      const { data, error } = await externalSupabase
        .from("doan_tai_lieu")
        .select("*")
        .in("doan_id", ids);
      if (error) throw error;
      const map = new Map<number, Partial<Record<DoanTaiLieuLoai, DoanTaiLieuRow>>>();
      (data ?? []).forEach((r: any) => {
        if (!map.has(r.doan_id)) map.set(r.doan_id, {});
        map.get(r.doan_id)![r.loai as DoanTaiLieuLoai] = r as DoanTaiLieuRow;
      });
      return map;
    },
  });
}

export function useUploadDoanTaiLieu() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      doanId, loai, file, uploadedBy,
    }: {
      doanId: number;
      loai: DoanTaiLieuLoai;
      file: File;
      uploadedBy?: string | null;
    }) => {
      // Sanitize filename — Supabase Storage không cho ký tự đặc biệt
      const ext = (file.name.split(".").pop() ?? "bin").replace(/[^a-zA-Z0-9]/g, "");
      const path = `doan-${doanId}/${loai}/${Date.now()}.${ext}`;

      const { error: uploadErr } = await externalSupabase.storage
        .from(BUCKET)
        .upload(path, file, { upsert: true, contentType: file.type || undefined });
      if (uploadErr) throw uploadErr;

      const { data: urlData } = externalSupabase.storage.from(BUCKET).getPublicUrl(path);

      // Upsert vào bảng — UNIQUE(doan_id, loai) → replace nếu re-upload
      const { error: upsertErr } = await externalSupabase
        .from("doan_tai_lieu")
        .upsert(
          {
            doan_id: doanId,
            loai,
            file_url: urlData.publicUrl,
            file_name: file.name,
            uploaded_by: uploadedBy ?? null,
            uploaded_at: new Date().toISOString(),
          },
          { onConflict: "doan_id,loai" },
        );
      if (upsertErr) throw upsertErr;
      return urlData.publicUrl;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: [QK, vars.doanId] });
      qc.invalidateQueries({ queryKey: [QK, "bulk"] });
    },
  });
}

export function useDeleteDoanTaiLieu() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, doanId }: { id: number; doanId: number }) => {
      void doanId;
      const { error } = await externalSupabase
        .from("doan_tai_lieu")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: [QK, vars.doanId] });
      qc.invalidateQueries({ queryKey: [QK, "bulk"] });
    },
  });
}
