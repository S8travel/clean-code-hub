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
import { applyChietKhau } from "@/lib/chi-phi-calc";

const BORDER = { style: BorderStyle.SINGLE, size: 1, color: "000000" };
const BORDERS = { top: BORDER, bottom: BORDER, left: BORDER, right: BORDER };
const NO_BORDER = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };
const NO_BORDERS = { top: NO_BORDER, bottom: NO_BORDER, left: NO_BORDER, right: NO_BORDER };
const GRAY = { fill: "D9D9D9", type: ShadingType.CLEAR, color: "auto" };
const WHITE = { fill: "FFFFFF", type: ShadingType.CLEAR, color: "auto" };

// Landscape A4
const PAGE_W = 16838;
const PAGE_H = 11906;
const MARGIN = 720;
const CONTENT_W = PAGE_W - MARGIN * 2; // 15398

// 14 columns — total = 15398. Idx 6 = CK%, idx 8 = Tổng tiền (Σ thành tiền của ĐNTT).
const COL_W = [1200, 1000, 1800, 650, 550, 1050, 600, 1200, 1200, 1050, 900, 1200, 1700, 1298];

const fmt = (n: number) => n.toLocaleString("vi-VN");

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
    margins: opts.margins ?? { top: 30, bottom: 30, left: 60, right: 60 },
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
      new TextRun({ noProof: true,
        text,
        font: "Arial",
        size: opts.size ?? 16,
        bold: opts.bold,
        color: opts.color,
        italics: opts.italic,
      }),
    ],
  });
}

export interface NHDocItem {
  so_luong: number;
  don_gia: number;
  ghi_chu?: string;
  /** CK% riêng dòng này (main + extras đều có CK riêng). 0/undefined = không CK. */
  chiet_khau_phan_tram?: number;
}

export interface NHDocEntry {
  ngay_date: string;       // "DD/MM/YYYY"
  ten_nh: string;
  so_khach: number;
  foc_khach: number | null; // foc_khach (mỗi X khách)
  foc: number | null;       // foc_mien (miễn Y) — giữ tên `foc` cho backward compat
  items: NHDocItem[];
  /** @deprecated CK% giờ per-item (NHDocItem.chiet_khau_phan_tram). Giữ cho tương thích. */
  chiet_khau_phan_tram?: number;
  ncc: { ten?: string; so_tai_khoan?: string; ngan_hang?: string } | null;
  tai_khoan_thanh_toan: string | null;
  so_tien_coc: number;
  can_tru: number;
  /** Ghi chú nguồn cấn trừ — vd "Cấn trừ từ đoàn: VDC052705BR6". In ở cột Ghi chú
   *  (dòng đầu của entry) khi can_tru > 0. */
  can_tru_note?: string;
  /** Phần suất chính trả bằng voucher → cộng vào cột Cấn trừ + trừ khỏi "còn TT".
   *  Dòng chính ghi chú "Voucher". */
  voucher_amount?: number;
  so_tien_con_tt: number;
  /** True khi đây là ĐNTT cọc (in cho mục đích "Đề nghị thanh toán tiền cọc").
   *  Ô "Số tiền còn thanh toán" hiển thị "(cọc)" + đỏ đậm. */
  la_coc?: boolean;
  /** True khi 1 entry gộp NHIỀU dịch vụ (ĐNTT gộp). Cột TÊN render tên dịch vụ
   *  theo TỪNG dòng (lấy từ item.ghi_chu), số khách theo từng dòng, cột Ghi chú bỏ;
   *  các cột tổng/cọc/cấn trừ/cần thanh toán vẫn gộp (rowSpan) cho cả entry. */
  multi_service?: boolean;

  // ── Metadata ĐNTT đang in — KHÔNG in ra Word ────────────────────────────────
  // Chỉ để modal xem trước đối chiếu "Tổng tiền" (Σ dòng) với số tiền ĐNTT: 2 cột
  // này lấy từ 2 nguồn khác nhau, lệch nhau = tờ giấy tự mâu thuẫn (Tổng − Cấn trừ
  // ≠ Còn TT). Xem lib/print-dntt-sync.ts.
  /** ĐNTT đang in (nếu có ĐNTT sống cho dòng/nhóm này). */
  dntt_id?: number;
  /** so_tien của ĐNTT đó. */
  dntt_so_tien?: number;
  /** ĐNTT cọc / [Bổ sung] → so_tien CỐ Ý khác tổng dòng, không cảnh báo lệch. */
  dntt_lech_bo_qua?: boolean;
  /** Phần ĐÃ in trong "Tổng tiền" nhưng CỐ Ý không nằm trong so_tien ĐNTT:
   *  voucher TẶNG (dòng chính in gross) + dòng phát sinh HDV trả tiền mặt. */
  dntt_ngoai_dntt?: number;
}

export interface NHDocData {
  doan: { ten_doan: string };
  entries: NHDocEntry[];
  nguoiDeNghi?: string;
}

/** Tổng tiền 1 entry NH/DV = Σ thành tiền các item (đã trừ chiết khấu riêng từng dòng). */
export function calcNHEntryTotal(items: NHDocItem[]): number {
  return items.reduce(
    (s, it) => s + applyChietKhau(it.so_luong * it.don_gia, it.chiet_khau_phan_tram ?? 0),
    0,
  );
}

export async function exportDNTTNHWordFromData(data: NHDocData) {
  const { doan, entries, nguoiDeNghi = "" } = data;
  if (entries.length === 0) return;

  const today = new Date();
  const dateVN = `Hà Nội, ngày ${today.getDate()} tháng ${today.getMonth() + 1} năm ${today.getFullYear()}`;

  // ── 1. Header: Company info + date ──────────────────────────────────────
  const HALF = Math.floor(CONTENT_W / 2);
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
            { width: HALF, borders: NO_BORDERS, margins: { top: 60, bottom: 60, left: 0, right: 0 } },
          ),
          cell(
            [p(dateVN, { size: 16, alignment: AlignmentType.RIGHT, italic: true })],
            { width: CONTENT_W - HALF, borders: NO_BORDERS, margins: { top: 60, bottom: 60, left: 0, right: 0 }, vAlign: VerticalAlign.BOTTOM },
          ),
        ],
      }),
    ],
  });

  // ── 2. Title ─────────────────────────────────────────────────────────────
  const titlePara = new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 200, after: 80 },
    children: [new TextRun({ noProof: true, text: "GIẤY ĐỀ NGHỊ THANH TOÁN", font: "Arial", size: 32, bold: true })],
  });

  // ── 3. Kính gửi + Lý do ──────────────────────────────────────────────────
  const kinhGuiPara = new Paragraph({
    alignment: AlignmentType.LEFT,
    spacing: { before: 60, after: 40 },
    children: [new TextRun({ noProof: true, text: "Kính gửi: Giám đốc công ty TNHH du lịch S8 Travel", font: "Arial", size: 20, bold: true })],
  });
  const hasCoc = entries.some((e) => e.la_coc);
  const allCoc = entries.length > 0 && entries.every((e) => e.la_coc);
  const lyDoText = allCoc
    ? "Lý do thanh toán: Thanh toán tiền cọc dịch vụ"
    : hasCoc
      ? "Lý do thanh toán: Thanh toán tiền dịch vụ + tiền cọc dịch vụ"
      : "Lý do thanh toán: Thanh toán tiền dịch vụ";
  const lyDoPara = new Paragraph({
    alignment: AlignmentType.LEFT,
    spacing: { before: 40, after: 120 },
    children: [new TextRun({ noProof: true, text: lyDoText, font: "Arial", size: 20 })],
  });

  // ── 4. Data table ─────────────────────────────────────────────────────────
  const rows: TableRow[] = [];

  // Header row — 14 cột ("Tổng tiền" sau "Thành tiền")
  const headers = [
    "CODE\nĐOÀN", "NGÀY", "TÊN NHÀ HÀNG\n/ DỊCH VỤ", "Số\nkhách",
    "FOC", "Đơn giá\n(gồm VAT)", "Chiết\nkhấu", "Thành\ntiền", "Tổng\ntiền",
    "Số tiền\ncọc", "Cấn\ntrừ", "Số tiền còn\nthanh toán", "Tài khoản\nthanh toán", "Ghi chú",
  ];
  rows.push(
    new TableRow({
      children: headers.map((h, i) =>
        cell([p(h, { bold: true, size: 14 })], { width: COL_W[i], shading: GRAY }),
      ),
    }),
  );

  // Count total item rows for CODE ĐOÀN rowspan
  const totalItemRows = entries.reduce((s, e) => s + Math.max(e.items.length, 1), 0);
  let firstEntry = true;

  for (const entry of entries) {
    const itemCount = Math.max(entry.items.length, 1);
    const items = entry.items.length > 0 ? entry.items : [{ so_luong: 0, don_gia: 0, ghi_chu: "" }];
    const entryTongTien = calcNHEntryTotal(items);

    // Bank / payment account info from restaurant's tai_khoan_thanh_toan
    const bankChildren: Paragraph[] = [];
    if (entry.tai_khoan_thanh_toan) {
      const lines = entry.tai_khoan_thanh_toan.split("\n").filter(Boolean);
      lines.forEach((line) =>
        bankChildren.push(p(line.trim(), { size: 13, alignment: AlignmentType.LEFT }))
      );
    } else if (entry.ncc?.ten) {
      // fallback to NCC info if no restaurant bank account
      bankChildren.push(p(entry.ncc.ten, { size: 13, alignment: AlignmentType.LEFT, bold: true }));
      if (entry.ncc.so_tai_khoan) bankChildren.push(p(entry.ncc.so_tai_khoan, { size: 13, alignment: AlignmentType.LEFT }));
      if (entry.ncc.ngan_hang) bankChildren.push(p(entry.ncc.ngan_hang, { size: 13, alignment: AlignmentType.LEFT }));
    }
    if (bankChildren.length === 0) bankChildren.push(p("—", { size: 13 }));

    for (let ri = 0; ri < items.length; ri++) {
      const item = items[ri];
      const isFirst = ri === 0;
      const grossThanhTien = item.so_luong * item.don_gia;
      // CK% riêng từng dòng (main + extras). Dùng applyChietKhau → khớp tuyệt
      // đối số hệ thống lưu (handleSave / handleExtraSave).
      const itemCk = item.chiet_khau_phan_tram ?? 0;
      const thanhTien = applyChietKhau(grossThanhTien, itemCk);
      const cells: TableCell[] = [];

      // CODE ĐOÀN — only on very first row, spans all rows
      if (firstEntry && isFirst) {
        cells.push(
          cell([p(doan.ten_doan, { bold: true, size: 14 })], {
            width: COL_W[0],
            rowSpan: totalItemRows,
          }),
        );
      }

      if (isFirst) {
        // NGÀY
        cells.push(cell([p(entry.ngay_date, { size: 14 })], { width: COL_W[1], rowSpan: itemCount }));
        // TÊN — entry đơn: 1 tên rowSpan. Gộp nhiều dịch vụ: render per-item bên dưới.
        if (!entry.multi_service) {
          cells.push(cell([p(entry.ten_nh, { bold: true, size: 14 })], { width: COL_W[2], rowSpan: itemCount }));
        }
      }
      // TÊN — entry gộp: mỗi dòng = 1 dịch vụ (tên lấy từ item.ghi_chu).
      if (entry.multi_service) {
        cells.push(cell([p(item.ghi_chu || "—", { bold: true, size: 14 })], { width: COL_W[2] }));
      }

      // Số khách — gộp: per-item; entry đơn: dòng main = entry.so_khach, phát sinh = item.so_luong
      const soKhachRow = entry.multi_service ? item.so_luong : (isFirst ? entry.so_khach : item.so_luong);
      cells.push(cell([p(String(soKhachRow), { size: 14 })], { width: COL_W[3] }));
      // FOC — chỉ dòng main hiện FOC (extras không có FOC). In SỐ KHÁCH ĐƯỢC MIỄN
      // đã tính: so_mien = floor(so_khach / foc_khach * foc_mien). Số nguyên, làm tròn xuống.
      const focCount = isFirst && entry.foc_khach && entry.foc != null && entry.so_khach > 0
        ? Math.floor((entry.so_khach / entry.foc_khach) * entry.foc)
        : null;
      const focText = isFirst
        ? (focCount != null ? String(focCount) : "—")
        : "—";
      cells.push(cell([p(focText, { size: 14 })], { width: COL_W[4] }));

      // Đơn giá — per item
      cells.push(cell([p(item.don_gia > 0 ? fmt(item.don_gia) : "—", { size: 14 })], { width: COL_W[5] }));
      // Chiết khấu — in trực tiếp số tiền CK (VND) trong ngoặc, KHÔNG còn hiện %
      const ckSoTien = grossThanhTien - thanhTien;
      const ckText = ckSoTien > 0 ? `(${fmt(ckSoTien)})` : "—";
      cells.push(cell([p(ckText, { size: 14, color: ckSoTien > 0 ? "CC0000" : undefined })], { width: COL_W[6] }));
      // Thành tiền — main đã trừ CK, extras gross
      cells.push(cell([p(thanhTien > 0 ? fmt(thanhTien) : "—", { bold: true, size: 14 })], { width: COL_W[7] }));

      if (isFirst) {
        // Tổng tiền — Σ thành tiền của entry
        cells.push(
          cell([p(entryTongTien > 0 ? fmt(entryTongTien) : "—", { bold: true, size: 14 })], {
            width: COL_W[8], rowSpan: itemCount,
          }),
        );
        // Số tiền cọc (= tiền cọc đã thanh toán trước đó)
        cells.push(
          cell([p(entry.so_tien_coc > 0 ? fmt(entry.so_tien_coc) : "—", { size: 14, color: entry.so_tien_coc > 0 ? "FF6600" : undefined })], {
            width: COL_W[9], rowSpan: itemCount,
          }),
        );
        // Cấn trừ = công nợ cấn trừ + phần trả bằng voucher (nguồn/loại in ở cột Ghi chú).
        const tongCanTru = entry.can_tru + (entry.voucher_amount ?? 0);
        cells.push(
          cell([p(tongCanTru > 0 ? fmt(tongCanTru) : "—", { size: 14, color: tongCanTru > 0 ? "FF6600" : undefined })], {
            width: COL_W[10], rowSpan: itemCount,
          }),
        );
        // Số tiền còn TT — la_coc → kèm "(cọc)" để rõ tính chất khoản này
        const conTTText = entry.so_tien_con_tt > 0 ? fmt(entry.so_tien_con_tt) : "—";
        const conTTChildren = entry.la_coc && entry.so_tien_con_tt > 0
          ? [
              p(conTTText, { bold: true, size: 14, color: "CC0000" }),
              p("(cọc)", { size: 12, color: "CC0000", italic: true }),
            ]
          : [p(conTTText, { bold: true, size: 14, color: "CC0000" })];
        cells.push(
          cell(conTTChildren, { width: COL_W[11], rowSpan: itemCount }),
        );
        // Tài khoản thanh toán
        cells.push(cell(bankChildren, { width: COL_W[12], rowSpan: itemCount }));
      }

      // Ghi chú — entry gộp: bỏ tên (đã ở cột TÊN); entry đơn: item.ghi_chu.
      // Dòng ĐẦU: ghi "Voucher" (nếu suất chính trả bằng voucher) + nguồn cấn trừ.
      const baseNote = isFirst && (entry.voucher_amount ?? 0) > 0
        ? "Voucher"
        : (entry.multi_service ? "" : (item.ghi_chu || ""));
      const noteParts = [baseNote, isFirst && entry.can_tru_note ? entry.can_tru_note : ""].filter(Boolean);
      const ghiChuText = noteParts.length > 0 ? noteParts.join(" · ") : "—";
      cells.push(cell([p(ghiChuText, { size: 13, alignment: AlignmentType.LEFT })], { width: COL_W[13] }));

      rows.push(new TableRow({ children: cells }));
    }

    firstEntry = false;
  }

  // ── Dòng TỔNG CỘNG: cộng tiền của TẤT CẢ khối → 1 con số cần chuyển.
  // Quan trọng khi 1 giấy đề nghị gồm nhiều NH/DV (vd thanh toán gộp cùng NCC):
  // trước đây mỗi khối hiện tổng riêng, không có số tổng chung.
  {
    const sumW = (a: number, b: number) => COL_W.slice(a, b).reduce((s, w) => s + w, 0);
    const sumE = (f: (e: NHDocEntry) => number) => entries.reduce((s, e) => s + f(e), 0);
    const gTongTien = sumE((e) => calcNHEntryTotal(e.items));
    const gCoc = sumE((e) => e.so_tien_coc);
    const gCanTru = sumE((e) => e.can_tru + (e.voucher_amount ?? 0));
    const gConTT = sumE((e) => e.so_tien_con_tt);
    const numCell = (v: number, w: number, bold = false, color?: string) =>
      cell([p(v > 0 ? fmt(v) : "—", { size: 14, bold, color })], { width: w, shading: GRAY });
    rows.push(
      new TableRow({
        children: [
          cell([p("TỔNG CỘNG", { bold: true, size: 14, alignment: AlignmentType.RIGHT })],
            { width: sumW(0, 8), columnSpan: 8, shading: GRAY }),
          numCell(gTongTien, COL_W[8], true),               // Tổng tiền
          numCell(gCoc, COL_W[9]),                           // Số tiền cọc
          numCell(gCanTru, COL_W[10]),                       // Cấn trừ
          numCell(gConTT, COL_W[11], true, "CC0000"),        // Số tiền còn thanh toán
          cell([p("", { size: 13 })], { width: sumW(12, 14), columnSpan: 2, shading: GRAY }),
        ],
      }),
    );
  }

  const table = new Table({
    width: { size: CONTENT_W, type: WidthType.DXA },
    columnWidths: COL_W,
    rows,
  });

  // ── 5. Signature section ──────────────────────────────────────────────────
  const SIG_W = Math.floor(CONTENT_W / 5);
  const SIG_LAST = CONTENT_W - SIG_W * 4;
  const sigTitles = ["NGƯỜI ĐỀ NGHỊ", "TRƯỞNG BỘ PHẬN", "KẾ TOÁN THANH TOÁN", "KẾ TOÁN TRƯỞNG", "GIÁM ĐỐC"];
  const sigNames = [nguoiDeNghi.toUpperCase(), "VÕ THỊ MINH XUÂN", "TRẦN THỊ ÁNH HỒNG", "NGUYỄN CHÍ LINH", "NGUYỄN TIẾN DŨNG"];
  const sigWidths = [SIG_W, SIG_W, SIG_W, SIG_W, SIG_LAST];

  const signatureTable = new Table({
    width: { size: CONTENT_W, type: WidthType.DXA },
    rows: [
      new TableRow({
        children: sigTitles.map((t, i) =>
          cell([p(t, { bold: true, size: 18 })], { width: sigWidths[i], borders: NO_BORDERS }),
        ),
      }),
      new TableRow({
        children: sigWidths.map((w) =>
          cell([p("(Ký, ghi rõ họ tên)", { size: 16, color: "888888" })], { width: w, borders: NO_BORDERS }),
        ),
      }),
      new TableRow({
        children: sigWidths.map((w) =>
          cell(
            [p("", { size: 36 }), p("", { size: 36 }), p("", { size: 36 }), p("", { size: 36 }), p("", { size: 36 }), p("", { size: 36 })],
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
          size: { width: PAGE_H, height: PAGE_W, orientation: PageOrientation.LANDSCAPE },
          margin: { top: MARGIN, right: MARGIN, bottom: MARGIN, left: MARGIN },
        },
      },
      children: [
        headerTable,
        titlePara,
        kinhGuiPara,
        lyDoPara,
        table,
        new Paragraph({ spacing: { before: 300 }, children: [] }),
        signatureTable,
      ],
    }],
  });

  const blob = await Packer.toBlob(doc);
  saveAs(blob, `DNTT_NH_${doan.ten_doan}.docx`);
}
