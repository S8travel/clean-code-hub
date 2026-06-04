import type { HoaDonUNCRow } from "@/hooks/use-hoa-don-unc";

// Loại viết tắt cho nội dung thanh toán (chữ thường, copy vào UNC)
export const LOAI_SHORT: Record<string, string> = {
  khach_san: "ks",
  nha_hang: "nh",
  dich_vu: "dv",
  xe: "xe",
  visa: "visa",
  bao_hiem: "bh",
  hdv: "hdv",
  dinh_ky: "dk",
};

// Bỏ dấu tiếng Việt — ngân hàng yêu cầu nội dung không dấu
export function noDiacritics(s: string): string {
  return s.normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D");
}

// Bỏ prefix "{từ khoá} " ở đầu chuỗi nếu có (tránh trùng lặp khi data có sẵn keyword)
export function stripPrefix(s: string, prefix: string): string {
  const trimmed = (s || "").trim();
  const p = prefix.toLowerCase();
  return trimmed.toLowerCase().startsWith(p) ? trimmed.slice(prefix.length).trim() : trimmed;
}

// Tách tên NCC nếu có dạng "{KS|NH|...} XXX - {Company}" — lấy phần Company
const NCC_PREFIX_RE = /^(ks|nh|hotel|khach\s*san|nha\s*hang|dv|dich\s*vu|xe|visa)\s/i;
export function cleanNccName(raw: string | null | undefined): string {
  const s = (raw || "").trim();
  if (!s) return "";
  const parts = s.split(" - ");
  if (parts.length >= 2 && NCC_PREFIX_RE.test(parts[0].trim())) {
    return parts.slice(1).join(" - ").trim();
  }
  return s;
}

// Build "S8 tt {NCC} - {loai} {tên dịch vụ} {ngày} doan {tên đoàn}" — không dấu
export function buildPaymentContent(row: HoaDonUNCRow): string {
  const ncc = cleanNccName(row.ten_nha_cung_cap);
  const loaiShort = LOAI_SHORT[row.loai] || row.loai;
  const moTa = row.mo_ta || "";

  // Tên dịch vụ: phần trước " - " hoặc " (" đầu tiên
  let tenDichVu = moTa.split(" - ")[0] || moTa;
  // Bỏ ghi chú "(trưa)/(tối)" trong tên NH nếu có
  tenDichVu = tenDichVu.replace(/\s*\([^)]*\)\s*$/, "").trim();

  // Trích ngày dd/MM hoặc dd/M từ mo_ta. Hỗ trợ "(20/05)", "(20/5)", "20/05"
  const dates: { d: number; mo: number }[] = [];
  const re = /(\d{1,2})\/(\d{1,2})(?!\d)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(moTa))) {
    const d = +m[1];
    const mo = +m[2];
    if (d >= 1 && d <= 31 && mo >= 1 && mo <= 12) dates.push({ d, mo });
  }
  dates.sort((a, b) => a.mo - b.mo || a.d - b.d);

  let dateRange = "";
  if (dates.length === 1) {
    dateRange = `${dates[0].d}/${dates[0].mo}`;
  } else if (dates.length >= 2) {
    const first = dates[0];
    const last = dates[dates.length - 1];
    if (row.loai === "khach_san") {
      // Check-out = đêm cuối + 1 (vd: ngủ 19,20,21 → check-out 22)
      const year = new Date().getFullYear();
      const co = new Date(year, last.mo - 1, last.d);
      co.setDate(co.getDate() + 1);
      dateRange = `${first.d}/${first.mo}-${co.getDate()}/${co.getMonth() + 1}`;
    } else {
      dateRange = first.d === last.d && first.mo === last.mo
        ? `${first.d}/${first.mo}`
        : `${first.d}/${first.mo}-${last.d}/${last.mo}`;
    }
  }

  // Bỏ "doan " prefix nếu ten_doan đã chứa sẵn (tránh "doan doan XXX")
  const doan = stripPrefix(row.ten_doan || "", "doan ");
  // Sentinel "code doan" / "code đoàn" → OP báo dùng tên đoàn làm code → bỏ qua insert
  const rawCode = noDiacritics((row.code_ncc || "").trim()).toLowerCase();
  const codeIsDoanSentinel = rawCode === "code doan" || rawCode === "doan";
  // Bỏ "code " prefix nếu code_ncc đã chứa sẵn (tránh "code code XXX")
  const codeNcc = codeIsDoanSentinel ? "" : stripPrefix(row.code_ncc || "", "code ");
  // Nếu code NCC trùng với tên đoàn → bỏ qua (tránh trùng lặp với "doan XXX")
  const showCode = codeNcc && codeNcc.toLowerCase() !== doan.toLowerCase();
  const parts: string[] = [`S8 tt ${ncc}`.trim()];
  const svPart = [loaiShort, tenDichVu].filter(Boolean).join(" ").trim();
  if (svPart) parts.push(`- ${svPart}`);
  if (dateRange) parts.push(dateRange);
  if (showCode) parts.push(`code ${codeNcc}`);
  if (doan) parts.push(`doan ${doan}`);

  return noDiacritics(parts.join(" "));
}
