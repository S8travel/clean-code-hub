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
  TextDirection,
  PageOrientation,
} from "docx";
import { saveAs } from "file-saver";
import type { BookingKSDisplay } from "@/hooks/use-booking-ks";

const BORDER = { style: BorderStyle.SINGLE, size: 1, color: "000000" };
const BORDERS = { top: BORDER, bottom: BORDER, left: BORDER, right: BORDER };
const GRAY_SHADING = { fill: "D9D9D9", type: ShadingType.CLEAR, color: "auto" };
const NO_SHADING = { fill: "FFFFFF", type: ShadingType.CLEAR, color: "auto" };

// A4 with 0.5 inch margins → content width in DXA
// A4 Landscape with 0.5 inch margins
const PAGE_W = 11906; // short edge (docx-js swaps for landscape)
const PAGE_H = 16838; // long edge
const MARGIN = 720; // 0.5 inch
const CONTENT_W = PAGE_H - MARGIN * 2; // landscape uses long edge: 15398

// 5 columns: HOTEL | 入住日 | 地點 | 飯店/網址 | TEL
const COL_W = [1400, 2000, 2200, 5798, 2000];

function cell(
  children: Paragraph[],
  opts: {
    width?: number;
    rowSpan?: number;
    columnSpan?: number;
    shading?: typeof GRAY_SHADING;
    verticalAlign?: any;
    textDirection?: typeof TextDirection.BOTTOM_TO_TOP_LEFT_TO_RIGHT;
  } = {}
): TableCell {
  return new TableCell({
    children,
    borders: BORDERS,
    width: { size: opts.width ?? 0, type: WidthType.DXA },
    rowSpan: opts.rowSpan,
    columnSpan: opts.columnSpan,
    shading: opts.shading ?? NO_SHADING,
    verticalAlign: opts.verticalAlign ?? VerticalAlign.CENTER,
    margins: { top: 40, bottom: 40, left: 80, right: 80 },
    ...(opts.textDirection ? { textDirection: opts.textDirection } : {}),
  });
}

function p(
  text: string,
  opts: {
    bold?: boolean;
    size?: number;
    color?: string;
    italic?: boolean;
    alignment?: (typeof AlignmentType)[keyof typeof AlignmentType];
  } = {}
): Paragraph {
  return new Paragraph({
    alignment: opts.alignment ?? AlignmentType.CENTER,
    children: [
      new TextRun({
        text,
        font: "Arial",
        size: opts.size ?? 18, // 9pt default
        bold: opts.bold,
        color: opts.color,
        italics: opts.italic,
      }),
    ],
  });
}

function multiLineP(
  lines: string[],
  opts: {
    bold?: boolean;
    size?: number;
    color?: string;
    alignment?: (typeof AlignmentType)[keyof typeof AlignmentType];
  } = {}
): Paragraph {
  const children: TextRun[] = [];
  lines.forEach((line, i) => {
    if (i > 0) children.push(new TextRun({ text: "", break: 1, font: "Arial", size: opts.size ?? 18 }));
    children.push(
      new TextRun({
        text: line,
        font: "Arial",
        size: opts.size ?? 18,
        bold: opts.bold,
        color: opts.color,
      })
    );
  });
  return new Paragraph({ alignment: opts.alignment ?? AlignmentType.CENTER, children });
}

function formatDateMD(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("zh-TW", { month: "numeric", day: "numeric" });
}

export async function exportBookingWord(
  tenDoan: string,
  selectedBookings: BookingKSDisplay[]
) {
  // Sort by first date ascending
  const sorted = [...selectedBookings].sort((a, b) => {
    const da = a.ngay_dates[0] || "";
    const db = b.ngay_dates[0] || "";
    return da.localeCompare(db);
  });

  const hotelRowCount = sorted.length * 3; // 3 rows per hotel

  // ── Build table rows ──
  const rows: TableRow[] = [];

  // Row 1: 圖號 | ten_doan (merged 4 cols)
  rows.push(
    new TableRow({
      children: [
        cell([p("圖號", { bold: true, size: 20 })], { width: COL_W[0], shading: GRAY_SHADING }),
        cell([p(tenDoan, { bold: true, size: 20 })], {
          width: COL_W[1] + COL_W[2] + COL_W[3] + COL_W[4],
          columnSpan: 4,
        }),
      ],
    })
  );

  // Row 2: Header row
  rows.push(
    new TableRow({
      children: [
        cell([p("")], { width: COL_W[0], shading: GRAY_SHADING }),
        cell([p("入住日", { bold: true, size: 18 })], { width: COL_W[1], shading: GRAY_SHADING }),
        cell([p("地點", { bold: true, size: 18 })], { width: COL_W[2], shading: GRAY_SHADING }),
        cell([p("飯店/網址", { bold: true, size: 18 })], { width: COL_W[3], shading: GRAY_SHADING }),
        cell([p("TEL", { bold: true, size: 18 })], { width: COL_W[4], shading: GRAY_SHADING }),
      ],
    })
  );

  // Hotel rows: 3 rows per booking, col 0 "HOTEL" spans all hotel rows
  sorted.forEach((bk, idx) => {
    const sortedDates = [...bk.ngay_dates].sort((a, b) => new Date(a + "T00:00:00").getTime() - new Date(b + "T00:00:00").getTime());
    const roomInfo = bk.ks_final || bk.ks_dat_truoc || "";

    // Row A: dates | dia_diem | ten KS (bold) | tel
    const rowAChildren: TableCell[] = [];

    // HOTEL column - only on first hotel, rowSpan all
    if (idx === 0) {
      rowAChildren.push(
        cell([p("HOTEL", { bold: true, size: 20 })], {
          width: COL_W[0],
          rowSpan: hotelRowCount,
          shading: NO_SHADING,
          textDirection: TextDirection.BOTTOM_TO_TOP_LEFT_TO_RIGHT,
        })
      );
    }

    // 入住日 (rowSpan 3) — each date as its own Paragraph object
    const dateParagraphs = sortedDates.map((d) =>
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [
          new TextRun({
            text: formatDateMD(d),
            font: "Arial",
            size: 18,
          }),
        ],
      })
    );
    rowAChildren.push(
      cell(dateParagraphs, { width: COL_W[1], rowSpan: 3 })
    );

    // 地點 (rowSpan 3)
    rowAChildren.push(
      cell([p(bk.khach_san_dia_diem || "", { size: 18 })], {
        width: COL_W[2],
        rowSpan: 3,
      })
    );

    // 飯店名 (bold, centered)
    rowAChildren.push(
      cell([p(bk.khach_san_ten, { bold: true, size: 20 })], { width: COL_W[3] })
    );

    // TEL (rowSpan 3)
    rowAChildren.push(
      cell([p(bk.khach_san_so_dien_thoai || "", { size: 18 })], {
        width: COL_W[4],
        rowSpan: 3,
      })
    );

    rows.push(new TableRow({ children: rowAChildren }));

    // Row B: room info (red, bold)
    rows.push(
      new TableRow({
        children: [
          cell([p(roomInfo, { bold: true, size: 20, color: "FF0000" })], { width: COL_W[3] }),
        ],
      })
    );

    // Row C: website (blue, italic)
    rows.push(
      new TableRow({
        children: [
          cell([p(bk.khach_san_website || "", { italic: true, size: 16, color: "0563C1" })], {
            width: COL_W[3],
          }),
        ],
      })
    );
  });

  // Aggregate TOTAL from ks_final values
  const allFinals = sorted
    .map((bk) => bk.ks_final || bk.ks_dat_truoc || "")
    .filter(Boolean);
  const totalText = allFinals.join(", ");

  // TOTAL row
  rows.push(
    new TableRow({
      children: [
        cell([p("TOTAL:", { bold: true, size: 20 })], {
          width: COL_W[0] + COL_W[1],
          columnSpan: 2,
          shading: GRAY_SHADING,
        }),
        cell([p(totalText, { bold: true, size: 20, color: "FF0000" })], {
          width: COL_W[2] + COL_W[3] + COL_W[4],
          columnSpan: 3,
          shading: GRAY_SHADING,
        }),
      ],
    })
  );

  // D/L row
  rows.push(
    new TableRow({
      children: [
        cell([p("D/L:", { bold: true, size: 20 })], {
          width: COL_W[0] + COL_W[1],
          columnSpan: 2,
          shading: GRAY_SHADING,
        }),
        cell([p("")], {
          width: COL_W[2] + COL_W[3] + COL_W[4],
          columnSpan: 3,
          shading: GRAY_SHADING,
        }),
      ],
    })
  );

  const table = new Table({
    width: { size: CONTENT_W, type: WidthType.DXA },
    columnWidths: COL_W,
    rows,
  });

  const doc = new Document({
    sections: [
      {
        properties: {
          page: {
            size: { width: PAGE_W, height: PAGE_H, orientation: PageOrientation.LANDSCAPE },
            margin: { top: MARGIN, right: MARGIN, bottom: MARGIN, left: MARGIN },
          },
        },
        children: [
          // Header
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 100 },
            children: [
              new TextRun({ text: "S8 TRAVEL LTD.  雙發旅遊", font: "Arial", size: 24, bold: true }),
            ],
          }),
          // Title
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 200 },
            children: [
              new TextRun({ text: "訂房確認單", font: "Arial", size: 36, bold: true }),
            ],
          }),
          // Table
          table,
          // Footer note
          new Paragraph({
            alignment: AlignmentType.LEFT,
            spacing: { before: 200 },
            children: [
              new TextRun({
                text: "飯店一經FINAL（包含給名單及正確房數）後取消，請注意各飯店的不同產生不同取消費用，屆時請見諒！！",
                font: "Arial",
                size: 16,
                italics: true,
              }),
            ],
          }),
        ],
      },
    ],
  });

  const blob = await Packer.toBlob(doc);
  const filename = `${tenDoan}_訂房確認單.docx`;
  saveAs(blob, filename);
}
