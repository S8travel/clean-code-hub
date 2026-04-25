import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  Table,
  TableRow,
  TableCell,
  AlignmentType,
  WidthType,
  BorderStyle,
  ShadingType,
  VerticalAlign,
  PageOrientation,
  HeightRule,
} from "docx";
import { saveAs } from "file-saver";

const BORDER = { style: BorderStyle.SINGLE, size: 1, color: "000000" };
const BORDERS = { top: BORDER, bottom: BORDER, left: BORDER, right: BORDER };
const NO_BORDER = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };
const NO_BORDERS = { top: NO_BORDER, bottom: NO_BORDER, left: NO_BORDER, right: NO_BORDER };
const GRAY = { fill: "D9D9D9", type: ShadingType.CLEAR, color: "auto" };
const WHITE = { fill: "FFFFFF", type: ShadingType.CLEAR, color: "auto" };

const PAGE_W = 11906;
const PAGE_H = 16838;
const MARGIN = 360; // 0.25 inch
const CONTENT_W = PAGE_H - MARGIN * 2;

// Columns: CODE ĐOÀN/Số khách, Tên KS, CODE KS, Check in, Check out, Loại Phòng, Số đêm, Số Lượng, FOC, Đơn giá, Thành tiền, Đã TT, Thanh toán, Ngân hàng
const COL_FIXED = [1700, 1500, 800, 900, 900, 1200, 600, 650, 700, 1000, 1100, 900, 1000];
const COL_W = [...COL_FIXED, CONTENT_W - COL_FIXED.reduce((a, b) => a + b, 0)];

const fmt = (n: number) => n.toLocaleString("vi-VN");

function cell(
  children: Paragraph[],
  opts: { width?: number; rowSpan?: number; columnSpan?: number; shading?: typeof GRAY; borders?: any; margins?: { top: number; bottom: number; left: number; right: number } } = {}
): TableCell {
  return new TableCell({
    children,
    borders: opts.borders ?? BORDERS,
    width: { size: opts.width ?? 0, type: WidthType.DXA },
    rowSpan: opts.rowSpan,
    columnSpan: opts.columnSpan,
    shading: opts.shading ?? WHITE,
    verticalAlign: VerticalAlign.CENTER as any,
    margins: opts.margins ?? { top: 30, bottom: 30, left: 60, right: 60 },
  });
}

function p(
  text: string,
  opts: { bold?: boolean; size?: number; color?: string; alignment?: (typeof AlignmentType)[keyof typeof AlignmentType]; italics?: boolean } = {}
): Paragraph {
  return new Paragraph({
    alignment: opts.alignment ?? AlignmentType.CENTER,
    children: [
      new TextRun({
        text,
        font: "Arial",
        size: opts.size ?? 16,
        bold: opts.bold,
        color: opts.color,
        italics: opts.italics,
      }),
    ],
  });
}

export interface EdgeFunctionData {
  doan: { ten_doan: string; so_khach: number };
  ks: { ten: string; foc_khach: number | null; foc_mien: number | null };
  ncc: { ten?: string; so_tai_khoan?: string; ngan_hang?: string } | null;
  checkIn: string;
  checkOut: string;
  codeKS: string;
  soDem: number;
  roomEntries: { name: string; so_luong: number; don_gia: number; so_dem?: number; ci?: string; co?: string }[];
  cocTotal: number;
  focDisplay: string;
  soTien: number;
  la_coc?: boolean;
  nguoiDeNghi?: string;
  ghiChu?: string;
}

function buildBankChildren(ncc: EdgeFunctionData["ncc"]): Paragraph[] {
  if (!ncc?.so_tai_khoan) return [p("—", { size: 18, alignment: AlignmentType.LEFT })];
  const lines = ncc.so_tai_khoan.split("\n").map((l) => l.trim()).filter(Boolean);
  if (lines.length === 0) return [p("—", { size: 18, alignment: AlignmentType.LEFT })];
  return lines.map((line) => p(line, { size: 18, alignment: AlignmentType.LEFT }));
}

const TABLE_HEADERS = [
  "CODE ĐOÀN\nSố khách", "Tên Khách sạn", "CODE\nKS",
  "Check\nin", "Check\nout", "Loại Phòng", "Số\nđêm",
  "Số\nLượng", "FOC", "Đơn giá", "Thành tiền",
  "Đã thanh\ntoán", "Thanh toán", "Thông tin\nNgân hàng",
];

function buildHeaderRow(): TableRow {
  return new TableRow({
    children: TABLE_HEADERS.map((h, i) =>
      cell([p(h, { bold: true, size: 14 })], { width: COL_W[i], shading: GRAY })
    ),
  });
}

function buildDataRows(data: EdgeFunctionData): TableRow[] {
  const { doan, ks, ncc, codeKS, roomEntries, cocTotal, focDisplay, soTien, la_coc } = data;
  const bankChildren = buildBankChildren(ncc);
  const colWidths = la_coc
    ? [...COL_FIXED.slice(0, 12), COL_W[12] + COL_W[13]]
    : COL_W;

  const rows: TableRow[] = [];
  const totalRoomRows = roomEntries.length;
  roomEntries.forEach((room, ri) => {
    const rowSoDem = room.so_dem ?? 1;
    const thanhTien = room.don_gia * room.so_luong * rowSoDem;
    const isFirst = ri === 0;
    const cells: TableCell[] = [];

    if (isFirst) {
      cells.push(cell([p(doan.ten_doan || "", { bold: true, size: 14 }), p(`${doan.so_khach || 0} khách`, { size: 13 })], { width: colWidths[0], rowSpan: totalRoomRows }));
      cells.push(cell([p(ks.ten || "", { bold: true, size: 14 })], { width: colWidths[1], rowSpan: totalRoomRows }));
      cells.push(cell([p(codeKS || "", { size: 14 })], { width: colWidths[2], rowSpan: totalRoomRows }));
    }

    cells.push(cell([p(room.ci || "—", { size: 14 })], { width: colWidths[3] }));
    cells.push(cell([p(room.co || "—", { size: 14 })], { width: colWidths[4] }));
    cells.push(cell([p(room.name, { size: 14 })], { width: colWidths[5] }));
    cells.push(cell([p(String(rowSoDem), { size: 14 })], { width: colWidths[6] }));
    cells.push(cell([p(String(room.so_luong), { size: 14 })], { width: colWidths[7] }));

    if (isFirst) {
      cells.push(cell([p(focDisplay, { size: 14 })], { width: colWidths[8], rowSpan: totalRoomRows }));
    }

    cells.push(cell([p(fmt(room.don_gia), { size: 14 })], { width: colWidths[9] }));
    cells.push(cell([p(fmt(thanhTien), { bold: true, size: 14 })], { width: colWidths[10] }));

    if (isFirst) {
      if (la_coc) {
        cells.push(cell([p(fmt(soTien), { bold: true, size: 14, color: "FF0000" })], { width: colWidths[11], rowSpan: totalRoomRows }));
        cells.push(cell(bankChildren, { width: colWidths[12], rowSpan: totalRoomRows }));
      } else {
        const cocText = cocTotal > 0 ? `(${fmt(cocTotal)})` : "—";
        cells.push(cell([p(cocText, { size: 14, color: cocTotal > 0 ? "FF0000" : undefined })], { width: colWidths[11], rowSpan: totalRoomRows }));
        cells.push(cell([p(fmt(soTien), { bold: true, size: 14 })], { width: colWidths[12], rowSpan: totalRoomRows }));
        cells.push(cell(bankChildren, { width: colWidths[13], rowSpan: totalRoomRows }));
      }
    }

    rows.push(new TableRow({ children: cells, height: { value: 480, rule: HeightRule.EXACT } }));
  });
  return rows;
}

function buildKSTable(data: EdgeFunctionData): Table {
  const colWidths = data.la_coc
    ? [...COL_FIXED.slice(0, 12), COL_W[12] + COL_W[13]]
    : COL_W;
  const headers = data.la_coc
    ? [...TABLE_HEADERS.slice(0, 12), TABLE_HEADERS[13]]
    : TABLE_HEADERS;
  const headerRow = new TableRow({
    children: headers.map((h, i) =>
      cell([p(h, { bold: true, size: 14 })], { width: colWidths[i], shading: GRAY })
    ),
  });
  return new Table({
    width: { size: CONTENT_W, type: WidthType.DXA },
    columnWidths: colWidths,
    rows: [headerRow, ...buildDataRows(data)],
  });
}

function buildKSMergedTable(items: EdgeFunctionData[]): Table {
  const rows: TableRow[] = [buildHeaderRow()];
  for (const item of items) {
    rows.push(...buildDataRows(item));
  }
  return new Table({ width: { size: CONTENT_W, type: WidthType.DXA }, columnWidths: COL_W, rows });
}

function buildGhiChuPara(items: EdgeFunctionData[]): Paragraph | null {
  const lines = items
    .filter((d) => d.ghiChu)
    .map((d) => items.length > 1 ? `${d.ks.ten}: ${d.ghiChu}` : d.ghiChu!);
  if (lines.length === 0) return null;
  return new Paragraph({
    alignment: AlignmentType.LEFT,
    spacing: { before: 200, after: 80 },
    children: [new TextRun({ text: `Ghi chú: ${lines.join(" | ")}`, font: "Arial", size: 18, italics: true })],
  });
}

function buildHeaderTable(): Table {
  const HALF = Math.floor(CONTENT_W / 2);
  const today = new Date().toLocaleDateString("vi-VN");
  return new Table({
    width: { size: CONTENT_W, type: WidthType.DXA },
    rows: [
      new TableRow({
        children: [
          cell(
            [
              p("CÔNG TY TNHH DU LỊCH S8", { bold: true, size: 22 }),
              p("S8 TRAVEL COMPANY", { size: 18, color: "555555" }),
              p("MST: 0402021137", { size: 18, color: "555555" }),
            ],
            { width: HALF, borders: NO_BORDERS, margins: { top: 60, bottom: 60, left: 0, right: 0 } }
          ),
          cell(
            [
              p("CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM", { bold: true, size: 22 }),
              p("Độc lập – Tự do – Hạnh phúc", { bold: true, size: 20 }),
              p("——————————————", { size: 18, color: "888888" }),
              p(`Hà Nội, ngày ${today}`, { size: 18, color: "555555" }),
            ],
            { width: CONTENT_W - HALF, borders: NO_BORDERS, margins: { top: 60, bottom: 60, left: 0, right: 0 } }
          ),
        ],
      }),
    ],
  });
}

function buildSignatureTable(nguoiDeNghi: string): Table {
  const SIG_W = Math.floor(CONTENT_W / 5);
  const SIG_LAST = CONTENT_W - SIG_W * 4;
  const sigTitles = ["NGƯỜI ĐỀ NGHỊ", "TRƯỞNG BỘ PHẬN", "KẾ TOÁN THANH TOÁN", "KẾ TOÁN TRƯỞNG", "GIÁM ĐỐC"];
  const sigNames = [nguoiDeNghi.toUpperCase(), "VÕ THỊ MINH XUÂN", "TRẦN THỊ ÁNH HỒNG", "NGUYỄN CHÍ LINH", "NGUYỄN TIẾN DŨNG"];
  const sigWidths = [SIG_W, SIG_W, SIG_W, SIG_W, SIG_LAST];

  return new Table({
    width: { size: CONTENT_W, type: WidthType.DXA },
    rows: [
      new TableRow({ children: sigTitles.map((t, i) => cell([p(t, { bold: true, size: 18 })], { width: sigWidths[i], borders: NO_BORDERS })) }),
      new TableRow({ children: sigWidths.map((w) => cell([p("(Ký, ghi rõ họ tên)", { size: 16, color: "888888" })], { width: w, borders: NO_BORDERS })) }),
      new TableRow({ children: sigWidths.map((w) => cell([p("", { size: 36 }), p("", { size: 36 }), p("", { size: 36 }), p("", { size: 36 }), p("", { size: 36 }), p("", { size: 36 })], { width: w, borders: NO_BORDERS })) }),
      new TableRow({ children: sigNames.map((n, i) => cell([p(n, { bold: true, size: 16 })], { width: sigWidths[i], borders: NO_BORDERS })) }),
    ],
  });
}

function buildDoc(
  headerTable: Table,
  titlePara: Paragraph,
  kinhGuiPara: Paragraph,
  lyDoPara: Paragraph,
  contentTable: Table,
  ghiChuPara: Paragraph | null,
  signatureTable: Table,
): Document {
  const children: (Table | Paragraph)[] = [
    headerTable, titlePara, kinhGuiPara, lyDoPara, contentTable,
    new Paragraph({ spacing: { before: 200 }, children: [] }),
  ];
  if (ghiChuPara) children.push(ghiChuPara);
  children.push(new Paragraph({ spacing: { before: 100 }, children: [] }));
  children.push(signatureTable);

  return new Document({
    sections: [{
      properties: {
        page: {
          size: { width: PAGE_W, height: PAGE_H, orientation: PageOrientation.LANDSCAPE },
          margin: { top: MARGIN, right: MARGIN, bottom: MARGIN, left: MARGIN },
        },
      },
      children,
    }],
  });
}

export async function exportDNTTKSWordFromData(data: EdgeFunctionData) {
  const { doan, ks, la_coc, nguoiDeNghi = "", ghiChu } = data;
  const lyDoText = la_coc
    ? `Đề nghị thanh toán tiền cọc khách sạn ${ks.ten} cho đoàn ${doan.ten_doan}`
    : `Đề nghị thanh toán tiền khách sạn ${ks.ten} cho đoàn ${doan.ten_doan}`;

  const doc = buildDoc(
    buildHeaderTable(),
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 200, after: 100 }, children: [new TextRun({ text: "ĐỀ NGHỊ THANH TOÁN", font: "Arial", size: 32, bold: true })] }),
    new Paragraph({ alignment: AlignmentType.LEFT, spacing: { before: 100, after: 60 }, children: [new TextRun({ text: "Kính gửi: Ban Giám Đốc Công ty TNHH Du lịch S8", font: "Arial", size: 20, bold: true })] }),
    new Paragraph({ alignment: AlignmentType.LEFT, spacing: { before: 60, after: 160 }, children: [new TextRun({ text: lyDoText, font: "Arial", size: 20 })] }),
    buildKSTable(data),
    buildGhiChuPara([data]),
    buildSignatureTable(nguoiDeNghi),
  );

  const blob = await Packer.toBlob(doc);
  saveAs(blob, `DNTT_KS_${doan.ten_doan}_${ks.ten || "KS"}.docx`);
}

export async function exportDNTTKSBatchWordFromData(
  items: EdgeFunctionData[],
  tenDoan: string,
  nguoiDeNghi: string = "",
) {
  if (items.length === 0) return;

  const doc = buildDoc(
    buildHeaderTable(),
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 200, after: 100 }, children: [new TextRun({ text: "ĐỀ NGHỊ THANH TOÁN", font: "Arial", size: 32, bold: true })] }),
    new Paragraph({ alignment: AlignmentType.LEFT, spacing: { before: 100, after: 60 }, children: [new TextRun({ text: "Kính gửi: Ban Giám Đốc Công ty TNHH Du lịch S8", font: "Arial", size: 20, bold: true })] }),
    new Paragraph({ alignment: AlignmentType.LEFT, spacing: { before: 60, after: 160 }, children: [new TextRun({ text: `Đề nghị thanh toán tiền khách sạn cho đoàn ${tenDoan}`, font: "Arial", size: 20 })] }),
    buildKSMergedTable(items),
    buildGhiChuPara(items),
    buildSignatureTable(nguoiDeNghi),
  );

  const blob = await Packer.toBlob(doc);
  saveAs(blob, `DNTT_KS_${tenDoan}.docx`);
}
