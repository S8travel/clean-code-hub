// Ghép nội dung Sổ tay với bản dịch zh-TW. Tách khỏi component để test được.

import { isZhTW } from "./i18n";
import type { SopMuc } from "./sop-data";
import { SOP_ZH, type SopMucZh } from "./sop-data-zh";

/**
 * Trả về mục đã dịch khi đang ở chế độ zh-TW.
 *
 * Rơi về tiếng Việt theo TỪNG TRƯỜNG (không phải cả mục): thêm nội dung mới mà
 * chưa kịp dịch thì chỗ đó hiện tiếng Việt, phần còn lại vẫn tiếng Trung —
 * không vỡ trang, và nhìn là biết còn thiếu chỗ nào.
 *
 * Mảng (`buoc`, `cachXuLy`, `items`, `uuTien`) chỉ nhận bản dịch khi ĐỦ SỐ
 * PHẦN TỬ. Dịch thiếu vài dòng mà ghép lẫn thì người đọc mất dòng, nguy hiểm
 * hơn là hiện nguyên tiếng Việt.
 */
export function dichSopMuc(muc: SopMuc, zhOverride?: boolean): SopMuc {
  const zh = zhOverride ?? isZhTW();
  if (!zh) return muc;

  const d: SopMucZh | undefined = SOP_ZH[muc.id];
  if (!d) return muc;

  const mangHopLe = <T>(ban?: T[], goc?: T[]): T[] | undefined =>
    ban && goc && ban.length === goc.length ? ban : goc;

  return {
    ...muc,
    title: d.title ?? muc.title,
    sub: d.sub ?? muc.sub,
    tinhHuong: d.tinhHuong ?? muc.tinhHuong,
    mauCau: d.mauCau ?? muc.mauCau,
    uuTien: mangHopLe(d.uuTien, muc.uuTien),
    cachXuLy: mangHopLe(d.cachXuLy, muc.cachXuLy),
    items: mangHopLe(d.items, muc.items),
    buoc: mangHopLe(d.buoc, muc.buoc),
  };
}

/** Toàn bộ chữ tiếng Trung của một mục — dùng để tìm kiếm bằng tiếng Trung. */
export function chuZhCuaMuc(id: string): string {
  const d = SOP_ZH[id];
  if (!d) return "";
  return [
    d.title ?? "",
    d.sub ?? "",
    d.tinhHuong ?? "",
    d.mauCau ?? "",
    ...(d.uuTien ?? []),
    ...(d.cachXuLy ?? []),
    ...(d.items ?? []),
    ...(d.buoc ?? []).flatMap((b) => [b.title, b.note ?? ""]),
  ].join(" ");
}
