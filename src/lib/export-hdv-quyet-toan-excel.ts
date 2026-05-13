import * as XLSX from "xlsx";
import { saveAs } from "file-saver";
import type { QuyetToanData } from "@/hooks/use-chi-phi-hdv";

interface ExportInput {
  data: QuyetToanData;
  hdv: { ten: string; so_tai_khoan: string | null; ngan_hang: string | null } | null;
  ngayLap?: string;
}

const fmt = (n: number | null | undefined) => (n ?? 0).toLocaleString("vi-VN");

function sanitize(name: string): string {
  return name.replace(/[\\/:*?"<>|]/g, "-").trim();
}

export function exportHDVQuyetToanExcel({ data, hdv, ngayLap }: ExportInput): void {
  const today = ngayLap ? new Date(ngayLap) : new Date();
  const ngayStr = `${today.getDate()} Tháng ${today.getMonth() + 1} Năm ${today.getFullYear()}`;

  const tamUng = data.tam_ung ?? 0;
  const thuTrachNhiem = data.thu_trach_nhiem ?? 0;
  const tipSoKhach = data.thu_tip?.so_khach ?? 0;
  const tipDonGia = data.thu_tip?.don_gia_nt ?? 0;
  const tipTyGia = data.thu_tip?.ty_gia ?? 0;
  const soNgay = data.so_ngay_doan ?? 0;
  const thuTipVnd = tipSoKhach * tipDonGia * soNgay * tipTyGia;
  const dauKhachSL = data.thu_dau_khach?.so_khach ?? 0;
  const dauKhachDG = data.thu_dau_khach?.don_gia ?? 0;
  const thuDauKhachVnd = dauKhachSL * dauKhachDG;
  const quyVpSL = data.thu_quy_vp?.so_luong ?? 0;
  const quyVpDG = data.thu_quy_vp?.don_gia ?? 0;
  const thuQuyVpVnd = quyVpSL * quyVpDG;
  const thuBanOp = data.thu_ban_op ?? 0;
  const thuKhac = data.thu_khac ?? 0;
  const tongQuyetToan = data.tong_hdv_chi ?? 0;

  const tongThu = tamUng + thuTrachNhiem + thuTipVnd + thuDauKhachVnd + thuQuyVpVnd + thuBanOp + thuKhac;
  const conPhaiThanhToan = tongQuyetToan - tongThu;

  const tenHdv = data.ten_hdv ?? hdv?.ten ?? "";
  const maDoan = data.ma_doan ?? "";
  const soKhachDoan = data.so_khach_doan ?? 0;

  // Build sheet — array of arrays (rows × cols)
  // Cols: A=STT, B=NỘI DUNG, C=Số lượng, D=Đơn giá, E=Thu tiền, F=Chi tiền, G=Ghi chú/tỷ giá
  const aoa: (string | number)[][] = [];

  // Header company (rows 0-3)
  aoa.push(["CÔNG TY TNHH DU LỊCH S8", "", "", "", "", "", `BM02.1-20/2024/QT-S8`]);
  aoa.push(["Đ/C: Tầng 2, Tòa nhà Kim Sơn, Số 18 Phan Thành Tài, Phường Hòa Cường, Thành Phố Đà Nẵng, Việt Nam", "", "", "", "", "", ""]);
  aoa.push(["TEL: 02366.566.538", "", "", "", "", "", `Hà Nội, Ngày ${ngayStr}`]);
  aoa.push(["Email: s8travel.info@gmail.com / nhận hóa đơn: s8travel.hddt@gmail.com", "", "", "", "", "", ""]);
  aoa.push(["MST: 0402021137", "", "", "", "", "", ""]);
  aoa.push([]);

  // Title (row 6)
  aoa.push(["", "", "GIẤY ĐỀ NGHỊ QUYẾT TOÁN", "", "", "", ""]);
  aoa.push([]);

  // Info section
  aoa.push(["Kính gửi:", "Giám đốc công ty TNHH du lịch S8 Travel"]);
  aoa.push(["Tôi tên là:", tenHdv]);
  aoa.push(["Bộ phận:", data.bo_phan_nguoi_de_nghi || "Hướng dẫn viên"]);
  aoa.push(["Lý do đề nghị:", "Quyết toán đoàn", maDoan, "", "Số khách:", soKhachDoan]);
  aoa.push(["", "Hướng dẫn viên", tenHdv, "", "Số ngày:", soNgay]);
  aoa.push([]);

  // Bảng chi tiết (header row 14)
  aoa.push(["STT", "NỘI DUNG", "Số lượng", "Đơn giá", "Thu tiền", "Chi tiền", "Ghi chú / tỷ giá"]);

  // Row 3: Tổng quyết toán (HDV chi)
  aoa.push([3, "Tổng quyết toán ( HDV chi)", "", "", "", tongQuyetToan, ""]);
  // Row 4: Tạm ứng — Thu (vì giảm số công ty cần trả)
  aoa.push([4, "Tạm ứng", "", "", tamUng || "", "", ""]);
  // Row 5: Thu tiền trách nhiệm
  aoa.push([5, "Thu tiền trách nhiệm", "", "", thuTrachNhiem || "", "", ""]);
  // Row 6: Thu tiền tip
  aoa.push([6, "Thu tiền tip", tipSoKhach || "", tipDonGia || "", thuTipVnd || "", "", tipTyGia || ""]);
  // Row 7: Thu tiền đầu khách
  aoa.push([7, "Thu tiền đầu khách", dauKhachSL || "", dauKhachDG || "", thuDauKhachVnd || "", "", ""]);
  // Row 8: Thu tiền quỹ vp
  aoa.push([8, "Thu tiền quỹ vp", quyVpSL || "", quyVpDG || "", thuQuyVpVnd || "", "", ""]);
  // Row 9: Thu tiền bán OP
  aoa.push([9, "Thu tiền bán OP", "", "", thuBanOp || "", "", ""]);
  // Row 10: Thu khác
  aoa.push([10, "Thu khác", "", "", thuKhac || "", "", ""]);
  // Row 11: blank
  aoa.push([11, "", "", "", "", "", ""]);
  // Tổng
  aoa.push(["", "Tổng", "", "", tongThu, tongQuyetToan, ""]);
  // Còn phải thanh toán
  aoa.push(["", "Còn phải thanh toán", "", "", "", conPhaiThanhToan, ""]);
  aoa.push([]);

  // Chữ ký
  aoa.push(["Tổng số tiền:"]);
  aoa.push(["Người đề nghị", "Trưởng bộ phận", "Kế toán thanh toán", "Kế toán trưởng", "", "Giám đốc"]);
  aoa.push(["(Ký, họ tên)", "(Ký, họ tên)", "(Ký, họ tên)", "(Ký, họ tên)", "", "(Ký, họ tên)"]);
  aoa.push([]);
  aoa.push([]);
  aoa.push([]);
  aoa.push([tenHdv, "Võ Thị Minh Xuân", "", "Nguyễn Chí Linh", "", "Nguyễn Tiến Dũng"]);
  aoa.push([]);

  // Tài khoản
  aoa.push(["", "", "Thông tin tài khoản:"]);
  const accountLine = hdv
    ? `${hdv.ten}  -  ${hdv.ngan_hang || "—"}  -  ${hdv.so_tai_khoan || "—"}`
    : "—";
  aoa.push(["", "", accountLine]);

  const ws = XLSX.utils.aoa_to_sheet(aoa);

  // Column widths
  ws["!cols"] = [
    { wch: 6 },   // A: STT
    { wch: 30 }, // B: NỘI DUNG
    { wch: 12 }, // C: Số lượng
    { wch: 12 }, // D: Đơn giá
    { wch: 14 }, // E: Thu tiền
    { wch: 14 }, // F: Chi tiền
    { wch: 14 }, // G: Ghi chú/tỷ giá
  ];

  // Merge cells for header company info + title
  ws["!merges"] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: 5 } },  // Company name row
    { s: { r: 1, c: 0 }, e: { r: 1, c: 5 } },  // Address
    { s: { r: 2, c: 0 }, e: { r: 2, c: 5 } },  // Tel
    { s: { r: 3, c: 0 }, e: { r: 3, c: 5 } },  // Email
    { s: { r: 4, c: 0 }, e: { r: 4, c: 5 } },  // MST
    { s: { r: 6, c: 0 }, e: { r: 6, c: 6 } },  // Title
    { s: { r: 8, c: 1 }, e: { r: 8, c: 5 } },  // Kính gửi value
    { s: { r: 9, c: 1 }, e: { r: 9, c: 5 } },  // Tôi tên là value
    { s: { r: 10, c: 1 }, e: { r: 10, c: 5 } }, // Bộ phận value
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Quyết toán HDV");

  const arrayBuffer = XLSX.write(wb, { bookType: "xlsx", type: "array" });
  const blob = new Blob([arrayBuffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  saveAs(blob, `${sanitize(`GiayDeNghiQuyetToan_${maDoan || tenHdv}`)}.xlsx`);
}
