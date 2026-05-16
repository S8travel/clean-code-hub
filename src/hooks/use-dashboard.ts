import { useQuery } from "@tanstack/react-query";
import { externalSupabase } from "@/lib/supabase-external";
import { startOfMonth, endOfMonth, subMonths, addMonths, format, addDays } from "date-fns";

// Local-aware format để tránh timezone-shift bug ở UTC+7
const fmt = (d: Date) => format(d, "yyyy-MM-dd");

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

      const [doanRes, dnttRes, cpThangRes, agentRes, diaDiemRes, cp6Res, congNoRes] = await Promise.all([
        externalSupabase
          .from("doan")
          .select("id, ten_doan, ngay_di, ngay_ve, so_khach, so_khach_lon, so_khach_em1, so_khach_em2, so_khach_tl, trang_thai, agent_id, dia_diem_id")
          .gte("ngay_di", sixMonthsAgo)
          .order("ngay_di", { ascending: true }),
        externalSupabase
          .from("dntt_with_payment_status")
          .select("id, so_tien, trang_thai_duyet, payment_status, paid_amount, created_at, mo_ta, loai, doan_id, ngay_can_thanh_toan")
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
        externalSupabase.from("dia_diem").select("id, ten, mien"),
        externalSupabase
          .from("doan_chi_phi")
          .select("tien_cong_ty, danh_muc, created_at")
          .gte("created_at", sixMonthsAgo + "T00:00:00")
          .not("trang_thai_dntt", "eq", "cong_no")
          .not("trang_thai_dntt", "eq", "hoan_tien"),
        externalSupabase
          .from("cong_no_with_status")
          .select("so_tien_con_lai, trang_thai")
          .eq("trang_thai", "con_du"),
      ]);

      const doanList = doanRes.data || [];
      const dnttList = dnttRes.data || [];
      const cpList = cpThangRes.data || [];
      const agentList = agentRes.data || [];
      const diaDiemList = diaDiemRes.data || [];
      const cp6List = cp6Res.data || [];
      const congNoList = congNoRes.data || [];

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

      // ── Monthly chart (12 tháng: 6 trước + tháng hiện tại + 5 sau) ───────────
      // Future months để OP thấy xu hướng booking sắp tới (nhân viên kế toán dự
      // dòng tiền). Past 6 tháng cover lịch sử gần.
      const monthlyMap = new Map<string, { count: number; khach: number }>();
      for (let i = -6; i <= 5; i++) {
        const dt = i < 0 ? subMonths(today, -i) : addMonths(today, i);
        const key = format(dt, "MM/yy");
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
      // ── Hard-coded số liệu lịch sử (chưa nhập lên web) ────────────────────────
      // Số tổng tháng 1, 2, 3 / 2026 — fallback khi DB chưa có data tháng đó
      const HISTORICAL: Record<string, { count: number; khach: number }> = {
        "01/26": { count: 84, khach: 1926 },
        "02/26": { count: 89, khach: 1633 },
        "03/26": { count: 79, khach: 1760 },
      };
      for (const [key, v] of Object.entries(HISTORICAL)) {
        if (!monthlyMap.has(key)) continue;
        const cur = monthlyMap.get(key)!;
        // Chỉ override khi DB rỗng (tránh ghi đè khi đã nhập data thật)
        if (cur.count === 0 && cur.khach === 0) {
          monthlyMap.set(key, v);
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
        (d: any) => d.trang_thai_duyet === "da_duyet" && d.payment_status !== "paid",
      );
      const recentDNTT = dnttList.filter((d: any) => d.payment_status !== "paid").slice(0, 8);

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
      const ddMienMap = new Map(diaDiemList.map((d) => [d.id, d.mien]));
      const ddMap = new Map<number, { name: string; count: number; soKhach: number }>();
      for (const d of doanList) {
        if (!d.dia_diem_id || d.trang_thai === "huy") continue;
        const prev = ddMap.get(d.dia_diem_id) ?? { name: ddNameMap.get(d.dia_diem_id) || "—", count: 0, soKhach: 0 };
        ddMap.set(d.dia_diem_id, { ...prev, count: prev.count + 1, soKhach: prev.soKhach + guestCount(d) });
      }
      const topDiaDiem = [...ddMap.values()]
        .sort((a, b) => b.count - a.count)
        .slice(0, 8);

      // ── Miền breakdown (dia_diem.mien) ───────────────────────────────────────
      const mienMap = new Map<string, { name: string; soDoan: number; soKhach: number }>();
      for (const d of doanList) {
        if (!d.dia_diem_id || d.trang_thai === "huy") continue;
        const mien = ddMienMap.get(d.dia_diem_id) || "Khác";
        const prev = mienMap.get(mien) ?? { name: mien, soDoan: 0, soKhach: 0 };
        mienMap.set(mien, { ...prev, soDoan: prev.soDoan + 1, soKhach: prev.soKhach + guestCount(d) });
      }
      // Thứ tự cố định Bắc → Trung → Nam → Khác
      const MIEN_ORDER = ["Bắc", "Trung", "Nam", "Khác"];
      const topMien = [...mienMap.values()].sort(
        (a, b) => MIEN_ORDER.indexOf(a.name) - MIEN_ORDER.indexOf(b.name),
      );
      const mienTongDoan = topMien.reduce((s, m) => s + m.soDoan, 0);
      const mienTongKhach = topMien.reduce((s, m) => s + m.soKhach, 0);

      // ── Công nợ phải trả NCC (còn dư) ────────────────────────────────────────
      const congNoNCCAmount = congNoList.reduce((s, c) => s + Number(c.so_tien_con_lai || 0), 0);
      const congNoNCCCount = congNoList.length;

      // ── Dự chi theo tuần (ĐNTT chưa trả & chưa hủy, theo ngay_can_thanh_toan) ─
      const duChiBuckets: { key: string; label: string; tone: "danger" | "warning" | "normal" }[] = [
        { key: "qua_han",  label: "Quá hạn",          tone: "danger" },
        { key: "tuan_nay", label: "Tuần này (≤7n)",   tone: "warning" },
        { key: "tuan_toi", label: "Tuần tới (8–14n)", tone: "normal" },
        { key: "t3",       label: "15–21 ngày",       tone: "normal" },
        { key: "t4",       label: "22–28 ngày",       tone: "normal" },
        { key: "sau",      label: "> 28 ngày",        tone: "normal" },
        { key: "chua",     label: "Chưa định ngày",   tone: "normal" },
      ];
      const duChiAgg = new Map<string, { count: number; tien: number }>();
      for (const b of duChiBuckets) duChiAgg.set(b.key, { count: 0, tien: 0 });
      const msDay = 86400000;
      const todayMid = new Date(todayStr + "T00:00:00").getTime();
      for (const d of dnttList as any[]) {
        if (d.trang_thai_duyet !== "cho_duyet" && d.trang_thai_duyet !== "da_duyet") continue;
        if (d.payment_status === "paid") continue;
        const con = Number(d.so_tien || 0) - Number(d.paid_amount || 0);
        if (con <= 0) continue;
        let key: string;
        if (!d.ngay_can_thanh_toan) {
          key = "chua";
        } else {
          const diff = Math.floor(
            (new Date(d.ngay_can_thanh_toan + "T00:00:00").getTime() - todayMid) / msDay,
          );
          key = diff < 0 ? "qua_han"
            : diff < 7 ? "tuan_nay"
            : diff < 14 ? "tuan_toi"
            : diff < 21 ? "t3"
            : diff < 28 ? "t4"
            : "sau";
        }
        const cur = duChiAgg.get(key)!;
        cur.count += 1;
        cur.tien += con;
      }
      const duChiTuan = duChiBuckets
        .map((b) => ({ ...b, ...duChiAgg.get(b.key)! }))
        .filter((b) => b.count > 0);
      const duChiTong = duChiTuan.reduce((s, b) => s + b.tien, 0);

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
        topMien,
        mienTongDoan,
        mienTongKhach,
        // Dòng tiền
        congNoNCCAmount,
        congNoNCCCount,
        duChiTuan,
        duChiTong,
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
