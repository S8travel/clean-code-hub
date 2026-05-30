// Đọc số tiền VND ra chữ tiếng Việt. Vd: 13_000_000 → "Mười ba triệu đồng".
// Dùng cho các form đề nghị (tạm ứng / quyết toán) — in "Tổng số tiền bằng chữ".

const DIGITS = ["không", "một", "hai", "ba", "bốn", "năm", "sáu", "bảy", "tám", "chín"];
// Đơn vị nhóm 3 chữ số có chu kỳ 3: "" / nghìn / triệu, rồi lặp kèm "tỷ"
// (tỷ, nghìn tỷ, triệu tỷ, tỷ tỷ, ...).
const NHOM3 = ["", "nghìn", "triệu"];

/** Đơn vị của nhóm thứ i (0 = hàng đơn vị). */
function donViNhom(i: number): string {
  const base = NHOM3[i % 3];
  const ty = "tỷ ".repeat(Math.floor(i / 3));
  return `${base} ${ty}`.replace(/\s+/g, " ").trim();
}

/** Đọc 1 nhóm 3 chữ số (0..999). `full`=true → luôn đọc hàng trăm (kể cả 0). */
function readBaChuSo(n: number, full: boolean): string {
  const tram = Math.floor(n / 100);
  const chuc = Math.floor((n % 100) / 10);
  const donvi = n % 10;
  const parts: string[] = [];

  if (tram > 0 || full) parts.push(`${DIGITS[tram]} trăm`);

  if (chuc === 0) {
    if (donvi > 0) {
      if (tram > 0 || full) parts.push("lẻ");
      parts.push(DIGITS[donvi]);
    }
  } else if (chuc === 1) {
    parts.push("mười");
    if (donvi === 5) parts.push("lăm");
    else if (donvi > 0) parts.push(DIGITS[donvi]);
  } else {
    parts.push(`${DIGITS[chuc]} mươi`);
    if (donvi === 1) parts.push("mốt");
    else if (donvi === 5) parts.push("lăm");
    else if (donvi > 0) parts.push(DIGITS[donvi]);
  }
  return parts.join(" ");
}

/**
 * Đọc số nguyên dương ra chữ (không kèm đơn vị tiền tệ).
 * Vd 1_005_000 → "một triệu không trăm lẻ năm nghìn".
 */
export function docSoThanhChu(input: number): string {
  let n = Math.floor(Math.abs(input));
  if (n === 0) return "không";

  // Tách thành các nhóm 3 chữ số, nhóm thấp nhất ở đầu mảng.
  const groups: number[] = [];
  while (n > 0) {
    groups.push(n % 1000);
    n = Math.floor(n / 1000);
  }

  const segments: string[] = [];
  for (let i = groups.length - 1; i >= 0; i--) {
    const g = groups[i];
    const isLeading = i === groups.length - 1;
    if (g === 0) continue; // bỏ qua nhóm 0 (vd 13 triệu, nhóm nghìn & đơn vị = 0)
    // Nhóm không phải nhóm cao nhất → đọc đủ hàng trăm ("không trăm lẻ ...").
    const words = readBaChuSo(g, !isLeading);
    const dv = donViNhom(i);
    segments.push(`${words}${dv ? " " + dv : ""}`.trim());
  }
  return segments.join(" ").replace(/\s+/g, " ").trim();
}

/**
 * Số tiền VND ra chữ, viết hoa chữ cái đầu + hậu tố "đồng".
 * Vd 13_000_000 → "Mười ba triệu đồng". 0 → "Không đồng".
 */
export function docTienBangChu(soTien: number): string {
  const chu = docSoThanhChu(soTien);
  const withDong = `${chu} đồng`;
  return withDong.charAt(0).toUpperCase() + withDong.slice(1);
}
