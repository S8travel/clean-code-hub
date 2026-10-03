// COMBO FANSIPAN — cáp treo + buffet trưa + tàu Mường Hoa, ba thứ trong MỘT giá.
//
// OP chốt 03/10/2026: chương trình có đi cáp treo Fansipan (Sa Pa) thì tính theo
// combo trong danh mục ("cáp treo + BF + Mường Hoa"): buffet trưa trên núi và tàu
// Mường Hoa (Sun Plaza → ga cáp treo) đã nằm trong giá combo, không tính lại.
//
// Máy đọc lẻ từng dòng thì sai cả hai chiều: dòng cáp treo bị khớp vào vé tàu leo
// đỉnh (hụt gần trọn giá combo), dòng tàu Mường Hoa lại khớp vào vé tàu leo đỉnh lần
// nữa, còn buffet trên núi để trống chờ người nhập gõ — gõ vào là tính hai lần.
//
// Tàu leo ĐỈNH (攻頂小火車, từ ga cáp treo lên chóp) KHÔNG nằm trong combo: chi phí
// thật các đoàn đi combo vẫn mua vé tàu leo đỉnh riêng. Đối tác hay viết nó chung
// dòng cáp treo ("雲頂纜車+攻頂小火車") → tách ra một dòng riêng có giá.
//
// `sua_tay` (người nhập vừa gõ) thắng tất cả, không đụng tới.

import { gianHoa } from "./han-gian-hoa";
import type { ResolveMaps, ResolvedItem } from "./bao-gia-ai-resolve";
import { daTach, dongTach, ghiDaTach, tenTheoTu, timVe, type VeDanhMuc } from "./bao-gia-tach-dong";

const zhCua = (s: string | null | undefined) => gianHoa((s ?? "").normalize("NFKC")).toLowerCase();
const coMot = (s: string, ds: readonly string[]) => ds.some((t) => s.includes(t));
const coHan = (s: string) => /[一-鿿]/.test(s);

type Chu = { zh: string; vi: string };

/** Chữ ĐỐI TÁC viết trên dòng. Có chữ Hán thì chỉ đọc chữ Hán (kể cả chữ La-tinh
 *  viết lẫn trong đó, "FANSIPAN LEGEND") — tên Việt có thể là nhãn khớp nhầm. */
function chuCua(s: string): Chu {
  return { zh: zhCua(s), vi: tenTheoTu(s) };
}
function chuDong(r: Pick<ResolvedItem, "ten_zh" | "mo_ta" | "ten_vi">): Chu {
  return chuCua(coHan(zhCua(r.ten_zh)) ? r.ten_zh : `${r.ten_zh} ${r.mo_ta} ${r.ten_vi}`);
}

// Chữ Hán ở đây đã qua gianHoa (纜車 → 缆车, 頂 → 顶, 黃連 → 黄连).
const FANSIPAN_ZH = ["番西邦", "潘西邦", "凡西邦", "范西邦", "黄连山"];
const FANSIPAN_VI = [" fansipan ", " fan si pan ", " phanxipang ", " phan xi pang ", " fsp "];
const CAP_TREO_ZH = ["缆车", "索道"];
const CAP_TREO_VI = [" cap treo ", " cable car ", " captreo "];
/** Tàu leo ĐỈNH — bắt buộc kèm chữ "tàu": 攻頂 đứng một mình còn nghĩa là "chinh phục đỉnh". */
const TAU_DINH_ZH = ["攻顶小火车", "攻顶火车", "攻顶列车", "登顶小火车", "登顶火车", "登顶列车", "山顶小火车", "山顶火车"];
const TAU_DINH_VI = [" tau leo dinh ", " tau hoa leo dinh ", " tuyen dinh ", " tau dinh "];
const TAU_ZH = ["小火车", "列车", "火车"];
const BUFFET_ZH = ["自助", "套票", "套餐"];
const BUFFET_VI = [" buffet ", " bufet ", " combo "];
const KHU_HOI_ZH = ["双程", "来回", "往返"];
const KHU_HOI_VI = [" 2 chieu ", " hai chieu ", " khu hoi "];
/** Dấu ngăn các mảnh trong một dòng ("雲頂纜車+攻頂小火車"). */
const RE_NGAN = /[+＋、,，;；/／]+/;

const laFansipan = (c: Chu) => coMot(c.zh, FANSIPAN_ZH) || coMot(c.vi, FANSIPAN_VI);
const laCapTreo = (c: Chu) => coMot(c.zh, CAP_TREO_ZH) || coMot(c.vi, CAP_TREO_VI);
const laTauDinh = (c: Chu) => coMot(c.zh, TAU_DINH_ZH) || coMot(c.vi, TAU_DINH_VI);

/** Dòng vé đi cáp treo Fansipan. Phải nêu Fansipan: 纜車 không thôi còn là cáp treo
 *  Hạ Long, Bà Nà… */
export function laCapTreoFansipan(r: ResolvedItem): boolean {
  if (r.loai !== "ticket") return false;
  const c = chuDong(r);
  return laFansipan(c) && laCapTreo(c);
}

/** Dòng vé tàu Mường Hoa (Sun Plaza → ga cáp treo). "Thung lũng Mường Hoa" là cảnh,
 *  không phải tàu; tàu leo ĐỈNH là vé khác, không nằm trong combo. */
export function laTauMuongHoa(r: ResolvedItem): boolean {
  if (r.loai !== "ticket") return false;
  const c = chuDong(r);
  if (laTauDinh(c) || laCapTreo(c)) return false;
  if (coMot(c.zh, ["芒花", "孟花"]) || c.vi.includes(" sun plaza ")) return true;
  // "登山小火車 / 登山列車" (tàu leo núi) mà không nói lên đỉnh → tàu Mường Hoa.
  if (c.zh.includes("登山") && coMot(c.zh, TAU_ZH)) return true;
  return c.vi.includes(" tau leo nui ") || (c.vi.includes(" muong hoa ") && coMot(c.vi, [" tau ", " train "]));
}

/** Dòng ăn buffet trưa trên Fansipan. */
export function laBuffetFansipan(r: ResolvedItem): boolean {
  if (r.loai !== "meal" || r.bua_an === "toi") return false;
  const c = chuDong(r);
  return laFansipan(c) && (coMot(c.zh, BUFFET_ZH) || coMot(c.vi, BUFFET_VI));
}

/** Bỏ ngoặc thừa ở mép do tách mảnh ("攻頂小火車）"), giữ ngoặc còn cặp ("登頂火車（雙程）"). */
function catNgoac(s: string): string {
  let t = s.trim();
  const mo = (t.match(/[(（]/g) ?? []).length;
  const dong = (t.match(/[)）]/g) ?? []).length;
  if (dong > mo) t = t.replace(/[)）]\s*$/, "");
  if (mo > dong) t = t.replace(/^\s*[(（]/, "");
  return t.trim();
}

/** Mảnh nêu tàu leo đỉnh trong dòng cáp treo, nguyên văn đối tác; null = không có. */
export function manhTauDinh(r: Pick<ResolvedItem, "ten_zh" | "mo_ta" | "ten_vi">): { goc: string; khuHoi: boolean } | null {
  const goc = coHan(zhCua(r.ten_zh)) ? r.ten_zh : (r.mo_ta || r.ten_vi || "");
  for (const m of goc.split(RE_NGAN)) {
    const c = chuCua(m);
    if (!laTauDinh(c)) continue;
    return { goc: catNgoac(m), khuHoi: coMot(c.zh, KHU_HOI_ZH) || coMot(c.vi, KHU_HOI_VI) };
  }
  return null;
}

/** Combo trong danh mục: tên phải nêu đủ Fansipan + buffet + Mường Hoa. */
const laTenCombo = (ten: string) =>
  coMot(ten, FANSIPAN_VI) && ten.includes(" muong hoa ") && coMot(ten, [" buffet ", " bufet ", " bf "]);

export function veComboFansipan(maps: ResolveMaps): VeDanhMuc | null {
  return timVe(maps, laTenCombo);
}

function veTauDinh(maps: ResolveMaps, khuHoi: boolean): VeDanhMuc | null {
  return timVe(maps, (ten) => coMot(ten, [" leo dinh ", " tuyen dinh "])
    && ten.includes(khuHoi ? " 2 chieu " : " chieu len "));
}

/** Giá cũ trên dòng từ đâu ra — để chú thích nói luật đã thay cái gì. */
function nguonCu(r: ResolvedItem): string {
  if (r.nguon_gia === "so_tay") return "sổ tay";
  if (r.nguon_gia === "dong_ghi") return "mức đối tác ghi";
  return (r.match_label || r.mo_ta || "máy khớp").trim();
}

/**
 * Áp luật combo Fansipan. Trả MẢNG MỚI (không sửa tại chỗ); dòng tàu leo đỉnh tách
 * ra được nối vào CUỐI mảng. Chạy được nhiều lần (mở lại bản nháp): cờ của lần
 * trước trên dòng nay không còn khớp thì gỡ.
 */
export function apComboFansipan(rows: readonly ResolvedItem[], maps: ResolveMaps): ResolvedItem[] {
  // Ngày → dòng cáp treo Fansipan đầu tiên của ngày.
  const capTreo = new Map<number, number>();
  rows.forEach((r, i) => {
    if (laCapTreoFansipan(r) && !capTreo.has(r.ngay_so)) capTreo.set(r.ngay_so, i);
  });
  if (!capTreo.size && !rows.some((r) => r.combo_fansipan)) return [...rows];

  const combo = veComboFansipan(maps);
  const comboCuaDong = (r: ResolvedItem): VeDanhMuc | null => {
    // Máy / người nhập đã chọn đúng một bản ghi combo → giữ bản ghi đó.
    const c = r.match_table === "canh_diem" && r.match_id != null ? maps.canhDiem.get(r.match_id) : undefined;
    return c?.gia && c.gia > 0 && laTenCombo(tenTheoTu(c.ten)) ? { id: r.match_id!, ten: c.ten, gia: c.gia } : combo;
  };
  // Ngày → combo mà dòng cáp treo ngày đó dùng (dòng buffet / tàu Mường Hoa ghi đúng tên đó).
  const comboNgay = new Map<number, VeDanhMuc | null>();
  for (const [ngay, i] of capTreo) comboNgay.set(ngay, comboCuaDong(rows[i]));
  const goCo = (r: ResolvedItem): ResolvedItem => (r.combo_fansipan ? { ...r, combo_fansipan: undefined } : r);
  const them: ResolvedItem[] = [];

  const apCapTreo = (r: ResolvedItem, i: number): ResolvedItem => {
    const ve = comboNgay.get(r.ngay_so) ?? null;
    if (!ve) return { ...r, combo_fansipan: { vai_tro: "cap_treo", ten: null } };
    const doiGia = r.don_gia > 0 && r.don_gia !== ve.gia;
    // Mở lại nháp: giá đã là giá combo rồi → giữ "giá cũ" của lần áp trước cho chú thích.
    const cu = r.combo_fansipan?.vai_tro === "cap_treo" ? r.combo_fansipan : undefined;
    const giaCu = doiGia
      ? { gia_cu: r.don_gia, nguon_cu: nguonCu(r) }
      : cu?.gia_cu != null ? { gia_cu: cu.gia_cu, nguon_cu: cu.nguon_cu } : {};
    let dong: ResolvedItem = {
      ...r,
      don_gia: ve.gia,
      nguon_gia: undefined,
      status: "matched",
      // Khớp do luật, không phải máy đoán → không vào danh sách "cần xác nhận".
      confidence: 1,
      match_table: "canh_diem",
      match_id: ve.id,
      match_set_menu_id: null,
      match_label: ve.ten,
      // Combo đã gồm buffet trưa: dòng ăn trưa cùng ngày mà chưa nhận ra là buffet
      // trên núi thì máy combo CẢNH BÁO "có thể trùng" (không tự ẩn).
      ai_bao_gom: r.ai_bao_gom ?? "trua",
      combo_fansipan: { vai_tro: "cap_treo", ten: ve.ten, gia: ve.gia, ...giaCu },
    };
    const tauDinh = manhTauDinh(r);
    if (tauDinh && !daTach(r, "tau_dinh_fansipan")) {
      // Đối tác đã viết tàu leo đỉnh thành dòng riêng thì thôi, khỏi tách thêm.
      const daCoDong = rows.some((x, j) => j !== i && x.ngay_so === r.ngay_so
        && x.loai === "ticket" && !laCapTreoFansipan(x) && laTauDinh(chuDong(x)));
      if (!daCoDong) {
        them.push(dongTach(dong, "tau_dinh_fansipan", {
          ten_zh: coHan(zhCua(r.ten_zh)) ? tauDinh.goc : "",
          mo_ta: `Tàu leo đỉnh Fansipan (${tauDinh.khuHoi ? "2 chiều" : "chiều lên"})`,
        }, veTauDinh(maps, tauDinh.khuHoi)));
      }
      dong = ghiDaTach(dong, "tau_dinh_fansipan");
    }
    return dong;
  };

  const de0 = (r: ResolvedItem, vai_tro: "buffet" | "tau_muong_hoa", ten: string): ResolvedItem => ({
    ...r,
    don_gia: 0,
    nguon_gia: undefined,
    status: "matched",
    // Bỏ ref danh mục cũ (thường là vé tàu leo đỉnh khớp nhầm) — giữ lại là dạy bộ nhớ khớp sai.
    match_table: null,
    match_id: null,
    match_set_menu_id: null,
    match_label: `Đã gồm trong combo ${ten}`,
    set_tu_chon: undefined,
    combo_fansipan: { vai_tro, ten },
  });

  const ra = rows.map((r, i): ResolvedItem => {
    if (r.sua_tay) return r;
    const iCapTreo = capTreo.get(r.ngay_so);
    if (iCapTreo == null) return goCo(r); // ngày đó (nay) không đi cáp treo Fansipan
    if (i === iCapTreo) return apCapTreo(r, i);
    // Danh mục không có combo thì dòng cáp treo chưa mang giá trọn gói — để 0 buffet
    // / tàu Mường Hoa lúc này là báo giá hụt tiền.
    const ve = comboNgay.get(r.ngay_so);
    if (!ve) return goCo(r);
    if (laBuffetFansipan(r)) return de0(r, "buffet", ve.ten);
    if (laTauMuongHoa(r)) return de0(r, "tau_muong_hoa", ve.ten);
    return goCo(r);
  });
  return them.length ? [...ra, ...them] : ra;
}
