// Nhóm thông báo để mỗi người tự chọn loại nào muốn nhận.
//
// Lưu ở `user_roles.thong_bao_tat` — mảng tên NHÓM bị TẮT. Mảng rỗng hoặc NULL
// nghĩa là nhận tất cả, nên người cũ không đổi gì thì hành vi giữ nguyên.
// Lưu theo chiều "tắt" chứ không phải "bật" là có chủ ý: thêm loại thông báo mới
// sau này thì mọi người tự động nhận, không ai bị im lặng vì cấu hình cũ thiếu.
//
// ⚠️ Việc loại thông báo nào thuộc nhóm nào do hàm SQL `fn_nhom_thong_bao`
// quyết định (migration 20260910b_thong_bao_theo_nguoi.sql). Màn hình chỉ hiện
// tên nhóm, KHÔNG tự map lại, để không có hai bản luật lệch nhau.

export type NhomThongBao = "cong_viec" | "doan" | "lead" | "bao_gia" | "ke_toan";

export const NHOM_THONG_BAO: { key: NhomThongBao; ten: string; mo_ta: string }[] = [
  {
    key: "cong_viec",
    ten: "Công việc",
    mo_ta: "Được giao việc, người nhận cập nhật, bình luận, nhắc việc chưa xong",
  },
  {
    key: "doan",
    ten: "Đoàn",
    mo_ta: "Đoàn mới, đổi thông tin đoàn, hạn booking, sự cố, thay đổi giá",
  },
  {
    key: "lead",
    ten: "Khách tiềm năng",
    mo_ta: "Lead mới, lead lạnh, lead quá hạn, tin nhắn Facebook",
  },
  {
    key: "bao_gia",
    ten: "Báo giá & đối tác",
    mo_ta: "Đối tác gửi yêu cầu báo giá hoặc xin sửa chương trình",
  },
  {
    key: "ke_toan",
    ten: "Kế toán",
    mo_ta: "Đề nghị thanh toán chờ duyệt",
  },
];

const KEYS: string[] = NHOM_THONG_BAO.map((n) => n.key);

/** Chuẩn hoá giá trị đọc từ DB: bỏ tên nhóm lạ, bỏ trùng, giữ thứ tự khai báo. */
export function chuanHoaTat(thongBaoTat: string[] | null | undefined): NhomThongBao[] {
  if (!thongBaoTat?.length) return [];
  return NHOM_THONG_BAO.map((n) => n.key).filter((k) => thongBaoTat.includes(k));
}

/** Người này còn nhận nhóm thông báo đó không. Mặc định là có. */
export function dangNhan(nhom: NhomThongBao, thongBaoTat: string[] | null | undefined): boolean {
  return !chuanHoaTat(thongBaoTat).includes(nhom);
}

/**
 * Bật/tắt một nhóm, trả về giá trị mới cho `thong_bao_tat`.
 * `nhan = true` là muốn NHẬN nhóm đó, tức bỏ nó khỏi danh sách tắt.
 */
export function datTrangThai(
  nhom: NhomThongBao,
  nhan: boolean,
  thongBaoTat: string[] | null | undefined,
): NhomThongBao[] {
  const hienTai = chuanHoaTat(thongBaoTat);
  if (nhan) return hienTai.filter((k) => k !== nhom);
  return hienTai.includes(nhom) ? hienTai : chuanHoaTat([...hienTai, nhom]);
}

/** Câu tóm tắt cho danh sách người dùng, vd "Tắt: Đoàn, Khách tiềm năng". */
export function tomTatTat(thongBaoTat: string[] | null | undefined): string {
  const tat = chuanHoaTat(thongBaoTat);
  if (tat.length === 0) return "Nhận tất cả";
  if (tat.length === KEYS.length) return "Tắt hết thông báo";
  const ten = tat.map((k) => NHOM_THONG_BAO.find((n) => n.key === k)!.ten);
  return `Tắt: ${ten.join(", ")}`;
}
