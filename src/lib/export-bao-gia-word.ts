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
} from "docx";
import { saveAs } from "file-saver";
import type { BaoGiaKetQua, BaoGiaItem } from "@/hooks/use-bao-gia";

// ── Constants ────────────────────────────────────────────────────────────────
const BORDER = { style: BorderStyle.SINGLE, size: 1, color: "000000" };
const BORDERS = { top: BORDER, bottom: BORDER, left: BORDER, right: BORDER };
const NO_BORDER = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };
const NO_BORDERS = { top: NO_BORDER, bottom: NO_BORDER, left: NO_BORDER, right: NO_BORDER };
const HEADER_SHADING = { fill: "D9D9D9", type: ShadingType.CLEAR, color: "auto" };
const BLUE_SHADING = { fill: "185FA5", type: ShadingType.CLEAR, color: "auto" };
const NO_SHADING = { fill: "FFFFFF", type: ShadingType.CLEAR, color: "auto" };
const RESULT_SHADING = { fill: "1E3A6E", type: ShadingType.CLEAR, color: "auto" };

const PAGE_W = 11906;
const PAGE_H = 16838;
const MARGIN = 1080;
const CONTENT_W = PAGE_W - MARGIN * 2; // 9746

const LOAI_LABEL: Record<string, string> = {
  hotel: "Khách sạn",
  meal: "Ăn uống",
  ticket: "Vé tham quan",
  transport: "Xe",
};

// ── Helpers ──────────────────────────────────────────────────────────────────
function cell(
  children: Paragraph[],
  opts: {
    width?: number;
    shading?: typeof HEADER_SHADING;
    vertAlign?: (typeof VerticalAlign)[keyof typeof VerticalAlign];
    colSpan?: number;
    borders?: any;
    margins?: { top?: number; bottom?: number; left?: number; right?: number };
  } = {}
): TableCell {
  return new TableCell({
    children,
    borders: opts.borders ?? BORDERS,
    width: { size: opts.width ?? 0, type: WidthType.DXA },
    shading: opts.shading ?? NO_SHADING,
    verticalAlign: (opts.vertAlign ?? VerticalAlign.CENTER) as any,
    columnSpan: opts.colSpan,
    margins: opts.margins ?? { top: 60, bottom: 60, left: 100, right: 100 },
  });
}

function p(
  text: string,
  opts: {
    bold?: boolean;
    size?: number;
    color?: string;
    align?: (typeof AlignmentType)[keyof typeof AlignmentType];
    italics?: boolean;
  } = {}
): Paragraph {
  return new Paragraph({
    alignment: opts.align ?? AlignmentType.LEFT,
    children: [
      new TextRun({
        text,
        bold: opts.bold,
        size: opts.size ?? 20,
        color: opts.color ?? "000000",
        italics: opts.italics,
        font: "Times New Roman",
      }),
    ],
  });
}

const fmt = (n: number) => Math.round(n).toLocaleString("vi-VN");
const fmtUsd = (n: number) => n.toFixed(2);

// ── Main export ───────────────────────────────────────────────────────────────
export async function exportBaoGiaWord(
  ketQua: BaoGiaKetQua,
  exchangeRate: number,
  profitUsd: number
) {
  const today = new Date().toLocaleDateString("vi-VN");
  const { case_16, case_20 } = ketQua;
  const HALF = Math.floor(CONTENT_W / 2);

  // ── 1. Header ─────────────────────────────────────────────────────────────
  const headerTable = new Table({
    width: { size: CONTENT_W, type: WidthType.DXA },
    rows: [
      new TableRow({
        children: [
          cell(
            [
              p("CÔNG TY TNHH DU LỊCH S8", { bold: true, size: 22, align: AlignmentType.CENTER }),
              p("S8 TRAVEL COMPANY", { size: 18, color: "555555", align: AlignmentType.CENTER }),
              p("MST: 0402021137", { size: 18, color: "555555", align: AlignmentType.CENTER }),
            ],
            { width: HALF, margins: { top: 120, bottom: 120, left: 120, right: 120 } }
          ),
          cell(
            [
              p("CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM", { bold: true, size: 22, align: AlignmentType.CENTER }),
              p("Độc lập – Tự do – Hạnh phúc", { bold: true, size: 20, align: AlignmentType.CENTER }),
              p("——————————————", { size: 18, color: "888888", align: AlignmentType.CENTER }),
              p(`Hà Nội, ngày ${today}`, { size: 18, italics: true, color: "555555", align: AlignmentType.CENTER }),
            ],
            { width: CONTENT_W - HALF, margins: { top: 120, bottom: 120, left: 120, right: 120 } }
          ),
        ],
      }),
    ],
  });

  // ── 2. Title ──────────────────────────────────────────────────────────────
  const titlePara = new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 200, after: 100 },
    children: [new TextRun({ text: "BẢNG BÁO GIÁ TOUR", bold: true, size: 32, font: "Times New Roman" })],
  });

  const subTitlePara = new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 0, after: 200 },
    children: [
      new TextRun({ text: ketQua.ten_chuong_trinh, bold: true, size: 24, color: "185FA5", font: "Times New Roman" }),
      new TextRun({ text: `  •  ${ketQua.so_ngay} ngày`, size: 20, color: "555555", font: "Times New Roman" }),
    ],
  });

  // ── 3. Params ─────────────────────────────────────────────────────────────
  const LW = 2500;
  const paramsTable = new Table({
    width: { size: CONTENT_W, type: WidthType.DXA },
    rows: [
      new TableRow({
        children: [
          cell([p("Tỷ giá (VND/USD):", { bold: true })], { width: LW, shading: HEADER_SHADING }),
          cell([p(`${fmt(exchangeRate)} VND`)], { width: CONTENT_W / 2 - LW }),
          cell([p("Lợi nhuận (USD):", { bold: true })], { width: LW, shading: HEADER_SHADING }),
          cell([p(`${profitUsd} USD`)], { width: CONTENT_W / 2 - LW }),
        ],
      }),
    ],
  });

  const spacer = new Paragraph({ spacing: { before: 160, after: 0 }, children: [] });

  // ── 4. Dịch vụ ────────────────────────────────────────────────────────────
  const sectionLabel = (text: string) =>
    new Paragraph({
      spacing: { before: 180, after: 80 },
      children: [new TextRun({ text, bold: true, size: 22, font: "Times New Roman", color: "185FA5" })],
    });

  const COL_LOAI = 1400;
  const COL_MOTA = CONTENT_W - COL_LOAI - 2000 - 2346;
  const COL_GIA = 2000;
  const COL_GHU = 2346;

  const serviceHeaderRow = new TableRow({
    tableHeader: true,
    children: [
      cell([p("Loại", { bold: true, align: AlignmentType.CENTER })], { width: COL_LOAI, shading: HEADER_SHADING }),
      cell([p("Mô tả", { bold: true, align: AlignmentType.CENTER })], { width: COL_MOTA, shading: HEADER_SHADING }),
      cell([p("Đơn giá (VND)", { bold: true, align: AlignmentType.CENTER })], { width: COL_GIA, shading: HEADER_SHADING }),
      cell([p("Ghi chú", { bold: true, align: AlignmentType.CENTER })], { width: COL_GHU, shading: HEADER_SHADING }),
    ],
  });

  const serviceDataRows = ketQua.items.map((item: BaoGiaItem) =>
    new TableRow({
      children: [
        cell([p(LOAI_LABEL[item.loai] ?? item.loai)], { width: COL_LOAI }),
        cell([p(item.mo_ta)], { width: COL_MOTA }),
        cell([p(fmt(item.don_gia), { align: AlignmentType.RIGHT })], { width: COL_GIA }),
        cell([p(item.ghi_chu, { color: "555555", size: 18 })], { width: COL_GHU }),
      ],
    })
  );

  const serviceTable = new Table({
    width: { size: CONTENT_W, type: WidthType.DXA },
    rows: [serviceHeaderRow, ...serviceDataRows],
  });

  // ── 5. Chi phí cố định ───────────────────────────────────────────────────
  const COL_CP = Math.floor(CONTENT_W / 3);
  const fixedCostTable = new Table({
    width: { size: CONTENT_W, type: WidthType.DXA },
    rows: [
      new TableRow({
        tableHeader: true,
        children: [
          cell([p("Khoản mục", { bold: true, align: AlignmentType.CENTER })], { width: COL_CP, shading: HEADER_SHADING }),
          cell([p("16 khách", { bold: true, align: AlignmentType.CENTER })], { width: COL_CP, shading: HEADER_SHADING }),
          cell([p("20 khách", { bold: true, align: AlignmentType.CENTER })], { width: CONTENT_W - COL_CP * 2, shading: HEADER_SHADING }),
        ],
      }),
      ...[
        { label: "Bảo hiểm (100k × pax)", v16: case_16.insurance, v20: case_20.insurance },
        { label: `HDV (200k × ${ketQua.so_ngay} ngày)`, v16: case_16.guide, v20: case_20.guide },
        { label: "Tips", v16: case_16.tips, v20: case_20.tips },
      ].map(({ label, v16, v20 }) =>
        new TableRow({
          children: [
            cell([p(label)], { width: COL_CP }),
            cell([p(fmt(v16), { align: AlignmentType.RIGHT })], { width: COL_CP }),
            cell([p(fmt(v20), { align: AlignmentType.RIGHT })], { width: CONTENT_W - COL_CP * 2 }),
          ],
        })
      ),
    ],
  });

  // ── 6. So sánh 2 case ────────────────────────────────────────────────────
  const compareRows = [
    { label: "Tổng khách sạn", v16: case_16.hotel, v20: case_20.hotel },
    { label: "Tổng ăn uống", v16: case_16.meal, v20: case_20.meal },
    { label: "Tổng vé tham quan", v16: case_16.ticket, v20: case_20.ticket },
    { label: "Xe", v16: case_16.transport, v20: case_20.transport },
    { label: "Tổng chi phí", v16: case_16.total_cost, v20: case_20.total_cost },
    { label: "Lợi nhuận (VND)", v16: case_16.profit_vnd, v20: case_20.profit_vnd },
  ];

  const compareTable = new Table({
    width: { size: CONTENT_W, type: WidthType.DXA },
    rows: [
      new TableRow({
        tableHeader: true,
        children: [
          cell([p("Chỉ số", { bold: true })], { width: COL_CP, shading: HEADER_SHADING }),
          cell([p("16 khách (pax=17, phòng=9)", { bold: true, align: AlignmentType.CENTER })], { width: COL_CP, shading: HEADER_SHADING }),
          cell([p("20 khách (pax=21, phòng=11)", { bold: true, align: AlignmentType.CENTER })], { width: CONTENT_W - COL_CP * 2, shading: HEADER_SHADING }),
        ],
      }),
      ...compareRows.map(({ label, v16, v20 }) =>
        new TableRow({
          children: [
            cell([p(label)], { width: COL_CP }),
            cell([p(fmt(v16), { align: AlignmentType.RIGHT })], { width: COL_CP }),
            cell([p(fmt(v20), { align: AlignmentType.RIGHT })], { width: CONTENT_W - COL_CP * 2 }),
          ],
        })
      ),
      // Giá/khách VND
      new TableRow({
        children: [
          cell([p("Giá/khách (VND)", { bold: true, color: "FFFFFF" })], { width: COL_CP, shading: BLUE_SHADING }),
          cell([p(fmt(case_16.final_price_vnd), { bold: true, align: AlignmentType.RIGHT, color: "FFFFFF" })], { width: COL_CP, shading: BLUE_SHADING }),
          cell([p(fmt(case_20.final_price_vnd), { bold: true, align: AlignmentType.RIGHT, color: "FFFFFF" })], { width: CONTENT_W - COL_CP * 2, shading: BLUE_SHADING }),
        ],
      }),
      // Giá/khách USD
      new TableRow({
        children: [
          cell([p("Giá/khách (USD)", { bold: true, color: "FFFFFF" })], { width: COL_CP, shading: BLUE_SHADING }),
          cell([p(fmtUsd(case_16.final_price_usd), { bold: true, align: AlignmentType.RIGHT, color: "FFFFFF" })], { width: COL_CP, shading: BLUE_SHADING }),
          cell([p(fmtUsd(case_20.final_price_usd), { bold: true, align: AlignmentType.RIGHT, color: "FFFFFF" })], { width: CONTENT_W - COL_CP * 2, shading: BLUE_SHADING }),
        ],
      }),
    ],
  });

  // ── 7. Kết luận ───────────────────────────────────────────────────────────
  const conclusionTable = new Table({
    width: { size: CONTENT_W, type: WidthType.DXA },
    rows: [
      new TableRow({
        children: [
          cell(
            [
              p("GIÁ ĐỀ XUẤT (TRUNG BÌNH 2 PHƯƠNG ÁN)", { bold: true, size: 18, color: "FFFFFF", align: AlignmentType.CENTER }),
              p(`${fmt(ketQua.gia_trung_binh_vnd)} VND / khách`, { bold: true, size: 32, color: "FFFFFF", align: AlignmentType.CENTER }),
              p(`≈ ${fmtUsd(ketQua.gia_trung_binh_usd)} USD / khách`, { size: 20, color: "CCDDFF", align: AlignmentType.CENTER }),
            ],
            {
              width: CONTENT_W,
              colSpan: 1,
              shading: RESULT_SHADING,
              margins: { top: 200, bottom: 200, left: 200, right: 200 },
            }
          ),
        ],
      }),
    ],
  });

  // ── Assemble ──────────────────────────────────────────────────────────────
  const doc = new Document({
    sections: [
      {
        properties: {
          page: {
            size: { width: PAGE_W, height: PAGE_H },
            margin: { top: MARGIN, bottom: MARGIN, left: MARGIN, right: MARGIN },
          },
        },
        children: [
          headerTable,
          titlePara,
          subTitlePara,
          paramsTable,
          spacer,
          sectionLabel("I. CHI TIẾT DỊCH VỤ"),
          serviceTable,
          spacer,
          sectionLabel("II. CHI PHÍ CỐ ĐỊNH"),
          fixedCostTable,
          spacer,
          sectionLabel("III. SO SÁNH 2 PHƯƠNG ÁN (16 VÀ 20 KHÁCH)"),
          compareTable,
          spacer,
          conclusionTable,
        ],
      },
    ],
  });

  const blob = await Packer.toBlob(doc);
  const safeName = ketQua.ten_chuong_trinh.replace(/[^a-zA-Z0-9\u00C0-\u024F\u4E00-\u9FFF\s]/g, "").trim() || "tour";
  saveAs(blob, `bao_gia_${safeName}.docx`);
}
