// AI tính báo giá — RESOLVE: ghép kết quả AI (id dòng master, KHÔNG giá) với dữ
// liệu master ở client để ra giá + FOC + trạng thái khớp. Pure → test được.
// Triết lý: AI chọn dòng, code lấy giá từ DB (snapshot). Xem project_bao_gia_ai_extract.

import type { BaoGiaItem } from "@/hooks/use-bao-gia";
import { resolveGiaPhongValue, type GiaPhongRow } from "@/lib/khach-san-gia-phong";

// ── Shape AI trả về (khớp schema edge fn) ──
export type MatchTable = "khach_san" | "nha_hang" | "canh_diem" | "nha_xe_loai_xe";

/** Bữa ăn đã nằm SẴN trong 1 vé combo (vd Bà Nà: cáp treo + buffet trưa). */
export type BaoGomBuaAn = "trua" | "toi" | "ca_hai";

export interface AiMatchRef {
  table: MatchTable;
  id: number;
  set_menu_id: number | null;
  confidence: number;
}
export interface AiExtractItem {
  ngay_so: number;
  loai: "hotel" | "meal" | "ticket" | "transport" | "dich_vu";
  bua_an: "trua" | "toi" | null;
  ten_zh: string;
  ten_vi: string;
  match: AiMatchRef | null;
  ghi_chu: string;
  /** AI đọc được từ text "含午餐 / đã bao gồm ăn trưa" → CHỈ để cảnh báo, KHÔNG
   *  tự bỏ dòng ăn (model có thể đọc nhầm; bỏ nhầm = báo giá hụt tiền).
   *  Optional: provider không structured-output / bản nháp cũ không có field này. */
  da_bao_gom?: BaoGomBuaAn | null;
}
export interface AiExtractResult {
  ten_chuong_trinh: string;
  so_ngay: number;
  items: AiExtractItem[];
}

// ── Lookup master (build từ React Query ở UI; pure data cho hàm resolve) ──
export interface ResolveMaps {
  /** canh_diem.id → { ten, gia_mac_dinh, cờ combo đã gồm bữa ăn } */
  canhDiem: Map<number, {
    ten: string;
    gia: number | null;
    /** canh_diem.bao_gom_bua_an — vé combo đã gồm bữa ăn nào (null = vé thường). */
    bao_gom_bua_an?: BaoGomBuaAn | null;
    bao_gom_ghi_chu?: string | null;
  }>;
  /** nha_hang_set_menu.id → { ten, gia, nhaHangTen, nhaHangId } */
  setMenu: Map<number, { ten: string; gia: number | null; nhaHangTen: string; nhaHangId: number }>;
  /** nha_hang.id → { ten, foc_khach, foc_mien } (chính sách FOC để snapshot) */
  nhaHang: Map<number, { ten: string; foc_khach: number | null; foc_mien: number | null }>;
  /** khach_san.id → { ten } */
  khachSan: Map<number, { ten: string }>;
  /** khach_san.id → các dòng giá theo giai đoạn (resolve theo ngày tour) */
  khachSanGia: Map<number, GiaPhongRow[]>;
  /** nha_xe_loai_xe.id → { ten, gia } */
  xe: Map<number, { ten: string; gia: number | null }>;
}

/** Bản nháp review AI lưu vào báo giá (ket_qua.ai_review) để mở lại tiếp tục. */
export interface AiReviewDraft {
  items: ResolvedItem[];
  selection: Record<number, number>;
  ten: string;
  so_ngay: number;
  saved_at: string;
}

export type ResolveStatus = "matched" | "no_price" | "unmatched";

export interface ResolvedItem {
  ngay_so: number;
  loai: BaoGiaItem["loai"]; // dich_vu → ticket (cùng cách tính × pax)
  bua_an?: "trua" | "toi";
  mo_ta: string;
  don_gia: number;
  // foc = số miễn override (undefined → auto theo foc_khach/foc_mien policy).
  foc?: number;
  foc_khach?: number;
  foc_mien?: number;
  ten_zh: string;
  ten_vi: string;
  ghi_chu: string;
  confidence: number;
  /** matched=có giá; no_price=khớp nhưng thiếu giá; unmatched=AI không khớp được */
  status: ResolveStatus;
  /** Nhãn dòng master đã khớp (vd "Tây Hồ", "NH ABC - Set 300k") hoặc "Chưa khớp". */
  match_label: string;
  // Tham chiếu danh mục hiện tại (từ AI match HOẶC user chọn) — để học alias + áp dụng lại.
  match_table?: MatchTable | null;
  match_id?: number | null;
  match_set_menu_id?: number | null;
  /** TRUE = giá/khớp lấy từ bộ nhớ alias đã học (hiển thị nhãn ↺). */
  from_alias?: boolean;

  // ── Combo đã bao gồm bữa ăn (chỉ dòng vé/dịch vụ) ──
  /** ĐÃ XÁC NHẬN vé này gồm bữa nào → dòng ăn cùng ngày bị ẩn khỏi báo giá.
   *  Nguồn: danh mục `canh_diem.bao_gom_bua_an`, hoặc OP xác nhận trong review. */
  bao_gom_bua_an?: BaoGomBuaAn | null;
  /** 'master' = lấy từ danh mục · 'user' = OP vừa xác nhận trong màn review. */
  bao_gom_nguon?: "master" | "user";
  /** Mô tả bữa đã gồm (snapshot `canh_diem.bao_gom_ghi_chu`) — hiện ở tooltip. */
  bao_gom_ghi_chu?: string;
  /** AI đọc được "đã gồm bữa ..." từ text lịch trình → CHỈ cảnh báo, không tự bỏ dòng. */
  ai_bao_gom?: BaoGomBuaAn | null;
  /** OP đã bấm bỏ qua cảnh báo nghi-ngờ-combo trên dòng vé này. */
  bo_qua_combo?: boolean;
  /** Dòng ĂN: OP bắt tính riêng dù combo cùng ngày khai đã gồm bữa đó. */
  tinh_rieng?: boolean;
}

/** 1 dòng bộ nhớ alias đã học (bao_gia_match_alias). */
export interface AliasEntry {
  loai: BaoGiaItem["loai"];
  match_table: MatchTable | null;
  target_id: number | null;
  set_menu_id: number | null;
  ten_hien_thi: string | null;
  gia_override: number | null;
}

/** Chuẩn hoá text lịch trình thành key alias: lowercase, bỏ dấu tiếng Việt, bỏ
 *  token giá (USD/$), gộp khoảng trắng. Giữ chữ Hán (\p{L}). Idempotent. */
export function normalizeAliasKey(text: string | null | undefined): string {
  if (!text) return "";
  return String(text)
    .toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d")
    .replace(/\d+(?:[.,]\d+)?\s*(?:usd|us\$|美金|美元)/gi, "")
    .replace(/[$＄]\s*\d+(?:[.,]\d+)?/g, "")
    .replace(/\d+(?:[.,]\d+)?\s*[$＄]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Key tra bộ nhớ alias: `${normalize(text)}::${loai}`. Map alias dùng cùng key. */
export function aliasKeyOf(text: string | null | undefined, loai: BaoGiaItem["loai"]): string {
  return `${normalizeAliasKey(text)}::${loai}`;
}

/** Ép cờ bữa ăn về union hợp lệ. AI trả text tự do (schema không enum được vì
 *  còn nullable) nên có thể ra "lunch"/"trưa"/rác → coi như không có cờ, tránh
 *  nhãn "undefined" trên UI. */
function sanitizeBaoGom(v: unknown): BaoGomBuaAn | null {
  return v === "trua" || v === "toi" || v === "ca_hai" ? v : null;
}

/** Ép bữa ăn về 'trua'|'toi'. Cùng lý do sanitizeBaoGom: schema edge fn khai
 *  bua_an là string|null KHÔNG enum, provider keystone lại không có structured
 *  output → model trả '午餐'/'lunch' là chuyện thật. bua_an nay QUYẾT ĐỊNH TIỀN
 *  (combo phủ bữa nào) nên rác phải thành undefined, không được lọt xuống. */
function sanitizeBua(v: unknown): "trua" | "toi" | undefined {
  return v === "trua" || v === "toi" ? v : undefined;
}

/** AI loai → BaoGiaItem loai (dich_vu gộp vào ticket). */
function toBaoGiaLoai(loai: AiExtractItem["loai"]): BaoGiaItem["loai"] {
  if (loai === "dich_vu") return "ticket";
  if (loai === "hotel") return "hotel";
  if (loai === "meal") return "meal";
  if (loai === "transport") return "transport";
  return "ticket";
}

/** Tỷ giá CỐ ĐỊNH quy đổi định mức USD → đơn giá menu khi mô tả chỉ ghi USD,
 *  KHÔNG khớp được giá cụ thể. Theo quy ước OP (khác tỷ giá quote khách). */
export const USD_BUDGET_RATE = 20_000;

/** Trích số USD đầu tiên trong text (định mức bữa ăn): "8USD", "8 USD", "USD 8",
 *  "8$", "$8", "8美金/美元", "7.5usd". Trả null nếu không có. */
export function parseUsdAmount(text: string | null | undefined): number | null {
  if (!text) return null;
  const t = String(text).replace(/(\d),(\d)/g, "$1.$2"); // 7,5 → 7.5
  const patterns = [
    /(\d+(?:\.\d+)?)\s*(?:usd|us\$|美金|美元)/i,
    /(\d+(?:\.\d+)?)\s*\$/,
    /(?:usd|us\$|\$)\s*(\d+(?:\.\d+)?)/i,
  ];
  for (const re of patterns) {
    const m = t.match(re);
    if (m) {
      const n = parseFloat(m[1]);
      if (!isNaN(n) && n > 0) return n;
    }
  }
  return null;
}

/** Giải 1 tham chiếu danh mục → {label, giá}. Dùng chung cho AI match lẫn alias.
 *  ok=false khi id không tồn tại trong master. KS lấy giá theo mùa (tourDate). */
interface MatchRefResult {
  ok: boolean;
  label: string;
  gia: number | null;
  foc_khach: number | null; // chính sách FOC (chỉ nhà hàng)
  foc_mien: number | null;
  bao_gom_bua_an?: BaoGomBuaAn | null; // combo đã gồm bữa ăn (chỉ cảnh điểm)
  bao_gom_ghi_chu?: string | null;
}
function resolveMatchRef(m: AiMatchRef, maps: ResolveMaps, tourDate?: string | null): MatchRefResult {
  const noFoc = { foc_khach: null, foc_mien: null };
  if (m.table === "khach_san") {
    const ks = maps.khachSan.get(m.id);
    if (!ks) return { ok: false, label: "", gia: null, ...noFoc };
    return { ok: true, label: ks.ten, gia: resolveGiaPhongValue(maps.khachSanGia.get(m.id) ?? [], tourDate), ...noFoc };
  }
  if (m.table === "nha_hang") {
    if (m.set_menu_id != null && maps.setMenu.has(m.set_menu_id)) {
      const s = maps.setMenu.get(m.set_menu_id)!;
      const nh = maps.nhaHang.get(s.nhaHangId);
      return { ok: true, label: `${s.nhaHangTen} · ${s.ten}`, gia: s.gia, foc_khach: nh?.foc_khach ?? null, foc_mien: nh?.foc_mien ?? null };
    }
    const nh = maps.nhaHang.get(m.id);
    if (!nh) return { ok: false, label: "", gia: null, ...noFoc };
    return { ok: true, label: nh.ten, gia: null, foc_khach: nh.foc_khach, foc_mien: nh.foc_mien }; // chưa chọn set → thiếu giá
  }
  if (m.table === "canh_diem") {
    const c = maps.canhDiem.get(m.id);
    if (!c) return { ok: false, label: "", gia: null, ...noFoc };
    return {
      ok: true, label: c.ten, gia: c.gia, ...noFoc,
      bao_gom_bua_an: c.bao_gom_bua_an ?? null,
      bao_gom_ghi_chu: c.bao_gom_ghi_chu ?? null,
    };
  }
  if (m.table === "nha_xe_loai_xe") {
    const x = maps.xe.get(m.id);
    if (!x) return { ok: false, label: "", gia: null, ...noFoc };
    return { ok: true, label: x.ten, gia: x.gia, ...noFoc };
  }
  return { ok: false, label: "", gia: null, ...noFoc };
}

/** Gắn chính sách FOC (foc_khach/foc_mien) + reset foc override khi NH có FOC. */
function withFoc(r: MatchRefResult): { foc_khach?: number; foc_mien?: number; foc?: number } {
  if (r.foc_khach != null && r.foc_khach > 0) {
    return { foc_khach: r.foc_khach, foc_mien: r.foc_mien ?? 0, foc: undefined };
  }
  return {};
}

/** Gắn cờ combo "đã gồm bữa ăn" lấy từ danh mục cảnh điểm (nguồn CHẮC CHẮN). */
function withCombo(r: MatchRefResult): Pick<ResolvedItem, "bao_gom_bua_an" | "bao_gom_nguon" | "bao_gom_ghi_chu"> {
  if (!r.bao_gom_bua_an) return {};
  return {
    bao_gom_bua_an: r.bao_gom_bua_an,
    bao_gom_nguon: "master",
    ...(r.bao_gom_ghi_chu ? { bao_gom_ghi_chu: r.bao_gom_ghi_chu } : {}),
  };
}

/** Ghép 1 item AI với master → giá/FOC/status. tourDate ('YYYY-MM-DD') cho giá KS theo mùa. */
function resolveOneCore(it: AiExtractItem, maps: ResolveMaps, tourDate?: string | null): ResolvedItem {
  const base = {
    ngay_so: it.ngay_so,
    loai: toBaoGiaLoai(it.loai),
    bua_an: it.loai === "meal" ? sanitizeBua(it.bua_an) : undefined,
    mo_ta: (it.ten_vi || it.ten_zh || "").trim(),
    foc: 0,
    ten_zh: it.ten_zh,
    ten_vi: it.ten_vi,
    ghi_chu: it.ghi_chu ?? "",
    confidence: it.match?.confidence ?? 0,
    ai_bao_gom: sanitizeBaoGom(it.da_bao_gom),
  };
  const m = it.match;
  const noRef = { match_table: null, match_id: null, match_set_menu_id: null } as const;
  if (!m) return { ...base, don_gia: 0, status: "unmatched", match_label: "Chưa khớp", ...noRef };

  const r = resolveMatchRef(m, maps, tourDate);
  if (!r.ok) return { ...base, don_gia: 0, status: "unmatched", match_label: "Chưa khớp", ...noRef };

  const don_gia = r.gia != null && r.gia > 0 ? r.gia : 0;
  return {
    ...base,
    ...withFoc(r), // gắn chính sách FOC nhà hàng (nếu có)
    ...withCombo(r), // vé combo đã gồm bữa ăn → ẩn dòng ăn cùng ngày
    don_gia,
    status: don_gia > 0 ? "matched" : "no_price",
    match_label: r.label,
    match_table: m.table,
    match_id: m.id,
    match_set_menu_id: m.set_menu_id ?? null,
  };
}

/** Resolve 1 item theo thứ tự ưu tiên:
 *  1. AI match danh mục (giá catalog) — giữ nếu khớp CHẮC (matched + conf ≥ 0.6).
 *  2. Bộ nhớ alias đã học (khi AI không chắc) → tự khớp danh mục / điền giá đã học.
 *  3. Định mức USD: mô tả ghi "N USD" → đơn giá = N × 20.000₫ (theo OP). */
function resolveOne(
  it: AiExtractItem, maps: ResolveMaps, tourDate?: string | null,
  aliasMap?: Map<string, AliasEntry>,
): ResolvedItem {
  const res = resolveOneCore(it, maps, tourDate);
  const strong = res.status === "matched" && (res.confidence ?? 0) >= 0.6;

  if (!strong && aliasMap && aliasMap.size > 0) {
    const a = aliasMap.get(aliasKeyOf(it.ten_zh || it.ten_vi || "", res.loai));
    if (a) {
      let label = a.ten_hien_thi || res.mo_ta;
      let gia: number | null = a.gia_override ?? null;
      let focPatch: { foc_khach?: number; foc_mien?: number; foc?: number } = {};
      // Alias trỏ sang dòng danh mục KHÁC → cờ combo phải lấy lại theo dòng mới
      // (kể cả khi dòng mới KHÔNG phải combo → xoá cờ cũ, tránh ẩn nhầm bữa ăn).
      let comboPatch: Pick<ResolvedItem, "bao_gom_bua_an" | "bao_gom_nguon" | "bao_gom_ghi_chu"> = {};
      if (a.match_table && a.target_id) {
        const r = resolveMatchRef(
          { table: a.match_table, id: a.target_id, set_menu_id: a.set_menu_id, confidence: 1 },
          maps, tourDate,
        );
        if (r.ok) {
          if (!a.ten_hien_thi) label = r.label;
          if (gia == null) gia = r.gia;
          focPatch = withFoc(r);
          comboPatch = r.bao_gom_bua_an
            ? withCombo(r)
            : { bao_gom_bua_an: null, bao_gom_nguon: undefined, bao_gom_ghi_chu: undefined };
        }
      }
      const dg = gia != null && gia > 0 ? gia : 0;
      if (dg > 0 || (a.match_table != null && a.target_id != null)) {
        return {
          ...res,
          ...focPatch,
          ...comboPatch,
          mo_ta: a.ten_hien_thi || res.mo_ta,
          don_gia: dg,
          status: dg > 0 ? "matched" : "no_price",
          match_label: `↺ ${label}`,
          match_table: a.match_table ?? res.match_table ?? null,
          match_id: a.target_id ?? res.match_id ?? null,
          match_set_menu_id: a.set_menu_id ?? res.match_set_menu_id ?? null,
          from_alias: true,
        };
      }
    }
  }

  if (res.don_gia <= 0) {
    const usd = parseUsdAmount(`${it.ten_zh ?? ""} ${it.ten_vi ?? ""} ${it.ghi_chu ?? ""}`);
    if (usd != null) {
      return {
        ...res,
        don_gia: Math.round(usd * USD_BUDGET_RATE),
        status: "matched",
        match_label: `Định mức ${usd} USD × 20.000`,
      };
    }
  }
  return res;
}

/** Resolve toàn bộ kết quả AI. aliasMap (tuỳ chọn) = bộ nhớ khớp tự học. */
export function resolveAiItems(
  result: AiExtractResult,
  maps: ResolveMaps,
  tourDate?: string | null,
  aliasMap?: Map<string, AliasEntry>,
): ResolvedItem[] {
  return (result.items ?? []).map((it) => resolveOne(it, maps, tourDate, aliasMap));
}

// ── Phương án khách sạn (chọn 1 / đêm) ──
// 1 đêm có thể có nhiều KS lựa chọn → KHÔNG cộng dồn, user chọn 1. Gom các item
// loai='hotel' theo ngay_so; đêm nào có ≥2 KS = nhóm phương án.

/** ngay_so → danh sách index (trong rows) các item KS, chỉ đêm có ≥2 phương án. */
export function hotelChoiceGroups(rows: ResolvedItem[]): Map<number, number[]> {
  const byNight = new Map<number, number[]>();
  rows.forEach((r, i) => {
    if (r.loai !== "hotel") return;
    const arr = byNight.get(r.ngay_so);
    if (arr) arr.push(i);
    else byNight.set(r.ngay_so, [i]);
  });
  for (const [night, idxs] of byNight) if (idxs.length < 2) byNight.delete(night);
  return byNight;
}

/** Mặc định chọn: KS có giá (matched) đầu tiên trong nhóm, không có thì phương án đầu. */
export function defaultHotelSelection(
  rows: ResolvedItem[],
  groups: Map<number, number[]>,
): Record<number, number> {
  const sel: Record<number, number> = {};
  for (const [night, idxs] of groups) {
    sel[night] = idxs.find((i) => rows[i].don_gia > 0) ?? idxs[0];
  }
  return sel;
}

/** Index các KS bị loại (mỗi nhóm phương án chỉ giữ 1). */
export function droppedByHotel(groups: Map<number, number[]>, selected: Record<number, number>): Set<number> {
  const dropped = new Set<number>();
  for (const [night, idxs] of groups) {
    const keep = selected[night];
    for (const i of idxs) if (i !== keep) dropped.add(i);
  }
  return dropped;
}

/** Lọc rows đưa vào báo giá: với mỗi nhóm phương án KS, chỉ giữ phương án được chọn. */
export function applyHotelSelection(
  rows: ResolvedItem[],
  groups: Map<number, number[]>,
  selected: Record<number, number>,
): ResolvedItem[] {
  const dropped = droppedByHotel(groups, selected);
  return rows.filter((_, i) => !dropped.has(i));
}

// ── Combo đã bao gồm bữa ăn (chống tính tiền 2 lần) ──────────────────────────
// Lịch trình viết "đi cáp treo Bà Nà" + "ăn buffet trên đỉnh" là 2 ý riêng → AI
// trích 2 dòng → khớp cả vé combo lẫn nhà hàng → BỮA ĂN BỊ TÍNH 2 LẦN.
//
// Hai mức, cố ý tách bạch:
//   1. ĐÃ XÁC NHẬN (`bao_gom_bua_an`: danh mục canh_diem, hoặc OP bấm xác nhận)
//      → ẩn hẳn dòng ăn khỏi báo giá. Tất định, không phụ thuộc AI.
//   2. NGHI NGỜ (AI đọc "含午餐" / tên có "combo, 套票, buffet"...)
//      → CHỈ cảnh báo. Bỏ dòng ăn theo phỏng đoán của model = báo giá hụt tiền
//        mà không ai thấy, nguy hiểm hơn tính dư.

/** Combo gồm `baoGom` có phủ bữa `bua` không. Dòng ăn KHÔNG khai bữa chỉ bị
 *  'ca_hai' phủ — không đoán bừa là trưa hay tối. */
export function comboCoversBua(baoGom: BaoGomBuaAn, bua: "trua" | "toi" | undefined): boolean {
  if (baoGom === "ca_hai") return true;
  return bua === baoGom;
}

export const BUA_LABEL: Record<BaoGomBuaAn, string> = {
  trua: "ăn trưa",
  toi: "ăn tối",
  ca_hai: "ăn trưa + tối",
};

// Từ khoá gợi ý vé combo có kèm ăn. Tách 2 loại vì cách so khớp KHÁC nhau:
//  - TU (latin, đã bỏ dấu): so theo TỪ, có khoảng trắng 2 đầu. Nếu so chuỗi thô
//    thì "quán trưa" → "quan trua" lại chứa "an trua" → cảnh báo rác.
//  - HAN (chữ Hán): không có khoảng trắng nên so chuỗi thẳng.
const TU_TRUA = ["an trua", "com trua", "lunch"];
const HAN_TRUA = ["含午餐", "包含午餐", "附午餐"];
const TU_TOI = ["an toi", "com toi", "dinner"];
const HAN_TOI = ["含晚餐", "包含晚餐", "附晚餐"];
const TU_CHUNG = ["combo", "tron goi", "buffet"];
const HAN_CHUNG = ["套票", "套餐", "含餐", "含餐食", "自助餐"];
// Text nói rõ KHÔNG bao gồm → đừng gợi ý combo (xác nhận nhầm = ẩn oan bữa ăn).
const TU_PHU_DINH = ["tu tuc", "tu chi", "khong bao gom", "khong gom", "chua bao gom"];
const HAN_PHU_DINH = ["自理", "不含", "不包含", "自付"];

/** Đoán 1 dòng vé có phải combo kèm ăn không, dựa trên text lịch trình.
 *  → 'trua'|'toi'|'ca_hai' khi đoán được bữa; 'khong_ro' khi chỉ thấy dấu hiệu
 *  combo mà không rõ bữa nào; null khi không có dấu hiệu gì. */
export function detectComboTuText(...texts: (string | null | undefined)[]): BaoGomBuaAn | "khong_ro" | null {
  const raw = normalizeAliasKey(texts.filter(Boolean).join(" "));
  if (!raw) return null;
  const hay = ` ${raw} `;
  const coTu = (list: string[]) => list.some((k) => hay.includes(` ${k} `));
  const coHan = (list: string[]) => list.some((k) => raw.includes(k));
  const co = (tu: string[], han: string[]) => coTu(tu) || coHan(han);

  if (co(TU_PHU_DINH, HAN_PHU_DINH)) return null; // "ăn trưa tự túc", "不含餐"
  const trua = co(TU_TRUA, HAN_TRUA);
  const toi = co(TU_TOI, HAN_TOI);
  if (trua && toi) return "ca_hai";
  // Nêu đích danh bữa ăn trong tên 1 dòng VÉ = vé đó kèm bữa đó.
  if (trua) return "trua";
  if (toi) return "toi";
  return co(TU_CHUNG, HAN_CHUNG) ? "khong_ro" : null;
}

/** 1 dòng ăn bị ẩn vì đã nằm trong combo. */
export interface ComboSuppression {
  /** Index dòng vé combo đang phủ bữa này. */
  byIdx: number;
  label: string;
  bua: BaoGomBuaAn;
  ghi_chu?: string;
}

/** 1 dòng vé bị NGHI là combo kèm ăn (chưa xác nhận) → chỉ cảnh báo. */
export interface ComboWarning {
  /** Bữa đoán được; null = không rõ bữa nào (OP chọn). */
  bua: BaoGomBuaAn | null;
  /** Các dòng ăn cùng ngày có thể đang bị tính trùng. */
  mealIdxs: number[];
  /** 'ai' = model tự khai da_bao_gom · 'text' = bắt theo từ khoá trong tên ·
   *  'khong_ro_bua' = vé ĐÃ khai gồm bữa nhưng dòng ăn trong ngày không ghi rõ
   *  trưa/tối nên không trừ được dòng nào (im lặng ở đây là tính tiền 2 lần). */
  nguon: "ai" | "text" | "khong_ro_bua";
}

/** Cờ combo tương ứng 1 tham chiếu danh mục. BẮT BUỘC dùng mỗi khi dòng ĐỔI dòng
 *  danh mục (chọn từ picker, gõ đè tên, đổi loại): phải nạp cờ của dòng MỚI hoặc
 *  XOÁ hẳn. Để cờ cũ bám lại là sai tiền cả 2 chiều — ẩn oan bữa ăn (báo giá hụt)
 *  hoặc bỏ sót combo (tính 2 lần). Luôn trả đủ key để patch xoá được giá trị cũ. */
export function comboPatchForRef(
  maps: ResolveMaps | undefined,
  table: MatchTable | null | undefined,
  id: number | null | undefined,
): Pick<ResolvedItem, "bao_gom_bua_an" | "bao_gom_nguon" | "bao_gom_ghi_chu" | "bo_qua_combo"> {
  const c = maps && table === "canh_diem" && id != null ? maps.canhDiem.get(id) : null;
  const bua = sanitizeBaoGom(c?.bao_gom_bua_an);
  if (!bua) return { bao_gom_bua_an: null, bao_gom_nguon: undefined, bao_gom_ghi_chu: undefined, bo_qua_combo: undefined };
  return {
    bao_gom_bua_an: bua,
    bao_gom_nguon: "master",
    bao_gom_ghi_chu: c?.bao_gom_ghi_chu ?? undefined,
    bo_qua_combo: undefined,
  };
}

export interface ComboAnalysis {
  /** index dòng ĂN bị ẩn → thông tin combo phủ nó. */
  suppressed: Map<number, ComboSuppression>;
  /** index dòng VÉ nghi là combo → cảnh báo. */
  warnings: Map<number, ComboWarning>;
  /** index dòng ĂN lẽ ra bị ẩn nhưng OP bắt tính riêng (`tinh_rieng`). */
  overridden: Set<number>;
}

/** Soi toàn bộ rows: dòng ăn nào đã nằm trong combo (ẩn), dòng vé nào đáng ngờ
 *  (cảnh báo). Thuần tính toán từ rows hiện tại → OP sửa/xoá dòng là tự cập nhật,
 *  không có state cũ kẹt lại. */
export function analyzeCombo(rows: ResolvedItem[], boQua?: ReadonlySet<number>): ComboAnalysis {
  const suppressed = new Map<number, ComboSuppression>();
  const warnings = new Map<number, ComboWarning>();
  const overridden = new Set<number>();

  const mealsByDay = new Map<number, number[]>();
  rows.forEach((r, i) => {
    if (r.loai !== "meal") return;
    const arr = mealsByDay.get(r.ngay_so);
    if (arr) arr.push(i);
    else mealsByDay.set(r.ngay_so, [i]);
  });
  if (mealsByDay.size === 0) return { suppressed, warnings, overridden };

  rows.forEach((r, i) => {
    // Dòng ăn không thể là NGUỒN combo; mọi loại còn lại thì có (du thuyền ngủ
    // đêm 含晚餐 ra loai='hotel', xe trọn gói kèm ăn ra 'transport').
    if (r.loai === "meal") return;
    // Dòng KHÔNG vào báo giá (phương án khách sạn không được chọn) thì không được
    // trừ bữa ăn: du thuyền 含晚餐 bị bỏ mà vẫn ẩn bữa tối = báo giá mất hẳn tiền
    // bữa đó, lại không dòng nào mang ghi chú "Đã gồm" để lần ra.
    if (boQua?.has(i)) return;
    const meals = mealsByDay.get(r.ngay_so);
    if (!meals || meals.length === 0) return;

    // 1. Đã xác nhận → ẩn dòng ăn tương ứng.
    if (r.bao_gom_bua_an) {
      let daTru = 0;
      for (const mi of meals) {
        const m = rows[mi];
        if (suppressed.has(mi)) continue;        // combo đầu tiên làm chủ
        if (!comboCoversBua(r.bao_gom_bua_an, m.bua_an)) continue;
        if (m.tinh_rieng) { overridden.add(mi); continue; } // OP bắt tính riêng
        suppressed.set(mi, {
          byIdx: i,
          label: r.mo_ta || r.match_label || "combo",
          bua: r.bao_gom_bua_an,
          ...(r.bao_gom_ghi_chu ? { ghi_chu: r.bao_gom_ghi_chu } : {}),
        });
        daTru++;
      }
      // Khai "gồm ăn trưa" mà không trừ được dòng nào, trong khi ngày đó còn dòng
      // ăn KHÔNG ghi rõ trưa/tối → im lặng ở đây là tệ nhất: OP nhìn chip xanh
      // tưởng đã trừ, thực tế bữa ăn vẫn tính đủ tiền.
      if (daTru === 0 && !r.bo_qua_combo) {
        const moHo = meals.filter((mi) => !suppressed.has(mi) && !rows[mi].tinh_rieng && !rows[mi].bua_an);
        if (moHo.length > 0) warnings.set(i, { bua: r.bao_gom_bua_an, mealIdxs: moHo, nguon: "khong_ro_bua" });
      }
      return; // đã xác nhận → không chạy nhánh đoán mò bên dưới
    }

    // 2. Nghi ngờ → cảnh báo (KHÔNG tự bỏ dòng ăn).
    if (r.bo_qua_combo) return;
    // Đoán theo TỪ KHOÁ chỉ áp cho dòng VÉ. Xe "trọn gói", khách sạn "gồm buffet
    // sáng" là cách nói bình thường → bắn cảnh báo ở đó chỉ tạo nhiễu, mà cảnh báo
    // nhiễu thì OP quen tay bỏ qua cả cảnh báo thật. Cờ AI vẫn nhận ở mọi loại.
    const hint = r.ai_bao_gom
      ?? (r.loai === "ticket" ? detectComboTuText(r.mo_ta, r.ten_zh, r.ten_vi, r.ghi_chu) : null);
    if (!hint) return;
    const bua = hint === "khong_ro" ? null : hint;
    const lienQuan = meals.filter((mi) => {
      const m = rows[mi];
      if (m.tinh_rieng) return false;
      return bua == null || comboCoversBua(bua, m.bua_an);
    });
    if (lienQuan.length === 0) return;
    warnings.set(i, { bua, mealIdxs: lienQuan, nguon: r.ai_bao_gom ? "ai" : "text" });
  });

  return { suppressed, warnings, overridden };
}

/** Lọc lại dòng nạp từ BẢN NHÁP đã lưu (jsonb). Nháp không đi qua resolveOneCore
 *  nên chuỗi rác thời chưa có sanitize (bua_an='午餐') vẫn nằm nguyên trong đó —
 *  mà rác thì lọt qua CẢ lưới trừ lẫn lưới cảnh báo: bữa ăn tính 2 lần, im lặng. */
export function sanitizeDraftRows(rows: ResolvedItem[] | null | undefined): ResolvedItem[] {
  return (rows ?? []).map((r) => ({
    ...r,
    bua_an: r.loai === "meal" ? sanitizeBua(r.bua_an) : undefined,
    bao_gom_bua_an: sanitizeBaoGom(r.bao_gom_bua_an),
    ai_bao_gom: sanitizeBaoGom(r.ai_bao_gom),
  }));
}

/** Rows THỰC SỰ vào báo giá: bỏ KS không chọn + bỏ dòng ăn đã nằm trong combo. */
export function applyExclusions(
  rows: ResolvedItem[],
  groups: Map<number, number[]>,
  selected: Record<number, number>,
  combo: ComboAnalysis,
): ResolvedItem[] {
  const dropped = droppedByHotel(groups, selected);
  for (const i of combo.suppressed.keys()) dropped.add(i);
  return rows.filter((_, i) => !dropped.has(i));
}

/** 1 alias để gửi RPC học (jsonb). */
export interface AliasLearnInput {
  text_key: string;
  loai: BaoGiaItem["loai"];
  match_table: MatchTable | null;
  target_id: number | null;
  set_menu_id: number | null;
  ten_hien_thi: string;
  gia_override: number | null;
  tao_boi: string | null;
}

/** Rút alias để HỌC từ các dòng đã áp dụng. Chỉ học dòng có kết quả cụ thể
 *  (có ref danh mục HOẶC giá > 0) + có key. Dòng có ref danh mục → gia_override
 *  = null (giá lấy động từ catalog, KS theo mùa); dòng chỉ-giá → học luôn giá. */
export function aliasesToLearn(rows: ResolvedItem[], userId?: string | null): AliasLearnInput[] {
  const out: AliasLearnInput[] = [];
  for (const r of rows) {
    const key = normalizeAliasKey(r.ten_zh || r.ten_vi || r.mo_ta);
    if (!key) continue;
    const hasRef = r.match_table != null && r.match_id != null;
    const hasPrice = r.don_gia > 0;
    if (!hasRef && !hasPrice) continue;
    out.push({
      text_key: key,
      loai: r.loai,
      match_table: hasRef ? r.match_table! : null,
      target_id: hasRef ? r.match_id! : null,
      set_menu_id: hasRef ? (r.match_set_menu_id ?? null) : null,
      ten_hien_thi: r.mo_ta,
      gia_override: hasRef ? null : (hasPrice ? r.don_gia : null),
      tao_boi: userId ?? null,
    });
  }
  return out;
}

/** 1 dòng giá phòng cần GHI NGƯỢC vào master khach_san_gia_phong. */
export interface GiaPhongWriteback {
  khach_san_id: number;
  gia: number;
  ten: string;
}

/** Rút các KS cần ghi ngược giá vào master từ dòng review đã áp dụng: dòng hotel
 *  khớp danh mục + có giá (OP nhập tay vì master trống) + master CHƯA có dòng giá
 *  nào cho KS đó. CHỈ tạo dòng "Mặc định" mới — KHÔNG bao giờ đè giá sẵn có
 *  (giá từ báo giá chỉ là tham khảo, không được ảnh hưởng giá đang dùng).
 *  KS xuất hiện nhiều đêm → lấy giá dòng đầu tiên. */
export function giaPhongWritebacks(
  rows: ResolvedItem[],
  khachSanGia: ResolveMaps["khachSanGia"],
): GiaPhongWriteback[] {
  const out = new Map<number, GiaPhongWriteback>();
  for (const r of rows) {
    if (r.loai !== "hotel" || r.match_table !== "khach_san" || r.match_id == null) continue;
    if (r.don_gia <= 0) continue;
    // Đã có dòng giá (kể cả inactive) → không đụng tới, tôn trọng dữ liệu sẵn có.
    if ((khachSanGia.get(r.match_id)?.length ?? 0) > 0) continue;
    if (!out.has(r.match_id)) {
      out.set(r.match_id, { khach_san_id: r.match_id, gia: r.don_gia, ten: r.match_label || r.mo_ta });
    }
  }
  return [...out.values()];
}

/** Ghi chú xuất ra báo giá. Vé combo phải ghi rõ đã gồm bữa nào: dòng ăn tương
 *  ứng đã bị ẩn, không ghi lại thì bảng costing / Word mất dấu bữa ăn đó.
 *  `daTru` = các dòng THỰC SỰ đã trừ được 1 bữa. Thiếu nó thì ghi chú "Đã gồm ăn
 *  trưa" dán cả lên dòng chưa trừ gì (OP bấm "vẫn tính riêng", ngày không có bữa
 *  ăn nào) → người duyệt đọc rồi xoá dòng ăn cho khỏi trùng = báo giá hụt tiền. */
function ghiChuVoiCombo(r: ResolvedItem, daTru?: ReadonlySet<ResolvedItem>): string {
  if (r.loai === "meal" || !r.bao_gom_bua_an) return r.ghi_chu;
  if (daTru && !daTru.has(r)) return r.ghi_chu;
  const note = `Đã gồm ${BUA_LABEL[r.bao_gom_bua_an]}${r.bao_gom_ghi_chu ? ` (${r.bao_gom_ghi_chu})` : ""}`;
  const cur = (r.ghi_chu ?? "").trim();
  if (!cur) return note;
  return cur.includes("Đã gồm ") ? cur : `${cur} · ${note}`;
}

/** Chuyển ResolvedItem (sau khi user review) → BaoGiaItem để nạp vào ket_qua.items.
 *  `daTru` (tuỳ chọn) = các dòng combo đã thực sự trừ được bữa ăn — xem ghiChuVoiCombo. */
export function toBaoGiaItems(rows: ResolvedItem[], daTru?: ReadonlySet<ResolvedItem>): BaoGiaItem[] {
  return rows.map((r) => ({
    loai: r.loai,
    mo_ta: r.mo_ta,
    don_gia: r.don_gia,
    ghi_chu: ghiChuVoiCombo(r, daTru),
    ngay_so: r.ngay_so,
    ...(r.bua_an ? { bua_an: r.bua_an } : {}),
    ...(r.foc != null ? { foc: r.foc } : {}),
    ...(r.foc_khach != null ? { foc_khach: r.foc_khach, foc_mien: r.foc_mien ?? 0 } : {}),
    // Giữ tên gốc tiếng Trung để bảng costing hiển thị song ngữ.
    ...(r.ten_zh ? { ten_zh: r.ten_zh } : {}),
  }));
}
