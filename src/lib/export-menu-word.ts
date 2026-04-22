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
import { format } from "date-fns";
import { vi } from "date-fns/locale";

const BORDER = { style: BorderStyle.SINGLE, size: 1, color: "000000" };
const BORDERS = { top: BORDER, bottom: BORDER, left: BORDER, right: BORDER };
const NO_BORDER = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };
const NO_BORDERS = { top: NO_BORDER, bottom: NO_BORDER, left: NO_BORDER, right: NO_BORDER };
const GRAY = { fill: "D9D9D9", type: ShadingType.CLEAR, color: "auto" };
const WHITE = { fill: "FFFFFF", type: ShadingType.CLEAR, color: "auto" };

// Portrait A4
const PAGE_W = 11906;
const PAGE_H = 16838;
const MARGIN = 720;
const CONTENT_W = PAGE_W - MARGIN * 2; // 10466

// 3 columns: Ngày | Bữa trưa | Bữa tối
const COL_W = [900, 4783, 4783];

function cell(
  children: Paragraph[],
  opts: {
    width?: number;
    rowSpan?: number;
    columnSpan?: number;
    shading?: any;
    borders?: any;
    margins?: { top: number; bottom: number; left: number; right: number };
    vAlign?: string;
  } = {},
): TableCell {
  return new TableCell({
    children,
    borders: opts.borders ?? BORDERS,
    width: { size: opts.width ?? 0, type: WidthType.DXA },
    rowSpan: opts.rowSpan,
    columnSpan: opts.columnSpan,
    shading: opts.shading ?? WHITE,
    verticalAlign: (opts.vAlign ?? VerticalAlign.TOP) as any,
    margins: opts.margins ?? { top: 60, bottom: 60, left: 80, right: 80 },
  });
}

function p(
  text: string,
  opts: {
    bold?: boolean;
    size?: number;
    color?: string;
    alignment?: string;
    italic?: boolean;
  } = {},
): Paragraph {
  return new Paragraph({
    alignment: (opts.alignment ?? AlignmentType.LEFT) as any,
    children: [
      new TextRun({
        text,
        font: "Arial",
        size: opts.size ?? 18,
        bold: opts.bold,
        color: opts.color,
        italics: opts.italic,
      }),
    ],
  });
}

function fmtDay(dateStr: string | null, ngaySo: number): string {
  if (!dateStr) return `Ngày ${ngaySo}`;
  try {
    return format(new Date(dateStr + "T00:00:00"), "dd/MM\n(EEE)", { locale: vi });
  } catch {
    return `Ngày ${ngaySo}`;
  }
}

export interface MenuWordDay {
  ngay_so: number;
  ngay_date: string | null;
  trua: { ten_nh: string; mon_list: string[] } | null;
  toi: { ten_nh: string; mon_list: string[] } | null;
}

export interface MenuWordData {
  tenDoan: string;
  hdvTen: string;
  soKhach: number;
  days: MenuWordDay[];
}

export async function exportMenuOverviewWord(data: MenuWordData) {
  const { tenDoan, hdvTen, soKhach, days } = data;

  // ── Header paragraphs ─────────────────────────────────────────────────────
  const titlePara = new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 0, after: 80 },
    children: [
      new TextRun({ text: "MENU ĐOÀN: ", font: "Arial", size: 28, bold: true }),
      new TextRun({ text: tenDoan, font: "Arial", size: 28, bold: true, color: "1A56DB" }),
    ],
  });

  const infoPara = new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 0, after: 200 },
    children: [
      new TextRun({ text: `HDV: ${hdvTen || "—"}`, font: "Arial", size: 20 }),
      new TextRun({ text: "     |     ", font: "Arial", size: 20, color: "888888" }),
      new TextRun({ text: `Số khách: ${soKhach}`, font: "Arial", size: 20 }),
    ],
  });

  // ── Table ─────────────────────────────────────────────────────────────────
  const headerRow = new TableRow({
    children: [
      cell([p("Ngày", { bold: true, size: 16, alignment: AlignmentType.CENTER })], {
        width: COL_W[0], shading: GRAY, vAlign: VerticalAlign.CENTER,
        margins: { top: 80, bottom: 80, left: 60, right: 60 },
      }),
      cell([p("🍱 Bữa trưa", { bold: true, size: 16, alignment: AlignmentType.CENTER })], {
        width: COL_W[1], shading: GRAY, vAlign: VerticalAlign.CENTER,
        margins: { top: 80, bottom: 80, left: 60, right: 60 },
      }),
      cell([p("🍽 Bữa tối", { bold: true, size: 16, alignment: AlignmentType.CENTER })], {
        width: COL_W[2], shading: GRAY, vAlign: VerticalAlign.CENTER,
        margins: { top: 80, bottom: 80, left: 60, right: 60 },
      }),
    ],
    tableHeader: true,
  });

  const dataRows: TableRow[] = days.map((day) => {
    // Ngày cell
    const ngayLines: Paragraph[] = [
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [new TextRun({ text: `Ngày ${day.ngay_so}`, font: "Arial", size: 16, bold: true })],
      }),
    ];
    if (day.ngay_date) {
      try {
        const d = new Date(day.ngay_date + "T00:00:00");
        ngayLines.push(new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [new TextRun({
            text: format(d, "dd/MM", { locale: vi }),
            font: "Arial", size: 14, color: "666666",
          })],
        }));
        ngayLines.push(new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [new TextRun({
            text: `(${format(d, "EEE", { locale: vi })})`,
            font: "Arial", size: 14, color: "666666",
          })],
        }));
      } catch { /* ignore */ }
    }

    // Meal cell builder
    const buildMealCell = (meal: { ten_nh: string; mon_list: string[] } | null, colIdx: number) => {
      if (!meal) {
        return cell([p("—", { size: 14, color: "AAAAAA", alignment: AlignmentType.CENTER })], {
          width: COL_W[colIdx],
        });
      }
      const children: Paragraph[] = [
        new Paragraph({
          spacing: { after: 60 },
          children: [new TextRun({ text: meal.ten_nh, font: "Arial", size: 17, bold: true, color: "1A3A6A" })],
        }),
        ...meal.mon_list.map((mon, i) =>
          new Paragraph({
            spacing: { after: 20 },
            children: [
              new TextRun({ text: `${i + 1}. `, font: "Arial", size: 16, color: "666666" }),
              new TextRun({ text: mon, font: "Arial", size: 16 }),
            ],
          })
        ),
        ...(meal.mon_list.length === 0
          ? [p("Chưa có món", { size: 14, color: "AAAAAA", italic: true })]
          : []),
      ];
      return cell(children, { width: COL_W[colIdx] });
    };

    return new TableRow({
      children: [
        cell(ngayLines, {
          width: COL_W[0],
          vAlign: VerticalAlign.CENTER,
          margins: { top: 80, bottom: 80, left: 60, right: 60 },
        }),
        buildMealCell(day.trua, 1),
        buildMealCell(day.toi, 2),
      ],
    });
  });

  const table = new Table({
    width: { size: CONTENT_W, type: WidthType.DXA },
    columnWidths: COL_W,
    rows: [headerRow, ...dataRows],
  });

  // ── Build document ────────────────────────────────────────────────────────
  const doc = new Document({
    sections: [{
      properties: {
        page: {
          size: { width: PAGE_W, height: PAGE_H, orientation: PageOrientation.PORTRAIT },
          margin: { top: MARGIN, right: MARGIN, bottom: MARGIN, left: MARGIN },
        },
      },
      children: [titlePara, infoPara, table],
    }],
  });

  const blob = await Packer.toBlob(doc);
  saveAs(blob, `Menu_${tenDoan}.docx`);
}
