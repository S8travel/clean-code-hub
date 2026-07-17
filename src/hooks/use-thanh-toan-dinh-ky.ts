import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { externalSupabase } from "@/lib/supabase-external";
import { recalcChiPhiStatus, type DNTTRow } from "@/hooks/use-dntt";
import { useAuth } from "@/hooks/use-auth";
import { anKhoiDinhKy } from "@/lib/dinh-ky-doan-huy";

export interface DinhKyChiPhiRow {
  id: number;
  doan_id: number;
  ten_doan: string | null;
  /** 'huy' = đoàn đã hủy. Dùng để loại khỏi khoản phải trả — xem lib/dinh-ky-doan-huy. */
  doan_trang_thai: string | null;
  ngay_kh_di: string | null;
  /** Tổng khách của đoàn = (lớn+em1+em2+TL) || so_khach — mirror computePhaiThu/ChiPhiTab. */
  so_khach: number;
  danh_muc: string;
  mo_ta: string | null;
  thanh_tien: number;
  thanh_tien_thuc_te: number | null;
  so_tien_da_tt: number;       // đã TRẢ (paid)
  so_tien_da_dntt: number;     // đã ĐỀ NGHỊ (committed, gồm ĐNTT chưa trả) — chống đề nghị trùng
  trang_thai_thanh_toan: string;
  nha_cung_cap_id: number | null;
  ten_ncc: string | null;
  ncc_so_tai_khoan: string | null;
  ncc_ngan_hang: string | null;
  ncc_tai_khoan_thanh_toan: string | null;
}

export function useDinhKyChiPhiList(filters?: {
  nccId?: number | null;
  tuNgay?: string | null;
  denNgay?: string | null;
}) {
  return useQuery({
    queryKey: ["dinh_ky_chi_phi", filters],
    queryFn: async (): Promise<DinhKyChiPhiRow[]> => {
      // 1. Load chi phí định kỳ chưa thanh toán đủ
      let q = externalSupabase
        .from("doan_chi_phi")
        .select("id, doan_id, danh_muc, mo_ta, thanh_tien, thanh_tien_thuc_te, so_tien_da_tt, so_tien_da_dntt, trang_thai_thanh_toan, nha_cung_cap_id, ngoai_tour, ngoai_tour_ci")
        .eq("thanh_toan_dinh_ky", true)
        // Cụm KS đã hủy (Tầng 2) không phải khoản phải trả định kỳ — xử ở dải "Đã hủy".
        .eq("ks_huy", false)
        .not("trang_thai_thanh_toan", "eq", "paid")
        .not("trang_thai_dntt", "eq", "cong_no")
        .not("trang_thai_dntt", "eq", "hoan_tien")
        .order("doan_id", { ascending: true });

      if (filters?.nccId) q = q.eq("nha_cung_cap_id", filters.nccId);

      const { data: cpRows, error } = await q;
      if (error) throw error;
      if (!cpRows || cpRows.length === 0) return [];

      // 2. Load doan info
      const doanIds = [...new Set(cpRows.map((r) => r.doan_id).filter((id): id is number => id != null))];
      const { data: doanList } = await externalSupabase
        .from("doan")
        .select("id, ten_doan, ngay_di, trang_thai, so_khach, so_khach_lon, so_khach_em1, so_khach_em2, so_khach_tl")
        .in("id", doanIds);
      type DoanInfo = {
        id: number; ten_doan: string | null; ngay_di: string | null; trang_thai: string | null;
        so_khach: number | null; so_khach_lon: number | null; so_khach_em1: number | null;
        so_khach_em2: number | null; so_khach_tl: number | null;
      };
      const doanMap: Record<number, DoanInfo> = {};
      (doanList || []).forEach((d) => { doanMap[d.id] = d; });

      // 3. Load NCC info
      const nccIds = [...new Set(cpRows.map((r) => r.nha_cung_cap_id).filter((id): id is number => id != null))];
      type NccInfo = { id: number; ten: string | null; so_tai_khoan: string | null; ngan_hang: string | null; tai_khoan_thanh_toan: string | null };
      const nccMap: Record<number, NccInfo> = {};
      if (nccIds.length > 0) {
        const { data: nccList } = await externalSupabase
          .from("nha_cung_cap")
          .select("id, ten, so_tai_khoan, ngan_hang, tai_khoan_thanh_toan")
          .in("id", nccIds);
        (nccList || []).forEach((n) => { nccMap[n.id] = n; });
      }

      let rows: DinhKyChiPhiRow[] = cpRows.map((r): DinhKyChiPhiRow => {
        const doan: Partial<DoanInfo> = (r.doan_id != null ? doanMap[r.doan_id] : undefined) || {};
        const ncc = r.nha_cung_cap_id ? nccMap[r.nha_cung_cap_id] : null;
        return {
          id: r.id,
          doan_id: r.doan_id ?? 0,
          ten_doan: doan.ten_doan ?? null,
          doan_trang_thai: doan.trang_thai ?? null,
          // KS ngoài tour: gom tháng/lọc theo đêm thực (ngoai_tour_ci) — đêm có
          // thể ở tháng khác hẳn ngày đi đoàn. Fallback ngày đi đoàn nếu thiếu CI.
          ngay_kh_di: (r.ngoai_tour && r.ngoai_tour_ci) ? r.ngoai_tour_ci : (doan.ngay_di ?? null),
          // Cột chi tiết là nguồn chính; `so_khach` chỉ là fallback cho đoàn cũ chưa
          // tách lớn/em/TL (mirror computePhaiThu — đừng cộng cả hai kẻo double).
          so_khach:
            ((doan.so_khach_lon ?? 0) + (doan.so_khach_em1 ?? 0) +
             (doan.so_khach_em2 ?? 0) + (doan.so_khach_tl ?? 0)) || (doan.so_khach ?? 0),
          danh_muc: r.danh_muc ?? "",
          mo_ta: r.mo_ta,
          thanh_tien: r.thanh_tien ?? 0,
          thanh_tien_thuc_te: r.thanh_tien_thuc_te,
          so_tien_da_tt: r.so_tien_da_tt ?? 0,
          so_tien_da_dntt: r.so_tien_da_dntt ?? 0,
          trang_thai_thanh_toan: r.trang_thai_thanh_toan ?? "unpaid",
          nha_cung_cap_id: r.nha_cung_cap_id,
          ten_ncc: ncc?.ten ?? null,
          ncc_so_tai_khoan: ncc?.so_tai_khoan ?? null,
          ncc_ngan_hang: ncc?.ngan_hang ?? null,
          ncc_tai_khoan_thanh_toan: ncc?.tai_khoan_thanh_toan ?? null,
        };
      });

      // Đoàn đã hủy: chi phí dự kiến của nó không phải khoản phải trả. Lọc SỚM để
      // không lọt vào tổng cụm NCC × tháng (tổng đó chính là số tiền ĐNTT gộp).
      // Chốt tiền nằm trong anKhoiDinhKy: dòng nào đã cam kết/đã trả thì GIỮ.
      rows = rows.filter((r) => !anKhoiDinhKy(r));

      // Filter by date range if provided
      if (filters?.tuNgay || filters?.denNgay) {
        rows = rows.filter((r) => {
          if (!r.ngay_kh_di) return true;
          if (filters.tuNgay && r.ngay_kh_di < filters.tuNgay) return false;
          if (filters.denNgay && r.ngay_kh_di > filters.denNgay) return false;
          return true;
        });
      }

      // Sort: ngày khởi hành đoàn → doan_id → danh_muc → id
      rows.sort((a, b) => {
        const dA = a.ngay_kh_di || "9999-12-31";
        const dB = b.ngay_kh_di || "9999-12-31";
        if (dA !== dB) return dA.localeCompare(dB);
        if (a.doan_id !== b.doan_id) return a.doan_id - b.doan_id;
        if (a.danh_muc !== b.danh_muc) return a.danh_muc.localeCompare(b.danh_muc);
        return a.id - b.id;
      });

      return rows;
    },
  });
}

export function useCreateBatchDNTT() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (payload: {
      nccId: number;
      moTa: string;
      chiPhiIds: number[];
      allocations: { chi_phi_id: number; so_tien: number }[];
      soTien: number;
      laCoc?: boolean;
      // Snapshot tài khoản nhận tiền của NCC (ưu tiên ô tai_khoan_thanh_toan).
      // soTaiKhoan có thể là chuỗi gộp nhiều dòng khi lấy từ blob.
      tenNcc?: string | null;
      soTaiKhoan?: string | null;
      nganHang?: string | null;
      // NCC chưa có TK → user nhập tay trong dialog: lưu ngược blob này vào
      // nha_cung_cap.tai_khoan_thanh_toan để các lần tạo ĐNTT sau tự có.
      capNhatNccTaiKhoan?: string | null;
    }) => {
      const nccTaiKhoanMoi = payload.capNhatNccTaiKhoan?.trim();
      if (nccTaiKhoanMoi) {
        const { error: nccErr } = await externalSupabase
          .from("nha_cung_cap")
          .update({ tai_khoan_thanh_toan: nccTaiKhoanMoi })
          .eq("id", payload.nccId);
        if (nccErr) throw nccErr;
      }

      // Tạo DNTT gộp — không thuộc 1 đoàn cụ thể → doan_id = null
      const { data: authData } = await externalSupabase.auth.getUser();
      const taoBoi = authData?.user?.id ?? user?.user_id ?? null;
      const { data: dntt, error } = await externalSupabase
        .from("de_nghi_thanh_toan")
        .insert({
          doan_id: null,
          loai: "dinh_ky",
          mo_ta: payload.moTa,
          nha_cung_cap_id: payload.nccId,
          ten_nha_cung_cap: payload.tenNcc ?? null,
          so_tai_khoan: payload.soTaiKhoan ?? null,
          ngan_hang: payload.nganHang ?? null,
          so_tien: payload.soTien,
          la_coc: payload.laCoc ?? false,
          trang_thai_duyet: "cho_duyet",
          ref_loai: "dinh_ky",
          ref_id: null,
          tao_boi: taoBoi,
        })
        .select("id")
        .single();
      if (error) throw error;

      // Insert allocations
      const allocRows = payload.allocations.map((a) => ({
        dntt_id: dntt.id,
        chi_phi_id: a.chi_phi_id,
        so_tien: a.so_tien,
      }));
      const { error: allocErr } = await externalSupabase
        .from("dntt_allocations")
        .insert(allocRows);
      if (allocErr) throw allocErr;

      await recalcChiPhiStatus(payload.chiPhiIds);
      return dntt;
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ["dinh_ky_chi_phi"] });
      qc.invalidateQueries({ queryKey: ["dinh_ky_dntt_list"] });
      qc.invalidateQueries({ queryKey: ["de_nghi_thanh_toan"] });
      qc.invalidateQueries({ queryKey: ["doan_chi_phi"] });
      if (vars.capNhatNccTaiKhoan?.trim()) {
        qc.invalidateQueries({ queryKey: ["nha_cung_cap"] });
      }
    },
  });
}

// ĐNTT định kỳ (loai='dinh_ky') — chưa thanh toán xong, theo NCC
export type DinhKyDNTTRow = DNTTRow & {
  ngay_di_min?: string | null;
  ngay_di_max?: string | null;
};

export function useDinhKyDNTTList(filters?: {
  nccId?: number | null;
  tuNgay?: string | null;
  denNgay?: string | null;
  includeResolved?: boolean; // default false: ẩn da_huy + tu_choi + paid
}) {
  return useQuery({
    queryKey: ["dinh_ky_dntt_list", filters],
    queryFn: async (): Promise<DinhKyDNTTRow[]> => {
      let q = externalSupabase
        .from("dntt_with_payment_status")
        .select(`
          *,
          nha_cung_cap:nha_cung_cap_id(ten, so_tai_khoan, ngan_hang, tai_khoan_thanh_toan)
        `)
        .eq("loai", "dinh_ky")
        .order("created_at", { ascending: false });

      if (filters?.nccId) q = q.eq("nha_cung_cap_id", filters.nccId);

      const { data, error } = await q;
      if (error) throw error;

      type DnttJoinRow = Record<string, unknown> & {
        nha_cung_cap?: { ten?: string | null; so_tai_khoan?: string | null; ngan_hang?: string | null; tai_khoan_thanh_toan?: string | null } | null;
        ten_nha_cung_cap?: string | null;
        so_tai_khoan?: string | null;
        ngan_hang?: string | null;
      };
      let rows = ((data || []) as DnttJoinRow[]).map((row) => ({
        ...row,
        ten_doan: "",
        ten_ncc: row.nha_cung_cap?.ten || row.ten_nha_cung_cap || "",
        ncc_so_tai_khoan: row.nha_cung_cap?.so_tai_khoan || row.so_tai_khoan || "",
        ncc_ngan_hang: row.nha_cung_cap?.ngan_hang || row.ngan_hang || "",
        ncc_tai_khoan_thanh_toan: row.nha_cung_cap?.tai_khoan_thanh_toan || "",
      })) as unknown as DinhKyDNTTRow[];

      if (!filters?.includeResolved) {
        rows = rows.filter(
          (r) =>
            r.trang_thai_duyet !== "da_huy" &&
            r.trang_thai_duyet !== "tu_choi" &&
            r.payment_status !== "paid",
        );
      }

      // Tính range ngày đi của các đoàn được allocate (qua dntt_allocations → chi_phi → doan)
      // và filter theo range nếu có tuNgay / denNgay
      if (rows.length > 0) {
        const dnttIds = rows.map((r) => r.id);
        const { data: allocs } = await externalSupabase
          .from("dntt_allocations")
          .select("dntt_id, chi_phi:chi_phi_id (doan:doan_id (ngay_di))")
          .in("dntt_id", dnttIds);

        // Joined relation chi_phi → doan may come back as object or array
        type AllocJoin = {
          dntt_id: number;
          chi_phi: { doan: { ngay_di: string | null } | { ngay_di: string | null }[] | null } | null;
        };
        const firstOf = <T,>(v: T | T[] | null | undefined): T | null =>
          Array.isArray(v) ? (v[0] ?? null) : (v ?? null);
        const ngayDiByDntt: Record<number, string[]> = {};
        ((allocs || []) as unknown as AllocJoin[]).forEach((a) => {
          const ngayDi = firstOf(a.chi_phi?.doan)?.ngay_di;
          if (!ngayDi) return;
          (ngayDiByDntt[a.dntt_id] = ngayDiByDntt[a.dntt_id] || []).push(ngayDi);
        });

        rows = rows.map((r) => {
          const dates = ngayDiByDntt[r.id] || [];
          if (dates.length === 0) return { ...r, ngay_di_min: null, ngay_di_max: null };
          const sorted = [...dates].sort();
          return { ...r, ngay_di_min: sorted[0], ngay_di_max: sorted[sorted.length - 1] };
        });

        if (filters?.tuNgay || filters?.denNgay) {
          rows = rows.filter((r) => {
            const dates = ngayDiByDntt[r.id] || [];
            if (dates.length === 0) return true; // ĐNTT chưa có alloc → không filter
            return dates.some((d) => {
              if (filters.tuNgay && d < filters.tuNgay) return false;
              if (filters.denNgay && d > filters.denNgay) return false;
              return true;
            });
          });
        }
      }

      return rows;
    },
  });
}

export interface DinhKyDNTTAllocationRow {
  chi_phi_id: number;
  so_tien: number;
  chi_phi: {
    id: number;
    doan_id: number | null;
    danh_muc: string;
    mo_ta: string | null;
    thanh_tien: number;
    doan: { id: number; ten_doan: string; ngay_di: string | null } | null;
  } | null;
}

// Lấy allocations + chi phí + đoàn cho 1 ĐNTT định kỳ (xem chi tiết)
export function useDinhKyDNTTAllocations(dnttId: number | null | undefined) {
  return useQuery({
    queryKey: ["dinh_ky_dntt_allocations", dnttId],
    enabled: !!dnttId,
    queryFn: async () => {
      const { data, error } = await externalSupabase
        .from("dntt_allocations")
        .select(`
          chi_phi_id, so_tien,
          chi_phi:chi_phi_id (
            id, doan_id, danh_muc, mo_ta, thanh_tien,
            doan:doan_id (id, ten_doan, ngay_di)
          )
        `)
        .eq("dntt_id", dnttId!);
      if (error) throw error;
      return (data || []) as unknown as DinhKyDNTTAllocationRow[];
    },
  });
}

export function useNccOptions() {
  return useQuery({
    queryKey: ["nha_cung_cap_options"],
    queryFn: async () => {
      const { data, error } = await externalSupabase
        .from("nha_cung_cap")
        .select("id, ten")
        .order("ten", { ascending: true });
      if (error) throw error;
      return (data || []) as { id: number; ten: string }[];
    },
  });
}
