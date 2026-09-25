// Định danh dòng chi phí CHÍNH của một bữa ăn, và cách tìm lại nó khi id trong state
// đã chết.
//
// SỰ CỐ 10/07/2026 (đoàn HAN05BR260707DO): `localRows[key].id` ở use-nh-section được
// GHIM lúc init và KHÔNG effect nào đồng bộ lại. Cascade Điều tour xóa dòng chi phí NH
// rồi tạo lại với id mới → id trong state trỏ vào dòng đã chết ("dòng ma"). OP bấm
// "Gửi ĐNTT" trên dòng ma → ĐNTT tạo với ref_id/chi_phi_id chết → allocation vi phạm
// khóa ngoại → (trước khi có RPC nguyên tử) ĐNTT rỗng ở lại DB. Bấm lại → thêm phiếu.
// Guard chống trùng `wouldOverCommit` cũng câm, vì nó tra allocation theo id đã chết.
//
// Khóa tìm lại dòng: (danh_muc='nha_hang', ref_doan_ngay_id, mo_ta). `mo_ta` phải dựng
// GIỐNG HỆT ở mọi nơi — cascade `use-dieu-tour.ts:1101`, init/insert `use-nh-section`.
// Lệch một ký tự là mất dấu dòng → sinh dòng trùng (vi phạm ux_doan_chi_phi_nh_unique)
// hoặc tạo ĐNTT trỏ sai. Vì vậy nó sống ở đây, một nguồn duy nhất, có test.

export type BuaAn = "trua" | "toi";

export const BUA_AN_LABEL: Record<BuaAn, string> = { trua: "trưa", toi: "tối" };

/** Hậu tố bữa trong mo_ta: "(trưa)" | "(tối)". */
export function nhMealSuffix(buaAn: BuaAn): string {
  return `(${BUA_AN_LABEL[buaAn]})`;
}

/** mo_ta của dòng chi phí CHÍNH: "TÊN NHÀ HÀNG (trưa)". */
export function nhMainMoTa(tenNhaHang: string, buaAn: BuaAn): string {
  return `${tenNhaHang} ${nhMealSuffix(buaAn)}`;
}

export interface ChiPhiLite {
  id: number;
  danh_muc: string | null;
  ref_doan_ngay_id: number | null;
  mo_ta: string | null;
}

/** Dòng chi phí chính của bữa, tìm theo (nha_hang, ngày, mo_ta). */
export function findNhMainChiPhi<T extends ChiPhiLite>(
  chiPhiRows: T[],
  doanNgayId: number,
  moTa: string,
): T | undefined {
  return chiPhiRows.find(
    (cp) =>
      cp.danh_muc === "nha_hang" &&
      cp.ref_doan_ngay_id === doanNgayId &&
      cp.mo_ta === moTa,
  );
}

export interface ResolveNhMainIdResult {
  /** id nên dùng. undefined = chưa xác định được, caller phải tra DB / tạo mới. */
  id: number | undefined;
  /** true khi ta thay id cũ bằng id của dòng thật vừa tìm được (dòng đã bị tạo lại). */
  adopted: boolean;
}

/**
 * Quyết định id dòng chi phí chính, dựa trên snapshot `chiPhiRows` mới nhất.
 *
 * CỐ Ý không bao giờ trả undefined khi `currentId` có mà chỉ là "không thấy trong
 * chiPhiRows": dòng vừa được INSERT có thể chưa kịp vào cache (refetch chạy sau), xóa
 * id lúc đó sẽ khiến caller insert lần hai. Chỉ NHẬN id mới khi tìm được dòng thật.
 * Việc phát hiện dòng ma "đã xóa và chưa có dòng thay thế" phải hỏi DB ở thời điểm
 * dùng — xem `handleDnttSubmit`.
 */
export function resolveNhMainId(opts: {
  currentId: number | undefined;
  chiPhiRows: ChiPhiLite[];
  doanNgayId: number;
  moTa: string;
}): ResolveNhMainIdResult {
  const { currentId, chiPhiRows, doanNgayId, moTa } = opts;
  const found = findNhMainChiPhi(chiPhiRows, doanNgayId, moTa);
  if (found && found.id !== currentId) return { id: found.id, adopted: true };
  return { id: currentId ?? found?.id, adopted: false };
}

// ── Ô bữa đổi nhà hàng trong lúc tab Chi phí đang giữ state ────────────────────
//
// SỰ CỐ (xuất hiện từ 11/07/2026, ngay sau bản vá dòng ma ở trên): state
// `localRows[key]` của tab Chi phí NH ghim `nha_hang_id` lúc dựng bảng, không ai cập
// nhật lại. OP đổi nhà hàng của một bữa ở Điều tour rồi quay lại tab Chi phí:
//  - phần HIỂN THỊ tra nhà hàng theo lịch trình hiện tại → đúng tên mới;
//  - `resolveNhMainId` nhận id dòng chi phí của nhà hàng MỚI;
//  - phần LƯU tra tên theo `nha_hang_id` CŨ trong state — không có trong map (map chỉ
//    chứa nhà hàng của lịch trình hiện tại) → rơi về chữ dự phòng "Nhà hàng" → ghi
//    đè mo_ta dòng vừa nhận thành "Nhà hàng (trưa)".
// Dòng đó không còn khớp ô bữa nào nên biến khỏi màn hình, kéo theo ĐNTT của nó; ĐNTT
// tạo từ màn đó cũng mang mô tả "Nhà hàng (...)" và không có nhà cung cấp. Người thao
// tác không thấy gì lạ — màn của họ giữ id nên vẫn hiện đủ — chỉ máy khác mới thấy mất.
// Đã dẫn tới một ĐNTT trùng suýt được duyệt cho bữa đã chi.

/** Tối thiểu cần biết về một ô bữa để so với state. */
export interface NhSlotLite {
  doan_ngay_id: number;
  bua_an: string;
  nha_hang_id: number;
}

/**
 * Ô bữa cần dựng (lại) state: chưa có trong state, HOẶC lịch trình đã đổi sang nhà
 * hàng khác so với state đang giữ. Ô không đổi nhà hàng giữ nguyên edit của OP.
 */
export function oBuaCanDungLai<M extends NhSlotLite>(
  meals: M[],
  localRows: Record<string, { nha_hang_id: number } | undefined>,
): M[] {
  return meals.filter((m) => {
    const row = localRows[`${m.doan_ngay_id}_${m.bua_an}`];
    return !row || row.nha_hang_id !== m.nha_hang_id;
  });
}

export type TenNhaHangDeGhi =
  | { ok: true; ten: string }
  | { ok: false; lyDo: string };

/**
 * Tên nhà hàng được phép GHI xuống DB cho mo_ta dòng chi phí chính / mô tả ĐNTT.
 *
 * Chỉ trả tên khi state khớp lịch trình hiện tại VÀ tra được tên thật; còn lại trả lý
 * do để caller DỪNG. Không bao giờ trả chữ dự phòng "Nhà hàng" — chữ đó chỉ dùng để
 * hiển thị, ghi xuống là làm dòng chi phí + ĐNTT biến mất (xem sự cố ở trên).
 *
 * Tên trả về giữ NGUYÊN chuỗi gốc (không trim): cascade Điều tour dựng mo_ta từ đúng
 * chuỗi đó, lệch một khoảng trắng là mất dấu dòng.
 */
export function tenNhaHangDeGhi(opts: {
  /** `nha_hang_id` state đang giữ cho ô bữa (localRows[key]). */
  nhaHangIdState: number | null | undefined;
  /** `nha_hang_id` của ô bữa theo lịch trình hiện tại; không có = bữa đã bị gỡ. */
  nhaHangIdLichTrinh: number | null | undefined;
  nhaHangMap: Record<number, { ten?: string | null } | undefined>;
}): TenNhaHangDeGhi {
  const { nhaHangIdState, nhaHangIdLichTrinh, nhaHangMap } = opts;
  if (nhaHangIdLichTrinh == null) {
    return {
      ok: false,
      lyDo: "Bữa này không còn trong lịch trình Điều tour — tải lại trang (F5) rồi kiểm tra lại.",
    };
  }
  if (nhaHangIdState !== nhaHangIdLichTrinh) {
    return {
      ok: false,
      lyDo: "Nhà hàng của bữa này vừa đổi ở Điều tour — màn hình đang cập nhật, thử lại sau vài giây.",
    };
  }
  const ten = nhaHangMap[nhaHangIdLichTrinh]?.ten;
  if (!ten || !ten.trim()) {
    return {
      ok: false,
      lyDo: "Không xác định được tên nhà hàng của bữa này — tải lại trang (F5) rồi thử lại.",
    };
  }
  return { ok: true, ten };
}

/**
 * Query đang trả bản cache CŨ và chưa tải lại lần nào kể từ khi tab mở?
 *
 * Tab Chi phí bị tháo khi OP sang tab Điều tour. Quay lại trong vòng gcTime, React
 * Query trả NGAY bản cache — bản trước lần lưu Điều tour — rồi mới tải lại ngầm. Dựng
 * state từ bản đó là ghim nhà hàng cũ vào ô bữa. Cache còn trong staleTime thì coi là
 * tươi (không bị ai đánh dấu cũ).
 */
export function dangGiuCacheCu(q: { isStale: boolean; isFetchedAfterMount: boolean }): boolean {
  return q.isStale && !q.isFetchedAfterMount;
}
