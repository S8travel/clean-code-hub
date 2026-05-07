import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { externalSupabase } from "@/lib/supabase-external";
import { getChiPhiIdsForDNTT, recalcChiPhiStatus, type PaymentRow } from "@/hooks/use-dntt";

export type { PaymentRow };

// List payments của 1 ĐNTT
export function usePaymentsForDNTT(dnttId: number | null | undefined) {
  return useQuery({
    queryKey: ["payments", dnttId],
    enabled: !!dnttId,
    queryFn: async () => {
      const { data, error } = await externalSupabase
        .from("payments")
        .select("*")
        .eq("dntt_id", dnttId!)
        .order("ngay_thanh_toan", { ascending: true });
      if (error) throw error;
      return (data || []) as PaymentRow[];
    },
  });
}

// List payments theo doan (qua join dntt)
export function usePaymentsByDoan(doanId: number | null | undefined) {
  return useQuery({
    queryKey: ["payments-by-doan", doanId],
    enabled: !!doanId,
    queryFn: async () => {
      const { data, error } = await externalSupabase
        .from("payments")
        .select("*, de_nghi_thanh_toan!inner(doan_id)")
        .eq("de_nghi_thanh_toan.doan_id", doanId!);
      if (error) throw error;
      return (data || []) as PaymentRow[];
    },
  });
}

export interface PaymentByChiPhi {
  chi_phi_id: number;
  dntt_id: number;
  dntt_so_tien: number;
  alloc_so_tien: number;
  payment_id: number;
  method: "cash" | "can_tru";
  payment_so_tien: number;
  cong_no_id: number | null;
  ngay_thanh_toan: string;
}

// Returns payments allocated to each chi_phi_id of a doan.
// Each row = (alloc, payment) — pro-rata splitting if multiple allocs share a dntt.
export function usePaymentsByChiPhi(doanId: number | null | undefined) {
  return useQuery({
    queryKey: ["payments-by-chi-phi", doanId],
    enabled: !!doanId,
    queryFn: async () => {
      // Get all allocations of all DNTTs for this doan
      const { data: allocs } = await externalSupabase
        .from("dntt_allocations")
        .select(`
          chi_phi_id, so_tien, dntt_id,
          de_nghi_thanh_toan:dntt_id!inner(doan_id, so_tien, trang_thai_duyet)
        `)
        .eq("de_nghi_thanh_toan.doan_id", doanId!);

      if (!allocs || allocs.length === 0) return [] as PaymentByChiPhi[];

      // Filter out cancelled DNTTs
      const activeAllocs = allocs.filter(
        (a: any) => a.de_nghi_thanh_toan.trang_thai_duyet !== "da_huy" &&
                    a.de_nghi_thanh_toan.trang_thai_duyet !== "tu_choi"
      );
      const dnttIds = [...new Set(activeAllocs.map((a: any) => a.dntt_id))];

      const { data: payments } = await externalSupabase
        .from("payments")
        .select("*")
        .in("dntt_id", dnttIds);

      const result: PaymentByChiPhi[] = [];
      const dnttSoTien: Record<number, number> = {};
      activeAllocs.forEach((a: any) => {
        dnttSoTien[a.dntt_id] = a.de_nghi_thanh_toan.so_tien;
      });
      for (const alloc of activeAllocs) {
        const dnttPayments = (payments || []).filter((p: any) => p.dntt_id === alloc.dntt_id);
        const totalDntt = dnttSoTien[alloc.dntt_id] || 1;
        for (const p of dnttPayments) {
          const allocShare = (Number(p.so_tien) * Number(alloc.so_tien)) / totalDntt;
          result.push({
            chi_phi_id: alloc.chi_phi_id,
            dntt_id: alloc.dntt_id,
            dntt_so_tien: totalDntt,
            alloc_so_tien: Number(alloc.so_tien),
            payment_id: p.id,
            method: p.method,
            payment_so_tien: Math.round(allocShare),
            cong_no_id: p.cong_no_id,
            ngay_thanh_toan: p.ngay_thanh_toan,
          });
        }
      }
      return result;
    },
  });
}

interface CreatePaymentArgs {
  dnttId: number;
  method: "cash" | "can_tru";
  soTien: number;
  ngayThanhToan?: string; // ISO; default now()
  congNoId?: number | null;
  ghiChu?: string;
}

// Tạo 1 payment row. Sau khi tạo gọi recalc cho các chi phí liên quan.
export function useCreatePayment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: CreatePaymentArgs) => {
      const { dnttId, method, soTien, ngayThanhToan, congNoId, ghiChu } = args;
      if (method === "can_tru" && !congNoId) {
        throw new Error("can_tru payment yêu cầu cong_no_id");
      }

      // Lấy doan_id để invalidate
      const { data: dntt } = await externalSupabase
        .from("de_nghi_thanh_toan")
        .select("doan_id")
        .eq("id", dnttId)
        .single();

      const { error } = await externalSupabase.from("payments").insert({
        dntt_id: dnttId,
        method,
        so_tien: soTien,
        ngay_thanh_toan: ngayThanhToan || new Date().toISOString(),
        cong_no_id: method === "can_tru" ? congNoId : null,
        ghi_chu: ghiChu || null,
      });
      if (error) throw error;

      // Nếu cấn trừ hết cong_no → đánh dấu da_can_tru
      if (method === "can_tru" && congNoId) {
        const { data: cnRow } = await externalSupabase
          .from("cong_no_with_status")
          .select("so_tien_con_lai")
          .eq("id", congNoId)
          .single();
        if (cnRow && Number(cnRow.so_tien_con_lai) <= 0) {
          await externalSupabase
            .from("cong_no")
            .update({ trang_thai: "da_can_tru" })
            .eq("id", congNoId);
        }
      }

      const chiPhiIds = await getChiPhiIdsForDNTT(dnttId);
      await recalcChiPhiStatus(chiPhiIds);

      return { doanId: dntt?.doan_id as number | null, congNoId };
    },
    onSuccess: ({ doanId, congNoId }) => {
      qc.invalidateQueries({ queryKey: ["dntt-list"] });
      qc.invalidateQueries({ queryKey: ["payments"] });
      qc.invalidateQueries({ queryKey: ["payments-by-doan", doanId] });
      if (doanId) {
        qc.invalidateQueries({ queryKey: ["doan_chi_phi", doanId] });
        qc.invalidateQueries({ queryKey: ["de_nghi_thanh_toan", doanId] });
      }
      if (congNoId) {
        qc.invalidateQueries({ queryKey: ["cong-no"] });
        qc.invalidateQueries({ queryKey: ["cong-no-by-ncc"] });
      }
    },
  });
}

export function useDeletePayment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const { data: pay } = await externalSupabase
        .from("payments")
        .select("dntt_id, cong_no_id")
        .eq("id", id)
        .single();

      const { error } = await externalSupabase.from("payments").delete().eq("id", id);
      if (error) throw error;

      // Nếu xoá can_tru payment → cong_no có thể về 'con_du' (nếu trước đó da_can_tru)
      if (pay?.cong_no_id) {
        const { data: cnRow } = await externalSupabase
          .from("cong_no_with_status")
          .select("so_tien_con_lai, trang_thai")
          .eq("id", pay.cong_no_id)
          .single();
        if (cnRow && Number(cnRow.so_tien_con_lai) > 0 && cnRow.trang_thai === "da_can_tru") {
          await externalSupabase
            .from("cong_no")
            .update({ trang_thai: "con_du" })
            .eq("id", pay.cong_no_id);
        }
      }

      if (pay?.dntt_id) {
        const chiPhiIds = await getChiPhiIdsForDNTT(pay.dntt_id);
        await recalcChiPhiStatus(chiPhiIds);
      }
      return pay;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["dntt-list"] });
      qc.invalidateQueries({ queryKey: ["payments"] });
      qc.invalidateQueries({ queryKey: ["cong-no"] });
    },
  });
}
