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
import type { DayLocal, CanhDiemItem, NhaHangItem, KhachSanItem } from "@/hooks/use-dieu-tour";

// ─── Constants ─────────────────────────────────────────────────────────────
const BORDER     = { style: BorderStyle.SINGLE, size: 1, color: "000000" };
const BORDERS    = { top: BORDER, bottom: BORDER, left: BORDER, right: BORDER };
const NO_BORDER  = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };
const NO_BORDERS = { top: NO_BORDER, bottom: NO_BORDER, left: NO_BORDER, right: NO_BORDER };
const HEADER_SHADING = { fill: "D9D9D9", type: ShadingType.CLEAR, color: "auto" };
const NO_SHADING     = { fill: "FFFFFF", type: ShadingType.CLEAR, color: "auto" };

// A4 Portrait — lề nhỏ để vừa 1 trang
const PAGE_W    = 11906;       // 210mm
const PAGE_H    = 16838;       // 297mm
const MARGIN    = 400;         // ~7mm per side
const CONTENT_W = PAGE_W - MARGIN * 2; // 11106 DXA

// Info table: chia đôi trang, mỗi nửa có label + value
const LW    = 1300;                       // label width
const HALF  = Math.floor(CONTENT_W / 2); // 5553
const VW    = HALF - LW;                 // value width = 4253
const VW_R  = CONTENT_W - HALF - LW;    // right value = 4253

// Schedule table col widths (tổng = CONTENT_W = 11106)
const SCHED_COL = [580, 3300, 2250, 2250, 2726];

// Font size (half-points): 18 = 9pt, 20 = 10pt, 22 = 11pt
const FS      = 18; // body
const FS_SM   = 16; // small detail
const FS_H    = 18; // header cell

// ─── Helpers ────────────────────────────────────────────────────────────────
const CELL_MARGINS = { top: 40, bottom: 40, left: 80, right: 80 };
const CELL_MARGINS_LG = { top: 80, bottom: 80, left: 100, right: 100 };

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
    verticalAlign: (opts.vertAlign ?? VerticalAlign.TOP) as any,
    columnSpan: opts.colSpan,
    margins: opts.margins ?? CELL_MARGINS,
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
    spacing?: { before?: number; after?: number };
  } = {}
): Paragraph {
  return new Paragraph({
    alignment: opts.align ?? AlignmentType.LEFT,
    spacing: opts.spacing,
    children: [
      new TextRun({
        text,
        bold: opts.bold,
        size: opts.size ?? FS,
        color: opts.color ?? "000000",
        italics: opts.italics,
        font: "Times New Roman",
      }),
    ],
  });
}

/** Paragraph với nhiều TextRun inline */
function pRuns(
  runs: { text: string; bold?: boolean; color?: string; size?: number; italics?: boolean }[],
  align?: (typeof AlignmentType)[keyof typeof AlignmentType]
): Paragraph {
  return new Paragraph({
    alignment: align ?? AlignmentType.LEFT,
    children: runs.map(
      (r) =>
        new TextRun({
          text: r.text,
          bold: r.bold,
          color: r.color ?? "000000",
          size: r.size ?? FS,
          italics: r.italics,
          font: "Times New Roman",
        })
    ),
  });
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "—";
  const d = new Date(dateStr + "T00:00:00");
  const WEEKDAYS = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];
  return `${d.toLocaleDateString("vi-VN")} (${WEEKDAYS[d.getDay()]})`;
}

function formatDateShort(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return `${d.getDate()}/${d.getMonth() + 1}`;
}

function xeLabel(xe: any): string {
  if (!xe) return "—";
  const nhaXe = xe.nha_xe?.ten ?? "";
  const socho = xe.so_cho ? `${xe.so_cho} chỗ` : "";
  const parts = [nhaXe, xe.ten_xe, socho].filter(Boolean);
  return parts.join(" · ") || "—";
}

// ─── Data interfaces ─────────────────────────────────────────────────────────
export interface DieuTourExportData {
  days: DayLocal[];
  canhDiemList: CanhDiemItem[];
  nhaHangList: NhaHangItem[];
  khachSanList: KhachSanItem[];
  tenDoan: string;
  hdv: string;
  xe: any;
  ngayDi: string | null;
  ngayVe: string | null;
  bangDon: string;
  shopping: boolean | null;
  truongDoan: string;
  chuyenBayDon: string;
  chuyenBayTien: string;
  soKhachLon: number;
  soKhachEm1: number;
  soKhachEm2: number;
  soKhachTl: number;
  totalKhach: number;
  chuThichKhach: string;
  gifts: string[];
  ghiChuDieuTour: string;
}

export interface DayExportCell {
  ngay_date: string;
  thu: string;
  chuongTrinh: string;
  anTrua: string;
  anToi: string;
  khachSan: string;
}

export function computeExportCells(data: DieuTourExportData): DayExportCell[] {
  const { days, canhDiemList, nhaHangList, khachSanList } = data;
  const canhDiemMap = new Map(canhDiemList.map((c) => [c.id, c]));
  const nhaHangMap  = new Map(nhaHangList.map((n) => [n.id, n]));
  const khachSanMap = new Map(khachSanList.map((k) => [k.id, k]));

  return days.map((day) => {
    const ctLines: string[] = [];
    if (day.thanh_pho) ctLines.push(day.thanh_pho);
    for (const item of day.items) {
      const cd = canhDiemMap.get(item.canh_diem_id);
      if (cd) {
        ctLines.push(`• ${cd.ten}`);
        if (item.ghi_chu) ctLines.push(`  ${item.ghi_chu}`);
      }
    }

    const truaLines: string[] = [];
    if (day.an_trua_nha_hang_id) {
      const nh = nhaHangMap.get(day.an_trua_nha_hang_id);
      if (nh) { truaLines.push(nh.ten); if (nh.dia_chi) truaLines.push(nh.dia_chi); }
    }

    const toiLines: string[] = [];
    if (day.an_toi_nha_hang_id) {
      const nh = nhaHangMap.get(day.an_toi_nha_hang_id);
      if (nh) { toiLines.push(nh.ten); if (nh.dia_chi) toiLines.push(nh.dia_chi); }
    }

    const ksLines: string[] = [];
    if (day.khach_san_id) {
      const ks = khachSanMap.get(day.khach_san_id);
      if (ks) { ksLines.push(ks.ten); if (ks.dia_chi) ksLines.push(ks.dia_chi); }
    }
    if (day.ks_loai_phong) ksLines.push(day.ks_loai_phong);
    if (day.ks_ma_code)    ksLines.push(`Code: ${day.ks_ma_code}`);

    return {
      ngay_date: day.ngay_date,
      thu: day.thu,
      chuongTrinh: ctLines.join("\n"),
      anTrua: truaLines.join("\n"),
      anToi: toiLines.join("\n"),
      khachSan: ksLines.join("\n"),
    };
  });
}

// ─── Main export ─────────────────────────────────────────────────────────────
export async function exportDieuTourWord(data: DieuTourExportData) {
  const {
    days, canhDiemList, nhaHangList, khachSanList,
    tenDoan, hdv, xe, ngayDi, ngayVe,
    bangDon, shopping, truongDoan, chuyenBayDon, chuyenBayTien,
    soKhachLon, soKhachEm1, soKhachEm2, soKhachTl, totalKhach,
    chuThichKhach, gifts, ghiChuDieuTour,
  } = data;

  const canhDiemMap = new Map(canhDiemList.map((c) => [c.id, c]));
  const nhaHangMap  = new Map(nhaHangList.map((n) => [n.id, n]));
  const khachSanMap = new Map(khachSanList.map((k) => [k.id, k]));
  const today = new Date().toLocaleDateString("vi-VN");
  const shopStr = shopping === true ? "YES" : shopping === false ? "NO" : "—";

  // ── 1. Header: Company + Quốc hiệu ─────────────────────────────────────
  const headerTable = new Table({
    width: { size: CONTENT_W, type: WidthType.DXA },
    rows: [
      new TableRow({
        children: [
          cell(
            [
              p("CÔNG TY TNHH DU LỊCH S8",   { bold: true, size: 20, align: AlignmentType.CENTER }),
              p("S8 TRAVEL COMPANY",           { size: FS_SM, color: "555555", align: AlignmentType.CENTER }),
              p("MST: 0402021137",             { size: FS_SM, color: "555555", align: AlignmentType.CENTER }),
            ],
            { width: HALF, vertAlign: VerticalAlign.CENTER, margins: CELL_MARGINS_LG }
          ),
          cell(
            [
              p("CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM", { bold: true, size: 20, align: AlignmentType.CENTER }),
              p("Độc lập – Tự do – Hạnh phúc",          { bold: true, size: FS, align: AlignmentType.CENTER }),
              p("———————————————",                        { size: FS_SM, color: "888888", align: AlignmentType.CENTER }),
              p(`Hà Nội, ngày ${today}`,                 { size: FS_SM, italics: true, color: "555555", align: AlignmentType.CENTER }),
            ],
            { width: CONTENT_W - HALF, vertAlign: VerticalAlign.CENTER, margins: CELL_MARGINS_LG }
          ),
        ],
      }),
    ],
  });

  // ── 2. Title ─────────────────────────────────────────────────────────────
  const titlePara = new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 120, after: 120 },
    children: [
      new TextRun({ text: "BẢNG ĐIỀU TOUR", bold: true, size: 28, font: "Times New Roman" }),
    ],
  });

  // ── 3. Info table — layout khớp với UI ──────────────────────────────────
  //
  // Cột trái: Code đoàn, HDV, Xe, Ngày đón+CB, Ngày tiễn+CB
  // Cột phải: Bảng đón, Shopping, T/L, Số khách compact, Chú thích
  //
  // Cấu trúc 4 cột: [label-L | value-L | label-R | value-R]
  // Rows 4-5 (date+flight): colSpan=2 cho nửa trái

  const soKhachRow = pRuns([
    { text: "NL: ", bold: true },
    { text: String(soKhachLon) + "   " },
    { text: "TE 6-10: ", bold: true },
    { text: String(soKhachEm1) + "   " },
    { text: "TE <6: ", bold: true },
    { text: String(soKhachEm2) + "   " },
    { text: "T/L: ", bold: true },
    { text: String(soKhachTl) + "   " },
    { text: "Tổng: ", bold: true },
    { text: String(totalKhach), bold: true, color: "185FA5" },
  ]);

  const infoRows: TableRow[] = [
    // Row 1: Code đoàn | Bảng đón
    new TableRow({ children: [
      cell([p("Code đoàn:", { bold: true })], { width: LW, shading: HEADER_SHADING }),
      cell([p(tenDoan, { bold: true, color: "185FA5" })], { width: VW }),
      cell([p("Bảng đón:", { bold: true })], { width: LW, shading: HEADER_SHADING }),
      cell([p(bangDon || "—")], { width: VW_R }),
    ]}),
    // Row 2: HDV | Shopping
    new TableRow({ children: [
      cell([p("HDV:", { bold: true })], { width: LW, shading: HEADER_SHADING }),
      cell([p(hdv || "—")], { width: VW }),
      cell([p("Shopping:", { bold: true })], { width: LW, shading: HEADER_SHADING }),
      cell([p(shopStr)], { width: VW_R }),
    ]}),
    // Row 3: Xe | T/L
    new TableRow({ children: [
      cell([p("Xe:", { bold: true })], { width: LW, shading: HEADER_SHADING }),
      cell([p(xeLabel(xe))], { width: VW }),
      cell([p("T/L:", { bold: true })], { width: LW, shading: HEADER_SHADING }),
      cell([p(truongDoan || "—")], { width: VW_R }),
    ]}),
    // Row 4: Ngày đón + CB đón (colSpan=2) | Số khách compact
    new TableRow({ children: [
      cell(
        [pRuns([
          { text: "Ngày đón: ", bold: true },
          { text: formatDate(ngayDi) },
          { text: chuyenBayDon ? `   ${chuyenBayDon}` : "", color: "444444" },
        ])],
        { width: HALF, colSpan: 2, shading: HEADER_SHADING }
      ),
      cell([p("Số khách:", { bold: true })], { width: LW, shading: HEADER_SHADING }),
      cell([soKhachRow], { width: VW_R }),
    ]}),
    // Row 5: Ngày tiễn + CB tiễn (colSpan=2) | Chú thích
    new TableRow({ children: [
      cell(
        [pRuns([
          { text: "Ngày tiễn: ", bold: true },
          { text: formatDate(ngayVe) },
          { text: chuyenBayTien ? `   ${chuyenBayTien}` : "", color: "444444" },
        ])],
        { width: HALF, colSpan: 2, shading: HEADER_SHADING }
      ),
      cell([p("Chú thích:", { bold: true })], { width: LW, shading: HEADER_SHADING }),
      cell([p(chuThichKhach || "—")], { width: VW_R }),
    ]}),
  ];

  // Row quà tặng (nếu có)
  if (gifts.length > 0) {
    infoRows.push(
      new TableRow({ children: [
        cell([p("Quà tặng:", { bold: true })], { width: LW, shading: HEADER_SHADING }),
        cell([p(gifts.join(", "))], { width: VW + LW + VW_R, colSpan: 3 }),
      ]})
    );
  }

  const infoTable = new Table({
    width: { size: CONTENT_W, type: WidthType.DXA },
    rows: infoRows,
  });

  // ── 4. Schedule table ─────────────────────────────────────────────────────
  const schedHeaderRow = new TableRow({
    tableHeader: true,
    children: [
      cell([p("Ngày",      { bold: true, align: AlignmentType.CENTER, size: FS_H })], { width: SCHED_COL[0], shading: HEADER_SHADING, vertAlign: VerticalAlign.CENTER }),
      cell([p("Chương trình", { bold: true, align: AlignmentType.CENTER, size: FS_H })], { width: SCHED_COL[1], shading: HEADER_SHADING, vertAlign: VerticalAlign.CENTER }),
      cell([p("Ăn trưa",  { bold: true, align: AlignmentType.CENTER, size: FS_H })], { width: SCHED_COL[2], shading: HEADER_SHADING, vertAlign: VerticalAlign.CENTER }),
      cell([p("Ăn tối",   { bold: true, align: AlignmentType.CENTER, size: FS_H })], { width: SCHED_COL[3], shading: HEADER_SHADING, vertAlign: VerticalAlign.CENTER }),
      cell([p("Khách sạn",{ bold: true, align: AlignmentType.CENTER, size: FS_H })], { width: SCHED_COL[4], shading: HEADER_SHADING, vertAlign: VerticalAlign.CENTER }),
    ],
  });

  const schedDataRows = days.map((day) => {
    // Ngày
    const ngayParas = [
      p(formatDateShort(day.ngay_date), { bold: true, align: AlignmentType.CENTER }),
      p(day.thu, { align: AlignmentType.CENTER, color: "555555", size: FS_SM }),
    ];

    // Chương trình
    const ctParas: Paragraph[] = [];
    if (day.thanh_pho) ctParas.push(p(day.thanh_pho, { bold: true }));
    for (const item of day.items) {
      const cd = canhDiemMap.get(item.canh_diem_id);
      if (cd) {
        ctParas.push(p(`• ${cd.ten}`));
        if (item.ghi_chu) ctParas.push(p(`  ${item.ghi_chu}`, { color: "666666", size: FS_SM }));
      }
    }
    if (ctParas.length === 0) ctParas.push(p(""));

    // Ăn trưa
    const truaParas: Paragraph[] = [];
    if (day.an_trua_nha_hang_id) {
      const nh = nhaHangMap.get(day.an_trua_nha_hang_id);
      if (nh) {
        truaParas.push(p(nh.ten, { bold: true }));
        if (nh.dia_chi) truaParas.push(p(nh.dia_chi, { color: "666666", size: FS_SM }));
      }
    }
    if (truaParas.length === 0) truaParas.push(p(""));

    // Ăn tối
    const toiParas: Paragraph[] = [];
    if (day.an_toi_nha_hang_id) {
      const nh = nhaHangMap.get(day.an_toi_nha_hang_id);
      if (nh) {
        toiParas.push(p(nh.ten, { bold: true }));
        if (nh.dia_chi) toiParas.push(p(nh.dia_chi, { color: "666666", size: FS_SM }));
      }
    }
    if (toiParas.length === 0) toiParas.push(p(""));

    // Khách sạn
    const ksParas: Paragraph[] = [];
    if (day.khach_san_id) {
      const ks = khachSanMap.get(day.khach_san_id);
      if (ks) {
        ksParas.push(p(ks.ten, { bold: true }));
        if (ks.dia_chi) ksParas.push(p(ks.dia_chi, { color: "666666", size: FS_SM }));
      }
    }
    if (day.ks_loai_phong) ksParas.push(p(day.ks_loai_phong));
    if (day.ks_ma_code)    ksParas.push(p(`Code: ${day.ks_ma_code}`, { color: "555555", size: FS_SM }));
    if (ksParas.length === 0) ksParas.push(p(""));

    return new TableRow({
      children: [
        cell(ngayParas,  { width: SCHED_COL[0], vertAlign: VerticalAlign.CENTER }),
        cell(ctParas,    { width: SCHED_COL[1] }),
        cell(truaParas,  { width: SCHED_COL[2] }),
        cell(toiParas,   { width: SCHED_COL[3] }),
        cell(ksParas,    { width: SCHED_COL[4] }),
      ],
    });
  });

  const schedTable = new Table({
    width: { size: CONTENT_W, type: WidthType.DXA },
    rows: [schedHeaderRow, ...schedDataRows],
  });

  // ── 5. Ghi chú ───────────────────────────────────────────────────────────
  const ghiChuParas: Paragraph[] = [];
  if (ghiChuDieuTour) {
    ghiChuParas.push(
      new Paragraph({
        spacing: { before: 120, after: 40 },
        children: [new TextRun({ text: "Ghi chú: ", bold: true, size: FS, font: "Times New Roman" })],
      })
    );
    for (const line of ghiChuDieuTour.split("\n")) {
      ghiChuParas.push(
        new Paragraph({
          spacing: { before: 0, after: 0 },
          children: [new TextRun({ text: line, size: FS, font: "Times New Roman" })],
        })
      );
    }
  }

  const spacer = new Paragraph({ spacing: { before: 100, after: 0 }, children: [] });

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
          infoTable,
          spacer,
          schedTable,
          ...ghiChuParas,
        ],
      },
    ],
  });

  const blob = await Packer.toBlob(doc);
  saveAs(blob, `${tenDoan}_bảng_điều_tour.docx`);
}

/** Xuất Word từ text cells đã được edit trong preview modal */
export async function exportDieuTourWordFromCells(
  data: DieuTourExportData,
  cells: DayExportCell[],
  editedGhiChu: string,
) {
  const {
    tenDoan, hdv, xe, ngayDi, ngayVe,
    bangDon, shopping, truongDoan, chuyenBayDon, chuyenBayTien,
    soKhachLon, soKhachEm1, soKhachEm2, soKhachTl, totalKhach,
    chuThichKhach, gifts,
  } = data;

  const today = new Date().toLocaleDateString("vi-VN");
  const shopStr = shopping === true ? "YES" : shopping === false ? "NO" : "—";

  // ── Header (same as main export) ─────────────────────────────────────────
  const headerTable = new Table({
    width: { size: CONTENT_W, type: WidthType.DXA },
    rows: [
      new TableRow({
        children: [
          cell(
            [
              p("CÔNG TY TNHH DU LỊCH S8",   { bold: true, size: 20, align: AlignmentType.CENTER }),
              p("S8 TRAVEL COMPANY",           { size: FS_SM, color: "555555", align: AlignmentType.CENTER }),
              p("MST: 0402021137",             { size: FS_SM, color: "555555", align: AlignmentType.CENTER }),
            ],
            { width: HALF, vertAlign: VerticalAlign.CENTER, margins: CELL_MARGINS_LG }
          ),
          cell(
            [
              p("CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM", { bold: true, size: 20, align: AlignmentType.CENTER }),
              p("Độc lập – Tự do – Hạnh phúc",          { bold: true, size: FS, align: AlignmentType.CENTER }),
              p("———————————————",                        { size: FS_SM, color: "888888", align: AlignmentType.CENTER }),
              p(`Hà Nội, ngày ${today}`,                 { size: FS_SM, italics: true, color: "555555", align: AlignmentType.CENTER }),
            ],
            { width: CONTENT_W - HALF, vertAlign: VerticalAlign.CENTER, margins: CELL_MARGINS_LG }
          ),
        ],
      }),
    ],
  });

  const titlePara = new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 120, after: 120 },
    children: [new TextRun({ text: "BẢNG ĐIỀU TOUR", bold: true, size: 28, font: "Times New Roman" })],
  });

  const soKhachRow = pRuns([
    { text: "NL: ", bold: true }, { text: String(soKhachLon) + "   " },
    { text: "TE 6-10: ", bold: true }, { text: String(soKhachEm1) + "   " },
    { text: "TE <6: ", bold: true }, { text: String(soKhachEm2) + "   " },
    { text: "T/L: ", bold: true }, { text: String(soKhachTl) + "   " },
    { text: "Tổng: ", bold: true }, { text: String(totalKhach), bold: true, color: "185FA5" },
  ]);

  const infoRows: TableRow[] = [
    new TableRow({ children: [
      cell([p("Code đoàn:", { bold: true })], { width: LW, shading: HEADER_SHADING }),
      cell([p(tenDoan, { bold: true, color: "185FA5" })], { width: VW }),
      cell([p("Bảng đón:", { bold: true })], { width: LW, shading: HEADER_SHADING }),
      cell([p(bangDon || "—")], { width: VW_R }),
    ]}),
    new TableRow({ children: [
      cell([p("HDV:", { bold: true })], { width: LW, shading: HEADER_SHADING }),
      cell([p(hdv || "—")], { width: VW }),
      cell([p("Shopping:", { bold: true })], { width: LW, shading: HEADER_SHADING }),
      cell([p(shopStr)], { width: VW_R }),
    ]}),
    new TableRow({ children: [
      cell([p("Xe:", { bold: true })], { width: LW, shading: HEADER_SHADING }),
      cell([p(xeLabel(xe))], { width: VW }),
      cell([p("T/L:", { bold: true })], { width: LW, shading: HEADER_SHADING }),
      cell([p(truongDoan || "—")], { width: VW_R }),
    ]}),
    new TableRow({ children: [
      cell(
        [pRuns([{ text: "Ngày đón: ", bold: true }, { text: formatDate(ngayDi) }, { text: chuyenBayDon ? `   ${chuyenBayDon}` : "", color: "444444" }])],
        { width: HALF, colSpan: 2, shading: HEADER_SHADING }
      ),
      cell([p("Số khách:", { bold: true })], { width: LW, shading: HEADER_SHADING }),
      cell([soKhachRow], { width: VW_R }),
    ]}),
    new TableRow({ children: [
      cell(
        [pRuns([{ text: "Ngày tiễn: ", bold: true }, { text: formatDate(ngayVe) }, { text: chuyenBayTien ? `   ${chuyenBayTien}` : "", color: "444444" }])],
        { width: HALF, colSpan: 2, shading: HEADER_SHADING }
      ),
      cell([p("Chú thích:", { bold: true })], { width: LW, shading: HEADER_SHADING }),
      cell([p(chuThichKhach || "—")], { width: VW_R }),
    ]}),
  ];
  if (gifts.length > 0) {
    infoRows.push(new TableRow({ children: [
      cell([p("Quà tặng:", { bold: true })], { width: LW, shading: HEADER_SHADING }),
      cell([p(gifts.join(", "))], { width: VW + LW + VW_R, colSpan: 3 }),
    ]}));
  }
  const infoTable = new Table({ width: { size: CONTENT_W, type: WidthType.DXA }, rows: infoRows });

  // ── Schedule from pre-computed cells ────────────────────────────────────
  const schedHeaderRow = new TableRow({
    tableHeader: true,
    children: [
      cell([p("Ngày",       { bold: true, align: AlignmentType.CENTER, size: FS_H })], { width: SCHED_COL[0], shading: HEADER_SHADING, vertAlign: VerticalAlign.CENTER }),
      cell([p("Chương trình",{ bold: true, align: AlignmentType.CENTER, size: FS_H })], { width: SCHED_COL[1], shading: HEADER_SHADING, vertAlign: VerticalAlign.CENTER }),
      cell([p("Ăn trưa",   { bold: true, align: AlignmentType.CENTER, size: FS_H })], { width: SCHED_COL[2], shading: HEADER_SHADING, vertAlign: VerticalAlign.CENTER }),
      cell([p("Ăn tối",    { bold: true, align: AlignmentType.CENTER, size: FS_H })], { width: SCHED_COL[3], shading: HEADER_SHADING, vertAlign: VerticalAlign.CENTER }),
      cell([p("Khách sạn", { bold: true, align: AlignmentType.CENTER, size: FS_H })], { width: SCHED_COL[4], shading: HEADER_SHADING, vertAlign: VerticalAlign.CENTER }),
    ],
  });

  function textToParas(text: string): Paragraph[] {
    const lines = text.split("\n");
    if (lines.length === 0 || (lines.length === 1 && !lines[0])) return [p("")];
    return lines.map((line) => p(line));
  }

  const schedDataRows = cells.map((dc) => new TableRow({
    children: [
      cell(
        [p(formatDateShort(dc.ngay_date), { bold: true, align: AlignmentType.CENTER }),
         p(dc.thu, { align: AlignmentType.CENTER, color: "555555", size: FS_SM })],
        { width: SCHED_COL[0], vertAlign: VerticalAlign.CENTER }
      ),
      cell(textToParas(dc.chuongTrinh), { width: SCHED_COL[1] }),
      cell(textToParas(dc.anTrua),      { width: SCHED_COL[2] }),
      cell(textToParas(dc.anToi),       { width: SCHED_COL[3] }),
      cell(textToParas(dc.khachSan),    { width: SCHED_COL[4] }),
    ],
  }));

  const schedTable = new Table({
    width: { size: CONTENT_W, type: WidthType.DXA },
    rows: [schedHeaderRow, ...schedDataRows],
  });

  // ── Ghi chú ────────────────────────────────────────────────────────────
  const ghiChuParas: Paragraph[] = [];
  if (editedGhiChu) {
    ghiChuParas.push(new Paragraph({
      spacing: { before: 120, after: 40 },
      children: [new TextRun({ text: "Ghi chú: ", bold: true, size: FS, font: "Times New Roman" })],
    }));
    for (const line of editedGhiChu.split("\n")) {
      ghiChuParas.push(new Paragraph({
        spacing: { before: 0, after: 0 },
        children: [new TextRun({ text: line, size: FS, font: "Times New Roman" })],
      }));
    }
  }

  const spacer = new Paragraph({ spacing: { before: 100, after: 0 }, children: [] });

  const doc = new Document({
    sections: [{
      properties: { page: { size: { width: PAGE_W, height: PAGE_H }, margin: { top: MARGIN, bottom: MARGIN, left: MARGIN, right: MARGIN } } },
      children: [headerTable, titlePara, infoTable, spacer, schedTable, ...ghiChuParas],
    }],
  });

  const blob = await Packer.toBlob(doc);
  saveAs(blob, `${tenDoan}_bảng_điều_tour.docx`);
}
