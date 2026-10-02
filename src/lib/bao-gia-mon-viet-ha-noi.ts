// MÓN VIỆT ĂN KHÔNG GIỚI HẠN Ở HÀ NỘI → mặc định MAMMOM.
//
// Lịch trình Đài Loan hay ghi bữa ở Hà Nội là "越式料理單點吃到飽" (món Việt gọi
// món, ăn không giới hạn), nhiều khi còn kèm tên quán cũ "Home". Set này trước
// ở Home Hà Nội, nay OP chuyển hẳn sang MAMMOM (cùng tập đoàn) — chốt 02/10/2026.
//
// Vì sao phải là LUẬT: đọc chữ "Home", máy chỉ thấy đúng một nhà hàng Home có
// tên tiếng Trung và có giá là HOME HỘI AN, nên ca thật 02/10 bữa tối ở Hà Nội bị
// tính giá set Hội An. Sổ tay cũng không cứu được: mỗi đối tác viết một kiểu, mỗi
// kiểu là một khoá mới, và khoá sổ tay không mang thành phố.
//
// Hà Nội hay không:
//   1. thành phố ghi ngay trong dòng ăn ("河內…") — thắng, kể cả khi là nơi khác
//   2. không ghi → khách sạn đoàn ngủ đêm đó (ngày cuối không ngủ lại → đêm trước)
//   3. không biết chắc → không đụng
//
// `sua_tay` (OP vừa gõ trong màn review) thắng tất cả, không đụng tới.

import { boDau } from "./bang-gia-sua-tay";
import { gianHoa } from "./han-gian-hoa";
import type { ResolveMaps, ResolvedItem } from "./bao-gia-ai-resolve";
import { laBuaTrenTau } from "./bao-gia-tau-ha-long";

/** Set "ăn không giới hạn" của MAMMOM trong danh mục (nha_hang_set_menu.id).
 *  Theo ID chứ không theo giá: nhà hàng lên giá thì sửa ở danh mục là luật tự
 *  theo, và giá vốn không được nằm trong repo công khai. Set bị xoá / tạo lại thì
 *  dòng hiện cảnh báo "danh mục không còn set" — sửa ID ở đây. */
export const SET_MON_VIET_HA_NOI_ID = 101;

/** Chữ Hán đi qua cùng một bước nắn với dòng lịch trình — bảng phồn→giản thiếu
 *  chữ nào (壩…) thì hai bên vẫn cùng giữ nguyên, so vẫn trúng. */
const zhCua = (s: string | null | undefined) => gianHoa((s ?? "").normalize("NFKC")).toLowerCase();
const nanZh = (ds: readonly string[]) => ds.map(zhCua);
/** Tiếng Việt / La-tinh: bỏ dấu, chỉ còn chữ-số cách nhau một dấu cách, hai đầu
 *  có đệm — so theo TỪ (" hue " không dính vào "thue"). */
const viCua = (s: string | null | undefined) =>
  ` ${boDau((s ?? "").normalize("NFKC")).replace(/[^a-z0-9]+/g, " ").trim()} `;
const coMot = (s: string, ds: readonly string[]) => ds.some((t) => s.includes(t));
const coTu = (vi: string, ds: readonly string[]) => ds.some((t) => vi.includes(` ${t} `));

/** "Ăn không giới hạn". KHÔNG nhận 無限 đứng một mình: "酒水無限暢飲" là uống không
 *  giới hạn, đồ ăn vẫn là set thường. */
const AN_KHONG_GIOI_HAN_ZH = nanZh(["吃到飽", "任點任吃"]);
const AN_KHONG_GIOI_HAN_VI = ["an khong gioi han", "khong gioi han", "an no", "an thoa thich", "unlimited"];

/** Dấu hiệu món VIỆT: chữ 越, hoặc tên quán (Home cũ / MAMMOM, đối tác viết đủ kiểu). */
const MON_VIET_ZH = nanZh(["越式", "越南"]);
const TEN_QUAN = ["mammom", "mam mom", "mom mam", "moman", "mammon", "home"];

/** Không phải set món Việt thường: tôm hùm là set khác giá hẳn; buffet (自助) và
 *  các ẩm thực khác ăn no là nhà hàng khác. */
const LOAI_TRU_ZH = nanZh(["龍蝦", "自助", "日式", "韓式", "燒肉", "烤肉", "火鍋", "海鮮"]);
const LOAI_TRU_VI = ["tom hum", "buffet", "lau", "nuong", "hai san"];

const coHan = (s: string) => /[一-鿿]/.test(s);

/**
 * Dòng ăn này có phải set món Việt ăn không giới hạn không.
 *
 * Ưu tiên tuyệt đối chữ Hán gốc của đối tác: tên tiếng Việt trên dòng có thể do
 * máy dịch theo nhà hàng nó vừa khớp nhầm ("Home Hội An - món Việt…") — tin vào
 * đó là lặp lại đúng cái sai đang cần sửa.
 */
export function laMonVietKhongGioiHan(tenZh: string | null | undefined, tenVi?: string | null): boolean {
  const zh = zhCua(tenZh);
  if (coHan(zh)) {
    if (!coMot(zh, AN_KHONG_GIOI_HAN_ZH) || coMot(zh, LOAI_TRU_ZH)) return false;
    return coMot(zh, MON_VIET_ZH) || coTu(viCua(tenZh), TEN_QUAN);
  }
  const vi = viCua(`${tenZh ?? ""} ${tenVi ?? ""}`);
  if (!coTu(vi, AN_KHONG_GIOI_HAN_VI) || coTu(vi, LOAI_TRU_VI)) return false;
  return coTu(vi, ["viet", "mon viet", ...TEN_QUAN]);
}

type ThanhPho = "ha_noi" | "khac";

const HA_NOI_ZH = nanZh(["河內"]);
const HA_NOI_VI = ["ha noi", "hanoi", "tay ho"];
/** Thành phố khác hay gặp trong lịch trình. Thiếu tên nào thì dòng đó rơi xuống
 *  bước suy theo khách sạn — chỉ mất cơ hội nhận ra, không gán nhầm Hà Nội. */
const NOI_KHAC_ZH = nanZh([
  "會安", "峴港", "順化", "芽莊", "胡志明", "西貢", "富國", "沙壩", "沙垻", "下龍",
  "寧平", "老街", "海防", "大叻", "美奈", "頭頓", "芹苴", "歸仁",
]);
const NOI_KHAC_VI = [
  "hoi an", "da nang", "hue", "nha trang", "sai gon", "saigon", "ho chi minh", "phu quoc",
  "sa pa", "sapa", "ha long", "halong", "ninh binh", "lao cai", "hai phong", "da lat",
  "mui ne", "phan thiet", "vung tau", "can tho", "quy nhon",
];

/** Thành phố đọc được trong một đoạn chữ; null = không nêu. Hà Nội xét trước: địa
 *  chỉ "…, Vĩnh Tuy, Hà Nội" vẫn là Hà Nội. */
function thanhPhoTrongChu(s: string | null | undefined): ThanhPho | null {
  const zh = zhCua(s), vi = viCua(s);
  if (coMot(zh, HA_NOI_ZH) || coTu(vi, HA_NOI_VI)) return "ha_noi";
  if (coMot(zh, NOI_KHAC_ZH) || coTu(vi, NOI_KHAC_VI)) return "khac";
  return null;
}

/** Thành phố của một dòng khách sạn: địa điểm trong danh mục trước (đã khớp),
 *  không có thì tới chữ trên dòng ("… Hotel Ha Noi"). */
function thanhPhoKhachSan(r: ResolvedItem, maps: ResolveMaps): ThanhPho | null {
  if (r.match_table === "khach_san" && r.match_id != null) {
    const dd = maps.khachSan.get(r.match_id)?.dia_diem?.trim();
    // Danh mục ghi một nơi mà không nhận ra là Hà Nội → coi là nơi khác.
    if (dd) return thanhPhoTrongChu(dd) ?? "khac";
  }
  return thanhPhoTrongChu(`${r.ten_zh} ${r.ten_vi} ${r.mo_ta} ${r.match_label}`);
}

/** Khách sạn Hà Nội của đêm `ngay_so` (ngày không ngủ lại → đêm trước). Đêm có
 *  nhiều phương án mà có phương án ở nơi khác → không dám kết luận. */
function khachSanHaNoi(
  rows: readonly ResolvedItem[], ngay_so: number, maps: ResolveMaps,
): { ten: string; dem_truoc: boolean } | null {
  for (const ngay of [ngay_so, ngay_so - 1]) {
    const ks = rows.filter((r) => r.loai === "hotel" && r.ngay_so === ngay);
    if (!ks.length) continue;
    const tp = ks.map((r) => thanhPhoKhachSan(r, maps));
    if (tp.includes("khac")) return null;
    const i = tp.indexOf("ha_noi");
    if (i < 0) return null;
    const r = ks[i];
    return { ten: (r.match_label || r.mo_ta || r.ten_vi || r.ten_zh).trim(), dem_truoc: ngay !== ngay_so };
  }
  return null;
}

/** Giá cũ trên dòng từ đâu ra — để chú thích nói luật đã thay cái gì. */
function nguonCu(r: ResolvedItem): string {
  if (r.nguon_gia === "so_tay") return "sổ tay";
  if (r.nguon_gia === "dong_ghi") return "mức đối tác ghi";
  return (r.match_label || r.mo_ta || "máy khớp").trim();
}

/**
 * Áp luật lên các dòng ăn. Trả MẢNG MỚI (không sửa tại chỗ) — dòng đi thẳng vào
 * state React. Chạy SAU sổ tay: sổ tay đang nhớ cả giá Home Hội An lẫn các mức
 * cũ cho đúng loại dòng này — luật OP vừa chốt thắng trí nhớ chung.
 */
export function apMonVietHaNoi(rows: readonly ResolvedItem[], maps: ResolveMaps): ResolvedItem[] {
  const set = maps.setMenu.get(SET_MON_VIET_HA_NOI_ID);
  const nh = set ? maps.nhaHang.get(set.nhaHangId) : undefined;

  return rows.map((r): ResolvedItem => {
    if (r.loai !== "meal" || r.sua_tay || laBuaTrenTau(r)) return r;
    // Dòng có chữ Hán thì chỉ đọc chữ Hán — tên Việt có thể là nhãn của lần khớp nhầm.
    const chuDoiTac = coHan(zhCua(r.ten_zh)) ? r.ten_zh : `${r.ten_zh} ${r.ten_vi}`;
    if (!laMonVietKhongGioiHan(r.ten_zh, r.ten_vi)) return r;

    const tpDong = thanhPhoTrongChu(chuDoiTac);
    if (tpDong === "khac") return r;
    let canCu: Pick<NonNullable<ResolvedItem["mon_viet_ha_noi"]>, "can_cu" | "khach_san" | "dem_truoc">;
    if (tpDong === "ha_noi") {
      canCu = { can_cu: "chu" };
    } else {
      const ks = khachSanHaNoi(rows, r.ngay_so, maps);
      if (!ks) return r;
      canCu = { can_cu: "khach_san", khach_san: ks.ten, ...(ks.dem_truoc ? { dem_truoc: true } : {}) };
    }

    if (!set || !nh || (set.gia ?? 0) <= 0) {
      return { ...r, mon_viet_ha_noi: { ...canCu, thieu_gia: true } };
    }
    const gia = set.gia ?? 0;
    const doiGia = r.don_gia > 0 && r.don_gia !== gia;
    return {
      ...r,
      mo_ta: `${nh.ten} - món Việt ăn không giới hạn`,
      don_gia: gia,
      // Giá không còn là thứ sổ tay / máy đoán đưa ra → bỏ nhãn nguồn cũ.
      nguon_gia: undefined,
      status: "matched",
      match_table: "nha_hang",
      match_id: set.nhaHangId,
      match_set_menu_id: SET_MON_VIET_HA_NOI_ID,
      match_label: `${nh.ten} · ${set.ten.trim()}`,
      set_tu_chon: undefined,
      ...(nh.foc_khach != null ? { foc_khach: nh.foc_khach, foc_mien: nh.foc_mien ?? 0 } : {}),
      mon_viet_ha_noi: {
        ...canCu,
        nha_hang_id: set.nhaHangId, nha_hang: nh.ten, set_ten: set.ten.trim(), gia_set: gia,
        ...(doiGia ? { gia_cu: r.don_gia, nguon_cu: nguonCu(r) } : {}),
      },
    };
  });
}
