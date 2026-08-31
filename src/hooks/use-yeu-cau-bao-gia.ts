import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { externalSupabase } from "@/lib/supabase-external";
import type { YeuCauTrangThai } from "@/lib/yeu-cau-bao-gia";

// Yêu cầu báo giá đối tác gửi từ cổng 外網 — nguồn của tab "Yêu cầu báo giá"
// trong trang Báo giá.
//
// Đọc qua VIEW `yeu_cau_bao_gia_view` chứ không đọc thẳng bảng: cột
// `trang_thai_hien_thi` của view đối chiếu với báo giá THẬT. Báo giá bị xoá sau
// khi làm xong thì yêu cầu phải quay lại "chưa xử lý", không treo mãi ở "đã báo
// giá" — treo là không ai biết mà làm lại.

/** Bucket riêng chứa file đối tác gửi (private, xem migration 20260821). */
const LEAD_FILES_BUCKET = "lead-files";

export interface YeuCauBaoGiaRow {
  id: number;
  agent_id: number | null;
  ten_agent: string | null;
  /** Tài khoản cổng đã đăng nhập để gửi — khác người liên hệ trong form. */
  tai_khoan_email: string | null;
  tai_khoan_ten: string | null;
  nguoi_lien_he: string | null;
  email: string | null;
  so_dien_thoai: string | null;
  tieu_de: string | null;
  noi_dung: string | null;
  so_khach: number | null;
  ngay_di_du_kien: string | null;
  ngay_ve_du_kien: string | null;
  trang_thai: YeuCauTrangThai;
  ly_do_bo_qua: string | null;
  lead_id: number | null;
  xu_ly_boi: string | null;
  xu_ly_luc: string | null;
  tao_luc: string;
  /** Số file đối tác đính kèm lúc gửi. Lớn hơn số dòng file thật = có file rớt. */
  so_tep_gui: number | null;
  /** Tên các file hệ thống không lấy được — đi xin lại đối tác. */
  tep_hong: string[] | null;
  // ── Cột tính trong view ──
  so_bao_gia: number;
  so_tep: number;
  bao_gia_moi_nhat_id: number | null;
  bao_gia_moi_nhat_ten: string | null;
  bao_gia_da_gui_cong: boolean | null;
  trang_thai_hien_thi: YeuCauTrangThai;
  xu_ly_ten: string | null;
}

export interface TepYeuCauRow {
  id: number;
  yeu_cau_id: number | null;
  lead_id: number | null;
  ten: string | null;
  file_name: string | null;
  duong_dan: string;
  co_chu: number | null;
  mime: string | null;
}

export function useYeuCauBaoGiaList() {
  return useQuery({
    queryKey: ["yeu_cau_bao_gia"],
    queryFn: async (): Promise<YeuCauBaoGiaRow[]> => {
      const { data, error } = await externalSupabase
        .from("yeu_cau_bao_gia_view")
        .select("*")
        .order("tao_luc", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as YeuCauBaoGiaRow[];
    },
  });
}

/** File đối tác gửi kèm một yêu cầu. */
export function useTepYeuCau(yeuCauId: number | null) {
  return useQuery({
    queryKey: ["yeu_cau_tep", yeuCauId],
    enabled: !!yeuCauId,
    queryFn: async (): Promise<TepYeuCauRow[]> => {
      const { data, error } = await externalSupabase
        .from("lead_tai_lieu")
        .select("id, yeu_cau_id, lead_id, ten, file_name, duong_dan, co_chu, mime")
        .eq("yeu_cau_id", yeuCauId!)
        .order("id");
      if (error) throw error;
      return (data ?? []) as TepYeuCauRow[];
    },
  });
}

/**
 * File của CÁC yêu cầu đang hiển thị, gom theo yeu_cau_id — một truy vấn cho cả
 * bảng thay vì mỗi dòng một lượt.
 *
 * Lọc theo đúng danh sách id chứ không kéo cả bảng: PostgREST cắt ở 1000 dòng,
 * mà thứ tự id tăng dần nghĩa là phần bị cắt lại rơi đúng vào các yêu cầu MỚI
 * NHẤT — nhìn thì như đối tác không gửi file nào.
 */
export function useTepTheoYeuCau(ids: number[]) {
  const khoa = [...ids].sort((a, b) => a - b);
  return useQuery({
    queryKey: ["yeu_cau_tep", khoa],
    enabled: khoa.length > 0,
    queryFn: async (): Promise<Record<number, TepYeuCauRow[]>> => {
      const { data, error } = await externalSupabase
        .from("lead_tai_lieu")
        .select("id, yeu_cau_id, lead_id, ten, file_name, duong_dan, co_chu, mime")
        .in("yeu_cau_id", khoa)
        .order("id");
      if (error) throw error;
      const map: Record<number, TepYeuCauRow[]> = {};
      for (const row of (data ?? []) as TepYeuCauRow[]) {
        if (row.yeu_cau_id == null) continue;
        (map[row.yeu_cau_id] ??= []).push(row);
      }
      return map;
    },
  });
}

/**
 * Nối báo giá vừa tạo vào yêu cầu.
 *
 * Ghi cả hai phía: `bao_gia.yeu_cau_id` (nguồn sự thật — view đếm theo cột này)
 * và `yeu_cau_bao_gia.trang_thai` + ai xử lý, lúc nào. Cột trang_thai chỉ để lọc
 * nhanh và ghi công; nếu sau này báo giá bị xoá thì view tự trả yêu cầu về "chưa
 * xử lý".
 */
export function useGanBaoGiaVaoYeuCau() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      yeuCauId, baoGiaId, userId,
    }: { yeuCauId: number; baoGiaId: number; userId?: string | null }) => {
      const { error: eBg } = await externalSupabase
        .from("bao_gia")
        .update({ yeu_cau_id: yeuCauId })
        .eq("id", baoGiaId);
      if (eBg) throw eBg;

      const { error } = await externalSupabase
        .from("yeu_cau_bao_gia")
        .update({
          trang_thai: "da_bao_gia",
          xu_ly_boi: userId ?? null,
          xu_ly_luc: new Date().toISOString(),
          // Làm báo giá cho một yêu cầu từng bị bỏ qua = mở lại nó.
          ly_do_bo_qua: null,
        })
        .eq("id", yeuCauId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["yeu_cau_bao_gia"] });
      qc.invalidateQueries({ queryKey: ["bao_gia"] });
    },
  });
}

/**
 * Đánh dấu không báo giá (bắt buộc có lý do) hoặc mở lại yêu cầu đã bỏ qua.
 *
 * Mở lại KHÔNG xoá `ly_do_bo_qua` / người đã bỏ qua: đó là dấu vết ai quyết định
 * gì, tháng sau còn tra được. Trạng thái hiển thị đã do view tính nên để lại
 * không gây nhầm.
 */
export function useDoiTrangThaiYeuCau() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      yeuCauId, trangThai, lyDo, userId,
    }: {
      yeuCauId: number;
      trangThai: Extract<YeuCauTrangThai, "moi" | "bo_qua">;
      lyDo?: string | null;
      userId?: string | null;
    }) => {
      const { error } = await externalSupabase
        .from("yeu_cau_bao_gia")
        .update(
          trangThai === "bo_qua"
            ? {
                trang_thai: "bo_qua",
                ly_do_bo_qua: lyDo ?? null,
                xu_ly_boi: userId ?? null,
                xu_ly_luc: new Date().toISOString(),
              }
            : { trang_thai: "moi" },
        )
        .eq("id", yeuCauId);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["yeu_cau_bao_gia"] }),
  });
}

/**
 * Tải một file đối tác về trình duyệt để đính kèm sang báo giá.
 *
 * Vì sao phải tải rồi tải lên lại thay vì trỏ thẳng: file gốc nằm ở bucket riêng
 * `lead-files` (chỉ chứa thứ người ngoài gửi vào), còn báo giá đọc file lịch
 * trình từ kho của nó. Trỏ chéo bucket thì gỡ một file đính kèm của báo giá là
 * xoá luôn bản gốc đối tác gửi — thứ phải giữ nguyên để đối chiếu về sau.
 */
export async function taiTepDoiTac(t: Pick<TepYeuCauRow, "duong_dan" | "ten" | "file_name" | "mime">): Promise<File> {
  const { data, error } = await externalSupabase.storage.from(LEAD_FILES_BUCKET).download(t.duong_dan);
  if (error || !data) throw error ?? new Error("Không tải được file đối tác gửi");
  const ten = t.file_name || t.ten || t.duong_dan.split("/").pop() || "file";
  return new File([data], ten, { type: t.mime || data.type || "application/octet-stream" });
}

/**
 * Mở file đối tác trong tab mới (bucket private → ký link lúc bấm).
 *
 * KHÔNG truyền "noopener" ở đây: `window.open` với cờ đó trả về null, nên nhánh
 * "gán địa chỉ cho tab vừa mở" không bao giờ chạy — kết quả là cướp luôn tab CRM
 * đang mở và để lại một tab trắng. Mở trước rồi tự cắt `opener` cho an toàn.
 */
export async function moTepYeuCau(duongDan: string): Promise<void> {
  const win = window.open("", "_blank");
  if (win) win.opener = null;
  try {
    const { data, error } = await externalSupabase.storage
      .from(LEAD_FILES_BUCKET)
      .createSignedUrl(duongDan, 60 * 60);
    if (error || !data?.signedUrl) throw error ?? new Error("Không tạo được link tạm cho file này");
    if (win) win.location.href = data.signedUrl;
    else window.location.href = data.signedUrl; // popup bị chặn → mở ngay tab hiện tại
  } catch (e) {
    win?.close();
    throw e;
  }
}
