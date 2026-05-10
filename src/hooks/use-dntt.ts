import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { externalSupabase } from "@/lib/supabase-external";
import { proRataInts } from "@/lib/pro-rata";

export interface DNTTRow {
  id: number;
  doan_id: number | null;
  loai: string;
  mo_ta: string | null;
  nha_cung_cap_id: number | null;
  ten_nha_cung_cap: string | null;
  so_tai_khoan: string | null;
  ngan_hang: string | null;
  so_tien: number;
  trang_thai_duyet: "cho_duyet" | "da_duyet" | "tu_choi" | "da_huy" | string;
  la_coc: boolean | null;
  ty_le_coc: number | null;
  tao_boi: string | null;
  tao_luc: string | null;
  duyet_boi: string | null;
  duyet_luc: string | null;
  ghi_chu: string | null;
  ref_loai: string | null;
  ref_id: number | null;
  ngay_can_thanh_toan: string | null;
  hoa_don_url: string | null;
  unc_url: string | null;
  trang_thai_hoa_don: string;
  trang_thai_unc: string;
  created_at: string;
  // Derived from view
  paid_amount: number;
  payment_status: "unpaid" | "partial" | "paid";
  thanh_toan_luc: string | null;
  // Joined
  ten_doan?: string;
  ten_ncc?: string;
  ncc_so_tai_khoan?: string;
  ncc_ngan_hang?: string;
}

export interface PaymentRow {
  id: number;
  dntt_id: number;
  method: "cash" | "can_tru";
  so_tien: number;
  ngay_thanh_toan: string;
  cong_no_id: number | null;
  ghi_chu: string | null;
  tao_boi: string | null;
  tao_luc: string | null;
  created_at: string;
}

interface Filters {
  doanId?: number | null;
  fromDate?: string | null;
  toDate?: string | null;
  trangThaiDuyet?: string | null;
  paymentStatus?: "unpaid" | "partial" | "paid" | null;
  loai?: string | null;
}

// Helper: lấy danh sách chi_phi_id được phân bổ cho 1 DNTT
export async function getChiPhiIdsForDNTT(dnttId: number): Promise<number[]> {
  const { data } = await externalSupabase
    .from("dntt_allocations")
    .select("chi_phi_id")
    .eq("dntt_id", dnttId);
  return (data || []).map((r: any) => r.chi_phi_id as number);
}

// Helper: gọi RPC tính lại trạng thái thanh toán của các chi phí
export async function recalcChiPhiStatus(chiPhiIds: number[]): Promise<void> {
  if (chiPhiIds.length === 0) return;
  await externalSupabase.rpc("recalc_chi_phi_payment_status", {
    p_chi_phi_ids: chiPhiIds,
  });
}

// Helper: lấy paid_amount của DNTT (sum payments)
export async function getPaidAmount(dnttId: number): Promise<number> {
  const { data } = await externalSupabase
    .from("payments")
    .select("so_tien")
    .eq("dntt_id", dnttId);
  return (data || []).reduce((s: number, p: any) => s + Number(p.so_tien), 0);
}

export function useDNTTList(filters: Filters) {
  return useQuery({
    queryKey: ["dntt-list", filters],
    queryFn: async () => {
      let q = externalSupabase
        .from("dntt_with_payment_status")
        .select(`
          *,
          doan:doan_id(ten_doan),
          nha_cung_cap:nha_cung_cap_id(ten, so_tai_khoan, ngan_hang)
        `)
        .order("created_at", { ascending: false });

      if (filters.doanId) q = q.eq("doan_id", filters.doanId);
      if (filters.fromDate) q = q.gte("created_at", filters.fromDate);
      if (filters.toDate) q = q.lte("created_at", filters.toDate + "T23:59:59");
      if (filters.trangThaiDuyet) q = q.eq("trang_thai_duyet", filters.trangThaiDuyet);
      if (filters.paymentStatus) q = q.eq("payment_status", filters.paymentStatus);
      if (filters.loai) q = q.eq("loai", filters.loai);

      const { data, error } = await q;
      if (error) throw error;

      return (data || []).map((row: any) => ({
        ...row,
        ten_doan: row.doan?.ten_doan || "",
        ten_ncc: row.nha_cung_cap?.ten || row.ten_nha_cung_cap || "",
        ncc_so_tai_khoan: row.nha_cung_cap?.so_tai_khoan || row.so_tai_khoan || "",
        ncc_ngan_hang: row.nha_cung_cap?.ngan_hang || row.ngan_hang || "",
      })) as DNTTRow[];
    },
  });
}

export function useDoanOptions() {
  return useQuery({
    queryKey: ["doan-options-dntt"],
    queryFn: async () => {
      const { data } = await externalSupabase
        .from("doan")
        .select("id, ten_doan")
        .order("created_at", { ascending: false });
      return data || [];
    },
  });
}

export function useApproveDNTT() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const { data: dntt, error: fetchErr } = await externalSupabase
        .from("de_nghi_thanh_toan")
        .select("id, doan_id")
        .eq("id", id)
        .single();
      if (fetchErr) throw fetchErr;

      const { error } = await externalSupabase
        .from("de_nghi_thanh_toan")
        .update({ trang_thai_duyet: "da_duyet", duyet_luc: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;

      const chiPhiIds = await getChiPhiIdsForDNTT(id);
      await recalcChiPhiStatus(chiPhiIds);
      return dntt.doan_id as number;
    },
    onSuccess: (doanId) => {
      qc.invalidateQueries({ queryKey: ["dntt-list"] });
      qc.invalidateQueries({ queryKey: ["dinh_ky_dntt_list"] });
      qc.invalidateQueries({ queryKey: ["doan_chi_phi", doanId] });
      qc.invalidateQueries({ queryKey: ["de_nghi_thanh_toan", doanId] });
    },
  });
}

export function useRejectDNTT() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ghiChu }: { id: number; ghiChu: string }) => {
      const { data: dntt, error: fetchErr } = await externalSupabase
        .from("de_nghi_thanh_toan")
        .select("id, doan_id")
        .eq("id", id)
        .single();
      if (fetchErr) throw fetchErr;

      const { error } = await externalSupabase
        .from("de_nghi_thanh_toan")
        .update({ trang_thai_duyet: "tu_choi", ghi_chu: ghiChu })
        .eq("id", id);
      if (error) throw error;

      const chiPhiIds = await getChiPhiIdsForDNTT(id);
      await recalcChiPhiStatus(chiPhiIds);
      return dntt.doan_id as number;
    },
    onSuccess: (doanId) => {
      qc.invalidateQueries({ queryKey: ["dntt-list"] });
      qc.invalidateQueries({ queryKey: ["dinh_ky_dntt_list"] });
      qc.invalidateQueries({ queryKey: ["doan_chi_phi", doanId] });
      qc.invalidateQueries({ queryKey: ["de_nghi_thanh_toan", doanId] });
    },
  });
}

// Mark paid: tạo payment cash cho phần chưa thanh toán (so_tien - paid_amount)
async function markPaidImpl(id: number, ngayISO: string): Promise<number> {
  const { data: dntt, error: fetchErr } = await externalSupabase
    .from("de_nghi_thanh_toan")
    .select("id, doan_id, so_tien, trang_thai_duyet")
    .eq("id", id)
    .single();
  if (fetchErr) throw fetchErr;

  // Auto-approve if not yet
  if (dntt.trang_thai_duyet === "cho_duyet") {
    await externalSupabase
      .from("de_nghi_thanh_toan")
      .update({ trang_thai_duyet: "da_duyet", duyet_luc: ngayISO })
      .eq("id", id);
  }

  const paidAlready = await getPaidAmount(id);
  const remaining = Number(dntt.so_tien) - paidAlready;
  if (remaining > 0) {
    const { error: payErr } = await externalSupabase
      .from("payments")
      .insert({
        dntt_id: id,
        method: "cash",
        so_tien: remaining,
        ngay_thanh_toan: ngayISO,
      });
    if (payErr) throw payErr;
  }

  const chiPhiIds = await getChiPhiIdsForDNTT(id);
  await recalcChiPhiStatus(chiPhiIds);
  return dntt.doan_id as number;
}

export function useMarkPaidDNTT() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => markPaidImpl(id, new Date().toISOString()),
    onSuccess: (doanId) => {
      qc.invalidateQueries({ queryKey: ["dntt-list"] });
      qc.invalidateQueries({ queryKey: ["dinh_ky_dntt_list"] });
      qc.invalidateQueries({ queryKey: ["hoa-don-unc"] });
      qc.invalidateQueries({ queryKey: ["doan_chi_phi", doanId] });
      qc.invalidateQueries({ queryKey: ["de_nghi_thanh_toan", doanId] });
    },
  });
}

export function useMarkPaidWithDate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ngayThanhToan }: { id: number; ngayThanhToan: string }) =>
      markPaidImpl(id, new Date(ngayThanhToan).toISOString()),
    onSuccess: (doanId) => {
      qc.invalidateQueries({ queryKey: ["dntt-list"] });
      qc.invalidateQueries({ queryKey: ["dinh_ky_dntt_list"] });
      qc.invalidateQueries({ queryKey: ["hoa-don-unc"] });
      qc.invalidateQueries({ queryKey: ["doan_chi_phi", doanId] });
      qc.invalidateQueries({ queryKey: ["de_nghi_thanh_toan", doanId] });
    },
  });
}

/**
 * Hủy DNTT:
 * - mode = undefined: hủy trước khi thanh toán cash → xóa các can_tru payments để khôi phục cong_no nguồn
 * - mode = "cong_no": hủy sau khi đã thanh toán cash → tạo cong_no record (NCC giữ tiền làm credit)
 * - mode = "hoan_tien": hủy sau khi đã thanh toán cash → tạo cong_no với trang_thai='da_hoan_tien'
 *
 * Ghi chú: can_tru payments LUÔN bị xóa khi cancel (để khôi phục cong_no nguồn). Chỉ cash
 * payments mới có thể chuyển thành cong_no/hoan_tien.
 */
export function useCancelDNTT() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, mode }: { id: number; mode?: "cong_no" | "hoan_tien" }) => {
      const { data: dntt, error: fetchErr } = await externalSupabase
        .from("de_nghi_thanh_toan")
        .select("id, doan_id, ref_loai, ref_id, nha_cung_cap_id, ten_nha_cung_cap, loai, mo_ta")
        .eq("id", id)
        .single();
      if (fetchErr) throw fetchErr;

      // 1) Reverse adjustment artifacts: cong_no records do adjustment tạo (dntt_goc_id = id)
      //    Cũng xóa thanh_tien_thuc_te trên chi_phi linked
      const { data: relatedCongNos } = await externalSupabase
        .from("cong_no")
        .select("id")
        .eq("dntt_goc_id", id);
      if (relatedCongNos && relatedCongNos.length > 0) {
        const cnIds = relatedCongNos.map((c: any) => c.id as number);
        // Xóa payments tham chiếu các cong_no này (RESTRICT FK)
        await externalSupabase.from("payments").delete().in("cong_no_id", cnIds);
        await externalSupabase.from("cong_no").delete().in("id", cnIds);
      }
      // Reset thanh_tien_thuc_te trên các chi_phi có allocation với ĐNTT này
      const allocChiPhiIds = await getChiPhiIdsForDNTT(id);
      if (allocChiPhiIds.length > 0) {
        await externalSupabase
          .from("doan_chi_phi")
          .update({ thanh_tien_thuc_te: null })
          .in("id", allocChiPhiIds);
      }

      // 2) Lấy tất cả payments của ĐNTT này
      const { data: payments } = await externalSupabase
        .from("payments")
        .select("id, method, so_tien, cong_no_id")
        .eq("dntt_id", id);
      const allPayments = payments || [];
      const cashPaid = allPayments
        .filter((p: any) => p.method === "cash")
        .reduce((s: number, p: any) => s + Number(p.so_tien), 0);
      const canTruPayments = allPayments.filter((p: any) => p.method === "can_tru");
      const canTruPaymentIds = canTruPayments.map((p: any) => p.id);
      const affectedCongNoIds = [
        ...new Set(
          canTruPayments
            .filter((p: any) => p.cong_no_id != null)
            .map((p: any) => p.cong_no_id as number),
        ),
      ];

      // Xóa can_tru payments → khôi phục balance của cong_no nguồn
      if (canTruPaymentIds.length > 0) {
        // Lấy tên đoàn để xóa log cấn trừ matching
        let tenDoan = "";
        if (dntt.doan_id) {
          const { data: doanRow } = await externalSupabase
            .from("doan").select("ten_doan").eq("id", dntt.doan_id).single();
          tenDoan = doanRow?.ten_doan || `#${dntt.doan_id}`;
        }

        // Xóa log cấn trừ trên cong_no nguồn TRƯỚC khi xóa payment (cần biết so_tien)
        const { removeCanTruLog } = await import("@/hooks/use-cong-no");
        for (const p of canTruPayments) {
          if (p.cong_no_id != null && tenDoan) {
            await removeCanTruLog(p.cong_no_id as number, Number(p.so_tien), tenDoan);
          }
        }

        await externalSupabase.from("payments").delete().in("id", canTruPaymentIds);

        // Reset trạng thái cong_no nguồn về 'con_du' nếu trước đó là 'da_can_tru'
        for (const cnId of affectedCongNoIds) {
          const { data: cnRow } = await externalSupabase
            .from("cong_no_with_status")
            .select("so_tien_con_lai, trang_thai")
            .eq("id", cnId)
            .single();
          if (cnRow && Number(cnRow.so_tien_con_lai) > 0 && cnRow.trang_thai === "da_can_tru") {
            await externalSupabase
              .from("cong_no")
              .update({ trang_thai: "con_du" })
              .eq("id", cnId);
          }
        }
      }

      const { error } = await externalSupabase
        .from("de_nghi_thanh_toan")
        .update({
          trang_thai_duyet: "da_huy",
          ghi_chu: mode === "cong_no" ? "Cấn trừ công nợ" : mode === "hoan_tien" ? "Hoàn lại tiền" : null,
        })
        .eq("id", id);
      if (error) throw error;

      // Nếu đã có cash payment và user chọn mode → tạo cong_no record (chỉ phần cash)
      if (mode && cashPaid > 0 && dntt.nha_cung_cap_id) {
        const { error: cnErr } = await externalSupabase.from("cong_no").insert({
          doan_id: dntt.doan_id,
          dntt_goc_id: id,
          nha_cung_cap_id: dntt.nha_cung_cap_id,
          ten_nha_cung_cap: dntt.ten_nha_cung_cap,
          so_tien_goc: cashPaid,
          trang_thai: mode === "hoan_tien" ? "da_hoan_tien" : "con_du",
          ly_do: `Hủy ĐNTT #${id}: ${dntt.mo_ta || ""}`.trim(),
        });
        if (cnErr) throw cnErr;
      }

      const chiPhiIds = await getChiPhiIdsForDNTT(id);
      await recalcChiPhiStatus(chiPhiIds);
      return dntt.doan_id as number;
    },
    onSuccess: (doanId) => {
      qc.invalidateQueries({ queryKey: ["dntt-list"] });
      qc.invalidateQueries({ queryKey: ["dinh_ky_dntt_list"] });
      qc.invalidateQueries({ queryKey: ["doan_chi_phi", doanId] });
      qc.invalidateQueries({ queryKey: ["de_nghi_thanh_toan", doanId] });
      qc.invalidateQueries({ queryKey: ["cong-no"] });
      qc.invalidateQueries({ queryKey: ["cong-no-by-ncc"] });
    },
  });
}

export function useUpdateDNTT() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, soTien }: { id: number; soTien: number }) => {
      const { data: dntt, error: fetchErr } = await externalSupabase
        .from("de_nghi_thanh_toan")
        .select("id, doan_id")
        .eq("id", id)
        .single();
      if (fetchErr) throw fetchErr;

      // Safety guard: không cho hạ so_tien xuống dưới paid_amount.
      // Nếu cho phép, view dntt_with_payment_status sẽ tính paid_amount >= so_tien
      // → false-positive payment_status='paid' khiến kế toán không thấy ĐNTT cần xử lý.
      const paidAmount = await getPaidAmount(id);
      if (soTien < paidAmount) {
        throw new Error(
          `Không thể hạ số tiền xuống dưới số đã thanh toán (${paidAmount.toLocaleString("vi-VN")}đ). ` +
          `Hủy ĐNTT (useCancelDNTT) hoặc tạo ĐNTT bổ sung thay thế.`
        );
      }

      const { error } = await externalSupabase
        .from("de_nghi_thanh_toan")
        .update({ so_tien: soTien })
        .eq("id", id)
        .eq("trang_thai_duyet", "cho_duyet");
      if (error) throw error;

      // Cập nhật allocations theo tỷ lệ
      const { data: allocs } = await externalSupabase
        .from("dntt_allocations")
        .select("id, chi_phi_id, so_tien")
        .eq("dntt_id", id);
      const allocList = allocs || [];
      if (allocList.length === 1) {
        await externalSupabase
          .from("dntt_allocations")
          .update({ so_tien: soTien })
          .eq("id", allocList[0].id);
      } else if (allocList.length > 1) {
        // Largest-remainder để SUM(allocs) === soTien (no rounding drift)
        const newAmts = proRataInts(soTien, allocList.map((a: any) => Number(a.so_tien)));
        for (let i = 0; i < allocList.length; i++) {
          await externalSupabase
            .from("dntt_allocations")
            .update({ so_tien: newAmts[i] })
            .eq("id", allocList[i].id);
        }
      }

      const chiPhiIds = await getChiPhiIdsForDNTT(id);
      await recalcChiPhiStatus(chiPhiIds);
      return dntt.doan_id as number;
    },
    onSuccess: (doanId) => {
      qc.invalidateQueries({ queryKey: ["dntt-list"] });
      qc.invalidateQueries({ queryKey: ["dinh_ky_dntt_list"] });
      qc.invalidateQueries({ queryKey: ["doan_chi_phi", doanId] });
      qc.invalidateQueries({ queryKey: ["de_nghi_thanh_toan", doanId] });
    },
  });
}

export function useDeleteDNTT() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      // 1) Reverse adjustment artifacts: xóa cong_no có dntt_goc_id = id
      const { data: relatedCongNos } = await externalSupabase
        .from("cong_no")
        .select("id")
        .eq("dntt_goc_id", id);
      if (relatedCongNos && relatedCongNos.length > 0) {
        const cnIds = relatedCongNos.map((c: any) => c.id as number);
        await externalSupabase.from("payments").delete().in("cong_no_id", cnIds);
        await externalSupabase.from("cong_no").delete().in("id", cnIds);
      }
      const allocChiPhiIds = await getChiPhiIdsForDNTT(id);
      if (allocChiPhiIds.length > 0) {
        await externalSupabase
          .from("doan_chi_phi")
          .update({ thanh_tien_thuc_te: null })
          .in("id", allocChiPhiIds);
      }

      // 2) Lấy cong_no IDs bị ảnh hưởng (can_tru source) để reset sau cascade
      const { data: payments } = await externalSupabase
        .from("payments")
        .select("cong_no_id")
        .eq("dntt_id", id)
        .eq("method", "can_tru");
      const affectedCongNoIds = [
        ...new Set((payments || []).map((p: any) => p.cong_no_id).filter((x: any) => x != null)),
      ] as number[];

      // 3) Xóa DNTT (payments cascade)
      const { error } = await externalSupabase
        .from("de_nghi_thanh_toan")
        .delete()
        .eq("id", id);
      if (error) throw error;

      // 4) Reset cong_no nguồn về 'con_du' nếu balance khôi phục
      for (const cnId of affectedCongNoIds) {
        const { data: cnRow } = await externalSupabase
          .from("cong_no_with_status")
          .select("so_tien_con_lai, trang_thai")
          .eq("id", cnId)
          .single();
        if (cnRow && Number(cnRow.so_tien_con_lai) > 0 && cnRow.trang_thai === "da_can_tru") {
          await externalSupabase
            .from("cong_no")
            .update({ trang_thai: "con_du" })
            .eq("id", cnId);
        }
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["dntt-list"] });
      qc.invalidateQueries({ queryKey: ["dinh_ky_dntt_list"] });
      qc.invalidateQueries({ queryKey: ["cong-no"] });
      qc.invalidateQueries({ queryKey: ["cong-no-by-ncc"] });
    },
  });
}

/**
 * Điều chỉnh sau khi ĐNTT đã có payment (số phòng/khách thay đổi):
 * - delta > 0 (thiếu tiền): tạo ĐNTT bổ sung (cho_duyet) → flow bình thường
 * - delta < 0 (thừa tiền): tạo cong_no với so_tien_goc=abs(delta) trên đoàn này
 * Đồng thời cập nhật chi_phi.thanh_tien_thuc_te (pro-rata).
 */
export function useCreateAdjustment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      dnttGoc,
      soTienThucTe,
      lyDo,
      surplusMode = "cong_no",
    }: {
      dnttGoc: DNTTRow;
      soTienThucTe: number;
      lyDo: string;
      surplusMode?: "cong_no" | "hoan_tien";
    }) => {
      // Pre-fetch allocations để biết các chi_phi liên quan.
      // currentTotal phải là COMMITMENT thật (so_tien_da_dntt — sum allocs trên các DNTT
      // không bị huỷ), KHÔNG dùng chi_phi.thanh_tien (phản ánh state edit của user).
      // Vì sao quan trọng: nếu OP edit chi_phi (đổi so_luong/don_gia) trước khi adjust,
      // chi_phi.thanh_tien auto-update theo edit → currentTotal sẽ khớp soTienThucTe
      // → delta=0 → KHÔNG tạo cong_no/supplementary, dù user vừa giảm so_luong.
      const { data: allocs } = await externalSupabase
        .from("dntt_allocations")
        .select("chi_phi_id, so_tien")
        .eq("dntt_id", dnttGoc.id);

      let currentTotal = dnttGoc.so_tien;

      if (allocs && allocs.length > 0) {
        const ids = allocs.map((a: any) => a.chi_phi_id);
        const { data: cpRows } = await externalSupabase
          .from("doan_chi_phi")
          .select("id, so_tien_da_dntt")
          .in("id", ids);
        if (cpRows && cpRows.length > 0) {
          // so_tien_da_dntt: sum allocs từ các DNTT không huỷ (computed bởi recalc RPC)
          // Phản ánh đúng commitment đã ràng buộc cho chi_phi này.
          currentTotal = cpRows.reduce(
            (s: number, r: any) => s + Number(r.so_tien_da_dntt ?? 0),
            0,
          );
        }
      }

      const delta = soTienThucTe - currentTotal;
      if (delta === 0) return null;

      const d = new Date();
      const dd = d.getDate().toString().padStart(2, "0");
      const mm = (d.getMonth() + 1).toString().padStart(2, "0");
      const yyyy = d.getFullYear();
      const dateStr = `${dd}/${mm}/${yyyy}`;
      const fmt = (n: number) => n.toLocaleString("vi-VN");

      if (delta > 0) {
        // Thiếu tiền → tạo ĐNTT bổ sung chờ duyệt
        const { error } = await externalSupabase
          .from("de_nghi_thanh_toan")
          .insert({
            doan_id: dnttGoc.doan_id,
            nha_cung_cap_id: dnttGoc.nha_cung_cap_id,
            ten_nha_cung_cap: dnttGoc.ten_nha_cung_cap,
            so_tai_khoan: dnttGoc.so_tai_khoan,
            ngan_hang: dnttGoc.ngan_hang,
            loai: dnttGoc.loai,
            mo_ta: `[Bổ sung] ${dnttGoc.mo_ta || ""}`.trim(),
            so_tien: delta,
            trang_thai_duyet: "cho_duyet",
            ghi_chu: `Điều chỉnh bổ sung từ ĐNTT #${dnttGoc.id}. Lý do: ${lyDo}`,
          });
        if (error) throw error;
      } else {
        // Thừa tiền → tạo cong_no
        if (dnttGoc.nha_cung_cap_id) {
          const { error } = await externalSupabase.from("cong_no").insert({
            doan_id: dnttGoc.doan_id,
            dntt_goc_id: dnttGoc.id,
            nha_cung_cap_id: dnttGoc.nha_cung_cap_id,
            ten_nha_cung_cap: dnttGoc.ten_nha_cung_cap,
            so_tien_goc: Math.abs(delta),
            trang_thai: surplusMode === "hoan_tien" ? "da_hoan_tien" : "con_du",
            ly_do: `Điều chỉnh giảm ĐNTT #${dnttGoc.id}. Lý do: ${lyDo}`,
          });
          if (error) throw error;
        }
      }

      // Set thanh_tien_thuc_te ABSOLUTE (không cộng dồn delta).
      // = pro-rata soTienThucTe theo alloc proportion. SUM(per-row) === soTienThucTe.
      // Lý do: nếu cộng dồn (base + delta) và base đã chứa edit của user → sai.
      if (allocs && allocs.length > 0) {
        const newThucTeAmts = proRataInts(soTienThucTe, allocs.map((a: any) => Number(a.so_tien)));
        const chiPhiIds: number[] = [];

        for (let i = 0; i < allocs.length; i++) {
          const alloc = allocs[i];
          await externalSupabase
            .from("doan_chi_phi")
            .update({ thanh_tien_thuc_te: newThucTeAmts[i] })
            .eq("id", alloc.chi_phi_id);
          chiPhiIds.push(alloc.chi_phi_id);
        }

        await recalcChiPhiStatus(chiPhiIds);
      }

      // Ghi log vào ghi_chu của ĐNTT gốc
      const { data: goc } = await externalSupabase
        .from("de_nghi_thanh_toan")
        .select("ghi_chu")
        .eq("id", dnttGoc.id)
        .single();
      const logEntry = delta > 0
        ? `${dateStr}: Điều chỉnh +${fmt(delta)}đ (bổ sung). Lý do: ${lyDo}`
        : `${dateStr}: Điều chỉnh −${fmt(Math.abs(delta))}đ (thừa → ${surplusMode === "hoan_tien" ? "hoàn tiền" : "công nợ"}). Lý do: ${lyDo}`;
      const newGhiChu = goc?.ghi_chu ? `${goc.ghi_chu}\n${logEntry}` : logEntry;
      await externalSupabase
        .from("de_nghi_thanh_toan")
        .update({ ghi_chu: newGhiChu })
        .eq("id", dnttGoc.id);

      return { delta };
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["dntt-list"] });
      qc.invalidateQueries({ queryKey: ["dinh_ky_dntt_list"] });
      qc.invalidateQueries({ queryKey: ["de_nghi_thanh_toan", vars.dnttGoc.doan_id] });
      qc.invalidateQueries({ queryKey: ["doan_chi_phi", vars.dnttGoc.doan_id] });
      qc.invalidateQueries({ queryKey: ["cong-no"] });
      if (vars.dnttGoc.nha_cung_cap_id) {
        qc.invalidateQueries({ queryKey: ["cong-no-by-ncc", vars.dnttGoc.nha_cung_cap_id] });
      }
    },
  });
}
