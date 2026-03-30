import { useQuery } from "@tanstack/react-query";
import { externalSupabase } from "@/lib/supabase-external";
import { startOfMonth, endOfMonth, subMonths, format, startOfDay, endOfDay, addDays } from "date-fns";

const fmt = (d: Date) => d.toISOString().split("T")[0];

export function useDashboardStats() {
  return useQuery({
    queryKey: ["dashboard_stats"],
    staleTime: 60_000,
    queryFn: async () => {
      const today = new Date();
      const todayStr = fmt(today);
      const monthStart = fmt(startOfMonth(today));
      const monthEnd = fmt(endOfMonth(today));
      const next14 = fmt(addDays(today, 14));

      // 1. Tất cả đoàn trong 6 tháng gần nhất (cho chart + thống kê)
      const sixMonthsAgo = fmt(startOfMonth(subMonths(today, 5)));
      const { data: allDoan } = await externalSupabase
        .from("doan")
        .select("id, ten_doan, ngay_di, ngay_ve, so_khach, so_khach_lon, so_khach_em1, so_khach_em2, so_khach_tl, trang_thai")
        .gte("ngay_di", sixMonthsAgo)
        .order("ngay_di", { ascending: true });

      const doanList = allDoan || [];

      // 2. Đoàn đang hoạt động hôm nay
      const activeDoan = doanList.filter(
        (d) => d.ngay_di && d.ngay_ve && d.ngay_di <= todayStr && d.ngay_ve >= todayStr,
      );

      // 3. Đoàn tháng này
      const thisMonthDoan = doanList.filter(
        (d) => d.ngay_di && d.ngay_di >= monthStart && d.ngay_di <= monthEnd,
      );
      const thisMonthGuests = thisMonthDoan.reduce((s, d) => {
        const total = (d.so_khach_lon || 0) + (d.so_khach_em1 || 0) + (d.so_khach_em2 || 0) + (d.so_khach_tl || 0) || d.so_khach || 0;
        return s + total;
      }, 0);

      // 4. Đoàn sắp khởi hành (14 ngày tới)
      const upcomingDoan = doanList
        .filter((d) => d.ngay_di && d.ngay_di > todayStr && d.ngay_di <= next14)
        .sort((a, b) => (a.ngay_di || "").localeCompare(b.ngay_di || ""))
        .slice(0, 8);

      // 5. Monthly chart data (6 tháng)
      const monthlyMap = new Map<string, { count: number; khach: number }>();
      for (let i = 5; i >= 0; i--) {
        const m = subMonths(today, i);
        const key = format(m, "MM/yyyy");
        monthlyMap.set(key, { count: 0, khach: 0 });
      }
      for (const d of doanList) {
        if (!d.ngay_di) continue;
        const key = format(new Date(d.ngay_di + "T00:00:00"), "MM/yyyy");
        if (monthlyMap.has(key)) {
          const prev = monthlyMap.get(key)!;
          const g = (d.so_khach_lon || 0) + (d.so_khach_em1 || 0) + (d.so_khach_em2 || 0) + (d.so_khach_tl || 0) || d.so_khach || 0;
          monthlyMap.set(key, { count: prev.count + 1, khach: prev.khach + g });
        }
      }
      const monthlyData = [...monthlyMap.entries()].map(([month, v]) => ({
        month,
        soDoan: v.count,
        soKhach: v.khach,
      }));

      // 6. ĐNTT stats
      const { data: dnttRows } = await externalSupabase
        .from("de_nghi_thanh_toan")
        .select("id, so_tien, trang_thai_duyet, trang_thai_thanh_toan, created_at, mo_ta, loai, doan_id")
        .not("trang_thai_duyet", "eq", "da_huy")
        .not("trang_thai_duyet", "eq", "tu_choi")
        .order("created_at", { ascending: false });

      const dnttList = dnttRows || [];
      const pendingApproval = dnttList.filter((d) => d.trang_thai_duyet === "cho_duyet");
      const pendingPayment = dnttList.filter(
        (d) => d.trang_thai_duyet === "da_duyet" && d.trang_thai_thanh_toan === "chua_tt",
      );
      const paidAll = dnttList.filter((d) => d.trang_thai_thanh_toan === "da_tt");

      const pendingApprovalAmount = pendingApproval.reduce((s, d) => s + d.so_tien, 0);
      const pendingPaymentAmount = pendingPayment.reduce((s, d) => s + d.so_tien, 0);
      const totalPaid = paidAll.reduce((s, d) => s + d.so_tien, 0);

      // 7. Chi phí tháng này
      const { data: cpRows } = await externalSupabase
        .from("doan_chi_phi")
        .select("id, doan_id, tien_cong_ty, danh_muc, trang_thai_dntt, created_at")
        .gte("created_at", monthStart + "T00:00:00")
        .lte("created_at", monthEnd + "T23:59:59")
        .not("trang_thai_dntt", "eq", "cong_no")
        .not("trang_thai_dntt", "eq", "hoan_tien");

      const cpList = cpRows || [];
      const chiPhiKS = cpList.filter((r) => r.danh_muc === "khach_san").reduce((s, r) => s + (r.tien_cong_ty || 0), 0);
      const chiPhiNH = cpList.filter((r) => r.danh_muc === "nha_hang").reduce((s, r) => s + (r.tien_cong_ty || 0), 0);
      const chiPhiDV = cpList.filter((r) => r.danh_muc === "canh_diem").reduce((s, r) => s + (r.tien_cong_ty || 0), 0);
      const tongChiPhiThang = chiPhiKS + chiPhiNH + chiPhiDV;

      // 8. ĐNTT gần đây (10 cái mới nhất chờ xử lý)
      const recentDNTT = dnttList
        .filter((d) => d.trang_thai_thanh_toan === "chua_tt")
        .slice(0, 8);

      return {
        // Đoàn
        activeDoanCount: activeDoan.length,
        activeDoan,
        thisMonthDoanCount: thisMonthDoan.length,
        thisMonthGuests,
        upcomingDoan,
        monthlyData,
        // Thanh toán
        pendingApprovalCount: pendingApproval.length,
        pendingApprovalAmount,
        pendingPaymentCount: pendingPayment.length,
        pendingPaymentAmount,
        totalPaid,
        recentDNTT,
        // Chi phí tháng này
        tongChiPhiThang,
        chiPhiKS,
        chiPhiNH,
        chiPhiDV,
        chiPieParts: [
          { name: "Khách sạn", value: chiPhiKS, color: "#6366f1" },
          { name: "Nhà hàng", value: chiPhiNH, color: "#f59e0b" },
          { name: "Dịch vụ", value: chiPhiDV, color: "#10b981" },
        ],
      };
    },
  });
}
