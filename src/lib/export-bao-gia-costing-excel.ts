// Xuất Excel BẢNG TÍNH GIÁ của 1 báo giá — song ngữ Việt / 中文, CÓ CÔNG THỨC.
//
// Nguồn số liệu DUY NHẤT là `CostingSheet` do `costingSheet(draft)` dựng sẵn (cùng
// đúng thứ đang hiển thị trên màn hình): nhóm Xe/KS/Ăn/Vé × nhiều cỡ đoàn, cộng
// nhóm, và footer (tổng vốn → lợi nhuận → giá bán/khách). File này KHÔNG tính lại
// gì cả — tính lại là mở đường cho Excel lệch số với app.
//
// CÔNG THỨC (thêm 08/2026): ô tiền xuất ra dạng `<f>` + giá trị cache, để cấp trên
// mở file sửa đơn giá / số lượng / tỷ giá / lợi nhuận thì cả bảng tự chạy lại.
// Nguyên tắc bất di bất dịch: **chỉ gắn công thức khi nó tái tạo ĐÚNG con số app
// đã tính** (`fx()` tự đối chiếu, lệch thì rơi về ô số tĩnh). Nếu không, mở file
// ra thấy một đằng, gõ một phím lại nhảy sang một nẻo.
//
// Tiếng Trung: tiêu đề cột / nhãn nhóm / nhãn footer đều kèm 中文; tên dịch vụ có
// cột 中文名稱 riêng lấy từ `ten_zh` (bản gốc AI trích từ lịch trình tiếng Trung).

import type {
  CostingSheet, CostingRow, CostingUnit, CostingFooterRow,
} from "@/components/bao-gia/detail/helpers";
import { columnName, downloadXlsx, type XlsxCell, type XlsxSheet, type XlsxStyle } from "@/lib/xlsx-simple";

/** Thông tin đầu file (lấy từ BaoGiaRow — truyền vào để lib không phụ thuộc hook). */
export interface CostingExcelMeta {
  tenChuongTrinh: string;
  maBg?: string | null;
  soNgay: number;
  ngayDi?: string | null;
  ngayVe?: string | null;
  profitUsd?: number | null;
  agentTen?: string | null;
  /** Tỷ giá bán VCB — chỉ dùng cho dòng biên lợi nhuận (chênh lệch tỷ giá). */
  vcbRate?: number | null;
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

const txt = (value: string | number, colSpan = 1): XlsxCell => ({ value, style: "text", colSpan });
const head = (value: string, colSpan = 1): XlsxCell => ({ value, style: "header", colSpan });
const num = (value: number, colSpan = 1): XlsxCell => ({ value, style: "number", colSpan });
const num2 = (value: number, colSpan = 1): XlsxCell => ({ value, style: "number2", colSpan });
const tot = (value: string, colSpan = 1): XlsxCell => ({ value, style: "total", colSpan });
const totNum = (value: number, colSpan = 1): XlsxCell => ({ value, style: "total_number", colSpan });

/** Ô công thức — CHỈ gắn `<f>` khi công thức tính ra đúng con số app đưa sang.
 *  Lệch (do app đổi cách tính mà file này chưa theo kịp) → giữ ô số tĩnh, thà
 *  mất tính năng sửa còn hơn hiện sai tiền. */
function fx(value: number, formula: string, evaluated: number, style: XlsxStyle, eps = 0): XlsxCell {
  const khop = Number.isFinite(evaluated) && Math.abs(evaluated - value) <= eps;
  return khop ? { value, style, formula } : { value, style };
}

/** Nhãn ngày của 1 dòng: D3 / D3·Trưa. Dòng lump (xe, phụ thu) không gắn ngày. */
function dayLabel(r: CostingRow): string {
  if (r.ngay_so <= 0) return "";
  const bua = r.bua_an === "trua" ? "·Trưa 午" : r.bua_an === "toi" ? "·Tối 晚" : "";
  return `D${r.ngay_so}${bua}`;
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

// Cột cố định (1-based) mà công thức trỏ tới.
const COL_PARAM = columnName(3);
const COL_DG_VND = columnName(6);
const COL_N = columnName(7);
/** Cột "SL" và "Thành tiền" của bậc thứ `ti`. */
const colSL = (ti: number) => columnName(FIXED_COLS + ti * 2 + 1);
const colTien = (ti: number) => columnName(FIXED_COLS + ti * 2 + 2);

/** Địa chỉ tuyệt đối của các ô THAM SỐ để footer trỏ vào ($C$7…). */
interface ParamRefs {
  xr: string;
  profit: string;
  soNgay: string;
  vcb?: string;
  hdv?: string;
  baoHiem?: string;
  tip?: string;
}

/** Đơn giá gốc của 3 dòng chi phí cố định — suy ngược từ footer để ô tham số
 *  luôn khớp con số app, kể cả khi hằng số trong app đổi. `undefined` = không
 *  suy được (footer thiếu dòng, hoặc các bậc không cùng một đơn giá) → giữ số tĩnh. */
function derivedUnitCost(
  values: number[] | undefined,
  divisors: number[],
): number | undefined {
  if (!values || values.length === 0 || values.length !== divisors.length) return undefined;
  if (divisors.some((d) => !d || d <= 0)) return undefined;
  const unit = values[0] / divisors[0];
  if (!Number.isFinite(unit)) return undefined;
  return values.every((v, i) => unit * divisors[i] === v) ? unit : undefined;
}

/** Dựng sheet Excel bảng tính giá. Thuần dữ liệu → test được, không cần DOM. */
export function buildCostingXlsxSheet(sheet: CostingSheet, meta: CostingExcelMeta): XlsxSheet {
  const nTier = sheet.configs.length;
  const totalCols = FIXED_COLS + nTier * 2;
  const rows: XlsxCell[][] = [];
  /** Số dòng (1-based) của dòng SẮP được push. */
  const nextRow = () => rows.length + 1;

  const footerOf = (key: string) => sheet.footer.find((f) => f.key === key);
  const soNgay = meta.soNgay > 0 ? meta.soNgay : 0;
  const hdvPerDay = derivedUnitCost(footerOf("hdv")?.values, sheet.configs.map(() => soNgay));
  const bhPerPax = derivedUnitCost(footerOf("bao_hiem")?.values, sheet.configs.map((c) => c.pax));
  const tipTotal = derivedUnitCost(footerOf("tip")?.values, sheet.configs.map(() => 1));

  // ── Đầu file ──
  // Dải cảnh báo NỘI BỘ: file này có khối THAM SỐ (tỷ giá, lợi nhuận/khách,
  // HDV/ngày, bảo hiểm/khách, tip/đoàn) + công thức sống → người nhận tự bấm
  // lại được giá vốn theo từng bậc khách. Gửi nhầm là mất sạch biên lợi nhuận.
  // Địa chỉ ô trong công thức tính động qua nextRow() nên thêm dòng này KHÔNG
  // làm lệch công thức; freezeRows cũng lấy theo rows.length.
  rows.push([{
    value: "TÀI LIỆU NỘI BỘ — KHÔNG GỬI ĐỐI TÁC / KHÁCH HÀNG · 內部文件，請勿外傳",
    style: "warn",
    colSpan: totalCols,
  }]);
  rows.push([{ value: "BẢNG TÍNH GIÁ TOUR · 旅遊報價計算表", style: "title", colSpan: totalCols }]);
  const info = (label: string, value: string) =>
    rows.push([tot(label, 2), txt(value, totalCols - 2)]);
  info("Chương trình 行程", meta.tenChuongTrinh || "—");
  if (meta.maBg) info("Mã báo giá 報價編號", meta.maBg);
  if (meta.ngayDi || meta.ngayVe) info("Ngày đi – về 出發－回程", `${meta.ngayDi || "—"} → ${meta.ngayVe || "—"}`);
  if (meta.agentTen) info("Đối tác 客戶", meta.agentTen);

  // ── Khối THAM SỐ: sửa các ô này thì cả bảng dưới tự tính lại ──
  rows.push([tot("THAM SỐ 參數 — sửa ô giữa, cả bảng tự tính lại", totalCols)]);
  const param = (label: string, cell: XlsxCell, note: string): string => {
    const ref = `$${COL_PARAM}$${nextRow()}`;
    rows.push([tot(label, 2), cell, txt(note, totalCols - 3)]);
    return ref;
  };
  const refs: ParamRefs = {
    xr: param("Tỷ giá 匯率", num(sheet.xr), "VND / 1 USD"),
    profit: param("Lợi nhuận 利潤", num2(meta.profitUsd ?? 0), "USD / khách 每人"),
    soNgay: param("Số ngày 天數", num(meta.soNgay), "ngày 天"),
  };
  if ((meta.vcbRate ?? 0) > 0) {
    refs.vcb = param("Tỷ giá VCB 銀行匯率", num(meta.vcbRate!), "chỉ dùng cho biên lợi nhuận 僅用於利潤率");
  }
  if (hdvPerDay != null) refs.hdv = param("HDV / ngày 導遊每天", num(hdvPerDay), "VND");
  if (bhPerPax != null) refs.baoHiem = param("Bảo hiểm / khách 保險每人", num(bhPerPax), "VND");
  if (tipTotal != null) refs.tip = param("Tip / đoàn 小費", num(tipTotal), "VND");
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
  const subtotalRowOf = new Map<CostingSheet["groups"][number]["key"], number>();
  for (const g of sheet.groups) {
    rows.push([tot(`${g.label.toUpperCase()} ${GROUP_ZH[g.key]}`, totalCols)]);
    if (g.rows.length === 0) {
      rows.push([txt("(chưa có 無)", totalCols)]);
    }
    const firstRow = nextRow();
    for (const r of g.rows) {
      const rn = nextRow();
      // Cột SL của dòng lump là "—" → công thức tiền chỉ nhân ĐG × N.
      const tienFormula = (ti: number) =>
        r.unit === "lump"
          ? `${COL_DG_VND}${rn}*${COL_N}${rn}`
          : `${COL_DG_VND}${rn}*${COL_N}${rn}*${colSL(ti)}${rn}`;
      rows.push([
        txt(dayLabel(r)),
        txt(r.mo_ta || "—"),
        txt(r.ten_zh || ""),
        txt(UNIT_LABEL[r.unit]),
        fx(r.don_gia_usd, `${COL_DG_VND}${rn}/${refs.xr}`,
          sheet.xr > 0 ? r.don_gia / sheet.xr : NaN, "number2", 1e-9),
        num(r.don_gia),
        num(r.so_luong),
        txt(focLabel(r)),
        ...r.cells.flatMap((c, ti) => {
          const eff = Math.max(0, c.qty - c.foc);
          return [
            r.unit === "lump" ? txt("—") : num(eff),
            fx(c.total, tienFormula(ti),
              r.don_gia * r.so_luong * (r.unit === "lump" ? 1 : eff), "number"),
          ];
        }),
      ]);
    }
    const lastRow = rows.length; // dòng dữ liệu cuối cùng vừa push
    subtotalRowOf.set(g.key, nextRow());
    rows.push([
      tot(`Cộng ${g.label.toLowerCase()} ${GROUP_ZH[g.key]}小計`, FIXED_COLS),
      // Cột "SL" để trống → cột "Thành tiền" thành 1 cột số liền mạch, Excel sum được.
      ...g.subtotals.flatMap((s, ti) => [
        tot(""),
        g.rows.length === 0
          ? totNum(s)
          : fx(s, `SUM(${colTien(ti)}${firstRow}:${colTien(ti)}${lastRow})`,
            g.rows.reduce((acc, r) => acc + r.cells[ti].total, 0), "total_number"),
      ]),
    ]);
  }

  // ── Footer: tổng vốn → lợi nhuận → giá bán ──
  rows.push([txt("")]);
  const footerRowOf = new Map<string, number>();
  const costKeys: string[] = [];

  /** Ô giá trị của 1 dòng footer ở bậc `ti` — gắn công thức khi đủ ô phụ thuộc. */
  const footerCell = (key: string, kind: CostingFooterRow["kind"], v: number, ti: number): XlsxCell => {
    const cfg = sheet.configs[ti];
    const col = colTien(ti);
    const at = (k: string) => {
      const rn = footerRowOf.get(k);
      return rn ? `${col}${rn}` : null;
    };
    // Tổng doanh thu = tổng vốn + lợi nhuận (app không in ra dòng riêng).
    const tvRef = at("tong_von"), lnRef = at("loi_nhuan");
    const banRef = tvRef && lnRef ? `(${tvRef}+${lnRef})` : null;
    const tvVal = footerOf("tong_von")?.values[ti] ?? 0;
    const lnVal = footerOf("loi_nhuan")?.values[ti] ?? 0;
    const banVal = tvVal + lnVal;

    switch (key) {
      case "dich_vu": {
        const parts = sheet.groups.map((g) => subtotalRowOf.get(g.key)).filter((r): r is number => r != null);
        if (parts.length !== sheet.groups.length || parts.length === 0) break;
        return fx(v, parts.map((r) => `${col}${r}`).join("+"),
          sheet.groups.reduce((s, g) => s + g.subtotals[ti], 0), "total_number");
      }
      case "hdv":
        if (!refs.hdv || hdvPerDay == null) break;
        return fx(v, `${refs.hdv}*${refs.soNgay}`, hdvPerDay * soNgay, "total_number");
      case "bao_hiem":
        if (!refs.baoHiem || bhPerPax == null) break;
        return fx(v, `${refs.baoHiem}*${cfg.pax}`, bhPerPax * cfg.pax, "total_number");
      case "tip":
        if (!refs.tip || tipTotal == null) break;
        return fx(v, `${refs.tip}`, tipTotal, "total_number");
      case "tong_von": {
        const parts = costKeys.map((k) => at(k)).filter((r): r is string => r != null);
        if (parts.length !== costKeys.length || parts.length === 0) break;
        return fx(v, parts.join("+"),
          costKeys.reduce((s, k) => s + (footerOf(k)?.values[ti] ?? 0), 0), "total_number");
      }
      case "loi_nhuan":
        return fx(v, `ROUND(${refs.profit}*${refs.xr}*${cfg.guests},0)`,
          Math.round((meta.profitUsd ?? 0) * sheet.xr * cfg.guests), "total_number");
      case "gia_pax": {
        if (!banRef || cfg.guests <= 0) break;
        return fx(v, `ROUND(${banRef}/${cfg.guests},0)`,
          Math.round(banVal / cfg.guests), "total_number");
      }
      case "usd_pax": {
        const gpRef = at("gia_pax");
        const gpVal = footerOf("gia_pax")?.values[ti];
        if (!gpRef || gpVal == null || sheet.xr <= 0) break;
        return fx(v, `${gpRef}/${refs.xr}`, gpVal / sheet.xr, "total_number2", 1e-9);
      }
      case "bien": {
        if (!banRef || !lnRef) break;
        const chenhF = refs.vcb ? `+ROUND(${banRef}*(${refs.vcb}-${refs.xr})/${refs.xr},0)` : "";
        const chenhV = refs.vcb && sheet.xr > 0
          ? Math.round(banVal * ((meta.vcbRate ?? 0) - sheet.xr) / sheet.xr)
          : 0;
        return fx(v, `IF(${banRef}=0,0,(${lnRef}${chenhF})/${banRef}*100)`,
          banVal > 0 ? (lnVal + chenhV) / banVal * 100 : 0, "total_pct", 1e-9);
      }
    }
    // Không gắn được công thức → giữ nguyên kiểu hiển thị cũ.
    if (kind === "usd") return { value: v, style: "total_number2" };
    if (kind === "pct") return { value: v, style: "total_pct" };
    return totNum(v);
  };

  for (const f of sheet.footer) {
    const zh = FOOTER_ZH[f.key] ?? "";
    const label = zh ? `${f.label} ${zh}` : f.label;
    const rn = nextRow();
    footerRowOf.set(f.key, rn);
    rows.push([
      tot(label, FIXED_COLS),
      ...f.values.flatMap((v, ti) => [tot(""), footerCell(f.key, f.kind, v, ti)]),
    ]);
    // Đẩy vào costKeys SAU khi dựng ô, để dòng "tổng vốn" chỉ cộng các dòng
    // chi phí đứng TRƯỚC nó (đúng thứ tự app tính), không tự cộng chính mình.
    if (f.kind === "cost") costKeys.push(f.key);
  }

  rows.push([txt("")]);
  rows.push([txt(
    "Ghi chú 備註: Ô nền xám và ô tiền đều là CÔNG THỨC — sửa THAM SỐ hoặc ĐG/N/SL thì cả bảng tự tính lại. "
    + "N = số đêm (khách sạn) / số lần (ăn, vé) 次數. "
    + "FOC = suất miễn phí 免費名額 (vd 16免1); cột SL là số suất ĐÃ TRỪ suất miễn. "
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
  // Tiền tố NOIBO_ để không lẫn với file gửi đối tác trong thư mục Downloads.
  return `NOIBO_Bang-tinh-gia_${safe}_${d}.xlsx`;
}

/** Dựng + tải file .xlsx bảng tính giá. */
export function exportBaoGiaCostingExcel(sheet: CostingSheet, meta: CostingExcelMeta): void {
  downloadXlsx(buildCostingXlsxSheet(sheet, meta), costingFileName(meta));
}
