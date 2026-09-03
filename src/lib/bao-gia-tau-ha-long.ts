// TÀU DU LỊCH HẠ LONG — chọn đúng tàu cho bữa ăn trên tàu.
//
// Lịch trình đối tác tách làm hai dòng: một dòng VÉ có tên tàu ("下龍灣最新6星級
// 海豚號 Dolphin Cruise日遊船") và một dòng ĂN ghi chung chung ("船上自助餐").
// Sổ tay chỉ nhìn thấy dòng ăn, nên nó trả về giá của con tàu nào từng được gõ
// cho chuỗi đó — thực tế là Sea Octopus — bất kể đoàn đi tàu gì. Đoàn đi Dolphin
// mà báo giá ăn theo Sea Octopus thì lệch vài trăm nghìn một khách, không ai thấy.
//
// Ở đây lấy bằng chứng CỤ THỂ HƠN: tên tàu xuất hiện trong CÙNG NGÀY. Thứ tự
// quyết định giá bữa ăn trên tàu:
//   1. người nhập tự sửa (`sua_tay`)        → thắng tất, không đụng
//   2. tên tàu đọc được trong ngày           → giá set của đúng tàu đó
//   3. không thấy tên tàu, dòng đã có giá    → giữ giá cũ, gắn cảnh báo
//   4. không thấy tên tàu, dòng chưa có giá  → tàu mặc định, gắn cảnh báo
//
// Vì sao (2) được thắng cả sổ tay: sổ tay học theo CHUỖI CHỮ, mà "船上自助餐" là
// chuỗi không nói tàu nào; tên tàu trong ngày là bằng chứng cho chính đoàn này.

import { boDau } from "./bang-gia-sua-tay";
import { gianHoa } from "./han-gian-hoa";
import {
  chonSetMenuTheoBua, ngayCuaNgaySo,
  type ResolveMaps, type ResolvedItem,
} from "./bao-gia-ai-resolve";

/** Vé thăm vịnh Hạ Long, VND/khách — khớp dòng dịch vụ "Sea Octopus (vé vịnh)"
 *  trong danh mục. Vé lên giá thì sửa ở đây (giá đã áp vào báo giá cũ không đổi
 *  theo, vì đơn giá được cất vào từng báo giá lúc Áp dụng). */
export const VE_VINH_HA_LONG = 310_000;

/** Tàu mà GIÁ SET trong danh mục là giá ĂN THUẦN, CHƯA gồm vé vịnh → phải cộng
 *  thêm. Các tàu còn lại: giá danh mục đã gồm vé vịnh (OP chốt 03/09/2026).
 *  So bằng tên đã bỏ dấu, khớp một phần — "Sea Octopus President" cũng dính. */
const TAU_CHUA_GOM_VE_VINH = ["sea octopus"];

/** Tàu dùng khi lịch trình chỉ ghi "ăn trên tàu" mà không nêu tên tàu nào —
 *  đúng thứ hệ thống vẫn ngầm làm từ trước, nay nói rõ ra bằng một cảnh báo. */
const TAU_MAC_DINH = "sea octopus";

/** Từ KHÔNG mang danh tính con tàu — bỏ khỏi tên trước khi đem đi dò. Thiếu
 *  bước này thì nhà hàng tên "ĂN TRÊN TÀU" khớp với mọi dòng có chữ "trên". */
const TU_CHUNG = new Set([
  "du", "thuyen", "tau", "cruise", "cruises", "yacht", "boat",
  "day", "night", "halong", "ha", "long", "bay", "vinh", "ve",
  "an", "tren", "trong", "ngoai", "buffet", "bufet", "com", "set", "menu",
  "nuoc", "uong", "ngu", "dem", "ngay", "sang", "trua", "toi", "va", "cua",
]);

/** Dấu hiệu một DÒNG lịch trình là chuyện đi tàu (vé du thuyền, vé vịnh, ăn trên
 *  tàu). Chỉ những dòng này mới được đem đi dò tên tàu — quét cả bảng thì một
 *  dòng ăn phố cổ cũng có thể dính tên một con tàu nào đó. */
function laDongTau(r: ResolvedItem): boolean {
  const vi = boDau(`${r.mo_ta ?? ""} ${r.match_label ?? ""} ${r.ten_vi ?? ""}`);
  if (gianHoa(r.ten_zh ?? "").includes("船")) return true;
  return /(^| )(cruise|cruises|yacht)( |$)/.test(vi)
    || vi.includes("du thuyen") || vi.includes("tau ") || vi.endsWith(" tau")
    || vi.includes("ve vinh");
}

/** Dòng ĂN diễn ra trên tàu. */
export function laBuaTrenTau(r: ResolvedItem): boolean {
  if (r.loai !== "meal") return false;
  if (gianHoa(r.ten_zh ?? "").includes("船")) return true;
  const vi = boDau(`${r.mo_ta ?? ""} ${r.match_label ?? ""} ${r.ten_vi ?? ""}`);
  return vi.includes("tren tau") || vi.includes("du thuyen") || vi.includes("tren thuyen");
}

function tuTrongTen(s: string): string[] {
  return boDau(s).replace(/[^a-z0-9]+/g, " ").split(" ").filter(Boolean);
}

/** Phần TÊN RIÊNG của con tàu: bỏ từ chung, bỏ từ quá ngắn (không đủ đặc trưng
 *  để dò — "Tàu Tứ" còn mỗi "tu", khớp bừa vào đủ thứ). */
function loiTenTau(ten: string): string[] {
  return tuTrongTen(ten).filter((w) => !TU_CHUNG.has(w) && (w.length >= 3 || /\d/.test(w)));
}

/** Tên tiếng Trung của tàu, bỏ đuôi mô tả ("國賓號日遊船" → "国宾") — lịch trình
 *  hay viết "國賓號AMBASSADOR CRUISE", không viết nguyên cụm trong danh mục. */
function loiZhTau(zh: string | null | undefined): string | null {
  const t = gianHoa(zh ?? "").replace(/\s+/g, "");
  if (!t) return null;
  const loi = t.replace(/(日游船|游船|号船|号|船)+$/g, "");
  return loi.length >= 2 ? loi : null;
}

/** Một con tàu trong danh mục (là một NHÀ HÀNG, vì bữa ăn trên tàu đặt qua đó). */
export interface TauHaLong {
  nhaHangId: number;
  ten: string;
  /** Tên riêng đã nắn — dò theo dãy từ liên tiếp. Rỗng = không dò được. */
  loi: string[];
  /** Tên tiếng Trung rút gọn trong danh mục (nếu có điền). */
  zh: string | null;
  sets: { id: number; ten: string; gia: number | null }[];
  /** Giá set của tàu này chưa gồm vé vịnh → cộng thêm khi áp. */
  chuaGomVeVinh: boolean;
  foc_khach: number | null;
  foc_mien: number | null;
}

/** Dựng danh sách tàu từ danh mục nhà hàng (1 lần cho mỗi lượt áp). */
export function danhSachTau(maps: ResolveMaps): TauHaLong[] {
  const setTheoNhaHang = new Map<number, TauHaLong["sets"]>();
  for (const [id, s] of maps.setMenu) {
    const ds = setTheoNhaHang.get(s.nhaHangId) ?? [];
    ds.push({ id, ten: s.ten, gia: s.gia });
    setTheoNhaHang.set(s.nhaHangId, ds);
  }

  const ra: TauHaLong[] = [];
  for (const [id, nh] of maps.nhaHang) {
    const loi = loiTenTau(nh.ten);
    const zh = loiZhTau(nh.ten_zh);
    // Tên riêng phải đủ dài mới dám dò: lõi 3 ký tự khớp trúng quá nhiều thứ.
    const dungDuoc = loi.join("").length >= 4 || zh != null;
    if (!dungDuoc) continue;
    const tenPhang = boDau(nh.ten);
    ra.push({
      nhaHangId: id,
      ten: nh.ten,
      loi,
      zh,
      sets: setTheoNhaHang.get(id) ?? [],
      chuaGomVeVinh: TAU_CHUA_GOM_VE_VINH.some((k) => tenPhang.includes(k)),
      foc_khach: nh.foc_khach,
      foc_mien: nh.foc_mien,
    });
  }
  return ra;
}

/** Dãy từ `loi` xuất hiện liên tiếp trong `tu` chưa? */
function chuaDayTu(tu: readonly string[], loi: readonly string[]): boolean {
  if (!loi.length || loi.length > tu.length) return false;
  for (let i = 0; i + loi.length <= tu.length; i++) {
    let khop = true;
    for (let j = 0; j < loi.length; j++) if (tu[i + j] !== loi[j]) { khop = false; break; }
    if (khop) return true;
  }
  return false;
}

/** Tàu được nhắc trong một dòng. null = dòng này không nói tàu nào.
 *
 *  Chấm điểm khi nhiều tàu cùng khớp: tàu CÓ GIÁ SET được ưu tiên, rồi tới tên
 *  khớp dài hơn. Cần đúng luật này cho ca thật "章魚號SEA OCTOPUS日遊船": tên
 *  tiếng Trung trùng với "TÀU CÂU MỰC" (章魚號船, danh mục chưa có giá) trong khi
 *  tàu thật là Sea Octopus. */
export function tauTrongDong(r: ResolvedItem, ds: readonly TauHaLong[]): TauHaLong | null {
  const tu = tuTrongTen(`${r.mo_ta ?? ""} ${r.match_label ?? ""} ${r.ten_vi ?? ""}`);
  const zh = gianHoa(r.ten_zh ?? "").replace(/\s+/g, "");
  let tot: { tau: TauHaLong; diem: number } | null = null;
  for (const tau of ds) {
    // Dòng ăn đã khớp thẳng vào nhà hàng-tàu thì khỏi phải dò tên.
    const khopRef = r.match_table === "nha_hang" && r.match_id === tau.nhaHangId;
    const khopVi = tau.loi.join("").length >= 4 && chuaDayTu(tu, tau.loi);
    const khopZh = tau.zh != null && zh.includes(tau.zh);
    if (!khopRef && !khopVi && !khopZh) continue;
    const coGia = tau.sets.some((s) => (s.gia ?? 0) > 0);
    const diem = (khopRef ? 100 : 0) + (coGia ? 20 : 0)
      + (khopVi ? tau.loi.join("").length : 0) + (khopZh ? (tau.zh?.length ?? 0) : 0);
    if (!tot || diem > tot.diem) tot = { tau, diem };
  }
  return tot?.tau ?? null;
}

/** Giá bữa ăn theo một con tàu: set đúng bữa + vé vịnh nếu tàu đó chưa gồm.
 *  null = danh mục chưa có giá set dùng được cho bữa này. */
export function giaBuaTheoTau(
  tau: TauHaLong,
  bua: "trua" | "toi" | null | undefined,
  ngayDate: string | null,
): { don_gia: number; set_menu_id: number; set_ten: string; ve_vinh: number } | null {
  const setId = chonSetMenuTheoBua(tau.sets, { bua: bua ?? null, ngayDate });
  const set = setId != null ? tau.sets.find((s) => s.id === setId) : null;
  if (!set || (set.gia ?? 0) <= 0) return null;
  const ve_vinh = tau.chuaGomVeVinh ? VE_VINH_HA_LONG : 0;
  return { don_gia: (set.gia ?? 0) + ve_vinh, set_menu_id: set.id, set_ten: set.ten, ve_vinh };
}

/** Ghi chú dán lên dòng vé du thuyền đã được gộp vào giá bữa ăn. */
export const GHI_CHU_VE_DA_GOM = "Đã gồm trong bữa ăn trên tàu";

/**
 * Áp giá tàu Hạ Long cho các bữa ăn trên tàu, theo đúng con tàu đọc được trong
 * ngày. Trả MẢNG MỚI (không sửa tại chỗ) — dòng đi thẳng vào state React.
 *
 * Dòng vé du thuyền cùng ngày của chính con tàu đó được đưa về 0 kèm ghi chú:
 * vé vịnh đã nằm trong giá bữa ăn rồi, để nguyên là tính tiền hai lần.
 */
export function apGiaTauHaLong(
  rows: readonly ResolvedItem[],
  maps: ResolveMaps,
  tourDate: string | null | undefined,
): ResolvedItem[] {
  const ds = danhSachTau(maps);
  if (!ds.length) return [...rows];
  const tauMacDinh = ds.find((t) => boDau(t.ten).includes(TAU_MAC_DINH)) ?? null;

  // Gom chỉ số dòng theo ngày — tên tàu nằm ở dòng khác cùng ngày với bữa ăn.
  const theoNgay = new Map<number, number[]>();
  rows.forEach((r, i) => {
    const ds2 = theoNgay.get(r.ngay_so) ?? [];
    ds2.push(i);
    theoNgay.set(r.ngay_so, ds2);
  });

  const ra = [...rows];
  for (const [ngay_so, idxs] of theoNgay) {
    const buaTau = idxs.filter((i) => laBuaTrenTau(ra[i]));
    if (!buaTau.length) continue; // ngày không ăn trên tàu → không đụng gì

    // Tên tàu: ưu tiên chính dòng ăn (đã khớp danh mục), sau đó tới dòng vé.
    let tau: TauHaLong | null = null;
    for (const i of [...buaTau, ...idxs.filter((i) => laDongTau(ra[i]))]) {
      tau = tauTrongDong(ra[i], ds);
      if (tau) break;
    }
    const doanTau = tau == null;
    const dung = tau ?? tauMacDinh;
    const ngayDate = ngayCuaNgaySo(tourDate, ngay_so);
    let daApGia = false;

    for (const i of buaTau) {
      const r = ra[i];
      if (r.sua_tay) continue; // người nhập vừa gõ — đáng tin hơn mọi suy luận
      const gia = dung ? giaBuaTheoTau(dung, r.bua_an, ngayDate) : null;
      // Không thấy tên tàu mà dòng ĐÃ có giá (sổ tay / danh mục) → giữ giá đó,
      // chỉ cảnh báo. Đè giá người mình từng gõ bằng một phỏng đoán là đúng thứ
      // sổ tay sinh ra để tránh.
      const giuGiaCu = doanTau && r.don_gia > 0;
      if (!gia || giuGiaCu) {
        ra[i] = {
          ...r,
          tau_ha_long: { ten: tau?.ten ?? null, ve_vinh: 0, thieu_gia: !gia && !giuGiaCu },
        };
        continue;
      }
      ra[i] = {
        ...r,
        don_gia: gia.don_gia,
        // Giá không còn là thứ sổ tay nhớ nữa → bỏ nhãn nguồn cũ, kẻo bảng ghi
        // "sổ tay" cho một con số vừa bị thay bằng giá tàu.
        nguon_gia: undefined,
        status: "matched",
        match_table: "nha_hang",
        match_id: dung!.nhaHangId,
        match_set_menu_id: gia.set_menu_id,
        match_label: `${dung!.ten} · ${gia.set_ten.trim()}${gia.ve_vinh ? " + vé vịnh" : ""}`,
        ...(dung!.foc_khach != null ? { foc_khach: dung!.foc_khach, foc_mien: dung!.foc_mien ?? 0 } : {}),
        tau_ha_long: { ten: tau?.ten ?? dung!.ten, ve_vinh: gia.ve_vinh, ...(doanTau ? { doan: true } : {}) },
      };
      daApGia = true;
    }

    if (!daApGia || !tau) continue;
    // Vé vịnh đã nằm trong giá bữa ăn → dòng vé của CHÍNH tàu đó về 0.
    for (const i of idxs) {
      const r = ra[i];
      // Dòng vé/dịch vụ trong báo giá đều mang loai "ticket" (không có "dich_vu").
      if (r.loai !== "ticket") continue;
      if (r.sua_tay || !laDongTau(r)) continue;
      if (tauTrongDong(r, ds)?.nhaHangId !== tau.nhaHangId) continue;
      ra[i] = {
        ...r,
        don_gia: 0,
        ghi_chu: (r.ghi_chu ?? "").includes(GHI_CHU_VE_DA_GOM)
          ? r.ghi_chu
          : [r.ghi_chu?.trim(), GHI_CHU_VE_DA_GOM].filter(Boolean).join(" · "),
        ve_vinh_da_gom: true,
      };
    }
  }
  return ra;
}
