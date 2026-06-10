// Xuất Excel danh sách đoàn (theo filter hiện tại ở trang Index).
// Self-contained xlsx builder — cùng pattern export-hdv-stats-excel / export-chi-phi-excel.
import { format, parseISO } from "date-fns";
import { vi } from "date-fns/locale";
import { saveAs } from "file-saver";
import { computeDoanStatus } from "@/lib/doan-status";

/* ── input ── */

/** Đoàn (joined) — chỉ các field export đọc. Khớp DoanRow của DoanTable. */
export interface ExportDoanItem {
  id: number;
  ten_doan?: string | null;
  ngay_di?: string | null;
  ngay_ve?: string | null;
  loai_tour?: string | null;
  trang_thai?: string | null;
  so_khach_lon?: number | null;
  so_khach_em1?: number | null;
  so_khach_em2?: number | null;
  so_khach_tl?: number | null;
  chuyen_bay_don?: string | null;
  chuyen_bay_tien?: string | null;
  ghi_chu?: string | null;
  huong_dan_vien?: { ten?: string | null } | null;
  agents?: { ten?: string | null } | null;
  dia_diem?: { ten?: string | null } | null;
  xe?: { ten_xe?: string | null; so_cho?: number | null; nha_xe?: { ten?: string | null } | null } | null;
}

const LOAI_TOUR_LABEL: Record<string, string> = {
  outbound: "Outbound",
  noi_dia: "Nội địa",
  inbound: "Inbound",
};

/* ── pure helpers (test được) ── */

/** Nhãn trạng thái giàu — mirror richStatus của DoanTable (bỏ icon/màu). */
export function doanStatusLabel(
  g: { id?: number | null; trang_thai?: string | null; ngay_di?: string | null; ngay_ve?: string | null },
  qtPaidSet: Set<number> | null,
  today: Date = new Date(),
): string {
  const base = computeDoanStatus(g, qtPaidSet);
  if (base === "huy") return "Đã huỷ";
  if (base === "da_quyet_toan") return "Đã quyết toán";
  if (base === "hoan_thanh") return "Hoàn thành";
  const t0 = new Date(today); t0.setHours(0, 0, 0, 0);
  const di = g.ngay_di ? new Date(g.ngay_di + "T00:00:00") : null;
  const ve = g.ngay_ve ? new Date(g.ngay_ve + "T00:00:00") : null;
  if (di && ve && di.getTime() <= t0.getTime() && t0.getTime() <= ve.getTime()) return "Đang diễn ra";
  if (di && di.getTime() > t0.getTime()) {
    const days = Math.ceil((di.getTime() - t0.getTime()) / 86400000);
    if (days <= 3) return "Sắp khởi hành";
  }
  return "Chờ xác nhận";
}

/** "5N4Đ" từ ngày đi/về — mirror nightsLabel của DoanTable. */
export function doanNightsLabel(g: { ngay_di?: string | null; ngay_ve?: string | null }): string {
  if (!g.ngay_di || !g.ngay_ve) return "";
  const d = Math.round(
    (new Date(g.ngay_ve + "T00:00:00").getTime() - new Date(g.ngay_di + "T00:00:00").getTime()) / 86400000,
  );
  return d > 0 ? `${d + 1}N${d}Đ` : "";
}

function xeLabel(xe: ExportDoanItem["xe"]): string {
  if (!xe) return "";
  return [xe.nha_xe?.ten ?? "", xe.ten_xe, xe.so_cho ? `${xe.so_cho} chỗ` : ""]
    .filter(Boolean).join(" · ");
}

function fmtDate(d?: string | null): string {
  if (!d) return "";
  try { return format(parseISO(d), "dd/MM/yyyy"); } catch { return d; }
}

function fmtDay(d?: string | null): string {
  if (!d) return "";
  try { return format(parseISO(d), "EEEE", { locale: vi }); } catch { return ""; }
}

export const DOAN_LIST_HEADERS = [
  "Mã đoàn", "Trạng thái", "Địa điểm", "Số ngày", "Loại tour",
  "HDV", "OP", "Agent",
  "Lớn", "50%", "Free", "T/L", "Tổng khách",
  "Ngày đón", "Thứ (đón)", "Ngày tiễn", "Thứ (tiễn)",
  "Chuyến bay đón", "Chuyến bay tiễn", "Loại xe", "Yêu cầu đặc biệt",
] as const;

/** Build data rows (không gồm header) — pure để unit test. */
export function buildDoanListRows(
  items: ExportDoanItem[],
  opNameByDoanId: Map<number, string>,
  qtPaidSet: Set<number> | null,
  today: Date = new Date(),
): (string | number)[][] {
  return items.map((g) => {
    const lon = g.so_khach_lon ?? 0;
    const em1 = g.so_khach_em1 ?? 0;
    const em2 = g.so_khach_em2 ?? 0;
    const tl = g.so_khach_tl ?? 0;
    return [
      g.ten_doan ?? "",
      doanStatusLabel(g, qtPaidSet, today),
      g.dia_diem?.ten ?? "",
      doanNightsLabel(g),
      LOAI_TOUR_LABEL[g.loai_tour ?? ""] ?? "",
      g.huong_dan_vien?.ten ?? "",
      opNameByDoanId.get(g.id) ?? "",
      g.agents?.ten ?? "",
      lon, em1, em2, tl, lon + em1 + em2 + tl,
      fmtDate(g.ngay_di), fmtDay(g.ngay_di),
      fmtDate(g.ngay_ve), fmtDay(g.ngay_ve),
      g.chuyen_bay_don ?? "",
      g.chuyen_bay_tien ?? "",
      xeLabel(g.xe),
      g.ghi_chu ?? "",
    ];
  });
}

/* ── xlsx builder (minimal) ── */

type CellStyle = "text" | "title" | "header" | "number";
const STYLE_IDS: Record<CellStyle, number> = { text: 0, title: 1, header: 2, number: 3 };

interface SheetCell { value: string | number; style: CellStyle; colSpan?: number }

function escapeXml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

function columnName(index: number): string {
  let v = index, r = "";
  while (v > 0) { r = String.fromCharCode(65 + ((v - 1) % 26)) + r; v = Math.floor((v - 1) / 26); }
  return r;
}

function toXmlCell(ref: string, sc: SheetCell): string {
  const styleId = STYLE_IDS[sc.style];
  if (typeof sc.value === "number" && Number.isFinite(sc.value)) {
    return `<c r="${ref}" s="${styleId}"><v>${sc.value}</v></c>`;
  }
  const text = String(sc.value ?? "");
  return `<c r="${ref}" s="${styleId}" t="inlineStr"><is><t xml:space="preserve">${escapeXml(text)}</t></is></c>`;
}

function buildSheetXml(rows: SheetCell[][], columns: number[]): string {
  const merges: string[] = [];
  const rowsXml = rows.map((row, idx) => {
    const rowNum = idx + 1;
    let col = 1;
    const parts: string[] = [];
    row.forEach((sc) => {
      const span = Math.max(1, sc.colSpan ?? 1);
      const ref = `${columnName(col)}${rowNum}`;
      if (String(sc.value).length > 0) parts.push(toXmlCell(ref, sc));
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
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <dimension ref="${dim}"/>
  <sheetViews><sheetView workbookViewId="0"><pane ySplit="2" topLeftCell="A3" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>
  <sheetFormatPr defaultRowHeight="15"/>
  <cols>${colsXml}</cols>
  <sheetData>${rowsXml.join("")}</sheetData>
  ${mergeXml}
</worksheet>`;
}

function buildStylesXml(): string {
  // 0 text · 1 title · 2 header · 3 number
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <numFmts count="1"><numFmt numFmtId="164" formatCode="#,##0"/></numFmts>
  <fonts count="3">
    <font><sz val="11"/><name val="Arial"/><family val="2"/></font>
    <font><sz val="14"/><name val="Arial"/><family val="2"/><b/><color rgb="FFFFFFFF"/></font>
    <font><sz val="11"/><name val="Arial"/><family val="2"/><b/></font>
  </fonts>
  <fills count="4">
    <fill><patternFill patternType="none"/></fill>
    <fill><patternFill patternType="gray125"/></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FF1F2937"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFDBEAFE"/></patternFill></fill>
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
  <cellXfs count="4">
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
function getDosDateTime(d = new Date()) {
  const y = Math.max(d.getFullYear(), 1980);
  return {
    time: ((d.getHours() & 0x1f) << 11) | ((d.getMinutes() & 0x3f) << 5) | (Math.floor(d.getSeconds() / 2) & 0x1f),
    day: (((y - 1980) & 0x7f) << 9) | (((d.getMonth() + 1) & 0x0f) << 5) | (d.getDate() & 0x1f),
  };
}

function createZipBlob(files: Array<{ name: string; content: string }>): Blob {
  const locals: Uint8Array[] = [], centrals: Uint8Array[] = [];
  const { time, day } = getDosDateTime();
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

/* ── entry ── */

interface ExportParams {
  items: ExportDoanItem[];
  opNameByDoanId: Map<number, string>;
  qtPaidSet: Set<number> | null;
  /** Mô tả filter đang áp dụng — hiện ở dòng tiêu đề (vd "01/07/2026 – 31/07/2026 · quý"). */
  filterSummary?: string;
}

export function exportDoanListExcel({ items, opNameByDoanId, qtPaidSet, filterSummary }: ExportParams) {
  const COLS = DOAN_LIST_HEADERS.length;
  const title = `DANH SÁCH ĐOÀN (${items.length} đoàn)` + (filterSummary ? ` — ${filterSummary}` : "");

  const sheetRows: SheetCell[][] = [
    [{ value: title, style: "title", colSpan: COLS }],
    DOAN_LIST_HEADERS.map((h) => ({ value: h, style: "header" }) as SheetCell),
    ...buildDoanListRows(items, opNameByDoanId, qtPaidSet).map((row) =>
      row.map((v): SheetCell => ({ value: v, style: typeof v === "number" ? "number" : "text" })),
    ),
  ];

  const columns = [26, 14, 12, 9, 10, 18, 18, 14, 6, 6, 6, 6, 9, 12, 10, 12, 10, 16, 16, 24, 36];

  const sheetXml = buildSheetXml(sheetRows, columns);
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
  <sheets><sheet name="Danh sách đoàn" sheetId="1" r:id="rId2"/></sheets>
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
    { name: "xl/worksheets/sheet1.xml", content: sheetXml },
  ];

  const blob = createZipBlob(files);
  saveAs(blob, `danh_sach_doan_${format(new Date(), "yyyy-MM-dd")}.xlsx`);
}
