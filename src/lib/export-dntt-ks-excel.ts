import * as XLSX from "xlsx";
import type { EdgeFunctionData } from "./export-dntt-ks-word";

const fmt = (n: number) => n.toLocaleString("vi-VN");

export function exportDNTTKSExcel(items: EdgeFunctionData[], tenDoan: string): void {
  const wb = XLSX.utils.book_new();

  const headers = [
    "CODE ĐOÀN", "Số khách", "Tên Khách sạn", "CODE KS",
    "Check-in", "Check-out", "Loại Phòng", "Số đêm", "Số Lượng", "FOC",
    "Đơn giá", "Thành tiền", "Đã TT", "Thanh toán",
    "STK", "Ngân hàng", "Ghi chú",
  ];

  const aoa: (string | number)[][] = [
    [`ĐỀ NGHỊ THANH TOÁN — ${tenDoan}`],
    [],
    headers,
  ];

  for (const item of items) {
    const { doan, ks, ncc, codeKS, roomEntries, cocTotal, focDisplay, soTien, la_coc, ghiChu } = item;
    roomEntries.forEach((room, ri) => {
      const rowSoDem = room.so_dem ?? 1;
      const thanhTien = room.don_gia * room.so_luong * rowSoDem;
      const isFirst = ri === 0;

      const daTT = isFirst
        ? (la_coc ? fmt(soTien) : cocTotal > 0 ? `(${fmt(cocTotal)})` : "—")
        : "";
      const thanhToanCol = isFirst
        ? (la_coc ? "—" : fmt(soTien))
        : "";

      aoa.push([
        isFirst ? doan.ten_doan : "",
        isFirst ? doan.so_khach : "",
        isFirst ? ks.ten : "",
        isFirst ? codeKS : "",
        room.ci || "—",
        room.co || "—",
        room.name,
        rowSoDem,
        room.so_luong,
        isFirst ? focDisplay : "",
        room.don_gia,
        thanhTien,
        daTT,
        thanhToanCol,
        isFirst ? (ncc?.so_tai_khoan || "—") : "",
        isFirst ? (ncc?.ngan_hang || "—") : "",
        isFirst ? (ghiChu || "") : "",
      ]);
    });
  }

  const ws = XLSX.utils.aoa_to_sheet(aoa);

  ws["!cols"] = [
    { wch: 20 }, // CODE ĐOÀN
    { wch: 8 },  // Số khách
    { wch: 22 }, // Tên KS
    { wch: 12 }, // CODE KS
    { wch: 10 }, // Check-in
    { wch: 10 }, // Check-out
    { wch: 18 }, // Loại Phòng
    { wch: 7 },  // Số đêm
    { wch: 8 },  // Số Lượng
    { wch: 8 },  // FOC
    { wch: 14 }, // Đơn giá
    { wch: 14 }, // Thành tiền
    { wch: 14 }, // Đã TT
    { wch: 14 }, // Thanh toán
    { wch: 20 }, // STK
    { wch: 25 }, // Ngân hàng
    { wch: 35 }, // Ghi chú
  ];

  // Merge title cell across all columns
  ws["!merges"] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: headers.length - 1 } }];

  XLSX.utils.book_append_sheet(wb, ws, "ĐNTT KS");
  XLSX.writeFile(wb, `DNTT_KS_${tenDoan}.xlsx`);
}
