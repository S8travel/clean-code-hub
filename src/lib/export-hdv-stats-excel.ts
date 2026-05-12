import { format } from "date-fns";
import { saveAs } from "file-saver";
import type { HDVSectionData } from "@/hooks/use-chi-phi-hdv";

type CellStyle = "text" | "title" | "section" | "header" | "label" | "value" | "number" | "total" | "total_number" | "note";

interface SheetCell {
  value: string | number | null | undefined;
  style?: CellStyle;
  colSpan?: number;
}

const STYLE_IDS: Record<CellStyle, number> = {
  text: 0,
  title: 1,
  section: 2,
  header: 3,
  label: 4,
  value: 5,
  number: 6,
  total: 7,
  total_number: 8,
  note: 9,
};

const DNTT_STATUS_LABEL: Record<string, string> = {
  cho_duyet: "Chờ duyệt",
  da_duyet: "Đã duyệt",
  tu_choi: "Từ chối",
  da_huy: "Đã hủy",
};

const PAYMENT_STATUS_LABEL: Record<string, string> = {
  unpaid: "Chưa TT",
  partial: "TT 1 phần",
  paid: "Đã TT",
};

function fmtDate(d?: string | null): string {
  if (!d) return "—";
  try {
    return format(new Date(d), "dd/MM/yyyy");
  } catch {
    return d;
  }
}

function cell(value: SheetCell["value"], style: CellStyle = "text", colSpan = 1): SheetCell {
  return { value, style, colSpan };
}

function sanitizeFilename(name: string): string {
  return name.replace(/[\\/:*?"<>|]/g, "-").trim();
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

function toXmlCell(ref: string, sc: SheetCell): string {
  const styleId = STYLE_IDS[sc.style ?? (typeof sc.value === "number" ? "number" : "text")];
  if (typeof sc.value === "number" && Number.isFinite(sc.value)) {
    return `<c r="${ref}" s="${styleId}"><v>${sc.value}</v></c>`;
  }
  const text = sc.value == null ? "" : String(sc.value);
  return `<c r="${ref}" s="${styleId}" t="inlineStr"><is><t xml:space="preserve">${escapeXml(text)}</t></is></c>`;
}

function buildSheetXml(rows: SheetCell[][], columns: number[]): string {
  const merges: string[] = [];
  let maxColumn = 1;
  const rowsXml = rows.map((row, idx) => {
    const rowNum = idx + 1;
    let col = 1;
    const parts: string[] = [];
    row.forEach((sc) => {
      const span = Math.max(1, sc.colSpan ?? 1);
      const ref = `${columnName(col)}${rowNum}`;
      const hasVal = sc.value !== undefined && sc.value !== null && String(sc.value).length > 0;
      if (hasVal) parts.push(toXmlCell(ref, sc));
      if (span > 1) merges.push(`${ref}:${columnName(col + span - 1)}${rowNum}`);
      col += span;
    });
    maxColumn = Math.max(maxColumn, col - 1);
    return parts.length ? `<row r="${rowNum}">${parts.join("")}</row>` : `<row r="${rowNum}"/>`;
  });
  const colsXml = columns.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join("");
  const lastCol = Math.max(maxColumn, columns.length, 1);
  const dim = `A1:${columnName(lastCol)}${Math.max(rows.length, 1)}`;
  const mergeXml = merges.length
    ? `<mergeCells count="${merges.length}">${merges.map((m) => `<mergeCell ref="${m}"/>`).join("")}</mergeCells>`
    : "";
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <dimension ref="${dim}"/>
  <sheetViews><sheetView workbookViewId="0"/></sheetViews>
  <sheetFormatPr defaultRowHeight="15"/>
  <cols>${colsXml}</cols>
  <sheetData>${rowsXml.join("")}</sheetData>
  ${mergeXml}
</worksheet>`;
}

function buildStylesXml(): string {
  // 10 styles:
  // 0 text   1 title   2 section   3 header   4 label   5 value
  // 6 number 7 total   8 total_number   9 note
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <numFmts count="1">
    <numFmt numFmtId="164" formatCode="#,##0"/>
  </numFmts>
  <fonts count="6">
    <font><sz val="11"/><name val="Arial"/><family val="2"/></font>
    <font><sz val="14"/><name val="Arial"/><family val="2"/><b/><color rgb="FFFFFFFF"/></font>
    <font><sz val="11"/><name val="Arial"/><family val="2"/><b/><color rgb="FFFFFFFF"/></font>
    <font><sz val="11"/><name val="Arial"/><family val="2"/><b/></font>
    <font><sz val="10"/><name val="Arial"/><family val="2"/><color rgb="FF6B7280"/></font>
    <font><sz val="11"/><name val="Arial"/><family val="2"/><i/><color rgb="FF6B7280"/></font>
  </fonts>
  <fills count="8">
    <fill><patternFill patternType="none"/></fill>
    <fill><patternFill patternType="gray125"/></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FF1F2937"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FF2563EB"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFDBEAFE"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFF3F4F6"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFFEF3C7"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFE0E7FF"/></patternFill></fill>
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
  <cellStyleXfs count="1">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0"/>
  </cellStyleXfs>
  <cellXfs count="10">
    <!-- 0 text -->
    <xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1">
      <alignment vertical="center" wrapText="1"/>
    </xf>
    <!-- 1 title -->
    <xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1">
      <alignment horizontal="center" vertical="center" wrapText="1"/>
    </xf>
    <!-- 2 section -->
    <xf numFmtId="0" fontId="2" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1">
      <alignment horizontal="left" vertical="center" wrapText="1"/>
    </xf>
    <!-- 3 header -->
    <xf numFmtId="0" fontId="3" fillId="4" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1">
      <alignment horizontal="center" vertical="center" wrapText="1"/>
    </xf>
    <!-- 4 label -->
    <xf numFmtId="0" fontId="4" fillId="5" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1">
      <alignment vertical="center" wrapText="1"/>
    </xf>
    <!-- 5 value -->
    <xf numFmtId="0" fontId="3" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1" applyAlignment="1">
      <alignment vertical="center" wrapText="1"/>
    </xf>
    <!-- 6 number -->
    <xf numFmtId="164" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1" applyAlignment="1">
      <alignment horizontal="right" vertical="center"/>
    </xf>
    <!-- 7 total -->
    <xf numFmtId="0" fontId="3" fillId="7" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1">
      <alignment horizontal="right" vertical="center" wrapText="1"/>
    </xf>
    <!-- 8 total_number -->
    <xf numFmtId="164" fontId="3" fillId="7" borderId="1" xfId="0" applyFont="1" applyNumberFormat="1" applyFill="1" applyBorder="1" applyAlignment="1">
      <alignment horizontal="right" vertical="center"/>
    </xf>
    <!-- 9 note -->
    <xf numFmtId="0" fontId="5" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1" applyAlignment="1">
      <alignment vertical="center" wrapText="1"/>
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

interface ExportParams {
  doan: any;
  data: HDVSectionData;
  hdvPhaiThuVND: number;
}

export function exportHDVStatsExcel({ doan, data, hdvPhaiThuVND }: ExportParams) {
  const TOTAL_COLS = 6;
  const rows: SheetCell[][] = [];

  // Title
  rows.push([cell(`THỐNG KÊ CHI PHÍ HƯỚNG DẪN VIÊN — ${doan?.ten_doan ?? "—"}`, "title", TOTAL_COLS)]);
  rows.push([cell("", "text", TOTAL_COLS)]);

  // HDV info
  const soKhach =
    (doan?.so_khach_lon ?? 0) + (doan?.so_khach_em1 ?? 0) +
    (doan?.so_khach_em2 ?? 0) + (doan?.so_khach_tl ?? 0) || doan?.so_khach || 0;
  const tkText = [data.hdv?.so_tai_khoan, data.hdv?.ngan_hang].filter(Boolean).join(" — ") || "—";
  const ngayText = doan?.ngay_di && doan?.ngay_ve
    ? `${fmtDate(doan.ngay_di)} - ${fmtDate(doan.ngay_ve)}`
    : "—";

  rows.push([
    cell("HDV", "label"), cell(data.hdv?.ten ?? "Chưa chỉ định", "value", 2),
    cell("Ngày tour", "label"), cell(ngayText, "value", 2),
  ]);
  rows.push([
    cell("Số khách", "label"), cell(soKhach, "value", 2),
    cell("Tài khoản", "label"), cell(tkText, "value", 2),
  ]);
  rows.push([cell("", "text", TOTAL_COLS)]);

  // Tóm tắt — 4 cards
  rows.push([
    cell("Tổng HDV chi", "label"), cell(data.tongHdvChi, "number"),
    cell("Đã tạm ứng", "label"), cell(data.tamUngDaTT, "number"),
    cell("Phải thu HDV", "label"), cell(hdvPhaiThuVND, "number"),
  ]);
  const netConPhaiTra = data.soConPhaiTra - hdvPhaiThuVND;
  rows.push([
    cell(netConPhaiTra > 0 ? "Công ty còn phải trả HDV" : netConPhaiTra < 0 ? "HDV phải trả lại công ty" : "Đã đủ", "label", 2),
    cell(Math.abs(netConPhaiTra), "number", 4),
  ]);
  rows.push([cell("", "text", TOTAL_COLS)]);

  // ── Chi phí HDV ứng tiền (loại hdv_ho_tro) ──
  const chiPhiUngRows = data.chiPhiItems.filter((r) => r.danh_muc !== "hdv_ho_tro");
  if (chiPhiUngRows.length > 0) {
    rows.push([cell("CHI PHÍ HDV ỨNG TIỀN", "section", TOTAL_COLS)]);
    rows.push([
      cell("Mô tả", "header", 3),
      cell("SL", "header"),
      cell("Đơn giá", "header"),
      cell("Thành tiền", "header"),
    ]);
    let sum = 0;
    for (const r of chiPhiUngRows) {
      rows.push([
        cell(r.mo_ta || "—", "text", 3),
        cell(r.so_luong, "number"),
        cell(r.don_gia, "number"),
        cell(r.tien_hdv, "number"),
      ]);
      sum += r.tien_hdv;
    }
    rows.push([cell("Cộng", "total", 5), cell(sum, "total_number")]);
    rows.push([cell("", "text", TOTAL_COLS)]);
  }

  // ── Section UI "Hướng dẫn viên" (hdv_ho_tro) ──
  if (data.hoTroItems.length > 0) {
    rows.push([cell("HƯỚNG DẪN VIÊN", "section", TOTAL_COLS)]);
    rows.push([
      cell("Loại", "header", 2),
      cell("SL", "header"),
      cell("Đơn giá", "header"),
      cell("Thành tiền", "header"),
      cell("Ai trả", "header"),
    ]);
    let sum = 0;
    for (const r of data.hoTroItems) {
      const ai = r.tien_hdv > 0 ? "HDV" : r.tien_cong_ty > 0 ? "Công ty" : "—";
      const total = r.tien_hdv + r.tien_cong_ty;
      rows.push([
        cell(r.mo_ta || "—", "text", 2),
        cell(r.so_luong, "number"),
        cell(r.don_gia, "number"),
        cell(total, "number"),
        cell(ai, "text"),
      ]);
      sum += total;
    }
    rows.push([cell("Cộng", "total", 4), cell(sum, "total_number"), cell("", "total")]);
    rows.push([cell("", "text", TOTAL_COLS)]);
  }

  // ── Tạm ứng / Quyết toán ──
  function pushDnttSection(title: string, list: any[]) {
    if (list.length === 0) return;
    rows.push([cell(title, "section", TOTAL_COLS)]);
    rows.push([
      cell("Ngày tạo", "header"),
      cell("Mô tả", "header", 2),
      cell("Số tiền", "header"),
      cell("Đã TT", "header"),
      cell("Trạng thái", "header"),
    ]);
    for (const d of list) {
      const status = `${DNTT_STATUS_LABEL[d.trang_thai_duyet] ?? d.trang_thai_duyet} · ${PAYMENT_STATUS_LABEL[d.payment_status ?? "unpaid"] ?? d.payment_status ?? "—"}`;
      rows.push([
        cell(fmtDate(d.created_at)),
        cell(d.mo_ta || "—", "text", 2),
        cell(d.so_tien, "number"),
        cell(d.paid_amount ?? 0, "number"),
        cell(status),
      ]);
    }
    rows.push([cell("", "text", TOTAL_COLS)]);
  }
  pushDnttSection("TẠM ỨNG", data.tamUngList);
  pushDnttSection("QUYẾT TOÁN", data.quyetToanList);

  const columns = [16, 16, 14, 12, 16, 18];

  const sheetXml = buildSheetXml(rows, columns);
  const sheetName = "HDV Stats";

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
    { name: "xl/worksheets/sheet1.xml", content: sheetXml },
  ];

  const blob = createZipBlob(files);
  const baseName = sanitizeFilename(doan?.ten_doan || `doan_${doan?.id ?? "hdv"}`);
  saveAs(blob, `${baseName}_thong_ke_HDV.xlsx`);
}
