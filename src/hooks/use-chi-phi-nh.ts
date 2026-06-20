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

// Subset thông tin NCC dùng để gắn vào NhaHangDetail.
interface NccBrief {
  id: number;
  ten: string | null;
  so_tai_khoan: string | null;
  ngan_hang: string | null;
}

export function useChiPhiNHSection(doanId?: number, doanNhomId?: number | null) {
  return useQuery({
    queryKey: ["chi_phi_nh_section", doanId, doanNhomId ?? null],
    enabled: !!doanId,
    queryFn: async (): Promise<NHSectionData> => {
      // 1. Load doan_ngay với NH (filter theo nhóm nếu truyền vào)
      let ngayQuery = externalSupabase
        .from("doan_ngay")
        .select("id, ngay_so, ngay_date, an_trua_nha_hang_id, an_toi_nha_hang_id, an_trua_set_menu_id, an_toi_set_menu_id")
        .eq("doan_id", doanId!)
        .order("ngay_so", { ascending: true });
      if (doanNhomId != null) ngayQuery = ngayQuery.eq("doan_nhom_id", doanNhomId);
      const { data: ngayRows, error: e1 } = await ngayQuery;
      if (e1) throw e1;

      // 2. Collect meals
      const rawMeals: NHMealRow[] = [];
      for (const r of ngayRows || []) {
        if (r.an_trua_nha_hang_id) {
          rawMeals.push({
            doan_ngay_id: r.id,
            ngay_so: r.ngay_so,
            ngay_date: r.ngay_date ?? "",
            bua_an: "trua",
            nha_hang_id: r.an_trua_nha_hang_id,
            set_menu_id: r.an_trua_set_menu_id ?? null,
            gia_set_menu: null,
          });
        }
        if (r.an_toi_nha_hang_id) {
          rawMeals.push({
            doan_ngay_id: r.id,
            ngay_so: r.ngay_so,
            ngay_date: r.ngay_date ?? "",
            bua_an: "toi",
            nha_hang_id: r.an_toi_nha_hang_id,
            set_menu_id: r.an_toi_set_menu_id ?? null,
            gia_set_menu: null,
          });
        }
      }

      // Dedup khi 2 nhóm cùng NH cùng bữa cùng ngày → Approach A merge ra 1 chi_phi.
      // Giữ doan_ngay_id THẤP NHẤT (nhóm save trước — match chi_phi.ref) để
      // lookup `ref_doan_ngay_id === meal.doan_ngay_id` trong use-nh-section tìm ra row.
      // (Trường hợp khác NH cùng bữa cùng ngày: key gồm nha_hang_id nên KHÔNG bị gộp.)
      const dedupMap = new Map<string, NHMealRow>();
      const sortedRaw = [...rawMeals].sort((a, b) => a.doan_ngay_id - b.doan_ngay_id);
      for (const m of sortedRaw) {
        const k = `${m.nha_hang_id}_${m.ngay_so}_${m.bua_an}`;
        if (!dedupMap.has(k)) dedupMap.set(k, m);
      }
      const meals = [...dedupMap.values()].sort(
        (a, b) => a.ngay_so - b.ngay_so || (a.bua_an === "trua" ? -1 : 1),
      );

      if (meals.length === 0) return { meals: [], nhaHangMap: {} };

      // 2b. Ưu tiên đọc gia_snapshot từ doan_booking_nh (lock per tour).
      //     Master nha_hang_set_menu.gia chỉ dùng fallback cho slot chưa có booking.
      const { data: bkList } = await externalSupabase
        .from("doan_booking_nh")
        .select("doan_ngay_id, bua_an, gia_snapshot")
        .eq("doan_id", doanId!);
      const bkMap = new Map<string, number | null>();
      (bkList || []).forEach((b) => {
        bkMap.set(`${b.doan_ngay_id}_${b.bua_an}`, b.gia_snapshot);
      });

      // Fallback master cho meals chưa có booking_nh row (vd: cascade chưa chạy)
      const needMasterFallback = meals.filter((m) => {
        if (!m.set_menu_id) return false;
        const snap = bkMap.get(`${m.doan_ngay_id}_${m.bua_an}`);
        return snap == null; // null hoặc undefined (chưa có row booking)
      });
      const fallbackSmIds = [...new Set(needMasterFallback.map((m) => m.set_menu_id!))];
      const smMap: Record<number, number | null> = {};
      if (fallbackSmIds.length > 0) {
        const { data: smList } = await externalSupabase
          .from("nha_hang_set_menu")
          .select("id, gia")
          .in("id", fallbackSmIds);
        (smList || []).forEach((s) => { smMap[s.id] = s.gia; });
      }

      meals.forEach((m) => {
        const snap = bkMap.get(`${m.doan_ngay_id}_${m.bua_an}`);
        if (snap != null) {
          m.gia_set_menu = snap;
        } else if (m.set_menu_id != null) {
          m.gia_set_menu = smMap[m.set_menu_id] ?? null;
        }
      });

      // 3. Load nha_hang info (gồm foc)
      const nhIds = [...new Set(meals.map((m) => m.nha_hang_id))];
      const { data: nhList, error: e2 } = await externalSupabase
        .from("nha_hang")
        .select("id, ten, dia_chi, thong_tin_chung, foc_khach, foc_mien, chiet_khau_phan_tram, nguoi_thanh_toan, tai_khoan_thanh_toan, nha_cung_cap_id, tinh_suat_tl")
        .in("id", nhIds);
      if (e2) throw e2;

      // 4. Load nha_cung_cap
      const nccIds = [
        ...new Set(
          (nhList || [])
            .map((n) => n.nha_cung_cap_id)
            .filter((id): id is number => id != null),
        ),
      ];
      const nccMap: Record<number, NccBrief> = {};
      if (nccIds.length > 0) {
        const { data: nccList } = await externalSupabase
          .from("nha_cung_cap")
          .select("id, ten, so_tai_khoan, ngan_hang")
          .in("id", nccIds);
        (nccList || []).forEach((n) => {
          nccMap[n.id] = n;
        });
      }

      const nhaHangMap: Record<number, NhaHangDetail> = {};
      (nhList || []).forEach((nh) => {
        const ncc = nh.nha_cung_cap_id ? nccMap[nh.nha_cung_cap_id] : null;
        nhaHangMap[nh.id] = {
          ...nh,
          ten: nh.ten ?? "",
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
