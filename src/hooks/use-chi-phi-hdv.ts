import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { externalSupabase } from "@/lib/supabase-external";
import { useApproveDNTT, useMarkPaidDNTT, useCancelDNTT } from "@/hooks/use-dntt";

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

export interface HDVDNTTRow {
  id: number;
  doan_id: number | null;
  ref_loai: string | null;
  mo_ta: string | null;
  so_tien: number;
  la_thu_hoi: boolean;
  trang_thai_duyet: string;
  trang_thai_thanh_toan: string;
  ghi_chu: string | null;
  created_at: string;
}

export interface HDVHoTroItem {
  id: number;
  mo_ta: string | null;
  loai: string;
  so_luong: number;
  don_gia: number;
  tien_cong_ty: number;
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
        .select("id, mo_ta, loai, so_luong, don_gia, tien_cong_ty")
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
      }));
      const tongHoTroHDV = hoTroItems.reduce((s, r) => s + r.tien_cong_ty, 0);

      // 4. Load DNTT liên quan HDV
      const { data: dnttRows } = await externalSupabase
        .from("de_nghi_thanh_toan")
        .select("id, doan_id, ref_loai, mo_ta, so_tien, la_thu_hoi, trang_thai_duyet, trang_thai_thanh_toan, ghi_chu, created_at")
        .eq("doan_id", doanId!)
        .in("ref_loai", ["hdv_tam_ung", "hdv_quyet_toan"])
        .order("created_at", { ascending: true });

      const allHdvDntts = (dnttRows || []) as HDVDNTTRow[];
      const tamUngList = allHdvDntts.filter((d) => d.ref_loai === "hdv_tam_ung");
      const quyetToanList = allHdvDntts.filter((d) => d.ref_loai === "hdv_quyet_toan");

      const tamUngDaTT = tamUngList
        .filter((d) => d.trang_thai_thanh_toan === "da_tt" && d.trang_thai_duyet !== "da_huy")
        .reduce((s, d) => s + d.so_tien, 0);

      const tamUngChuaTT = tamUngList
        .filter((d) => d.trang_thai_thanh_toan !== "da_tt" && d.trang_thai_duyet !== "da_huy" && d.trang_thai_duyet !== "tu_choi")
        .reduce((s, d) => s + d.so_tien, 0);

      const soConPhaiTra = tongHdvChi + tongHoTroHDV - tamUngDaTT;

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
  return useMutation({
    mutationFn: async (payload: {
      doanId: number;
      hdvId: number | null;
      refLoai: "hdv_tam_ung" | "hdv_quyet_toan";
      soTien: number;
      laThuHoi: boolean;
      moTa: string;
      ghiChu?: string;
    }) => {
      const { data, error } = await externalSupabase
        .from("de_nghi_thanh_toan")
        .insert({
          doan_id: payload.doanId,
          hdv_id: payload.hdvId,
          loai: "hdv",
          ref_loai: payload.refLoai,
          ref_id: payload.hdvId,
          mo_ta: payload.moTa,
          so_tien: payload.soTien,
          la_coc: false,
          la_thu_hoi: payload.laThuHoi,
          trang_thai_duyet: "cho_duyet",
          trang_thai_thanh_toan: "chua_tt",
          ghi_chu: payload.ghiChu ?? null,
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
