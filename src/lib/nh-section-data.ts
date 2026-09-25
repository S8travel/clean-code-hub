// Dựng dữ liệu tab Chi phí Nhà hàng từ các bảng thô — thuần, không gọi DB.
//
// useChiPhiNHSection (hooks/use-chi-phi-nh.ts) tải theo 2 đợt song song rồi đưa
// vào đây. Trước kia hook gọi 5 lượt NỐI ĐUÔI (doan_ngay → booking → set menu →
// nhà hàng → NCC), mỗi lượt tốn thời gian mạng + xếp hàng sau các request khác của
// tab Chi phí → phần nhà hàng hiện "Đang tải" lâu nhất tab.

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
  /** Đoàn MỚI tự đánh dấu chi phí nhà hàng này là định kỳ — xem lib/nh-dinh-ky.ts */
  thanh_toan_dinh_ky_mac_dinh: boolean | null;
}

export interface NHSectionData {
  meals: NHMealRow[];
  nhaHangMap: Record<number, NhaHangDetail>;
}

export interface NgayBuaAnRow {
  id: number;
  ngay_so: number;
  ngay_date: string | null;
  an_trua_nha_hang_id: number | null;
  an_toi_nha_hang_id: number | null;
  an_trua_set_menu_id: number | null;
  an_toi_set_menu_id: number | null;
}

export interface BookingGiaRow {
  doan_ngay_id: number;
  bua_an: string;
  gia_snapshot: number | null;
}

/** Dòng nha_hang kèm NCC embed qua FK nha_cung_cap_id (null khi chưa gán NCC). */
export interface NhaHangVoiNcc {
  id: number;
  ten: string | null;
  dia_chi: string | null;
  thong_tin_chung: string | null;
  foc_khach: number | null;
  foc_mien: number | null;
  chiet_khau_phan_tram: number | null;
  nguoi_thanh_toan: string | null;
  tai_khoan_thanh_toan: string | null;
  nha_cung_cap_id: number | null;
  tinh_suat_tl: boolean | null;
  thanh_toan_dinh_ky_mac_dinh: boolean | null;
  nha_cung_cap: { ten: string | null; so_tai_khoan: string | null; ngan_hang: string | null } | null;
}

const bookingKey = (doanNgayId: number, bua: string) => `${doanNgayId}_${bua}`;

/**
 * Gom các bữa có nhà hàng từ doan_ngay (đã sắp theo ngay_so).
 * Gộp khi 2 nhóm cùng NH cùng bữa cùng ngày → 1 chi_phi (Approach A): giữ
 * doan_ngay_id THẤP NHẤT (nhóm save trước — khớp chi_phi.ref) để use-nh-section
 * tra `ref_doan_ngay_id === meal.doan_ngay_id` ra đúng dòng. Khác NH cùng bữa cùng
 * ngày thì key khác (gồm nha_hang_id) → KHÔNG gộp.
 */
export function gomBuaAnNhaHang(ngayRows: NgayBuaAnRow[]): NHMealRow[] {
  const rawMeals: NHMealRow[] = [];
  for (const r of ngayRows) {
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

  const dedupMap = new Map<string, NHMealRow>();
  const sortedRaw = [...rawMeals].sort((a, b) => a.doan_ngay_id - b.doan_ngay_id);
  for (const m of sortedRaw) {
    const k = `${m.nha_hang_id}_${m.ngay_so}_${m.bua_an}`;
    if (!dedupMap.has(k)) dedupMap.set(k, m);
  }
  return [...dedupMap.values()].sort(
    (a, b) => a.ngay_so - b.ngay_so || (a.bua_an === "trua" ? -1 : 1),
  );
}

/** doan_ngay_id + bữa → gia_snapshot của booking (giá lock per tour). */
export function mapGiaBooking(bookings: BookingGiaRow[]): Map<string, number | null> {
  const bkMap = new Map<string, number | null>();
  for (const b of bookings) bkMap.set(bookingKey(b.doan_ngay_id, b.bua_an), b.gia_snapshot);
  return bkMap;
}

/**
 * Set menu phải lấy giá master: bữa có set menu mà booking chưa có gia_snapshot
 * (null hoặc chưa có dòng booking — vd cascade chưa chạy).
 */
export function setMenuCanGiaMaster(meals: NHMealRow[], bkMap: Map<string, number | null>): number[] {
  const ids = meals
    .filter((m) => m.set_menu_id && bkMap.get(bookingKey(m.doan_ngay_id, m.bua_an)) == null)
    .map((m) => m.set_menu_id as number);
  return [...new Set(ids)];
}

/** Giá set menu mỗi bữa: ưu tiên snapshot booking, rồi mới tới giá master. */
export function ganGiaSetMenu(
  meals: NHMealRow[],
  bkMap: Map<string, number | null>,
  giaMaster: Record<number, number | null>,
): NHMealRow[] {
  return meals.map((m) => {
    const snap = bkMap.get(bookingKey(m.doan_ngay_id, m.bua_an));
    if (snap != null) return { ...m, gia_set_menu: snap };
    if (m.set_menu_id != null) return { ...m, gia_set_menu: giaMaster[m.set_menu_id] ?? null };
    return m;
  });
}

export function dungNhaHangMap(nhList: NhaHangVoiNcc[]): Record<number, NhaHangDetail> {
  const map: Record<number, NhaHangDetail> = {};
  for (const { nha_cung_cap: ncc, ...nh } of nhList) {
    map[nh.id] = {
      ...nh,
      ten: nh.ten ?? "",
      tai_khoan_thanh_toan: nh.tai_khoan_thanh_toan || null,
      ten_ncc: ncc?.ten || null,
      ncc_so_tai_khoan: ncc?.so_tai_khoan || null,
      ncc_ngan_hang: ncc?.ngan_hang || null,
    };
  }
  return map;
}

/** Bữa khách tự trả không vào chi phí công ty. */
export function locBuaKhachTra(meals: NHMealRow[], nhaHangMap: Record<number, NhaHangDetail>): NHMealRow[] {
  return meals.filter((m) => nhaHangMap[m.nha_hang_id]?.nguoi_thanh_toan !== "khach");
}
