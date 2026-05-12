import { useQuery } from "@tanstack/react-query";
import { externalSupabase } from "@/lib/supabase-external";

export interface NHMealRow {
  doan_ngay_id: number;
  ngay_so: number;
  ngay_date: string;
  bua_an: "trua" | "toi";
  nha_hang_id: number;
  set_menu_id: number | null;
  gia_set_menu: number | null;
}

export interface NhaHangDetail {
  id: number;
  ten: string;
  dia_chi: string | null;
  thong_tin_chung: string | null;
  foc_khach: number | null;
  foc_mien: number | null;
  chiet_khau_phan_tram: number | null;
  nguoi_thanh_toan: string | null;
  tai_khoan_thanh_toan: string | null;
  nha_cung_cap_id: number | null;
  ten_ncc: string | null;
  ncc_so_tai_khoan: string | null;
  ncc_ngan_hang: string | null;
  tinh_suat_tl: boolean | null;
}

export interface NHSectionData {
  meals: NHMealRow[];
  nhaHangMap: Record<number, NhaHangDetail>;
}

export function useChiPhiNHSection(doanId?: number) {
  return useQuery({
    queryKey: ["chi_phi_nh_section", doanId],
    enabled: !!doanId,
    queryFn: async (): Promise<NHSectionData> => {
      // 1. Load doan_ngay với NH
      const { data: ngayRows, error: e1 } = await externalSupabase
        .from("doan_ngay")
        .select("id, ngay_so, ngay_date, an_trua_nha_hang_id, an_toi_nha_hang_id, an_trua_set_menu_id, an_toi_set_menu_id")
        .eq("doan_id", doanId!)
        .order("ngay_so", { ascending: true });
      if (e1) throw e1;

      // 2. Collect meals
      const meals: NHMealRow[] = [];
      for (const r of ngayRows || []) {
        if (r.an_trua_nha_hang_id) {
          meals.push({
            doan_ngay_id: r.id,
            ngay_so: r.ngay_so,
            ngay_date: r.ngay_date,
            bua_an: "trua",
            nha_hang_id: r.an_trua_nha_hang_id,
            set_menu_id: r.an_trua_set_menu_id ?? null,
            gia_set_menu: null,
          });
        }
        if (r.an_toi_nha_hang_id) {
          meals.push({
            doan_ngay_id: r.id,
            ngay_so: r.ngay_so,
            ngay_date: r.ngay_date,
            bua_an: "toi",
            nha_hang_id: r.an_toi_nha_hang_id,
            set_menu_id: r.an_toi_set_menu_id ?? null,
            gia_set_menu: null,
          });
        }
      }

      if (meals.length === 0) return { meals: [], nhaHangMap: {} };

      // 2b. Load set menu prices
      const smIds = [...new Set(meals.filter((m) => m.set_menu_id).map((m) => m.set_menu_id!))];
      if (smIds.length > 0) {
        const { data: smList } = await externalSupabase
          .from("nha_hang_set_menu")
          .select("id, gia")
          .in("id", smIds);
        const smMap: Record<number, number | null> = {};
        (smList || []).forEach((s: any) => { smMap[s.id] = s.gia; });
        meals.forEach((m) => {
          if (m.set_menu_id != null) m.gia_set_menu = smMap[m.set_menu_id] ?? null;
        });
      }

      // 3. Load nha_hang info (gồm foc)
      const nhIds = [...new Set(meals.map((m) => m.nha_hang_id))];
      const { data: nhList, error: e2 } = await externalSupabase
        .from("nha_hang")
        .select("id, ten, dia_chi, thong_tin_chung, foc_khach, foc_mien, chiet_khau_phan_tram, nguoi_thanh_toan, tai_khoan_thanh_toan, nha_cung_cap_id, tinh_suat_tl")
        .in("id", nhIds);
      if (e2) throw e2;

      // 4. Load nha_cung_cap
      const nccIds = [
        ...new Set((nhList || []).filter((n: any) => n.nha_cung_cap_id).map((n: any) => n.nha_cung_cap_id)),
      ];
      let nccMap: Record<number, any> = {};
      if (nccIds.length > 0) {
        const { data: nccList } = await externalSupabase
          .from("nha_cung_cap")
          .select("id, ten, so_tai_khoan, ngan_hang")
          .in("id", nccIds);
        (nccList || []).forEach((n: any) => {
          nccMap[n.id] = n;
        });
      }

      const nhaHangMap: Record<number, NhaHangDetail> = {};
      (nhList || []).forEach((nh: any) => {
        const ncc = nh.nha_cung_cap_id ? nccMap[nh.nha_cung_cap_id] : null;
        nhaHangMap[nh.id] = {
          ...nh,
          tai_khoan_thanh_toan: nh.tai_khoan_thanh_toan || null,
          ten_ncc: ncc?.ten || null,
          ncc_so_tai_khoan: ncc?.so_tai_khoan || null,
          ncc_ngan_hang: ncc?.ngan_hang || null,
        };
      });

      const filteredMeals = meals.filter(
        (m) => nhaHangMap[m.nha_hang_id]?.nguoi_thanh_toan !== "khach"
      );
      return { meals: filteredMeals, nhaHangMap };
    },
  });
}

export interface CanhDiemInfo {
  id: number;
  ten: string;
  loai: string | null;
  co_phi: boolean | null;
  gia_mac_dinh: number | null;
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
        .select("id, canh_diem:canh_diem_id(id, ten, loai, co_phi, gia_mac_dinh, dia_diem, ghi_chu, thong_tin_chung, so_dien_thoai, email, nguoi_thanh_toan)")
        .eq("doan_id", doanId!);
      if (error) throw error;
      const map: Record<number, CanhDiemInfo> = {};
      for (const item of (data ?? []) as any[]) {
        if (item.id && item.canh_diem) {
          map[item.id] = item.canh_diem as CanhDiemInfo;
        }
      }
      return map;
    },
  });
  return data ?? {};
}
