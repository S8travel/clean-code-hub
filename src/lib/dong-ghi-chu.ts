/**
 * Dòng ghi chú tự do trong cột "Chương trình" của Điều tour — chuyến bay nội địa, sự kiện,
 * giờ hẹn... OP gõ tay, KHÔNG phải cảnh điểm, không sinh chi phí / booking / ĐNTT.
 *
 * Lưu ở `doan_ngay.dong_ghi_chu` (jsonb), KHÔNG ở `doan_ngay_item`: bảng đó lái chi phí,
 * booking DV, ĐNTT theo canh_diem_id — một dòng chữ lọt vào đó là thành dòng tiền.
 *
 * Trên màn hình, dòng ghi chú nằm CHUNG danh sách với cảnh điểm (kéo thả xen kẽ được) dưới
 * dạng item có `dong_ghi_chu` và canh_diem_id = 0 — mọi chỗ lọc `canh_diem_id > 0` tự bỏ
 * qua nó. Vị trí lưu bằng `sau` = số cảnh điểm đứng TRƯỚC dòng ghi chú (0 = đầu ngày): neo
 * theo cảnh điểm để hàm lưu cảnh điểm (thu_tu = 1..n) không phải đổi gì.
 */

/** Một dòng ghi chú như lưu trong DB.
 *  `type` (không phải `interface`) để gán thẳng được vào cột kiểu Json.
 *  Thứ tự khoá `sau` rồi `noi_dung` là CỐ Ý: jsonb trả khoá theo độ dài tên (ngắn trước).
 *  Dựng cùng thứ tự thì lần lưu sau so (lib/can-ghi.ts) ra "y nguyên" và bỏ được lệnh ghi. */
export type DongGhiChu = { sau: number; noi_dung: string };

/** Hình dạng tối thiểu của một dòng trong cột Chương trình (DayItemLocal). */
interface DongChuongTrinh {
  canh_diem_id: number;
  dong_ghi_chu?: string;
}

/** Dòng này là dòng ghi chú (kể cả đang gõ dở, chữ còn rỗng). */
export function laDongGhiChu(it: { dong_ghi_chu?: string }): boolean {
  return it.dong_ghi_chu !== undefined;
}

/** Đọc cột jsonb. Phần tử hỏng thì bỏ qua — không làm vỡ cả ngày. */
export function docDongGhiChu(raw: unknown): DongGhiChu[] {
  if (!Array.isArray(raw)) return [];
  const out: DongGhiChu[] = [];
  for (const x of raw) {
    if (!x || typeof x !== "object") continue;
    const { sau, noi_dung } = x as Record<string, unknown>;
    if (typeof noi_dung !== "string" || !noi_dung.trim()) continue;
    const moc = typeof sau === "number" && Number.isFinite(sau) ? Math.max(0, Math.floor(sau)) : 0;
    out.push({ sau: moc, noi_dung });
  }
  return out;
}

/** Danh sách trên màn hình (cảnh điểm + dòng ghi chú xen kẽ) → mảng ghi xuống DB.
 *  Dòng trống chưa chọn cảnh điểm KHÔNG tính vào `sau` (lưu xong nó cũng biến mất).
 *  Dòng ghi chú rỗng / toàn khoảng trắng bị bỏ. */
export function tachDongGhiChu(items: DongChuongTrinh[]): DongGhiChu[] {
  const out: DongGhiChu[] = [];
  let soCanhDiem = 0;
  for (const it of items) {
    if (laDongGhiChu(it)) {
      const noiDung = (it.dong_ghi_chu ?? "").trim();
      if (noiDung) out.push({ sau: soCanhDiem, noi_dung: noiDung });
    } else if (it.canh_diem_id > 0) {
      soCanhDiem++;
    }
  }
  return out;
}

/** Ngược lại với tachDongGhiChu: chèn dòng ghi chú vào giữa các cảnh điểm (đã xếp theo
 *  thu_tu). Đếm mốc y hệt lúc tách — chỉ cảnh điểm thật (canh_diem_id > 0), dòng rác
 *  canh_diem_id NULL/0 không tính. Mốc vượt quá số cảnh điểm (cảnh điểm bị gỡ ở chỗ khác,
 *  vd áp seri) → dồn xuống cuối ngày. Các dòng cùng mốc giữ đúng thứ tự trong mảng. */
export function tronDongGhiChu<T extends DongChuongTrinh>(
  canhDiem: T[],
  ghiChu: DongGhiChu[],
  taoDong: (g: DongGhiChu) => T,
): T[] {
  const laCanhDiemThat = (it: T) => !laDongGhiChu(it) && it.canh_diem_id > 0;
  const tong = canhDiem.filter(laCanhDiemThat).length;
  const theoMoc = new Map<number, DongGhiChu[]>();
  for (const g of ghiChu) {
    const moc = Math.min(Math.max(0, g.sau), tong);
    const ds = theoMoc.get(moc);
    if (ds) ds.push(g);
    else theoMoc.set(moc, [g]);
  }
  const out: T[] = [];
  const chen = (moc: number) => {
    for (const g of theoMoc.get(moc) ?? []) out.push(taoDong(g));
    theoMoc.delete(moc);
  };
  let dem = 0;
  for (const it of canhDiem) {
    if (laCanhDiemThat(it)) {
      chen(dem);
      dem++;
    }
    out.push(it);
  }
  chen(dem);
  return out;
}

/** Dòng ghi chú thêm / bỏ giữa hai lần lưu — cho nhật ký. So theo nội dung, không theo vị
 *  trí: chỉ kéo đổi chỗ thì không ghi nhật ký; sửa chữ = bỏ dòng cũ + thêm dòng mới. */
export function diffDongGhiChu(
  cu: DongGhiChu[],
  moi: DongGhiChu[],
): { them: string[]; bo: string[] } {
  const conLai = new Map<string, number>();
  for (const g of cu) conLai.set(g.noi_dung, (conLai.get(g.noi_dung) ?? 0) + 1);
  const them: string[] = [];
  for (const g of moi) {
    const n = conLai.get(g.noi_dung) ?? 0;
    if (n > 0) conLai.set(g.noi_dung, n - 1);
    else them.push(g.noi_dung);
  }
  const bo: string[] = [];
  for (const [noiDung, n] of conLai) {
    for (let i = 0; i < n; i++) bo.push(noiDung);
  }
  return { them, bo };
}
