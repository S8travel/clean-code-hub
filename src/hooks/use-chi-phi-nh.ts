import { useQuery } from "@tanstack/react-query";
import { externalSupabase } from "@/lib/supabase-external";
import {
  gomBuaAnNhaHang, mapGiaBooking, setMenuCanGiaMaster, ganGiaSetMenu, dungNhaHangMap, locBuaKhachTra,
  type NHSectionData,
} from "@/lib/nh-section-data";

export type { NHMealRow, NhaHangDetail, NHSectionData } from "@/lib/nh-section-data";

// Tải theo 2 ĐỢT SONG SONG (không nối đuôi) — mỗi lượt gọi mạng tốn cỡ 0,1s+. Logic
// gom bữa / gán giá / dựng map nhà hàng ở lib/nh-section-data.ts (có test).
export function useChiPhiNHSection(doanId?: number, doanNhomId?: number | null) {
  return useQuery({
    queryKey: ["chi_phi_nh_section", doanId, doanNhomId ?? null],
    enabled: !!doanId,
    queryFn: async (): Promise<NHSectionData> => {
      // Đợt 1: doan_ngay (bữa có NH, lọc nhóm nếu có) + gia_snapshot booking (lock per tour).
      let ngayQuery = externalSupabase
        .from("doan_ngay")
        .select("id, ngay_so, ngay_date, an_trua_nha_hang_id, an_toi_nha_hang_id, an_trua_set_menu_id, an_toi_set_menu_id")
        .eq("doan_id", doanId!)
        .order("ngay_so", { ascending: true });
      if (doanNhomId != null) ngayQuery = ngayQuery.eq("doan_nhom_id", doanNhomId);
      const [{ data: ngayRows, error: e1 }, { data: bkList }] = await Promise.all([
        ngayQuery,
        externalSupabase
          .from("doan_booking_nh")
          .select("doan_ngay_id, bua_an, gia_snapshot")
          .eq("doan_id", doanId!),
      ]);
      if (e1) throw e1;

      const meals = gomBuaAnNhaHang(ngayRows || []);
      if (meals.length === 0) return { meals: [], nhaHangMap: {} };

      // Đợt 2: nhà hàng (NCC embed qua FK — khỏi thêm 1 lượt) + giá master set menu
      // cho bữa chưa có snapshot (vd cascade chưa chạy — gặp thường xuyên).
      const bkMap = mapGiaBooking(bkList || []);
      const nhIds = [...new Set(meals.map((m) => m.nha_hang_id))];
      const fallbackSmIds = setMenuCanGiaMaster(meals, bkMap);
      const [{ data: nhList, error: e2 }, smRes] = await Promise.all([
        externalSupabase
          .from("nha_hang")
          .select("id, ten, dia_chi, thong_tin_chung, foc_khach, foc_mien, chiet_khau_phan_tram, nguoi_thanh_toan, tai_khoan_thanh_toan, nha_cung_cap_id, tinh_suat_tl, thanh_toan_dinh_ky_mac_dinh, nha_cung_cap:nha_cung_cap_id(ten, so_tai_khoan, ngan_hang)")
          .in("id", nhIds),
        fallbackSmIds.length > 0
          ? externalSupabase.from("nha_hang_set_menu").select("id, gia").in("id", fallbackSmIds)
          : null,
      ]);
      if (e2) throw e2;

      const giaMaster: Record<number, number | null> = {};
      (smRes?.data || []).forEach((s) => { giaMaster[s.id] = s.gia; });

      const nhaHangMap = dungNhaHangMap(nhList || []);
      return { meals: locBuaKhachTra(ganGiaSetMenu(meals, bkMap, giaMaster), nhaHangMap), nhaHangMap };
    },
  });
}

export interface CanhDiemInfo {
  id: number;
  ten: string;
  loai: string | null;
  co_phi: boolean | null;
  gia_mac_dinh: number | null;
  foc_khach: number | null;
  foc_mien: number | null;
  dia_diem: string | null;
  ghi_chu: string | null;
  thong_tin_chung: string | null;
  so_dien_thoai: string | null;
  email: string | null;
  nguoi_thanh_toan: string | null;
}

// Map: doan_ngay_item_id → CanhDiemInfo
export function useDVCanhDiemMap(doanId?: number): Record<number, CanhDiemInfo> {
  const { data } = useQuery({
    queryKey: ["dv_canh_diem_map", doanId],
    enabled: !!doanId,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await externalSupabase
        .from("doan_ngay_item")
        .select("id, canh_diem:canh_diem_id(id, ten, loai, co_phi, gia_mac_dinh, foc_khach, foc_mien, dia_diem, ghi_chu, thong_tin_chung, so_dien_thoai, email, nguoi_thanh_toan)")
        .eq("doan_id", doanId!);
      if (error) throw error;
      const map: Record<number, CanhDiemInfo> = {};
      for (const item of data ?? []) {
        // canh_diem là joined relation (single FK) → narrow về CanhDiemInfo.
        const canhDiem = item.canh_diem as CanhDiemInfo | null;
        if (item.id && canhDiem) {
          map[item.id] = canhDiem;
        }
      }
      return map;
    },
  });
  return data ?? {};
}
