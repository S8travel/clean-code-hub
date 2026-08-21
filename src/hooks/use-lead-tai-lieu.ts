import { useQuery } from "@tanstack/react-query";
import { externalSupabase } from "@/lib/supabase-external";

// File đính kèm của một lead — hiện chỉ có một nguồn: đối tác gửi kèm khi làm
// yêu cầu báo giá trên cổng 外網 (edge fn yeu-cau-doi-tac chép sang bucket này).
//
// Bucket 'lead-files' là PRIVATE: cột duong_dan giữ đường dẫn trong bucket, không
// giữ URL — link mở phải ký lúc bấm và chỉ sống 1 giờ.

const BUCKET = "lead-files";
const SIGNED_TTL_SEC = 60 * 60;

export interface LeadTaiLieuRow {
  id: number;
  lead_id: number;
  ten: string | null;
  file_name: string | null;
  duong_dan: string;
  co_chu: number | null;
  mime: string | null;
  nguon: string;
  tao_luc: string;
}

export function useLeadTaiLieu(leadId: number | null) {
  return useQuery({
    queryKey: ["lead_tai_lieu", leadId],
    enabled: !!leadId,
    queryFn: async (): Promise<LeadTaiLieuRow[]> => {
      const { data, error } = await externalSupabase
        .from("lead_tai_lieu")
        .select("id, lead_id, ten, file_name, duong_dan, co_chu, mime, nguon, tao_luc")
        .eq("lead_id", leadId!)
        .order("id");
      if (error) throw error;
      return (data ?? []) as LeadTaiLieuRow[];
    },
  });
}

/**
 * Mở file trong tab mới.
 *
 * Mở cửa sổ TRƯỚC khi await — await xong mới window.open thì trình duyệt coi là
 * không phải hành động của người dùng và chặn popup.
 *
 * KHÔNG truyền "noopener": window.open với cờ đó trả null, nhánh gán địa chỉ cho
 * tab mới sẽ không bao giờ chạy và file chiếm luôn tab CRM đang mở.
 */
export async function moFileLead(duongDan: string): Promise<void> {
  const win = window.open("", "_blank");
  if (win) win.opener = null;
  try {
    const { data, error } = await externalSupabase.storage
      .from(BUCKET)
      .createSignedUrl(duongDan, SIGNED_TTL_SEC);
    if (error || !data?.signedUrl) throw error ?? new Error("Không tạo được link tạm cho file này");
    if (win) win.location.href = data.signedUrl;
    else window.location.href = data.signedUrl; // popup bị chặn → mở ngay tab hiện tại
  } catch (e) {
    win?.close();
    throw e;
  }
}

/** "1,2 MB" — cỡ file cho người đọc, không phải cho máy. */
export function coChuGon(bytes: number | null | undefined): string {
  if (!bytes || bytes <= 0) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1).replace(".", ",")} MB`;
}
