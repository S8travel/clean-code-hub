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
