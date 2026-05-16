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
const GRAY  = { fill: "D9D9D9", type: ShadingType.CLEAR, color: "auto" };
const WHITE = { fill: "FFFFFF", type: ShadingType.CLEAR, color: "auto" };

// ─── Shared helpers ───────────────────────────────────────────────────────────

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
    margins: opts.margins ?? { top: 50, bottom: 50, left: 80, right: 80 },
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
      new TextRun({ noProof: true,
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

// ─── Shared types ─────────────────────────────────────────────────────────────

export interface MenuWordMeal {
  ten_nh: string;
  ten_set?: string | null;
  gia?: number | null;
  don_vi?: string | null;
  ghi_chu_set?: string | null;
  mon_list: string[];
  mon_list_zh: string[];
}

export interface MenuWordDay {
  ngay_so: number;
  ngay_date: string | null;
  trua: MenuWordMeal | null;
  toi: MenuWordMeal | null;
}

export interface MenuWordData {
  tenDoan: string;
  hdvTen: string;
  soKhach: number;
  days: MenuWordDay[];
}

// ─── Original export (portrait, 3 col, VN only) ───────────────────────────────

// Portrait A4
const PORT_W = 11906;
const PORT_H = 16838;
const PORT_MARGIN = 720;
const PORT_CONTENT_W = PORT_W - PORT_MARGIN * 2; // 10466
const PORT_COL_W = [900, 4783, 4783];

export async function exportMenuOverviewWord(data: MenuWordData) {
  const { tenDoan, hdvTen, soKhach, days } = data;

  const titlePara = new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 0, after: 80 },
    children: [
      new TextRun({ noProof: true, text: "MENU ĐOÀN: ", font: "Arial", size: 28, bold: true }),
      new TextRun({ noProof: true, text: tenDoan, font: "Arial", size: 28, bold: true, color: "1A56DB" }),
    ],
  });

  const infoPara = new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 0, after: 200 },
    children: [
      new TextRun({ noProof: true, text: `HDV: ${hdvTen || "—"}`, font: "Arial", size: 20 }),
      new TextRun({ noProof: true, text: "     |     ", font: "Arial", size: 20, color: "888888" }),
      new TextRun({ noProof: true, text: `Số khách: ${soKhach}`, font: "Arial", size: 20 }),
    ],
  });

  const headerRow = new TableRow({
    children: [
      cell([p("Ngày", { bold: true, size: 16, alignment: AlignmentType.CENTER })], {
        width: PORT_COL_W[0], shading: GRAY, vAlign: VerticalAlign.CENTER,
        margins: { top: 80, bottom: 80, left: 60, right: 60 },
      }),
      cell([p("🍱 Bữa trưa", { bold: true, size: 16, alignment: AlignmentType.CENTER })], {
        width: PORT_COL_W[1], shading: GRAY, vAlign: VerticalAlign.CENTER,
        margins: { top: 80, bottom: 80, left: 60, right: 60 },
      }),
      cell([p("🍽 Bữa tối", { bold: true, size: 16, alignment: AlignmentType.CENTER })], {
        width: PORT_COL_W[2], shading: GRAY, vAlign: VerticalAlign.CENTER,
        margins: { top: 80, bottom: 80, left: 60, right: 60 },
      }),
    ],
    tableHeader: true,
  });

  const dataRows: TableRow[] = days.map((day) => {
    const ngayLines: Paragraph[] = [
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [new TextRun({ noProof: true, text: `Ngày ${day.ngay_so}`, font: "Arial", size: 16, bold: true })],
      }),
    ];
    if (day.ngay_date) {
      try {
        const d = new Date(day.ngay_date + "T00:00:00");
        ngayLines.push(new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [new TextRun({ noProof: true, text: format(d, "dd/MM", { locale: vi }), font: "Arial", size: 14, color: "666666" })],
        }));
        ngayLines.push(new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [new TextRun({ noProof: true, text: `(${format(d, "EEE", { locale: vi })})`, font: "Arial", size: 14, color: "666666" })],
        }));
      } catch { /* ignore */ }
    }

    const buildMealCell = (meal: MenuWordMeal | null, colIdx: number) => {
      if (!meal) {
        return cell([p("—", { size: 14, color: "AAAAAA", alignment: AlignmentType.CENTER })], { width: PORT_COL_W[colIdx] });
      }
      const children: Paragraph[] = [
        new Paragraph({
          spacing: { after: 60 },
          children: [new TextRun({ noProof: true, text: meal.ten_nh, font: "Arial", size: 17, bold: true, color: "1A3A6A" })],
        }),
        ...meal.mon_list.map((mon, i) =>
          new Paragraph({
            spacing: { after: 20 },
            children: [
              new TextRun({ noProof: true, text: `${i + 1}. `, font: "Arial", size: 16, color: "666666" }),
              new TextRun({ noProof: true, text: mon, font: "Arial", size: 16 }),
            ],
          })
        ),
        ...(meal.mon_list.length === 0 ? [p("Chưa có món", { size: 14, color: "AAAAAA", italic: true })] : []),
      ];
      return cell(children, { width: PORT_COL_W[colIdx] });
    };

    return new TableRow({
      children: [
        cell(ngayLines, { width: PORT_COL_W[0], vAlign: VerticalAlign.CENTER, margins: { top: 80, bottom: 80, left: 60, right: 60 } }),
        buildMealCell(day.trua, 1),
        buildMealCell(day.toi, 2),
      ],
    });
  });

  const table = new Table({
    width: { size: PORT_CONTENT_W, type: WidthType.DXA },
    columnWidths: PORT_COL_W,
    rows: [headerRow, ...dataRows],
  });

  const doc = new Document({
    sections: [{
      properties: {
        page: {
          size: { width: PORT_W, height: PORT_H, orientation: PageOrientation.PORTRAIT },
          margin: { top: PORT_MARGIN, right: PORT_MARGIN, bottom: PORT_MARGIN, left: PORT_MARGIN },
        },
      },
      children: [titlePara, infoPara, table],
    }],
  });

  const blob = await Packer.toBlob(doc);
  saveAs(blob, `Menu_${tenDoan}.docx`);
}

// ─── Xihong-style export (landscape, 6 col, VN + ZH) ─────────────────────────

const LAND_MARGIN = 720;
const LAND_CONTENT_W = PORT_H - LAND_MARGIN * 2; // 16838 - 1440 = 15398

const COL_NGAY    = 900;
const COL_TRUA_VN = 3300;
const COL_TRUA_ZH = 2800;
const COL_TOI_VN  = 3300;
const COL_TOI_ZH  = 2800;
const COL_GCHU    = LAND_CONTENT_W - COL_NGAY - COL_TRUA_VN - COL_TRUA_ZH - COL_TOI_VN - COL_TOI_ZH;

const LAND_COL_W = [COL_NGAY, COL_TRUA_VN, COL_TRUA_ZH, COL_TOI_VN, COL_TOI_ZH, COL_GCHU];

const RED       = "C00000";
const TRUA_BG   = { fill: "E2EFDA", type: ShadingType.CLEAR, color: "auto" };
const TOI_BG    = { fill: "FCE4D6", type: ShadingType.CLEAR, color: "auto" };
const DATE_BG   = { fill: "F5F5F5", type: ShadingType.CLEAR, color: "auto" };

function buildNHHeader(meal: MenuWordMeal): Paragraph[] {
  const paras: Paragraph[] = [];
  paras.push(new Paragraph({
    spacing: { after: 30 },
    children: [new TextRun({ noProof: true, text: meal.ten_nh, font: "Arial", size: 20, bold: true, color: RED })],
  }));
  return paras;
}

export async function exportMenuXihongWord(data: MenuWordData) {
  const { tenDoan, hdvTen, soKhach, days } = data;

  const titlePara = new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 0, after: 80 },
    children: [
      new TextRun({ noProof: true, text: "THỰC ĐƠN ĐOÀN: ", font: "Arial", size: 28, bold: true }),
      new TextRun({ noProof: true, text: tenDoan, font: "Arial", size: 28, bold: true, color: "1A56DB" }),
    ],
  });

  const infoPara = new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 0, after: 160 },
    children: [
      new TextRun({ noProof: true, text: `HDV: ${hdvTen || "—"}`, font: "Arial", size: 20 }),
      new TextRun({ noProof: true, text: "     |     ", font: "Arial", size: 20, color: "888888" }),
      new TextRun({ noProof: true, text: `Số khách: ${soKhach}`, font: "Arial", size: 20 }),
    ],
  });

  const rows: TableRow[] = [];

  // Global header row
  rows.push(new TableRow({
    tableHeader: true,
    children: [
      cell([p("Ngày", { bold: true, size: 16, alignment: AlignmentType.CENTER })], {
        width: COL_NGAY, shading: GRAY, vAlign: VerticalAlign.CENTER,
        margins: { top: 80, bottom: 80, left: 60, right: 60 },
      }),
      cell([p("🍱 中餐 / Bữa trưa", { bold: true, size: 18, alignment: AlignmentType.CENTER })], {
        width: COL_TRUA_VN + COL_TRUA_ZH, columnSpan: 2, shading: TRUA_BG,
        vAlign: VerticalAlign.CENTER,
        margins: { top: 80, bottom: 80, left: 60, right: 60 },
      }),
      cell([p("🍽 晚餐 / Bữa tối", { bold: true, size: 18, alignment: AlignmentType.CENTER })], {
        width: COL_TOI_VN + COL_TOI_ZH, columnSpan: 2, shading: TOI_BG,
        vAlign: VerticalAlign.CENTER,
        margins: { top: 80, bottom: 80, left: 60, right: 60 },
      }),
      cell([p("备注 / Ghi chú", { bold: true, size: 16, alignment: AlignmentType.CENTER })], {
        width: COL_GCHU, shading: GRAY, vAlign: VerticalAlign.CENTER,
        margins: { top: 80, bottom: 80, left: 60, right: 60 },
      }),
    ],
  }));

  for (const day of days) {
    const truaMons = day.trua?.mon_list ?? [];
    const truaZhs  = day.trua?.mon_list_zh ?? [];
    const toiMons  = day.toi?.mon_list ?? [];
    const toiZhs   = day.toi?.mon_list_zh ?? [];
    const maxRows  = Math.max(truaMons.length, toiMons.length);
    const rowSpan  = 1 + maxRows;

    // Date cell
    const ngayParas: Paragraph[] = [
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 30 },
        children: [new TextRun({ noProof: true, text: `Ngày ${day.ngay_so}`, font: "Arial", size: 17, bold: true })],
      }),
    ];
    if (day.ngay_date) {
      try {
        const d = new Date(day.ngay_date + "T00:00:00");
        ngayParas.push(new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [new TextRun({ noProof: true,
            text: format(d, "dd/MM (EEE)", { locale: vi }),
            font: "Arial", size: 15, color: "555555",
          })],
        }));
      } catch { /* ignore */ }
    }

    // NH header row
    rows.push(new TableRow({
      children: [
        cell(ngayParas, {
          width: COL_NGAY, rowSpan: rowSpan,
          vAlign: VerticalAlign.CENTER, shading: DATE_BG,
          margins: { top: 80, bottom: 80, left: 60, right: 60 },
        }),
        cell(
          day.trua ? buildNHHeader(day.trua) : [p("—", { size: 14, color: "AAAAAA" })],
          { width: COL_TRUA_VN + COL_TRUA_ZH, columnSpan: 2, shading: TRUA_BG,
            margins: { top: 80, bottom: 80, left: 80, right: 80 } },
        ),
        cell(
          day.toi ? buildNHHeader(day.toi) : [p("—", { size: 14, color: "AAAAAA" })],
          { width: COL_TOI_VN + COL_TOI_ZH, columnSpan: 2, shading: TOI_BG,
            margins: { top: 80, bottom: 80, left: 80, right: 80 } },
        ),
        cell([p("", { size: 14 })], { width: COL_GCHU, rowSpan: rowSpan }),
      ],
    }));

    // Dish rows
    for (let i = 0; i < maxRows; i++) {
      const truaVN = truaMons[i] ?? "";
      const truaZH = truaZhs[i] ?? "";
      const toiVN  = toiMons[i] ?? "";
      const toiZH  = toiZhs[i] ?? "";

      const dishPara = (num: number, vn: string) =>
        vn
          ? new Paragraph({
              spacing: { after: 0 },
              children: [
                new TextRun({ noProof: true, text: `${num}. `, font: "Arial", size: 16, color: "777777" }),
                new TextRun({ noProof: true, text: vn, font: "Arial", size: 16 }),
              ],
            })
          : p("", { size: 14 });

      const zhPara = (zh: string) =>
        zh
          ? new Paragraph({
              spacing: { after: 0 },
              children: [new TextRun({ noProof: true, text: zh, font: "Arial", size: 16, color: "333333" })],
            })
          : p("", { size: 14 });

      rows.push(new TableRow({
        children: [
          cell([dishPara(i + 1, truaVN)], { width: COL_TRUA_VN, margins: { top: 30, bottom: 30, left: 80, right: 40 } }),
          cell([zhPara(truaZH)],           { width: COL_TRUA_ZH, margins: { top: 30, bottom: 30, left: 40, right: 80 } }),
          cell([dishPara(i + 1, toiVN)],  { width: COL_TOI_VN,  margins: { top: 30, bottom: 30, left: 80, right: 40 } }),
          cell([zhPara(toiZH)],            { width: COL_TOI_ZH,  margins: { top: 30, bottom: 30, left: 40, right: 80 } }),
        ],
      }));
    }
  }

  const table = new Table({
    width: { size: LAND_CONTENT_W, type: WidthType.DXA },
    columnWidths: LAND_COL_W,
    rows,
  });

  const doc = new Document({
    sections: [{
      properties: {
        page: {
          size: { width: PORT_H, height: PORT_W, orientation: PageOrientation.LANDSCAPE },
          margin: { top: LAND_MARGIN, right: LAND_MARGIN, bottom: LAND_MARGIN, left: LAND_MARGIN },
        },
      },
      children: [titlePara, infoPara, table],
    }],
  });

  const blob = await Packer.toBlob(doc);
  saveAs(blob, `Menu_Xihong_${tenDoan}.docx`);
}
