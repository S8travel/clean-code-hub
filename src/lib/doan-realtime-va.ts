/** Vá cache đoàn bằng chính dữ liệu trong sự kiện realtime, thay vì tải lại cả danh sách.
 *
 *  Vì sao cần: mỗi sự kiện trên bảng `doan` trước đây invalidate `["doan"]` → MỌI máy
 *  đang mở CRM tải lại danh sách đoàn (~1,5 MB, câu query nặng nhất hệ thống). Gom
 *  800ms (lib/gom-invalidate.ts) chỉ đỡ được loạt sự kiện sát nhau; OP sửa đoàn đều
 *  tay vài giây một lần thì mỗi lần vẫn là một đợt tải lại cả công ty (sự cố 02/10/2026).
 *
 *  Sự kiện UPDATE mang sẵn cả dòng mới (`payload.new`, qua realtime.cast = to_jsonb, cùng
 *  định dạng với API) → chép đè lên dòng trong cache là đủ. Chỉ tải lại khi cache KHÔNG tự
 *  suy ra được kết quả đúng:
 *   - INSERT, hoặc đoàn vừa lọt vào danh sách: thiếu object nhúng (agents, HDV, xe…).
 *   - Đổi cột khoá ngoại có object nhúng kèm → object nhúng đang giữ thành sai.
 *   - Đổi `ngay_di` trong danh sách → thứ tự đổi.
 *   - Sự kiện báo lỗi / thiếu id (vd payload quá cỡ bị realtime cắt bớt).
 *
 *  KHÔNG dựa vào `payload.old`: bảng có RLS thì realtime chỉ gửi khoá chính của dòng cũ.
 *  Muốn biết đoàn có thuộc một danh sách đã lọc không → hỏi điều kiện lọc của danh sách đó.
 */
export interface SuKienDoan {
  eventType: "INSERT" | "UPDATE" | "DELETE";
  new: Record<string, unknown>;
  old: Record<string, unknown>;
  errors?: unknown;
}

type Dong = Record<string, unknown>;

/** Cột khoá ngoại có object nhúng trong câu select đoàn (DOAN_SELECT, use-doan.ts). */
const COT_CO_NHUNG = [
  "agent_id", "agent_huy_id", "dia_diem_id",
  "huong_dan_vien_id", "huong_dan_vien_id_2", "xe_id", "xe_id_2", "van_phong_id",
];

export interface KetQuaVa<T> {
  data: T;
  /** Có ít nhất một sự kiện cache không tự xử lý được → caller tải lại. */
  canTaiLai: boolean;
}

/** Điều kiện lọc của useDoanList — PHẢI khớp từng nhánh với câu query ở đó. */
export function dieuKienDanhSachDoan(
  phanLoaiTour?: string[] | null,
  vanPhongIds?: number[] | null,
  agentIds?: number[] | null,
): (d: Dong) => boolean {
  return (d) => {
    if (phanLoaiTour && phanLoaiTour.length > 0) {
      const tt = d.thi_truong;
      if (tt != null && !phanLoaiTour.includes(String(tt))) return false;
    }
    if (vanPhongIds && vanPhongIds.length > 0 && !vanPhongIds.includes(Number(d.van_phong_id))) {
      return false;
    }
    if (agentIds && agentIds.length > 0 && !agentIds.includes(Number(d.agent_id))) return false;
    return true;
  };
}

/** Áp loạt sự kiện vào danh sách đoàn trong cache. */
export function vaDanhSachDoan(
  ds: Dong[],
  cacSuKien: SuKienDoan[],
  thuocDanhSach: (d: Dong) => boolean = () => true,
): KetQuaVa<Dong[]> {
  let ketQua = ds;
  let canTaiLai = false;
  const sua = () => (ketQua === ds ? [...ds] : ketQua);
  for (const sk of cacSuKien) {
    if (coLoi(sk) || sk.eventType === "INSERT") { canTaiLai = true; continue; }
    if (sk.eventType === "DELETE") {
      const id = sk.old?.id;
      if (id == null) { canTaiLai = true; continue; }
      if (ketQua.some((d) => giong(d.id, id))) ketQua = ketQua.filter((d) => !giong(d.id, id));
      continue;
    }
    const moi = sk.new ?? {};
    if (moi.id == null) { canTaiLai = true; continue; }
    const viTri = ketQua.findIndex((d) => giong(d.id, moi.id));
    if (viTri < 0) {
      // Chưa có trong danh sách: giờ thuộc về đây → vừa lọt vào, cần object nhúng → tải lại.
      // Không thuộc → đoàn của danh sách khác, bỏ qua.
      if (thuocDanhSach(moi)) canTaiLai = true;
      continue;
    }
    const dong = ketQua[viTri];
    if (doiCot(dong, moi, [...COT_CO_NHUNG, "ngay_di"])) { canTaiLai = true; continue; }
    const daVa = chepDe(dong, moi);
    if (!thuocDanhSach(daVa)) {
      ketQua = sua().filter((_, i) => i !== viTri); // vừa ra khỏi danh sách
    } else if (daVa !== dong) {
      ketQua = sua();
      ketQua[viTri] = daVa;
    }
  }
  return { data: ketQua, canTaiLai };
}

/** Áp loạt sự kiện vào MỘT đoàn trong cache (trang chi tiết). Sự kiện đoàn khác: bỏ qua. */
export function vaMotDoan(dong: Dong, cacSuKien: SuKienDoan[]): KetQuaVa<Dong> {
  let ketQua = dong;
  let canTaiLai = false;
  for (const sk of cacSuKien) {
    const id = sk.eventType === "DELETE" ? sk.old?.id : sk.new?.id;
    if (coLoi(sk) || id == null) { canTaiLai = true; continue; }
    if (!giong(id, ketQua.id)) continue;
    // Đoàn đang xem bị xoá → tải lại để trang tự báo "không tìm thấy".
    if (sk.eventType !== "UPDATE") { canTaiLai = true; continue; }
    if (doiCot(ketQua, sk.new, COT_CO_NHUNG)) { canTaiLai = true; continue; }
    ketQua = chepDe(ketQua, sk.new);
  }
  return { data: ketQua, canTaiLai };
}

/** Chép cột từ dòng mới lên dòng cũ; không đổi gì thì trả lại đúng object cũ. */
function chepDe(dong: Dong, moi: Dong): Dong {
  let daVa = dong;
  for (const [cot, giaTri] of Object.entries(moi)) {
    // Thiếu giá trị (TOAST không đổi bị lược) → giữ bản đang có, không xoá trắng.
    if (giaTri === undefined || giong(dong[cot], giaTri)) continue;
    if (daVa === dong) daVa = { ...dong };
    daVa[cot] = giaTri;
  }
  return daVa;
}

function doiCot(dong: Dong, moi: Dong, cacCot: string[]): boolean {
  return cacCot.some((c) => c in moi && !giong(dong[c], moi[c]));
}

function coLoi(sk: SuKienDoan): boolean {
  return Array.isArray(sk.errors) ? sk.errors.length > 0 : sk.errors != null;
}

function giong(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a == null || b == null) return a == b; // null ≡ undefined
  if (typeof a === "object" || typeof b === "object") return JSON.stringify(a) === JSON.stringify(b);
  return false;
}
