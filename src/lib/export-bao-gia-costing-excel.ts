// Xuất Excel BẢNG TÍNH GIÁ của 1 báo giá — song ngữ Việt / 中文.
//
// Nguồn số liệu DUY NHẤT là `CostingSheet` do `costingSheet(draft)` dựng sẵn (cùng
// đúng thứ đang hiển thị trên màn hình): nhóm Xe/KS/Ăn/Vé × nhiều cỡ đoàn, cộng
// nhóm, và footer (tổng vốn → lợi nhuận → giá bán/khách). File này KHÔNG tính lại
// gì cả — tính lại là mở đường cho Excel lệch số với app.
//
// Tiếng Trung: tiêu đề cột / nhãn nhóm / nhãn footer đều kèm 中文; tên dịch vụ có
// cột 中文名稱 riêng lấy từ `ten_zh` (bản gốc AI trích từ lịch trình tiếng Trung).

import type { CostingSheet, CostingRow, CostingUnit } from "@/components/bao-gia/detail/helpers";
import { downloadXlsx, type XlsxCell, type XlsxSheet } from "@/lib/xlsx-simple";

/** Thông tin đầu file (lấy từ BaoGiaRow — truyền vào để lib không phụ thuộc hook). */
export interface CostingExcelMeta {
  tenChuongTrinh: string;
  maBg?: string | null;
  soNgay: number;
  ngayDi?: string | null;
  ngayVe?: string | null;
  profitUsd?: number | null;
  agentTen?: string | null;
}

const GROUP_ZH: Record<CostingSheet["groups"][number]["key"], string> = {
  transport: "交通",
  hotel: "飯店",
  meal: "餐食",
  ticket: "景點門票",
};

const UNIT_LABEL: Record<CostingUnit, string> = {
  rooms: "Phòng 房",
  pax: "Khách 人",
  lump: "Trọn gói 總價",
};

/** Nhãn song ngữ cho từng dòng footer (key khớp costingSheet). */
const FOOTER_ZH: Record<string, string> = {
  dich_vu: "服務小計",
  hdv: "導遊",
  bao_hiem: "保險",
  tip: "小費",
  tong_von: "總成本",
  loi_nhuan: "利潤",
  gia_pax: "每人售價",
  usd_pax: "每人美金",
  bien: "利潤率",
};

const fmtVnd = (n: number) => Math.round(Number(n) || 0).toLocaleString("vi-VN");
const fmtUsd = (n: number) => (Number(n) || 0).toFixed(2);

const txt = (value: string | number, colSpan = 1): XlsxCell => ({ value, style: "text", colSpan });
const head = (value: string, colSpan = 1): XlsxCell => ({ value, style: "header", colSpan });
const num = (value: number, colSpan = 1): XlsxCell => ({ value, style: "number", colSpan });
const tot = (value: string, colSpan = 1): XlsxCell => ({ value, style: "total", colSpan });
const totNum = (value: number, colSpan = 1): XlsxCell => ({ value, style: "total_number", colSpan });

/** Nhãn ngày của 1 dòng: D3 / D3·Trưa. Dòng lump (xe, phụ thu) không gắn ngày. */
function dayLabel(r: CostingRow): string {
  if (r.ngay_so <= 0) return "";
  const bua = r.bua_an === "trua" ? "·Trưa 午" : r.bua_an === "toi" ? "·Tối 晚" : "";
  return `D${r.ngay_so}${bua}`;
}

/** Ô "SL" của 1 bậc: lump không có số lượng; có FOC thì ghi rõ "17−1" để người
 *  đọc thấy đã trừ suất miễn, khớp đúng bảng trên màn hình. */
function slCell(r: CostingRow, cell: { qty: number; foc: number }): XlsxCell {
  if (r.unit === "lump") return txt("—");
  if (cell.foc > 0) return txt(`${cell.qty}−${cell.foc}`);
  return num(cell.qty);
}

/** FOC hiển thị: số nhập tay (ghi đè) hoặc chính sách "16免1" hoặc trống. */
function focLabel(r: CostingRow): string {
  if (r.foc_manual != null) return String(r.foc_manual);
  if (r.foc_khach) return `${r.foc_khach}免${r.foc_mien ?? 0}`;
  return "";
}

const FIXED_COLS = 8;
const FIXED_WIDTHS = [9, 30, 24, 12, 11, 14, 6, 10];
const TIER_WIDTHS = [10, 15];

/** Dựng sheet Excel bảng tính giá. Thuần dữ liệu → test được, không cần DOM. */
export function buildCostingXlsxSheet(sheet: CostingSheet, meta: CostingExcelMeta): XlsxSheet {
  const nTier = sheet.configs.length;
  const totalCols = FIXED_COLS + nTier * 2;
  const rows: XlsxCell[][] = [];

  // ── Đầu file ──
  rows.push([{ value: "BẢNG TÍNH GIÁ TOUR · 旅遊報價計算表", style: "title", colSpan: totalCols }]);
  const info = (label: string, value: string) =>
    rows.push([tot(label, 2), txt(value, totalCols - 2)]);
  info("Chương trình 行程", meta.tenChuongTrinh || "—");
  if (meta.maBg) info("Mã báo giá 報價編號", meta.maBg);
  info("Số ngày 天數", `${meta.soNgay} ngày 天`);
  if (meta.ngayDi || meta.ngayVe) info("Ngày đi – về 出發－回程", `${meta.ngayDi || "—"} → ${meta.ngayVe || "—"}`);
  if (meta.agentTen) info("Đối tác 客戶", meta.agentTen);
  info("Tỷ giá 匯率", `1 USD = ${fmtVnd(sheet.xr)} VND`);
  if (meta.profitUsd != null) info("Lợi nhuận 利潤", `${fmtUsd(meta.profitUsd)} USD / khách 每人`);
  rows.push([txt("")]);

  // ── 2 dòng tiêu đề: dải bậc số khách, rồi nhãn từng cột ──
  rows.push([
    head("CHI TIẾT DỊCH VỤ 服務明細", FIXED_COLS),
    ...sheet.configs.flatMap((c) => [head(`${c.guests} khách / ${c.guests}人 (${c.rooms} phòng 房 · ${c.pax} pax)`, 2)]),
  ]);
  rows.push([
    head("Ngày 日期"), head("Hạng mục 項目"), head("中文名稱"), head("ĐVT 單位"),
    head("ĐG USD 單價"), head("ĐG VND 單價"), head("N 次數"), head("FOC 免費"),
    ...sheet.configs.flatMap(() => [head("SL 數量"), head("Thành tiền 金額")]),
  ]);
  const freezeRows = rows.length;

  // ── Từng nhóm: dải tiêu đề → các dòng → cộng nhóm ──
  for (const g of sheet.groups) {
    rows.push([tot(`${g.label.toUpperCase()} ${GROUP_ZH[g.key]}`, totalCols)]);
    if (g.rows.length === 0) {
      rows.push([txt("(chưa có 無)", totalCols)]);
    }
    for (const r of g.rows) {
      rows.push([
        txt(dayLabel(r)),
        txt(r.mo_ta || "—"),
        txt(r.ten_zh || ""),
        txt(UNIT_LABEL[r.unit]),
        txt(fmtUsd(r.don_gia_usd)), // chuỗi: giữ 2 số lẻ, numFmt của file chỉ có #,##0
        num(r.don_gia),
        num(r.so_luong),
        txt(focLabel(r)),
        ...r.cells.flatMap((c) => [slCell(r, c), num(c.total)]),
      ]);
    }
    rows.push([
      tot(`Cộng ${g.label.toLowerCase()} ${GROUP_ZH[g.key]}小計`, FIXED_COLS),
      // Cột "SL" để trống → cột "Thành tiền" thành 1 cột số liền mạch, Excel sum được.
      ...g.subtotals.flatMap((s) => [tot(""), totNum(s)]),
    ]);
  }

  // ── Footer: tổng vốn → lợi nhuận → giá bán ──
  rows.push([txt("")]);
  for (const f of sheet.footer) {
    const zh = FOOTER_ZH[f.key] ?? "";
    const label = zh ? `${f.label} ${zh}` : f.label;
    rows.push([
      tot(label, FIXED_COLS),
      ...f.values.flatMap((v) => [
        tot(""),
        f.kind === "usd" ? tot(fmtUsd(v))
          : f.kind === "pct" ? tot(`${v.toFixed(1)}%`)
          : totNum(v),
      ]),
    ]);
  }

  rows.push([txt("")]);
  rows.push([txt(
    "Ghi chú 備註: N = số đêm (khách sạn) / số lần (ăn, vé) 次數. "
    + "FOC = suất miễn phí 免費名額 (vd 16免1); cột SL ghi dạng «17−1» nghĩa là 17 suất đã trừ 1 suất miễn. "
    + "Giá bán / khách = (tổng chi phí vốn + lợi nhuận) / số khách. 每人售價 =（總成本＋利潤）÷ 人數。",
    totalCols,
  )]);

  return {
    name: "Tính giá 報價計算",
    columns: [...FIXED_WIDTHS, ...sheet.configs.flatMap(() => TIER_WIDTHS)],
    rows,
    freezeRows,
  };
}

/** Tên file an toàn cho Windows/macOS. */
export function costingFileName(meta: CostingExcelMeta, now: Date = new Date()): string {
  const d = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
  const base = [meta.maBg, meta.tenChuongTrinh].filter(Boolean).join("_") || "bao-gia";
  const safe = base.replace(/[\\/:*?"<>|]/g, "-").replace(/\s+/g, " ").trim().slice(0, 80);
  return `Bang-tinh-gia_${safe}_${d}.xlsx`;
}

/** Dựng + tải file .xlsx bảng tính giá. */
export function exportBaoGiaCostingExcel(sheet: CostingSheet, meta: CostingExcelMeta): void {
  downloadXlsx(buildCostingXlsxSheet(sheet, meta), costingFileName(meta));
}
