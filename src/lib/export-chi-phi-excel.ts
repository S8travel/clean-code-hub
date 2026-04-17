import { format } from "date-fns";
import { saveAs } from "file-saver";
import type { ChiPhiRow, DNTTRow } from "@/hooks/use-chi-phi";
import type { HDVSectionData } from "@/hooks/use-chi-phi-hdv";

type CellStyle = "text" | "title" | "section" | "header" | "label" | "number" | "note";

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

interface ExportChiPhiDoanExcelParams {
  doan: any;
  chiPhiRows: ChiPhiRow[];
  dnttList: DNTTRow[];
  hdvData?: HDVSectionData | null;
  opName?: string;
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
  chua_tt: "Chưa thanh toán",
  da_tt: "Đã thanh toán",
  can_tru: "Cấn trừ",
  da_can_tru: "Đã cấn trừ",
  cong_no: "Công nợ",
  hoan_tien: "Hoàn tiền",
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

function getSoKhach(doan: any): number {
  return (
    (doan?.so_khach_lon ?? 0) +
    (doan?.so_khach_em1 ?? 0) +
    (doan?.so_khach_em2 ?? 0) +
    (doan?.so_khach_tl ?? 0) ||
    doan?.so_khach ||
    0
  );
}

function getSoKhachText(doan: any): string {
  const total = getSoKhach(doan);
  const adults = doan?.so_khach_lon ?? 0;
  const tl = doan?.so_khach_tl ?? 0;
  const em1 = doan?.so_khach_em1 ?? 0;
  const em2 = doan?.so_khach_em2 ?? 0;
  return `${total} khách (${adults} NL, ${tl} TL, ${em1} TE1, ${em2} TE2)`;
}

function getXeText(doan: any): string {
  if (!doan?.xe) return "—";
  return [
    doan.xe.nha_xe?.ten,
    doan.xe.ten_xe,
    doan.xe.so_cho ? `${doan.xe.so_cho} chỗ` : "",
  ]
    .filter(Boolean)
    .join(" · ") || "—";
}

function getHdvText(doan: any, hdvData?: HDVSectionData | null): string {
  return doan?.huong_dan_vien?.ten || hdvData?.hdv?.ten || "—";
}

function getDateRangeText(doan: any): string {
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
    row.trang_thai_duyet !== "tu_choi" &&
    row.trang_thai_thanh_toan !== "can_tru" &&
    row.trang_thai_thanh_toan !== "da_can_tru"
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
  return name.replace(/[\\/*?:\[\]]/g, " ").trim().slice(0, 31) || "Sheet";
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
  <fills count="6">
    <fill><patternFill patternType="none"/></fill>
    <fill><patternFill patternType="gray125"/></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FF1D4ED8"/><bgColor indexed="64"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FF1F2937"/><bgColor indexed="64"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFE5E7EB"/><bgColor indexed="64"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFF9FAFB"/><bgColor indexed="64"/></patternFill></fill>
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
  <cellXfs count="7">
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

function buildSummarySheet(params: ExportChiPhiDoanExcelParams): SheetDefinition {
  const { doan, chiPhiRows, dnttList, hdvData, opName } = params;
  const activeRows = chiPhiRows.filter(isActiveChiPhi);

  const companyRows = COMPANY_CATEGORY_ORDER.map(({ key, label }) => {
    const duTru = sumBy(activeRows, (row) => row.danh_muc === key, (row) => row.tien_cong_ty || 0);
    const thucTe = sumBy(activeRows, (row) => row.danh_muc === key, getActualSummaryValue);
    return { label, duTru, thucTe, chenhLech: thucTe - duTru };
  });

  const totalDuTru = companyRows.reduce((sum, row) => sum + row.duTru, 0);
  const totalThucTe = companyRows.reduce((sum, row) => sum + row.thucTe, 0);

  const activeDntts = dnttList.filter(isActiveDntt);
  const tongDeNghi = activeDntts.reduce((sum, row) => sum + row.so_tien, 0);
  const daThanhToan = activeDntts
    .filter((row) => row.trang_thai_thanh_toan === "da_tt")
    .reduce((sum, row) => sum + row.so_tien, 0);
  const choThanhToan = activeDntts
    .filter((row) => row.trang_thai_thanh_toan !== "da_tt")
    .reduce((sum, row) => sum + row.so_tien, 0);
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
      [cell("Ghi chú: file này chưa bao gồm phần 'Phải thu' đang tính tạm trên giao diện HDV.", "note", 6)],
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
        cell(getPaymentStatusLabel(row.trang_thai_thanh_toan)),
        cell(formatDateValue(row.ngay_thanh_toan)),
        cell(row.la_coc ? "Có" : "Không"),
        cell(row.la_thu_hoi ? "Có" : "Không"),
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
  const sheets = [
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
  saveAs(blob, `${baseName}_chi_phi_doan.xlsx`);
}
