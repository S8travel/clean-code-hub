import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { externalSupabase } from "@/lib/supabase-external";

export type DoanTaiLieuLoai = "bao_gia" | "hop_dong" | "danh_sach_khach" | "khac";

/** 3 loại fixed (1 file mỗi loại). 'khac' = tài liệu tùy chỉnh (nhiều file). */
export const TAI_LIEU_LABEL: Record<DoanTaiLieuLoai, string> = {
  bao_gia: "Báo giá",
  hop_dong: "Hợp đồng",
  danh_sach_khach: "Danh sách khách",
  khac: "Tài liệu khác",
};

export interface DoanTaiLieuRow {
  id: number;
  doan_id: number;
  loai: DoanTaiLieuLoai;
  file_url: string;
  file_name: string | null;
  uploaded_at: string;
  uploaded_by: string | null;
  /** Tên tài liệu — chỉ dùng khi loai='khac' (3 loại fixed dùng label cứng) */
  ten: string | null;
  /** Mô tả ngắn — chỉ dùng khi loai='khac' */
  mo_ta: string | null;
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
 * Bulk-fetch tài liệu cho nhiều đoàn (cho InvoicePage hiện báo giá / hợp đồng).
 * Trả map: doan_id → row[] (loại bao_gia/khac có thể nhiều row/đoàn).
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
      const map = new Map<number, DoanTaiLieuRow[]>();
      (data ?? []).forEach((r) => {
        const row = r as DoanTaiLieuRow;
        const arr = map.get(row.doan_id);
        if (arr) arr.push(row);
        else map.set(row.doan_id, [row]);
      });
      return map;
    },
  });
}

export function useUploadDoanTaiLieu() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      doanId, loai, file, uploadedBy, ten, moTa,
    }: {
      doanId: number;
      loai: DoanTaiLieuLoai;
      file: File;
      uploadedBy?: string | null;
      /** Bắt buộc khi loai='khac', bị bỏ qua cho 3 loại fixed */
      ten?: string | null;
      moTa?: string | null;
    }) => {
      // Sanitize filename — Supabase Storage không cho ký tự đặc biệt
      const ext = (file.name.split(".").pop() ?? "bin").replace(/[^a-zA-Z0-9]/g, "");
      const path = `doan-${doanId}/${loai}/${Date.now()}.${ext}`;

      const { error: uploadErr } = await externalSupabase.storage
        .from(BUCKET)
        .upload(path, file, { contentType: file.type || undefined }); // path duy nhất → KHÔNG upsert (tránh lỗi RLS nhánh UPDATE policy)
      if (uploadErr) throw uploadErr;

      const { data: urlData } = externalSupabase.storage.from(BUCKET).getPublicUrl(path);

      const isKhac = loai === "khac";
      // bao_gia + khac: nhiều file/đoàn (append). hop_dong + danh_sach_khach: 1 file (replace).
      const isMultiFile = loai === "bao_gia" || isKhac;
      const payload = {
        doan_id: doanId,
        loai,
        file_url: urlData.publicUrl,
        file_name: file.name,
        uploaded_by: uploadedBy ?? null,
        uploaded_at: new Date().toISOString(),
        ten: isKhac ? (ten ?? null) : null,
        mo_ta: isKhac ? (moTa ?? null) : null,
      };

      if (isMultiFile) {
        // Không UNIQUE → INSERT thêm row mới (append)
        const { error: insertErr } = await externalSupabase
          .from("doan_tai_lieu")
          .insert(payload);
        if (insertErr) throw insertErr;
      } else {
        // hop_dong + danh_sach_khach: 1 file/loại (replace). UNIQUE là PARTIAL
        // index (doan_id, loai) WHERE loai IN ('hop_dong','danh_sach_khach') —
        // supabase-js .upsert({onConflict}) KHÔNG truyền được partial predicate
        // cho PostgREST → Postgres báo 42P10 ("no unique or exclusion constraint
        // matching the ON CONFLICT spec"). → select → update/insert thủ công.
        const { data: existing, error: selErr } = await externalSupabase
          .from("doan_tai_lieu")
          .select("id")
          .eq("doan_id", doanId)
          .eq("loai", loai)
          .maybeSingle();
        if (selErr) throw selErr;
        if (existing) {
          const { error: updErr } = await externalSupabase
            .from("doan_tai_lieu")
            .update(payload)
            .eq("id", existing.id);
          if (updErr) throw updErr;
        } else {
          const { error: insErr } = await externalSupabase
            .from("doan_tai_lieu")
            .insert(payload);
          if (insErr) throw insErr;
        }
      }
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
