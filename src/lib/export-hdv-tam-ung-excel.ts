import ExcelJS from "exceljs";
import { saveAs } from "file-saver";
import { docTienBangChu } from "@/lib/so-tien-bang-chu";

export interface ExportHDVTamUngInput {
  maDoan: string;
  tenHdv: string;
  soKhach: number;
  soNgay: number;
  soTien: number;
  /** Nội dung dòng 1 của bảng; mặc định "Tạm ứng đoàn <maDoan> - HDV <tenHdv>". */
  moTa?: string;
  ghiChu?: string;
  /** Người đề nghị (kế toán đang đăng nhập) — in vào "Tôi tên là" + chữ ký. */
  nguoiDeNghi?: string;
  hdv: { ten: string; so_tai_khoan: string | null; ngan_hang: string | null } | null;
  ngayLap?: string;
}

function sanitize(name: string): string {
  return name.replace(/[\\/:*?"<>|]/g, "-").trim();
}

async function loadLogoBuffer(): Promise<ArrayBuffer | null> {
  try {
    const res = await fetch("/logo.jpg");
    if (!res.ok) return null;
    return await res.arrayBuffer();
  } catch {
    return null;
  }
}

const BORDER_THIN: Partial<ExcelJS.Borders> = {
  top: { style: "thin", color: { argb: "FF808080" } },
  bottom: { style: "thin", color: { argb: "FF808080" } },
  left: { style: "thin", color: { argb: "FF808080" } },
  right: { style: "thin", color: { argb: "FF808080" } },
};

const HEADER_FILL: ExcelJS.Fill = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FFE6F1FB" },
};

export async function exportHDVTamUngExcel(input: ExportHDVTamUngInput): Promise<void> {
  const { maDoan, tenHdv, soKhach, soNgay, soTien, hdv } = input;
  const today = input.ngayLap ? new Date(input.ngayLap) : new Date();
  const ngayStr = `Hà Nội, Ngày ${today.getDate()} Tháng ${today.getMonth() + 1} Năm ${today.getFullYear()}`;
  const tenNguoiDeNghi = input.nguoiDeNghi || "";
  const boPhan = "Kế toán";
  const moTa = input.moTa || `Tạm ứng đoàn ${maDoan} - HDV ${tenHdv}`.replace(/\s+/g, " ").trim();
  const numFmt = "#,##0";

  const wb = new ExcelJS.Workbook();
  wb.creator = "S8 Travel CRM";
  wb.created = new Date();

  const ws = wb.addWorksheet("Đề nghị tạm ứng", {
    pageSetup: {
      paperSize: 9, // A4
      orientation: "portrait",
      margins: { left: 0.4, right: 0.4, top: 0.4, bottom: 0.4, header: 0.2, footer: 0.2 },
      horizontalCentered: true,
    },
  });

  // 7 cột A..G. A rộng để chứa nhãn trái (Kính gửi / Người đề nghị / tên ký) +
  // cân với các cột chữ ký; E hẹp lại cho cân tổng thể.
  ws.columns = [
    { width: 15 },  // A: STT + nhãn trái + cột ký "Người đề nghị"
    { width: 22 },  // B: NỘI DUNG (B:E merge)
    { width: 14 },  // C
    { width: 14 },  // D
    { width: 11 },  // E (hẹp lại cho cân)
    { width: 18 },  // F: Số tiền
    { width: 20 },  // G: Ghi chú
  ];

  // ===== Logo =====
  const logoBuf = await loadLogoBuffer();
  if (logoBuf) {
    const imageId = wb.addImage({ buffer: logoBuf, extension: "jpeg" });
    ws.addImage(imageId, { tl: { col: 0.05, row: 0.1 }, ext: { width: 80, height: 80 }, editAs: "oneCell" });
  }
  for (let r = 1; r <= 5; r++) ws.getRow(r).height = 18;

  // ===== Company info (rows 1-5, cols B-F) =====
  const infoLines = [
    { text: "CÔNG TY TNHH DU LỊCH S8", bold: true },
    { text: "Đ/C: Tầng 2, Tòa nhà Kim Sơn, Số 18 Phan Thành Tài, Phường Hòa Cường, Thành Phố Đà Nẵng, Việt Nam", bold: false },
    { text: "TEL: 02366.566.538", bold: false },
    { text: "Email: s8travel.info@gmail.com / nhận hóa đơn: s8travel.hddt@gmail.com", bold: false },
    { text: "MST: 0402021137", bold: false },
  ];
  infoLines.forEach((line, i) => {
    const row = i + 1;
    ws.mergeCells(row, 2, row, 6);
    const cell = ws.getCell(row, 2);
    cell.value = line.text;
    cell.font = { name: "Calibri", size: line.bold ? 11 : 10, bold: line.bold };
    cell.alignment = { vertical: "middle", horizontal: "left" };
  });

  // ===== Form code (row 6) + ngày lập (row 7) — góc phải =====
  const formCodeCell = ws.getCell(6, 7);
  formCodeCell.value = "BM02.1-19/2024/TU-S8";
  formCodeCell.font = { name: "Calibri", size: 10 };
  formCodeCell.alignment = { vertical: "middle", horizontal: "right" };
  const dateCell = ws.getCell(7, 7);
  dateCell.value = ngayStr;
  dateCell.font = { name: "Calibri", size: 10, italic: true };
  dateCell.alignment = { vertical: "middle", horizontal: "right" };

  // ===== Title (row 8) =====
  ws.mergeCells(8, 1, 8, 7);
  const titleCell = ws.getCell(8, 1);
  titleCell.value = "GIẤY ĐỀ NGHỊ TẠM ỨNG";
  titleCell.font = { name: "Calibri", size: 18, bold: true, italic: true };
  titleCell.alignment = { vertical: "middle", horizontal: "center" };
  ws.getRow(8).height = 28;

  // ===== Info rows (9-13) =====
  ws.getCell(9, 1).value = "Kính gửi:";
  ws.getCell(9, 1).font = { name: "Calibri", size: 11, bold: true };
  ws.mergeCells(9, 2, 9, 7);
  ws.getCell(9, 2).value = "Giám đốc công ty TNHH du lịch S8";
  ws.getCell(9, 2).font = { name: "Calibri", size: 11 };

  ws.getCell(10, 1).value = "Tôi tên là:";
  ws.getCell(10, 1).font = { name: "Calibri", size: 11, bold: true };
  ws.mergeCells(10, 2, 10, 7);
  ws.getCell(10, 2).value = tenNguoiDeNghi;
  ws.getCell(10, 2).font = { name: "Calibri", size: 11, bold: true };

  ws.getCell(11, 1).value = "Bộ phận:";
  ws.getCell(11, 1).font = { name: "Calibri", size: 11, bold: true };
  ws.mergeCells(11, 2, 11, 7);
  ws.getCell(11, 2).value = boPhan;
  ws.getCell(11, 2).font = { name: "Calibri", size: 11 };

  // Row 12: Lý do đề nghị | Tạm ứng đoàn | maDoan | Số khách: | soKhach
  ws.getCell(12, 1).value = "Lý do đề nghị:";
  ws.getCell(12, 1).font = { name: "Calibri", size: 11, bold: true };
  ws.getCell(12, 2).value = "Tạm ứng đoàn";
  ws.getCell(12, 2).font = { name: "Calibri", size: 11 };
  ws.mergeCells(12, 3, 12, 4);
  ws.getCell(12, 3).value = maDoan;
  ws.getCell(12, 3).font = { name: "Calibri", size: 11, bold: true };
  ws.getCell(12, 3).alignment = { horizontal: "left" };
  ws.getCell(12, 5).value = "Số khách:";
  ws.getCell(12, 5).font = { name: "Calibri", size: 11, bold: true };
  ws.getCell(12, 5).alignment = { horizontal: "right" };
  ws.getCell(12, 5).border = BORDER_THIN;
  ws.getCell(12, 5).fill = HEADER_FILL;
  ws.mergeCells(12, 6, 12, 7);
  ws.getCell(12, 6).value = soKhach;
  ws.getCell(12, 6).font = { name: "Calibri", size: 11, bold: true };
  ws.getCell(12, 6).alignment = { horizontal: "center" };
  ws.getCell(12, 6).border = BORDER_THIN;
  ws.getCell(12, 6).fill = HEADER_FILL;

  // Row 13: Hướng dẫn viên | tenHdv | Số ngày: | soNgay
  ws.getCell(13, 2).value = "Hướng dẫn viên";
  ws.getCell(13, 2).font = { name: "Calibri", size: 11, bold: true };
  ws.mergeCells(13, 3, 13, 4);
  ws.getCell(13, 3).value = tenHdv;
  ws.getCell(13, 3).font = { name: "Calibri", size: 11, bold: true };
  ws.getCell(13, 3).alignment = { horizontal: "left" };
  ws.getCell(13, 5).value = "Số ngày:";
  ws.getCell(13, 5).font = { name: "Calibri", size: 11, bold: true };
  ws.getCell(13, 5).alignment = { horizontal: "right" };
  ws.getCell(13, 5).border = BORDER_THIN;
  ws.getCell(13, 5).fill = HEADER_FILL;
  ws.mergeCells(13, 6, 13, 7);
  ws.getCell(13, 6).value = soNgay;
  ws.getCell(13, 6).font = { name: "Calibri", size: 11, bold: true };
  ws.getCell(13, 6).alignment = { horizontal: "center" };
  ws.getCell(13, 6).border = BORDER_THIN;
  ws.getCell(13, 6).fill = HEADER_FILL;

  // ===== Table header (row 15): STT | NỘI DUNG (B:E) | Số tiền (F) | Ghi chú (G) =====
  const headerRowIdx = 15;
  ws.getRow(headerRowIdx).height = 22;
  const setHeaderCell = (col: number, text: string) => {
    const cell = ws.getCell(headerRowIdx, col);
    cell.value = text;
    cell.font = { name: "Calibri", size: 11, bold: true };
    cell.fill = HEADER_FILL;
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    cell.border = BORDER_THIN;
  };
  setHeaderCell(1, "STT");
  ws.mergeCells(headerRowIdx, 2, headerRowIdx, 5);
  setHeaderCell(2, "NỘI DUNG");
  for (let c = 3; c <= 5; c++) { ws.getCell(headerRowIdx, c).border = BORDER_THIN; ws.getCell(headerRowIdx, c).fill = HEADER_FILL; }
  setHeaderCell(6, "Số tiền");
  setHeaderCell(7, "Ghi chú");

  // ===== Data rows (3 dòng: 1 thật + 2 trống như mẫu) =====
  const dataRows: Array<{ stt: number; noiDung: string; soTien: number | ""; ghiChu: string }> = [
    { stt: 1, noiDung: moTa, soTien: soTien, ghiChu: input.ghiChu ?? "" },
    { stt: 2, noiDung: "", soTien: "", ghiChu: "" },
    { stt: 3, noiDung: "", soTien: "", ghiChu: "" },
  ];
  dataRows.forEach((r, i) => {
    const rIdx = headerRowIdx + 1 + i;
    ws.getRow(rIdx).height = 18;
    // STT
    const sttCell = ws.getCell(rIdx, 1);
    sttCell.value = r.stt;
    sttCell.font = { name: "Calibri", size: 11 };
    sttCell.alignment = { vertical: "middle", horizontal: "center" };
    sttCell.border = BORDER_THIN;
    // NỘI DUNG (B:E)
    ws.mergeCells(rIdx, 2, rIdx, 5);
    const ndCell = ws.getCell(rIdx, 2);
    ndCell.value = r.noiDung || null;
    ndCell.font = { name: "Calibri", size: 11 };
    ndCell.alignment = { vertical: "middle", horizontal: "left", wrapText: true };
    for (let c = 2; c <= 5; c++) ws.getCell(rIdx, c).border = BORDER_THIN;
    // Số tiền (F)
    const stCell = ws.getCell(rIdx, 6);
    stCell.value = r.soTien === "" ? null : r.soTien;
    stCell.font = { name: "Calibri", size: 11, bold: r.stt === 1 };
    stCell.numFmt = numFmt;
    stCell.alignment = { vertical: "middle", horizontal: "right" };
    stCell.border = BORDER_THIN;
    if (r.stt === 1) stCell.font = { name: "Calibri", size: 11, bold: true, color: { argb: "FFC00000" } };
    // Ghi chú (G)
    const gcCell = ws.getCell(rIdx, 7);
    gcCell.value = r.ghiChu || null;
    gcCell.font = { name: "Calibri", size: 11 };
    gcCell.alignment = { vertical: "middle", horizontal: "left" };
    gcCell.border = BORDER_THIN;
  });

  // ===== TỔNG CỘNG (A:E) | tổng (F) | (G) =====
  const tongRowIdx = headerRowIdx + 1 + dataRows.length; // row 19
  ws.mergeCells(tongRowIdx, 1, tongRowIdx, 5);
  ws.getCell(tongRowIdx, 1).value = "TỔNG CỘNG";
  ws.getCell(tongRowIdx, 1).font = { name: "Calibri", size: 11, bold: true };
  ws.getCell(tongRowIdx, 1).alignment = { vertical: "middle", horizontal: "center" };
  for (let c = 1; c <= 5; c++) { ws.getCell(tongRowIdx, c).border = BORDER_THIN; ws.getCell(tongRowIdx, c).fill = HEADER_FILL; }
  const tongCell = ws.getCell(tongRowIdx, 6);
  tongCell.value = soTien;
  tongCell.font = { name: "Calibri", size: 12, bold: true, color: { argb: "FFC00000" } };
  tongCell.numFmt = numFmt;
  tongCell.alignment = { vertical: "middle", horizontal: "right" };
  tongCell.border = BORDER_THIN;
  tongCell.fill = HEADER_FILL;
  ws.getCell(tongRowIdx, 7).border = BORDER_THIN;
  ws.getCell(tongRowIdx, 7).fill = HEADER_FILL;

  // ===== Tổng số tiền (bằng chữ) — row 21 =====
  const bangChuIdx = tongRowIdx + 2;
  ws.getCell(bangChuIdx, 1).value = "Tổng số tiền:";
  ws.getCell(bangChuIdx, 1).font = { name: "Calibri", size: 11, italic: true };
  ws.mergeCells(bangChuIdx, 2, bangChuIdx, 7);
  const bangChuCell = ws.getCell(bangChuIdx, 2);
  bangChuCell.value = docTienBangChu(soTien);
  bangChuCell.font = { name: "Calibri", size: 11, italic: true, bold: true };
  bangChuCell.alignment = { vertical: "middle", horizontal: "left" };

  // ===== Chữ ký (giống form quyết toán) =====
  const sigColRanges: Array<[number, number]> = [[1, 1], [2, 2], [3, 4], [5, 6], [7, 7]];
  const sigHeaderIdx = bangChuIdx + 1;
  const sigTitles = ["Người đề nghị", "Trưởng bộ phận", "Kế toán thanh toán", "Kế toán trưởng", "Giám đốc"];
  sigTitles.forEach((tlt, i) => {
    const [c1, c2] = sigColRanges[i];
    if (c1 !== c2) ws.mergeCells(sigHeaderIdx, c1, sigHeaderIdx, c2);
    const cell = ws.getCell(sigHeaderIdx, c1);
    cell.value = tlt;
    cell.font = { name: "Calibri", size: 11, bold: true };
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
  });
  ws.getRow(sigHeaderIdx).height = 22;

  const sigKyIdx = sigHeaderIdx + 1;
  sigColRanges.forEach(([c1, c2]) => {
    if (c1 !== c2) ws.mergeCells(sigKyIdx, c1, sigKyIdx, c2);
    const cell = ws.getCell(sigKyIdx, c1);
    cell.value = "(Ký, họ tên)";
    cell.font = { name: "Calibri", size: 10, italic: true };
    cell.alignment = { vertical: "middle", horizontal: "center" };
  });
  ws.getRow(sigKyIdx + 1).height = 18;
  ws.getRow(sigKyIdx + 2).height = 18;
  ws.getRow(sigKyIdx + 3).height = 18;

  const namesIdx = sigKyIdx + 4;
  const names = [tenNguoiDeNghi, "Võ Thị Minh Xuân", "", "Nguyễn Chí Linh", "Nguyễn Tiến Dũng"];
  names.forEach((name, i) => {
    const [c1, c2] = sigColRanges[i];
    if (c1 !== c2) ws.mergeCells(namesIdx, c1, namesIdx, c2);
    const cell = ws.getCell(namesIdx, c1);
    cell.value = name;
    cell.font = { name: "Calibri", size: 11, bold: true };
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
  });
  ws.getRow(namesIdx).height = 22;

  // ===== Thông tin tài khoản HDV =====
  const tkLabelIdx = namesIdx + 2;
  ws.mergeCells(tkLabelIdx, 1, tkLabelIdx, 7);
  const tkLabel = ws.getCell(tkLabelIdx, 1);
  tkLabel.value = "Thông tin tài khoản:";
  tkLabel.font = { name: "Calibri", size: 11, bold: true };
  tkLabel.alignment = { vertical: "middle", horizontal: "center" };
  tkLabel.fill = HEADER_FILL;
  tkLabel.border = BORDER_THIN;

  const tkInfoIdx = tkLabelIdx + 1;
  ws.mergeCells(tkInfoIdx, 1, tkInfoIdx, 7);
  const tkInfo = ws.getCell(tkInfoIdx, 1);
  tkInfo.value = hdv
    ? `${(hdv.ten || "").toUpperCase()}  -  ${hdv.ngan_hang || "—"}  -  ${hdv.so_tai_khoan || "—"}`
    : "—";
  tkInfo.font = { name: "Calibri", size: 11, bold: true };
  tkInfo.alignment = { vertical: "middle", horizontal: "center" };
  ws.getRow(tkInfoIdx).height = 22;

  // ===== Xuất file =====
  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  saveAs(blob, `${sanitize(`GiayDeNghiTamUng_${maDoan || tenHdv}`)}.xlsx`);
}
