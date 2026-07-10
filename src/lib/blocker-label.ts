import { t } from "@/lib/i18n";
import type { BlockerKind } from "@/lib/doan-cancel-check";

/**
 * Nhãn tiếng Việt cho từng loại vướng mắc khi hủy/xóa đoàn. Dùng chung cho màn
 * checklist (HuyDoanDialog) và toast chặn xóa (Index) — một nguồn chữ duy nhất.
 *
 * Ở file riêng, KHÔNG nằm trong component: export hàm cạnh component làm hỏng
 * react-refresh. Cũng KHÔNG nằm trong `doan-cancel-check` để lib đó thuần, không
 * kéo theo i18n.
 *
 * `t()` phải nhận literal — bộ trích của test i18n-coverage chỉ thấy chuỗi tĩnh,
 * và key động sẽ lặng lẽ rơi về tiếng Việt khi đổi ngôn ngữ.
 */
export function blockerLabel(kind: BlockerKind): string {
  switch (kind) {
    case "ks": return t("khách sạn đã gửi mail chưa hủy");
    case "nh": return t("bữa ăn nhà hàng chưa hủy");
    case "tau": return t("chuyến tàu / du thuyền chưa hủy");
    case "dv": return t("dịch vụ chưa hủy");
    case "dntt": return t("phiếu ĐNTT chưa hủy");
    case "dntt_dinh_ky": return t("phiếu ĐNTT định kỳ đã gộp chi phí của đoàn này");
  }
}
