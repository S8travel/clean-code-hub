// Quyết định giấy tờ nào của đoàn được chép sang cổng đối tác, chép vào đâu, và
// khi nào phải chép lại. Tách khỏi edge function để test được.
//
// File KHÔNG dùng chung link với CRM. Bucket bên CRM là private và link phải ký,
// mà cổng nằm ở project khác nên không ký hộ được; đi vòng qua CRM để ký thì cổng
// chết theo mỗi lần CRM chết. Nên chép hẳn một bản sang kho của cổng — đúng tinh
// thần "đứt đường đồng bộ thì cổng thiếu dữ liệu, không phải lộ dữ liệu".

export interface TaiLieuNguon {
  id: number;
  doan_id: number;
  loai: string;
  ten: string | null;
  file_url: string;
  file_name: string | null;
  uploaded_at: string | null;
  /** NULL = theo mặc định của loại; true/false = OP ép tay. */
  portal_enabled: boolean | null;
}

export interface TaiLieuDaCo {
  crm_tai_lieu_id: number;
  tai_len_luc: string | null;
}

/** Loại tài liệu mặc định cho đối tác xem. */
export const LOAI_MAC_DINH_CHIA_SE = ["hop_dong", "danh_sach_khach"];

/**
 * File này có được đưa lên cổng không.
 *
 * 'bao_gia' KHÔNG bao giờ đi qua đây kể cả khi OP bật cờ: cổng đã có mục Báo giá
 * riêng lấy từ bảng bao_gia (bản đã đóng băng lúc chào). Đẩy thêm file Word cũ
 * chỉ tạo ra hai con số khác nhau cho cùng một đoàn.
 */
export function chiaSeVoiDoiTac(t: Pick<TaiLieuNguon, "loai" | "portal_enabled">): boolean {
  if (t.loai === "bao_gia") return false;
  if (t.portal_enabled !== null && t.portal_enabled !== undefined) return t.portal_enabled;
  return LOAI_MAC_DINH_CHIA_SE.includes(t.loai);
}

/** Tách {bucket, path} từ URL Supabase Storage (dạng /public/ lẫn /sign/). */
export function tachStorageUrl(url: string): { bucket: string; path: string } | null {
  if (!url) return null;
  const m = /\/storage\/v1\/object\/(?:public|sign)\/([^/]+)\/([^?]+)/.exec(url);
  if (!m) return null;
  const path = decodeURIComponent(m[2]);
  return path ? { bucket: m[1], path } : null;
}

// Storage không nhận mọi ký tự trong tên file; tên gốc tiếng Việt có dấu vẫn giữ
// được ở cột file_name để hiện cho người dùng, còn đường dẫn thì rút về ASCII.
export const lamSachTen = (ten: string): string => {
  const sach = ten
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d").replace(/Đ/g, "D")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return sach.slice(0, 80) || "file";
};

/**
 * Đường dẫn trong bucket 'tai-lieu' của cổng.
 * Thư mục cấp 1 mang agent id — policy storage chỉ so một đoạn là xong, không
 * phải join ngược về bảng cho từng object.
 */
export function duongDanCong(agentId: number, doanId: number, t: TaiLieuNguon): string {
  const ten = lamSachTen(t.file_name ?? tachStorageUrl(t.file_url)?.path.split("/").pop() ?? "file");
  return `agent_${agentId}/doan_${doanId}/${t.id}_${ten}`;
}

/**
 * Có phải tải lại file không. So theo `uploaded_at`: OP thay file hợp đồng thì
 * cột này đổi (useUploadDoanTaiLieu luôn ghi lại), còn chạy đẩy lại 10 lần trong
 * ngày mà không ai đụng file thì không tải lại lần nào.
 */
export function canChepLai(t: TaiLieuNguon, daCo: TaiLieuDaCo | undefined): boolean {
  if (!daCo) return true;
  return (daCo.tai_len_luc ?? null) !== (t.uploaded_at ?? null);
}
