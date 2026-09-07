import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  ImageRun,
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
import type { BaoGiaKetQua, BaoGiaItem, BaoGiaExportBracket } from "@/hooks/use-bao-gia";
import { fitPageSize, type PageImage } from "@/lib/itinerary-images";
import { taiwanQuoteContent, type TaiwanQuoteContent } from "@/lib/bao-gia-taiwan-content";

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
  /** Nhãn cột tuỳ chọn (vd "10–15 khách"). Vắng → "{guests} khách". */
  label?: string;
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
const IDEO = "　"; // khoảng trắng full-width (ideographic) cho text tiếng Trung

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

const RED_SHADING = { fill: "C00000", type: ShadingType.CLEAR, color: "auto" };

// Dải cảnh báo đỏ đặt ở ĐẦU mọi bản Word có giá vốn / lợi nhuận.
// Lý do: bản nội bộ và bản gửi đối tác trước đây tên file gần như giống hệt
// (bao_gia_<tên>.docx vs bao_gia_<mã>_<tên>.docx) → gửi nhầm là lộ giá vốn.
// Dải này + tiền tố NOIBO_ ở tên file là 2 lớp chặn nhầm, không phải trang trí.
const internalOnlyBanner = () =>
  new Table({
    width: { size: CONTENT_W, type: WidthType.DXA },
    rows: [
      new TableRow({
        children: [
          cell(
            [
              p("TÀI LIỆU NỘI BỘ — KHÔNG GỬI ĐỐI TÁC / KHÁCH HÀNG", {
                bold: true,
                size: 26,
                color: "FFFFFF",
                align: AlignmentType.CENTER,
              }),
              p("Bản này có ĐƠN GIÁ VỐN, TỔNG CHI PHÍ và LỢI NHUẬN. Bản gửi đối tác là mẫu 報價 (tên file bao_gia_<mã>_<tên>.docx).", {
                size: 18,
                color: "FFFFFF",
                align: AlignmentType.CENTER,
              }),
            ],
            {
              width: CONTENT_W,
              shading: RED_SHADING,
              margins: { top: 140, bottom: 140, left: 140, right: 140 },
            }
          ),
        ],
      }),
    ],
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
  // Tiền tố NOIBO_: cả 2 nhánh (manual + auto) đều in đơn giá vốn, bản auto in
  // thêm tổng chi phí + lợi nhuận. Tên cũ `bao_gia_<tên>.docx` gần như không
  // phân biệt được với bản Đài Loan sạch giá vốn `bao_gia_<mã>_<tên>.docx`.
  saveAs(blob, `NOIBO_bao_gia_${safeName}.docx`);
}

// ── Giá cuối format (land tour — chỉ bảng giá theo bậc, không costing) ─────────
export async function exportBaoGiaGiaCuoiWord(
  ketQua: BaoGiaKetQua,
  exchangeRate: number,
  tiers: TierPrice[],
) {
  const doc = buildGiaCuoiDoc(ketQua, exchangeRate, tiers);
  const blob = await Packer.toBlob(doc);
  const safeName =
    ketQua.ten_chuong_trinh
      .replace(/[^a-zA-Z0-9À-ɏ一-鿿\s]/g, "")
      .trim() || "tour";
  saveAs(blob, `bao_gia_${safeName}.docx`);
}

function buildGiaCuoiDoc(
  ketQua: BaoGiaKetQua,
  exchangeRate: number,
  tiers: TierPrice[],
): Document {
  const today = new Date().toLocaleDateString("vi-VN");
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
            { width: HALF, margins: { top: 120, bottom: 120, left: 120, right: 120 } },
          ),
          cell(
            [
              p("CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM", { bold: true, size: 22, align: AlignmentType.CENTER }),
              p("Độc lập – Tự do – Hạnh phúc", { bold: true, size: 20, align: AlignmentType.CENTER }),
              p("——————————————", { size: 18, color: "888888", align: AlignmentType.CENTER }),
              p(`Hà Nội, ngày ${today}`, { size: 18, italics: true, color: "555555", align: AlignmentType.CENTER }),
            ],
            { width: CONTENT_W - HALF, margins: { top: 120, bottom: 120, left: 120, right: 120 } },
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

  // Bảng giá theo bậc số khách (giá đã chốt — nhập tay).
  const LABEL_W = 2600;
  const baseW = tiers.length ? Math.floor((CONTENT_W - LABEL_W) / tiers.length) : CONTENT_W - LABEL_W;
  const colW = tiers.map((_, i) => (i === tiers.length - 1 ? CONTENT_W - LABEL_W - baseW * (tiers.length - 1) : baseW));
  const tierTable = new Table({
    width: { size: CONTENT_W, type: WidthType.DXA },
    rows: [
      new TableRow({
        tableHeader: true,
        children: [
          cell([p("Số khách", { bold: true })], { width: LABEL_W, shading: HEADER_SHADING }),
          ...tiers.map((t, i) =>
            cell([p(t.label ?? `${t.guests} khách`, { bold: true, align: AlignmentType.CENTER })], { width: colW[i], shading: HEADER_SHADING }),
          ),
        ],
      }),
      new TableRow({
        children: [
          cell([p("Giá / khách (VND)", { bold: true, color: "FFFFFF" })], { width: LABEL_W, shading: BLUE_SHADING }),
          ...tiers.map((t, i) =>
            cell([p(fmt(t.gia_ban_vnd), { bold: true, align: AlignmentType.CENTER, color: "FFFFFF", size: 24 })], { width: colW[i], shading: BLUE_SHADING }),
          ),
        ],
      }),
      new TableRow({
        children: [
          cell([p("Giá / khách (USD)", { bold: true })], { width: LABEL_W, shading: HEADER_SHADING }),
          ...tiers.map((t, i) =>
            cell([p(`≈ ${fmtUsd(t.gia_ban_usd)}`, { align: AlignmentType.CENTER })], { width: colW[i] }),
          ),
        ],
      }),
    ],
  });

  const noteParaCt =
    tiers.length === 0
      ? [p("(Chưa nhập bảng giá)", { italics: true, color: "999999" })]
      : [
          tierTable,
          new Paragraph({ spacing: { before: 120 }, children: [] }),
          p(`Tỷ giá quy đổi: ${fmt(exchangeRate)} VND/USD. Giá áp dụng cho chương trình tour kèm theo.`, { size: 18, italics: true, color: "555555" }),
        ];

  return new Document({
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
          sectionLabel("BẢNG GIÁ THEO SỐ KHÁCH"),
          ...noteParaCt,
        ],
      },
    ],
  });
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
  const singleRoom  = exchangeRate > 0 ? Math.round(totalHotelVnd / 2 / exchangeRate) + 10 : 0;

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
          // Bản thủ công vẫn in cột "Đơn giá (VND)" từng dịch vụ → là bản nội bộ.
          internalOnlyBanner(),
          spacer(),
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

// ── Taiwan format (報價 — bảng giá kiểu Đài Loan + 報價包含/不含) ───────────────
// Nội dung (bậc giá, 單房差, 包含/不含, KS theo ngày) giải ở lib
// bao-gia-taiwan-content.ts — dùng chung với cổng đối tác để 2 bên không lệch số.

/** Xuất báo giá kiểu Đài Loan (報價) — Word. maBg = mã code duy nhất (ma_bg).
 *  行程內容: ưu tiên `programImages` (ảnh từng trang lịch trình gốc — giữ nguyên
 *  format); không có ảnh mới dùng `programText` (trích từ Word/Excel, mất layout). */
export async function exportBaoGiaTaiwanWord(
  ketQua: BaoGiaKetQua,
  items: BaoGiaItem[],
  exchangeRate: number,
  maBg: string,
  programText?: string,
  programImages?: PageImage[],
) {
  const cfg = taiwanQuoteContent(ketQua, items, exchangeRate);
  await xuatTaiwanDoc(cfg, maBg, programText, programImages);
}

/** In lại file Word của MỘT PHIÊN BẢN ĐÃ GỬI — dựng thẳng từ nội dung đã đóng
 *  băng, không tính lại gì. Nhờ vậy tải bản #1 hôm nay vẫn ra đúng con số đã chào
 *  hôm đó, kể cả khi đơn giá vốn đã đổi mấy lần. */
export async function exportBaoGiaTaiwanWordTuNoiDung(
  noiDung: TaiwanQuoteContent,
  maHienThi: string,
  programText?: string,
  programImages?: PageImage[],
) {
  await xuatTaiwanDoc(noiDung, maHienThi, programText, programImages);
}

async function xuatTaiwanDoc(
  cfg: TaiwanQuoteContent,
  maBg: string,
  programText?: string,
  programImages?: PageImage[],
) {
  const doc = buildTaiwanDoc(cfg, maBg, programText, programImages);
  const blob = await Packer.toBlob(doc);
  const safeName =
    (cfg.ten_chuong_trinh ?? "").replace(/[^a-zA-Z0-9À-ɏ一-鿿\s]/g, "").trim() || "tour";
  saveAs(blob, `bao_gia_${maBg}_${safeName}.docx`);
}

// Nhận NỘI DUNG đã giải sẵn (taiwanQuoteContent) chứ không tự tính: nhờ vậy in
// bản đang soạn và in lại một phiên bản đã đóng băng dùng chung một đường.
function buildTaiwanDoc(
  cfg: TaiwanQuoteContent,
  maBg: string,
  programText?: string,
  programImages?: PageImage[],
): Document {
  const today = new Date();
  const todayStr = `${today.getDate()}/${today.getMonth() + 1}/${today.getFullYear()}`;
  const brackets: BaoGiaExportBracket[] = cfg.brackets;
  const singleRoom = cfg.single_supplement_usd;
  const hotelDays = cfg.hotel_days;

  const nCol = brackets.length + 1; // + cột 單房差
  const LEFT_W = 4200;
  const PRICE_W = Math.floor((CONTENT_W - LEFT_W) / nCol);

  // ── Bảng giá (price box) ────────────────────────────────────────────────────
  const priceHeaderRow1 = new TableRow({
    children: [
      cell(
        [
          new Paragraph({
            children: [
              new TextRun({ noProof: true, text: "S8 Travel 報價：", bold: true, size: 22, color: "C00000", font: "Times New Roman" }),
              // Mã báo giá: chữ trắng nền trắng → ẩn với khách, vẫn select/search được để tra lại.
              new TextRun({ noProof: true, text: ` ${maBg} `, size: 22, color: "FFFFFF", font: "Times New Roman", shading: { type: ShadingType.CLEAR, fill: "FFFFFF", color: "auto" } }),
            ],
          }),
        ],
        { width: LEFT_W, margins: { top: 80, bottom: 80, left: 120, right: 120 } },
      ),
      cell(
        [p(`${todayStr}${IDEO}報價出去（報價效期：3 個月）`, { bold: true, size: 20, color: "FFFFFF", align: AlignmentType.CENTER })],
        { width: PRICE_W * nCol, colSpan: nCol, shading: BLUE_SHADING, margins: { top: 80, bottom: 80, left: 120, right: 120 } },
      ),
    ],
  });

  const priceHeaderRow2 = new TableRow({
    children: [
      cell([p("TOUR FEE (USD/pax)", { bold: true, size: 18 })], { width: LEFT_W, shading: HEADER_SHADING }),
      ...brackets.map((b) => cell([p(b.label, { bold: true, size: 18, align: AlignmentType.CENTER })], { width: PRICE_W, shading: HEADER_SHADING })),
      cell([p("單房差", { bold: true, size: 18, align: AlignmentType.CENTER })], { width: PRICE_W, shading: HEADER_SHADING }),
    ],
  });

  const priceCells = (rowSpan: number) => [
    ...brackets.map((b) => cell([p(`$${b.price_usd}`, { bold: true, align: AlignmentType.CENTER, size: 24, color: "1E3A6E" })], { width: PRICE_W, rowSpan, shading: LIGHTBLUE_SHADING, vertAlign: VerticalAlign.CENTER })),
    cell([p(`$${singleRoom}`, { bold: true, align: AlignmentType.CENTER, size: 24, color: "1E3A6E" })], { width: PRICE_W, rowSpan, shading: LIGHTBLUE_SHADING, vertAlign: VerticalAlign.CENTER }),
  ];

  const hotelRows: TableRow[] = hotelDays.length === 0
    ? [new TableRow({ children: [cell([p(cfg.ten_chuong_trinh || "—", { size: 18 })], { width: LEFT_W }), ...priceCells(1)] })]
    : hotelDays.map((d, idx) =>
        new TableRow({
          children: idx === 0
            ? [cell([p(`D${d.ngay}${IDEO}${IDEO}${d.ten}`, { size: 18 })], { width: LEFT_W, margins: { top: 60, bottom: 60, left: 100, right: 100 } }), ...priceCells(hotelDays.length)]
            : [cell([p(`D${d.ngay}${IDEO}${IDEO}${d.ten}`, { size: 18 })], { width: LEFT_W, margins: { top: 60, bottom: 60, left: 100, right: 100 } })],
        }),
      );

  const priceTable = new Table({
    width: { size: CONTENT_W, type: WidthType.DXA },
    rows: [priceHeaderRow1, priceHeaderRow2, ...hotelRows],
  });

  // ── 以上價格不含 ────────────────────────────────────────────────────────────
  const notesBlock = [
    p("以上價格不含：", { bold: true, size: 18 }),
    ...cfg.above_notes.map((l) => p(l, { size: 18 })),
  ];

  // ── 報價包含 / 報價不含 / 備註 (từ config; cảnh điểm tự nối vào 包含) ──────────
  const includedLines = cfg.included;   // đã nối sẵn cảnh điểm mất phí
  const excludedLines = cfg.excluded;
  const noteLines = cfg.notes;
  const LABEL_W2 = 1600;
  const incExcTable = new Table({
    width: { size: CONTENT_W, type: WidthType.DXA },
    rows: [
      new TableRow({
        children: [
          cell([p("報價包含", { bold: true, color: "C00000" })], { width: LABEL_W2, shading: HEADER_SHADING, vertAlign: VerticalAlign.CENTER }),
          cell(includedLines.map((l) => p(l, { size: 18 })), { width: CONTENT_W - LABEL_W2 }),
        ],
      }),
      new TableRow({
        children: [
          cell([p("報價不含", { bold: true, color: "C00000" })], { width: LABEL_W2, shading: HEADER_SHADING, vertAlign: VerticalAlign.CENTER }),
          cell(excludedLines.map((l) => p(l, { size: 18 })), { width: CONTENT_W - LABEL_W2 }),
        ],
      }),
      new TableRow({
        children: [
          cell([p("備註", { bold: true })], { width: LABEL_W2, shading: HEADER_SHADING }),
          cell(noteLines.length ? noteLines.map((l) => p(l, { size: 18 })) : [p("", { size: 18 })], { width: CONTENT_W - LABEL_W2 }),
        ],
      }),
    ],
  });

  // ── 行程內容 (file chương trình đính kèm) ──────────────────────────────────
  // Ưu tiên ẢNH TRANG (PDF/ảnh render sẵn — giữ nguyên format gốc của khách);
  // chỉ khi không có ảnh mới rơi về text trích từ Word/Excel (mất layout).
  const programBlock: Paragraph[] = [];
  const hasProgramImages = !!programImages && programImages.length > 0;
  if (hasProgramImages || (programText && programText.trim())) {
    programBlock.push(
      new Paragraph({ spacing: { before: 220 }, children: [] }),
      new Paragraph({ children: [new TextRun({ noProof: true, text: "行程內容", bold: true, size: 22, font: "Times New Roman", color: "185FA5" })] }),
    );
  }
  if (hasProgramImages) {
    // DXA → px: /20 ra pt, ×96/72 ra px. Trừ đệm nhỏ để trang ảnh không tràn
    // sang trang sau vì spacing đoạn.
    const MAX_W_PX = Math.floor((CONTENT_W / 20) * (96 / 72));
    const MAX_H_PX = Math.floor(((PAGE_H - MARGIN * 2) / 20) * (96 / 72)) - 40;
    for (const img of programImages) {
      const size = fitPageSize(img.width, img.height, MAX_W_PX, MAX_H_PX);
      programBlock.push(
        new Paragraph({
          spacing: { before: 80 },
          alignment: AlignmentType.CENTER,
          children: [
            new ImageRun({
              type: img.type,
              data: img.data,
              transformation: { width: size.width, height: size.height },
            }),
          ],
        }),
      );
    }
  } else if (programText && programText.trim()) {
    let prevEmpty = false;
    for (const raw of programText.split(/\r?\n/)) {
      const line = raw.replace(/\s+$/, "");
      const empty = line.trim() === "";
      if (empty && prevEmpty) continue; // gộp dòng trống liên tiếp
      programBlock.push(p(line, { size: 18 }));
      prevEmpty = empty;
    }
  }

  return new Document({
    sections: [
      {
        properties: {
          page: {
            size: { width: PAGE_W, height: PAGE_H },
            margin: { top: MARGIN, bottom: MARGIN, left: MARGIN, right: MARGIN },
          },
        },
        children: [
          priceTable,
          spacer(),
          ...notesBlock,
          spacer(),
          incExcTable,
          ...programBlock,
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

  // Đơn giá suy NGƯỢC từ chính con số sắp in, để cái nhãn không bao giờ nói khác
  // con số nằm ngay cạnh nó. Trước đây nhãn ghi cứng "100k" và "200k", nên file
  // Word nội bộ của mọi tour Sapa in "HDV (200k × N ngày)" bên cạnh số tính theo
  // 700k — nay còn thêm mức miền Trung và HCM thì sai càng rõ.
  const soNgayCp = Math.max(1, ketQua.so_ngay ?? 1);
  const bhMoiKhach = case_16.pax > 0 ? Math.round(case_16.insurance / case_16.pax) : 0;
  const hdvMoiNgay = Math.round(case_16.guide / soNgayCp);

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
        { label: `Bảo hiểm (${fmt(bhMoiKhach)} × pax)`,        v16: case_16.insurance, v20: case_20.insurance },
        { label: `HDV (${fmt(hdvMoiNgay)} × ${soNgayCp} ngày)`, v16: case_16.guide,     v20: case_20.guide     },
        { label: "Tips",                                        v16: case_16.tips,      v20: case_20.tips      },
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
          // Bản tự tính: có Đơn giá (VND), Tổng chi phí, Lợi nhuận (VND/USD).
          internalOnlyBanner(),
          spacer(),
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
