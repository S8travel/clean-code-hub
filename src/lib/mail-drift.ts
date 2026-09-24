// ─────────────────────────────────────────────────────────────────────────────
// Phát hiện "bản chốt mail" lệch dữ liệu hiện tại.
//
// Mọi cửa sổ soạn mail booking dựng tiêu đề + nội dung MỘT LẦN lúc mở rồi để
// yên trong state. Điều tour lại lưu tự động sau 1,5s kể từ mỗi thay đổi, mỗi
// ngày một lượt lưu riêng → phần cuối có thể ghi xong SAU khi mail đã dựng.
// Đã xảy ra thật: mail đặt phòng đi thiếu một đêm so với lịch trình, khách sạn
// giữ nhầm ngày trả phòng và không ai được cảnh báo.
//
// So bản chốt (lúc dựng) với dữ liệu hiện tại (lúc bấm Gửi) → liệt kê chỗ lệch
// để chặn gửi và hỏi lại OP.
// ─────────────────────────────────────────────────────────────────────────────

/** Một chỗ lệch. `nhan` là key tiếng Việt — UI bọc qua `t()` để dịch. */
export interface MailDriftItem {
  nhan: string;
  truoc: string;
  sau: string;
}

export interface CauHinhSoSanh {
  /** Tên field → nhãn tiếng Việt. Field thiếu nhãn vẫn được so, lấy key làm nhãn. */
  nhan?: Record<string, string>;
  /**
   * Field mảng → nhãn cho dòng "số lượng" thêm vào khi độ dài đổi.
   * Vd `check_in_dates: "Số đêm"` — con số khách sạn đọc trước nhất, lệch 1 là
   * lệch tiền phòng, nên tách riêng khỏi dòng liệt kê ngày.
   */
  demMang?: Record<string, string>;
}

const TRONG = "—";

/** "2026-11-26" → "26/11". Chuỗi khác giữ nguyên văn. */
function fmtNgay(d: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d);
  return m ? `${m[3]}/${m[2]}` : d;
}

/** Giá trị bất kỳ → một dòng đọc được. Mảng/object gộp phẳng, không xuống dòng. */
export function moTaGiaTri(v: unknown): string {
  if (v == null) return TRONG;
  if (typeof v === "string") return v.trim() ? fmtNgay(v.trim()) : TRONG;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (Array.isArray(v)) {
    const parts = v.map(moTaGiaTri).filter((s) => s !== TRONG);
    if (parts.length === 0) return TRONG;
    // Mảng object (vd danh sách dịch vụ) tự nó đã có dấu "·" bên trong → tách
    // các phần tử bằng ";" cho khỏi dính vào nhau; mảng thường thì dấu phẩy.
    const coObject = v.some((x) => x != null && typeof x === "object");
    return parts.join(coObject ? "; " : ", ");
  }
  if (typeof v === "object") {
    const parts = Object.values(v as Record<string, unknown>)
      .map(moTaGiaTri)
      .filter((s) => s !== TRONG);
    return parts.length > 0 ? parts.join(" · ") : TRONG;
  }
  return String(v);
}

/** Chuẩn hoá để SO SÁNH (không dùng hiển thị): null/undefined/"" coi như nhau. */
function khoaSoSanh(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "string") return v.trim();
  if (Array.isArray(v)) return JSON.stringify(v.map(khoaSoSanh));
  if (typeof v === "object") {
    const obj = v as Record<string, unknown>;
    return JSON.stringify(Object.keys(obj).sort().map((k) => [k, khoaSoSanh(obj[k])]));
  }
  return String(v);
}

/**
 * So bản chốt với dữ liệu hiện tại. Trả mảng rỗng khi khớp (hoặc chưa có bản
 * chốt — lúc đó không có gì để lệch).
 *
 * So TOÀN BỘ field của cả hai bên, không chỉ field có nhãn: thiếu một field là
 * mất một đường cảnh báo, mà đây chính là lưới an toàn cuối trước khi mail rời
 * hệ thống.
 */
export function soSanhBanChotMail(
  truoc: Record<string, unknown> | null | undefined,
  sau: Record<string, unknown>,
  cauHinh: CauHinhSoSanh = {},
): MailDriftItem[] {
  if (!truoc) return [];
  const { nhan = {}, demMang = {} } = cauHinh;
  const items: MailDriftItem[] = [];

  for (const key of [...new Set([...Object.keys(truoc), ...Object.keys(sau)])]) {
    const a = truoc[key];
    const b = sau[key];
    if (khoaSoSanh(a) === khoaSoSanh(b)) continue;

    const nhanDem = demMang[key];
    if (nhanDem && Array.isArray(a) && Array.isArray(b) && a.length !== b.length) {
      items.push({ nhan: nhanDem, truoc: String(a.length), sau: String(b.length) });
    }
    items.push({ nhan: nhan[key] ?? key, truoc: moTaGiaTri(a), sau: moTaGiaTri(b) });
  }

  return items;
}

/** Dữ liệu đã dùng để dựng nội dung mail booking khách sạn. */
export type KsMailSnapshot = {
  khach_san_id: number;
  /** Các đêm ở, dạng "YYYY-MM-DD", đã sort tăng dần. */
  check_in_dates: string[];
  so_phong: string;
  ghi_chu: string;
};

const NHAN_KS: Record<string, string> = {
  khach_san_id: "Khách sạn",
  check_in_dates: "Ngày ở",
  so_phong: "Số phòng",
  ghi_chu: "Ghi chú",
};

export function soSanhMailKS(
  truoc: KsMailSnapshot | null | undefined,
  sau: KsMailSnapshot,
): MailDriftItem[] {
  return soSanhBanChotMail(truoc, sau, {
    nhan: NHAN_KS,
    demMang: { check_in_dates: "Số đêm" },
  });
}

/** Nhãn cho mail booking nhà hàng (`buildNhMailFields`) và tàu ngày. */
export const NHAN_NH: Record<string, string> = {
  ngay_date: "Ngày",
  bua_an: "Bữa",
  nha_hang_id: "Nhà hàng",
  set_menu_id: "Set menu",
  set_menu_ten: "Tên set",
  ten_set: "Tên set",
  gia: "Giá",
  mon_an: "Món ăn",
  so_khach: "Số khách",
  so_khach_lon: "Người lớn",
  so_khach_em1: "Trẻ em 1",
  so_khach_em2: "Trẻ em 2",
  so_noi_bo: "Nội bộ",
};

/** Nhãn cho mail booking dịch vụ. */
export const NHAN_DV: Record<string, string> = {
  ten_nha_cung_cap: "Nhà cung cấp",
  dich_vu: "Dịch vụ",
};

/** Nhãn cho mail booking xe. */
export const NHAN_XE: Record<string, string> = {
  xe_id: "Xe",
  nha_xe_id: "Nhà xe",
  ten_xe: "Loại xe",
  so_cho: "Số chỗ",
  ngay_di: "Ngày đi",
  ngay_ve: "Ngày về",
  chuyen_bay_don: "Chuyến bay đón",
  chuyen_bay_tien: "Chuyến bay tiễn",
  hdv_ten: "HDV",
  so_khach: "Số khách",
};

/** Nhãn cho mail booking visa. */
export const NHAN_VISA: Record<string, string> = {
  don_vi_visa_id: "Đơn vị visa",
  don_vi_ten: "Đơn vị visa",
  ngay_di: "Ngày đi",
  so_khach_lon: "Người lớn",
  so_khach_em1: "Trẻ em 1",
  so_khach_em2: "Trẻ em 2",
  so_khach_tl: "Trẻ lớn",
  ghi_chu: "Ghi chú",
};
