// So hai bản chào của cùng một báo giá để trả lời đúng một câu: "bản này khác
// bản trước ở chỗ nào?".
//
// VÌ SAO PHẢI CÓ: đối tác in bảng giá gửi cho khách của họ. Mình chào lại lần 2,
// lần 3 — nếu cổng chỉ đổi con số thì họ đang cầm tờ giấy khác với thứ đang treo
// trên cổng mà không ai biết. Cùng bài học với 飯店確認單 (ks-xac-nhan-diff).
//
// CHỈ SO LỚP CHÀO. Lớp vốn (đơn giá từng dịch vụ, tỷ giá, lợi nhuận) nằm ở cột
// khác bên CRM và KHÔNG BAO GIỜ đi qua đây — đối tác được biết giá đổi bao nhiêu,
// không được biết đổi vì bớt lãi hay vì đổi khách sạn.
//
// Trả về dữ liệu CÓ CẤU TRÚC chứ không phải câu dựng sẵn: cổng có 3 ngôn ngữ,
// câu chữ phải dựng ở tầng hiển thị.

export interface BacGia {
  label: string;
  price_usd: number;
}

export interface KhachSanNgay {
  ngay: number;
  ten: string;
}

/** Đúng phần đối tác nhìn thấy trong một bản chào. */
export interface NoiDungChao {
  ten_chuong_trinh?: string;
  so_ngay?: number;
  brackets?: BacGia[];
  single_supplement_usd?: number;
  hotel_days?: KhachSanNgay[];
  included?: string[];
  excluded?: string[];
  notes?: string[];
}

/** Bản chào đã đóng băng (bao_gia_phien_ban.noi_dung_chao). */
export interface BanChao {
  hieu_luc_den?: string | null;
  noi_dung?: NoiDungChao | null;
}

export type KieuThayDoiChao =
  | "gia"          // một bậc khách đổi giá
  | "them_bac"     // bảng giá có thêm bậc khách
  | "bo_bac"       // bảng giá bỏ một bậc khách
  | "don_phong"    // 單房差
  | "khach_san"    // khách sạn của một ngày
  | "so_ngay"
  | "ten_ct"
  | "hieu_luc"     // hạn hiệu lực của bản chào
  | "them_dong"    // thêm một dòng trong 包含 / 不含 / 備註
  | "bo_dong";

export interface ThayDoiChao {
  kieu: KieuThayDoiChao;
  /** Nhãn bậc khách, vd "16-19 pax". */
  bac?: string;
  /** Ngày thứ mấy (với kiểu khach_san). */
  ngay?: number;
  /** Mục nào của bản chào: bao_gom | khong_bao_gom | ghi_chu. */
  muc?: "bao_gom" | "khong_bao_gom" | "ghi_chu";
  tu?: string;
  den?: string;
}

/**
 * Cắt ở đây để một bản chào viết lại toàn bộ phần 包含/不含 không đẻ ra danh sách
 * trăm dòng — đối tác đọc không nổi mà cột jsonb cũng phình vô ích.
 */
export const TOI_DA_THAY_DOI = 40;

const chuoi = (v: unknown): string => (v == null ? "" : String(v)).trim();

/** Dòng văn bản đã chuẩn hoá để đối chiếu — thừa khoảng trắng không tính là đổi. */
const gonDong = (ds: string[] | undefined): string[] =>
  (ds ?? []).map((d) => chuoi(d)).filter((d) => d.length > 0);

function soSanhDanhSach(
  cu: string[] | undefined,
  moi: string[] | undefined,
  muc: NonNullable<ThayDoiChao["muc"]>,
  ra: ThayDoiChao[],
): void {
  const a = gonDong(cu);
  const b = gonDong(moi);
  // So theo TẬP HỢP, không theo thứ tự: đảo chỗ hai dòng 包含 không phải là thay
  // đổi nội dung, mà báo ra thì đối tác mất công đọc lại cả bản.
  const tapA = new Set(a);
  const tapB = new Set(b);
  for (const d of a) if (!tapB.has(d)) ra.push({ kieu: "bo_dong", muc, tu: d });
  for (const d of b) if (!tapA.has(d)) ra.push({ kieu: "them_dong", muc, den: d });
}

/**
 * So bản trước với bản sau. Trả về đúng những thứ đã đổi, không kể lể phần giống.
 *
 * `cu` rỗng (bản chào đầu tiên) → trả về mảng rỗng: bản đầu không "khác" gì cả,
 * nó là điểm bắt đầu. Cùng quy ước với 變更紀錄 của 飯店確認單.
 */
export function soSanhBanChao(
  cu: BanChao | null | undefined,
  moi: BanChao | null | undefined,
): ThayDoiChao[] {
  if (!cu || !moi) return [];
  const a = cu.noi_dung ?? {};
  const b = moi.noi_dung ?? {};
  const ra: ThayDoiChao[] = [];

  // ── Bậc giá ───────────────────────────────────────────────────────────────
  // Khoá là NHÃN bậc ("16-19 pax"). Đổi cách chia bậc sẽ hiện thành bỏ một bậc +
  // thêm một bậc — đúng thứ đã xảy ra, và dễ đọc hơn là đoán bậc nào ứng bậc nào.
  const bacCu = new Map((a.brackets ?? []).map((x) => [chuoi(x.label), x.price_usd]));
  const bacMoi = new Map((b.brackets ?? []).map((x) => [chuoi(x.label), x.price_usd]));
  for (const [nhan, gia] of bacCu) {
    if (!bacMoi.has(nhan)) ra.push({ kieu: "bo_bac", bac: nhan, tu: String(gia) });
    else if (bacMoi.get(nhan) !== gia) {
      ra.push({ kieu: "gia", bac: nhan, tu: String(gia), den: String(bacMoi.get(nhan)) });
    }
  }
  for (const [nhan, gia] of bacMoi) {
    if (!bacCu.has(nhan)) ra.push({ kieu: "them_bac", bac: nhan, den: String(gia) });
  }

  // ── 單房差 ────────────────────────────────────────────────────────────────
  if ((a.single_supplement_usd ?? null) !== (b.single_supplement_usd ?? null)) {
    ra.push({
      kieu: "don_phong",
      tu: chuoi(a.single_supplement_usd),
      den: chuoi(b.single_supplement_usd),
    });
  }

  // ── Khách sạn theo ngày ───────────────────────────────────────────────────
  const ksCu = new Map((a.hotel_days ?? []).map((x) => [x.ngay, chuoi(x.ten)]));
  const ksMoi = new Map((b.hotel_days ?? []).map((x) => [x.ngay, chuoi(x.ten)]));
  for (const ngay of new Set([...ksCu.keys(), ...ksMoi.keys()])) {
    const truoc = ksCu.get(ngay) ?? "";
    const sau = ksMoi.get(ngay) ?? "";
    if (truoc !== sau) ra.push({ kieu: "khach_san", ngay, tu: truoc, den: sau });
  }

  // ── Thông tin chung ───────────────────────────────────────────────────────
  if ((a.so_ngay ?? null) !== (b.so_ngay ?? null)) {
    ra.push({ kieu: "so_ngay", tu: chuoi(a.so_ngay), den: chuoi(b.so_ngay) });
  }
  if (chuoi(a.ten_chuong_trinh) !== chuoi(b.ten_chuong_trinh)) {
    ra.push({ kieu: "ten_ct", tu: chuoi(a.ten_chuong_trinh), den: chuoi(b.ten_chuong_trinh) });
  }
  if (chuoi(cu.hieu_luc_den) !== chuoi(moi.hieu_luc_den)) {
    ra.push({ kieu: "hieu_luc", tu: chuoi(cu.hieu_luc_den), den: chuoi(moi.hieu_luc_den) });
  }

  // ── Điều kiện kèm theo ────────────────────────────────────────────────────
  soSanhDanhSach(a.included, b.included, "bao_gom", ra);
  soSanhDanhSach(a.excluded, b.excluded, "khong_bao_gom", ra);
  soSanhDanhSach(a.notes, b.notes, "ghi_chu", ra);

  // Sắp theo mức quan trọng với đối tác: tiền trước, rồi chương trình, rồi chữ.
  const uuTien: Record<KieuThayDoiChao, number> = {
    gia: 0, them_bac: 1, bo_bac: 1, don_phong: 2,
    khach_san: 3, so_ngay: 4, ten_ct: 5, hieu_luc: 6,
    them_dong: 7, bo_dong: 7,
  };
  ra.sort((x, y) => uuTien[x.kieu] - uuTien[y.kieu] || (x.ngay ?? 0) - (y.ngay ?? 0));

  return ra.slice(0, TOI_DA_THAY_DOI);
}
