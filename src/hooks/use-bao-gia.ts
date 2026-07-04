import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { externalSupabase, EXTERNAL_SUPABASE_URL } from "@/lib/supabase-external";
import type { TablesInsert, TablesUpdate } from "@/lib/database.types";

export interface BaoGiaItem {
  loai: "hotel" | "meal" | "ticket" | "transport";
  mo_ta: string;
  don_gia: number;
  ghi_chu: string;
  // P3 — day grouping. 1-based ngày trong tour. Items cũ chưa có sẽ default
  // Day 1 khi render (groupItemsByDay).
  ngay_so?: number;
  // Phân biệt bữa với loai='meal' (trưa/tối). Calc giữ nguyên (cả 2 cùng
  // tính × pax). Item cũ không có field này sẽ hiển thị "Ăn uống" generic.
  bua_an?: "trua" | "toi";
  // FOC = SỐ MIỄN nhập tay (override). Trừ khỏi multiplier:
  //   hotel: (rooms - foc) × gia,  meal/ticket: (pax - foc) × gia.
  // null/undefined → tự tính theo chính sách foc_khach/foc_mien bên dưới (nếu có).
  foc?: number;
  // Chính sách FOC nhà hàng (snapshot master nha_hang): foc_khach miễn foc_mien.
  // Auto số miễn mỗi cỡ đoàn = floor(pax / foc_khach) × foc_mien. Override = foc.
  foc_khach?: number;
  foc_mien?: number;
  // N (次/N数): số đêm (KS) / số lần (ăn, vé) / số chuyến (xe). Nhân vào thành
  // tiền. Item cũ không có → mặc định 1.
  so_luong?: number;
  // Tên gốc tiếng Trung (từ AI trích lịch trình ZH) — hiển thị song ngữ trong
  // bảng costing kiểu Excel. Item nhập tay/không có → bỏ trống.
  ten_zh?: string;
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

// 1 bậc giá cuối: số khách → giá bán/khách (VND) nhập tay. Chỉ dùng cho
// loai_bao_gia='gia_cuoi' (land tour giá đã chốt). USD = gia_ban_vnd / tỷ giá.
export interface GiaCuoiTier {
  guests: number;
  gia_ban_vnd: number;
}

// 1 cột giá trong bảng xuất Đài Loan (nhãn khoảng khách + giá/khách USD).
export interface BaoGiaExportBracket {
  label: string;      // "10-14 pax"
  price_usd: number;  // giá bán/khách (USD) cho khoảng này
}

// Cấu hình nội dung xuất báo giá Đài Loan — SỬA ĐƯỢC + LƯU theo báo giá (ket_qua).
// Field nào vắng → export dùng mặc định tính live (taiwanExportDefaults).
export interface BaoGiaExportConfig {
  brackets?: BaoGiaExportBracket[];    // khoảng giá (cột)
  single_supplement_usd?: number;      // 單房差
  above_notes?: string;                // 以上價格不含 (nhiều dòng)
  included?: string;                   // 報價包含 (nhiều dòng; cảnh điểm tự nối thêm khi xuất)
  excluded?: string;                   // 報價不含 (nhiều dòng)
  notes?: string;                      // 備註
}

export interface BaoGiaKetQua {
  ten_chuong_trinh: string;
  so_ngay: number;
  items: BaoGiaItem[];
  // Cấu hình xuất báo giá Đài Loan (user sửa trong app). Vắng → export tính mặc định.
  export_config?: BaoGiaExportConfig | null;
  case_16: BaoGiaCase;
  case_20: BaoGiaCase;
  gia_trung_binh_vnd: number;
  gia_trung_binh_usd: number;
  // Ma trận giá nhiều bậc — danh sách SỐ KHÁCH mỗi bậc. Vắng/rỗng → mặc định
  // [16, 20] (back-compat 2 mức cũ). Giá mỗi bậc tính live qua calcTiers.
  tier_guests?: number[];
  // Mode 'gia_cuoi': giá bán/khách nhập thẳng theo bậc số khách (KHÔNG tính từ
  // items). Vắng ở báo giá tự-tính. Source of truth cho bảng giá + Word.
  gia_cuoi_tiers?: GiaCuoiTier[];
  // Bản nháp review "AI điền từ lịch trình" (chưa áp dụng) — lưu để mở lại tiếp tục.
  ai_review?: import("@/lib/bao-gia-ai-resolve").AiReviewDraft | null;
}

// File lịch trình đính kèm (loai_bao_gia='gia_cuoi' — chương trình lấy của bên
// khác). Chỉ lưu để xem/tải/xuất kèm, KHÔNG cho AI đọc.
export interface LichTrinhFile {
  ten: string;
  url: string;
  uploaded_at: string;
  uploaded_by?: string | null;
}

export type LoaiBaoGia = "tu_tinh" | "gia_cuoi";

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
  // Field P2 — trang chi tiết báo giá. Nullable trên row cũ vì mới migrate.
  ngay_di: string | null;
  ngay_ve: string | null;
  ghi_chu: string | null;
  hieu_luc_ngay: number | null;
  // P3
  ma_bg: string | null;   // generated col — read-only, auto từ id
  lead_id: number | null; // FK → public.lead(id)
  // Xe snapshot từ bang_gia_dich_vu (loai='xe'). KHÔNG còn FK — chọn từ bảng
  // giá hoặc gõ free-text, snapshot ten+gia vào báo giá → re-import bảng
  // giá không ảnh hưởng báo giá cũ. Match triết lý snapshot module chi phí.
  xe_ten: string | null;
  xe_gia: number | null;
  // Phụ thu lump-sum: vé cầu đường, xe trung chuyển, các phí cố định khác.
  // Tính 1 lần cho cả tour, KHÔNG nhân pax. Cộng vào tổng chi phí vốn.
  phu_thu: number;
  // Tỷ giá VCB (giá MUA USD) snapshot. Khác exchange_rate (báo giá rate quote
  // khách) → tính chênh lệch tỷ giá cho biên lợi nhuận. NULL = bỏ qua.
  vcb_rate: number | null;
  // Đối tác bán (agents.id) — báo giá làm cho agent này. Nullable (nháp chưa rõ).
  agent_id: number | null;
  // Nhãn loại tour ('inbound'|'outbound'|'noi_dia'); map sang doan.loai_tour khi chốt.
  loai_tour: string | null;
  // 'tu_tinh' (tính từ dịch vụ) | 'gia_cuoi' (giá chốt sẵn theo bậc). Default 'tu_tinh'.
  loai_bao_gia: LoaiBaoGia;
  // File lịch trình đính kèm (mode 'gia_cuoi'). jsonb mảng LichTrinhFile.
  lich_trinh_files: LichTrinhFile[];
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
      return data as unknown as BaoGiaRow[];
    },
  });
}

export function useBaoGiaByLead(leadId: number | null | undefined) {
  return useQuery({
    queryKey: ["bao_gia", "by-lead", leadId],
    enabled: !!leadId,
    queryFn: async () => {
      const { data, error } = await externalSupabase
        .from("bao_gia")
        .select("*")
        .eq("lead_id", leadId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as unknown as BaoGiaRow[];
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
      return data as unknown as BaoGiaRow;
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
        .insert(payload as unknown as TablesInsert<"bao_gia">)
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

// Nhân bản 1 báo giá → bản nháp mới (giữ lịch trình + giá + ma trận bậc).
// ma_bg/id/created_at để DB tự sinh; trạng thái về draft; gắn lead mới (hoặc bỏ trống).
export function useCloneBaoGia() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, leadId }: { id: number; leadId?: number | null }) => {
      const { data: src, error: e1 } = await externalSupabase
        .from("bao_gia")
        .select("*")
        .eq("id", id)
        .single();
      if (e1) throw e1;
      const s = src as unknown as BaoGiaRow;
      const payload: Omit<Partial<BaoGiaRow>, "id" | "created_at"> = {
        tieu_de: s.tieu_de ? `${s.tieu_de} (sao chép)` : s.tieu_de,
        noi_dung_goc: s.noi_dung_goc,
        ket_qua: s.ket_qua,
        exchange_rate: s.exchange_rate,
        profit_usd: s.profit_usd,
        ngay_di: s.ngay_di,
        ngay_ve: s.ngay_ve,
        ghi_chu: s.ghi_chu,
        hieu_luc_ngay: s.hieu_luc_ngay,
        xe_ten: s.xe_ten,
        xe_gia: s.xe_gia,
        phu_thu: s.phu_thu,
        vcb_rate: s.vcb_rate,
        agent_id: s.agent_id,
        loai_tour: s.loai_tour,
        loai_bao_gia: s.loai_bao_gia,
        lich_trinh_files: s.lich_trinh_files,
        trang_thai: "draft",
        lead_id: leadId ?? null,
      };
      const { data, error } = await externalSupabase
        .from("bao_gia")
        .insert(payload as unknown as TablesInsert<"bao_gia">)
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
      const { error } = await externalSupabase
        .from("bao_gia")
        .update(rest as unknown as TablesUpdate<"bao_gia">)
        .eq("id", id);
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

// ── File lịch trình (mode 'gia_cuoi') ──
// Lưu vào bucket public dùng chung "dntt-documents" (path duy nhất → KHÔNG upsert,
// tránh lỗi RLS nhánh UPDATE policy). Danh sách lưu jsonb bao_gia.lich_trinh_files.

const LICH_TRINH_BUCKET = "dntt-documents";

export function useUploadLichTrinhFile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      baoGiaId, file, current, uploadedBy,
    }: {
      baoGiaId: number;
      file: File;
      current: LichTrinhFile[];
      uploadedBy?: string | null;
    }): Promise<LichTrinhFile[]> => {
      const ext = (file.name.split(".").pop() ?? "bin").replace(/[^a-zA-Z0-9]/g, "");
      const path = `bao-gia-${baoGiaId}/${Date.now()}.${ext}`;
      const { error: upErr } = await externalSupabase.storage
        .from(LICH_TRINH_BUCKET)
        .upload(path, file, { contentType: file.type || undefined });
      if (upErr) throw upErr;
      const { data: urlData } = externalSupabase.storage.from(LICH_TRINH_BUCKET).getPublicUrl(path);
      const next: LichTrinhFile[] = [
        ...(current ?? []),
        {
          ten: file.name,
          url: urlData.publicUrl,
          uploaded_at: new Date().toISOString(),
          uploaded_by: uploadedBy ?? null,
        },
      ];
      const { error } = await externalSupabase
        .from("bao_gia")
        .update({ lich_trinh_files: next as unknown as TablesUpdate<"bao_gia">["lich_trinh_files"] })
        .eq("id", baoGiaId);
      if (error) throw error;
      return next;
    },
    onSuccess: (_data, { baoGiaId }) => {
      qc.invalidateQueries({ queryKey: ["bao_gia"] });
      qc.invalidateQueries({ queryKey: ["bao_gia", baoGiaId] });
    },
  });
}

// Gỡ 1 file khỏi danh sách (theo url). KHÔNG xóa object storage (giữ đơn giản,
// bucket public dùng chung — tránh xóa nhầm; orphan file không ảnh hưởng).
export function useRemoveLichTrinhFile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      baoGiaId, url, current,
    }: {
      baoGiaId: number;
      url: string;
      current: LichTrinhFile[];
    }): Promise<LichTrinhFile[]> => {
      const next = (current ?? []).filter((f) => f.url !== url);
      const { error } = await externalSupabase
        .from("bao_gia")
        .update({ lich_trinh_files: next as unknown as TablesUpdate<"bao_gia">["lich_trinh_files"] })
        .eq("id", baoGiaId);
      if (error) throw error;
      return next;
    },
    onSuccess: (_data, { baoGiaId }) => {
      qc.invalidateQueries({ queryKey: ["bao_gia"] });
      qc.invalidateQueries({ queryKey: ["bao_gia", baoGiaId] });
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

// ── Manual extraction ──

export interface ExtractedChuongTrinh {
  ten_chuong_trinh: string;
  so_ngay: number;
  items: Array<{
    ngay: number;
    loai: "hotel" | "meal" | "ticket" | "transport";
    mo_ta_zh: string;
    mo_ta_goi_y: string;
  }>;
}

export function useExtractChuongTrinh() {
  return useMutation({
    mutationFn: async (text: string): Promise<ExtractedChuongTrinh> => {
      const session = await externalSupabase.auth.getSession();
      const token = session.data.session?.access_token;

      const resp = await fetch(`${EXTERNAL_SUPABASE_URL}/functions/v1/extract-chuong-trinh`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ text }),
      });

      if (!resp.ok) {
        const err = await resp.json();
        throw new Error(err.error ?? "Lỗi trích xuất");
      }

      return resp.json();
    },
  });
}

// ── AI extract + match lịch trình (mode tự tính) ──
// Gọi edge fn bao-gia-extract-match: AI trích xuất + khớp dòng master (id),
// KHÔNG bịa giá. Giá resolve ở client qua lib/bao-gia-ai-resolve.
export function useExtractMatchItinerary() {
  return useMutation({
    // input: đọc file đính kèm ({fileUrl,fileType}) hoặc dán text ({itinerary}).
    mutationFn: async (
      input: { itinerary?: string; fileUrl?: string; fileType?: string; provider?: "claude" | "keystone" },
    ): Promise<import("@/lib/bao-gia-ai-resolve").AiExtractResult> => {
      const session = await externalSupabase.auth.getSession();
      const token = session.data.session?.access_token;
      const resp = await fetch(`${EXTERNAL_SUPABASE_URL}/functions/v1/bao-gia-extract-match`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(input),
      });
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new Error(err.error ?? "Lỗi AI trích xuất lịch trình");
      }
      const { ketQua } = await resp.json();
      return ketQua;
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
