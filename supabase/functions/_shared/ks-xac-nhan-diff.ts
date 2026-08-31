// So sánh hai bản 飯店確認單 để biết lần đẩy này có gì đổi so với bản đối tác
// đang cầm. Tách riêng khỏi edge function để test được.
//
// VÌ SAO PHẢI CÓ: đối tác in bản xác nhận gửi cho khách của họ. Khách sạn đổi,
// số phòng đổi, ngày trả phòng lùi một hôm — nếu cổng cứ âm thầm ghi đè thì đối
// tác đang cầm tờ giấy sai mà không ai biết. Mỗi lần nội dung khác đi, push-portal
// tạo một PHIÊN BẢN mới kèm danh sách thay đổi này; cổng hiện 變更紀錄.
//
// Trả về dữ liệu CÓ CẤU TRÚC chứ không phải câu tiếng Việt dựng sẵn: cổng có 3
// ngôn ngữ (zh-TW / vi / en), câu chữ phải dựng ở tầng hiển thị.

export interface DemKS {
  ngay: string | null;
  /** Ô phòng của đêm đó, NGUYÊN VĂN OP gõ: "10 twn", "5 cabin ( 4 nguoi 1 cabin )".
   *  Free text chứ không phải mã có cấu trúc — đây là thứ khách sạn đọc. */
  phong: string | null;
}

export interface KhachSanXacNhan {
  ten: string | null;
  dia_diem?: string | null;
  dia_chi?: string | null;
  dien_thoai?: string | null;
  ma_code?: string | null;
  nhan_phong?: string | null;
  tra_phong?: string | null;
  dem?: DemKS[] | null;
}

export interface BanXacNhan {
  version: number;
  khach_san: KhachSanXacNhan[];
}

export type KieuThayDoi =
  | "them_ks"        // thêm một khách sạn vào bản xác nhận
  | "bo_ks"          // khách sạn không còn trong bản xác nhận
  | "doi_ngay"       // đổi ngày nhận / trả phòng
  | "doi_ma_code"
  | "doi_dia_diem"
  | "doi_dia_chi"
  | "doi_dien_thoai"
  | "doi_phong";     // đổi loại phòng / số phòng của một đêm

export interface ThayDoi {
  kieu: KieuThayDoi;
  /** Tên khách sạn — khoá nhận diện, cũng là thứ hiện đầu dòng log. */
  ks: string;
  /** Ngày của đêm bị đổi (chỉ với doi_phong), dạng ISO. */
  ngay?: string;
  /** Giá trị cũ. Với doi_ngay là "<nhận>~<trả>" (ISO), rỗng nghĩa là chưa có. */
  tu?: string;
  /** Giá trị mới. */
  den?: string;
}

const khoangNgay = (ks: KhachSanXacNhan): string =>
  `${ks.nhan_phong ?? ""}~${ks.tra_phong ?? ""}`;

// Khoá nhận diện khách sạn = TÊN. Đổi tên khách sạn sẽ hiện thành "bỏ A, thêm B"
// chứ không phải "đổi tên" — chấp nhận được: với đối tác thì ở khách sạn khác
// đúng là một thay đổi cần đọc kỹ, không phải chuyện đổi nhãn.
const khoa = (ks: KhachSanXacNhan): string => (ks.ten ?? "").trim();

const chuoi = (v: string | null | undefined): string => (v ?? "").trim();

/** Map ngày → tóm tắt phòng, cho một khách sạn. */
function demTheoNgay(ks: KhachSanXacNhan): Map<string, string> {
  const m = new Map<string, string>();
  for (const d of ks.dem ?? []) {
    if (!d?.ngay) continue;
    m.set(d.ngay, chuoi(d.phong));
  }
  return m;
}

function soSanhMotKS(cu: KhachSanXacNhan, moi: KhachSanXacNhan): ThayDoi[] {
  const ks = khoa(moi);
  const ra: ThayDoi[] = [];

  const truong: Array<[KieuThayDoi, string, string]> = [
    ["doi_ngay", khoangNgay(cu), khoangNgay(moi)],
    ["doi_ma_code", chuoi(cu.ma_code), chuoi(moi.ma_code)],
    ["doi_dia_diem", chuoi(cu.dia_diem), chuoi(moi.dia_diem)],
    ["doi_dia_chi", chuoi(cu.dia_chi), chuoi(moi.dia_chi)],
    ["doi_dien_thoai", chuoi(cu.dien_thoai), chuoi(moi.dien_thoai)],
  ];
  for (const [kieu, tu, den] of truong) {
    if (tu !== den) ra.push({ kieu, ks, tu, den });
  }

  const demCu = demTheoNgay(cu);
  const demMoi = demTheoNgay(moi);
  // Duyệt hợp của hai tập ngày: đêm bị bỏ hẳn cũng phải hiện, không chỉ đêm đổi số.
  for (const ngay of [...new Set([...demCu.keys(), ...demMoi.keys()])].sort()) {
    const tu = demCu.get(ngay) ?? "";
    const den = demMoi.get(ngay) ?? "";
    if (tu !== den) ra.push({ kieu: "doi_phong", ks, ngay, tu, den });
  }

  return ra;
}

/**
 * Danh sách thay đổi giữa bản đối tác đang có (`cu`) và bản vừa dựng (`moi`).
 * Mảng rỗng = không có gì đổi → push-portal KHÔNG tạo phiên bản mới.
 *
 * `cu = null` (lần đầu có bản xác nhận) cũng trả rỗng: phiên bản 1 không phải là
 * một "thay đổi", nó là điểm bắt đầu.
 */
export function soSanhXacNhan(cu: BanXacNhan | null | undefined, moi: BanXacNhan): ThayDoi[] {
  if (!cu) return [];

  const mapCu = new Map<string, KhachSanXacNhan>();
  for (const k of cu.khach_san ?? []) if (khoa(k)) mapCu.set(khoa(k), k);
  const mapMoi = new Map<string, KhachSanXacNhan>();
  for (const k of moi.khach_san ?? []) if (khoa(k)) mapMoi.set(khoa(k), k);

  const ra: ThayDoi[] = [];

  // Thứ tự đọc: bỏ trước, thêm sau, rồi tới sửa — người đọc cần thấy ngay khách
  // sạn nào biến mất, đó là thay đổi nặng nhất.
  for (const [ten, k] of mapCu) {
    if (!mapMoi.has(ten)) ra.push({ kieu: "bo_ks", ks: ten, tu: khoangNgay(k) });
  }
  for (const [ten, k] of mapMoi) {
    if (!mapCu.has(ten)) ra.push({ kieu: "them_ks", ks: ten, den: khoangNgay(k) });
  }
  for (const [ten, k] of mapMoi) {
    const truoc = mapCu.get(ten);
    if (truoc) ra.push(...soSanhMotKS(truoc, k));
  }

  return ra;
}
