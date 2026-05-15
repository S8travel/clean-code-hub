import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { externalSupabase } from "@/lib/supabase-external";
import { useApproveDNTT, useMarkPaidDNTT, useCancelDNTT } from "@/hooks/use-dntt";
import { useAuth } from "@/hooks/use-auth";

export interface HDVChiPhiItem {
  id: number;
  mo_ta: string | null;
  danh_muc: string;
  so_luong: number;
  don_gia: number;
  tien_hdv: number;
}

export interface HDVInfo {
  id: number;
  ten: string;
  so_tai_khoan: string | null;
  ngan_hang: string | null;
}

// Chi tiết quyết toán theo form S8 (BM02.1-20/2024/QT-S8)
export interface QuyetToanData {
  tam_ung?: number;
  thu_trach_nhiem?: number;
  thu_tip?: { so_khach?: number; don_gia_nt?: number; ty_gia?: number };
  thu_dau_khach?: { so_khach?: number; don_gia?: number };
  thu_quy_vp?: { so_luong?: number; don_gia?: number };
  thu_ban_op?: number;
  thu_khac?: number;
  tong_hdv_chi?: number;       // snapshot tongHdvChi tại lúc tạo
  ma_doan?: string;
  ten_hdv?: string;
  so_khach_doan?: number;
  so_ngay_doan?: number;
  ten_nguoi_de_nghi?: string;  // = HDV name (snapshot)
  bo_phan_nguoi_de_nghi?: string;
}

export interface HDVDNTTRow {
  id: number;
  doan_id: number | null;
  ref_loai: string | null;
  mo_ta: string | null;
  so_tien: number;
  la_thu_hoi: boolean;
  trang_thai_duyet: string;
  payment_status: "unpaid" | "partial" | "paid";
  paid_amount: number;
  ghi_chu: string | null;
  created_at: string;
  quyet_toan_data: QuyetToanData | null;
}

export interface HDVHoTroItem {
  id: number;
  mo_ta: string | null;
  loai: string;
  so_luong: number;
  don_gia: number;
  tien_cong_ty: number;
  tien_hdv: number;
}

export interface HDVSectionData {
  hdv: HDVInfo | null;
  chiPhiItems: HDVChiPhiItem[];
  hoTroItems: HDVHoTroItem[];
  tongHdvChi: number;
  tongHoTroHDV: number;
  tamUngList: HDVDNTTRow[];
  quyetToanList: HDVDNTTRow[];
  tamUngDaTT: number;
  tamUngChuaTT: number;
  soConPhaiTra: number;
  daQuyetToan: boolean;
}

export function useChiPhiHDVSection(doanId?: number) {
  return useQuery({
    queryKey: ["chi_phi_hdv_section", doanId],
    enabled: !!doanId,
    queryFn: async (): Promise<HDVSectionData> => {
      // 1. Load HDV id từ doan
      const { data: doanRow } = await externalSupabase
        .from("doan")
        .select("huong_dan_vien_id")
        .eq("id", doanId!)
        .single();

      const hdvId: number | null = doanRow?.huong_dan_vien_id ?? null;

      // 2. Load HDV info nếu có
      let hdv: HDVInfo | null = null;
      if (hdvId) {
        const { data: hdvRow } = await externalSupabase
          .from("huong_dan_vien")
          .select("id, ten, so_tai_khoan, ngan_hang")
          .eq("id", hdvId)
          .single();
        if (hdvRow) {
          hdv = {
            id: hdvRow.id,
            ten: hdvRow.ten,
            so_tai_khoan: hdvRow.so_tai_khoan ?? null,
            ngan_hang: hdvRow.ngan_hang ?? null,
          };
        }
      }

      // 3. Load chi phí HDV ứng (tien_hdv > 0) — không phụ thuộc vào có HDV hay không
      const { data: cpRows } = await externalSupabase
        .from("doan_chi_phi")
        .select("id, mo_ta, danh_muc, so_luong, don_gia, tien_hdv")
        .eq("doan_id", doanId!)
        .gt("tien_hdv", 0)
        .order("created_at", { ascending: true });

      const chiPhiItems: HDVChiPhiItem[] = (cpRows || []).map((r: any) => ({
        id: r.id,
        mo_ta: r.mo_ta,
        danh_muc: r.danh_muc,
        so_luong: r.so_luong ?? 1,
        don_gia: r.don_gia ?? 0,
        tien_hdv: r.tien_hdv,
      }));
      const tongHdvChi = chiPhiItems.reduce((s, r) => s + r.tien_hdv, 0);

      // 3b. Load chi phí hỗ trợ HDV (công ty chi cho HDV)
      const { data: hoTroRows } = await externalSupabase
        .from("doan_chi_phi")
        .select("id, mo_ta, loai, so_luong, don_gia, tien_cong_ty, tien_hdv")
        .eq("doan_id", doanId!)
        .eq("danh_muc", "hdv_ho_tro")
        .order("created_at", { ascending: true });

      const hoTroItems: HDVHoTroItem[] = (hoTroRows || []).map((r: any) => ({
        id: r.id,
        mo_ta: r.mo_ta,
        loai: r.loai ?? "cong_tac_phi",
        so_luong: r.so_luong ?? 1,
        don_gia: r.don_gia ?? 0,
        tien_cong_ty: r.tien_cong_ty ?? 0,
        tien_hdv: r.tien_hdv ?? 0,
      }));
      // tongHoTroHDV = tổng chi phí section (cả công ty + HDV trả). Số HDV
      // phải hoàn lại = chỉ phần HDV ứng trước (tien_hdv).
      const tongHoTroHDV = hoTroItems.reduce((s, r) => s + r.tien_cong_ty + r.tien_hdv, 0);
      const tongHdvUngHoTro = hoTroItems.reduce((s, r) => s + r.tien_hdv, 0);

      // 4. Load DNTT liên quan HDV (qua view có payment_status)
      const { data: dnttRows } = await externalSupabase
        .from("dntt_with_payment_status")
        .select("id, doan_id, ref_loai, mo_ta, so_tien, trang_thai_duyet, payment_status, paid_amount, ghi_chu, created_at, quyet_toan_data")
        .eq("doan_id", doanId!)
        .in("ref_loai", ["hdv_tam_ung", "hdv_quyet_toan"])
        .order("created_at", { ascending: true });

      const allHdvDntts = (dnttRows || []).map((d: any) => ({
        ...d,
        la_thu_hoi: !!(d.ghi_chu || "").includes("[Thu hồi]"),
        quyet_toan_data: d.quyet_toan_data ?? null,
      })) as HDVDNTTRow[];
      // Loại da_huy / tu_choi khỏi list hiển thị — DNTT bị hủy không nên show
      // trong section HDV nữa (audit qua activity_log).
      const isActive = (d: HDVDNTTRow) =>
        d.trang_thai_duyet !== "da_huy" && d.trang_thai_duyet !== "tu_choi";
      const tamUngList = allHdvDntts.filter((d) => d.ref_loai === "hdv_tam_ung" && isActive(d));
      const quyetToanList = allHdvDntts.filter((d) => d.ref_loai === "hdv_quyet_toan" && isActive(d));

      const tamUngDaTT = tamUngList
        .filter((d) => d.payment_status === "paid" && d.trang_thai_duyet !== "da_huy")
        .reduce((s, d) => s + d.so_tien, 0);

      const tamUngChuaTT = tamUngList
        .filter((d) => d.payment_status !== "paid" && d.trang_thai_duyet !== "da_huy" && d.trang_thai_duyet !== "tu_choi")
        .reduce((s, d) => s + d.so_tien, 0);

      // Công ty còn phải trả HDV = HDV chi hộ vendor + HDV ứng cho khoản hỗ trợ - đã tạm ứng
      const soConPhaiTra = tongHdvChi + tongHdvUngHoTro - tamUngDaTT;

      const daQuyetToan = quyetToanList.some(
        (d) => d.trang_thai_duyet !== "da_huy" && d.trang_thai_duyet !== "tu_choi",
      );

      return {
        hdv,
        chiPhiItems,
        hoTroItems,
        tongHdvChi,
        tongHoTroHDV,
        tamUngList,
        quyetToanList,
        tamUngDaTT,
        tamUngChuaTT,
        soConPhaiTra,
        daQuyetToan,
      };
    },
  });
}

export function useCreateHDVPayment() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (payload: {
      doanId: number;
      hdvId: number | null;
      refLoai: "hdv_tam_ung" | "hdv_quyet_toan";
      soTien: number;
      laThuHoi: boolean;
      moTa: string;
      ghiChu?: string;
      quyetToanData?: QuyetToanData | null;
      ngayCanThanhToan?: string | null;
    }) => {
      const { data: authData } = await externalSupabase.auth.getUser();
      const taoBoi = authData?.user?.id ?? user?.user_id ?? null;
      const { data, error } = await externalSupabase
        .from("de_nghi_thanh_toan")
        .insert({
          doan_id: payload.doanId,
          loai: "hdv",
          ref_loai: payload.refLoai,
          ref_id: payload.hdvId,
          mo_ta: payload.moTa,
          so_tien: payload.soTien,
          la_coc: false,
          trang_thai_duyet: "cho_duyet",
          ghi_chu: payload.laThuHoi
            ? `[Thu hồi] ${payload.ghiChu ?? ""}`.trim()
            : (payload.ghiChu ?? null),
          quyet_toan_data: payload.quyetToanData ?? null,
          ngay_can_thanh_toan: payload.ngayCanThanhToan ?? null,
          tao_boi: taoBoi,
        })
        .select("id")
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (_, v) => {
      qc.invalidateQueries({ queryKey: ["chi_phi_hdv_section", v.doanId] });
      qc.invalidateQueries({ queryKey: ["de_nghi_thanh_toan", v.doanId] });
      qc.invalidateQueries({ queryKey: ["de_nghi_thanh_toan"] });
    },
  });
}

export { useApproveDNTT, useMarkPaidDNTT, useCancelDNTT };
