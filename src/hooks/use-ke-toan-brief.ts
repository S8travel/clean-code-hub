import { useQuery } from "@tanstack/react-query";
import { externalSupabase } from "@/lib/supabase-external";

export interface KeToanBrief {
  choChi: number;       // ĐNTT đã duyệt chưa trả xong
  dueSoon: number;      // đến hạn/quá hạn TT (≤ today+3, gồm quá hạn)
  overdue: number;      // quá hạn TT (< today)
  totalWeek: number;    // tổng cần chi trong 7 ngày (so_tien - paid_amount)
  hoaDonThieu: number;  // đã chi nhưng thiếu hóa đơn/UNC
  chuaCoHoaDon: number; // ĐNTT đã duyệt chưa có hóa đơn (bất kể đã chi hay chưa)
  congNoCount: number;
  congNoSum: number;
  topDue: { ten: string; so_tien: number; ngay: string | null }[];
}

function dStr(offset = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return `${d.getFullYear()}-${`${d.getMonth() + 1}`.padStart(2, "0")}-${`${d.getDate()}`.padStart(2, "0")}`;
}

export function useKeToanBrief(uid: string | null, enabled: boolean) {
  return useQuery<KeToanBrief>({
    queryKey: ["ke_toan_brief", uid],
    enabled: enabled && !!uid,
    staleTime: 60_000,
    queryFn: async () => {
      const today = dStr(0);
      const d3 = dStr(3);
      const d7 = dStr(7);
      const [dnttRes, cnRes] = await Promise.all([
        externalSupabase
          .from("dntt_with_payment_status")
          .select("id, ten_nha_cung_cap, so_tien, paid_amount, payment_status, trang_thai_duyet, ngay_can_thanh_toan, hoa_don_url, unc_url")
          .eq("trang_thai_duyet", "da_duyet"),
        externalSupabase
          .from("cong_no_with_status")
          .select("id, so_tien_con_lai, trang_thai")
          .eq("trang_thai", "con_du"),
      ]);
      const dntt = dnttRes.data ?? [];
      const cn = cnRes.data ?? [];

      const canChi = dntt.filter((d) => d.payment_status !== "paid");
      const overdue = canChi.filter((d) => d.ngay_can_thanh_toan && d.ngay_can_thanh_toan < today);
      const dueSoon = canChi.filter((d) => d.ngay_can_thanh_toan && d.ngay_can_thanh_toan <= d3);
      const totalWeek = canChi
        .filter((d) => !d.ngay_can_thanh_toan || d.ngay_can_thanh_toan <= d7)
        .reduce((s, d) => s + Math.max(0, (Number(d.so_tien) || 0) - (Number(d.paid_amount) || 0)), 0);
      const hoaDonThieu = dntt.filter(
        (d) => d.payment_status === "paid" && (!d.hoa_don_url || !d.unc_url),
      ).length;
      const chuaCoHoaDon = dntt.filter((d) => !d.hoa_don_url).length;
      const congNo = cn.filter((c) => Number(c.so_tien_con_lai) > 0);
      const topDue = [...dueSoon]
        .sort((a, b) => (a.ngay_can_thanh_toan || "~").localeCompare(b.ngay_can_thanh_toan || "~"))
        .slice(0, 3)
        .map((d) => ({
          ten: d.ten_nha_cung_cap ?? "—",
          so_tien: Number(d.so_tien) || 0,
          ngay: d.ngay_can_thanh_toan ?? null,
        }));

      return {
        choChi: canChi.length,
        dueSoon: dueSoon.length,
        overdue: overdue.length,
        totalWeek,
        hoaDonThieu,
        chuaCoHoaDon,
        congNoCount: congNo.length,
        congNoSum: congNo.reduce((s, c) => s + (Number(c.so_tien_con_lai) || 0), 0),
        topDue,
      };
    },
  });
}
