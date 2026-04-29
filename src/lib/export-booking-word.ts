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
import type { BookingKSDisplay } from "@/hooks/use-booking-ks";
import type { TauNgayDisplayRow } from "@/hooks/use-booking-tau";

const BORDER = { style: BorderStyle.SINGLE, size: 1, color: "000000" };
const BORDERS = { top: BORDER, bottom: BORDER, left: BORDER, right: BORDER };
const NO_BORDER = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };
const GRAY_SHADING = { fill: "D9D9D9", type: ShadingType.CLEAR, color: "auto" };
const NO_SHADING = { fill: "FFFFFF", type: ShadingType.CLEAR, color: "auto" };

const DETAIL_TOP    = { top: BORDER,    bottom: NO_BORDER, left: BORDER, right: BORDER };
const DETAIL_MIDDLE = { top: NO_BORDER, bottom: NO_BORDER, left: BORDER, right: BORDER };
const DETAIL_BOTTOM = { top: NO_BORDER, bottom: BORDER,    left: BORDER, right: BORDER };

const PAGE_W = 11906;
const PAGE_H = 16838;
const MARGIN = 720;
const CONTENT_W = PAGE_H - MARGIN * 2;

const COL_W = [1400, 2000, 2200, 5798, 2000];

function cell(
  children: Paragraph[],
  opts: {
    width?: number;
    rowSpan?: number;
    columnSpan?: number;
    shading?: typeof GRAY_SHADING;
    verticalAlign?: any;
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
        size: opts.size ?? 24,
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

type UnifiedEntry =
  | { kind: "ks"; date: string; bk: BookingKSDisplay }
  | { kind: "tau"; date: string; tau: TauNgayDisplayRow };

export async function exportBookingWord(
  tenDoan: string,
  selectedBookings: BookingKSDisplay[],
  tauRows: TauNgayDisplayRow[] = [],
  soKhach?: number
) {
  // Build unified entry list
  const allEntries: UnifiedEntry[] = [];
  for (const bk of selectedBookings) {
    const dates = bk.ngay_dates.length > 0 ? bk.ngay_dates : [""];
    for (const d of dates) allEntries.push({ kind: "ks", date: d, bk });
  }
  for (const tau of tauRows) {
    allEntries.push({ kind: "tau", date: tau.ngay_date ?? "", tau });
  }

  // Sort: by date asc; within same date: tau trưa → tau tối → hotel
  allEntries.sort((a, b) => {
    if (a.date !== b.date) return a.date.localeCompare(b.date);
    if (a.kind !== b.kind) return a.kind === "tau" ? -1 : 1;
    if (a.kind === "tau" && b.kind === "tau")
      return a.tau.bua_an === "trua" ? -1 : 1;
    return 0;
  });

  const totalRowCount = allEntries.length * 3;

  // ── Build table rows ──
  const rows: TableRow[] = [];

  // 圖號 row
  rows.push(new TableRow({
    children: [
      cell([p("圖號", { bold: true, size: 26 })], { width: COL_W[0], shading: GRAY_SHADING }),
      cell([p(tenDoan, { bold: true, size: 26 })], { width: COL_W[1] + COL_W[2] + COL_W[3] + COL_W[4], columnSpan: 4 }),
    ],
  }));

  // Header row
  rows.push(new TableRow({
    children: [
      cell([p("")], { width: COL_W[0], shading: GRAY_SHADING }),
      cell([p("入住日", { bold: true, size: 24 })], { width: COL_W[1], shading: GRAY_SHADING }),
      cell([p("地點", { bold: true, size: 24 })], { width: COL_W[2], shading: GRAY_SHADING }),
      cell([p("飯店/網址", { bold: true, size: 24 })], { width: COL_W[3], shading: GRAY_SHADING }),
      cell([p("TEL", { bold: true, size: 24 })], { width: COL_W[4], shading: GRAY_SHADING }),
    ],
  }));

  // Data rows — grouped by date so date+location cells merge across all entries on same date
  let globalEntryIdx = 0;
  let dateGroupStart = 0;

  while (dateGroupStart < allEntries.length) {
    const date = allEntries[dateGroupStart].date;

    // Collect all entries with this date
    let groupEnd = dateGroupStart;
    while (groupEnd < allEntries.length && allEntries[groupEnd].date === date) {
      groupEnd++;
    }
    const groupEntries = allEntries.slice(dateGroupStart, groupEnd);
    const groupRowCount = groupEntries.length * 3;

    // Use hotel's 地點 for the whole date group
    const hotelInGroup = groupEntries.find((e): e is Extract<UnifiedEntry, { kind: "ks" }> => e.kind === "ks");
    const diaDiem = hotelInGroup
      ? (hotelInGroup.bk.khach_san_dia_diem_zh || hotelInGroup.bk.khach_san_dia_diem || "")
      : "";

    for (let gi = 0; gi < groupEntries.length; gi++) {
      const entry = groupEntries[gi];
      const rowAChildren: TableCell[] = [];

      // HOTEL label — horizontal, spans ALL rows (first entry overall only)
      if (globalEntryIdx === 0) {
        rowAChildren.push(cell([p("HOTEL", { bold: true, size: 26 })], {
          width: COL_W[0],
          rowSpan: totalRowCount,
        }));
      }

      // Date + 地點 cells — only first entry in date group, span all group rows
      if (gi === 0) {
        rowAChildren.push(cell(
          [new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [new TextRun({ text: date ? formatDateMD(date) : "", font: "Arial", size: 24 })],
          })],
          { width: COL_W[1], rowSpan: groupRowCount }
        ));
        rowAChildren.push(cell([p(diaDiem, { size: 24 })], { width: COL_W[2], rowSpan: groupRowCount }));
      }

      if (entry.kind === "ks") {
        const { bk } = entry;
        const roomInfo = bk.ks_final || bk.ks_dat_truoc || "";
        rowAChildren.push(cell([p(bk.khach_san_ten, { bold: true, size: 26 })], { width: COL_W[3], borders: DETAIL_TOP }));
        rowAChildren.push(cell([p(bk.khach_san_so_dien_thoai || "", { size: 24 })], { width: COL_W[4], rowSpan: 3 }));
        rows.push(new TableRow({ children: rowAChildren }));
        rows.push(new TableRow({ children: [cell([p(roomInfo, { bold: true, size: 28, color: "FF0000" })], { width: COL_W[3], borders: DETAIL_MIDDLE })] }));
        rows.push(new TableRow({ children: [cell([p(bk.khach_san_website || "", { italic: true, size: 22, color: "0563C1" })], { width: COL_W[3], borders: DETAIL_BOTTOM })] }));
      } else {
        const { tau } = entry;
        const bua = tau.bua_an === "trua" ? "午餐" : "晚餐";
        const rowBText = soKhach ? `日遊船 ${bua}：${soKhach} pax` : (tau.set_menu_ten || bua);
        const rowCText = tau.nha_hang_website || "";
        rowAChildren.push(cell([p(tau.nha_hang_ten, { bold: true, size: 26 })], { width: COL_W[3], borders: DETAIL_TOP }));
        rowAChildren.push(cell([p(tau.nha_hang_email || "", { size: 22, italic: true })], { width: COL_W[4], rowSpan: 3 }));
        rows.push(new TableRow({ children: rowAChildren }));
        rows.push(new TableRow({ children: [cell([p(rowBText, { bold: true, size: 28, color: "FF0000" })], { width: COL_W[3], borders: DETAIL_MIDDLE })] }));
        rows.push(new TableRow({ children: [cell([p(rowCText, { italic: true, size: 22, color: "0563C1" })], { width: COL_W[3], borders: DETAIL_BOTTOM })] }));
      }

      globalEntryIdx++;
    }

    dateGroupStart = groupEnd;
  }

  // TOTAL row — hotel bookings only
  const seenIds = new Set<number>();
  const allFinals = allEntries
    .filter((e): e is Extract<UnifiedEntry, { kind: "ks" }> => e.kind === "ks")
    .filter(({ bk }) => { if (seenIds.has(bk.id)) return false; seenIds.add(bk.id); return true; })
    .map(({ bk }) => bk.ks_final || bk.ks_dat_truoc || "")
    .filter(Boolean);

  rows.push(new TableRow({
    children: [
      cell([p("TOTAL:", { bold: true, size: 26 })], { width: COL_W[0] + COL_W[1], columnSpan: 2, shading: GRAY_SHADING }),
      cell([p(allFinals.join(", "), { bold: true, size: 26, color: "FF0000" })], { width: COL_W[2] + COL_W[3] + COL_W[4], columnSpan: 3, shading: GRAY_SHADING }),
    ],
  }));

  rows.push(new TableRow({
    children: [
      cell([p("D/L:", { bold: true, size: 26 })], { width: COL_W[0] + COL_W[1], columnSpan: 2, shading: GRAY_SHADING }),
      cell([p("")], { width: COL_W[2] + COL_W[3] + COL_W[4], columnSpan: 3, shading: GRAY_SHADING }),
    ],
  }));

  const table = new Table({
    width: { size: CONTENT_W, type: WidthType.DXA },
    columnWidths: COL_W,
    rows,
  });

  const doc = new Document({
    sections: [{
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
          children: [new TextRun({ text: "S8 TRAVEL LTD.  雙發旅遊", font: "Arial", size: 28, bold: true })],
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 200 },
          children: [new TextRun({ text: "訂房確認單", font: "Arial", size: 40, bold: true })],
        }),
        table,
        new Paragraph({
          alignment: AlignmentType.LEFT,
          spacing: { before: 200 },
          children: [new TextRun({
            text: "飯店一經FINAL（包含給名單及正確房數）後取消，請注意各飯店的不同產生不同取消費用，屆時請見諒！！",
            font: "Arial",
            size: 20,
            italics: true,
          })],
        }),
      ],
    }],
  });

  const blob = await Packer.toBlob(doc);
  saveAs(blob, `${tenDoan}_訂房確認單.docx`);
}
