// Xuất Excel tổng hợp 1 cụm "NCC × tháng" ở trang Thanh toán định kỳ:
// đoàn nào dùng bao nhiêu, bao nhiêu khách.
//
// RÀNG BUỘC QUAN TRỌNG: số tiền phải KHỚP TUYỆT ĐỐI với header card
// (ThanhToanDinhKyPage → groupedByNccMonth). Vì thế 3 công thức dưới đây phải
// mirror đúng chỗ đó — lệch một cái là kế toán đối chiếu ra 2 số khác nhau:
//   tt     = thanh_tien_thuc_te ?? thanh_tien          (NET, ưu tiên số điều chỉnh)
//   đã TT  = Σ so_tien_da_tt                            (đã TRẢ)
//   còn    = Σ max(0, tt − so_tien_da_dntt)             (còn cần ĐỀ NGHỊ — theo đã
//            đề nghị, KHÔNG phải đã trả; nếu dùng so_tien_da_tt thì phần đã đề nghị
//            chưa trả sẽ bị gộp lại → đề nghị trùng / trả dư cho NCC)

import { format, parseISO } from "date-fns";
import { downloadXlsx, type XlsxCell } from "@/lib/xlsx-simple";

/** Chỉ các field export cần — khớp DinhKyChiPhiRow của use-thanh-toan-dinh-ky. */
export interface DinhKyExportRow {
  doan_id: number;
  ten_doan: string | null;
  ngay_kh_di: string | null;
  so_khach: number;
  mo_ta: string | null;
  danh_muc: string;
  thanh_tien: number;
  thanh_tien_thuc_te: number | null;
  so_tien_da_tt: number;
  so_tien_da_dntt: number;
}

/** 1 dòng Excel = 1 đoàn (đã gom mọi chi phí của đoàn đó trong cụm). */
export interface DinhKyDoanSummary {
  doanId: number;
  tenDoan: string;
  ngayKhDi: string | null;
  soKhach: number;
  noiDung: string;
  soTien: number;
  daTT: number;
  conLai: number;
}

const netOf = (r: DinhKyExportRow) => r.thanh_tien_thuc_te ?? r.thanh_tien;

/**
 * Gom chi phí theo đoàn + cộng tiền. Pure → test được, và là nơi DUY NHẤT giữ
 * công thức tiền của bản Excel (xem ràng buộc ở đầu file).
 * Sắp xếp: ngày khởi hành ASC → doan_id (mirror thứ tự hiển thị trên card).
 */
export function buildDinhKyDoanSummaries(rows: DinhKyExportRow[]): DinhKyDoanSummary[] {
  const map = new Map<number, DinhKyDoanSummary & { moTaSet: Set<string> }>();

  for (const r of rows) {
    let s = map.get(r.doan_id);
    if (!s) {
      s = {
        doanId: r.doan_id,
        tenDoan: r.ten_doan ?? `Đoàn #${r.doan_id}`,
        ngayKhDi: r.ngay_kh_di,
        soKhach: r.so_khach,
        noiDung: "",
        soTien: 0,
        daTT: 0,
        conLai: 0,
        moTaSet: new Set<string>(),
      };
      map.set(r.doan_id, s);
    }
    const tt = netOf(r);
    s.soTien += tt;
    s.daTT += r.so_tien_da_tt;
    s.conLai += Math.max(0, tt - r.so_tien_da_dntt);
    const label = (r.mo_ta ?? "").trim() || r.danh_muc;
    if (label) s.moTaSet.add(label);
  }

  return [...map.values()]
    .map(({ moTaSet, ...s }) => ({ ...s, noiDung: [...moTaSet].join(", ") }))
    .sort((a, b) =>
      (a.ngayKhDi || "9999-12-31").localeCompare(b.ngayKhDi || "9999-12-31") || a.doanId - b.doanId,
    );
}

export interface DinhKyTotals {
  soDoan: number;
  soKhach: number;
  soTien: number;
  daTT: number;
  conLai: number;
}

/** Tổng cuối bảng — cộng từ summary để KHÔNG thể lệch với các dòng ở trên. */
export function sumDinhKyTotals(items: DinhKyDoanSummary[]): DinhKyTotals {
  return items.reduce<DinhKyTotals>(
    (acc, s) => ({
      soDoan: acc.soDoan + 1,
      soKhach: acc.soKhach + s.soKhach,
      soTien: acc.soTien + s.soTien,
      daTT: acc.daTT + s.daTT,
      conLai: acc.conLai + s.conLai,
    }),
    { soDoan: 0, soKhach: 0, soTien: 0, daTT: 0, conLai: 0 },
  );
}

export const DINH_KY_HEADERS = [
  "STT", "Mã đoàn", "Ngày khởi hành", "Số khách", "Nội dung", "Số tiền", "Đã TT", "Còn lại",
] as const;

function fmtDate(d?: string | null): string {
  if (!d) return "";
  try { return format(parseISO(d), "dd/MM/yyyy"); } catch { return d; }
}

/** Ký tự cấm trong tên file Windows/macOS. */
function safeFileName(s: string): string {
  return s.replace(/[\\/:*?"<>|]/g, "-").replace(/\s+/g, "_");
}

export interface ExportDinhKyParams {
  rows: DinhKyExportRow[];
  nccTen: string;
  /** Nhãn tháng hiển thị, vd "Tháng 6/2026". */
  monthLabel: string;
}

export function exportDinhKyExcel({ rows, nccTen, monthLabel }: ExportDinhKyParams): void {
  const items = buildDinhKyDoanSummaries(rows);
  const totals = sumDinhKyTotals(items);

  const COLS = DINH_KY_HEADERS.length;
  const sheetRows: XlsxCell[][] = [
    [{ value: `TỔNG HỢP ĐỊNH KỲ — ${nccTen} — ${monthLabel}`, style: "title", colSpan: COLS }],
    DINH_KY_HEADERS.map((h): XlsxCell => ({ value: h, style: "header" })),
    ...items.map((s, i): XlsxCell[] => [
      { value: i + 1, style: "number" },
      { value: s.tenDoan, style: "text" },
      { value: fmtDate(s.ngayKhDi), style: "text" },
      { value: s.soKhach, style: "number" },
      { value: s.noiDung, style: "text" },
      { value: s.soTien, style: "number" },
      { value: s.daTT, style: "number" },
      { value: s.conLai, style: "number" },
    ]),
    [
      { value: `TỔNG (${totals.soDoan} đoàn)`, style: "total", colSpan: 3 },
      { value: totals.soKhach, style: "total_number" },
      { value: "", style: "total" },
      { value: totals.soTien, style: "total_number" },
      { value: totals.daTT, style: "total_number" },
      { value: totals.conLai, style: "total_number" },
    ],
  ];

  downloadXlsx(
    { name: monthLabel, columns: [6, 26, 15, 10, 40, 16, 16, 16], rows: sheetRows, freezeRows: 2 },
    `dinh_ky_${safeFileName(nccTen)}_${safeFileName(monthLabel)}.xlsx`,
  );
}
