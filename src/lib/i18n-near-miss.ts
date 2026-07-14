// Bắt "key gần giống" trong i18n — nguyên nhân làm main đỏ ngày 13/07/2026.
//
// PR #267 viết t("Chọn nhà cung cấp…") dùng ký tự ELLIPSIS `…` (U+2026), trong khi
// zh-TW.json có "Chọn nhà cung cấp..." với BA DẤU CHẤM thường. Nhìn trên màn hình
// giống hệt nhau, nhưng là hai chuỗi khác nhau → t() không tìm thấy bản dịch.
// Thông báo lỗi cũ chỉ nói "chưa có bản dịch", người sửa mở file ra thấy "rõ ràng
// có rồi" → mất thời gian, dễ bỏ qua.
//
// Helper này so key thiếu với key đã có SAU KHI chuẩn hoá các ký tự nhìn-giống-nhau,
// rồi chỉ đích danh chỗ khác. CHỈ dùng để BÁO LỖI cho người — KHÔNG dùng để nới
// lỏng phép so ở runtime (t() vẫn tra khớp tuyệt đối; chuẩn hoá ở runtime sẽ khiến
// bản dịch thiếu thật lọt lưới và âm thầm rơi về tiếng Việt).

/** Các cặp ký tự nhìn giống nhau nhưng khác mã — nguồn gốc của lỗi loại này. */
const LOOKALIKES: Array<{ pattern: RegExp; thay: string; ten: string }> = [
  { pattern: /…/g, thay: "...", ten: "dấu ba chấm “…” (1 ký tự) vs “...” (3 dấu chấm)" },
  { pattern: /[–—]/g, thay: "-", ten: "gạch ngang dài “–/—” vs gạch nối “-”" },
  { pattern: /[“”]/g, thay: '"', ten: "nháy kép cong “” vs nháy thẳng \"" },
  { pattern: /[‘’]/g, thay: "'", ten: "nháy đơn cong ‘’ vs nháy thẳng '" },
  // Regex viet bang escape \u00A0 (KHONG go thang ky tu nbsp) — chinh no la thu
  // lint `no-irregular-whitespace` chan, va cung la loai loi file nay di bat.
  { pattern: /\u00A0/g, thay: " ", ten: "khoảng trắng cứng (nbsp) vs khoảng trắng thường" },
];

/** Chuẩn hoá ký tự nhìn-giống-nhau + gom khoảng trắng, để so "gần giống". */
export function normalizeKey(s: string): string {
  let out = s;
  for (const { pattern, thay } of LOOKALIKES) out = out.replace(pattern, thay);
  return out.replace(/\s+/g, " ").trim();
}

export interface NearMiss {
  /** Key đã có trong file dịch, gần giống key đang thiếu. */
  keyDaCo: string;
  /** Mô tả chỗ khác nhau, để người sửa biết ngay phải đổi gì. */
  khacBiet: string;
}

/** Liệt kê các loại ký tự nhìn-giống-nhau đang gây lệch giữa 2 chuỗi. */
function moTaKhacBiet(a: string, b: string): string {
  const lyDo = LOOKALIKES
    .filter(({ pattern }) => {
      pattern.lastIndex = 0;
      const coTrongA = pattern.test(a);
      pattern.lastIndex = 0;
      const coTrongB = pattern.test(b);
      return coTrongA !== coTrongB;
    })
    .map(({ ten }) => ten);
  if (lyDo.length > 0) return lyDo.join("; ");
  // Khác nhau ở khoảng trắng thừa/thiếu (đã bị gom khi chuẩn hoá).
  return "khoảng trắng (thừa/thiếu/xuống dòng)";
}

/**
 * Tìm key đã có trong file dịch mà chỉ khác key đang thiếu ở ký tự nhìn-giống-nhau.
 * Trả null nếu đây là key mới thật sự (phải thêm bản dịch).
 */
export function findNearMiss(keyThieu: string, keyDaCo: Iterable<string>): NearMiss | null {
  const chuan = normalizeKey(keyThieu);
  for (const k of keyDaCo) {
    if (k === keyThieu) continue; // trùng tuyệt đối thì đã không "thiếu"
    if (normalizeKey(k) === chuan) {
      return { keyDaCo: k, khacBiet: moTaKhacBiet(keyThieu, k) };
    }
  }
  return null;
}
