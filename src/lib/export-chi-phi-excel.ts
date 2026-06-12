import { format } from "date-fns";
import { saveAs } from "file-saver";
import type { ChiPhiRow, DNTTRow } from "@/hooks/use-chi-phi";
import type { HDVSectionData } from "@/hooks/use-chi-phi-hdv";
import { computePhaiThu } from "@/lib/phai-thu-calc";

type CellStyle = "text" | "title" | "section" | "header" | "label" | "number" | "note" | "total" | "total_number";

interface SheetCell {
  value: string | number | null | undefined;
  style?: CellStyle;
  colSpan?: number;
}

interface SheetDefinition {
  name: string;
  columns: number[];
  rows: SheetCell[][];
}

/** Đoàn (joined) — chỉ các field export đọc; tất cả optional cho linh hoạt. */
export interface ExportDoan {
  id?: number | null;
  ten_doan?: string | null;
  ngay_di?: string | null;
  ngay_ve?: string | null;
  so_khach?: number | null;
  so_khach_lon?: number | null;
  so_khach_em1?: number | null;
  so_khach_em2?: number | null;
  so_khach_tl?: number | null;
  truong_doan?: string | null;
  bang_don?: string | null;
  tang_pham?: unknown;
  shopping?: boolean | null;
  chuyen_bay_don?: string | null;
  chuyen_bay_tien?: string | null;
  assigned_to?: string | null;
  agents?: { ten?: string | null } | null;
  huong_dan_vien?: { ten?: string | null } | null;
  xe?: {
    ten_xe?: string | null;
    so_cho?: number | null;
    nha_xe?: { ten?: string | null } | null;
  } | null;
  // Phải thu — Tip + Thu tiền đầu khách + Thu tiền quỹ VP (override fields trên doan)
  thu_tip?: boolean | null;
  tip_rate?: number | null;
  tip_so_khach_override?: number | null;
  tip_so_ngay_override?: number | null;
  tip_lump_sum?: number | null;
  tip_currency?: string | null;
  tip_nguoi_thu?: string | null;
  tip_ty_gia?: number | null;
  dau_khach_rate?: number | null;
  dau_khach_nguoi_thu?: string | null;
  dau_khach_so_khach_override?: number | null;
  quy_vp_amount?: number | null;
  quy_vp_nguoi_thu?: string | null;
  phai_thu_extras?: unknown;
}

/** Row ngày KS — export chỉ đọc các field này. */
export interface ExportKsNgayRow {
  id?: number;
  khach_san_id?: number | null;
  ngay_so?: number | null;
  ngay_date?: string | null;
  ks_ma_code?: string | null;
  ks_loai_phong?: string | null;
}

/** Thông tin KS map — export chỉ đọc tên + FOC; permissive cho field phụ. */
export interface ExportKsInfo {
  ten?: string | null;
  foc_khach?: number | null;
  foc_mien?: number | null;
  [key: string]: unknown;
}

interface ExportChiPhiDoanExcelParams {
  doan: ExportDoan;
  chiPhiRows: ChiPhiRow[];
  dnttList: DNTTRow[];
  hdvData?: HDVSectionData | null;
  opName?: string;
  ksData?: { ngayRows: ExportKsNgayRow[]; khachSanMap: Record<number, ExportKsInfo> } | null;
  /** Tỷ giá NDT → VND (lưu local trong UI). Default 800. */
  tyGiaNdt?: number;
  /**
   * Chế độ xuất:
   * - "full" (mặc định): đủ 4 sheet (Hành trình + Tổng hợp + Chi tiết + Thanh toán).
   * - "hdv": chỉ sheet Hành trình (in cho HDV).
   */
  mode?: "full" | "hdv";
}

const encoder = new TextEncoder();

const DANH_MUC_LABELS: Record<string, string> = {
  khach_san: "Khách sạn",
  nha_hang: "Nhà hàng",
  canh_diem: "Dịch vụ",
  xe: "Xe",
  visa: "Visa",
  bao_hiem: "Bảo hiểm",
};

const LOAI_LABELS: Record<string, string> = {
  chi: "Chi phí",
  dich_vu: "Dịch vụ",
  visa: "Visa",
  xe: "Xe",
  bao_hiem: "Bảo hiểm",
  hdv: "HDV",
  hdv_phat_sinh: "HDV phát sinh",
  khach_san: "Khách sạn",
  nha_hang: "Nhà hàng",
  dinh_ky: "Định kỳ",
};

const REF_LOAI_LABELS: Record<string, string> = {
  doan_chi_phi: "Chi phí đoàn",
  khach_san: "Khách sạn",
  can_tru_cong_no: "Cấn trừ công nợ",
  hdv_tam_ung: "HDV tạm ứng",
  hdv_quyet_toan: "HDV quyết toán",
  dinh_ky: "Định kỳ",
};

const DNTT_STATUS_LABELS: Record<string, string> = {
  chua_tao: "Chưa tạo",
  cho_duyet: "Chờ duyệt",
  da_duyet: "Đã duyệt",
  tu_choi: "Từ chối",
  da_thanh_toan: "Đã thanh toán",
  cong_no: "Công nợ",
  hoan_tien: "Hoàn tiền",
  can_tru: "Cấn trừ",
  da_can_tru: "Đã cấn trừ",
};

const PAYMENT_STATUS_LABELS: Record<string, string> = {
  // doan_chi_phi.trang_thai_thanh_toan
  unpaid: "Chưa thanh toán",
  partial_paid: "Một phần",
  paid: "Đã thanh toán",
  // de_nghi_thanh_toan view payment_status
  partial: "Một phần",
};

const APPROVAL_STATUS_LABELS: Record<string, string> = {
  cho_duyet: "Chờ duyệt",
  da_duyet: "Đã duyệt",
  tu_choi: "Từ chối",
  da_huy: "Đã hủy",
};

const COMPANY_CATEGORY_ORDER = [
  { key: "khach_san", label: "Khách sạn" },
  { key: "nha_hang", label: "Nhà hàng" },
  { key: "canh_diem", label: "Dịch vụ" },
  { key: "xe", label: "Xe" },
  { key: "visa", label: "Visa" },
  { key: "bao_hiem", label: "Bảo hiểm" },
];

const STYLE_IDS: Record<CellStyle, number> = {
  text: 0,
  title: 1,
  section: 2,
  header: 3,
  label: 4,
  number: 5,
  note: 6,
  total: 7,
  total_number: 8,
};

function cell(value: SheetCell["value"], style: CellStyle = "text", colSpan = 1): SheetCell {
  return { value, style, colSpan };
}

function humanize(value?: string | null): string {
  if (!value) return "—";
  const withSpaces = value.replace(/_/g, " ").trim();
  if (!withSpaces) return "—";
  return withSpaces.charAt(0).toUpperCase() + withSpaces.slice(1);
}

function formatDateValue(value?: string | null, withTime = false): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return format(date, withTime ? "dd/MM/yyyy HH:mm" : "dd/MM/yyyy");
}

function getSoKhach(doan: ExportDoan): number {
  return (
    (doan?.so_khach_lon ?? 0) +
    (doan?.so_khach_em1 ?? 0) +
    (doan?.so_khach_em2 ?? 0) +
    (doan?.so_khach_tl ?? 0) ||
    doan?.so_khach ||
    0
  );
}

/**
 * Text "Số khách" cho export — khớp breakdown hiển thị trên trang điều tour
 * (NL · TE 50% · TE free · T/L · Tổng). Bỏ qua category = 0 cho gọn.
 * VD: "49 khách (42 NL, 5 TE 50%, 1 TE free, 1 TL)".
 */
export function getSoKhachText(doan: ExportDoan): string {
  const total = getSoKhach(doan);
  const lon = doan?.so_khach_lon ?? 0;
  const em1 = doan?.so_khach_em1 ?? 0; // TE 50%
  const em2 = doan?.so_khach_em2 ?? 0; // TE free
  const tl = doan?.so_khach_tl ?? 0;
  const parts: string[] = [];
  if (lon) parts.push(`${lon} NL`);
  if (em1) parts.push(`${em1} TE 50%`);
  if (em2) parts.push(`${em2} TE free`);
  if (tl) parts.push(`${tl} TL`);
  return parts.length ? `${total} khách (${parts.join(", ")})` : `${total} khách`;
}

function getXeText(doan: ExportDoan): string {
  if (!doan?.xe) return "—";
  return [
    doan.xe.nha_xe?.ten,
    doan.xe.ten_xe,
    doan.xe.so_cho ? `${doan.xe.so_cho} chỗ` : "",
  ]
    .filter(Boolean)
    .join(" · ") || "—";
}

function getHdvText(doan: ExportDoan, hdvData?: HDVSectionData | null): string {
  return doan?.huong_dan_vien?.ten || hdvData?.hdv?.ten || "—";
}

function getDateRangeText(doan: ExportDoan): string {
  if (!doan?.ngay_di || !doan?.ngay_ve) return "—";
  return `${formatDateValue(doan.ngay_di)} -> ${formatDateValue(doan.ngay_ve)}`;
}

function getDanhMucLabel(value?: string | null): string {
  return DANH_MUC_LABELS[value ?? ""] ?? humanize(value);
}

function getLoaiLabel(value?: string | null): string {
  return LOAI_LABELS[value ?? ""] ?? humanize(value);
}

function getRefLoaiLabel(value?: string | null): string {
  return REF_LOAI_LABELS[value ?? ""] ?? humanize(value);
}

function getDnttStatusLabel(value?: string | null): string {
  return DNTT_STATUS_LABELS[value ?? ""] ?? humanize(value);
}

function getPaymentStatusLabel(value?: string | null): string {
  return PAYMENT_STATUS_LABELS[value ?? ""] ?? humanize(value);
}

function getApprovalStatusLabel(value?: string | null): string {
  return APPROVAL_STATUS_LABELS[value ?? ""] ?? humanize(value);
}

function isActiveChiPhi(row: ChiPhiRow): boolean {
  return row.trang_thai_dntt !== "cong_no" && row.trang_thai_dntt !== "hoan_tien";
}

function isActiveDntt(row: DNTTRow): boolean {
  return (
    row.trang_thai_duyet !== "da_huy" &&
    row.trang_thai_duyet !== "tu_choi"
  );
}

function getActualSummaryValue(row: ChiPhiRow): number {
  if (row.danh_muc === "khach_san" || row.danh_muc === "nha_hang") {
    return row.thanh_tien_thuc_te ?? row.thanh_tien ?? 0;
  }
  return row.tien_cong_ty || 0;
}

function sumBy(rows: ChiPhiRow[], predicate: (row: ChiPhiRow) => boolean, selector: (row: ChiPhiRow) => number): number {
  return rows.filter(predicate).reduce((sum, row) => sum + selector(row), 0);
}

function getDoiTuongText(row: DNTTRow, hdvData?: HDVSectionData | null): string {
  if (row.ten_nha_cung_cap) return row.ten_nha_cung_cap;
  if (row.ref_loai === "hdv_tam_ung" || row.ref_loai === "hdv_quyet_toan" || row.loai === "hdv") {
    return hdvData?.hdv?.ten || "HDV";
  }
  if (row.nha_cung_cap_id) return `NCC #${row.nha_cung_cap_id}`;
  return "—";
}

function sanitizeWorksheetName(name: string): string {
  return name.replace(/[\\/*?:[\]]/g, " ").trim().slice(0, 31) || "Sheet";
}

function sanitizeFilename(name: string): string {
  return name.replace(/[\\/:*?"<>|]/g, "-").trim();
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function columnName(index: number): string {
  let value = index;
  let result = "";
  while (value > 0) {
    const remainder = (value - 1) % 26;
    result = String.fromCharCode(65 + remainder) + result;
    value = Math.floor((value - 1) / 26);
  }
  return result;
}

function toXmlCell(ref: string, sheetCell: SheetCell): string {
  const styleId = STYLE_IDS[sheetCell.style ?? (typeof sheetCell.value === "number" ? "number" : "text")];

  if (typeof sheetCell.value === "number" && Number.isFinite(sheetCell.value)) {
    return `<c r="${ref}" s="${styleId}"><v>${sheetCell.value}</v></c>`;
  }

  const text = sheetCell.value == null ? "" : String(sheetCell.value);
  return `<c r="${ref}" s="${styleId}" t="inlineStr"><is><t xml:space="preserve">${escapeXml(text)}</t></is></c>`;
}

function buildSheetXml(sheet: SheetDefinition): string {
  const merges: string[] = [];
  let maxColumn = 1;

  const rowsXml = sheet.rows.map((row, rowIndex) => {
    const rowNumber = rowIndex + 1;
    let columnIndex = 1;
    const cellsXml: string[] = [];

    row.forEach((sheetCell) => {
      const span = Math.max(1, sheetCell.colSpan ?? 1);
      const ref = `${columnName(columnIndex)}${rowNumber}`;
      const hasValue =
        sheetCell.value !== undefined &&
        sheetCell.value !== null &&
        String(sheetCell.value).length > 0;

      if (hasValue) {
        cellsXml.push(toXmlCell(ref, sheetCell));
      }

      if (span > 1) {
        merges.push(`${ref}:${columnName(columnIndex + span - 1)}${rowNumber}`);
      }

      columnIndex += span;
    });

    maxColumn = Math.max(maxColumn, columnIndex - 1);

    if (cellsXml.length === 0) {
      return `<row r="${rowNumber}"/>`;
    }

    return `<row r="${rowNumber}">${cellsXml.join("")}</row>`;
  });

  const colsXml = sheet.columns
    .map((width, index) => `<col min="${index + 1}" max="${index + 1}" width="${width}" customWidth="1"/>`)
    .join("");

  const lastColumn = Math.max(maxColumn, sheet.columns.length, 1);
  const dimension = `A1:${columnName(lastColumn)}${Math.max(sheet.rows.length, 1)}`;
  const mergeXml = merges.length > 0
    ? `<mergeCells count="${merges.length}">${merges.map((ref) => `<mergeCell ref="${ref}"/>`).join("")}</mergeCells>`
    : "";

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <dimension ref="${dimension}"/>
  <sheetViews><sheetView workbookViewId="0"/></sheetViews>
  <sheetFormatPr defaultRowHeight="15"/>
  <cols>${colsXml}</cols>
  <sheetData>${rowsXml.join("")}</sheetData>
  ${mergeXml}
</worksheet>`;
}

function buildWorkbookXml(sheets: SheetDefinition[]): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <bookViews>
    <workbookView xWindow="0" yWindow="0" windowWidth="24000" windowHeight="12000"/>
  </bookViews>
  <sheets>
    ${sheets.map((sheet, index) => `<sheet name="${escapeXml(sanitizeWorksheetName(sheet.name))}" sheetId="${index + 1}" r:id="rId${index + 2}"/>`).join("")}
  </sheets>
</workbook>`;
}

function buildWorkbookRelsXml(sheets: SheetDefinition[]): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
  ${sheets.map((_, index) => `<Relationship Id="rId${index + 2}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`).join("")}
</Relationships>`;
}

function buildRootRelsXml(): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
</Relationships>`;
}

function buildContentTypesXml(sheets: SheetDefinition[]): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
  ${sheets.map((_, index) => `<Override PartName="/xl/worksheets/sheet${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("")}
  <Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
  <Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
</Types>`;
}

function buildStylesXml(): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <numFmts count="1">
    <numFmt numFmtId="164" formatCode="#,##0"/>
  </numFmts>
  <fonts count="4">
    <font><sz val="11"/><name val="Arial"/><family val="2"/></font>
    <font><sz val="11"/><name val="Arial"/><family val="2"/><b/><color rgb="FFFFFFFF"/></font>
    <font><sz val="11"/><name val="Arial"/><family val="2"/><b/></font>
    <font><sz val="11"/><name val="Arial"/><family val="2"/><i/></font>
  </fonts>
  <fills count="7">
    <fill><patternFill patternType="none"/></fill>
    <fill><patternFill patternType="gray125"/></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FF1D4ED8"/><bgColor indexed="64"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FF1F2937"/><bgColor indexed="64"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFE5E7EB"/><bgColor indexed="64"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFF9FAFB"/><bgColor indexed="64"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFFFF3CD"/><bgColor indexed="64"/></patternFill></fill>
  </fills>
  <borders count="2">
    <border><left/><right/><top/><bottom/><diagonal/></border>
    <border>
      <left style="thin"><color rgb="FFD1D5DB"/></left>
      <right style="thin"><color rgb="FFD1D5DB"/></right>
      <top style="thin"><color rgb="FFD1D5DB"/></top>
      <bottom style="thin"><color rgb="FFD1D5DB"/></bottom>
      <diagonal/>
    </border>
  </borders>
  <cellStyleXfs count="1">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0"/>
  </cellStyleXfs>
  <cellXfs count="9">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1">
      <alignment vertical="top" wrapText="1"/>
    </xf>
    <xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1">
      <alignment horizontal="center" vertical="center" wrapText="1"/>
    </xf>
    <xf numFmtId="0" fontId="1" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1">
      <alignment vertical="center" wrapText="1"/>
    </xf>
    <xf numFmtId="0" fontId="2" fillId="4" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1">
      <alignment horizontal="center" vertical="center" wrapText="1"/>
    </xf>
    <xf numFmtId="0" fontId="2" fillId="5" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1">
      <alignment vertical="center" wrapText="1"/>
    </xf>
    <xf numFmtId="164" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1" applyAlignment="1">
      <alignment horizontal="right" vertical="top"/>
    </xf>
    <xf numFmtId="0" fontId="3" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1" applyAlignment="1">
      <alignment vertical="top" wrapText="1"/>
    </xf>
    <xf numFmtId="0" fontId="2" fillId="6" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1">
      <alignment vertical="center" wrapText="1"/>
    </xf>
    <xf numFmtId="164" fontId="2" fillId="6" borderId="1" xfId="0" applyFont="1" applyNumberFormat="1" applyFill="1" applyBorder="1" applyAlignment="1">
      <alignment horizontal="right" vertical="top"/>
    </xf>
  </cellXfs>
  <cellStyles count="1">
    <cellStyle name="Normal" xfId="0" builtinId="0"/>
  </cellStyles>
</styleSheet>`;
}

function buildAppXml(sheets: SheetDefinition[]): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">
  <Application>Microsoft Excel</Application>
  <DocSecurity>0</DocSecurity>
  <ScaleCrop>false</ScaleCrop>
  <HeadingPairs>
    <vt:vector size="2" baseType="variant">
      <vt:variant><vt:lpstr>Worksheets</vt:lpstr></vt:variant>
      <vt:variant><vt:i4>${sheets.length}</vt:i4></vt:variant>
    </vt:vector>
  </HeadingPairs>
  <TitlesOfParts>
    <vt:vector size="${sheets.length}" baseType="lpstr">
      ${sheets.map((sheet) => `<vt:lpstr>${escapeXml(sanitizeWorksheetName(sheet.name))}</vt:lpstr>`).join("")}
    </vt:vector>
  </TitlesOfParts>
  <Company></Company>
  <LinksUpToDate>false</LinksUpToDate>
  <SharedDoc>false</SharedDoc>
  <HyperlinksChanged>false</HyperlinksChanged>
  <AppVersion>16.0300</AppVersion>
</Properties>`;
}

function buildCoreXml(): string {
  const now = new Date().toISOString();
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <dc:creator>Codex</dc:creator>
  <cp:lastModifiedBy>Codex</cp:lastModifiedBy>
  <dcterms:created xsi:type="dcterms:W3CDTF">${now}</dcterms:created>
  <dcterms:modified xsi:type="dcterms:W3CDTF">${now}</dcterms:modified>
</cp:coreProperties>`;
}

function createCrc32Table(): Uint32Array {
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let current = index;
    for (let bit = 0; bit < 8; bit += 1) {
      current = (current & 1) !== 0 ? 0xedb88320 ^ (current >>> 1) : current >>> 1;
    }
    table[index] = current >>> 0;
  }
  return table;
}

const crc32Table = createCrc32Table();

function crc32(data: Uint8Array): number {
  let current = 0xffffffff;
  for (let index = 0; index < data.length; index += 1) {
    current = crc32Table[(current ^ data[index]) & 0xff] ^ (current >>> 8);
  }
  return (current ^ 0xffffffff) >>> 0;
}

function getDosDateTime(date = new Date()): { time: number; day: number } {
  const year = Math.max(date.getFullYear(), 1980);
  const time = ((date.getHours() & 0x1f) << 11) | ((date.getMinutes() & 0x3f) << 5) | (Math.floor(date.getSeconds() / 2) & 0x1f);
  const day = (((year - 1980) & 0x7f) << 9) | (((date.getMonth() + 1) & 0x0f) << 5) | (date.getDate() & 0x1f);
  return { time, day };
}

function createZipBlob(files: Array<{ name: string; content: string }>): Blob {
  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  const { time, day } = getDosDateTime();
  let offset = 0;

  files.forEach((file) => {
    const nameBytes = encoder.encode(file.name);
    const dataBytes = encoder.encode(file.content);
    const checksum = crc32(dataBytes);

    const localHeader = new Uint8Array(30);
    const localView = new DataView(localHeader.buffer);
    localView.setUint32(0, 0x04034b50, true);
    localView.setUint16(4, 20, true);
    localView.setUint16(6, 0x0800, true);
    localView.setUint16(8, 0, true);
    localView.setUint16(10, time, true);
    localView.setUint16(12, day, true);
    localView.setUint32(14, checksum, true);
    localView.setUint32(18, dataBytes.length, true);
    localView.setUint32(22, dataBytes.length, true);
    localView.setUint16(26, nameBytes.length, true);
    localView.setUint16(28, 0, true);

    localParts.push(localHeader, nameBytes, dataBytes);

    const centralHeader = new Uint8Array(46);
    const centralView = new DataView(centralHeader.buffer);
    centralView.setUint32(0, 0x02014b50, true);
    centralView.setUint16(4, 20, true);
    centralView.setUint16(6, 20, true);
    centralView.setUint16(8, 0x0800, true);
    centralView.setUint16(10, 0, true);
    centralView.setUint16(12, time, true);
    centralView.setUint16(14, day, true);
    centralView.setUint32(16, checksum, true);
    centralView.setUint32(20, dataBytes.length, true);
    centralView.setUint32(24, dataBytes.length, true);
    centralView.setUint16(28, nameBytes.length, true);
    centralView.setUint16(30, 0, true);
    centralView.setUint16(32, 0, true);
    centralView.setUint16(34, 0, true);
    centralView.setUint16(36, 0, true);
    centralView.setUint32(38, 0, true);
    centralView.setUint32(42, offset, true);

    centralParts.push(centralHeader, nameBytes);

    offset += localHeader.length + nameBytes.length + dataBytes.length;
  });

  const centralSize = centralParts.reduce((sum, part) => sum + part.length, 0);
  const endHeader = new Uint8Array(22);
  const endView = new DataView(endHeader.buffer);
  endView.setUint32(0, 0x06054b50, true);
  endView.setUint16(4, 0, true);
  endView.setUint16(6, 0, true);
  endView.setUint16(8, files.length, true);
  endView.setUint16(10, files.length, true);
  endView.setUint32(12, centralSize, true);
  endView.setUint32(16, offset, true);
  endView.setUint16(20, 0, true);

  return new Blob([...localParts, ...centralParts, endHeader] as BlobPart[], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

function buildHanhTrinhSheet(params: ExportChiPhiDoanExcelParams): SheetDefinition {
  const { doan, chiPhiRows, hdvData, opName, ksData } = params;
  // In cho HDV: ẩn đơn giá phòng khách sạn (HDV không cần thấy giá KS).
  const hideKsPrice = params.mode === "hdv";

  const ngayRowById: Record<number, ExportKsNgayRow> = {};
  (ksData?.ngayRows || []).forEach((r) => { if (r.id != null) ngayRowById[r.id] = r; });

  const activeRows = chiPhiRows.filter(isActiveChiPhi);
  const ksRows = activeRows.filter((r) => r.danh_muc === "khach_san");
  const nhRows = activeRows.filter((r) => r.danh_muc === "nha_hang");
  const veRows = activeRows.filter((r) => r.danh_muc === "canh_diem");
  const dvRows = activeRows.filter((r) => !["khach_san", "nha_hang", "canh_diem"].includes(r.danh_muc));

  function ngaySoToDate(ngaySo: number | null): string {
    if (!ngaySo || ngaySo <= 0 || !doan?.ngay_di) return "—";
    const d = new Date(doan.ngay_di + "T00:00:00");
    d.setDate(d.getDate() + ngaySo - 1);
    return format(d, "dd/MM/yyyy");
  }

  function parseNH(moTa: string | null): { bua: "trua" | "toi" | null; name: string } {
    if (!moTa) return { bua: null, name: "—" };
    if (moTa.startsWith("[trua] ")) return { bua: "trua", name: moTa.slice(7) };
    if (moTa.startsWith("[toi] ")) return { bua: "toi", name: moTa.slice(6) };
    const m = moTa.match(/^(.+)\s+\((trưa|tối)\)$/);
    if (m) return { bua: m[2] === "trưa" ? "trua" : "toi", name: m[1] };
    return { bua: null, name: moTa };
  }

  const rows: SheetCell[][] = [];

  // ─── HEADER ───
  const soKhachText = getSoKhachText(doan);
  const quaTang = Array.isArray(doan?.tang_pham)
    ? (doan.tang_pham as string[]).join(", ")
    : doan?.tang_pham ? String(doan.tang_pham) : "—";
  const shopText = doan?.shopping ? "SHOPPING" : "NO SHOPPING";

  rows.push([cell("HÀNH TRÌNH TOUR", "title", 10)]);
  rows.push([cell("", "text", 10)]);
  rows.push([
    cell("Đoàn", "label"), cell(doan?.ten_doan || "—", "text", 4),
    cell("Đón đoàn", "label"), cell(doan?.truong_doan || doan?.bang_don || "—", "text", 4),
  ]);
  rows.push([
    cell("Số khách", "label"), cell(soKhachText, "text", 4),
    cell("Ngày", "label"), cell(`${formatDateValue(doan?.ngay_di)} - ${formatDateValue(doan?.ngay_ve)}`, "text", 4),
  ]);
  rows.push([
    cell("Hướng dẫn", "label"), cell(getHdvText(doan, hdvData), "text", 4),
    cell("Tính chất đoàn", "label"), cell(shopText, "text", 4),
  ]);
  rows.push([
    cell("Nhà xe", "label"), cell(getXeText(doan), "text", 4),
    cell("Điều hành xe", "label"), cell("—", "text", 4),
  ]);
  rows.push([
    cell("Quà tặng", "label"), cell(quaTang, "text", 4),
    cell("Tính toán", "label"), cell(opName || "—", "text", 4),
  ]);
  rows.push([
    cell("Chuyến bay đón", "label"), cell(doan?.chuyen_bay_don || "—", "text", 4),
    cell("Chuyến bay tiễn", "label"), cell(doan?.chuyen_bay_tien || "—", "text", 4),
  ]);
  rows.push([cell("", "text", 10)]);

  // ─── KHÁCH SẠN ───
  rows.push([cell("KHÁCH SẠN 飯店 — Khách sạn không có phòng nội bộ 飯店", "section", 10)]);
  rows.push([
    cell("DATE日期", "header"), cell("KHÁCH SẠN 飯店", "header"), cell("LOẠI PHÒNG", "header"),
    cell("C/I 入境", "header"), cell("C/O 出境", "header"), cell("ROOMS 數量", "header"),
    cell("FOC 16免1", "header"), cell(hideKsPrice ? "" : "PRICE 價格", "header"),
    cell("HDV TT 導遊付款", "header"), cell("CTY TT 公司付款", "header"),
  ]);

  // KS: mỗi đêm 1 dòng (lịch từ doan_ngay) + GỘP chi phí phòng vào CÙNG dòng.
  // Chi phí KS (doan_chi_phi) trỏ về đúng đêm qua ref_doan_ngay_id (ngày check-in =
  // đêm ở KS đó) → map cost (SL/FOC/đơn giá/tiền) lên dòng lịch tương ứng. Mỗi đêm
  // có thể >1 khoản (phòng + dịch vụ) → khoản đầu inline, khoản thêm xuống dòng phụ.
  let totalHdvKS = 0, totalCtyKS = 0;
  const ksCostByNgay = new Map<number, ChiPhiRow[]>();
  const ksCostNoRef: ChiPhiRow[] = [];
  for (const row of ksRows) {
    totalHdvKS += row.tien_hdv || 0;
    totalCtyKS += row.tien_cong_ty || 0;
    if (row.ref_doan_ngay_id != null) {
      const arr = ksCostByNgay.get(row.ref_doan_ngay_id) || [];
      arr.push(row);
      ksCostByNgay.set(row.ref_doan_ngay_id, arr);
    } else {
      ksCostNoRef.push(row);
    }
  }
  const focFromRow = (row: ChiPhiRow): string =>
    row.foc_khach_snapshot && row.foc_mien_snapshot
      ? `${row.foc_khach_snapshot}免${row.foc_mien_snapshot}` : "";

  const ksNgayRows = (ksData?.ngayRows || []).filter((n) => n.khach_san_id);
  const ksNgaySorted = [...ksNgayRows].sort((a, b) =>
    (a.ngay_date || "").localeCompare(b.ngay_date || ""),
  );
  const consumedNgayIds = new Set<number>();
  for (const ngayRow of ksNgaySorted) {
    const ks = ngayRow.khach_san_id != null
      ? ksData?.khachSanMap?.[ngayRow.khach_san_id]
      : undefined;
    const hotelName = ks?.ten || "—";
    const ciDateStr = ngayRow?.ngay_date ? formatDateValue(ngayRow.ngay_date) : "—";
    const coDateRaw = ngayRow?.ngay_date ? new Date(ngayRow.ngay_date + "T00:00:00") : null;
    if (coDateRaw) coDateRaw.setDate(coDateRaw.getDate() + 1);
    const coDateStr = coDateRaw ? format(coDateRaw, "dd/MM/yyyy") : "—";
    const bookingCode = ngayRow?.ks_ma_code || "code đoàn";

    const costs = ngayRow.id != null ? (ksCostByNgay.get(ngayRow.id) || []) : [];
    if (ngayRow.id != null) consumedNgayIds.add(ngayRow.id);
    const main = costs[0];
    const focText = main
      ? (focFromRow(main) || "—")
      : (ks?.foc_khach && ks?.foc_mien ? `${ks.foc_khach}免${ks.foc_mien}` : "—");
    const hdvAmt = main?.tien_hdv || 0;
    const ctyAmt = main?.tien_cong_ty || 0;

    rows.push([
      cell(ciDateStr),
      cell(hotelName),
      cell(ngayRow?.ks_loai_phong || "—"),
      cell(ciDateStr),
      cell(coDateStr),
      main ? cell(main.so_luong || 0, "number") : cell(""),  // ROOMS
      cell(focText),
      hideKsPrice || !main ? cell("") : cell(main.don_gia || 0, "number"),   // PRICE
      // HDV TT: in cho HDV → luôn giữ code đặt phòng (ẩn tiền). Bình thường:
      // tiền nếu HDV trả; ngược lại giữ code đặt phòng (KS thường CTY trả).
      hideKsPrice ? cell(bookingCode) : (hdvAmt > 0 ? cell(hdvAmt, "number") : cell(bookingCode)),
      hideKsPrice ? cell("") : (ctyAmt > 0 ? cell(ctyAmt, "number") : cell("")),  // CTY TT
    ]);

    // Khoản phụ cùng đêm (loại phòng 2 / dịch vụ) → dòng phụ ngay dưới.
    for (const extra of costs.slice(1)) {
      const exHdv = extra.tien_hdv || 0;
      const exCty = extra.tien_cong_ty || 0;
      rows.push([
        cell(""), cell(""),
        cell((extra.mo_ta || "").trim() || "—", "text"),
        cell(""), cell(""),
        cell(extra.so_luong || 0, "number"),
        cell(focFromRow(extra) || "—"),
        hideKsPrice ? cell("") : cell(extra.don_gia || 0, "number"),
        hideKsPrice ? cell("") : (exHdv > 0 ? cell(exHdv, "number") : cell("")),
        hideKsPrice ? cell("") : (exCty > 0 ? cell(exCty, "number") : cell("")),
      ]);
    }
  }

  // Khoản KS không map được vào lịch (không ref / đêm bị gộp nhóm) — vẫn in để
  // không sót + đã nằm trong tổng.
  const ksLeftover = [...ksCostNoRef];
  for (const [ngayId, arr] of [...ksCostByNgay.entries()]) {
    if (!consumedNgayIds.has(ngayId)) ksLeftover.push(...arr);
  }
  for (const row of ksLeftover) {
    const hdvAmt = row.tien_hdv || 0;
    const ctyAmt = row.tien_cong_ty || 0;
    rows.push([
      cell("—"), cell("—"),
      cell((row.mo_ta || "").trim() || "Phòng", "text"),
      cell("—"), cell("—"),
      cell(row.so_luong || 0, "number"),
      cell(focFromRow(row) || "—"),
      hideKsPrice ? cell("") : cell(row.don_gia || 0, "number"),
      hideKsPrice ? cell("") : (hdvAmt > 0 ? cell(hdvAmt, "number") : cell("")),
      hideKsPrice ? cell("") : (ctyAmt > 0 ? cell(ctyAmt, "number") : cell("")),
    ]);
  }

  if (ksNgaySorted.length === 0 && ksRows.length === 0) {
    rows.push([cell("(Chưa có dữ liệu)", "note", 10)]);
  }
  // In cho HDV: ẩn dòng tổng tiền KS (HDV không cần thấy chi phí khách sạn).
  if (!hideKsPrice) {
    rows.push([
      cell("TỔNG SỐ TIỀN TT KHÁCH SẠN", "total", 7), cell("VND", "total"),
      cell(totalHdvKS, "total_number"), cell(totalCtyKS, "total_number"),
    ]);
  }
  rows.push([cell("", "text", 10)]);

  // ─── NHÀ HÀNG ───
  // Mỗi chi phí 1 hàng. Trưa/tối tách hàng riêng. 2 cột cuối HDV TT / CTY TT
  // chỉ điền tiền vào cột tương ứng người thanh toán.
  rows.push([cell("NHÀ HÀNG 餐廳 — Nhà hàng có nội bộ 餐廳", "section", 10)]);
  rows.push([
    cell("DATE日期", "header"),
    cell("BỮA 餐", "header"),
    cell("NHÀ HÀNG 餐廳", "header", 3),
    cell("SL 數量", "header"),
    cell("ĐƠN GIÁ 價格", "header"),
    cell("TỔNG 總計", "header"),
    cell("HDV TT 導遊付款", "header"),
    cell("CTY TT 公司付款", "header"),
  ]);

  let totalCtyNH = 0, totalHdvNH = 0;

  const nhByNgaySo = new Map<number, ChiPhiRow[]>();
  for (const row of nhRows) {
    const key = row.ngay_so ?? 0;
    if (!nhByNgaySo.has(key)) nhByNgaySo.set(key, []);
    nhByNgaySo.get(key)!.push(row);
  }
  const sortedNgaySo = [...nhByNgaySo.keys()].sort((a, b) => a - b);

  function mergeNHRows(list: ChiPhiRow[]): ChiPhiRow[] {
    const grouped = new Map<string, ChiPhiRow>();
    for (const r of list) {
      const { name } = parseNH(r.mo_ta);
      const key = `${name}__${r.don_gia}`;
      const ex = grouped.get(key);
      if (ex) {
        ex.so_luong = (ex.so_luong || 0) + (r.so_luong || 0);
        ex.tien_cong_ty = (ex.tien_cong_ty || 0) + (r.tien_cong_ty || 0);
        ex.tien_hdv = (ex.tien_hdv || 0) + (r.tien_hdv || 0);
      } else {
        grouped.set(key, { ...r });
      }
    }
    return [...grouped.values()];
  }

  for (const ngaySo of sortedNgaySo) {
    const dayRows = nhByNgaySo.get(ngaySo)!;
    const dateStr = ngaySo > 0 ? ngaySoToDate(ngaySo) : "—";

    const truaRows = mergeNHRows(dayRows.filter((r) => parseNH(r.mo_ta).bua === "trua"));
    const toiRows = mergeNHRows(dayRows.filter((r) => parseNH(r.mo_ta).bua === "toi"));

    let isFirstKeptRow = true;
    const pushMealRows = (mealRows: ChiPhiRow[], buaLabel: string) => {
      for (const r of mealRows) {
        const name = parseNH(r.mo_ta).name;
        const tong = (r.so_luong || 0) * (r.don_gia || 0);
        const hdvAmt = r.tien_hdv || 0;
        const ctyAmt = r.tien_cong_ty || 0;
        totalHdvNH += hdvAmt;
        totalCtyNH += ctyAmt;
        rows.push([
          cell(isFirstKeptRow ? dateStr : ""),
          cell(buaLabel),
          cell(name, "text", 3),
          cell(r.so_luong || 0, "number"),
          cell(r.don_gia || 0, "number"),
          tong > 0 ? cell(tong, "number") : cell(""),
          hdvAmt > 0 ? cell(hdvAmt, "number") : cell(""),
          ctyAmt > 0 ? cell(ctyAmt, "number") : cell(""),
        ]);
        isFirstKeptRow = false;
      }
    };
    pushMealRows(truaRows, "Trưa");
    pushMealRows(toiRows, "Tối");
  }

  if (nhRows.length === 0) rows.push([cell("(Chưa có dữ liệu)", "note", 10)]);
  rows.push([cell("TỔNG SỐ TIỀN TT NHÀ HÀNG", "total", 7), cell("VND", "total"), cell(totalHdvNH, "total_number"), cell(totalCtyNH, "total_number")]);
  rows.push([cell("", "text", 10)]);

  // ─── VÉ THẮNG CẢNH ───
  rows.push([cell("VÉ THẮNG CẢNH 景點票", "section", 10)]);
  rows.push([
    cell("DATE日期", "header"),
    cell("DIEM THAM QUAN 景點", "header", 5),
    cell("SO PAX", "header"),
    cell("PRICE 價格", "header"),
    cell("HDV TT 導遊付款", "header"),
    cell("CTY TT 公司付款", "header"),
  ]);

  const sortedVeRows = [...veRows].sort((a, b) => {
    if ((a.ngay_so ?? 0) !== (b.ngay_so ?? 0)) return (a.ngay_so ?? 0) - (b.ngay_so ?? 0);
    return (b.ref_doan_ngay_item_id ?? 0) - (a.ref_doan_ngay_item_id ?? 0);
  });
  let totalHdvVE = 0, totalCtyVE = 0;
  for (const row of sortedVeRows) {
    const dateStr = ngaySoToDate(row.ngay_so);
    const hdvAmt = row.tien_hdv || 0;
    const ctyAmt = row.tien_cong_ty || 0;
    totalHdvVE += hdvAmt;
    totalCtyVE += ctyAmt;
    const displayName = (row.mo_ta || "—").replace(/^\[[^\]]+\]\s*/, "");
    rows.push([
      cell(dateStr),
      cell(displayName, "text", 5),
      cell(row.so_luong || 0, "number"),
      cell(row.don_gia || 0, "number"),
      hdvAmt > 0 ? cell(hdvAmt, "number") : cell(""),
      ctyAmt > 0 ? cell(ctyAmt, "number") : cell(""),
    ]);
  }
  if (veRows.length === 0) rows.push([cell("(Chưa có dữ liệu)", "note", 10)]);
  rows.push([cell("TỔNG SỐ TIỀN TT THẮNG CẢNH", "total", 7), cell("VND", "total"), cell(totalHdvVE, "total_number"), cell(totalCtyVE, "total_number")]);
  rows.push([cell("", "text", 10)]);

  // ─── DỊCH VỤ KHÁC ───
  rows.push([cell("DỊCH VỤ KHÁC 其他", "section", 10)]);
  rows.push([
    cell("DATE日期", "header"),
    cell("DICH VU 其他", "header", 5),
    cell("SO PAX", "header"),
    cell("PRICE", "header"),
    cell("HDV TT 導遊付款", "header"),
    cell("CTY TT 公司付款", "header"),
  ]);

  const sortedDvRows = [...dvRows].sort((a, b) => (a.ngay_so ?? 0) - (b.ngay_so ?? 0));
  let totalHdvDV = 0, totalCtyDV = 0;
  for (const row of sortedDvRows) {
    const dateStr = ngaySoToDate(row.ngay_so);
    const hdvAmt = row.tien_hdv || 0;
    const ctyAmt = row.tien_cong_ty || 0;
    totalHdvDV += hdvAmt;
    totalCtyDV += ctyAmt;
    const dvDisplayName = (row.mo_ta || getDanhMucLabel(row.danh_muc)).replace(/^\[[^\]]+\]\s*/, "");
    rows.push([
      cell(dateStr),
      cell(dvDisplayName, "text", 5),
      cell(row.so_luong || 0, "number"),
      cell(row.don_gia || 0, "number"),
      hdvAmt > 0 ? cell(hdvAmt, "number") : cell(""),
      ctyAmt > 0 ? cell(ctyAmt, "number") : cell(""),
    ]);
  }
  if (dvRows.length === 0) rows.push([cell("(Chưa có dữ liệu)", "note", 10)]);
  rows.push([cell("TỔNG SỐ TIỀN TT", "total", 7), cell("VND", "total"), cell(totalHdvDV, "total_number"), cell(totalCtyDV, "total_number")]);
  rows.push([cell("", "text", 10)]);

  // ─── PHẢI THU 應收 ─── (Tip + Thu tiền đầu khách + Thu tiền quỹ VP + thu thêm tay)
  // Logic tách ở lib/phai-thu-calc.ts (có unit test). Extras đã persist trong
  // doan.phai_thu_extras → tự xuất qua phaiThu.items.
  const tyGiaNdt = params.tyGiaNdt ?? 800;
  const phaiThu = computePhaiThu(doan, tyGiaNdt);
  const phaiThuShown = phaiThu.items.filter((it) => it.show);

  if (phaiThuShown.length > 0) {
    rows.push([cell("PHẢI THU 應收", "section", 10)]);
    rows.push([
      cell("MỤC 項目", "header", 2),
      cell("SỐ KHÁCH", "header"),
      cell("SỐ NGÀY", "header"),
      cell("ĐƠN GIÁ", "header", 2),
      cell("TỶ GIÁ", "header"),
      cell("NGƯỜI THU", "header"),
      cell("THÀNH TIỀN VND", "header", 2),
    ]);
    for (const it of phaiThuShown) {
      rows.push([
        cell(it.label, "text", 2),
        it.soKhach == null ? cell("—") : cell(it.soKhach, "number"),
        it.soNgay == null ? cell("—") : cell(it.soNgay, "number"),
        cell(`${it.donGia.toLocaleString("vi-VN")} ${it.donViGoc}`, "text", 2),
        cell(it.tyGia, "number"),
        cell(it.nguoiThu === "hdv" ? "HDV thu" : "Công ty thu"),
        cell(it.thanhTienVND, "total_number", 2),
      ]);
    }
    rows.push([cell("Trong đó HDV thu (VND)", "total", 8), cell(phaiThu.hdvVND, "total_number", 2)]);
    rows.push([cell("Trong đó Công ty thu (VND)", "total", 8), cell(phaiThu.ctyVND, "total_number", 2)]);
    rows.push([cell("TỔNG PHẢI THU (VND)", "total", 8), cell(phaiThu.totalVND, "total_number", 2)]);
    rows.push([cell("", "text", 10)]);
  }

  // ─── SUMMARY ───
  const totalHdvAll = totalHdvKS + totalHdvNH + totalHdvVE + totalHdvDV;
  const totalCtyAll = totalCtyKS + totalCtyNH + totalCtyVE + totalCtyDV;

  rows.push([
    cell("TỔNG HDV CHI VND 總計", "section", 2), cell(totalHdvAll, "total_number", 3),
    cell("TỔNG PHẢI THU (VNĐ)", "label"), cell(phaiThu.totalVND, "total_number", 4),
  ]);
  rows.push([
    cell("TỔNG CTY CHI VND 總計", "section", 2), cell(totalCtyAll, "total_number", 3),
    cell("TRONG ĐÓ HDV THU (VNĐ)", "label"), cell(phaiThu.hdvVND, "total_number", 4),
  ]);
  // Còn lại thanh toán cho HDV = tổng HDV chi − HDV thu − tạm ứng đã TT.
  // Âm = HDV phải hoàn lại công ty. Kèm ô tạm ứng bên phải để đọc được phép tính.
  const tamUngDaTT = hdvData?.tamUngDaTT ?? 0;
  const conLaiTraHdv = totalHdvAll - phaiThu.hdvVND - tamUngDaTT;
  rows.push([
    cell(
      conLaiTraHdv >= 0
        ? "CÒN LẠI THANH TOÁN CHO HDV 尚需支付導遊"
        : "HDV HOÀN LẠI CÔNG TY 導遊退回公司",
      "section", 2,
    ),
    cell(Math.abs(conLaiTraHdv), "total_number", 3),
    cell("TẠM ỨNG HDV ĐÃ TT (VNĐ)", "label"), cell(tamUngDaTT, "total_number", 4),
  ]);

  return {
    name: "Hanh Trinh",
    columns: [12, 14, 24, 10, 14, 16, 8, 12, 14, 14],
    rows,
  };
}

function buildSummarySheet(params: ExportChiPhiDoanExcelParams): SheetDefinition {
  const { doan, chiPhiRows, dnttList, hdvData, opName } = params;
  const activeRows = chiPhiRows.filter(isActiveChiPhi);
  const phaiThu = computePhaiThu(doan, params.tyGiaNdt ?? 800);
  const phaiThuShown = phaiThu.items.filter((it) => it.show);

  const companyRows = COMPANY_CATEGORY_ORDER.map(({ key, label }) => {
    const duTru = sumBy(activeRows, (row) => row.danh_muc === key, (row) => row.tien_cong_ty || 0);
    const thucTe = sumBy(activeRows, (row) => row.danh_muc === key, getActualSummaryValue);
    return { label, duTru, thucTe, chenhLech: thucTe - duTru };
  });

  const totalDuTru = companyRows.reduce((sum, row) => sum + row.duTru, 0);
  const totalThucTe = companyRows.reduce((sum, row) => sum + row.thucTe, 0);

  const activeDntts = dnttList.filter(isActiveDntt);
  const tongDeNghi = activeDntts.reduce((sum, row) => sum + row.so_tien, 0);
  const daThanhToan = activeDntts.reduce((sum, row) => sum + (row.paid_amount || 0), 0);
  const choThanhToan = activeDntts.reduce((sum, row) => sum + (row.so_tien - (row.paid_amount || 0)), 0);
  const huyTuChoi = dnttList
    .filter((row) => row.trang_thai_duyet === "da_huy" || row.trang_thai_duyet === "tu_choi")
    .reduce((sum, row) => sum + row.so_tien, 0);

  const hdvBalanceLabel =
    (hdvData?.soConPhaiTra ?? 0) > 0
      ? "Còn phải trả"
      : (hdvData?.soConPhaiTra ?? 0) < 0
        ? "HDV hoàn lại"
        : "Đã đủ";

  return {
    name: "Tong hop",
    columns: [18, 26, 18, 26, 18, 18],
    rows: [
      [cell("BẢNG CHI PHÍ ĐOÀN", "title", 6)],
      [cell(`Xuất lúc: ${formatDateValue(new Date().toISOString(), true)}`, "note", 6)],
      [cell("THÔNG TIN ĐOÀN", "section", 6)],
      [cell("Đoàn", "label"), cell(doan?.ten_doan || "—"), cell("Agent", "label"), cell(doan?.agents?.ten || "—"), cell("Số khách", "label"), cell(getSoKhachText(doan))],
      [cell("Ngày", "label"), cell(getDateRangeText(doan)), cell("HDV", "label"), cell(getHdvText(doan, hdvData)), cell("OP", "label"), cell(opName || doan?.assigned_to || "—")],
      [cell("Xe", "label"), cell(getXeText(doan), "text", 3), cell("Trạng thái xuất", "label"), cell("Chi phí đã lưu", "text", 1)],
      [cell("", "text", 6)],
      [cell("TỔNG HỢP CÔNG TY THANH TOÁN", "section", 6)],
      [cell("Hạng mục", "header"), cell("Dự trù", "header"), cell("Thực tế", "header"), cell("Chênh lệch", "header"), cell("", "header"), cell("", "header")],
      ...companyRows.map((row) => [
        cell(row.label),
        cell(row.duTru, "number"),
        cell(row.thucTe, "number"),
        cell(row.chenhLech, "number"),
        cell("", "text"),
        cell("", "text"),
      ]),
      [cell("Tổng công ty", "label"), cell(totalDuTru, "number"), cell(totalThucTe, "number"), cell(totalThucTe - totalDuTru, "number"), cell("", "text"), cell("", "text")],
      [cell("", "text", 6)],
      [cell("TỔNG HỢP THANH TOÁN", "section", 6)],
      [cell("Chỉ số", "header"), cell("Số tiền", "header"), cell("", "header"), cell("", "header"), cell("", "header"), cell("", "header")],
      [cell("Tổng đề nghị"), cell(tongDeNghi, "number"), cell("", "text"), cell("", "text"), cell("", "text"), cell("", "text")],
      [cell("Đã thanh toán"), cell(daThanhToan, "number"), cell("", "text"), cell("", "text"), cell("", "text"), cell("", "text")],
      [cell("Chờ thanh toán"), cell(choThanhToan, "number"), cell("", "text"), cell("", "text"), cell("", "text"), cell("", "text")],
      [cell("Đã hủy / Từ chối"), cell(huyTuChoi, "number"), cell("", "text"), cell("", "text"), cell("", "text"), cell("", "text")],
      [cell("", "text", 6)],
      [cell("TỔNG HỢP HDV", "section", 6)],
      [cell("HDV", "header"), cell("Tổng HDV chi", "header"), cell("Đã tạm ứng", "header"), cell("Chênh lệch", "header"), cell("Trạng thái", "header"), cell("Đã quyết toán", "header")],
      [
        cell(getHdvText(doan, hdvData)),
        cell(hdvData?.tongHdvChi ?? 0, "number"),
        cell(hdvData?.tamUngDaTT ?? 0, "number"),
        cell(Math.abs(hdvData?.soConPhaiTra ?? 0), "number"),
        cell(hdvBalanceLabel),
        cell(hdvData?.daQuyetToan ? "Có" : "Không"),
      ],
      [cell("", "text", 6)],
      [cell("PHẢI THU (TIP + ĐẦU KHÁCH + QUỸ VP)", "section", 6)],
      [cell("Khoản thu", "header"), cell("Người thu", "header"), cell("Thành tiền (VND)", "header"), cell("", "header"), cell("", "header"), cell("", "header")],
      ...(phaiThuShown.length > 0
        ? phaiThuShown.map((it) => [
            cell(it.label),
            cell(it.nguoiThu === "hdv" ? "HDV thu" : "Công ty thu"),
            cell(it.thanhTienVND, "number"),
            cell("", "text"),
            cell("", "text"),
            cell("", "text"),
          ])
        : [[cell("(Không có khoản phải thu)", "note", 6)]]),
      [cell("HDV thu", "label"), cell("", "text"), cell(phaiThu.hdvVND, "number"), cell("Công ty thu", "label"), cell(phaiThu.ctyVND, "number"), cell("", "text")],
      [cell("Tổng phải thu", "label"), cell("", "text"), cell(phaiThu.totalVND, "number"), cell("", "text"), cell("", "text"), cell("", "text")],
    ],
  };
}

function buildChiTietSheet(params: ExportChiPhiDoanExcelParams): SheetDefinition {
  const { doan, chiPhiRows } = params;
  const totalSoLuong = chiPhiRows.reduce((sum, row) => sum + (row.so_luong || 0), 0);
  const totalThanhTien = chiPhiRows.reduce((sum, row) => sum + (row.thanh_tien || 0), 0);
  const totalThucTe = chiPhiRows.reduce((sum, row) => sum + (row.thanh_tien_thuc_te ?? row.thanh_tien ?? 0), 0);
  const totalCongTy = chiPhiRows.reduce((sum, row) => sum + (row.tien_cong_ty || 0), 0);
  const totalHdv = chiPhiRows.reduce((sum, row) => sum + (row.tien_hdv || 0), 0);

  return {
    name: "Chi tiet chi phi",
    columns: [10, 16, 16, 40, 10, 14, 16, 16, 16, 16, 16, 16, 18, 12, 12],
    rows: [
      [cell(`CHI TIẾT CHI PHÍ - ${doan?.ten_doan || "Đoàn"}`, "title", 15)],
      [
        cell("Ngày số", "header"),
        cell("Hạng mục", "header"),
        cell("Loại", "header"),
        cell("Mô tả", "header"),
        cell("SL", "header"),
        cell("Đơn giá", "header"),
        cell("Thành tiền", "header"),
        cell("Thực tế", "header"),
        cell("Công ty trả", "header"),
        cell("HDV ứng", "header"),
        cell("Trạng thái DNTT", "header"),
        cell("Thanh toán", "header"),
        cell("Ngày thanh toán", "header"),
        cell("Tính dự trù", "header"),
        cell("Định kỳ", "header"),
      ],
      ...chiPhiRows.map((row) => [
        cell(row.ngay_so ?? ""),
        cell(getDanhMucLabel(row.danh_muc)),
        cell(getLoaiLabel(row.loai)),
        cell(row.mo_ta || "—"),
        cell(row.so_luong || 0, "number"),
        cell(row.don_gia || 0, "number"),
        cell(row.thanh_tien || 0, "number"),
        cell(row.thanh_tien_thuc_te ?? row.thanh_tien ?? 0, "number"),
        cell(row.tien_cong_ty || 0, "number"),
        cell(row.tien_hdv || 0, "number"),
        cell(getDnttStatusLabel(row.trang_thai_dntt)),
        cell(getPaymentStatusLabel(row.trang_thai_thanh_toan)),
        cell(formatDateValue(row.ngay_thanh_toan)),
        cell(isActiveChiPhi(row) ? "Có" : "Không"),
        cell(row.thanh_toan_dinh_ky ? "Có" : "Không"),
      ]),
      [
        cell("Tổng", "label"),
        cell("", "text"),
        cell("", "text"),
        cell("", "text"),
        cell(totalSoLuong, "number"),
        cell("", "text"),
        cell(totalThanhTien, "number"),
        cell(totalThucTe, "number"),
        cell(totalCongTy, "number"),
        cell(totalHdv, "number"),
        cell("", "text"),
        cell("", "text"),
        cell("", "text"),
        cell("", "text"),
        cell("", "text"),
      ],
    ],
  };
}

function buildThanhToanSheet(params: ExportChiPhiDoanExcelParams): SheetDefinition {
  const { doan, dnttList, hdvData } = params;
  const tongDntt = dnttList.reduce((sum, row) => sum + row.so_tien, 0);

  return {
    name: "Thanh toan",
    columns: [18, 14, 18, 24, 34, 14, 14, 16, 16, 10, 12, 28],
    rows: [
      [cell(`ĐỀ NGHỊ THANH TOÁN - ${doan?.ten_doan || "Đoàn"}`, "title", 12)],
      [
        cell("Ngày tạo", "header"),
        cell("Loại", "header"),
        cell("Tham chiếu", "header"),
        cell("Đối tượng", "header"),
        cell("Mô tả", "header"),
        cell("Số tiền", "header"),
        cell("Duyệt", "header"),
        cell("Thanh toán", "header"),
        cell("Ngày TT", "header"),
        cell("Là cọc", "header"),
        cell("Thu hồi", "header"),
        cell("Ghi chú", "header"),
      ],
      ...dnttList.map((row) => [
        cell(formatDateValue(row.created_at, true)),
        cell(getLoaiLabel(row.loai)),
        cell(getRefLoaiLabel(row.ref_loai)),
        cell(getDoiTuongText(row, hdvData)),
        cell(row.mo_ta || "—"),
        cell(row.so_tien || 0, "number"),
        cell(getApprovalStatusLabel(row.trang_thai_duyet)),
        cell(getPaymentStatusLabel(row.payment_status)),
        cell(formatDateValue(row.thanh_toan_luc)),
        cell(row.la_coc ? "Có" : "Không"),
        cell((row.ghi_chu || "").includes("[Thu hồi]") ? "Có" : "Không"),
        cell(row.ghi_chu || "—"),
      ]),
      [
        cell("Tổng DNTT", "label"),
        cell("", "text"),
        cell("", "text"),
        cell("", "text"),
        cell("", "text"),
        cell(tongDntt, "number"),
        cell("", "text"),
        cell("", "text"),
        cell("", "text"),
        cell("", "text"),
        cell("", "text"),
        cell("", "text"),
      ],
    ],
  };
}

export async function exportChiPhiDoanExcel(params: ExportChiPhiDoanExcelParams) {
  // "hdv" → chỉ in sheet Hành trình; "full" (mặc định) → đủ 4 sheet.
  const sheets = params.mode === "hdv"
    ? [buildHanhTrinhSheet(params)]
    : [
        buildHanhTrinhSheet(params),
        buildSummarySheet(params),
        buildChiTietSheet(params),
        buildThanhToanSheet(params),
      ];

  const files = [
    { name: "[Content_Types].xml", content: buildContentTypesXml(sheets) },
    { name: "_rels/.rels", content: buildRootRelsXml() },
    { name: "docProps/app.xml", content: buildAppXml(sheets) },
    { name: "docProps/core.xml", content: buildCoreXml() },
    { name: "xl/workbook.xml", content: buildWorkbookXml(sheets) },
    { name: "xl/_rels/workbook.xml.rels", content: buildWorkbookRelsXml(sheets) },
    { name: "xl/styles.xml", content: buildStylesXml() },
    ...sheets.map((sheet, index) => ({
      name: `xl/worksheets/sheet${index + 1}.xml`,
      content: buildSheetXml(sheet),
    })),
  ];

  const blob = createZipBlob(files);
  const baseName = sanitizeFilename(params.doan?.ten_doan || `doan_${params.doan?.id ?? "chi_phi"}`) || "chi_phi_doan";
  const suffix = params.mode === "hdv" ? "hanh_trinh_hdv" : "chi_phi_doan";
  saveAs(blob, `${baseName}_${suffix}.xlsx`);
}
