// NHÀ HÀNG CHỈ ĐỊNH — lịch trình nêu đích danh nhà hàng thì giá theo MENU trong
// danh mục, đứng trên công thức USD (USD × 20.000 + 20.000) và trên số sổ tay.
//
// OP chốt 03/10/2026. Trước đây công thức USD lọt vào dòng có nhà hàng chỉ định
// theo hai lối:
//   1. Máy khớp đúng nhà hàng nhưng không chọn được set (buffet có set ngày thường
//      / cuối tuần mà báo giá chưa có ngày đi; nhà hàng nhiều set không ghi bữa) →
//      dòng 0₫ → rơi xuống công thức USD.
//   2. Con số USD đó được Áp dụng → sổ tay "học" nó → lần sau sổ tay đè luôn giá
//      menu dù máy đã chọn đúng set.
//
// Máy chưa chọn set thì chọn: luật bữa + thứ (chonSetMenuTheoBua); không đủ căn cứ
// thì set gần mức đối tác ghi nhất (mức USD cho biết đối tác chào hạng menu nào);
// không có mức thì set giá cao nhất (thà dư còn hơn hụt) — đều ghi lý do.
//
// KHÔNG áp: khớp nhà hàng chưa chắc (máy đoán dưới ngưỡng), "nhà hàng" chung theo
// mức USD (set đặt tên theo USD — chính là công thức), bữa trên tàu / combo Fansipan
// / món Việt Hà Nội (luật khác lo), dòng người nhập vừa sửa tay.

import { boDau } from "./bang-gia-sua-tay";
import {
  NGUONG_CHAC, chonSetMenuTheoBua, lyDoChonSet, ngayCuaNgaySo, parseUsdAmount,
  setHopNguCanh, setMenuCuaNhaHang, usdBudgetPrice,
  type ResolveMaps, type ResolvedItem,
} from "./bao-gia-ai-resolve";
import { laBuaTrenTau } from "./bao-gia-tau-ha-long";

type SetCoGia = { id: number; ten: string; gia: number };

/** Set đặt tên theo mức USD ("Món việt 8usd") — "nhà hàng" chung theo định mức. */
const laSetTheoMucUsd = (ten: string) => /\d+(?:[.,]\d+)?\s*usd/i.test(ten);

/** Từ không nói gì về MÓN — bỏ khi so tên set với tên dòng. */
const TU_KHONG_NOI_MON = new Set(["set", "menu", "nha", "hang", "mon", "an", "va", "cho", "cua", "the", "suat"]);
const tuMon = (s: string) => new Set(
  boDau(s).replace(/[^a-z0-9]+/g, " ").split(" ").filter((w) => w.length >= 2 && !/^\d/.test(w) && !TU_KHONG_NOI_MON.has(w)),
);

/** Set cho dòng này + lý do khi LUẬT phải chọn hộ; null = không có set có giá hợp bữa. */
function chonSet(
  r: ResolvedItem,
  coGia: readonly SetCoGia[],
  ctx: { bua: "trua" | "toi" | null; ngayDate: string | null },
  usd: number | null,
  giaUsd: number | null,
): { set: SetCoGia; ly_do?: string } | null {
  // Máy / người nhập đã chọn set (còn giá) → giữ, không phải luật chọn.
  const daChon = coGia.find((s) => s.id === r.match_set_menu_id);
  if (daChon) return { set: daChon };
  const theoLuat = chonSetMenuTheoBua(coGia, ctx);
  const sLuat = coGia.find((s) => s.id === theoLuat);
  if (sLuat) return { set: sLuat, ly_do: lyDoChonSet(sLuat.ten, ctx) };

  const ungVien = setHopNguCanh(coGia, ctx);
  if (!ungVien.length) return null;
  // Tên set trùng món lịch trình ghi ("lẩu cá hồi" ↔ "SET LẨU CÁ HỒI…") — chỉ để phân
  // xử giữa các set ngang nhau, không thắng được tiêu chí chính.
  const tuDong = tuMon(`${r.mo_ta} ${r.ten_vi}`);
  const trung = (s: SetCoGia) => [...tuMon(s.ten)].filter((w) => tuDong.has(w)).length;
  if (giaUsd != null && usd != null) {
    // Gần mức đối tác ghi nhất; ngang nhau thì set trùng món hơn, rồi set đắt hơn
    // (thà dư còn hơn hụt).
    const diem = (s: SetCoGia) => [-Math.abs(s.gia - giaUsd), trung(s), s.gia];
    const gan = ungVien.reduce((a, b) => (hon(diem(b), diem(a)) ? b : a));
    return { set: gan, ly_do: `gần mức đối tác ghi ${usd} USD nhất` };
  }
  const tot = ungVien.reduce((a, b) => (hon([trung(b), b.gia], [trung(a), a.gia]) ? b : a));
  return {
    set: tot,
    ly_do: trung(tot) > 0 ? "tên set trùng món lịch trình ghi nhất" : "chưa đủ căn cứ chọn — tạm lấy set giá cao nhất",
  };
}

/** So hai bộ điểm theo thứ tự ưu tiên: `a` hơn `b` hẳn thì true. */
function hon(a: readonly number[], b: readonly number[]): boolean {
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] > b[i];
  return false;
}

/**
 * Áp luật nhà hàng chỉ định lên các dòng ăn. Trả MẢNG MỚI (không sửa tại chỗ).
 * Chạy SAU các luật khác (bỏ qua dòng chúng đã quyết) và chạy lại được nhiều lần
 * (mở lại bản nháp) cho cùng một kết quả.
 */
export function apMenuNhaHangChiDinh(
  rows: readonly ResolvedItem[],
  maps: ResolveMaps,
  tourDate: string | null | undefined,
): ResolvedItem[] {
  const goCo = (r: ResolvedItem): ResolvedItem => (r.nh_chi_dinh ? { ...r, nh_chi_dinh: undefined } : r);

  return rows.map((r): ResolvedItem => {
    if (r.loai !== "meal" || r.sua_tay) return r;
    if (r.tau_ha_long || r.tau_ngu_dem || r.combo_fansipan || r.mon_viet_ha_noi || laBuaTrenTau(r)) return goCo(r);
    if (r.match_table !== "nha_hang" || r.match_id == null) return goCo(r);
    // Máy khớp nhà hàng chưa chắc → chưa phải "chỉ định", đừng lấy menu của nhà hàng đoán.
    if (!r.from_alias && (r.confidence ?? 0) < NGUONG_CHAC) return goCo(r);
    const nh = maps.nhaHang.get(r.match_id);
    if (!nh) return goCo(r);
    const sets = setMenuCuaNhaHang(maps, r.match_id);
    if (sets.length && sets.every((s) => laSetTheoMucUsd(s.ten))) return goCo(r);

    const usd = parseUsdAmount(`${r.ten_zh ?? ""} ${r.ten_vi ?? ""} ${r.ghi_chu ?? ""}`);
    const giaUsd = usd != null ? usdBudgetPrice(usd, "meal") : null;
    const ctx = { bua: r.bua_an ?? null, ngayDate: ngayCuaNgaySo(tourDate, r.ngay_so) };
    const coGia = sets.filter((s): s is SetCoGia => (s.gia ?? 0) > 0);
    const chon = chonSet(r, coGia, ctx, usd, giaUsd);

    if (!chon) {
      // Không có menu có giá cho bữa này → đành theo mức USD, nhưng nói rõ là tạm.
      return giaUsd != null && r.don_gia === giaUsd
        ? { ...r, nh_chi_dinh: { nha_hang: nh.ten, thieu_menu: true } }
        : goCo(r);
    }
    const { set, ly_do } = chon;
    if (r.don_gia === set.gia && r.match_set_menu_id === set.id) return r; // đã đúng giá menu

    const nguonCu = giaUsd != null && r.don_gia === giaUsd
      ? `công thức USD — đối tác ghi ${usd} USD`
      : r.nguon_gia === "so_tay" ? "sổ tay" : (r.match_label || "máy khớp").trim();
    return {
      ...r,
      don_gia: set.gia,
      nguon_gia: undefined,
      status: "matched",
      match_set_menu_id: set.id,
      match_label: `${nh.ten} · ${set.ten.trim()}`,
      // Lý do chọn set chỉ có khi LUẬT chọn giữa nhiều set (chú thích "Luật chọn set").
      set_tu_chon: ly_do && coGia.length > 1
        ? { id: set.id, ten: set.ten.trim(), gia: set.gia, ly_do }
        : undefined,
      nh_chi_dinh: {
        nha_hang: nh.ten,
        gia_menu: set.gia,
        ...(r.don_gia > 0 && r.don_gia !== set.gia ? { gia_cu: r.don_gia, nguon_cu: nguonCu } : {}),
      },
    };
  });
}
