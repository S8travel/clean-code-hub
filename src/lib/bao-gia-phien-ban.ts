// Phiên bản báo giá — dựng ảnh chụp mỗi lần gửi và so sánh hai bản.
//
// Một báo giá bị sửa và gửi lại nhiều lần. Mỗi lần gửi chụp HAI lớp:
//   - lớp chào: thứ đối tác thấy (đi qua assertNoCostLeak trước khi rời CRM)
//   - lớp vốn : items + đơn giá, xe, phụ thu, tỷ giá, profit — Ở LẠI CRM
// Không có lớp vốn thì chỉ biết "lần 1 chào 365, lần 2 chào 352", còn câu hỏi thật
// — đổi khách sạn, bớt lãi, hay tỷ giá? — thì chịu.

import type { BaoGiaItem, BaoGiaKetQua, BaoGiaRow } from "@/hooks/use-bao-gia";
import { buildPortalBaoGiaSnapshot, type PortalBaoGiaSnapshot } from "./portal-payload";

/** Lớp vốn — bản chụp nội bộ, KHÔNG BAO GIỜ đẩy ra ngoài CRM. */
export interface LopVon {
  version: 1;
  exchange_rate: number;
  vcb_rate: number | null;
  profit_usd: number;
  xe_ten: string | null;
  xe_gia: number | null;
  phu_thu: number;
  hdv_gia_ngay: number | null;
  tier_guests: number[];
  items: BaoGiaItem[];
}

export interface PhienBanMoi {
  noi_dung_chao: PortalBaoGiaSnapshot;
  noi_dung_von: LopVon;
}

/** Mã gửi đối tác: bản đầu giữ nguyên mã gốc, từ bản 2 thêm hậu tố để họ biết
 *  đang cầm bản nào khi nhắn "theo BG00025 anh gửi". */
export function maPhienBan(maBg: string, soPhienBan: number): string {
  return soPhienBan <= 1 ? maBg : `${maBg}-v${soPhienBan}`;
}

/** Dựng cả hai lớp cho một lần gửi. `ketQua` phải là bản đã tính lại (liveKetQua). */
export function buildPhienBan(
  row: BaoGiaRow,
  ketQua: BaoGiaKetQua,
  now: Date = new Date(),
): PhienBanMoi {
  return {
    // buildPortalBaoGiaSnapshot đã tự chạy assertNoCostLeak — mọi đường ra ngoài
    // đều đi qua đúng một cửa đó.
    noi_dung_chao: buildPortalBaoGiaSnapshot(row, ketQua, now),
    noi_dung_von: {
      version: 1,
      exchange_rate: row.exchange_rate ?? 0,
      vcb_rate: row.vcb_rate,
      profit_usd: row.profit_usd ?? 0,
      xe_ten: row.xe_ten,
      xe_gia: row.xe_gia,
      phu_thu: row.phu_thu ?? 0,
      hdv_gia_ngay: ketQua.hdv_gia_ngay ?? null,
      tier_guests: ketQua.tier_guests ?? [],
      items: ketQua.items ?? [],
    },
  };
}

// ── Yêu cầu sửa của đối tác ──────────────────────────────────────────────────

/** Một dòng trong dòng thời gian của báo giá (bao_gia_log). */
export interface DongLogBaoGia {
  loai: string;
  noi_dung: string | null;
  tao_luc: string;
}

/**
 * Yêu cầu sửa mà mình CHƯA trả lời — tức là gửi sau lần chào bản gần nhất.
 *
 * Vì sao mốc là "lần chào gần nhất" chứ không phải một cột "đã xử lý": trả lời
 * một yêu cầu sửa NGHĨA LÀ chào lại một bản. Không có hành động nào khác đóng nó
 * được, nên đừng đẻ thêm nút "đánh dấu đã xong" để rồi hai chỗ lệch nhau.
 *
 * Trả về theo thứ tự CŨ TRƯỚC: đối tác nhắn hai lần thì lần sau thường là bổ
 * sung cho lần đầu, đọc xuôi mới hiểu.
 */
export function yeuCauSuaChuaTraLoi(logs: DongLogBaoGia[]): DongLogBaoGia[] {
  let mocChao = "";
  for (const l of logs) {
    if (l.loai === "gui_ban" && l.tao_luc > mocChao) mocChao = l.tao_luc;
  }
  return logs
    .filter((l) => l.loai === "yeu_cau_sua" && l.tao_luc > mocChao)
    .sort((a, b) => (a.tao_luc < b.tao_luc ? -1 : a.tao_luc > b.tao_luc ? 1 : 0));
}

/** Lý do gợi ý cho bản kế tiếp, ghép từ các yêu cầu chưa trả lời. */
export function lyDoTuYeuCau(logs: DongLogBaoGia[], toiDa = 500): string {
  const cau = yeuCauSuaChuaTraLoi(logs)
    .map((l) => (l.noi_dung ?? "").trim())
    .filter(Boolean);
  return cau.join(" · ").slice(0, toiDa);
}

// ── So sánh hai phiên bản ────────────────────────────────────────────────────

export interface ChenhBacGia {
  label: string;
  cu: number | null;   // null = bậc này chưa có ở bản cũ
  moi: number | null;  // null = bậc này bị bỏ ở bản mới
  chenh: number | null;
}

export interface ChenhDichVu {
  kieu: "them" | "bo" | "doi_gia";
  loai: BaoGiaItem["loai"];
  ngay_so: number;
  mo_ta: string;
  cu: number | null;
  moi: number | null;
}

export interface ChenhThongSo {
  ten: string;
  cu: string;
  moi: string;
}

export interface KetQuaSoSanh {
  bac_gia: ChenhBacGia[];
  single_supplement: ChenhBacGia | null;
  dich_vu: ChenhDichVu[];
  thong_so: ChenhThongSo[];
  /** true khi hai bản giống hệt nhau ở mọi mặt so sánh được. */
  giong_nhau: boolean;
}

export interface PhienBanDeSoSanh {
  noi_dung_chao: PortalBaoGiaSnapshot | null;
  noi_dung_von: LopVon | null;
}

// Khoá đối chiếu một dòng dịch vụ. Đổi TÊN dịch vụ sẽ hiện thành "bỏ 1 + thêm 1"
// — chấp nhận, vì đoán mò dòng nào tương ứng dòng nào còn dễ sai hơn.
const khoaItem = (it: BaoGiaItem): string =>
  `${it.loai}|${it.ngay_so ?? 1}|${(it.mo_ta ?? "").trim().toLowerCase()}`;

const soTien = (n: number | null | undefined): string =>
  n == null ? "—" : n.toLocaleString("vi-VN");

/** So sánh bản cũ với bản mới. Trả về đúng những thứ đã đổi, không kể lể phần giống. */
export function soSanhPhienBan(cu: PhienBanDeSoSanh, moi: PhienBanDeSoSanh): KetQuaSoSanh {
  const bac_gia: ChenhBacGia[] = [];
  const bacCu = new Map((cu.noi_dung_chao?.noi_dung.brackets ?? []).map((b) => [b.label, b.price_usd]));
  const bacMoi = new Map((moi.noi_dung_chao?.noi_dung.brackets ?? []).map((b) => [b.label, b.price_usd]));

  for (const label of new Set([...bacCu.keys(), ...bacMoi.keys()])) {
    const a = bacCu.get(label) ?? null;
    const b = bacMoi.get(label) ?? null;
    if (a === b) continue;
    bac_gia.push({ label, cu: a, moi: b, chenh: a != null && b != null ? b - a : null });
  }

  const sCu = cu.noi_dung_chao?.noi_dung.single_supplement_usd ?? null;
  const sMoi = moi.noi_dung_chao?.noi_dung.single_supplement_usd ?? null;
  const single_supplement: ChenhBacGia | null = sCu === sMoi
    ? null
    : { label: "單房差", cu: sCu, moi: sMoi, chenh: sCu != null && sMoi != null ? sMoi - sCu : null };

  // ── Dịch vụ: chỉ so được khi CẢ HAI bản có lớp vốn ────────────────────────
  const dich_vu: ChenhDichVu[] = [];
  if (cu.noi_dung_von && moi.noi_dung_von) {
    const mCu = new Map((cu.noi_dung_von.items ?? []).map((it) => [khoaItem(it), it]));
    const mMoi = new Map((moi.noi_dung_von.items ?? []).map((it) => [khoaItem(it), it]));

    for (const [k, it] of mCu) {
      const sau = mMoi.get(k);
      if (!sau) {
        dich_vu.push({ kieu: "bo", loai: it.loai, ngay_so: it.ngay_so ?? 1, mo_ta: it.mo_ta, cu: it.don_gia, moi: null });
      } else if ((sau.don_gia ?? 0) !== (it.don_gia ?? 0)) {
        dich_vu.push({ kieu: "doi_gia", loai: it.loai, ngay_so: it.ngay_so ?? 1, mo_ta: it.mo_ta, cu: it.don_gia, moi: sau.don_gia });
      }
    }
    for (const [k, it] of mMoi) {
      if (!mCu.has(k)) {
        dich_vu.push({ kieu: "them", loai: it.loai, ngay_so: it.ngay_so ?? 1, mo_ta: it.mo_ta, cu: null, moi: it.don_gia });
      }
    }
    dich_vu.sort((a, b) => a.ngay_so - b.ngay_so || a.mo_ta.localeCompare(b.mo_ta));
  }

  // ── Thông số chung ────────────────────────────────────────────────────────
  const thong_so: ChenhThongSo[] = [];
  const vCu = cu.noi_dung_von;
  const vMoi = moi.noi_dung_von;
  if (vCu && vMoi) {
    const them = (ten: string, a: string, b: string) => { if (a !== b) thong_so.push({ ten, cu: a, moi: b }); };
    them("Tỷ giá", soTien(vCu.exchange_rate), soTien(vMoi.exchange_rate));
    them("Lợi nhuận (USD/khách)", String(vCu.profit_usd), String(vMoi.profit_usd));
    them("Xe", `${vCu.xe_ten ?? "—"} · ${soTien(vCu.xe_gia)}`, `${vMoi.xe_ten ?? "—"} · ${soTien(vMoi.xe_gia)}`);
    them("Phụ thu", soTien(vCu.phu_thu), soTien(vMoi.phu_thu));
    them("Công HDV/ngày", soTien(vCu.hdv_gia_ngay), soTien(vMoi.hdv_gia_ngay));
  }

  return {
    bac_gia,
    single_supplement,
    dich_vu,
    thong_so,
    giong_nhau: bac_gia.length === 0 && single_supplement === null && dich_vu.length === 0 && thong_so.length === 0,
  };
}
