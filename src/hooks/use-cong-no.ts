import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { externalSupabase } from "@/lib/supabase-external";

export interface CongNoRow {
  id: number;
  doan_id: number | null;
  dntt_goc_id: number | null;
  nha_cung_cap_id: number | null;
  ten_nha_cung_cap: string | null;
  so_tien_goc: number;
  trang_thai: "con_du" | "da_can_tru" | "da_hoan_tien";
  loai: "phat_sinh" | "tra_truoc";
  ly_do: string | null;
  ngay_tao: string;
  ghi_chu: string | null;
  created_at: string;
  // Derived from view
  so_tien_da_dung: number;
  so_tien_con_lai: number;
  // Joined
  ten_doan?: string;
  ten_ncc?: string;
}

interface CongNoFilters {
  nccId?: number | null;
  doanId?: number | null;
  trangThai?: CongNoRow["trang_thai"] | null;
  onlyConDu?: boolean;
}

// List cong_no với derived status (so_tien_con_lai)
export function useCongNoList(filters: CongNoFilters = {}) {
  return useQuery({
    queryKey: ["cong-no", filters],
    queryFn: async () => {
      let q = externalSupabase
        .from("cong_no_with_status")
        .select(`
          *,
          doan:doan_id(ten_doan),
          nha_cung_cap:nha_cung_cap_id(ten)
        `)
        .order("created_at", { ascending: false });

      if (filters.nccId) q = q.eq("nha_cung_cap_id", filters.nccId);
      if (filters.doanId) q = q.eq("doan_id", filters.doanId);
      if (filters.trangThai) q = q.eq("trang_thai", filters.trangThai);
      if (filters.onlyConDu) q = q.gt("so_tien_con_lai", 0).eq("trang_thai", "con_du");

      const { data, error } = await q;
      if (error) throw error;

      return (data || []).map((row) => {
        const r = row as typeof row & {
          doan?: { ten_doan?: string | null } | null;
          nha_cung_cap?: { ten?: string | null } | null;
          ten_nha_cung_cap?: string | null;
        };
        return {
          ...r,
          ten_doan: r.doan?.ten_doan || "",
          ten_ncc: r.nha_cung_cap?.ten || r.ten_nha_cung_cap || "",
        };
      }) as CongNoRow[];
    },
  });
}

// Lấy danh sách công nợ còn dư cho 1 NCC (để dùng cấn trừ).
// Qua RPC SECURITY DEFINER (bypass RLS van_phong_scope) để quỹ NCC doan_id=NULL
// (voucher / trả trước) hiện cho cả OP điều hành — họ cần thấy để cấn trừ. Công nợ
// gắn đoàn vẫn GIỮ scope VP trong RPC; RPC KHÔNG trả ghi_chu (tránh lộ mã đoàn chéo
// VP). Xem migration 20260629_cong_no_can_tru_rpc.sql.
export function useCongNoByNCC(nccId: number | null | undefined) {
  return useQuery({
    queryKey: ["cong-no-by-ncc", nccId],
    enabled: !!nccId,
    queryFn: async () => {
      const { data, error } = await externalSupabase.rpc("cong_no_kha_dung_cho_ncc", {
        p_ncc_id: nccId!,
      });
      if (error) throw error;
      return (data ?? []).map((r) => ({
        ...r,
        so_tien_con_lai: Number(r.so_tien_con_lai) || 0,
        ten_doan: r.ten_doan || "",
        ghi_chu: null,
      })) as unknown as CongNoRow[];
    },
  });
}

// Đổi trạng thái cong_no (typically 'con_du' ↔ 'da_hoan_tien')
export function useUpdateCongNoStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, trangThai }: { id: number; trangThai: CongNoRow["trang_thai"] }) => {
      // Validate: nếu đã có can_tru payments thì không cho chuyển sang da_hoan_tien
      if (trangThai === "da_hoan_tien") {
        const { data: cn } = await externalSupabase
          .from("cong_no_with_status")
          .select("so_tien_da_dung")
          .eq("id", id)
          .single();
        if (cn && Number(cn.so_tien_da_dung) > 0) {
          throw new Error("Không thể chuyển sang Hoàn tiền: đã có khoản cấn trừ trên công nợ này");
        }
      }
      const { error } = await externalSupabase
        .from("cong_no")
        .update({ trang_thai: trangThai })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["cong-no"] });
      qc.invalidateQueries({ queryKey: ["cong-no-by-ncc"] });
    },
  });
}

// True nếu ĐNTT này từng được trả bằng cấn trừ (can_tru) vào 1 quỹ trả trước
// (cong_no.loai='tra_truoc'). Dùng để: khi điều chỉnh GIẢM chi phí → khoản
// thừa được đánh dấu loai='tra_truoc' (quay lại pool trả trước), thay vì
// thành công nợ phát sinh rời rạc.
export async function isDnttPaidFromPrepaid(
  dnttId: number | null | undefined,
): Promise<boolean> {
  if (!dnttId) return false;
  const { data, error } = await externalSupabase
    .from("payments")
    .select("id, cong_no:cong_no_id(loai)")
    .eq("dntt_id", dnttId)
    .eq("method", "can_tru");
  if (error) return false;
  return (data ?? []).some((p) => {
    const cn = (p as { cong_no?: { loai?: string | null } | null }).cong_no;
    return cn?.loai === "tra_truoc";
  });
}

// Pha 1 — Lập quỹ trả trước: tạo ĐNTT loai='tra_truoc' (doan_id=null).
// Duyệt + chi cash qua DNTTPage như ĐNTT thường → markPaidImpl tự sinh
// cong_no con_du loai='tra_truoc' khi trả đủ (xem use-dntt.ts).
export function useCreatePrepaidDNTT() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: {
      nccId: number;
      tenNcc: string;
      soTien: number;
      moTa: string;
      ngayCanThanhToan?: string | null;
    }) => {
      const { data: ncc } = await externalSupabase
        .from("nha_cung_cap")
        .select("so_tai_khoan, ngan_hang")
        .eq("id", args.nccId)
        .maybeSingle();
      const { data: authData } = await externalSupabase.auth.getUser();
      const { data, error } = await externalSupabase
        .from("de_nghi_thanh_toan")
        .insert({
          loai: "tra_truoc",
          doan_id: null,
          nha_cung_cap_id: args.nccId,
          ten_nha_cung_cap: args.tenNcc,
          so_tai_khoan: ncc?.so_tai_khoan ?? null,
          ngan_hang: ncc?.ngan_hang ?? null,
          so_tien: args.soTien,
          mo_ta: args.moTa || `Trả trước dịch vụ — ${args.tenNcc}`,
          trang_thai_duyet: "cho_duyet",
          ngay_can_thanh_toan: args.ngayCanThanhToan ?? null,
          tao_boi: authData?.user?.id ?? null,
        })
        .select("id")
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["dntt-list"] });
      qc.invalidateQueries({ queryKey: ["cong-no"] });
    },
  });
}

// Append log cấn trừ vào ghi_chu cong_no + tự flip 'da_can_tru' khi cạn.
// Qua RPC SECURITY DEFINER: cong_no có thể là quỹ NCC doan_id=NULL mà RLS
// van_phong_scope chặn OP đọc/ghi trực tiếp. entry tính sẵn ở JS để khớp đúng
// format mà removeCanTruLog parse (tránh drift khi rollback).
export async function appendCanTruLog(
  congNoId: number,
  soTien: number,
  tenDoanMoi: string,
) {
  const d = new Date();
  const dd = d.getDate().toString().padStart(2, "0");
  const mm = (d.getMonth() + 1).toString().padStart(2, "0");
  const yyyy = d.getFullYear();
  const entry = `${dd}/${mm}/${yyyy}: Cấn trừ ${soTien.toLocaleString("vi-VN")}đ → Đoàn ${tenDoanMoi}`;
  const { error } = await externalSupabase.rpc("cong_no_ghi_can_tru", {
    p_cong_no_id: congNoId,
    p_log_entry: entry,
  });
  if (error) throw error;
}

// Flip cong_no→'da_can_tru' khi đã cạn sau khi thêm payment cấn trừ (không ghi log).
// Dùng cho useCreatePayment(can_tru) — quỹ NCC doan_id=NULL bị RLS chặn ghi trực tiếp.
export async function markCongNoCanTruIfExhausted(congNoId: number) {
  const { error } = await externalSupabase.rpc("cong_no_ghi_can_tru", {
    p_cong_no_id: congNoId,
  });
  if (error) throw error;
}

// Revert cong_no→'con_du' khi balance khôi phục (sau khi xóa payment cấn trừ).
// Qua RPC SECURITY DEFINER vì quỹ NCC doan_id=NULL bị RLS chặn đọc/ghi trực tiếp.
export async function revertCongNoIfRecovered(congNoId: number) {
  const { error } = await externalSupabase.rpc("cong_no_hoan_can_tru", {
    p_cong_no_id: congNoId,
  });
  if (error) throw error;
}

// Xóa log cấn trừ tương ứng khi rollback (hủy ĐNTT có can_tru) + revert 'con_du'
// nếu balance khôi phục. Qua RPC SECURITY DEFINER (quỹ NCC doan_id=NULL bị RLS
// chặn đọc/ghi trực tiếp). target tính ở JS — RPC gỡ dòng đầu tiên CHỨA chuỗi này.
export async function removeCanTruLog(
  congNoId: number,
  soTien: number,
  tenDoan: string,
) {
  const target = `Cấn trừ ${soTien.toLocaleString("vi-VN")}đ → Đoàn ${tenDoan}`;
  const { error } = await externalSupabase.rpc("cong_no_hoan_can_tru", {
    p_cong_no_id: congNoId,
    p_log_match: target,
  });
  if (error) throw error;
}
