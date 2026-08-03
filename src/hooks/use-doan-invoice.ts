import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { externalSupabase } from "@/lib/supabase-external";
import type { TablesInsert } from "@/lib/database.types";

export interface InvoiceFile {
  url: string;
  name: string;
  uploaded_at: string;
}

export interface DoanInvoiceRow {
  id: number;
  doan_id: number;
  so_tien_thu: number | null;
  currency: string;
  invoice_files: InvoiceFile[];
  ghi_chu: string | null;
  updated_at: string;
}

export interface ChiPhiSummary {
  thucTe: number;
  total: number;
}

// ── Query: invoice record cho 1 đoàn ──────────────────────────────────────────
export function useDoanInvoiceData(doanId?: number) {
  return useQuery({
    queryKey: ["doan_invoice", doanId],
    enabled: !!doanId,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await externalSupabase
        .from("doan_invoice")
        .select("*")
        .eq("doan_id", doanId!)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      return {
        ...data,
        invoice_files: (data.invoice_files ?? []) as unknown as InvoiceFile[],
      } as DoanInvoiceRow;
    },
  });
}

// ── Query: chi phí thực tế aggregated cho nhiều đoàn ─────────────────────────
// Aggregate trên DB qua RPC — select raw doan_chi_phi rồi cộng ở client bị
// PostgREST cắt ở 1000 dòng → đoàn ngoài 1000 dòng đầu hiển thị 0 đ.
export function useChiPhiSummaryMap(doanIds: number[]) {
  return useQuery({
    queryKey: ["chi_phi_summary_map", doanIds.slice().sort().join(",")],
    enabled: doanIds.length > 0,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await externalSupabase.rpc(
        "get_chi_phi_summary_by_doan",
        { p_doan_ids: doanIds },
      );
      if (error) throw error;

      const map = new Map<number, ChiPhiSummary>();
      for (const r of data ?? []) {
        map.set(r.doan_id, { thucTe: r.thuc_te ?? 0, total: r.total ?? 0 });
      }
      return map;
    },
  });
}

// ── Mutation: upsert doan_invoice ─────────────────────────────────────────────
export function useUpsertDoanInvoice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: {
      doan_id: number;
      so_tien_thu?: number | null;
      currency?: string;
      invoice_files?: InvoiceFile[];
      ghi_chu?: string | null;
    }) => {
      const { error } = await externalSupabase
        .from("doan_invoice")
        .upsert(
          { ...payload, updated_at: new Date().toISOString() } as unknown as TablesInsert<"doan_invoice">,
          { onConflict: "doan_id" },
        );
      if (error) throw error;
    },
    onSuccess: (_, v) => {
      qc.invalidateQueries({ queryKey: ["doan_invoice", v.doan_id] });
    },
  });
}

// ── Mutation: upload file ─────────────────────────────────────────────────────
export function useUploadInvoiceFile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ doanId, file, currentFiles }: {
      doanId: number;
      file: File;
      currentFiles: InvoiceFile[];
    }) => {
      const ext = file.name.split(".").pop() ?? "bin";
      const path = `invoices/${doanId}/${Date.now()}.${ext}`;

      const { error: uploadErr } = await externalSupabase.storage
        .from("dntt-documents")
        .upload(path, file, { upsert: false });
      if (uploadErr) throw uploadErr;

      const { data: urlData } = externalSupabase.storage
        .from("dntt-documents")
        .getPublicUrl(path);

      const newFile: InvoiceFile = {
        url: urlData.publicUrl,
        name: file.name,
        uploaded_at: new Date().toISOString(),
      };
      const updatedFiles = [...currentFiles, newFile];

      const { error: upsertErr } = await externalSupabase
        .from("doan_invoice")
        .upsert(
          {
            doan_id: doanId,
            invoice_files: updatedFiles,
            updated_at: new Date().toISOString(),
          } as unknown as TablesInsert<"doan_invoice">,
          { onConflict: "doan_id" },
        );
      if (upsertErr) throw upsertErr;
      return updatedFiles;
    },
    onSuccess: (_, v) => {
      qc.invalidateQueries({ queryKey: ["doan_invoice", v.doanId] });
    },
  });
}

// ── Query: batch so_tien_thu cho summary strip ────────────────────────────────
export function useDoanInvoiceSummaryMap(doanIds: number[]) {
  return useQuery({
    queryKey: ["doan_invoice_summary_map", doanIds.slice().sort().join(",")],
    enabled: doanIds.length > 0,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await externalSupabase
        .from("doan_invoice")
        .select("doan_id, so_tien_thu, currency")
        .in("doan_id", doanIds);
      if (error) throw error;
      const map = new Map<number, { amount: number; currency: string }>();
      for (const r of data ?? []) {
        map.set(r.doan_id, { amount: r.so_tien_thu ?? 0, currency: r.currency ?? "VND" });
      }
      return map;
    },
  });
}

// ── Mutation: xoá 1 file ──────────────────────────────────────────────────────
export function useDeleteInvoiceFile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ doanId, fileUrl, currentFiles }: {
      doanId: number;
      fileUrl: string;
      currentFiles: InvoiceFile[];
    }) => {
      const updatedFiles = currentFiles.filter((f) => f.url !== fileUrl);
      const { error } = await externalSupabase
        .from("doan_invoice")
        .upsert(
          {
            doan_id: doanId,
            invoice_files: updatedFiles,
            updated_at: new Date().toISOString(),
          } as unknown as TablesInsert<"doan_invoice">,
          { onConflict: "doan_id" },
        );
      if (error) throw error;
      return updatedFiles;
    },
    onSuccess: (_, v) => {
      qc.invalidateQueries({ queryKey: ["doan_invoice", v.doanId] });
    },
  });
}
