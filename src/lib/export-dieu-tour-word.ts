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
import type { DayLocal, CanhDiemItem, NhaHangItem, KhachSanItem } from "@/hooks/use-dieu-tour";

// ─── Constants ─────────────────────────────────────────────────────────────
const BORDER = { style: BorderStyle.SINGLE, size: 1, color: "000000" };
const BORDERS = { top: BORDER, bottom: BORDER, left: BORDER, right: BORDER };
const NO_BORDER = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };
const NO_BORDERS = { top: NO_BORDER, bottom: NO_BORDER, left: NO_BORDER, right: NO_BORDER };
const HEADER_SHADING = { fill: "D9D9D9", type: ShadingType.CLEAR, color: "auto" };
const NO_SHADING = { fill: "FFFFFF", type: ShadingType.CLEAR, color: "auto" };
const BLUE_SHADING = { fill: "185FA5", type: ShadingType.CLEAR, color: "auto" };

// A4 Landscape
const PAGE_W = 11906;
const PAGE_H = 16838;
const MARGIN = 1080; // ~19mm per side — safe for most printers
const CONTENT_W = PAGE_H - MARGIN * 2; // 14678

// Schedule table col widths: Ngày | Chương trình | Ăn trưa | Ăn tối | Khách sạn
const SCHED_COL = [900, 4100, 2900, 2900, 3878];

// ─── Helpers ────────────────────────────────────────────────────────────────
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

// ─── Info table row ─────────────────────────────────────────────────────────
function infoRow(label: string, value: string, labelW: number, valueW: number): TableRow {
  return new TableRow({
    children: [
      cell([p(label, { bold: true, size: 20 })], { width: labelW, shading: HEADER_SHADING }),
      cell([p(value, { size: 20 })], { width: valueW }),
    ],
  });
}

// ─── Main export ─────────────────────────────────────────────────────────────
export interface DieuTourExportData {
  days: DayLocal[];
  canhDiemList: CanhDiemItem[];
  nhaHangList: NhaHangItem[];
  khachSanList: KhachSanItem[];
  // Doan info
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

export async function exportDieuTourWord(data: DieuTourExportData) {
  const {
    days, canhDiemList, nhaHangList, khachSanList,
    tenDoan, hdv, xe, ngayDi, ngayVe,
    bangDon, shopping, truongDoan, chuyenBayDon, chuyenBayTien,
    soKhachLon, soKhachEm1, soKhachEm2, soKhachTl, totalKhach,
    chuThichKhach, gifts, ghiChuDieuTour,
  } = data;

  const canhDiemMap = new Map(canhDiemList.map((c) => [c.id, c]));
  const nhaHangMap = new Map(nhaHangList.map((n) => [n.id, n]));
  const khachSanMap = new Map(khachSanList.map((k) => [k.id, k]));
  const today = new Date().toLocaleDateString("vi-VN");

  // ── 1. Header: Company + Quốc hiệu ─────────────────────────────────────
  const HALF = Math.floor(CONTENT_W / 2);
  const headerTable = new Table({
    width: { size: CONTENT_W, type: WidthType.DXA },
    rows: [
      new TableRow({
        children: [
          // Left: S8 Travel
          cell(
            [
              p("CÔNG TY TNHH DU LỊCH S8", { bold: true, size: 22, align: AlignmentType.CENTER }),
              p("S8 TRAVEL COMPANY", { size: 18, color: "555555", align: AlignmentType.CENTER }),
              p("MST: 0402021137", { size: 18, color: "555555", align: AlignmentType.CENTER }),
            ],
            { width: HALF, vertAlign: VerticalAlign.CENTER, margins: { top: 120, bottom: 120, left: 120, right: 120 } }
          ),
          // Right: Quốc hiệu
          cell(
            [
              p("CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM", { bold: true, size: 22, align: AlignmentType.CENTER }),
              p("Độc lập – Tự do – Hạnh phúc", { bold: true, size: 20, align: AlignmentType.CENTER }),
              p("——————————————", { size: 18, color: "888888", align: AlignmentType.CENTER }),
              p(`Hà Nội, ngày ${today}`, { size: 18, italics: true, color: "555555", align: AlignmentType.CENTER }),
            ],
            { width: CONTENT_W - HALF, vertAlign: VerticalAlign.CENTER, margins: { top: 120, bottom: 120, left: 120, right: 120 } }
          ),
        ],
      }),
    ],
  });

  // ── 2. Title ─────────────────────────────────────────────────────────────
  const titlePara = new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 200, after: 200 },
    children: [
      new TextRun({ text: "BẢNG ĐIỀU TOUR", bold: true, size: 32, font: "Times New Roman" }),
    ],
  });

  // ── 3. Tour info table ───────────────────────────────────────────────────
  const LW = 2200; // label width
  const VW = CONTENT_W / 2 - LW; // value width per side
  const HALF2 = CONTENT_W / 2;

  const shopStr = shopping === true ? "YES" : shopping === false ? "NO" : "—";
  const bayStr = [chuyenBayDon, chuyenBayTien].filter(Boolean).join(" → ") || "—";

  const infoTable = new Table({
    width: { size: CONTENT_W, type: WidthType.DXA },
    rows: [
      // Row 1: Code đoàn | Bảng đón
      new TableRow({
        children: [
          cell([p("Code đoàn:", { bold: true, size: 20 })], { width: 1800, shading: HEADER_SHADING }),
          cell([p(tenDoan, { bold: true, size: 20, color: "185FA5" })], { width: HALF2 - 1800 }),
          cell([p("Bảng đón:", { bold: true, size: 20 })], { width: 1800, shading: HEADER_SHADING }),
          cell([p(bangDon || "—", { size: 20 })], { width: HALF2 - 1800 }),
        ],
      }),
      // Row 2: HDV | Shopping
      new TableRow({
        children: [
          cell([p("HDV:", { bold: true, size: 20 })], { width: 1800, shading: HEADER_SHADING }),
          cell([p(hdv || "—", { size: 20 })], { width: HALF2 - 1800 }),
          cell([p("Shopping:", { bold: true, size: 20 })], { width: 1800, shading: HEADER_SHADING }),
          cell([p(shopStr, { size: 20 })], { width: HALF2 - 1800 }),
        ],
      }),
      // Row 3: Xe | T/L
      new TableRow({
        children: [
          cell([p("Xe:", { bold: true, size: 20 })], { width: 1800, shading: HEADER_SHADING }),
          cell([p(xeLabel(xe), { size: 20 })], { width: HALF2 - 1800 }),
          cell([p("T/L:", { bold: true, size: 20 })], { width: 1800, shading: HEADER_SHADING }),
          cell([p(truongDoan || "—", { size: 20 })], { width: HALF2 - 1800 }),
        ],
      }),
      // Row 4: Ngày đón | Chuyến bay
      new TableRow({
        children: [
          cell([p("Ngày đón:", { bold: true, size: 20 })], { width: 1800, shading: HEADER_SHADING }),
          cell([p(formatDate(ngayDi), { size: 20 })], { width: HALF2 - 1800 }),
          cell([p("Chuyến bay:", { bold: true, size: 20 })], { width: 1800, shading: HEADER_SHADING }),
          cell([p(bayStr, { size: 20 })], { width: HALF2 - 1800 }),
        ],
      }),
      // Row 5: Ngày tiễn
      new TableRow({
        children: [
          cell([p("Ngày tiễn:", { bold: true, size: 20 })], { width: 1800, shading: HEADER_SHADING }),
          cell([p(formatDate(ngayVe), { size: 20 })], { width: HALF2 - 1800 }),
          cell([p("", { size: 20 })], { width: 1800 }),
          cell([p("", { size: 20 })], { width: HALF2 - 1800 }),
        ],
      }),
    ],
  });

  // ── 4. Guest count table ─────────────────────────────────────────────────
  const GW = Math.floor(CONTENT_W / 6);
  const guestTable = new Table({
    width: { size: CONTENT_W, type: WidthType.DXA },
    rows: [
      new TableRow({
        children: [
          cell([p("Người lớn", { bold: true, size: 20, align: AlignmentType.CENTER })], { width: GW, shading: HEADER_SHADING, vertAlign: VerticalAlign.CENTER }),
          cell([p(String(soKhachLon), { size: 20, align: AlignmentType.CENTER })], { width: GW }),
          cell([p("Trẻ em 6–10", { bold: true, size: 20, align: AlignmentType.CENTER })], { width: GW, shading: HEADER_SHADING }),
          cell([p(String(soKhachEm1), { size: 20, align: AlignmentType.CENTER })], { width: GW }),
          cell([p("Trẻ em <6", { bold: true, size: 20, align: AlignmentType.CENTER })], { width: GW, shading: HEADER_SHADING }),
          cell([p(String(soKhachEm2), { size: 20, align: AlignmentType.CENTER })], { width: GW }),
        ],
      }),
      new TableRow({
        children: [
          cell([p("T/L", { bold: true, size: 20, align: AlignmentType.CENTER })], { width: GW, shading: HEADER_SHADING }),
          cell([p(String(soKhachTl), { size: 20, align: AlignmentType.CENTER })], { width: GW }),
          cell([p("Tổng", { bold: true, size: 20, align: AlignmentType.CENTER })], { width: GW, shading: HEADER_SHADING }),
          cell([p(String(totalKhach), { bold: true, size: 20, align: AlignmentType.CENTER, color: "185FA5" })], { width: GW }),
          cell([p("Chú thích:", { bold: true, size: 20 })], { width: GW, shading: HEADER_SHADING }),
          cell([p(chuThichKhach || "—", { size: 20 })], { width: GW }),
        ],
      }),
    ],
  });

  // ── 5. Gifts (if any) ─────────────────────────────────────────────────────
  const giftParas: Paragraph[] = [];
  if (gifts.length > 0) {
    giftParas.push(new Paragraph({
      spacing: { before: 160, after: 80 },
      children: [new TextRun({ text: "Quà tặng: " + gifts.join(", "), size: 20, font: "Times New Roman", bold: true })],
    }));
  }

  // ── 6. Day schedule table ─────────────────────────────────────────────────
  const schedHeaderRow = new TableRow({
    tableHeader: true,
    children: [
      cell([p("Ngày", { bold: true, align: AlignmentType.CENTER, size: 20 })], { width: SCHED_COL[0], shading: HEADER_SHADING, vertAlign: VerticalAlign.CENTER }),
      cell([p("Chương trình", { bold: true, align: AlignmentType.CENTER, size: 20 })], { width: SCHED_COL[1], shading: HEADER_SHADING, vertAlign: VerticalAlign.CENTER }),
      cell([p("Ăn trưa", { bold: true, align: AlignmentType.CENTER, size: 20 })], { width: SCHED_COL[2], shading: HEADER_SHADING, vertAlign: VerticalAlign.CENTER }),
      cell([p("Ăn tối", { bold: true, align: AlignmentType.CENTER, size: 20 })], { width: SCHED_COL[3], shading: HEADER_SHADING, vertAlign: VerticalAlign.CENTER }),
      cell([p("Khách sạn", { bold: true, align: AlignmentType.CENTER, size: 20 })], { width: SCHED_COL[4], shading: HEADER_SHADING, vertAlign: VerticalAlign.CENTER }),
    ],
  });

  const schedDataRows = days.map((day) => {
    const ngayParas = [
      p(formatDateShort(day.ngay_date), { bold: true, align: AlignmentType.CENTER }),
      p(day.thu, { align: AlignmentType.CENTER, color: "555555", size: 18 }),
    ];

    const ctParas: Paragraph[] = [];
    if (day.thanh_pho) ctParas.push(p(day.thanh_pho, { bold: true }));
    for (const item of day.items) {
      const cd = canhDiemMap.get(item.canh_diem_id);
      if (cd) {
        ctParas.push(p(`• ${cd.ten}`, { size: 20 }));
        if (item.ghi_chu) ctParas.push(p(`  ${item.ghi_chu}`, { color: "666666", size: 18 }));
      }
    }
    if (ctParas.length === 0) ctParas.push(p(""));

    const truaParas: Paragraph[] = [];
    if (day.an_trua_nha_hang_id) {
      const nh = nhaHangMap.get(day.an_trua_nha_hang_id);
      if (nh) {
        truaParas.push(p(nh.ten, { bold: true }));
        if (nh.dia_chi) truaParas.push(p(nh.dia_chi, { color: "666666", size: 18 }));
      }
    }
    if (truaParas.length === 0) truaParas.push(p(""));

    const toiParas: Paragraph[] = [];
    if (day.an_toi_nha_hang_id) {
      const nh = nhaHangMap.get(day.an_toi_nha_hang_id);
      if (nh) {
        toiParas.push(p(nh.ten, { bold: true }));
        if (nh.dia_chi) toiParas.push(p(nh.dia_chi, { color: "666666", size: 18 }));
      }
    }
    if (toiParas.length === 0) toiParas.push(p(""));

    const ksParas: Paragraph[] = [];
    if (day.khach_san_id) {
      const ks = khachSanMap.get(day.khach_san_id);
      if (ks) {
        ksParas.push(p(ks.ten, { bold: true }));
        if (ks.dia_chi) ksParas.push(p(ks.dia_chi, { color: "666666", size: 18 }));
      }
    }
    if (day.ks_loai_phong) ksParas.push(p(day.ks_loai_phong, { size: 20 }));
    if (day.ks_ma_code) ksParas.push(p(`Code: ${day.ks_ma_code}`, { color: "555555", size: 18 }));
    if (ksParas.length === 0) ksParas.push(p(""));

    return new TableRow({
      children: [
        cell(ngayParas, { width: SCHED_COL[0], vertAlign: VerticalAlign.CENTER }),
        cell(ctParas, { width: SCHED_COL[1] }),
        cell(truaParas, { width: SCHED_COL[2] }),
        cell(toiParas, { width: SCHED_COL[3] }),
        cell(ksParas, { width: SCHED_COL[4] }),
      ],
    });
  });

  const schedTable = new Table({
    width: { size: CONTENT_W, type: WidthType.DXA },
    rows: [schedHeaderRow, ...schedDataRows],
  });

  // ── 7. Ghi chú ───────────────────────────────────────────────────────────
  const ghiChuParas: Paragraph[] = [];
  if (ghiChuDieuTour) {
    ghiChuParas.push(new Paragraph({
      spacing: { before: 200, after: 60 },
      children: [new TextRun({ text: "Ghi chú:", bold: true, size: 20, font: "Times New Roman" })],
    }));
    ghiChuParas.push(new Paragraph({
      children: [new TextRun({ text: ghiChuDieuTour, size: 20, font: "Times New Roman" })],
    }));
  }

  // ── Spacer ────────────────────────────────────────────────────────────────
  const spacer = new Paragraph({ spacing: { before: 160, after: 0 }, children: [] });

  const doc = new Document({
    sections: [
      {
        properties: {
          page: {
            size: { width: PAGE_H, height: PAGE_W, orientation: PageOrientation.LANDSCAPE },
            margin: { top: MARGIN, bottom: MARGIN, left: MARGIN, right: MARGIN },
          },
        },
        children: [
          headerTable,
          titlePara,
          infoTable,
          spacer,
          guestTable,
          ...giftParas,
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
