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
import type { TauNgayDisplayRow } from "@/hooks/use-booking-tau";

const BORDER = { style: BorderStyle.SINGLE, size: 1, color: "000000" };
const BORDERS = { top: BORDER, bottom: BORDER, left: BORDER, right: BORDER };
const NO_BORDER = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };
const GRAY_SHADING = { fill: "D9D9D9", type: ShadingType.CLEAR, color: "auto" };
const NO_SHADING = { fill: "FFFFFF", type: ShadingType.CLEAR, color: "auto" };

// Borders for hotel-detail cells within a 3-row group — no internal horizontal lines
const DETAIL_TOP    = { top: BORDER,    bottom: NO_BORDER, left: BORDER, right: BORDER }; // row A
const DETAIL_MIDDLE = { top: NO_BORDER, bottom: NO_BORDER, left: BORDER, right: BORDER }; // row B
const DETAIL_BOTTOM = { top: NO_BORDER, bottom: BORDER,    left: BORDER, right: BORDER }; // row C

// A4 Landscape with 0.5 inch margins
const PAGE_W = 11906; // short edge (docx-js swaps for landscape)
const PAGE_H = 16838; // long edge
const MARGIN = 720;   // 0.5 inch
const CONTENT_W = PAGE_H - MARGIN * 2; // 15398

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
    borders?: any;
  } = {}
): TableCell {
  return new TableCell({
    children,
    borders: opts.borders ?? BORDERS,
    width: { size: opts.width ?? 0, type: WidthType.DXA },
    rowSpan: opts.rowSpan,
    columnSpan: opts.columnSpan,
    shading: opts.shading ?? NO_SHADING,
    verticalAlign: opts.verticalAlign ?? VerticalAlign.CENTER,
    margins: { top: 60, bottom: 60, left: 100, right: 100 },
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
        size: opts.size ?? 24, // 12pt default
        bold: opts.bold,
        color: opts.color,
        italics: opts.italic,
      }),
    ],
  });
}


function formatDateMD(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("zh-TW", { month: "numeric", day: "numeric" });
}

export async function exportBookingWord(
  tenDoan: string,
  selectedBookings: BookingKSDisplay[],
  tauRows: TauNgayDisplayRow[] = []
) {
  // Explode each booking into one entry per date, then sort by date
  interface Entry {
    date: string;
    bk: BookingKSDisplay;
  }
  const entries: Entry[] = [];
  for (const bk of selectedBookings) {
    const dates = bk.ngay_dates.length > 0 ? bk.ngay_dates : [""];
    for (const date of dates) {
      entries.push({ date, bk });
    }
  }
  entries.sort((a, b) => a.date.localeCompare(b.date));

  const hotelRowCount = entries.length * 3; // 3 rows per entry

  // ── Build table rows ──
  const rows: TableRow[] = [];

  // Row 1: 圖號 | ten_doan (merged 4 cols)
  rows.push(
    new TableRow({
      children: [
        cell([p("圖號", { bold: true, size: 26 })], { width: COL_W[0], shading: GRAY_SHADING }),
        cell([p(tenDoan, { bold: true, size: 26 })], {
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
        cell([p("入住日", { bold: true, size: 24 })], { width: COL_W[1], shading: GRAY_SHADING }),
        cell([p("地點", { bold: true, size: 24 })], { width: COL_W[2], shading: GRAY_SHADING }),
        cell([p("飯店/網址", { bold: true, size: 24 })], { width: COL_W[3], shading: GRAY_SHADING }),
        cell([p("TEL", { bold: true, size: 24 })], { width: COL_W[4], shading: GRAY_SHADING }),
      ],
    })
  );

  // Hotel rows: 3 rows per entry (one date per entry)
  entries.forEach(({ date, bk }, idx) => {
    const roomInfo = bk.ks_final || bk.ks_dat_truoc || "";
    const diaDiem = bk.khach_san_dia_diem_zh || bk.khach_san_dia_diem || "";

    // Row A: date | dia_diem | hotel name | tel
    const rowAChildren: TableCell[] = [];

    // HOTEL column — only on first entry, rowSpan all
    if (idx === 0) {
      rowAChildren.push(
        cell([p("HOTEL", { bold: true, size: 26 })], {
          width: COL_W[0],
          rowSpan: hotelRowCount,
          shading: NO_SHADING,
          textDirection: TextDirection.BOTTOM_TO_TOP_LEFT_TO_RIGHT,
        })
      );
    }

    // 入住日 — single date (rowSpan 3)
    rowAChildren.push(
      cell(
        [new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [new TextRun({ text: date ? formatDateMD(date) : "", font: "Arial", size: 24 })],
        })],
        { width: COL_W[1], rowSpan: 3 }
      )
    );

    // 地點 (rowSpan 3)
    rowAChildren.push(
      cell([p(diaDiem, { size: 24 })], { width: COL_W[2], rowSpan: 3 })
    );

    // 飯店名 (bold) — no bottom border
    rowAChildren.push(
      cell([p(bk.khach_san_ten, { bold: true, size: 26 })], {
        width: COL_W[3],
        borders: DETAIL_TOP,
      })
    );

    // TEL (rowSpan 3)
    rowAChildren.push(
      cell([p(bk.khach_san_so_dien_thoai || "", { size: 24 })], {
        width: COL_W[4],
        rowSpan: 3,
      })
    );

    rows.push(new TableRow({ children: rowAChildren }));

    // Row B: room info (red, bold) — no top/bottom border
    rows.push(
      new TableRow({
        children: [
          cell([p(roomInfo, { bold: true, size: 28, color: "FF0000" })], {
            width: COL_W[3],
            borders: DETAIL_MIDDLE,
          }),
        ],
      })
    );

    // Row C: website (blue, italic) — no top border
    rows.push(
      new TableRow({
        children: [
          cell([p(bk.khach_san_website || "", { italic: true, size: 22, color: "0563C1" })], {
            width: COL_W[3],
            borders: DETAIL_BOTTOM,
          }),
        ],
      })
    );
  });

  // ── TÀU NGÀY section ──────────────────────────────────────────────────────
  const sortedTau = [...tauRows].sort((a, b) => {
    const da = a.ngay_date ?? "";
    const db = b.ngay_date ?? "";
    if (da !== db) return da.localeCompare(db);
    return a.bua_an === "trua" ? -1 : 1;
  });

  if (sortedTau.length > 0) {
    sortedTau.forEach((tau, idx) => {
      const tauRowChildren: TableCell[] = [];

      if (idx === 0) {
        tauRowChildren.push(
          cell([p("TÀU NGÀY", { bold: true, size: 26 })], {
            width: COL_W[0],
            rowSpan: sortedTau.length,
            shading: NO_SHADING,
            textDirection: TextDirection.BOTTOM_TO_TOP_LEFT_TO_RIGHT,
          })
        );
      }

      // 日期
      tauRowChildren.push(
        cell([p(tau.ngay_date ? formatDateMD(tau.ngay_date) : `Ngày ${tau.ngay_so}`, { size: 24 })], {
          width: COL_W[1],
        })
      );

      // 餐次
      tauRowChildren.push(
        cell([p(tau.bua_an === "trua" ? "午餐" : "晚餐", { size: 24 })], {
          width: COL_W[2],
        })
      );

      // 船名 + set menu
      const tauDetail = tau.set_menu_ten
        ? `${tau.nha_hang_ten}  (${tau.set_menu_ten})`
        : tau.nha_hang_ten;
      tauRowChildren.push(
        cell([p(tauDetail, { bold: true, size: 26 })], {
          width: COL_W[3],
        })
      );

      // Email
      tauRowChildren.push(
        cell([p(tau.nha_hang_email || "", { size: 22, italic: true })], {
          width: COL_W[4],
        })
      );

      rows.push(new TableRow({ children: tauRowChildren }));
    });
  }

  // Aggregate TOTAL — one entry per unique booking (not per date)
  const seenIds = new Set<number>();
  const allFinals = entries
    .filter(({ bk }) => { if (seenIds.has(bk.id)) return false; seenIds.add(bk.id); return true; })
    .map(({ bk }) => bk.ks_final || bk.ks_dat_truoc || "")
    .filter(Boolean);
  const totalText = allFinals.join(", ");

  // TOTAL row
  rows.push(
    new TableRow({
      children: [
        cell([p("TOTAL:", { bold: true, size: 26 })], {
          width: COL_W[0] + COL_W[1],
          columnSpan: 2,
          shading: GRAY_SHADING,
        }),
        cell([p(totalText, { bold: true, size: 26, color: "FF0000" })], {
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
        cell([p("D/L:", { bold: true, size: 26 })], {
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
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 100 },
            children: [
              new TextRun({ text: "S8 TRAVEL LTD.  雙發旅遊", font: "Arial", size: 28, bold: true }),
            ],
          }),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 200 },
            children: [
              new TextRun({ text: "訂房確認單", font: "Arial", size: 40, bold: true }),
            ],
          }),
          table,
          new Paragraph({
            alignment: AlignmentType.LEFT,
            spacing: { before: 200 },
            children: [
              new TextRun({
                text: "飯店一經FINAL（包含給名單及正確房數）後取消，請注意各飯店的不同產生不同取消費用，屆時請見諒！！",
                font: "Arial",
                size: 20,
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
