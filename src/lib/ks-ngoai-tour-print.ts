import { format } from "date-fns";
import type { EdgeFunctionData } from "@/lib/export-dntt-ks-word";
import { nightsBetween } from "@/lib/ks-ngoai-tour";
import { buildCanTruNote } from "@/lib/can-tru-note";
import type { ChiPhiRow, DNTTRow } from "@/hooks/use-chi-phi";

// ĐNTT KS ngoài tour dùng ref_loai riêng (cách ly KS trong tour).
export const REF_LOAI_NGOAI_TOUR = "ngoai_tour_ks";

export interface HotelLite {
  id: number;
  ten: string;
  tai_khoan_thanh_toan: string | null;
}

/** Payment tối thiểu cần cho bản in (cấn trừ per-ĐNTT). Khớp PaymentRow. */
export interface CanTruPaymentLite {
  dntt_id: number;
  method: string;
  so_tien: number | string;
  ghi_chu: string | null;
}

const fmtDate = (iso?: string | null) =>
  iso ? format(new Date(iso + "T00:00:00"), "dd/MM/yyyy") : "";

/** ĐNTT sống (non-da_huy/non-tu_choi) của 1 khách sạn ngoài tour. */
export function ngoaiTourLiveDntts(dnttList: DNTTRow[], ksId: number): DNTTRow[] {
  return dnttList.filter(
    (d) => d.ref_loai === REF_LOAI_NGOAI_TOUR && d.ref_id === ksId &&
      d.trang_thai_duyet !== "da_huy" && d.trang_thai_duyet !== "tu_choi",
  );
}

/** Các khach_san_id có dòng ngoài tour + đang có ĐNTT sống (in được). */
export function getNgoaiTourPrintableKsIds(chiPhiRows: ChiPhiRow[], dnttList: DNTTRow[]): number[] {
  const ksIds = [...new Set(
    chiPhiRows
      .filter((r) => r.danh_muc === "khach_san" && r.ngoai_tour && r.khach_san_id != null)
      .map((r) => r.khach_san_id as number),
  )];
  return ksIds.filter((id) => ngoaiTourLiveDntts(dnttList, id).length > 0);
}

/** Dựng EdgeFunctionData cho 1 ĐNTT KS ngoài tour (giống KS trong tour). */
export function buildNgoaiTourEdgeData(
  rows: ChiPhiRow[],
  hotel: HotelLite | undefined,
  dntt: DNTTRow,
  liveDntts: DNTTRow[],
  tenDoan: string,
  nguoiDeNghi: string,
  canTruPays: CanTruPaymentLite[] = [],
): EdgeFunctionData {
  const ciList = rows.map((r) => r.ngoai_tour_ci).filter(Boolean).sort();
  const coList = rows.map((r) => r.ngoai_tour_co).filter(Boolean).sort();
  const checkInISO = ciList[0] ?? null;
  const checkOutISO = coList[coList.length - 1] ?? null;
  // Đã cọc/đã trả = paid_amount các ĐNTT KHÁC (không tính ĐNTT đang in).
  const cocTotal = liveDntts
    .filter((d) => d.id !== dntt.id)
    .reduce((s, d) => s + Number(d.paid_amount || 0), 0);
  // Cấn trừ CỦA CHÍNH ĐNTT đang in (payment method='can_tru' gắn vào dntt.id).
  // Trước đây bỏ sót → bản in ghi nguyên so_tien, che mất phần đã cấn trừ (dễ trả dư).
  const canTruTotal = canTruPays
    .filter((p) => p.dntt_id === dntt.id && p.method === "can_tru")
    .reduce((s, p) => s + Number(p.so_tien || 0), 0);
  const canTruNote = canTruTotal > 0
    ? (buildCanTruNote(canTruPays.filter((p) => p.dntt_id === dntt.id && p.method === "can_tru"))
        ?? "Cấn trừ công nợ")
    : undefined;
  return {
    doan: { ten_doan: tenDoan, so_khach: 0 },
    ks: { ten: hotel?.ten ?? `KS #${dntt.ref_id}`, foc_khach: null, foc_mien: null },
    ncc: hotel?.tai_khoan_thanh_toan ? { so_tai_khoan: hotel.tai_khoan_thanh_toan } : null,
    checkIn: fmtDate(checkInISO),
    checkOut: fmtDate(checkOutISO),
    codeKS: "",
    soDem: nightsBetween(checkInISO, checkOutISO),
    roomEntries: rows.map((r) => ({
      name: r.mo_ta || "Phòng",
      so_luong: Number(r.so_luong) || 0,
      don_gia: Number(r.don_gia) || 0,
      so_dem: nightsBetween(r.ngoai_tour_ci, r.ngoai_tour_co),
      ci: fmtDate(r.ngoai_tour_ci),
      co: fmtDate(r.ngoai_tour_co),
      foc_count: Number(r.foc_count) || 0,
    })),
    cocTotal,
    canTruTotal: canTruTotal > 0 ? canTruTotal : undefined,
    canTruNote,
    focDisplay: "—",
    soTien: Number(dntt.so_tien) || 0,
    la_coc: !!dntt.la_coc,
    nguoiDeNghi,
    ghiChu: dntt.ghi_chu || "",
  };
}

/** Dựng dữ liệu in cho các khách sạn ngoài tour được chọn (tất cả ĐNTT sống của mỗi KS). */
export function buildNgoaiTourSelectedData(
  selectedKsIds: number[],
  chiPhiRows: ChiPhiRow[],
  dnttList: DNTTRow[],
  hotels: HotelLite[],
  tenDoan: string,
  nguoiDeNghi: string,
  payments: CanTruPaymentLite[] = [],
): EdgeFunctionData[] {
  const out: EdgeFunctionData[] = [];
  for (const ksId of selectedKsIds) {
    const rows = chiPhiRows.filter(
      (r) => r.danh_muc === "khach_san" && r.ngoai_tour && r.khach_san_id === ksId,
    );
    if (rows.length === 0) continue;
    const hotel = hotels.find((h) => h.id === ksId);
    const live = ngoaiTourLiveDntts(dnttList, ksId);
    for (const d of live) {
      const canTruPays = payments.filter((p) => p.dntt_id === d.id && p.method === "can_tru");
      out.push(buildNgoaiTourEdgeData(rows, hotel, d, live, tenDoan, nguoiDeNghi, canTruPays));
    }
  }
  return out;
}
