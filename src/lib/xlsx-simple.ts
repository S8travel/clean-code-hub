// Builder .xlsx tối giản (zip + XML thuần, không phụ thuộc thư viện ngoài).
//
// VÌ SAO TỒN TẠI: đoạn dựng zip/XML này đang bị chép 3 lần (export-chi-phi-excel,
// export-doan-list-excel, export-hdv-stats-excel). File mới KHÔNG chép lần thứ 4 —
// dùng chung ở đây. 3 file cũ để nguyên (đổi chúng là rủi ro không cần thiết); khi
// nào cần sửa chúng thì rút dần về đây.

import { saveAs } from "file-saver";

/** 0 text · 1 title · 2 header · 3 number · 4 total(text) · 5 total(number) */
export type XlsxStyle = "text" | "title" | "header" | "number" | "total" | "total_number";
const STYLE_IDS: Record<XlsxStyle, number> = {
  text: 0, title: 1, header: 2, number: 3, total: 4, total_number: 5,
};

export interface XlsxCell {
  value: string | number;
  style: XlsxStyle;
  /** Gộp ô sang phải (dùng cho dòng tiêu đề). */
  colSpan?: number;
}

function escapeXml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

function columnName(index: number): string {
  let v = index, r = "";
  while (v > 0) { r = String.fromCharCode(65 + ((v - 1) % 26)) + r; v = Math.floor((v - 1) / 26); }
  return r;
}

function toXmlCell(ref: string, sc: XlsxCell): string {
  const styleId = STYLE_IDS[sc.style];
  if (typeof sc.value === "number" && Number.isFinite(sc.value)) {
    return `<c r="${ref}" s="${styleId}"><v>${sc.value}</v></c>`;
  }
  return `<c r="${ref}" s="${styleId}" t="inlineStr"><is><t xml:space="preserve">${escapeXml(String(sc.value ?? ""))}</t></is></c>`;
}

function buildSheetXml(rows: XlsxCell[][], columns: number[], freezeRows: number): string {
  const merges: string[] = [];
  const rowsXml = rows.map((row, idx) => {
    const rowNum = idx + 1;
    let col = 1;
    const parts: string[] = [];
    row.forEach((sc) => {
      const span = Math.max(1, sc.colSpan ?? 1);
      const ref = `${columnName(col)}${rowNum}`;
      // Ô số 0 vẫn phải ghi ra (String(0).length > 0) — chỉ bỏ ô rỗng thật.
      if (String(sc.value ?? "").length > 0) parts.push(toXmlCell(ref, sc));
      if (span > 1) merges.push(`${ref}:${columnName(col + span - 1)}${rowNum}`);
      col += span;
    });
    return parts.length ? `<row r="${rowNum}">${parts.join("")}</row>` : `<row r="${rowNum}"/>`;
  });
  const colsXml = columns.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join("");
  const dim = `A1:${columnName(columns.length)}${Math.max(rows.length, 1)}`;
  const mergeXml = merges.length
    ? `<mergeCells count="${merges.length}">${merges.map((m) => `<mergeCell ref="${m}"/>`).join("")}</mergeCells>`
    : "";
  const pane = freezeRows > 0
    ? `<pane ySplit="${freezeRows}" topLeftCell="A${freezeRows + 1}" activePane="bottomLeft" state="frozen"/>`
    : "";
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <dimension ref="${dim}"/>
  <sheetViews><sheetView workbookViewId="0">${pane}</sheetView></sheetViews>
  <sheetFormatPr defaultRowHeight="15"/>
  <cols>${colsXml}</cols>
  <sheetData>${rowsXml.join("")}</sheetData>
  ${mergeXml}
</worksheet>`;
}

function buildStylesXml(): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <numFmts count="1"><numFmt numFmtId="164" formatCode="#,##0"/></numFmts>
  <fonts count="3">
    <font><sz val="11"/><name val="Arial"/><family val="2"/></font>
    <font><sz val="14"/><name val="Arial"/><family val="2"/><b/><color rgb="FFFFFFFF"/></font>
    <font><sz val="11"/><name val="Arial"/><family val="2"/><b/></font>
  </fonts>
  <fills count="5">
    <fill><patternFill patternType="none"/></fill>
    <fill><patternFill patternType="gray125"/></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FF1F2937"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFDBEAFE"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFF3F4F6"/></patternFill></fill>
  </fills>
  <borders count="2">
    <border><left/><right/><top/><bottom/><diagonal/></border>
    <border>
      <left style="thin"><color rgb="FFD1D5DB"/></left>
      <right style="thin"><color rgb="FFD1D5DB"/></right>
      <top style="thin"><color rgb="FFD1D5DB"/></top>
      <bottom style="thin"><color rgb="FFD1D5DB"/></bottom>
    </border>
  </borders>
  <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
  <cellXfs count="6">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1">
      <alignment vertical="center" wrapText="1"/>
    </xf>
    <xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1">
      <alignment horizontal="center" vertical="center" wrapText="1"/>
    </xf>
    <xf numFmtId="0" fontId="2" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1">
      <alignment horizontal="center" vertical="center" wrapText="1"/>
    </xf>
    <xf numFmtId="164" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1" applyAlignment="1">
      <alignment horizontal="right" vertical="center"/>
    </xf>
    <xf numFmtId="0" fontId="2" fillId="4" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1">
      <alignment vertical="center"/>
    </xf>
    <xf numFmtId="164" fontId="2" fillId="4" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1">
      <alignment horizontal="right" vertical="center"/>
    </xf>
  </cellXfs>
  <cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;
}

const encoder = new TextEncoder();

function createCrc32Table(): Uint32Array {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let b = 0; b < 8; b++) c = (c & 1) !== 0 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[i] = c >>> 0;
  }
  return t;
}
const crc32Table = createCrc32Table();
function crc32(data: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < data.length; i++) c = crc32Table[(c ^ data[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function getDosDateTime(d: Date) {
  const y = Math.max(d.getFullYear(), 1980);
  return {
    time: ((d.getHours() & 0x1f) << 11) | ((d.getMinutes() & 0x3f) << 5) | (Math.floor(d.getSeconds() / 2) & 0x1f),
    day: (((y - 1980) & 0x7f) << 9) | (((d.getMonth() + 1) & 0x0f) << 5) | (d.getDate() & 0x1f),
  };
}

function createZipBlob(files: Array<{ name: string; content: string }>, now: Date): Blob {
  const locals: Uint8Array[] = [], centrals: Uint8Array[] = [];
  const { time, day } = getDosDateTime(now);
  let offset = 0;
  files.forEach((f) => {
    const name = encoder.encode(f.name), data = encoder.encode(f.content), crc = crc32(data);
    const lh = new Uint8Array(30), lv = new DataView(lh.buffer);
    lv.setUint32(0, 0x04034b50, true); lv.setUint16(4, 20, true); lv.setUint16(6, 0x0800, true);
    lv.setUint16(8, 0, true); lv.setUint16(10, time, true); lv.setUint16(12, day, true);
    lv.setUint32(14, crc, true); lv.setUint32(18, data.length, true); lv.setUint32(22, data.length, true);
    lv.setUint16(26, name.length, true); lv.setUint16(28, 0, true);
    locals.push(lh, name, data);
    const ch = new Uint8Array(46), cv = new DataView(ch.buffer);
    cv.setUint32(0, 0x02014b50, true); cv.setUint16(4, 20, true); cv.setUint16(6, 20, true);
    cv.setUint16(8, 0x0800, true); cv.setUint16(10, 0, true); cv.setUint16(12, time, true); cv.setUint16(14, day, true);
    cv.setUint32(16, crc, true); cv.setUint32(20, data.length, true); cv.setUint32(24, data.length, true);
    cv.setUint16(28, name.length, true); cv.setUint32(42, offset, true);
    centrals.push(ch, name);
    offset += lh.length + name.length + data.length;
  });
  const cSize = centrals.reduce((s, p) => s + p.length, 0);
  const eh = new Uint8Array(22), ev = new DataView(eh.buffer);
  ev.setUint32(0, 0x06054b50, true); ev.setUint16(8, files.length, true); ev.setUint16(10, files.length, true);
  ev.setUint32(12, cSize, true); ev.setUint32(16, offset, true);
  return new Blob([...locals, ...centrals, eh] as BlobPart[], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

/** Tên sheet Excel: cấm : \ / ? * [ ] và tối đa 31 ký tự. */
export function sanitizeSheetName(name: string): string {
  const clean = name.replace(/[:\\/?*[\]]/g, "-").trim();
  return (clean || "Sheet1").slice(0, 31);
}

export interface XlsxSheet {
  name: string;
  /** Bề rộng từng cột (đơn vị Excel). Độ dài = số cột. */
  columns: number[];
  rows: XlsxCell[][];
  /** Số dòng đầu bị đóng băng khi cuộn. Mặc định 0. */
  freezeRows?: number;
}

/** Dựng blob .xlsx 1 sheet. Tách khỏi saveAs để test được (không cần DOM). */
export function buildXlsxBlob(sheet: XlsxSheet, now: Date = new Date()): Blob {
  const sheetName = sanitizeSheetName(sheet.name);
  const files = [
    {
      name: "[Content_Types].xml",
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
</Types>`,
    },
    {
      name: "_rels/.rels",
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`,
    },
    {
      name: "xl/workbook.xml",
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets><sheet name="${escapeXml(sheetName)}" sheetId="1" r:id="rId2"/></sheets>
</workbook>`,
    },
    {
      name: "xl/_rels/workbook.xml.rels",
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
</Relationships>`,
    },
    { name: "xl/styles.xml", content: buildStylesXml() },
    { name: "xl/worksheets/sheet1.xml", content: buildSheetXml(sheet.rows, sheet.columns, sheet.freezeRows ?? 0) },
  ];
  return createZipBlob(files, now);
}

/** Dựng + tải file .xlsx về máy. */
export function downloadXlsx(sheet: XlsxSheet, fileName: string): void {
  saveAs(buildXlsxBlob(sheet), fileName);
}
