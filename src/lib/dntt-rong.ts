// "Phiếu rỗng" = ĐNTT trỏ vào chi phí đoàn nhưng KHÔNG có dòng dntt_allocations nào.
//
// Nguồn gốc: trước 10/07/2026 useInsertDNTT chèn dntt rồi mới chèn allocations, không
// transaction — allocation lỗi (chi phí đã bị xóa khi sửa Điều tour) thì ĐNTT rỗng ở
// lại DB. Duyệt & chi phiếu rỗng thì recalc_chi_phi_payment_status không thấy allocation
// nào → dòng chi phí vẫn báo "chưa trả" → có người đề nghị lần nữa → TRẢ TIỀN HAI LẦN.
//
// Nay RPC create_dntt_with_allocations() nguyên tử nên không sinh thêm phiếu rỗng, và
// trigger DB chặn duyệt. Hàm này chỉ để UI báo sớm cho kế toán, không phải chốt chặn.
//
// hoan_ung / hdv / dinh_ky KHÔNG allocate vào doan_chi_phi → không phải phiếu rỗng.

/** ref_loai của ĐNTT bắt buộc phải kèm allocation. */
const REF_LOAI_CAN_ALLOCATION = new Set(["doan_chi_phi", "khach_san"]);

export function isDnttRong(d: {
  ref_loai: string | null;
  alloc_count?: number | null;
  trang_thai_duyet: string;
}): boolean {
  if (d.trang_thai_duyet === "da_huy" || d.trang_thai_duyet === "tu_choi") return false;
  if (!d.ref_loai || !REF_LOAI_CAN_ALLOCATION.has(d.ref_loai)) return false;
  return (d.alloc_count ?? 0) === 0;
}
