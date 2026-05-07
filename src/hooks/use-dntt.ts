import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { externalSupabase } from "@/lib/supabase-external";

// Helper: append log cấn trừ vào ghi_chu của record công nợ gốc
// Format: "DD/MM/YYYY: Cấn trừ Xđ → Đoàn [tenDoanMoi]"
export async function appendCanTruLog(
  congNoId: number,
  soTien: number,
  tenDoanMoi: string,
) {
  const { data } = await externalSupabase
    .from("de_nghi_thanh_toan")
    .select("ghi_chu")
    .eq("id", congNoId)
    .single();

  const d = new Date();
  const dd = d.getDate().toString().padStart(2, "0");
  const mm = (d.getMonth() + 1).toString().padStart(2, "0");
  const yyyy = d.getFullYear();
  const entry = `${dd}/${mm}/${yyyy}: Cấn trừ ${soTien.toLocaleString("vi-VN")}đ → Đoàn ${tenDoanMoi}`;
  const existing = data?.ghi_chu;
  const newGhiChu = existing ? `${existing}\n${entry}` : entry;

  await externalSupabase
    .from("de_nghi_thanh_toan")
    .update({ ghi_chu: newGhiChu })
    .eq("id", congNoId);
}

export interface DNTTRow {
  id: number;
  doan_id: number;
  loai: string;
  mo_ta: string | null;
  nha_cung_cap_id: number | null;
  ten_nha_cung_cap: string | null;
  so_tai_khoan: string | null;
  ngan_hang: string | null;
  so_tien: number;
  trang_thai_duyet: string;
  trang_thai_thanh_toan: string;
  la_coc: boolean;
  la_thu_hoi: boolean;
  hdv_id: number | null;
  ty_le_coc: number | null;
  so_tien_con_lai: number;
  tao_boi: string | null;
  tao_luc: string | null;
  duyet_boi: string | null;
  duyet_luc: string | null;
  thanh_toan_luc: string | null;
  ghi_chu: string | null;
  ref_loai: string | null;
  ref_id: number | null;
  ngay_can_thanh_toan: string | null;
  created_at: string;
  // joined
  ten_doan?: string;
  ten_ncc?: string;
  ncc_so_tai_khoan?: string;
  ncc_ngan_hang?: string;
  tao_boi_ten?: string;
}

interface Filters {
  doanId?: number | null;
  fromDate?: string | null;
  toDate?: string | null;
  trangThaiDuyet?: string | null;
  trangThaiTT?: string | null;
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

export function useDNTTList(filters: Filters) {
  return useQuery({
    queryKey: ["dntt-list", filters],
    queryFn: async () => {
      let q = externalSupabase
        .from("de_nghi_thanh_toan")
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
      if (filters.trangThaiTT) q = q.eq("trang_thai_thanh_toan", filters.trangThaiTT);
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
        .select("id, doan_id, ref_loai, ref_id, so_tien, trang_thai_thanh_toan")
        .eq("id", id)
        .single();
      if (fetchErr) throw fetchErr;

      const { error } = await externalSupabase
        .from("de_nghi_thanh_toan")
        .update({ trang_thai_duyet: "da_duyet", duyet_luc: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;

      // Nếu đây là ĐNTT cấn trừ công nợ → áp dụng công nợ sau khi duyệt
      if (
        dntt.trang_thai_thanh_toan === "can_tru" &&
        dntt.ref_loai === "can_tru_cong_no" &&
        dntt.ref_id
      ) {
        const congNoId = dntt.ref_id as number;
        const canTruAmount = dntt.so_tien as number;

        const { data: congNoRow } = await externalSupabase
          .from("de_nghi_thanh_toan")
          .select("so_tien, so_tien_con_lai")
          .eq("id", congNoId)
          .single();

        if (congNoRow) {
          const soTienConLai =
            congNoRow.so_tien_con_lai != null
              ? congNoRow.so_tien_con_lai
              : congNoRow.so_tien;
          const remaining = soTienConLai - canTruAmount;
          if (remaining <= 0) {
            await externalSupabase
              .from("de_nghi_thanh_toan")
              .update({ trang_thai_thanh_toan: "da_can_tru", so_tien_con_lai: 0 })
              .eq("id", congNoId);
          } else {
            await externalSupabase
              .from("de_nghi_thanh_toan")
              .update({ so_tien_con_lai: remaining })
              .eq("id", congNoId);
          }
        }

        // Lấy tên đoàn mới để ghi log
        const { data: doanRow } = await externalSupabase
          .from("doan")
          .select("ten_doan")
          .eq("id", dntt.doan_id)
          .single();
        const tenDoanMoi = doanRow?.ten_doan || `Đoàn #${dntt.doan_id}`;
        await appendCanTruLog(congNoId, canTruAmount, tenDoanMoi);

        qc.invalidateQueries({ queryKey: ["cong-no-by-ncc"] });
      }

      const chiPhiIds = await getChiPhiIdsForDNTT(id);
      await recalcChiPhiStatus(chiPhiIds);
      return dntt.doan_id as number;
    },
    onSuccess: (doanId) => {
      qc.invalidateQueries({ queryKey: ["dntt-list"] });
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
        .select("id, doan_id, ref_loai, ref_id")
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
      qc.invalidateQueries({ queryKey: ["doan_chi_phi", doanId] });
      qc.invalidateQueries({ queryKey: ["de_nghi_thanh_toan", doanId] });
    },
  });
}

export function useMarkPaidDNTT() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const { data: dntt, error: fetchErr } = await externalSupabase
        .from("de_nghi_thanh_toan")
        .select("id, doan_id, ref_loai, ref_id")
        .eq("id", id)
        .single();
      if (fetchErr) throw fetchErr;

      const { error } = await externalSupabase
        .from("de_nghi_thanh_toan")
        .update({ trang_thai_thanh_toan: "da_tt", thanh_toan_luc: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;

      const chiPhiIds = await getChiPhiIdsForDNTT(id);
      await recalcChiPhiStatus(chiPhiIds);
      return dntt.doan_id as number;
    },
    onSuccess: (doanId) => {
      qc.invalidateQueries({ queryKey: ["dntt-list"] });
      qc.invalidateQueries({ queryKey: ["doan_chi_phi", doanId] });
      qc.invalidateQueries({ queryKey: ["de_nghi_thanh_toan", doanId] });
    },
  });
}

/**
 * Hủy DNTT với 2 trường hợp:
 * - mode = undefined: hủy trước khi thanh toán (da_duyet + chua_tt) → chi-phi về chua_de_nghi
 * - mode = "cong_no": hủy sau khi đã thanh toán, cấn trừ công nợ
 * - mode = "hoan_tien": hủy sau khi đã thanh toán, hoàn tiền không ghi nợ
 */
export function useCancelDNTT() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, mode }: { id: number; mode?: "cong_no" | "hoan_tien" }) => {
      const { data: dntt, error: fetchErr } = await externalSupabase
        .from("de_nghi_thanh_toan")
        .select("id, doan_id, ref_loai, ref_id, nha_cung_cap_id, linked_dntt_id")
        .eq("id", id)
        .single();
      if (fetchErr) throw fetchErr;

      const updates: Record<string, any> = { trang_thai_duyet: "da_huy" };
      if (mode) {
        updates.trang_thai_thanh_toan = mode;
        updates.ghi_chu = mode === "cong_no" ? "Cấn trừ công nợ" : "Hoàn lại tiền";
        // Reset so_tien_con_lai để xóa giá trị stale từ lúc tạo ĐNTT cọc.
        // Sau này useCreateCanTru sẽ set lại khi cấn trừ một phần.
        updates.so_tien_con_lai = null;
      }

      const { error } = await externalSupabase
        .from("de_nghi_thanh_toan")
        .update(updates)
        .eq("id", id);
      if (error) throw error;

      // Tìm record đi kèm qua linked_dntt_id (2 chiều) và hủy cùng
      let pairedId: number | null = null;
      if (dntt.linked_dntt_id) {
        pairedId = dntt.linked_dntt_id;
      } else {
        const { data: paired } = await externalSupabase
          .from("de_nghi_thanh_toan")
          .select("id")
          .eq("linked_dntt_id", id)
          .neq("trang_thai_duyet", "da_huy")
          .limit(1)
          .maybeSingle();
        pairedId = paired?.id ?? null;
      }
      if (pairedId) {
        await externalSupabase
          .from("de_nghi_thanh_toan")
          .update({ trang_thai_duyet: "da_huy" })
          .eq("id", pairedId);
      }

      const chiPhiIds = await getChiPhiIdsForDNTT(id);
      await recalcChiPhiStatus(chiPhiIds);
      return dntt.doan_id as number;
    },
    onSuccess: (doanId) => {
      qc.invalidateQueries({ queryKey: ["dntt-list"] });
      qc.invalidateQueries({ queryKey: ["doan_chi_phi", doanId] });
      qc.invalidateQueries({ queryKey: ["de_nghi_thanh_toan", doanId] });
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
        const totalAlloc = allocList.reduce((s: number, a: any) => s + a.so_tien, 0);
        for (const alloc of allocList) {
          const newAmt = totalAlloc > 0 ? Math.round(soTien * alloc.so_tien / totalAlloc) : 0;
          await externalSupabase
            .from("dntt_allocations")
            .update({ so_tien: newAmt })
            .eq("id", alloc.id);
        }
      }

      const chiPhiIds = await getChiPhiIdsForDNTT(id);
      await recalcChiPhiStatus(chiPhiIds);
      return dntt.doan_id as number;
    },
    onSuccess: (doanId) => {
      qc.invalidateQueries({ queryKey: ["dntt-list"] });
      qc.invalidateQueries({ queryKey: ["doan_chi_phi", doanId] });
      qc.invalidateQueries({ queryKey: ["de_nghi_thanh_toan", doanId] });
    },
  });
}

export function useDeleteDNTT() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const { error } = await externalSupabase
        .from("de_nghi_thanh_toan")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["dntt-list"] }),
  });
}

// Fetch danh sách công nợ của một nhà cung cấp (để kiểm tra trước khi đề nghị TT)
// Chỉ lấy các khoản còn dư (so_tien_con_lai > 0, hoặc null = chưa cấn trừ lần nào)
export function useCongNoByNCC(nccId: number | null | undefined) {
  return useQuery({
    queryKey: ["cong-no-by-ncc", nccId],
    enabled: !!nccId,
    queryFn: async () => {
      const { data, error } = await externalSupabase
        .from("de_nghi_thanh_toan")
        .select("*, doan:doan_id(ten_doan)")
        .eq("nha_cung_cap_id", nccId!)
        .eq("trang_thai_thanh_toan", "cong_no")
        .eq("trang_thai_duyet", "da_huy")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []).map((row: any) => ({
        ...row,
        ten_doan: row.doan?.ten_doan || "",
        // con_lai: số tiền thực sự còn dư (so_tien_con_lai nếu đã có, ngược lại = so_tien)
        con_lai: row.so_tien_con_lai != null ? row.so_tien_con_lai : row.so_tien,
      })) as (DNTTRow & { con_lai: number })[];
    },
  });
}

export interface CanTruItem {
  congNoId: number;
  soTienGoc: number;    // tổng khoản công nợ gốc
  soTienConLai: number; // còn lại trước khi cấn trừ lần này
  soTienCanTru: number; // số tiền muốn cấn trừ lần này
  tenDoan: string;
}

// Ghi nhận cấn trừ công nợ một phần hoặc toàn bộ
// - Nếu cấn trừ hết: đánh dấu record gốc "da_can_tru"
// - Nếu cấn trừ một phần: cập nhật so_tien_con_lai = còn lại - số cấn trừ, giữ "cong_no"
export function useCreateCanTru() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      doanId,
      nccId,
      loai,
      items,
      tenDoanMoi,
      linkedDnttId,
    }: {
      doanId: number;
      nccId: number;
      loai: string;
      items: CanTruItem[];
      tenDoanMoi: string;
      linkedDnttId?: number | null;
    }) => {
      const totalCanTru = items.reduce((s, i) => s + i.soTienCanTru, 0);
      const moTa = `Cấn trừ công nợ: ${items.map((i) => i.tenDoan).join(", ")}`;

      // Tạo record cấn trừ mới
      const { data, error } = await externalSupabase
        .from("de_nghi_thanh_toan")
        .insert({
          doan_id: doanId,
          nha_cung_cap_id: nccId,
          so_tien: totalCanTru,
          loai,
          mo_ta: moTa,
          trang_thai_duyet: "da_duyet",
          trang_thai_thanh_toan: "can_tru",
          la_coc: false,
          linked_dntt_id: linkedDnttId ?? null,
        })
        .select("id")
        .single();
      if (error) throw error;

      // Cập nhật từng record công nợ gốc
      for (const item of items) {
        const remaining = item.soTienConLai - item.soTienCanTru;
        if (remaining <= 0) {
          // Cấn trừ hết → đánh dấu đã xong
          await externalSupabase
            .from("de_nghi_thanh_toan")
            .update({ trang_thai_thanh_toan: "da_can_tru", so_tien_con_lai: 0 })
            .eq("id", item.congNoId);
        } else {
          // Cấn trừ một phần → cập nhật số còn lại, giữ nguyên trạng thái cong_no
          await externalSupabase
            .from("de_nghi_thanh_toan")
            .update({ so_tien_con_lai: remaining })
            .eq("id", item.congNoId);
        }
        // Ghi log cấn trừ vào ghi_chu của công nợ gốc
        await appendCanTruLog(item.congNoId, item.soTienCanTru, tenDoanMoi);
      }

      return data;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["cong-no-by-ncc", vars.nccId] });
      qc.invalidateQueries({ queryKey: ["dntt-list"] });
      qc.invalidateQueries({ queryKey: ["de_nghi_thanh_toan", vars.doanId] });
    },
  });
}

/**
 * Điều chỉnh sau khi ĐNTT đã da_tt (số phòng/khách thay đổi):
 * - delta > 0 (thiếu tiền): tạo ĐNTT bổ sung (cho_duyet + chua_tt) → flow bình thường
 * - delta < 0 (thừa tiền): tạo công nợ trực tiếp (da_huy + cong_no) → xuất hiện ở trang Công nợ
 * Đồng thời ghi log vào ghi_chu của ĐNTT gốc.
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
      const delta = soTienThucTe - dnttGoc.so_tien;
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
            trang_thai_thanh_toan: "chua_tt",
            ghi_chu: `Điều chỉnh bổ sung từ ĐNTT #${dnttGoc.id}. Lý do: ${lyDo}`,
          });
        if (error) throw error;
      } else {
        // Thừa tiền → công nợ hoặc hoàn tiền
        const { error } = await externalSupabase
          .from("de_nghi_thanh_toan")
          .insert({
            doan_id: dnttGoc.doan_id,
            nha_cung_cap_id: dnttGoc.nha_cung_cap_id,
            ten_nha_cung_cap: dnttGoc.ten_nha_cung_cap,
            so_tai_khoan: dnttGoc.so_tai_khoan,
            ngan_hang: dnttGoc.ngan_hang,
            loai: dnttGoc.loai,
            mo_ta: `[Điều chỉnh giảm] ${dnttGoc.mo_ta || ""}`.trim(),
            so_tien: Math.abs(delta),
            trang_thai_duyet: "da_huy",
            trang_thai_thanh_toan: surplusMode,
            so_tien_con_lai: null,
            ghi_chu: `Điều chỉnh giảm từ ĐNTT #${dnttGoc.id}. Lý do: ${lyDo}${surplusMode === "hoan_tien" ? " (Hoàn tiền)" : ""}`,
          });
        if (error) throw error;
      }

      // Cập nhật thanh_tien_thuc_te trên các chi_phi liên quan (pro-rata theo allocation)
      const { data: allocs } = await externalSupabase
        .from("dntt_allocations")
        .select("chi_phi_id, so_tien")
        .eq("dntt_id", dnttGoc.id);

      if (allocs && allocs.length > 0) {
        const totalAlloc = allocs.reduce((s: number, a: any) => s + a.so_tien, 0);
        const chiPhiIds: number[] = [];

        for (const alloc of allocs) {
          const proportion = totalAlloc > 0 ? alloc.so_tien / totalAlloc : 1 / allocs.length;
          const deltaForRow = Math.round(delta * proportion);

          // Lấy giá trị hiện tại để tính giá mới
          const { data: cpRow } = await externalSupabase
            .from("doan_chi_phi")
            .select("thanh_tien, thanh_tien_thuc_te")
            .eq("id", alloc.chi_phi_id)
            .single();

          if (cpRow) {
            const base = cpRow.thanh_tien_thuc_te ?? cpRow.thanh_tien;
            const newThucTe = base + deltaForRow;
            await externalSupabase
              .from("doan_chi_phi")
              .update({ thanh_tien_thuc_te: newThucTe })
              .eq("id", alloc.chi_phi_id);
            chiPhiIds.push(alloc.chi_phi_id);
          }
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
        : `${dateStr}: Điều chỉnh −${fmt(Math.abs(delta))}đ (thừa → công nợ). Lý do: ${lyDo}`;
      const newGhiChu = goc?.ghi_chu ? `${goc.ghi_chu}\n${logEntry}` : logEntry;
      await externalSupabase
        .from("de_nghi_thanh_toan")
        .update({ ghi_chu: newGhiChu })
        .eq("id", dnttGoc.id);

      return { delta };
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["dntt-list"] });
      qc.invalidateQueries({ queryKey: ["de_nghi_thanh_toan", vars.dnttGoc.doan_id] });
      qc.invalidateQueries({ queryKey: ["doan_chi_phi", vars.dnttGoc.doan_id] });
      if (vars.dnttGoc.nha_cung_cap_id) {
        qc.invalidateQueries({ queryKey: ["cong-no-by-ncc", vars.dnttGoc.nha_cung_cap_id] });
      }
    },
  });
}
