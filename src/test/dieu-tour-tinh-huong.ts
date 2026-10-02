// Các tình huống lưu Điều tour, dùng chung cho test (use-dieu-tour.luu.test.ts).
// Mỗi tình huống: sửa DB ban đầu (nếu cần) + dựng payload như màn hình gửi lên.
import type { SaveDieuTourPayload } from "@/hooks/use-dieu-tour";
import { taoPayload, taoDays, canhDiemList } from "./dieu-tour-fixture";

type Row = Record<string, unknown>;

export interface TinhHuong {
  ten: string;
  chuanBi?: (db: Record<string, Row[]>) => void;
  payload: () => SaveDieuTourPayload;
}

const suaNgay = (ngaySo: number, sua: (d: ReturnType<typeof taoDays>[number]) => void) => {
  const days = taoDays();
  sua(days.find((d) => d.ngay_so === ngaySo)!);
  return days;
};

export const TINH_HUONG: TinhHuong[] = [
  { ten: "lưu lại y nguyên", payload: () => taoPayload() },
  {
    ten: "đổi nhà hàng trưa ngày 2 (booking chưa gửi bị xoá, chi phí cũ thành mồ côi)",
    payload: () => taoPayload({ days: suaNgay(2, (d) => { d.an_trua_nha_hang_id = 12; }) }),
  },
  {
    ten: "thêm cảnh điểm ngày 1, gỡ cảnh điểm ngày 3",
    payload: () => {
      const days = taoDays();
      days[0].items.push({ canh_diem_id: 5, thu_tu: 3 });
      days[2].items = [];
      return taoPayload({ days });
    },
  },
  {
    ten: "đổi số khách 20 → 25",
    payload: () => taoPayload({
      soKhach: 25,
      doanFields: { ...taoPayload().doanFields, so_khach_lon: 25 },
    }),
  },
  {
    ten: "đổi khách sạn ngày 2 sang KS mới",
    payload: () => taoPayload({ days: suaNgay(2, (d) => { d.khach_san_id = 902; }) }),
  },
  {
    ten: "cả đoàn chuyển sang KS khách tự trả (booking chưa gửi bị xoá)",
    payload: () => {
      const days = taoDays();
      days[0].khach_san_id = 901;
      days[1].khach_san_id = 901;
      return taoPayload({ days });
    },
  },
  {
    ten: "đổi set menu trưa ngày 1",
    payload: () => taoPayload({ days: suaNgay(1, (d) => { d.an_trua_set_menu_id = 51; }) }),
  },
  {
    ten: "ngày 2 bỏ hết cảnh điểm",
    payload: () => taoPayload({ days: suaNgay(2, (d) => { d.items = []; }) }),
  },
  {
    ten: "nhóm 2 có cùng cảnh điểm ngày 1 → chi phí gộp số khách cả hai nhóm",
    chuanBi: (db) => {
      db.doan_ngay.push({ ...db.doan_ngay[0], id: 111, doan_nhom_id: 11, an_trua_nha_hang_id: null, an_trua_set_menu_id: null, an_toi_nha_hang_id: null, khach_san_id: null });
      db.doan_ngay_item.push({ ...db.doan_ngay_item[0], id: 1101, doan_ngay_id: 111, so_luong: 5 });
      const cpNgay1 = db.doan_chi_phi.find((r) => r.id === 2001)!;
      Object.assign(cpNgay1, { so_luong: 25, tien_cong_ty: 7500000 });
    },
    payload: () => taoPayload(),
  },
  {
    ten: "lưu nhóm 2 với số khách khác → chi phí gộp tính lại",
    chuanBi: (db) => {
      db.doan_ngay.push({ ...db.doan_ngay[0], id: 111, doan_nhom_id: 11, an_trua_nha_hang_id: null, an_trua_set_menu_id: null, an_toi_nha_hang_id: null, khach_san_id: null });
      db.doan_ngay_item.push({ ...db.doan_ngay_item[0], id: 1101, doan_ngay_id: 111, so_luong: 5 });
      Object.assign(db.doan_chi_phi.find((r) => r.id === 2001)!, { so_luong: 25, tien_cong_ty: 7500000 });
    },
    payload: () => taoPayload({
      doanNhomId: 11,
      soKhach: 6,
      days: [{ ...taoDays()[0], id: 111, an_trua_nha_hang_id: null, an_trua_set_menu_id: null, an_toi_nha_hang_id: null, khach_san_id: null, items: [{ canh_diem_id: 1, thu_tu: 1 }] }],
    }),
  },
  {
    ten: "chi phí OP đã sửa tay (is_overridden) + đổi tên cảnh điểm trong danh mục",
    chuanBi: (db) => {
      Object.assign(db.doan_chi_phi.find((r) => r.id === 2001)!, { is_overridden: true, so_luong: 18, tien_cong_ty: 5400000 });
    },
    payload: () => taoPayload({
      canhDiemList: canhDiemList.map((c) => (c.id === 1 ? { ...c, ten: "Vịnh Hạ Long (tàu)" } : c)),
    }),
  },
  {
    ten: "nhà hàng không có trong danh mục cả trưa lẫn tối (mo_ta rỗng trùng nhau)",
    payload: () => taoPayload({
      days: suaNgay(3, (d) => { d.an_trua_nha_hang_id = 99; d.an_toi_nha_hang_id = 98; }),
    }),
  },
  {
    ten: "đổi bảng đón (trường của đoàn)",
    payload: () => taoPayload({ doanFields: { ...taoPayload().doanFields, bang_don: "S8 TRAVEL" } }),
  },
  {
    ten: "thêm ngày 4 mới (chưa có id) có cảnh điểm + nhà hàng",
    payload: () => {
      const days = taoDays();
      days.push({
        ngay_so: 4, ngay_date: "2026-10-08", thu: "T5", thanh_pho: "Sapa",
        an_trua_nha_hang_id: 11, an_toi_nha_hang_id: null, an_trua_set_menu_id: null, an_toi_set_menu_id: null,
        an_trua_ghi_chu: "", an_toi_ghi_chu: "", khach_san_id: 902, ks_ma_code: "", ks_loai_phong: "",
        items: [{ canh_diem_id: 5, thu_tu: 1 }],
      });
      return taoPayload({ days });
    },
  },
  {
    ten: "sửa ghi chú cảnh điểm + thành phố ngày 1",
    payload: () => taoPayload({
      days: suaNgay(1, (d) => { d.thanh_pho = "Hạ Long"; d.items[1] = { ...d.items[1], ghi_chu: "mua vé tại cổng" }; }),
    }),
  },
  {
    ten: "đảo thứ tự cảnh điểm ngày 1",
    payload: () => taoPayload({ days: suaNgay(1, (d) => { d.items = [d.items[1], d.items[0]]; }) }),
  },
  {
    ten: "danh mục đổi NCC + người trả của cảnh điểm (cascade master metadata)",
    payload: () => taoPayload({
      canhDiemList: canhDiemList.map((c) => (c.id === 1 ? { ...c, nha_cung_cap_id: 55, nguoi_thanh_toan: "hdv" } : c)),
    }),
  },
  {
    // Nhánh "remainingItems": chỉ chạy khi câu NOT IN không bắt được dòng nào khác.
    ten: "ngày chỉ còn dòng cảnh điểm canh_diem_id NULL sót lại, bỏ hết cảnh điểm",
    chuanBi: (db) => {
      db.doan_ngay_item = db.doan_ngay_item.filter((r) => r.id !== 1004);
      db.doan_chi_phi = db.doan_chi_phi.filter((r) => r.id !== 2003);
      db.doan_ngay_item.push({ id: 1099, doan_id: 1, doan_ngay_id: 103, canh_diem_id: null, thu_tu: 9, co_phi: false, don_gia: 0, so_luong: 20, nguoi_thanh_toan: null, ghi_chu: null });
    },
    payload: () => taoPayload({ days: suaNgay(3, (d) => { d.items = []; }) }),
  },
  {
    ten: "ngày có cả dòng NULL lẫn cảnh điểm thật, bỏ hết cảnh điểm (dòng NULL ở lại — như bản gốc)",
    chuanBi: (db) => {
      db.doan_ngay_item.push({ id: 1099, doan_id: 1, doan_ngay_id: 103, canh_diem_id: null, thu_tu: 9, co_phi: false, don_gia: 0, so_luong: 20, nguoi_thanh_toan: null, ghi_chu: null });
    },
    payload: () => taoPayload({ days: suaNgay(3, (d) => { d.items = []; }) }),
  },
  {
    ten: "thêm dòng ghi chú tự do ngày 1 (đầu ngày + cuối ngày)",
    payload: () => taoPayload({
      days: suaNgay(1, (d) => {
        d.items = [
          { canh_diem_id: 0, thu_tu: 0, dong_ghi_chu: "Bay VN1823 HAN→PQC 07:00" },
          ...d.items,
          { canh_diem_id: 0, thu_tu: 0, dong_ghi_chu: "  19:00 Gala dinner  " },
          { canh_diem_id: 0, thu_tu: 0, dong_ghi_chu: "   " },
        ];
      }),
    }),
  },
  {
    ten: "lưu lại y nguyên khi ngày đã có dòng ghi chú",
    chuanBi: (db) => {
      // jsonb trả khoá theo độ dài tên: "sau" trước "noi_dung".
      Object.assign(db.doan_ngay[0], { dong_ghi_chu: [{ sau: 0, noi_dung: "Bay VN1823" }, { sau: 1, noi_dung: "Tự do" }] });
    },
    payload: () => taoPayload({
      days: suaNgay(1, (d) => {
        d.items = [
          { canh_diem_id: 0, thu_tu: 0, dong_ghi_chu: "Bay VN1823" },
          d.items[0],
          { canh_diem_id: 0, thu_tu: 0, dong_ghi_chu: "Tự do" },
          d.items[1],
        ];
      }),
    }),
  },
  {
    ten: "KS từng hủy (da_huy) quay lại tour",
    chuanBi: (db) => {
      Object.assign(db.doan_booking_ks[0], { trang_thai: "da_huy" });
    },
    payload: () => taoPayload(),
  },
];
