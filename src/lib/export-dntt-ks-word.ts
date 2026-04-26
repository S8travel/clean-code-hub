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
const MARGIN = 720;
const CONTENT_W = PAGE_H - MARGIN * 2;

// Thứ tự: Tên KS, CODE KS, Check in, Check out, Loại Phòng, Số đêm, Số Lượng, FOC, Đơn giá, Thành tiền, Đã TT, Thanh toán, Ngân hàng
const COL_W = [
  1500, 800, 900, 900, 1200, 600, 650, 700, 1000, 1100, 900, 1000, 1448,
];

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
  opts: { bold?: boolean; size?: number; color?: string; alignment?: (typeof AlignmentType)[keyof typeof AlignmentType] } = {}
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
      }),
    ],
  });
}

interface EdgeFunctionData {
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
}

function buildKSTable(data: EdgeFunctionData): Table {
  const { doan, ks, ncc, codeKS, roomEntries, cocTotal, focDisplay, soTien, la_coc } = data;

  const bankChildren: Paragraph[] = [];
  if (ncc?.ten) bankChildren.push(p(ncc.ten, { bold: true, size: 14, alignment: AlignmentType.LEFT }));
  if (ncc?.so_tai_khoan) bankChildren.push(p(`Tk: ${ncc.so_tai_khoan}`, { size: 14, alignment: AlignmentType.LEFT }));
  if (ncc?.ngan_hang) bankChildren.push(p(ncc.ngan_hang, { size: 14, alignment: AlignmentType.LEFT }));
  if (bankChildren.length === 0) bankChildren.push(p("—", { size: 14 }));

  const colWidths = la_coc
    ? [...COL_W.slice(0, 11), COL_W[12] + COL_W[11]]
    : COL_W;

  const baseHeaders = [
    "Tên Khách sạn", "CODE\nKS",
    "Check\nin", "Check\nout", "Loại Phòng", "Số\nđêm",
    "Số\nLượng", "FOC", "Đơn giá", "Thành tiền",
    "Đã thanh\ntoán", "Thanh toán", "Thông tin\nNgân hàng",
  ];
  const headers = la_coc
    ? [...baseHeaders.slice(0, 11), baseHeaders[12]]
    : baseHeaders;

  const rows: TableRow[] = [];
  rows.push(
    new TableRow({
      children: headers.map((h, i) =>
        cell([p(h, { bold: true, size: 14 })], { width: colWidths[i], shading: GRAY })
      ),
    })
  );

  const totalRoomRows = roomEntries.length;
  roomEntries.forEach((room, ri) => {
    const rowSoDem = room.so_dem ?? 1;
    const thanhTien = room.don_gia * room.so_luong * rowSoDem;
    const isFirst = ri === 0;
    const cells: TableCell[] = [];

    if (isFirst) {
      cells.push(cell([p(ks.ten || "", { bold: true, size: 14 })], { width: colWidths[0], rowSpan: totalRoomRows }));
      cells.push(cell([p(codeKS || "", { size: 14 })], { width: colWidths[1], rowSpan: totalRoomRows }));
    }

    cells.push(cell([p(room.ci || "—", { size: 14 })], { width: colWidths[2] }));
    cells.push(cell([p(room.co || "—", { size: 14 })], { width: colWidths[3] }));
    cells.push(cell([p(room.name, { size: 14 })], { width: colWidths[4] }));
    cells.push(cell([p(String(rowSoDem), { size: 14 })], { width: colWidths[5] }));
    cells.push(cell([p(String(room.so_luong), { size: 14 })], { width: colWidths[6] }));

    if (isFirst) {
      cells.push(cell([p(focDisplay, { size: 14 })], { width: colWidths[7], rowSpan: totalRoomRows }));
    }

    cells.push(cell([p(fmt(room.don_gia), { size: 14 })], { width: colWidths[8] }));
    cells.push(cell([p(fmt(thanhTien), { bold: true, size: 14 })], { width: colWidths[9] }));

    if (isFirst) {
      if (la_coc) {
        cells.push(cell([p(fmt(soTien), { bold: true, size: 14, color: "FF0000" })], { width: colWidths[10], rowSpan: totalRoomRows }));
        cells.push(cell(bankChildren, { width: colWidths[11], rowSpan: totalRoomRows }));
      } else {
        const cocText = cocTotal > 0 ? `(${fmt(cocTotal)})` : "—";
        cells.push(cell([p(cocText, { size: 14, color: cocTotal > 0 ? "FF0000" : undefined })], { width: colWidths[10], rowSpan: totalRoomRows }));
        cells.push(cell([p(fmt(soTien), { bold: true, size: 14 })], { width: colWidths[11], rowSpan: totalRoomRows }));
        cells.push(cell(bankChildren, { width: colWidths[12], rowSpan: totalRoomRows }));
      }
    }

    rows.push(new TableRow({ children: cells }));
  });

  return new Table({ width: { size: CONTENT_W, type: WidthType.DXA }, columnWidths: colWidths, rows });
}

export async function exportDNTTKSWordFromData(data: EdgeFunctionData) {
  const { doan, ks, la_coc, nguoiDeNghi = "" } = data;

  const table = buildKSTable(data);

  const today = new Date().toLocaleDateString("vi-VN");
  const HALF = Math.floor(CONTENT_W / 2);

  // ── 1. Header: Company + Quốc hiệu ─────────────────────────────
  const headerTable = new Table({
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

  // ── 2. Title ─────────────────────────────────────────────────────
  const titlePara = new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 200, after: 100 },
    children: [new TextRun({ text: "ĐỀ NGHỊ THANH TOÁN", font: "Arial", size: 32, bold: true })],
  });

  // ── 3. Kính gửi + Lý do ──────────────────────────────────────────
  const kinhGuiPara = new Paragraph({
    alignment: AlignmentType.LEFT,
    spacing: { before: 100, after: 60 },
    children: [new TextRun({ text: "Kính gửi: Ban Giám Đốc Công ty TNHH Du lịch S8", font: "Arial", size: 20, bold: true })],
  });

  const soKhachSuffix = doan.so_khach ? ` - ${doan.so_khach} khách` : "";
  const lyDoText = la_coc
    ? `Đề nghị thanh toán tiền cọc khách sạn ${ks.ten} cho đoàn ${doan.ten_doan}${soKhachSuffix}`
    : `Đề nghị thanh toán tiền khách sạn ${ks.ten} cho đoàn ${doan.ten_doan}${soKhachSuffix}`;

  const lyDoPara = new Paragraph({
    alignment: AlignmentType.LEFT,
    spacing: { before: 60, after: 160 },
    children: [new TextRun({ text: lyDoText, font: "Arial", size: 20 })],
  });

  // ── 4. Signature section ─────────────────────────────────────────
  const SIG_W = Math.floor(CONTENT_W / 5);
  const SIG_LAST = CONTENT_W - SIG_W * 4;
  const sigTitles = ["NGƯỜI ĐỀ NGHỊ", "TRƯỞNG BỘ PHẬN", "KẾ TOÁN THANH TOÁN", "KẾ TOÁN TRƯỞNG", "GIÁM ĐỐC"];
  const sigNames = [nguoiDeNghi.toUpperCase(), "VÕ THỊ MINH XUÂN", "TRẦN THỊ ÁNH HỒNG", "NGUYỄN CHÍ LINH", "NGUYỄN TIẾN DŨNG"];
  const sigWidths = [SIG_W, SIG_W, SIG_W, SIG_W, SIG_LAST];

  const signatureTable = new Table({
    width: { size: CONTENT_W, type: WidthType.DXA },
    rows: [
      // Row 1: titles
      new TableRow({
        children: sigTitles.map((t, i) =>
          cell([p(t, { bold: true, size: 18 })], { width: sigWidths[i], borders: NO_BORDERS })
        ),
      }),
      // Row 2: (Ký, ghi rõ họ tên)
      new TableRow({
        children: sigWidths.map((w) =>
          cell([p("(Ký, ghi rõ họ tên)", { size: 16, color: "888888" })], { width: w, borders: NO_BORDERS })
        ),
      }),
      // Row 3: empty space for signature
      new TableRow({
        children: sigWidths.map((w) =>
          cell(
            [p("", { size: 36 }), p("", { size: 36 }), p("", { size: 36 }), p("", { size: 36 }), p("", { size: 36 }), p("", { size: 36 })],
            { width: w, borders: NO_BORDERS }
          )
        ),
      }),
      // Row 4: names
      new TableRow({
        children: sigNames.map((n, i) =>
          cell([p(n, { bold: true, size: 16 })], { width: sigWidths[i], borders: NO_BORDERS })
        ),
      }),
    ],
  });

  const doc = new Document({
    sections: [{
      properties: {
        page: {
          size: { width: PAGE_W, height: PAGE_H, orientation: PageOrientation.LANDSCAPE },
          margin: { top: MARGIN, right: MARGIN, bottom: MARGIN, left: MARGIN },
        },
      },
      children: [
        headerTable,
        titlePara,
        kinhGuiPara,
        lyDoPara,
        table,
        new Paragraph({ spacing: { before: 300 }, children: [] }),
        signatureTable,
      ],
    }],
  });

  const blob = await Packer.toBlob(doc);
  const filename = `DNTT_KS_${doan.ten_doan}_${ks.ten || "KS"}.docx`;
  saveAs(blob, filename);
}

export async function exportDNTTKSBatchWordFromData(
  items: EdgeFunctionData[],
  tenDoan: string,
  nguoiDeNghi: string = "",
) {
  if (items.length === 0) return;

  const today = new Date().toLocaleDateString("vi-VN");
  const HALF = Math.floor(CONTENT_W / 2);

  const headerTable = new Table({
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

  const titlePara = new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 200, after: 100 },
    children: [new TextRun({ text: "ĐỀ NGHỊ THANH TOÁN", font: "Arial", size: 32, bold: true })],
  });

  const kinhGuiPara = new Paragraph({
    alignment: AlignmentType.LEFT,
    spacing: { before: 100, after: 60 },
    children: [new TextRun({ text: "Kính gửi: Ban Giám Đốc Công ty TNHH Du lịch S8", font: "Arial", size: 20, bold: true })],
  });

  const lyDoPara = new Paragraph({
    alignment: AlignmentType.LEFT,
    spacing: { before: 60, after: 160 },
    children: [new TextRun({ text: `Đề nghị thanh toán tiền khách sạn cho đoàn ${tenDoan}`, font: "Arial", size: 20 })],
  });

  const SIG_W = Math.floor(CONTENT_W / 5);
  const SIG_LAST = CONTENT_W - SIG_W * 4;
  const sigTitles = ["NGƯỜI ĐỀ NGHỊ", "TRƯỞNG BỘ PHẬN", "KẾ TOÁN THANH TOÁN", "KẾ TOÁN TRƯỞNG", "GIÁM ĐỐC"];
  const sigNames = [nguoiDeNghi.toUpperCase(), "VÕ THỊ MINH XUÂN", "TRẦN THỊ ÁNH HỒNG", "NGUYỄN CHÍ LINH", "NGUYỄN TIẾN DŨNG"];
  const sigWidths = [SIG_W, SIG_W, SIG_W, SIG_W, SIG_LAST];

  const signatureTable = new Table({
    width: { size: CONTENT_W, type: WidthType.DXA },
    rows: [
      new TableRow({
        children: sigTitles.map((t, i) =>
          cell([p(t, { bold: true, size: 18 })], { width: sigWidths[i], borders: NO_BORDERS })
        ),
      }),
      new TableRow({
        children: sigWidths.map((w) =>
          cell([p("(Ký, ghi rõ họ tên)", { size: 16, color: "888888" })], { width: w, borders: NO_BORDERS })
        ),
      }),
      new TableRow({
        children: sigWidths.map((w) =>
          cell([p("", { size: 36 }), p("", { size: 36 }), p("", { size: 36 })], { width: w, borders: NO_BORDERS })
        ),
      }),
      new TableRow({
        children: sigNames.map((n, i) =>
          cell([p(n, { bold: true, size: 16 })], { width: sigWidths[i], borders: NO_BORDERS })
        ),
      }),
    ],
  });

  // Gộp tất cả bảng KS với khoảng cách giữa
  const children: (Table | Paragraph)[] = [
    headerTable,
    titlePara,
    kinhGuiPara,
    lyDoPara,
  ];

  items.forEach((item, idx) => {
    children.push(buildKSTable(item));
    if (idx < items.length - 1) {
      children.push(new Paragraph({ spacing: { before: 200 }, children: [] }));
    }
  });

  children.push(new Paragraph({ spacing: { before: 300 }, children: [] }));
  children.push(signatureTable);

  const doc = new Document({
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

  const blob = await Packer.toBlob(doc);
  saveAs(blob, `DNTT_KS_${tenDoan}.docx`);
}
