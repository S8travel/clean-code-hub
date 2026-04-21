import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { externalSupabase, EXTERNAL_SUPABASE_URL } from "@/lib/supabase-external";

export interface BaoGiaItem {
  loai: "hotel" | "meal" | "ticket" | "transport";
  mo_ta: string;
  don_gia: number;
  ghi_chu: string;
}

export interface BaoGiaCase {
  guests: number;
  pax: number;
  rooms: number;
  hotel: number;
  meal: number;
  ticket: number;
  transport: number;
  insurance: number;
  guide: number;
  tips: number;
  total_cost: number;
  profit_vnd: number;
  final_price_vnd: number;
  final_price_usd: number;
}

export interface BaoGiaKetQua {
  ten_chuong_trinh: string;
  so_ngay: number;
  items: BaoGiaItem[];
  case_16: BaoGiaCase;
  case_20: BaoGiaCase;
  gia_trung_binh_vnd: number;
  gia_trung_binh_usd: number;
}

export interface BaoGiaRow {
  id: number;
  tieu_de: string | null;
  noi_dung_goc: string | null;
  ket_qua: BaoGiaKetQua | null;
  exchange_rate: number | null;
  profit_usd: number | null;
  trang_thai: string;
  created_at: string;
  created_by: string | null;
}

// ── Queries ──

export function useBaoGiaList() {
  return useQuery({
    queryKey: ["bao_gia"],
    queryFn: async () => {
      const { data, error } = await externalSupabase
        .from("bao_gia")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as BaoGiaRow[];
    },
  });
}

export function useBaoGia(id?: number) {
  return useQuery({
    queryKey: ["bao_gia", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await externalSupabase
        .from("bao_gia")
        .select("*")
        .eq("id", id!)
        .single();
      if (error) throw error;
      return data as BaoGiaRow;
    },
  });
}

// ── Mutations ──

export function useCreateBaoGia() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: Omit<Partial<BaoGiaRow>, "id" | "created_at">) => {
      const { data, error } = await externalSupabase
        .from("bao_gia")
        .insert(payload)
        .select("id")
        .single();
      if (error) throw error;
      return data as { id: number };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["bao_gia"] });
    },
  });
}

export function useUpdateBaoGia() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...rest }: { id: number } & Partial<BaoGiaRow>) => {
      const { error } = await externalSupabase.from("bao_gia").update(rest).eq("id", id);
      if (error) throw error;
      return id;
    },
    onSuccess: (id) => {
      qc.invalidateQueries({ queryKey: ["bao_gia"] });
      qc.invalidateQueries({ queryKey: ["bao_gia", id] });
    },
  });
}

export function useDeleteBaoGia() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const { error } = await externalSupabase.from("bao_gia").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["bao_gia"] });
    },
  });
}

// ── AI Processing ──

export function useProcessBaoGia() {
  return useMutation({
    mutationFn: async ({
      file,
      exchangeRate,
      profitUsd,
    }: {
      file: File;
      exchangeRate: number;
      profitUsd: number;
    }): Promise<BaoGiaKetQua> => {
      const base64 = await fileToBase64(file);
      const session = await externalSupabase.auth.getSession();
      const token = session.data.session?.access_token;

      const resp = await fetch(`${EXTERNAL_SUPABASE_URL}/functions/v1/process-bao-gia`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          fileContent: base64,
          fileType: file.type || detectFileType(file.name),
          exchangeRate,
          profitUsd,
        }),
      });

      if (!resp.ok) {
        const err = await resp.json();
        throw new Error(err.error ?? "Lỗi xử lý AI");
      }

      const { ketQua } = await resp.json();
      return ketQua as BaoGiaKetQua;
    },
  });
}

// ── Helpers ──

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.split(",")[1]);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function detectFileType(name: string): string {
  if (name.endsWith(".pdf")) return "application/pdf";
  if (name.endsWith(".docx")) return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  return "application/octet-stream";
}
