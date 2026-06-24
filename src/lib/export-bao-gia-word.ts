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
import type { ITableCellBorders, TableVerticalAlign } from "docx";
import { saveAs } from "file-saver";
import type { BaoGiaKetQua, BaoGiaItem } from "@/hooks/use-bao-gia";

// ── Types ─────────────────────────────────────────────────────────────────────
export interface ManualDayData {
  ngay: number;
  canhDiem: Array<{ bang_gia_ten: string; gia: number | null }>;
  anTrua: { bang_gia_ten: string; gia: number | null };
  anToi: { bang_gia_ten: string; gia: number | null };
  khachSan: { bang_gia_ten: string; gia: number | null };
}

// 1 bậc giá (số khách → giá bán/khách) cho bảng ma trận trong Word.
export interface TierPrice {
  guests: number;
  gia_ban_vnd: number;
  gia_ban_usd: number;
}

// ── Constants ────────────────────────────────────────────────────────────────
const BORDER    = { style: BorderStyle.SINGLE, size: 1, color: "000000" };
const BORDERS   = { top: BORDER, bottom: BORDER, left: BORDER, right: BORDER };
const HEADER_SHADING  = { fill: "D9D9D9", type: ShadingType.CLEAR, color: "auto" };
const BLUE_SHADING    = { fill: "185FA5", type: ShadingType.CLEAR, color: "auto" };
const LIGHTBLUE_SHADING = { fill: "D6E4F7", type: ShadingType.CLEAR, color: "auto" };
const DAY_SHADING     = { fill: "F0F0F0", type: ShadingType.CLEAR, color: "auto" };
const NO_SHADING      = { fill: "FFFFFF", type: ShadingType.CLEAR, color: "auto" };
const RESULT_SHADING  = { fill: "1E3A6E", type: ShadingType.CLEAR, color: "auto" };

const PAGE_W    = 11906;
const PAGE_H    = 16838;
const MARGIN    = 1080;
const CONTENT_W = PAGE_W - MARGIN * 2; // 9746

const LOAI_LABEL: Record<string, string> = {
  hotel: "Khách sạn",
  meal:  "Ăn uống",
  ticket:"Vé tham quan",
  transport: "Xe",
};

// ── Helpers ───────────────────────────────────────────────────────────────────
function cell(
  children: Paragraph[],
  opts: {
    width?: number;
    shading?: typeof HEADER_SHADING;
    vertAlign?: TableVerticalAlign;
    colSpan?: number;
    rowSpan?: number;
    borders?: ITableCellBorders;
    margins?: { top?: number; bottom?: number; left?: number; right?: number };
  } = {}
): TableCell {
  return new TableCell({
    children,
    borders:        opts.borders  ?? BORDERS,
    width:          { size: opts.width ?? 0, type: WidthType.DXA },
    shading:        opts.shading  ?? NO_SHADING,
    verticalAlign:  opts.vertAlign ?? VerticalAlign.CENTER,
    columnSpan:     opts.colSpan,
    rowSpan:        opts.rowSpan,
    margins:        opts.margins  ?? { top: 60, bottom: 60, left: 100, right: 100 },
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
      new TextRun({ noProof: true,
        text,
        bold:    opts.bold,
        size:    opts.size ?? 20,
        color:   opts.color ?? "000000",
        italics: opts.italics,
        font:    "Times New Roman",
      }),
    ],
  });
}

const fmt    = (n: number) => Math.round(n).toLocaleString("vi-VN");
const fmtUsd = (n: number) => n.toFixed(2);
const spacer = () => new Paragraph({ spacing: { before: 160, after: 0 }, children: [] });

const sectionLabel = (text: string) =>
  new Paragraph({
    spacing: { before: 180, after: 80 },
    children: [new TextRun({ noProof: true, text, bold: true, size: 22, font: "Times New Roman", color: "185FA5" })],
  });

// ── Main export ───────────────────────────────────────────────────────────────
export async function exportBaoGiaWord(
  ketQua: BaoGiaKetQua,
  exchangeRate: number,
  profitUsd: number,
  manualDays?: ManualDayData[],
  tiers?: TierPrice[]
) {
  const doc = manualDays
    ? buildManualDoc(ketQua, exchangeRate, profitUsd, manualDays)
    : buildAutoDoc(ketQua, exchangeRate, profitUsd, tiers);

  const blob = await Packer.toBlob(doc);
  const safeName =
    ketQua.ten_chuong_trinh
      .replace(/[^a-zA-Z0-9À-ɏ一-鿿\s]/g, "")
      .trim() || "tour";
  saveAs(blob, `bao_gia_${safeName}.docx`);
}

// ── Manual format (Chinese-style quotation) ───────────────────────────────────
function buildManualDoc(
  ketQua: BaoGiaKetQua,
  exchangeRate: number,
  _profitUsd: number,
  manualDays: ManualDayData[]
): Document {
  const today = new Date();
  const todayStr = `${today.getDate()}/${today.getMonth() + 1}/${today.getFullYear()}`;

  // Price tiers
  const price1523   = Math.round(ketQua.gia_trung_binh_usd);
  const price1014   = price1523 + 30;
  const price24plus = price1523 - 10;
  const totalHotelVnd = manualDays.reduce((s, d) => s + (d.khachSan.gia ?? 0), 0);
  const singleRoom  = Math.round(totalHotelVnd / 2 / exchangeRate) + 10;

  // Hotel days (for price table left column)
  const hotelDays = manualDays
    .filter((d) => d.khachSan.bang_gia_ten)
    .sort((a, b) => a.ngay - b.ngay);

  // ── Column widths ─────────────────────────────────────────────────────────
  const LEFT_W  = 4200;
  const PRICE_W = Math.floor((CONTENT_W - LEFT_W) / 4); // 1386

  // ── 1. Company header ─────────────────────────────────────────────────────
  const HALF = Math.floor(CONTENT_W / 2);
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
              p(`Hà Nội, ngày ${todayStr}`, { size: 18, italics: true, color: "555555", align: AlignmentType.CENTER }),
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
    children: [new TextRun({ noProof: true, text: "BẢNG BÁO GIÁ TOUR", bold: true, size: 32, font: "Times New Roman" })],
  });
  const subTitlePara = new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 0, after: 200 },
    children: [
      new TextRun({ noProof: true, text: ketQua.ten_chuong_trinh, bold: true, size: 24, color: "185FA5", font: "Times New Roman" }),
      new TextRun({ noProof: true, text: `  •  ${ketQua.so_ngay} ngày`, size: 20, color: "555555", font: "Times New Roman" }),
    ],
  });

  // ── 3. Price table (Chinese style) ────────────────────────────────────────
  const priceHeaderRow1 = new TableRow({
    children: [
      cell(
        [
          new Paragraph({
            children: [
              new TextRun({ noProof: true, text: "S8 Travel ", bold: true, size: 22, color: "C00000", font: "Times New Roman" }),
              new TextRun({ noProof: true, text: "報價：", bold: true, size: 22, color: "C00000", font: "Times New Roman" }),
            ],
          }),
        ],
        { width: LEFT_W, margins: { top: 80, bottom: 80, left: 120, right: 120 } }
      ),
      cell(
        [
          p(
            `${todayStr}\u3000報價出去（報價效期：3 個月）`,
            { bold: true, size: 20, color: "FFFFFF", align: AlignmentType.CENTER }
          ),
        ],
        {
          width: PRICE_W * 4,
          colSpan: 4,
          shading: BLUE_SHADING,
          margins: { top: 80, bottom: 80, left: 120, right: 120 },
        }
      ),
    ],
  });

  const priceHeaderRow2 = new TableRow({
    children: [
      cell([p("TOUR FEE (USD/pax)", { bold: true, size: 18 })], { width: LEFT_W, shading: HEADER_SHADING }),
      cell([p("10-14 pax", { bold: true, size: 18, align: AlignmentType.CENTER })], { width: PRICE_W, shading: HEADER_SHADING }),
      cell([p("15-23 pax", { bold: true, size: 18, align: AlignmentType.CENTER })], { width: PRICE_W, shading: HEADER_SHADING }),
      cell(
        [
          p("24pax", { bold: true, size: 18, align: AlignmentType.CENTER }),
          p("以上",  { bold: true, size: 18, align: AlignmentType.CENTER }),
        ],
        { width: PRICE_W, shading: HEADER_SHADING }
      ),
      cell([p("單房差", { bold: true, size: 18, align: AlignmentType.CENTER })], { width: PRICE_W, shading: HEADER_SHADING }),
    ],
  });

  // Hotel data rows + price row
  const buildPriceRows = (): TableRow[] => {
    if (hotelDays.length === 0) {
      // No hotels — just show prices in a single row
      return [
        new TableRow({
          children: [
            cell([p(ketQua.ten_chuong_trinh || "—")], { width: LEFT_W }),
            cell([p(`$${price1014}`, { bold: true, align: AlignmentType.CENTER, size: 22 })], { width: PRICE_W, shading: LIGHTBLUE_SHADING }),
            cell([p(`$${price1523}`, { bold: true, align: AlignmentType.CENTER, size: 22 })], { width: PRICE_W, shading: LIGHTBLUE_SHADING }),
            cell([p(`$${price24plus}`, { bold: true, align: AlignmentType.CENTER, size: 22 })], { width: PRICE_W, shading: LIGHTBLUE_SHADING }),
            cell([p(`$${singleRoom}`, { bold: true, align: AlignmentType.CENTER, size: 22 })], { width: PRICE_W, shading: LIGHTBLUE_SHADING }),
          ],
        }),
      ];
    }

    const n = hotelDays.length;
    return hotelDays.map((d, idx) => {
      const isFirst = idx === 0;
      const hotelCell = cell(
        [p(`D${d.ngay}\u3000\u3000${d.khachSan.bang_gia_ten}`, { size: 18 })],
        { width: LEFT_W, margins: { top: 60, bottom: 60, left: 100, right: 100 } }
      );

      if (isFirst) {
        return new TableRow({
          children: [
            hotelCell,
            cell(
              [p(`$${price1014}`, { bold: true, align: AlignmentType.CENTER, size: 24, color: "1E3A6E" })],
              { width: PRICE_W, rowSpan: n, shading: LIGHTBLUE_SHADING, vertAlign: VerticalAlign.CENTER }
            ),
            cell(
              [p(`$${price1523}`, { bold: true, align: AlignmentType.CENTER, size: 24, color: "1E3A6E" })],
              { width: PRICE_W, rowSpan: n, shading: LIGHTBLUE_SHADING, vertAlign: VerticalAlign.CENTER }
            ),
            cell(
              [p(`$${price24plus}`, { bold: true, align: AlignmentType.CENTER, size: 24, color: "1E3A6E" })],
              { width: PRICE_W, rowSpan: n, shading: LIGHTBLUE_SHADING, vertAlign: VerticalAlign.CENTER }
            ),
            cell(
              [p(`$${singleRoom}`, { bold: true, align: AlignmentType.CENTER, size: 24, color: "1E3A6E" })],
              { width: PRICE_W, rowSpan: n, shading: LIGHTBLUE_SHADING, vertAlign: VerticalAlign.CENTER }
            ),
          ],
        });
      }

      // Continuation rows — only hotel name cell
      return new TableRow({
        children: [hotelCell],
      });
    });
  };

  const priceTable = new Table({
    width: { size: CONTENT_W, type: WidthType.DXA },
    rows: [priceHeaderRow1, priceHeaderRow2, ...buildPriceRows()],
  });

  // ── 4. Program details table ───────────────────────────────────────────────
  // Columns: [Loại | Dịch vụ | Đơn giá VND]
  const TYPE_W    = 1800;
  const SVC_W     = CONTENT_W - TYPE_W - 2000;
  const PRICE_COL = 2000;

  const programRows: TableRow[] = [];

  // Header
  programRows.push(
    new TableRow({
      tableHeader: true,
      children: [
        cell([p("Loại",          { bold: true, align: AlignmentType.CENTER })], { width: TYPE_W,    shading: HEADER_SHADING }),
        cell([p("Dịch vụ",       { bold: true, align: AlignmentType.CENTER })], { width: SVC_W,     shading: HEADER_SHADING }),
        cell([p("Đơn giá (VND)", { bold: true, align: AlignmentType.CENTER })], { width: PRICE_COL, shading: HEADER_SHADING }),
      ],
    })
  );

  const sortedDays = [...manualDays].sort((a, b) => a.ngay - b.ngay);

  for (const d of sortedDays) {
    const hasData =
      d.canhDiem.some((c) => c.bang_gia_ten) ||
      d.anTrua.bang_gia_ten ||
      d.anToi.bang_gia_ten ||
      d.khachSan.bang_gia_ten;

    if (!hasData) continue;

    // Day separator row
    programRows.push(
      new TableRow({
        children: [
          cell(
            [p(`Ngày ${d.ngay}`, { bold: true, size: 18, color: "185FA5" })],
            { width: CONTENT_W, colSpan: 3, shading: DAY_SHADING }
          ),
        ],
      })
    );

    // Cảnh điểm
    for (const cd of d.canhDiem.filter((c) => c.bang_gia_ten)) {
      programRows.push(
        new TableRow({
          children: [
            cell([p("Cảnh điểm", { size: 18 })],             { width: TYPE_W }),
            cell([p(cd.bang_gia_ten, { size: 18 })],          { width: SVC_W }),
            cell([p(cd.gia ? fmt(cd.gia) : "—", { size: 18, align: AlignmentType.RIGHT })], { width: PRICE_COL }),
          ],
        })
      );
    }

    // Ăn trưa
    if (d.anTrua.bang_gia_ten) {
      programRows.push(
        new TableRow({
          children: [
            cell([p("Ăn trưa", { size: 18 })],                                     { width: TYPE_W }),
            cell([p(d.anTrua.bang_gia_ten, { size: 18 })],                          { width: SVC_W }),
            cell([p(d.anTrua.gia ? fmt(d.anTrua.gia) : "—", { size: 18, align: AlignmentType.RIGHT })], { width: PRICE_COL }),
          ],
        })
      );
    }

    // Ăn tối
    if (d.anToi.bang_gia_ten) {
      programRows.push(
        new TableRow({
          children: [
            cell([p("Ăn tối", { size: 18 })],                                       { width: TYPE_W }),
            cell([p(d.anToi.bang_gia_ten, { size: 18 })],                            { width: SVC_W }),
            cell([p(d.anToi.gia ? fmt(d.anToi.gia) : "—", { size: 18, align: AlignmentType.RIGHT })], { width: PRICE_COL }),
          ],
        })
      );
    }

    // Khách sạn
    if (d.khachSan.bang_gia_ten) {
      programRows.push(
        new TableRow({
          children: [
            cell([p("Khách sạn", { size: 18 })],                                     { width: TYPE_W }),
            cell([p(d.khachSan.bang_gia_ten, { size: 18 })],                         { width: SVC_W }),
            cell([p(d.khachSan.gia ? fmt(d.khachSan.gia) : "—", { size: 18, align: AlignmentType.RIGHT })], { width: PRICE_COL }),
          ],
        })
      );
    }
  }

  const programTable = new Table({
    width: { size: CONTENT_W, type: WidthType.DXA },
    rows: programRows,
  });

  // ── Assemble ──────────────────────────────────────────────────────────────
  return new Document({
    sections: [
      {
        properties: {
          page: {
            size:   { width: PAGE_W, height: PAGE_H },
            margin: { top: MARGIN, bottom: MARGIN, left: MARGIN, right: MARGIN },
          },
        },
        children: [
          headerTable,
          titlePara,
          subTitlePara,
          spacer(),
          priceTable,
          spacer(),
          sectionLabel("CHI TIẾT CHƯƠNG TRÌNH"),
          programTable,
        ],
      },
    ],
  });
}

// ── Auto format (AI-generated quotation — existing logic) ─────────────────────
function buildAutoDoc(
  ketQua: BaoGiaKetQua,
  exchangeRate: number,
  profitUsd: number,
  tiers?: TierPrice[],
): Document {
  const today = new Date().toLocaleDateString("vi-VN");
  const { case_16, case_20 } = ketQua;
  const HALF = Math.floor(CONTENT_W / 2);

  // Giá / pax cho từng phương án + TB 2 phương án (khớp với DETAIL panel).
  // case_X.total_cost đã include phu_thu (qua liveKetQua → calcBaoGia với
  // tienPhuThu lump-sum vào transport).
  const profit16 = Math.round(profitUsd * 16 * exchangeRate);
  const profit20 = Math.round(profitUsd * 20 * exchangeRate);
  const giaBan16 = (case_16?.total_cost ?? 0) + profit16;
  const giaBan20 = (case_20?.total_cost ?? 0) + profit20;
  const giaBan16PerPax = Math.round(giaBan16 / 16);
  const giaBan20PerPax = Math.round(giaBan20 / 20);
  const giaBanTbPerPax = Math.round((giaBan16PerPax + giaBan20PerPax) / 2);
  const giaBanTbPerPaxUsd = exchangeRate > 0 ? giaBanTbPerPax / exchangeRate : 0;

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

  const titlePara = new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 200, after: 100 },
    children: [new TextRun({ noProof: true, text: "BẢNG BÁO GIÁ TOUR", bold: true, size: 32, font: "Times New Roman" })],
  });

  const subTitlePara = new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 0, after: 200 },
    children: [
      new TextRun({ noProof: true, text: ketQua.ten_chuong_trinh, bold: true, size: 24, color: "185FA5", font: "Times New Roman" }),
      new TextRun({ noProof: true, text: `  •  ${ketQua.so_ngay} ngày`, size: 20, color: "555555", font: "Times New Roman" }),
    ],
  });

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

  const COL_LOAI = 1400;
  const COL_MOTA = CONTENT_W - COL_LOAI - 2000 - 2346;
  const COL_GIA  = 2000;
  const COL_GHU  = 2346;

  const serviceTable = new Table({
    width: { size: CONTENT_W, type: WidthType.DXA },
    rows: [
      new TableRow({
        tableHeader: true,
        children: [
          cell([p("Loại",          { bold: true, align: AlignmentType.CENTER })], { width: COL_LOAI, shading: HEADER_SHADING }),
          cell([p("Mô tả",         { bold: true, align: AlignmentType.CENTER })], { width: COL_MOTA, shading: HEADER_SHADING }),
          cell([p("Đơn giá (VND)", { bold: true, align: AlignmentType.CENTER })], { width: COL_GIA,  shading: HEADER_SHADING }),
          cell([p("Ghi chú",       { bold: true, align: AlignmentType.CENTER })], { width: COL_GHU,  shading: HEADER_SHADING }),
        ],
      }),
      ...ketQua.items.map((item: BaoGiaItem) =>
        new TableRow({
          children: [
            cell([p(LOAI_LABEL[item.loai] ?? item.loai)],                               { width: COL_LOAI }),
            cell([p(item.mo_ta)],                                                        { width: COL_MOTA }),
            cell([p(fmt(item.don_gia), { align: AlignmentType.RIGHT })],                 { width: COL_GIA  }),
            cell([p(item.ghi_chu, { color: "555555", size: 18 })],                      { width: COL_GHU  }),
          ],
        })
      ),
    ],
  });

  const COL_CP = Math.floor(CONTENT_W / 3);
  const fixedCostTable = new Table({
    width: { size: CONTENT_W, type: WidthType.DXA },
    rows: [
      new TableRow({
        tableHeader: true,
        children: [
          cell([p("Khoản mục", { bold: true, align: AlignmentType.CENTER })], { width: COL_CP, shading: HEADER_SHADING }),
          cell([p("16 khách",  { bold: true, align: AlignmentType.CENTER })], { width: COL_CP, shading: HEADER_SHADING }),
          cell([p("20 khách",  { bold: true, align: AlignmentType.CENTER })], { width: CONTENT_W - COL_CP * 2, shading: HEADER_SHADING }),
        ],
      }),
      ...[
        { label: "Bảo hiểm (100k × pax)",             v16: case_16.insurance, v20: case_20.insurance },
        { label: `HDV (200k × ${ketQua.so_ngay} ngày)`, v16: case_16.guide,    v20: case_20.guide    },
        { label: "Tips",                               v16: case_16.tips,      v20: case_20.tips      },
      ].map(({ label, v16, v20 }) =>
        new TableRow({
          children: [
            cell([p(label)],                                              { width: COL_CP }),
            cell([p(fmt(v16), { align: AlignmentType.RIGHT })],          { width: COL_CP }),
            cell([p(fmt(v20), { align: AlignmentType.RIGHT })],          { width: CONTENT_W - COL_CP * 2 }),
          ],
        })
      ),
    ],
  });

  const compareTable = new Table({
    width: { size: CONTENT_W, type: WidthType.DXA },
    rows: [
      new TableRow({
        tableHeader: true,
        children: [
          cell([p("Chỉ số", { bold: true })], { width: COL_CP, shading: HEADER_SHADING }),
          cell([p("16 khách (pax=17, phòng=9)",  { bold: true, align: AlignmentType.CENTER })], { width: COL_CP, shading: HEADER_SHADING }),
          cell([p("20 khách (pax=21, phòng=11)", { bold: true, align: AlignmentType.CENTER })], { width: CONTENT_W - COL_CP * 2, shading: HEADER_SHADING }),
        ],
      }),
      ...[
        { label: "Tổng khách sạn",   v16: case_16.hotel,      v20: case_20.hotel      },
        { label: "Tổng ăn uống",     v16: case_16.meal,       v20: case_20.meal       },
        { label: "Tổng vé tham quan",v16: case_16.ticket,     v20: case_20.ticket     },
        { label: "Xe",               v16: case_16.transport,  v20: case_20.transport  },
        { label: "Tổng chi phí",     v16: case_16.total_cost, v20: case_20.total_cost },
        { label: "Lợi nhuận (VND)",  v16: case_16.profit_vnd, v20: case_20.profit_vnd },
      ].map(({ label, v16, v20 }) =>
        new TableRow({
          children: [
            cell([p(label)],                                          { width: COL_CP }),
            cell([p(fmt(v16), { align: AlignmentType.RIGHT })],      { width: COL_CP }),
            cell([p(fmt(v20), { align: AlignmentType.RIGHT })],      { width: CONTENT_W - COL_CP * 2 }),
          ],
        })
      ),
      new TableRow({
        children: [
          cell([p("Giá/khách (VND)", { bold: true, color: "FFFFFF" })], { width: COL_CP, shading: BLUE_SHADING }),
          cell([p(fmt(case_16.final_price_vnd), { bold: true, align: AlignmentType.RIGHT, color: "FFFFFF" })], { width: COL_CP, shading: BLUE_SHADING }),
          cell([p(fmt(case_20.final_price_vnd), { bold: true, align: AlignmentType.RIGHT, color: "FFFFFF" })], { width: CONTENT_W - COL_CP * 2, shading: BLUE_SHADING }),
        ],
      }),
      new TableRow({
        children: [
          cell([p("Giá/khách (USD)", { bold: true, color: "FFFFFF" })], { width: COL_CP, shading: BLUE_SHADING }),
          cell([p(fmtUsd(case_16.final_price_usd), { bold: true, align: AlignmentType.RIGHT, color: "FFFFFF" })], { width: COL_CP, shading: BLUE_SHADING }),
          cell([p(fmtUsd(case_20.final_price_usd), { bold: true, align: AlignmentType.RIGHT, color: "FFFFFF" })], { width: CONTENT_W - COL_CP * 2, shading: BLUE_SHADING }),
        ],
      }),
    ],
  });

  const conclusionTable = new Table({
    width: { size: CONTENT_W, type: WidthType.DXA },
    rows: [
      new TableRow({
        children: [
          cell(
            [
              p("GIÁ BÁN TOUR (TRUNG BÌNH 2 PHƯƠNG ÁN)", { bold: true, size: 18, color: "FFFFFF", align: AlignmentType.CENTER }),
              p(`${fmt(giaBanTbPerPax)} VND / khách`, { bold: true, size: 32, color: "FFFFFF", align: AlignmentType.CENTER }),
              p(`≈ ${fmtUsd(giaBanTbPerPaxUsd)} USD / khách`, { size: 20, color: "CCDDFF", align: AlignmentType.CENTER }),
              p(`16 khách: ${fmt(giaBan16PerPax)} VND / pax  ·  20 khách: ${fmt(giaBan20PerPax)} VND / pax`, { size: 16, color: "CCDDFF", align: AlignmentType.CENTER }),
            ],
            { width: CONTENT_W, shading: RESULT_SHADING, margins: { top: 200, bottom: 200, left: 200, right: 200 } }
          ),
        ],
      }),
    ],
  });

  // Bảng giá theo số khách (ma trận thật) — 1 cột/bậc, giá bán/khách VND + USD.
  const buildTierTable = (ts: TierPrice[]): Table => {
    const LABEL_W = 2600;
    const baseW = Math.floor((CONTENT_W - LABEL_W) / ts.length);
    const colW = ts.map((_, i) => (i === ts.length - 1 ? CONTENT_W - LABEL_W - baseW * (ts.length - 1) : baseW));
    return new Table({
      width: { size: CONTENT_W, type: WidthType.DXA },
      rows: [
        new TableRow({
          tableHeader: true,
          children: [
            cell([p("Số khách", { bold: true })], { width: LABEL_W, shading: HEADER_SHADING }),
            ...ts.map((t, i) =>
              cell([p(`${t.guests} khách`, { bold: true, align: AlignmentType.CENTER })], { width: colW[i], shading: HEADER_SHADING }),
            ),
          ],
        }),
        new TableRow({
          children: [
            cell([p("Giá / khách (VND)", { bold: true, color: "FFFFFF" })], { width: LABEL_W, shading: BLUE_SHADING }),
            ...ts.map((t, i) =>
              cell([p(fmt(t.gia_ban_vnd), { bold: true, align: AlignmentType.CENTER, color: "FFFFFF", size: 24 })], { width: colW[i], shading: BLUE_SHADING }),
            ),
          ],
        }),
        new TableRow({
          children: [
            cell([p("Giá / khách (USD)", { bold: true })], { width: LABEL_W, shading: HEADER_SHADING }),
            ...ts.map((t, i) =>
              cell([p(`≈ ${fmtUsd(t.gia_ban_usd)}`, { align: AlignmentType.CENTER })], { width: colW[i] }),
            ),
          ],
        }),
      ],
    });
  };

  // Có tiers → hiện BẢNG GIÁ THEO SỐ KHÁCH (thay so-sánh-2-phương-án + kết luận).
  const priceSection =
    tiers && tiers.length > 0
      ? [sectionLabel("III. BẢNG GIÁ THEO SỐ KHÁCH"), buildTierTable(tiers)]
      : [sectionLabel("III. SO SÁNH 2 PHƯƠNG ÁN (16 VÀ 20 KHÁCH)"), compareTable, spacer(), conclusionTable];

  return new Document({
    sections: [
      {
        properties: {
          page: {
            size:   { width: PAGE_W, height: PAGE_H },
            margin: { top: MARGIN, bottom: MARGIN, left: MARGIN, right: MARGIN },
          },
        },
        children: [
          headerTable,
          titlePara,
          subTitlePara,
          paramsTable,
          spacer(),
          sectionLabel("I. CHI TIẾT DỊCH VỤ"),
          serviceTable,
          spacer(),
          sectionLabel("II. CHI PHÍ CỐ ĐỊNH"),
          fixedCostTable,
          spacer(),
          ...priceSection,
        ],
      },
    ],
  });
}
