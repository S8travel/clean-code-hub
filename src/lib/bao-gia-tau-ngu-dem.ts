// DU THUYỀN NGỦ ĐÊM — bữa ăn trên tàu đã nằm trong giá du thuyền.
//
// Đoàn ngủ đêm trên du thuyền thì dòng KHÁCH SẠN đêm đó là chính con tàu, và giá
// du thuyền đã gồm bữa ăn trên tàu: trưa + tối hôm lên tàu, brunch (早午餐) sáng
// hôm sau. Chỉ nước uống và món gọi thêm là tính riêng — OP chốt 03/10/2026, khớp
// chi phí thật: các đoàn ngủ tàu đều ghi bữa trên tàu 0 đồng, chỉ món gọi thêm
// (tôm hùm, nước uống, spa) mới có tiền.
//
// Trước luật này, dòng "船上自助餐" của đêm ngủ tàu bị luật tàu Hạ Long coi như tàu
// ĐI TRONG NGÀY. Ca thật 03/10: đoàn ngủ một đêm trên du thuyền, hai bữa trên tàu
// vẫn bị tính theo giá buffet tàu ngày — chồng lên giá du thuyền ở dòng khách sạn.
//
// Bữa có MÓN GỌI THÊM ("船上早午餐+九層海鮮塔 USD15") thì dòng vẫn tính tiền,
// nhưng chỉ phần gọi thêm.
//
// Chạy TRƯỚC luật tàu Hạ Long — luật đó bỏ qua dòng đã mang cờ `tau_ngu_dem`.
// `sua_tay` (người nhập vừa gõ) thắng tất cả, không đụng tới.

import { boDau } from "./bang-gia-sua-tay";
import { gianHoa } from "./han-gian-hoa";
import {
  parseUsdAmount, usdBudgetLabel, usdBudgetPrice,
  type ResolveMaps, type ResolvedItem,
} from "./bao-gia-ai-resolve";
import { danhSachTau, laBuaTrenTau } from "./bao-gia-tau-ha-long";

const zhCua = (s: string | null | undefined) => gianHoa((s ?? "").normalize("NFKC"));
/** Bỏ dấu, chỉ còn chữ-số cách nhau một dấu cách, hai đầu có đệm — so theo TỪ. */
const viCua = (s: string | null | undefined) =>
  ` ${boDau((s ?? "").normalize("NFKC")).replace(/[^a-z0-9]+/g, " ").trim()} `;
const coMot = (s: string, ds: readonly string[]) => ds.some((t) => s.includes(t));
const coHan = (s: string) => /[一-鿿]/.test(s);

/** Chữ cho biết dòng là con tàu. Chữ Hán đã qua gianHoa (郵輪 → 邮轮, 遊船 → 游船). */
const TAU_ZH = ["邮轮", "游轮", "船"];
const TAU_VI = [" cruise ", " cruises ", " du thuyen "];
/** Tàu đi trong ngày / tàu ăn tối / tàu hoả: không phải chỗ ngủ đêm trên vịnh.
 *  Danh mục khách sạn có cả các dòng "… Day Cruise" làm vỏ day-use. */
const KHONG_NGU_ZH = ["日游", "火车"];
const KHONG_NGU_VI = [" day cruise ", " dinner cruise ", " tau ngay ", " trong ngay ", " tau hoa ", " train "];

/** Dòng KHÁCH SẠN là một du thuyền — đoàn ngủ trên tàu đêm đó. */
export function laDuThuyenNguDem(r: ResolvedItem): boolean {
  if (r.loai !== "hotel") return false;
  const zh = zhCua(r.ten_zh);
  const vi = viCua(`${r.ten_zh} ${r.mo_ta} ${r.ten_vi} ${r.match_label}`);
  if (coMot(zh, KHONG_NGU_ZH) || coMot(vi, KHONG_NGU_VI)) return false;
  return coMot(zh, TAU_ZH) || coMot(vi, TAU_VI);
}

/** Bữa diễn ra trên tàu. Sáng hôm sau đối tác hay chỉ ghi "早午餐 / brunch" mà
 *  không nhắc lại chữ 船 — bữa cuối trên tàu trước khi trả phòng. */
function laBuaTrenDuThuyen(r: ResolvedItem, homSau: boolean): boolean {
  if (laBuaTrenTau(r)) return true;
  const zh = zhCua(r.ten_zh);
  if (coMot(zh, ["邮轮", "游轮"])) return true;
  return homSau && (zh.includes("早午餐") || viCua(`${r.mo_ta} ${r.ten_vi}`).includes(" brunch "));
}

/** Phần của dòng ăn nói về CHÍNH bữa trên tàu (còn lại là món gọi thêm). */
function laPhanTrenTau(phan: string): boolean {
  return coMot(zhCua(phan), [...TAU_ZH, "早午餐"])
    || coMot(viCua(phan), [" tren tau ", " tren thuyen ", " du thuyen ", " cruise ", " brunch "]);
}

/** Bỏ mức tiền khỏi tên món ("九層海鮮塔(含酒水)USD15" → "九層海鮮塔(含酒水)"). */
function boMucTien(s: string): string {
  return s
    .replace(/\d+(?:[.,]\d+)?\s*(?:usd|us\$|美金|美元|\$)/gi, "")
    .replace(/(?:usd|us\$|\$)\s*\d+(?:[.,]\d+)?/gi, "")
    .replace(/^[\s,，、;；]+|[\s,，、;；]+$/g, "");
}

/**
 * Món gọi thêm trong một dòng ăn trên tàu, nguyên văn đối tác ghi; null = không có.
 * Tách theo "+" và theo 加點 / 加購 / 加菜 / 加贈 / 加送 — quà "tặng" thêm vẫn là
 * tiền công ty trả nhà cung cấp, nên cũng là món gọi thêm.
 */
export function monGoiThem(r: Pick<ResolvedItem, "ten_zh" | "mo_ta" | "ten_vi">): string | null {
  // Dòng có chữ Hán thì chỉ đọc chữ Hán — tên Việt là bản máy dịch.
  const goc = coHan(zhCua(r.ten_zh)) ? r.ten_zh : `${r.mo_ta || r.ten_vi || ""}`;
  const phan = goc.split(/[+＋]|(?=加(?:點|点|購|购|菜|贈|赠|送))/);
  if (phan.length < 2) return null;
  const them = phan.map(boMucTien).filter((p) => p && !laPhanTrenTau(p));
  return them.length ? them.join(" + ") : null;
}

/** Tên hiển thị của một dòng khách sạn. */
const tenDong = (r: ResolvedItem) => (r.match_label || r.mo_ta || r.ten_vi || r.ten_zh).trim();

/** Giá đang trên dòng là giá MỘT BỮA TRÊN TÀU (luật tàu đi trong ngày, hoặc máy
 *  khớp vào nhà hàng-tàu) — không phải giá của món gọi thêm. */
function laGiaBuaTau(r: ResolvedItem, tauIds: ReadonlySet<number>): boolean {
  if (r.tau_ha_long?.gia_set != null) return true;
  if (r.match_table === "nha_hang" && r.match_id != null && tauIds.has(r.match_id)) return true;
  return r.match_table === "nha_hang"
    && coMot(viCua(r.match_label), [" tren tau ", " tren thuyen ", " du thuyen ", " cruise "]);
}

/**
 * Áp luật lên các dòng ăn. Trả MẢNG MỚI (không sửa tại chỗ) — dòng đi thẳng vào
 * state React. Chạy được nhiều lần (mở lại bản nháp): dòng mang cờ của lần trước
 * mà đêm đó nay không còn ngủ tàu thì gỡ cờ, để luật tàu Hạ Long tính lại.
 */
export function apTauNguDem(rows: readonly ResolvedItem[], maps: ResolveMaps): ResolvedItem[] {
  const ksTheoDem = new Map<number, ResolvedItem[]>();
  for (const r of rows) {
    if (r.loai !== "hotel") continue;
    ksTheoDem.set(r.ngay_so, [...(ksTheoDem.get(r.ngay_so) ?? []), r]);
  }
  // Đêm ngủ trên tàu → tên tàu. Đêm còn phương án ngủ trên bờ thì chưa chắc đoàn
  // ngủ tàu — không đụng (để 0 theo phỏng đoán là báo giá hụt tiền âm thầm).
  const demNguTau = new Map<number, string>();
  for (const [ngay, ks] of ksTheoDem) {
    if (ks.every(laDuThuyenNguDem)) demNguTau.set(ngay, [...new Set(ks.map(tenDong))].join(" / "));
  }
  if (!demNguTau.size && !rows.some((r) => r.tau_ngu_dem)) return [...rows];
  const tauIds = new Set(danhSachTau(maps).map((t) => t.nhaHangId));

  return rows.map((r): ResolvedItem => {
    if (r.loai !== "meal" || r.sua_tay) return r;

    let dem: number | null = null;
    if (demNguTau.has(r.ngay_so) && laBuaTrenDuThuyen(r, false)) dem = r.ngay_so;
    // Hôm sau: chỉ bữa sáng/trưa trên tàu — tối hôm sau là đã rời tàu.
    else if (demNguTau.has(r.ngay_so - 1) && r.bua_an !== "toi" && laBuaTrenDuThuyen(r, true)) dem = r.ngay_so - 1;
    if (dem == null) return r.tau_ngu_dem ? { ...r, tau_ngu_dem: undefined } : r;
    const ten = demNguTau.get(dem)!;

    const goiThem = monGoiThem(r);
    if (!goiThem) {
      return {
        ...r,
        don_gia: 0,
        nguon_gia: undefined,
        status: "matched",
        // Bỏ ref nhà hàng-tàu: giữ lại là dạy bộ nhớ khớp "bữa trên tàu = tàu ngày".
        match_table: null,
        match_id: null,
        match_set_menu_id: null,
        match_label: `Đã gồm trong giá du thuyền ${ten}`,
        set_tu_chon: undefined,
        tau_ha_long: null,
        tau_ngu_dem: { ten, dem },
      };
    }

    // Có món gọi thêm → dòng vẫn tính tiền, nhưng chỉ phần đó. Giá đang là giá một
    // bữa trên tàu thì không phải giá món thêm → lấy mức đối tác ghi, không có thì
    // để người nhập gõ.
    const base = { ...r, set_tu_chon: undefined, tau_ha_long: null, tau_ngu_dem: { ten, dem, goi_them: goiThem } };
    if (r.don_gia > 0 && !laGiaBuaTau(r, tauIds)) return base;
    const usd = parseUsdAmount(`${r.ten_zh ?? ""} ${r.ten_vi ?? ""} ${r.ghi_chu ?? ""}`);
    return {
      ...base,
      don_gia: usd != null ? usdBudgetPrice(usd, "meal") : 0,
      nguon_gia: usd != null ? "dong_ghi" : "chua_co",
      status: usd != null ? "matched" : "no_price",
      match_table: null,
      match_id: null,
      match_set_menu_id: null,
      match_label: usd != null ? usdBudgetLabel(usd, "meal") : "Chưa có giá món gọi thêm",
    };
  });
}
