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
import type { ITableCellBorders, TableVerticalAlign } from "docx";
import { saveAs } from "file-saver";
import { getLogoData, companyLogoTable } from "@/lib/docx-logo";

export interface KhacWordItem {
  mo_ta: string;
  so_luong: number;
  don_gia: number;
  thanh_tien: number;
}

export interface KhacWordInput {
  maDoan: string;
  tenDoan?: string;
  tenNguoiNhan: string;         // đơn vị/người nhận tiền (= chủ tài khoản)
  soTaiKhoan?: string | null;
  nganHang?: string | null;
  lyDo?: string | null;
  items: KhacWordItem[];
  ngayLap?: string;             // ISO date
  ngayCanThanhToan?: string | null;
  /** Nhãn dòng người nhận trong info block. Mặc định "Người đề nghị".
   *  Thanh toán cho NCC (định kỳ) → truyền "Đơn vị thụ hưởng". */
  nhanLabel?: string;
  /** Tên ở ô ký "NGƯỜI ĐỀ NGHỊ". Mặc định = tenNguoiNhan (case hoàn ứng:
   *  người ứng = người ký). NCC định kỳ → để "" cho nhân viên ký tay. */
  tenNguoiDeNghi?: string;
  /** Ép hình thức nhận. Mặc định auto: chuyển khoản nếu có STK/ngân hàng,
   *  ngược lại tiền mặt. Thanh toán cho NCC (định kỳ) luôn là "chuyen_khoan"
   *  kể cả khi NCC chưa nhập STK (tránh in nhầm "Tiền mặt"). */
  hinhThuc?: "tien_mat" | "chuyen_khoan";
}

// ── Style helpers (đồng bộ với export-dntt-nh-word.ts) ─────────────────────
const BORDER = { style: BorderStyle.SINGLE, size: 1, color: "000000" };
const BORDERS = { top: BORDER, bottom: BORDER, left: BORDER, right: BORDER };
const NO_BORDER = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };
const NO_BORDERS = { top: NO_BORDER, bottom: NO_BORDER, left: NO_BORDER, right: NO_BORDER };
const GRAY = { fill: "D9D9D9", type: ShadingType.CLEAR, color: "auto" };
const WHITE = { fill: "FFFFFF", type: ShadingType.CLEAR, color: "auto" };

// Portrait A4 — đơn giản, chỉ 5 cột không cần landscape
const PAGE_W = 11906;
const PAGE_H = 16838;
const MARGIN = 720;
const CONTENT_W = PAGE_W - MARGIN * 2; // 10466

// 5 cột: STT | Nội dung | SL | Đơn giá | Thành tiền — tổng 10466
const COL_W = [700, 5366, 900, 1700, 1800];

const fmt = (n: number) => n.toLocaleString("vi-VN");

function sanitize(name: string): string {
  return name.replace(/[\\/:*?"<>|]/g, "-").trim() || "phieu";
}

function cell(
  children: (Paragraph | Table)[],
  opts: {
    width?: number;
    rowSpan?: number;
    columnSpan?: number;
    shading?: typeof GRAY;
    borders?: ITableCellBorders;
    margins?: { top: number; bottom: number; left: number; right: number };
    vAlign?: TableVerticalAlign;
  } = {},
): TableCell {
  return new TableCell({
    children,
    borders: opts.borders ?? BORDERS,
    width: { size: opts.width ?? 0, type: WidthType.DXA },
    rowSpan: opts.rowSpan,
    columnSpan: opts.columnSpan,
    shading: opts.shading ?? WHITE,
    verticalAlign: opts.vAlign ?? VerticalAlign.CENTER,
    margins: opts.margins ?? { top: 60, bottom: 60, left: 80, right: 80 },
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
      new TextRun({
        noProof: true,
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

// ── Số tiền sang chữ (tiếng Việt) ──────────────────────────────────────────
// Hỗ trợ tới hàng nghìn tỷ. Đủ cho mọi giá trị thực tế của S8.
const ONES = ["không", "một", "hai", "ba", "bốn", "năm", "sáu", "bảy", "tám", "chín"];
function readThreeDigits(n: number, full: boolean): string {
  const tr = Math.floor(n / 100);
  const ch = Math.floor((n % 100) / 10);
  const dv = n % 10;
  const out: string[] = [];
  if (full || tr > 0) out.push(`${ONES[tr]} trăm`);
  if (ch === 0 && dv > 0 && (full || tr > 0)) out.push("lẻ");
  if (ch > 1) {
    out.push(`${ONES[ch]} mươi`);
    if (dv === 1) out.push("mốt");
    else if (dv === 5) out.push("lăm");
    else if (dv > 0) out.push(ONES[dv]);
  } else if (ch === 1) {
    out.push("mười");
    if (dv === 5) out.push("lăm");
    else if (dv > 0) out.push(ONES[dv]);
  } else if (dv > 0) {
    out.push(ONES[dv]);
  }
  return out.join(" ").trim();
}
function numberToVietnameseWords(n: number): string {
  if (n === 0) return "Không đồng";
  const groups: { value: number; label: string }[] = [];
  const trillions = Math.floor(n / 1_000_000_000_000);
  const billions = Math.floor((n % 1_000_000_000_000) / 1_000_000_000);
  const millions = Math.floor((n % 1_000_000_000) / 1_000_000);
  const thousands = Math.floor((n % 1_000_000) / 1_000);
  const units = n % 1_000;
  if (trillions > 0) groups.push({ value: trillions, label: "nghìn tỷ" });
  if (billions > 0) groups.push({ value: billions, label: "tỷ" });
  if (millions > 0) groups.push({ value: millions, label: "triệu" });
  if (thousands > 0) groups.push({ value: thousands, label: "nghìn" });
  if (units > 0) groups.push({ value: units, label: "" });
  const parts = groups.map((g, i) => {
    const full = i > 0;
    const text = readThreeDigits(g.value, full);
    return g.label ? `${text} ${g.label}` : text;
  });
  const joined = parts.join(" ").replace(/\s+/g, " ").trim();
  return joined.charAt(0).toUpperCase() + joined.slice(1) + " đồng";
}

// ── Main exporter ──────────────────────────────────────────────────────────
export async function exportDnttKhacHoanUngWord(input: KhacWordInput): Promise<void> {
  const { items, tenNguoiNhan, maDoan, tenDoan, soTaiKhoan, nganHang, lyDo, ngayCanThanhToan, nhanLabel, tenNguoiDeNghi, hinhThuc } = input;
  const today = input.ngayLap ? new Date(input.ngayLap) : new Date();
  const dateVN = `Hà Nội, ngày ${today.getDate()} tháng ${today.getMonth() + 1} năm ${today.getFullYear()}`;
  const tong = items.reduce((s, it) => s + it.thanh_tien, 0);
  const isChuyenKhoan = hinhThuc ? hinhThuc === "chuyen_khoan" : !!(soTaiKhoan || nganHang);

  // ── 1. Header: Company info trái + ngày phải ──────────────────────────
  // Cell trái rộng 65% để địa chỉ "Thành phố Đà Nẵng, Việt Nam" vừa 1 dòng.
  // Cell phải (ngày) chỉ cần ~35% là đủ.
  const LEFT_W = Math.floor(CONTENT_W * 0.65);
  const logoData = await getLogoData();
  const coParas = [
    p("CÔNG TY TNHH DU LỊCH S8", { bold: true, size: 20, alignment: AlignmentType.LEFT }),
    p("MST: 0402021137", { size: 14, alignment: AlignmentType.LEFT }),
    p("Đ/C: Tầng 2, Tòa nhà Kim Sơn, Số 18 Phan Thành Tài, Phường Hòa Cường, Thành Phố Đà Nẵng, Việt Nam", { size: 14, alignment: AlignmentType.LEFT }),
    p("Email: s8travel.hddt@gmail.com", { size: 14, alignment: AlignmentType.LEFT }),
  ];
  const coBlock = companyLogoTable(logoData, coParas);
  const headerTable = new Table({
    width: { size: CONTENT_W, type: WidthType.DXA },
    rows: [
      new TableRow({
        children: [
          cell(
            coBlock ? [coBlock] : coParas,
            { width: LEFT_W, borders: NO_BORDERS, margins: { top: 60, bottom: 60, left: 0, right: 0 } },
          ),
          cell(
            [p(dateVN, { size: 18, alignment: AlignmentType.RIGHT, italic: true })],
            { width: CONTENT_W - LEFT_W, borders: NO_BORDERS, margins: { top: 60, bottom: 60, left: 0, right: 0 }, vAlign: VerticalAlign.BOTTOM },
          ),
        ],
      }),
    ],
  });

  // ── 2. Title ─────────────────────────────────────────────────────────────
  const titlePara = new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 240, after: 80 },
    children: [new TextRun({ noProof: true, text: "ĐỀ NGHỊ THANH TOÁN", font: "Arial", size: 36, bold: true })],
  });

  // ── 3. Info block — Kính gửi + Người đề nghị + Lý do + Mã đoàn ───────────
  const infoParas: Paragraph[] = [
    new Paragraph({
      alignment: AlignmentType.LEFT,
      spacing: { before: 80, after: 60 },
      children: [new TextRun({ noProof: true, text: "Kính gửi: Giám đốc công ty TNHH du lịch S8 Travel", font: "Arial", size: 22, bold: true })],
    }),
    new Paragraph({
      alignment: AlignmentType.LEFT,
      spacing: { before: 40, after: 40 },
      children: [
        new TextRun({ noProof: true, text: `${nhanLabel ?? "Người đề nghị"}: `, font: "Arial", size: 22 }),
        new TextRun({ noProof: true, text: tenNguoiNhan || "—", font: "Arial", size: 22, bold: true }),
      ],
    }),
  ];
  if (maDoan || tenDoan) {
    infoParas.push(new Paragraph({
      alignment: AlignmentType.LEFT,
      spacing: { before: 40, after: 40 },
      children: [
        new TextRun({ noProof: true, text: "Mã đoàn: ", font: "Arial", size: 22 }),
        new TextRun({ noProof: true, text: maDoan || tenDoan || "—", font: "Arial", size: 22, bold: true }),
      ],
    }));
  }
  const lyDoLine = (lyDo && lyDo.trim())
    || `Thanh toán chi phí phát sinh đoàn ${maDoan}${tenDoan && tenDoan !== maDoan ? ` — ${tenDoan}` : ""}`.trim();
  infoParas.push(new Paragraph({
    alignment: AlignmentType.LEFT,
    spacing: { before: 40, after: 40 },
    children: [
      new TextRun({ noProof: true, text: "Lý do: ", font: "Arial", size: 22 }),
      new TextRun({ noProof: true, text: lyDoLine, font: "Arial", size: 22 }),
    ],
  }));
  if (ngayCanThanhToan) {
    const d = new Date(ngayCanThanhToan + "T00:00:00");
    const ngayCanStr = `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}`;
    infoParas.push(new Paragraph({
      alignment: AlignmentType.LEFT,
      spacing: { before: 40, after: 80 },
      children: [
        new TextRun({ noProof: true, text: "Ngày cần thanh toán: ", font: "Arial", size: 22 }),
        new TextRun({ noProof: true, text: ngayCanStr, font: "Arial", size: 22, bold: true }),
      ],
    }));
  }

  // ── 4. Items table ───────────────────────────────────────────────────────
  const rows: TableRow[] = [];
  // Header
  const headers = ["STT", "Nội dung", "Số lượng", "Đơn giá", "Thành tiền (VND)"];
  rows.push(new TableRow({
    children: headers.map((h, i) => cell([p(h, { bold: true, size: 18 })], { width: COL_W[i], shading: GRAY })),
  }));
  // Items
  items.forEach((it, idx) => {
    rows.push(new TableRow({
      children: [
        cell([p(String(idx + 1), { size: 18 })], { width: COL_W[0] }),
        cell([p(it.mo_ta || "—", { size: 18, alignment: AlignmentType.LEFT })], { width: COL_W[1] }),
        cell([p(String(it.so_luong), { size: 18 })], { width: COL_W[2] }),
        cell([p(fmt(it.don_gia), { size: 18, alignment: AlignmentType.RIGHT })], { width: COL_W[3] }),
        cell([p(fmt(it.thanh_tien), { size: 18, bold: true, alignment: AlignmentType.RIGHT })], { width: COL_W[4] }),
      ],
    }));
  });
  // Tổng cộng
  rows.push(new TableRow({
    children: [
      cell([p("Tổng cộng", { bold: true, size: 18, alignment: AlignmentType.RIGHT })],
        { columnSpan: 4, width: COL_W[0] + COL_W[1] + COL_W[2] + COL_W[3], shading: GRAY }),
      cell([p(fmt(tong), { bold: true, size: 20, color: "CC0000", alignment: AlignmentType.RIGHT })],
        { width: COL_W[4], shading: GRAY }),
    ],
  }));
  const itemsTable = new Table({
    width: { size: CONTENT_W, type: WidthType.DXA },
    columnWidths: COL_W,
    rows,
  });

  // ── 5. Số tiền bằng chữ + thông tin nhận ────────────────────────────────
  const bangChuPara = new Paragraph({
    alignment: AlignmentType.LEFT,
    spacing: { before: 160, after: 40 },
    children: [
      new TextRun({ noProof: true, text: "Số tiền bằng chữ: ", font: "Arial", size: 22 }),
      new TextRun({ noProof: true, text: numberToVietnameseWords(tong), font: "Arial", size: 22, bold: true, italics: true }),
    ],
  });

  const hinhThucPara = new Paragraph({
    alignment: AlignmentType.LEFT,
    spacing: { before: 80, after: 40 },
    children: [
      new TextRun({ noProof: true, text: "Hình thức nhận: ", font: "Arial", size: 22 }),
      new TextRun({ noProof: true, text: isChuyenKhoan ? "Chuyển khoản" : "Tiền mặt", font: "Arial", size: 22, bold: true }),
    ],
  });

  const bankParas: Paragraph[] = [];
  if (isChuyenKhoan) {
    bankParas.push(new Paragraph({
      alignment: AlignmentType.LEFT,
      spacing: { before: 40, after: 40 },
      children: [
        new TextRun({ noProof: true, text: "Chủ tài khoản: ", font: "Arial", size: 22 }),
        new TextRun({ noProof: true, text: tenNguoiNhan || "—", font: "Arial", size: 22, bold: true }),
      ],
    }));
    if (soTaiKhoan) {
      bankParas.push(new Paragraph({
        alignment: AlignmentType.LEFT,
        spacing: { before: 40, after: 40 },
        children: [
          new TextRun({ noProof: true, text: "Số tài khoản: ", font: "Arial", size: 22 }),
          new TextRun({ noProof: true, text: soTaiKhoan, font: "Arial", size: 22, bold: true }),
        ],
      }));
    }
    if (nganHang) {
      bankParas.push(new Paragraph({
        alignment: AlignmentType.LEFT,
        spacing: { before: 40, after: 40 },
        children: [
          new TextRun({ noProof: true, text: "Ngân hàng: ", font: "Arial", size: 22 }),
          new TextRun({ noProof: true, text: nganHang, font: "Arial", size: 22, bold: true }),
        ],
      }));
    }
  }

  // ── 6. Signature ─────────────────────────────────────────────────────────
  const SIG_W = Math.floor(CONTENT_W / 5);
  const SIG_LAST = CONTENT_W - SIG_W * 4;
  const sigTitles = ["NGƯỜI ĐỀ NGHỊ", "TRƯỞNG BỘ PHẬN", "KẾ TOÁN THANH TOÁN", "KẾ TOÁN TRƯỞNG", "GIÁM ĐỐC"];
  const sigNames = [(tenNguoiDeNghi ?? tenNguoiNhan).toUpperCase(), "VÕ THỊ MINH XUÂN", "TRẦN THỊ ÁNH HỒNG", "NGUYỄN CHÍ LINH", "NGUYỄN TIẾN DŨNG"];
  const sigWidths = [SIG_W, SIG_W, SIG_W, SIG_W, SIG_LAST];

  const signatureTable = new Table({
    width: { size: CONTENT_W, type: WidthType.DXA },
    rows: [
      new TableRow({
        children: sigTitles.map((title, i) =>
          cell([p(title, { bold: true, size: 18 })], { width: sigWidths[i], borders: NO_BORDERS }),
        ),
      }),
      new TableRow({
        children: sigWidths.map((w) =>
          cell([p("(Ký, ghi rõ họ tên)", { size: 14, color: "888888" })], { width: w, borders: NO_BORDERS }),
        ),
      }),
      new TableRow({
        children: sigWidths.map((w) =>
          cell(
            [p("", { size: 36 }), p("", { size: 36 }), p("", { size: 36 }), p("", { size: 36 }), p("", { size: 36 })],
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
          size: { width: PAGE_W, height: PAGE_H, orientation: PageOrientation.PORTRAIT },
          margin: { top: MARGIN, right: MARGIN, bottom: MARGIN, left: MARGIN },
        },
      },
      children: [
        headerTable,
        titlePara,
        ...infoParas,
        new Paragraph({ spacing: { before: 80 }, children: [] }),
        itemsTable,
        bangChuPara,
        hinhThucPara,
        ...bankParas,
        new Paragraph({ spacing: { before: 320 }, children: [] }),
        signatureTable,
      ],
    }],
  });

  const blob = await Packer.toBlob(doc);
  saveAs(blob, `${sanitize(`DeNghiThanhToan_${maDoan || tenNguoiNhan}`)}.docx`);
}
