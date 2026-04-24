import { useQuery } from "@tanstack/react-query";
import { externalSupabase } from "@/lib/supabase-external";
import { startOfMonth, endOfMonth, subMonths, format, addDays } from "date-fns";

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
      const next7 = fmt(addDays(today, 7));
      const sixMonthsAgo = fmt(startOfMonth(subMonths(today, 5)));
      const lastMonthStart = fmt(startOfMonth(subMonths(today, 1)));
      const lastMonthEnd = fmt(endOfMonth(subMonths(today, 1)));

      const [doanRes, dnttRes, cpThangRes, agentRes, diaDiemRes, cp6Res] = await Promise.all([
        externalSupabase
          .from("doan")
          .select("id, ten_doan, ngay_di, ngay_ve, so_khach, so_khach_lon, so_khach_em1, so_khach_em2, so_khach_tl, trang_thai, agent_id, dia_diem_id")
          .gte("ngay_di", sixMonthsAgo)
          .order("ngay_di", { ascending: true }),
        externalSupabase
          .from("de_nghi_thanh_toan")
          .select("id, so_tien, trang_thai_duyet, trang_thai_thanh_toan, created_at, mo_ta, loai, doan_id")
          .not("trang_thai_duyet", "eq", "da_huy")
          .not("trang_thai_duyet", "eq", "tu_choi")
          .order("created_at", { ascending: false }),
        externalSupabase
          .from("doan_chi_phi")
          .select("tien_cong_ty, danh_muc, trang_thai_dntt, created_at")
          .gte("created_at", monthStart + "T00:00:00")
          .lte("created_at", monthEnd + "T23:59:59")
          .not("trang_thai_dntt", "eq", "cong_no")
          .not("trang_thai_dntt", "eq", "hoan_tien"),
        externalSupabase.from("agents").select("id, ten"),
        externalSupabase.from("dia_diem").select("id, ten"),
        externalSupabase
          .from("doan_chi_phi")
          .select("tien_cong_ty, danh_muc, created_at")
          .gte("created_at", sixMonthsAgo + "T00:00:00")
          .not("trang_thai_dntt", "eq", "cong_no")
          .not("trang_thai_dntt", "eq", "hoan_tien"),
      ]);

      const doanList = doanRes.data || [];
      const dnttList = dnttRes.data || [];
      const cpList = cpThangRes.data || [];
      const agentList = agentRes.data || [];
      const diaDiemList = diaDiemRes.data || [];
      const cp6List = cp6Res.data || [];

      const guestCount = (d: any) =>
        (d.so_khach_lon || 0) + (d.so_khach_em1 || 0) + (d.so_khach_em2 || 0) + (d.so_khach_tl || 0) || d.so_khach || 0;

      // ── Đoàn stats ───────────────────────────────────────────────────────────
      const activeDoan = doanList.filter(
        (d) => d.ngay_di && d.ngay_ve && d.ngay_di <= todayStr && d.ngay_ve >= todayStr && d.trang_thai !== "huy",
      );

      const thisMonthDoan = doanList.filter(
        (d) => d.ngay_di && d.ngay_di >= monthStart && d.ngay_di <= monthEnd && d.trang_thai !== "huy",
      );
      const thisMonthGuests = thisMonthDoan.reduce((s, d) => s + guestCount(d), 0);

      const lastMonthDoan = doanList.filter(
        (d) => d.ngay_di && d.ngay_di >= lastMonthStart && d.ngay_di <= lastMonthEnd && d.trang_thai !== "huy",
      );
      const lastMonthGuests = lastMonthDoan.reduce((s, d) => s + guestCount(d), 0);

      const upcomingDoan = doanList
        .filter((d) => d.ngay_di && d.ngay_di > todayStr && d.ngay_di <= next7 && d.trang_thai !== "huy")
        .sort((a, b) => (a.ngay_di || "").localeCompare(b.ngay_di || ""))
        .slice(0, 10);

      const upcomingDoan14 = doanList
        .filter((d) => d.ngay_di && d.ngay_di > todayStr && d.ngay_di <= next14 && d.trang_thai !== "huy")
        .sort((a, b) => (a.ngay_di || "").localeCompare(b.ngay_di || ""))
        .slice(0, 8);

      // ── Trạng thái đoàn (6 tháng) ────────────────────────────────────────────
      const statusBreakdown = [
        { name: "Đang chạy", value: doanList.filter((d) => d.trang_thai === "dang_chay").length, color: "#10b981" },
        { name: "Hoàn thành", value: doanList.filter((d) => d.trang_thai === "hoan_thanh").length, color: "#6366f1" },
        { name: "Đã hủy", value: doanList.filter((d) => d.trang_thai === "huy").length, color: "#f43f5e" },
      ].filter((s) => s.value > 0);

      // ── Monthly chart (6 tháng) ───────────────────────────────────────────────
      const monthlyMap = new Map<string, { count: number; khach: number }>();
      for (let i = 5; i >= 0; i--) {
        const key = format(subMonths(today, i), "MM/yy");
        monthlyMap.set(key, { count: 0, khach: 0 });
      }
      for (const d of doanList) {
        if (!d.ngay_di || d.trang_thai === "huy") continue;
        const key = format(new Date(d.ngay_di + "T00:00:00"), "MM/yy");
        if (monthlyMap.has(key)) {
          const prev = monthlyMap.get(key)!;
          monthlyMap.set(key, { count: prev.count + 1, khach: prev.khach + guestCount(d) });
        }
      }
      const monthlyData = [...monthlyMap.entries()].map(([month, v]) => ({
        month, soDoan: v.count, soKhach: v.khach,
      }));

      // ── Chi phí tháng này ────────────────────────────────────────────────────
      const chiPhiKS = cpList.filter((r) => r.danh_muc === "khach_san").reduce((s, r) => s + (r.tien_cong_ty || 0), 0);
      const chiPhiNH = cpList.filter((r) => r.danh_muc === "nha_hang").reduce((s, r) => s + (r.tien_cong_ty || 0), 0);
      const chiPhiDV = cpList.filter((r) => r.danh_muc === "canh_diem" || r.danh_muc === "dich_vu").reduce((s, r) => s + (r.tien_cong_ty || 0), 0);
      const tongChiPhiThang = chiPhiKS + chiPhiNH + chiPhiDV;

      // ── Chi phí 6 tháng (stacked) ────────────────────────────────────────────
      const costMonthlyMap = new Map<string, { ks: number; nh: number; dv: number }>();
      for (let i = 5; i >= 0; i--) {
        const key = format(subMonths(today, i), "MM/yy");
        costMonthlyMap.set(key, { ks: 0, nh: 0, dv: 0 });
      }
      for (const r of cp6List) {
        if (!r.created_at) continue;
        const key = format(new Date(r.created_at), "MM/yy");
        if (!costMonthlyMap.has(key)) continue;
        const prev = costMonthlyMap.get(key)!;
        if (r.danh_muc === "khach_san") prev.ks += r.tien_cong_ty || 0;
        else if (r.danh_muc === "nha_hang") prev.nh += r.tien_cong_ty || 0;
        else prev.dv += r.tien_cong_ty || 0;
      }
      const monthlyCostData = [...costMonthlyMap.entries()].map(([month, v]) => ({
        month, ks: v.ks, nh: v.nh, dv: v.dv, total: v.ks + v.nh + v.dv,
      }));

      // ── ĐNTT stats ────────────────────────────────────────────────────────────
      const pendingApproval = dnttList.filter((d) => d.trang_thai_duyet === "cho_duyet");
      const pendingPayment = dnttList.filter(
        (d) => d.trang_thai_duyet === "da_duyet" && d.trang_thai_thanh_toan === "chua_tt",
      );
      const recentDNTT = dnttList.filter((d) => d.trang_thai_thanh_toan === "chua_tt").slice(0, 8);

      // ── Agent breakdown ───────────────────────────────────────────────────────
      const agentNameMap = new Map(agentList.map((a) => [a.id, a.ten]));
      const agentMap = new Map<number, { name: string; soDoan: number; soKhach: number }>();
      for (const d of doanList) {
        if (!d.agent_id || d.trang_thai === "huy") continue;
        const prev = agentMap.get(d.agent_id) ?? { name: agentNameMap.get(d.agent_id) || "—", soDoan: 0, soKhach: 0 };
        agentMap.set(d.agent_id, { ...prev, soDoan: prev.soDoan + 1, soKhach: prev.soKhach + guestCount(d) });
      }
      const topAgents = [...agentMap.values()]
        .sort((a, b) => b.soKhach - a.soKhach)
        .slice(0, 8);

      // ── Địa điểm breakdown ────────────────────────────────────────────────────
      const ddNameMap = new Map(diaDiemList.map((d) => [d.id, d.ten]));
      const ddMap = new Map<number, { name: string; count: number }>();
      for (const d of doanList) {
        if (!d.dia_diem_id || d.trang_thai === "huy") continue;
        const prev = ddMap.get(d.dia_diem_id) ?? { name: ddNameMap.get(d.dia_diem_id) || "—", count: 0 };
        ddMap.set(d.dia_diem_id, { ...prev, count: prev.count + 1 });
      }
      const topDiaDiem = [...ddMap.values()]
        .sort((a, b) => b.count - a.count)
        .slice(0, 8);

      return {
        // Core
        activeDoanCount: activeDoan.length,
        activeDoan,
        thisMonthDoanCount: thisMonthDoan.length,
        thisMonthGuests,
        lastMonthDoanCount: lastMonthDoan.length,
        lastMonthGuests,
        upcomingDoan,
        upcomingDoan14,
        // Charts
        monthlyData,
        monthlyCostData,
        statusBreakdown,
        topAgents,
        topDiaDiem,
        // ĐNTT
        pendingApprovalCount: pendingApproval.length,
        pendingApprovalAmount: pendingApproval.reduce((s, d) => s + d.so_tien, 0),
        pendingPaymentCount: pendingPayment.length,
        pendingPaymentAmount: pendingPayment.reduce((s, d) => s + d.so_tien, 0),
        recentDNTT,
        // Chi phí
        tongChiPhiThang,
        chiPhiKS,
        chiPhiNH,
        chiPhiDV,
        chiPieParts: [
          { name: "Khách sạn", value: chiPhiKS, color: "#6366f1" },
          { name: "Nhà hàng",  value: chiPhiNH, color: "#f59e0b" },
          { name: "Dịch vụ",  value: chiPhiDV, color: "#10b981" },
        ],
      };
    },
  });
}
