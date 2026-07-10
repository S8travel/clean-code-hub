import ExcelJS from "exceljs";
import { saveAs } from "file-saver";
import type { QuyetToanData } from "@/hooks/use-chi-phi-hdv";
import { calcQuyetToanHDV } from "@/lib/quyet-toan-hdv-calc";
import { docTienBangChu } from "@/lib/so-tien-bang-chu";

interface ExportInput {
  data: QuyetToanData;
  hdv: { ten: string; so_tai_khoan: string | null; ngan_hang: string | null } | null;
  /** Tên người đang đăng nhập, in vào "Tôi tên là" + chữ ký "Người đề nghị" */
  nguoiDeNghi?: string;
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

export async function exportHDVQuyetToanExcel({ data, hdv, nguoiDeNghi, ngayLap }: ExportInput): Promise<void> {
  const today = ngayLap ? new Date(ngayLap) : new Date();
  const ngayStr = `Hà Nội, Ngày ${today.getDate()} Tháng ${today.getMonth() + 1} Năm ${today.getFullYear()}`;

  const tamUng = data.tam_ung ?? 0;
  const thuTrachNhiem = data.thu_trach_nhiem ?? 0;
  const tipSoKhach = data.thu_tip?.so_khach ?? 0;
  const tipDonGia = data.thu_tip?.don_gia_nt ?? 0;
  const tipTyGia = data.thu_tip?.ty_gia ?? 0;
  // Tip khoán (doan.tip_lump_sum) — bản ghi cũ không có field này, khi đó tính công thức.
  const tipTongNT = data.thu_tip?.tong_nt ?? null;
  const soNgay = data.so_ngay_doan ?? 0;
  const dauKhachSL = data.thu_dau_khach?.so_khach ?? 0;
  const dauKhachDG = data.thu_dau_khach?.don_gia ?? 0;
  const quyVpSL = data.thu_quy_vp?.so_luong ?? 0;
  const quyVpDG = data.thu_quy_vp?.don_gia ?? 0;
  const thuBanOp = data.thu_ban_op ?? 0;
  const thuKhac = data.thu_khac ?? 0;
  const tongQuyetToan = data.tong_hdv_chi ?? 0;

  // Logic tổng thu / còn phải TT tách ở lib/quyet-toan-hdv-calc.ts — có unit test,
  // dùng chung với CreateHDVPaymentModal để màn hình & file in luôn khớp.
  const { thuTipVnd, thuDauKhachVnd, thuQuyVpVnd, tongThu, conPhaiThanhToan } = calcQuyetToanHDV({
    tamUng,
    thuTrachNhiem,
    tip: { soKhach: tipSoKhach, donGiaNT: tipDonGia, soNgay, tyGia: tipTyGia, tongNT: tipTongNT },
    dauKhach: { soKhach: dauKhachSL, donGia: dauKhachDG },
    quyVp: { soLuong: quyVpSL, donGia: quyVpDG },
    thuBanOp,
    thuKhac,
    tongHdvChi: tongQuyetToan,
  });

  const tenHdv = data.ten_hdv ?? hdv?.ten ?? "";
  // Người đề nghị = user đang đăng nhập (kế toán), KHÔNG phải HDV
  const tenNguoiDeNghi = nguoiDeNghi || data.ten_nguoi_de_nghi || "";
  const boPhan = "Kế toán";
  const maDoan = data.ma_doan ?? "";
  const soKhachDoan = data.so_khach_doan ?? 0;

  const wb = new ExcelJS.Workbook();
  wb.creator = "S8 Travel CRM";
  wb.created = new Date();

  const ws = wb.addWorksheet("Quyết toán HDV", {
    pageSetup: {
      paperSize: 9, // A4
      orientation: "portrait",
      margins: { left: 0.4, right: 0.4, top: 0.4, bottom: 0.4, header: 0.2, footer: 0.2 },
      horizontalCentered: true,
    },
  });

  // Column widths (7 columns: A..G) — A rộng cho label info & STT signature, G rộng cho ngày + form code
  ws.columns = [
    { width: 14 },  // A: STT / label info col 1
    { width: 26 },  // B: NỘI DUNG / label info col 2 (merged with A for labels)
    { width: 13 },  // C: Số lượng
    { width: 13 },  // D: Đơn giá
    { width: 15 },  // E: Thu tiền
    { width: 15 },  // F: Chi tiền
    { width: 20 },  // G: Ghi chú / tỷ giá + form code + ngày
  ];

  // ===== Logo (góc trên trái, nằm gọn trong cột A) =====
  const logoBuf = await loadLogoBuffer();
  if (logoBuf) {
    const imageId = wb.addImage({ buffer: logoBuf, extension: "jpeg" });
    ws.addImage(imageId, {
      tl: { col: 0.05, row: 0.1 },
      ext: { width: 80, height: 80 },
      editAs: "oneCell",
    });
  }
  // Reserve height for logo (5 rows × 18 = 90px, đủ cho logo 80px)
  ws.getRow(1).height = 18;
  ws.getRow(2).height = 18;
  ws.getRow(3).height = 18;
  ws.getRow(4).height = 18;
  ws.getRow(5).height = 18;

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

  // ===== Top-right meta — đặt ở row 6 (form code) + row 7 (ngày) để không đè header công ty =====
  // Form code phải nằm ở cột riêng nên dùng row 6 (gap) thay vì merge title row
  const formCodeCell = ws.getCell(6, 7);
  formCodeCell.value = "BM02.1-20/2024/QT-S8";
  formCodeCell.font = { name: "Calibri", size: 10 };
  formCodeCell.alignment = { vertical: "middle", horizontal: "right" };

  // ===== Ngày lập (row 7, col G riêng dòng) — đặt ngay dưới form code cho gọn nhóm bên phải =====
  const dateCell = ws.getCell(7, 7);
  dateCell.value = ngayStr;
  dateCell.font = { name: "Calibri", size: 10, italic: true };
  dateCell.alignment = { vertical: "middle", horizontal: "right" };

  // ===== Title (row 8) — merge A:G full width =====
  ws.mergeCells(8, 1, 8, 7);
  const titleCell = ws.getCell(8, 1);
  titleCell.value = "GIẤY ĐỀ NGHỊ QUYẾT TOÁN";
  titleCell.font = { name: "Calibri", size: 18, bold: true, italic: true };
  titleCell.alignment = { vertical: "middle", horizontal: "center" };
  ws.getRow(8).height = 28;

  // ===== Info rows (rows 9-13) =====
  // Row 9: Kính gửi
  ws.getCell(9, 1).value = "Kính gửi:";
  ws.getCell(9, 1).font = { name: "Calibri", size: 11, bold: true };
  ws.mergeCells(9, 2, 9, 7);
  ws.getCell(9, 2).value = "Giám đốc công ty TNHH du lịch S8 Travel";
  ws.getCell(9, 2).font = { name: "Calibri", size: 11 };

  // Row 10: Tôi tên là
  ws.getCell(10, 1).value = "Tôi tên là:";
  ws.getCell(10, 1).font = { name: "Calibri", size: 11, bold: true };
  ws.mergeCells(10, 2, 10, 7);
  ws.getCell(10, 2).value = tenNguoiDeNghi;
  ws.getCell(10, 2).font = { name: "Calibri", size: 11, bold: true };

  // Row 11: Bộ phận
  ws.getCell(11, 1).value = "Bộ phận:";
  ws.getCell(11, 1).font = { name: "Calibri", size: 11, bold: true };
  ws.mergeCells(11, 2, 11, 7);
  ws.getCell(11, 2).value = boPhan;
  ws.getCell(11, 2).font = { name: "Calibri", size: 11 };

  // Row 12: Lý do đề nghị | Quyết toán đoàn | maDoan | _ | Số khách: | 13
  ws.getCell(12, 1).value = "Lý do đề nghị:";
  ws.getCell(12, 1).font = { name: "Calibri", size: 11, bold: true };
  ws.getCell(12, 2).value = "Quyết toán đoàn";
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
  ws.getCell(12, 6).value = soKhachDoan;
  ws.getCell(12, 6).font = { name: "Calibri", size: 11, bold: true };
  ws.getCell(12, 6).alignment = { horizontal: "center" };
  ws.getCell(12, 6).border = BORDER_THIN;
  ws.getCell(12, 6).fill = HEADER_FILL;

  // Row 13: blank | Hướng dẫn viên | tenHdv | _ | Số ngày: | soNgay
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

  // ===== Table header (row 15) =====
  const headerRowIdx = 15;
  const headers = ["STT", "NỘI DUNG", "Số lượng", "Đơn giá", "Thu tiền", "Chi tiền", "Ghi chú / tỷ giá"];
  headers.forEach((h, i) => {
    const cell = ws.getCell(headerRowIdx, i + 1);
    cell.value = h;
    cell.font = { name: "Calibri", size: 11, bold: true };
    cell.fill = HEADER_FILL;
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    cell.border = BORDER_THIN;
  });
  ws.getRow(headerRowIdx).height = 22;

  // ===== Data rows (rows 15-23) =====
  const numFmt = "#,##0";
  const dataRows: Array<[number, string, number | "", number | "", number | "", number | "", number | string]> = [
    [3, "Tổng quyết toán ( HDV chi)", "", "", "", tongQuyetToan, ""],
    [4, "Tạm ứng", "", "", tamUng || "", "", ""],
    [5, "Thu tiền trách nhiệm", "", "", thuTrachNhiem || "", "", ""],
    [6, "Thu tiền tip", tipSoKhach || "", tipDonGia || "", thuTipVnd || "", "", tipTyGia || ""],
    [7, "Thu tiền đầu khách", dauKhachSL || "", dauKhachDG || "", thuDauKhachVnd || "", "", ""],
    [8, "Thu tiền quỹ vp", quyVpSL || "", quyVpDG || "", thuQuyVpVnd || "", "", ""],
    [9, "Thu tiền bán OP", "", "", thuBanOp || "", "", ""],
    [10, "Thu khác", "", "", thuKhac || "", "", ""],
    [11, "", "", "", "", "", ""],
  ];

  dataRows.forEach((row, i) => {
    const rIdx = headerRowIdx + 1 + i;
    row.forEach((val, c) => {
      const cell = ws.getCell(rIdx, c + 1);
      cell.value = val === "" ? null : val;
      cell.font = { name: "Calibri", size: 11 };
      cell.border = BORDER_THIN;
      if (c === 0) {
        cell.alignment = { vertical: "middle", horizontal: "center" };
      } else if (c === 1) {
        cell.alignment = { vertical: "middle", horizontal: "left" };
      } else if (c === 6) {
        cell.alignment = { vertical: "middle", horizontal: "center" };
        if (typeof val === "number") cell.numFmt = numFmt;
      } else {
        cell.alignment = { vertical: "middle", horizontal: "right" };
        if (typeof val === "number") cell.numFmt = numFmt;
      }
    });
    ws.getRow(rIdx).height = 18;
  });

  // ===== Tổng row =====
  const tongRowIdx = headerRowIdx + 1 + dataRows.length; // row 24
  ws.mergeCells(tongRowIdx, 1, tongRowIdx, 4);
  ws.getCell(tongRowIdx, 1).value = "Tổng";
  ws.getCell(tongRowIdx, 1).font = { name: "Calibri", size: 11, bold: true };
  ws.getCell(tongRowIdx, 1).alignment = { vertical: "middle", horizontal: "center" };
  ws.getCell(tongRowIdx, 1).fill = HEADER_FILL;
  ws.getCell(tongRowIdx, 1).border = BORDER_THIN;
  // Also border the merged cells
  for (let c = 1; c <= 4; c++) {
    ws.getCell(tongRowIdx, c).border = BORDER_THIN;
    ws.getCell(tongRowIdx, c).fill = HEADER_FILL;
  }
  const tongThuCell = ws.getCell(tongRowIdx, 5);
  tongThuCell.value = tongThu;
  tongThuCell.font = { name: "Calibri", size: 11, bold: true };
  tongThuCell.numFmt = numFmt;
  tongThuCell.alignment = { vertical: "middle", horizontal: "right" };
  tongThuCell.border = BORDER_THIN;
  tongThuCell.fill = HEADER_FILL;

  const tongChiCell = ws.getCell(tongRowIdx, 6);
  tongChiCell.value = tongQuyetToan;
  tongChiCell.font = { name: "Calibri", size: 11, bold: true };
  tongChiCell.numFmt = numFmt;
  tongChiCell.alignment = { vertical: "middle", horizontal: "right" };
  tongChiCell.border = BORDER_THIN;
  tongChiCell.fill = HEADER_FILL;

  ws.getCell(tongRowIdx, 7).border = BORDER_THIN;
  ws.getCell(tongRowIdx, 7).fill = HEADER_FILL;

  // ===== Còn phải thanh toán row — label A:D, value E:F, G riêng =====
  const conRowIdx = tongRowIdx + 1; // row 25
  ws.mergeCells(conRowIdx, 1, conRowIdx, 4);
  ws.getCell(conRowIdx, 1).value = "Còn phải thanh toán";
  ws.getCell(conRowIdx, 1).font = { name: "Calibri", size: 11, bold: true };
  ws.getCell(conRowIdx, 1).alignment = { vertical: "middle", horizontal: "center" };
  for (let c = 1; c <= 4; c++) {
    ws.getCell(conRowIdx, c).border = BORDER_THIN;
    ws.getCell(conRowIdx, c).fill = HEADER_FILL;
  }
  ws.mergeCells(conRowIdx, 5, conRowIdx, 6);
  const conCell = ws.getCell(conRowIdx, 5);
  conCell.value = conPhaiThanhToan;
  conCell.font = { name: "Calibri", size: 12, bold: true };
  conCell.numFmt = numFmt;
  conCell.alignment = { vertical: "middle", horizontal: "right" };
  for (let c = 5; c <= 6; c++) {
    ws.getCell(conRowIdx, c).border = BORDER_THIN;
    ws.getCell(conRowIdx, c).fill = HEADER_FILL;
  }
  ws.getCell(conRowIdx, 7).border = BORDER_THIN;
  ws.getCell(conRowIdx, 7).fill = HEADER_FILL;

  // ===== Tổng số tiền (bằng chữ) — row 27 =====
  // Số tiền bằng chữ = "Còn phải thanh toán" (số tiền quyết toán cuối cùng).
  const sumLabelIdx = conRowIdx + 2; // row 27
  ws.getCell(sumLabelIdx, 1).value = "Tổng số tiền:";
  ws.getCell(sumLabelIdx, 1).font = { name: "Calibri", size: 11, italic: true };
  ws.mergeCells(sumLabelIdx, 2, sumLabelIdx, 7);
  const bangChuCell = ws.getCell(sumLabelIdx, 2);
  bangChuCell.value = docTienBangChu(conPhaiThanhToan);
  bangChuCell.font = { name: "Calibri", size: 11, italic: true, bold: true };
  bangChuCell.alignment = { vertical: "middle", horizontal: "left" };

  // ===== Signature header row (row 28) =====
  // Layout: 5 người ký phân thành 5 nhóm cột (mỗi nhóm merge để đủ chỗ chữ dài)
  //   Người đề nghị      : A
  //   Trưởng bộ phận     : B
  //   Kế toán thanh toán : C:D merge
  //   Kế toán trưởng     : E:F merge
  //   Giám đốc           : G
  const sigHeaderIdx = sumLabelIdx + 1; // row 28
  const sigColRanges: Array<[number, number]> = [
    [1, 1], // A
    [2, 2], // B
    [3, 4], // C:D
    [5, 6], // E:F
    [7, 7], // G
  ];
  const sigTitles = ["Người đề nghị", "Trưởng bộ phận", "Kế toán thanh toán", "Kế toán trưởng", "Giám đốc"];
  sigTitles.forEach((t, i) => {
    const [c1, c2] = sigColRanges[i];
    if (c1 !== c2) ws.mergeCells(sigHeaderIdx, c1, sigHeaderIdx, c2);
    const cell = ws.getCell(sigHeaderIdx, c1);
    cell.value = t;
    cell.font = { name: "Calibri", size: 11, bold: true };
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
  });
  ws.getRow(sigHeaderIdx).height = 22;

  // ===== "(Ký, họ tên)" row (row 29) =====
  const sigKyIdx = sigHeaderIdx + 1;
  sigColRanges.forEach(([c1, c2]) => {
    if (c1 !== c2) ws.mergeCells(sigKyIdx, c1, sigKyIdx, c2);
    const cell = ws.getCell(sigKyIdx, c1);
    cell.value = "(Ký, họ tên)";
    cell.font = { name: "Calibri", size: 10, italic: true };
    cell.alignment = { vertical: "middle", horizontal: "center" };
  });

  // ===== Empty rows for signing =====
  ws.getRow(sigKyIdx + 1).height = 18;
  ws.getRow(sigKyIdx + 2).height = 18;
  ws.getRow(sigKyIdx + 3).height = 18;

  // ===== Names row (row 33) =====
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

  // ===== Thông tin tài khoản (row 35) =====
  const tkLabelIdx = namesIdx + 2;
  ws.mergeCells(tkLabelIdx, 1, tkLabelIdx, 7);
  const tkLabel = ws.getCell(tkLabelIdx, 1);
  tkLabel.value = "Thông tin tài khoản:";
  tkLabel.font = { name: "Calibri", size: 11, bold: true };
  tkLabel.alignment = { vertical: "middle", horizontal: "center" };
  tkLabel.fill = HEADER_FILL;
  tkLabel.border = BORDER_THIN;

  // ===== Account info (row 36) =====
  const tkInfoIdx = tkLabelIdx + 1;
  ws.mergeCells(tkInfoIdx, 1, tkInfoIdx, 7);
  const tkInfo = ws.getCell(tkInfoIdx, 1);
  const accountLine = hdv
    ? `${(hdv.ten || "").toUpperCase()}  -  ${hdv.ngan_hang || "—"}  -  ${hdv.so_tai_khoan || "—"}`
    : "—";
  tkInfo.value = accountLine;
  tkInfo.font = { name: "Calibri", size: 11, bold: true };
  tkInfo.alignment = { vertical: "middle", horizontal: "center" };
  ws.getRow(tkInfoIdx).height = 22;

  // ===== Write file =====
  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  saveAs(blob, `${sanitize(`GiayDeNghiQuyetToan_${maDoan || tenHdv}`)}.xlsx`);
}
