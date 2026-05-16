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

// Landscape A4
const PAGE_W = 16838;
const PAGE_H = 11906;
const MARGIN = 720;
const CONTENT_W = PAGE_W - MARGIN * 2; // 15398

// 13 columns — total = 15398. Idx 6 = CK% (mới, áp main row).
const COL_W = [1400, 1050, 2000, 700, 560, 1100, 600, 1300, 1050, 900, 1250, 2000, 1488];

const fmt = (n: number) => n.toLocaleString("vi-VN");

function cell(
  children: Paragraph[],
  opts: {
    width?: number;
    rowSpan?: number;
    columnSpan?: number;
    shading?: typeof GRAY;
    borders?: any;
    margins?: { top: number; bottom: number; left: number; right: number };
    vAlign?: (typeof VerticalAlign)[keyof typeof VerticalAlign];
  } = {},
): TableCell {
  return new TableCell({
    children,
    borders: opts.borders ?? BORDERS,
    width: { size: opts.width ?? 0, type: WidthType.DXA },
    rowSpan: opts.rowSpan,
    columnSpan: opts.columnSpan,
    shading: opts.shading ?? WHITE,
    verticalAlign: (opts.vAlign ?? VerticalAlign.CENTER) as any,
    margins: opts.margins ?? { top: 30, bottom: 30, left: 60, right: 60 },
  });
}

function p(
  text: string,
  opts: {
    bold?: boolean;
    size?: number;
    color?: string;
    alignment?: (typeof AlignmentType)[keyof typeof AlignmentType];
    italic?: boolean;
  } = {},
): Paragraph {
  return new Paragraph({
    alignment: opts.alignment ?? AlignmentType.CENTER,
    children: [
      new TextRun({ noProof: true,
        text,
        font: "Arial",
        size: opts.size ?? 16,
        bold: opts.bold,
        color: opts.color,
        italics: opts.italic,
      }),
    ],
  });
}

export interface NHDocItem {
  so_luong: number;
  don_gia: number;
  ghi_chu?: string;
}

export interface NHDocEntry {
  ngay_date: string;       // "DD/MM/YYYY"
  ten_nh: string;
  so_khach: number;
  foc_khach: number | null; // foc_khach (mỗi X khách)
  foc: number | null;       // foc_mien (miễn Y) — giữ tên `foc` cho backward compat
  items: NHDocItem[];
  /** % chiết khấu áp lên MAIN row (items[0]). Extras không trừ CK. 0 = không CK. */
  chiet_khau_phan_tram?: number;
  ncc: { ten?: string; so_tai_khoan?: string; ngan_hang?: string } | null;
  tai_khoan_thanh_toan: string | null;
  so_tien_coc: number;
  can_tru: number;
  so_tien_con_tt: number;
}

export interface NHDocData {
  doan: { ten_doan: string };
  entries: NHDocEntry[];
  nguoiDeNghi?: string;
}

export async function exportDNTTNHWordFromData(data: NHDocData) {
  const { doan, entries, nguoiDeNghi = "" } = data;
  if (entries.length === 0) return;

  const today = new Date();
  const dateVN = `Hà Nội, ngày ${today.getDate()} tháng ${today.getMonth() + 1} năm ${today.getFullYear()}`;

  // ── 1. Header: Company info + date ──────────────────────────────────────
  const HALF = Math.floor(CONTENT_W / 2);
  const headerTable = new Table({
    width: { size: CONTENT_W, type: WidthType.DXA },
    rows: [
      new TableRow({
        children: [
          cell(
            [
              p("CÔNG TY TNHH DU LỊCH S8", { bold: true, size: 20, alignment: AlignmentType.LEFT }),
              p("ĐC: Tầng 2, Tòa nhà Kim Sơn, Số 18 Phan Thành Tài, Phường Hòa Cường, TP Đà Nẵng", { size: 14, alignment: AlignmentType.LEFT }),
              p("TEL: 02366.566.538", { size: 14, alignment: AlignmentType.LEFT }),
              p("Email: s8travel.info@gmail.com / nhận hóa đơn: s8travel.hddt@gmail.com", { size: 14, alignment: AlignmentType.LEFT }),
              p("MST: 0402021137", { size: 14, alignment: AlignmentType.LEFT }),
            ],
            { width: HALF, borders: NO_BORDERS, margins: { top: 60, bottom: 60, left: 0, right: 0 } },
          ),
          cell(
            [p(dateVN, { size: 16, alignment: AlignmentType.RIGHT, italic: true })],
            { width: CONTENT_W - HALF, borders: NO_BORDERS, margins: { top: 60, bottom: 60, left: 0, right: 0 }, vAlign: VerticalAlign.BOTTOM },
          ),
        ],
      }),
    ],
  });

  // ── 2. Title ─────────────────────────────────────────────────────────────
  const titlePara = new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 200, after: 80 },
    children: [new TextRun({ noProof: true, text: "GIẤY ĐỀ NGHỊ THANH TOÁN", font: "Arial", size: 32, bold: true })],
  });

  // ── 3. Kính gửi + Lý do ──────────────────────────────────────────────────
  const kinhGuiPara = new Paragraph({
    alignment: AlignmentType.LEFT,
    spacing: { before: 60, after: 40 },
    children: [new TextRun({ noProof: true, text: "Kính gửi: Giám đốc công ty TNHH du lịch S8 Travel", font: "Arial", size: 20, bold: true })],
  });
  const lyDoPara = new Paragraph({
    alignment: AlignmentType.LEFT,
    spacing: { before: 40, after: 120 },
    children: [new TextRun({ noProof: true, text: "Lý do thanh toán: Thanh toán tiền dịch vụ", font: "Arial", size: 20 })],
  });

  // ── 4. Data table ─────────────────────────────────────────────────────────
  const rows: TableRow[] = [];

  // Header row — 13 cột (thêm "CK %" trước "Thành tiền")
  const headers = [
    "CODE\nĐOÀN", "NGÀY", "TÊN NHÀ HÀNG\n/ DỊCH VỤ", "Số\nkhách",
    "FOC", "Đơn giá\n(gồm VAT)", "CK %", "Thành\ntiền", "Số tiền\ncọc",
    "Cấn\ntrừ", "Số tiền còn\nthanh toán", "Tài khoản\nthanh toán", "Ghi chú",
  ];
  rows.push(
    new TableRow({
      children: headers.map((h, i) =>
        cell([p(h, { bold: true, size: 14 })], { width: COL_W[i], shading: GRAY }),
      ),
    }),
  );

  // Count total item rows for CODE ĐOÀN rowspan
  const totalItemRows = entries.reduce((s, e) => s + Math.max(e.items.length, 1), 0);
  let firstEntry = true;

  for (const entry of entries) {
    // CK% áp main row (items[0]). Thành tiền main = gross - ckAmount.
    const ckPct = entry.chiet_khau_phan_tram ?? 0;
    const itemCount = Math.max(entry.items.length, 1);
    const items = entry.items.length > 0 ? entry.items : [{ so_luong: 0, don_gia: 0, ghi_chu: "" }];

    // Bank / payment account info from restaurant's tai_khoan_thanh_toan
    const bankChildren: Paragraph[] = [];
    if (entry.tai_khoan_thanh_toan) {
      const lines = entry.tai_khoan_thanh_toan.split("\n").filter(Boolean);
      lines.forEach((line) =>
        bankChildren.push(p(line.trim(), { size: 13, alignment: AlignmentType.LEFT }))
      );
    } else if (entry.ncc?.ten) {
      // fallback to NCC info if no restaurant bank account
      bankChildren.push(p(entry.ncc.ten, { size: 13, alignment: AlignmentType.LEFT, bold: true }));
      if (entry.ncc.so_tai_khoan) bankChildren.push(p(entry.ncc.so_tai_khoan, { size: 13, alignment: AlignmentType.LEFT }));
      if (entry.ncc.ngan_hang) bankChildren.push(p(entry.ncc.ngan_hang, { size: 13, alignment: AlignmentType.LEFT }));
    }
    if (bankChildren.length === 0) bankChildren.push(p("—", { size: 13 }));

    for (let ri = 0; ri < items.length; ri++) {
      const item = items[ri];
      const isFirst = ri === 0;
      const grossThanhTien = item.so_luong * item.don_gia;
      // CK chỉ áp main row (items[0]). Extras KHÔNG trừ CK.
      const ckAmountRow = isFirst && ckPct > 0
        ? Math.round(grossThanhTien * ckPct / 100)
        : 0;
      const thanhTien = grossThanhTien - ckAmountRow;
      const cells: TableCell[] = [];

      // CODE ĐOÀN — only on very first row, spans all rows
      if (firstEntry && isFirst) {
        cells.push(
          cell([p(doan.ten_doan, { bold: true, size: 14 })], {
            width: COL_W[0],
            rowSpan: totalItemRows,
          }),
        );
      }

      if (isFirst) {
        // NGÀY
        cells.push(cell([p(entry.ngay_date, { size: 14 })], { width: COL_W[1], rowSpan: itemCount }));
        // TÊN NHÀ HÀNG
        cells.push(cell([p(entry.ten_nh, { bold: true, size: 14 })], { width: COL_W[2], rowSpan: itemCount }));
      }

      // Số khách — per row: dòng main = entry.so_khach (raw), dòng phát sinh = item.so_luong
      const soKhachRow = isFirst ? entry.so_khach : item.so_luong;
      cells.push(cell([p(String(soKhachRow), { size: 14 })], { width: COL_W[3] }));
      // FOC — chỉ dòng main hiện FOC (extras không có FOC). Format "X免Y" nếu có cả 2.
      const focText = isFirst
        ? (entry.foc_khach && entry.foc != null
            ? `${entry.foc_khach}免${entry.foc}`
            : entry.foc != null ? String(entry.foc) : "—")
        : "—";
      cells.push(cell([p(focText, { size: 14 })], { width: COL_W[4] }));

      // Đơn giá — per item
      cells.push(cell([p(item.don_gia > 0 ? fmt(item.don_gia) : "—", { size: 14 })], { width: COL_W[5] }));
      // CK % — chỉ main row hiện %, extras "—"
      const ckText = isFirst && ckPct > 0 ? `${ckPct}%` : "—";
      cells.push(cell([p(ckText, { size: 14, color: isFirst && ckPct > 0 ? "CC0000" : undefined })], { width: COL_W[6] }));
      // Thành tiền — main đã trừ CK, extras gross
      cells.push(cell([p(thanhTien > 0 ? fmt(thanhTien) : "—", { bold: true, size: 14 })], { width: COL_W[7] }));

      if (isFirst) {
        // Số tiền cọc
        cells.push(
          cell([p(entry.so_tien_coc > 0 ? fmt(entry.so_tien_coc) : "—", { size: 14, color: entry.so_tien_coc > 0 ? "FF6600" : undefined })], {
            width: COL_W[8], rowSpan: itemCount,
          }),
        );
        // Cấn trừ
        cells.push(
          cell([p(entry.can_tru > 0 ? fmt(entry.can_tru) : "—", { size: 14, color: entry.can_tru > 0 ? "FF6600" : undefined })], {
            width: COL_W[9], rowSpan: itemCount,
          }),
        );
        // Số tiền còn TT
        cells.push(
          cell([p(entry.so_tien_con_tt > 0 ? fmt(entry.so_tien_con_tt) : "—", { bold: true, size: 14, color: "CC0000" })], {
            width: COL_W[10], rowSpan: itemCount,
          }),
        );
        // Tài khoản thanh toán
        cells.push(cell(bankChildren, { width: COL_W[11], rowSpan: itemCount }));
      }

      // Ghi chú — per item (cột cuối — idx 12)
      cells.push(cell([p(item.ghi_chu || "—", { size: 13, alignment: AlignmentType.LEFT })], { width: COL_W[12] }));

      rows.push(new TableRow({ children: cells }));
    }

    firstEntry = false;
  }

  const table = new Table({
    width: { size: CONTENT_W, type: WidthType.DXA },
    columnWidths: COL_W,
    rows,
  });

  // ── 5. Signature section ──────────────────────────────────────────────────
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
          cell([p(t, { bold: true, size: 18 })], { width: sigWidths[i], borders: NO_BORDERS }),
        ),
      }),
      new TableRow({
        children: sigWidths.map((w) =>
          cell([p("(Ký, ghi rõ họ tên)", { size: 16, color: "888888" })], { width: w, borders: NO_BORDERS }),
        ),
      }),
      new TableRow({
        children: sigWidths.map((w) =>
          cell(
            [p("", { size: 36 }), p("", { size: 36 }), p("", { size: 36 }), p("", { size: 36 }), p("", { size: 36 }), p("", { size: 36 })],
            { width: w, borders: NO_BORDERS },
          ),
        ),
      }),
      new TableRow({
        children: sigNames.map((n, i) =>
          cell([p(n, { bold: true, size: 16 })], { width: sigWidths[i], borders: NO_BORDERS }),
        ),
      }),
    ],
  });

  // ── Build document ────────────────────────────────────────────────────────
  const doc = new Document({
    sections: [{
      properties: {
        page: {
          size: { width: PAGE_H, height: PAGE_W, orientation: PageOrientation.LANDSCAPE },
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
  saveAs(blob, `DNTT_NH_${doan.ten_doan}.docx`);
}
