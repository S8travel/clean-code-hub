// Dữ liệu mẫu cho test chạy useSaveDieuTour THẬT trên PostgREST giả (fake-postgrest.ts).
// Trạng thái DB ban đầu được dựng ĐÚNG như vừa lưu xong một lần: lưu lại y nguyên thì
// không có gì phải đổi. Mỗi tình huống test sửa `days` / danh mục từ bản gốc này.
import type { CanhDiemItem, NhaHangItem, KhachSanItem, DayLocal, SaveDieuTourPayload } from "@/hooks/use-dieu-tour";

type Row = Record<string, unknown>;

const cd = (p: Partial<CanhDiemItem> & { id: number; ten: string }): CanhDiemItem => ({
  loai: "canh_diem", co_phi: false, gia_mac_dinh: 0, foc_khach: null, foc_mien: null,
  nguoi_thanh_toan: null, icon: null, dia_diem: null, so_dien_thoai: null, email: null,
  khach_san_id: null, ghi_chu: null, nha_cung_cap_id: null, bao_gom_bua_an: null,
  khong_can_booking: null, ...p,
});
const nh = (p: Partial<NhaHangItem> & { id: number; ten: string }): NhaHangItem => ({
  dia_chi: null, thong_tin_chung: null, nguoi_thanh_toan: "cong_ty", so_dien_thoai: null,
  nha_cung_cap_id: null, foc_khach: null, foc_mien: null, chiet_khau_phan_tram: null,
  thanh_toan_dinh_ky_mac_dinh: null, ...p,
});
const ks = (id: number, ten: string): KhachSanItem => ({
  id, ten, dia_chi: null, thong_tin_chung: null, so_dien_thoai: null, foc_khach: null, foc_mien: null,
});

export const canhDiemList: CanhDiemItem[] = [
  cd({ id: 1, ten: "Vịnh Hạ Long", co_phi: true, gia_mac_dinh: 300000, nguoi_thanh_toan: "cong_ty", nha_cung_cap_id: 5 }),
  cd({ id: 2, ten: "Phố cổ" }),
  cd({ id: 3, ten: "Show Ký ức", co_phi: true, gia_mac_dinh: 600000, foc_khach: 15, foc_mien: 1, nguoi_thanh_toan: "hdv", nha_cung_cap_id: 6 }),
  cd({ id: 4, ten: "Day use KS A", co_phi: true, khach_san_id: 900 }),
  cd({ id: 5, ten: "Cáp treo", co_phi: true, gia_mac_dinh: 500000, nguoi_thanh_toan: "cong_ty", nha_cung_cap_id: 8 }),
];
export const nhaHangList: NhaHangItem[] = [
  nh({ id: 11, ten: "NH SEN", nha_cung_cap_id: 7, foc_khach: 16, foc_mien: 1, chiet_khau_phan_tram: 10 }),
  nh({ id: 12, ten: "NH DAO", nha_cung_cap_id: 9 }),
  nh({ id: 13, ten: "NH VUON" }),
];
export const khachSanList: KhachSanItem[] = [ks(900, "KS A"), ks(901, "KS B"), ks(902, "KS C")];

const doanFields = {
  bang_don: "S8", shopping: false, truong_doan: null, chuyen_bay_don: "VN123", chuyen_bay_tien: null,
  so_khach_lon: 20, so_khach_em1: 0, so_khach_em2: 0, so_khach_tl: 0,
  co_tinh_suat_tl_nha_hang: false, chu_thich_khach: null, tang_pham: null, ghi_chu_dieu_tour: null,
  thu_tip: true, tip_rate: 3, tip_so_ngay_override: null, tip_so_khach_override: null, tip_lump_sum: null,
};

const ngay = (id: number, ngay_so: number, p: Partial<Row> = {}, nhom = 10): Row => ({
  id, doan_id: 1, doan_nhom_id: nhom, ngay_so, ngay_date: `2026-10-0${4 + ngay_so}`, thu: `T${1 + ngay_so}`,
  thanh_pho: "Hà Nội", an_trua_nha_hang_id: null, an_toi_nha_hang_id: null, an_trua_set_menu_id: null,
  an_toi_set_menu_id: null, an_trua_ghi_chu: null, an_toi_ghi_chu: null, khach_san_id: null,
  ks_ma_code: null, ks_loai_phong: null, ...p,
});
const item = (id: number, doan_ngay_id: number, canh_diem_id: number, thu_tu: number, p: Partial<Row> = {}): Row => {
  const c = canhDiemList.find((x) => x.id === canh_diem_id)!;
  return {
    id, doan_id: 1, doan_ngay_id, canh_diem_id, thu_tu, co_phi: c.co_phi ?? false,
    don_gia: c.gia_mac_dinh ?? 0, so_luong: 20, nguoi_thanh_toan: c.nguoi_thanh_toan ?? null, ghi_chu: null, ...p,
  };
};
const cp = (id: number, p: Row): Row => ({
  id, doan_id: 1, loai: "chi", is_overridden: false, thanh_tien_thuc_te: null, so_tien_da_tt: 0,
  foc_khach_snapshot: null, foc_mien_snapshot: null, tien_cong_ty: 0, tien_hdv: 0,
  ref_doan_ngay_item_id: null, ...p,
});

/** DB ban đầu: đoàn 1, nhóm 10 (toàn đoàn) có 3 ngày; nhóm 11 trống (dùng khi cần). */
export function taoDb(): Record<string, Row[]> {
  return {
    doan: [{ id: 1, so_khach: 20, ...doanFields }],
    doan_nhom: [{ id: 10, doan_id: 1, thu_tu: 1 }, { id: 11, doan_id: 1, thu_tu: 2 }],
    doan_ngay: [
      ngay(101, 1, { an_trua_nha_hang_id: 11, an_trua_set_menu_id: 50, an_toi_nha_hang_id: 12, khach_san_id: 900 }),
      ngay(102, 2, { an_trua_nha_hang_id: 13, khach_san_id: 900 }),
      ngay(103, 3, { an_toi_nha_hang_id: 11 }),
    ],
    doan_ngay_item: [
      item(1001, 101, 1, 1),
      item(1002, 101, 2, 2),
      item(1003, 102, 3, 1),
      item(1004, 103, 1, 1),
    ],
    doan_chi_phi: [
      cp(2001, { ngay_so: 1, danh_muc: "canh_diem", ref_doan_ngay_item_id: 1001, ref_doan_ngay_id: 101, mo_ta: "Vịnh Hạ Long", nha_cung_cap_id: 5, so_luong: 20, don_gia: 300000, tien_cong_ty: 6000000 }),
      // FOC 15 miễn 1: 20 khách → tính 19
      cp(2002, { ngay_so: 2, danh_muc: "canh_diem", ref_doan_ngay_item_id: 1003, ref_doan_ngay_id: 102, mo_ta: "Show Ký ức", nha_cung_cap_id: 6, so_luong: 20, don_gia: 600000, tien_hdv: 11400000, foc_khach_snapshot: 15, foc_mien_snapshot: 1 }),
      cp(2003, { ngay_so: 3, danh_muc: "canh_diem", ref_doan_ngay_item_id: 1004, ref_doan_ngay_id: 103, mo_ta: "Vịnh Hạ Long", nha_cung_cap_id: 5, so_luong: 20, don_gia: 300000, tien_cong_ty: 6000000 }),
      cp(2101, { ngay_so: 1, danh_muc: "nha_hang", ref_doan_ngay_id: 101, mo_ta: "NH SEN (trưa)", nha_cung_cap_id: 7 }),
      cp(2102, { ngay_so: 1, danh_muc: "nha_hang", ref_doan_ngay_id: 101, mo_ta: "NH DAO (tối)", nha_cung_cap_id: 9 }),
      cp(2103, { ngay_so: 2, danh_muc: "nha_hang", ref_doan_ngay_id: 102, mo_ta: "NH VUON (trưa)", nha_cung_cap_id: null }),
      cp(2104, { ngay_so: 3, danh_muc: "nha_hang", ref_doan_ngay_id: 103, mo_ta: "NH SEN (tối)", nha_cung_cap_id: 7 }),
    ],
    doan_booking_nh: [
      { id: 3001, doan_id: 1, doan_ngay_id: 101, bua_an: "trua", nha_hang_id: 11, booking_status: "chua_gui", set_menu_id: 50, ten_set_snapshot: "Set A", gia_snapshot: 200000, don_vi_snapshot: "khách", mon_an_snapshot: ["Phở"] },
      { id: 3002, doan_id: 1, doan_ngay_id: 101, bua_an: "toi", nha_hang_id: 12, booking_status: "da_gui", set_menu_id: null },
      { id: 3003, doan_id: 1, doan_ngay_id: 102, bua_an: "trua", nha_hang_id: 13, booking_status: "chua_gui", set_menu_id: null },
    ],
    doan_booking_ks: [
      { id: 4001, doan_id: 1, khach_san_id: 900, ks_dat_truoc_status: "chua_gui", ks_final_status: "chua_gui", trang_thai: "active", ks_dat_truoc: null, ks_final: null },
    ],
    khach_san: [
      { id: 900, nguoi_thanh_toan: "cong_ty" }, { id: 901, nguoi_thanh_toan: "khach" }, { id: 902, nguoi_thanh_toan: "cong_ty" },
    ],
    nha_hang_set_menu: [
      { id: 50, nha_hang_id: 11, ten_set: "Set A", gia: 200000, don_vi: "khách" },
      { id: 51, nha_hang_id: 11, ten_set: "Set B", gia: 250000, don_vi: "khách" },
    ],
    nha_hang_set_menu_mon: [
      { id: 1, set_menu_id: 50, ten_mon: "Phở", thu_tu: 1 },
      { id: 2, set_menu_id: 51, ten_mon: "Bún chả", thu_tu: 1 },
      { id: 3, set_menu_id: 51, ten_mon: "Nem", thu_tu: 2 },
    ],
  };
}

/** `days` trên màn hình khớp đúng DB ban đầu (như mergeDaysWithDB dựng). */
export function taoDays(): DayLocal[] {
  const d = (id: number, ngay_so: number, p: Partial<DayLocal>): DayLocal => ({
    id, ngay_so, ngay_date: `2026-10-0${4 + ngay_so}`, thu: `T${1 + ngay_so}`, thanh_pho: "Hà Nội",
    an_trua_nha_hang_id: null, an_toi_nha_hang_id: null, an_trua_set_menu_id: null, an_toi_set_menu_id: null,
    an_trua_ghi_chu: "", an_toi_ghi_chu: "", khach_san_id: null, ks_ma_code: "", ks_loai_phong: "", items: [], ...p,
  });
  return [
    d(101, 1, {
      an_trua_nha_hang_id: 11, an_trua_set_menu_id: 50, an_toi_nha_hang_id: 12, khach_san_id: 900,
      items: [{ canh_diem_id: 1, thu_tu: 1 }, { canh_diem_id: 2, thu_tu: 2 }],
    }),
    d(102, 2, { an_trua_nha_hang_id: 13, khach_san_id: 900, items: [{ canh_diem_id: 3, thu_tu: 1 }] }),
    d(103, 3, { an_toi_nha_hang_id: 11, items: [{ canh_diem_id: 1, thu_tu: 1 }] }),
  ];
}

export function taoPayload(p: Partial<SaveDieuTourPayload> = {}): SaveDieuTourPayload {
  return {
    doanId: 1, doanNhomId: 10, doanFields: { ...doanFields }, days: taoDays(), soKhach: 20,
    canhDiemList, nhaHangList, khachSanList, ...p,
  };
}
