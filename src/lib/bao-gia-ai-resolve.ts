// AI tính báo giá — RESOLVE: ghép kết quả AI (id dòng master, KHÔNG giá) với dữ
// liệu master ở client để ra giá + FOC + trạng thái khớp. Pure → test được.
// Triết lý: AI chọn dòng, code lấy giá từ DB (snapshot). Xem project_bao_gia_ai_extract.

import type { BaoGiaItem } from "@/hooks/use-bao-gia";
import { resolveGiaPhongValue, type GiaPhongRow } from "@/lib/khach-san-gia-phong";

// ── Shape AI trả về (khớp schema edge fn) ──
export type MatchTable = "khach_san" | "nha_hang" | "canh_diem" | "nha_xe_loai_xe";
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
}
export interface AiExtractResult {
  ten_chuong_trinh: string;
  so_ngay: number;
  items: AiExtractItem[];
}

// ── Lookup master (build từ React Query ở UI; pure data cho hàm resolve) ──
export interface ResolveMaps {
  /** canh_diem.id → { ten, gia_mac_dinh } */
  canhDiem: Map<number, { ten: string; gia: number | null }>;
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
    return { ok: true, label: c.ten, gia: c.gia, ...noFoc };
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

/** Ghép 1 item AI với master → giá/FOC/status. tourDate ('YYYY-MM-DD') cho giá KS theo mùa. */
function resolveOneCore(it: AiExtractItem, maps: ResolveMaps, tourDate?: string | null): ResolvedItem {
  const base = {
    ngay_so: it.ngay_so,
    loai: toBaoGiaLoai(it.loai),
    bua_an: it.loai === "meal" && it.bua_an ? it.bua_an : undefined,
    mo_ta: (it.ten_vi || it.ten_zh || "").trim(),
    foc: 0,
    ten_zh: it.ten_zh,
    ten_vi: it.ten_vi,
    ghi_chu: it.ghi_chu ?? "",
    confidence: it.match?.confidence ?? 0,
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
      if (a.match_table && a.target_id) {
        const r = resolveMatchRef(
          { table: a.match_table, id: a.target_id, set_menu_id: a.set_menu_id, confidence: 1 },
          maps, tourDate,
        );
        if (r.ok) {
          if (!a.ten_hien_thi) label = r.label;
          if (gia == null) gia = r.gia;
          focPatch = withFoc(r);
        }
      }
      const dg = gia != null && gia > 0 ? gia : 0;
      if (dg > 0 || (a.match_table != null && a.target_id != null)) {
        return {
          ...res,
          ...focPatch,
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

/** Lọc rows đưa vào báo giá: với mỗi nhóm phương án KS, chỉ giữ phương án được chọn. */
export function applyHotelSelection(
  rows: ResolvedItem[],
  groups: Map<number, number[]>,
  selected: Record<number, number>,
): ResolvedItem[] {
  const dropped = new Set<number>();
  for (const [night, idxs] of groups) {
    const keep = selected[night];
    for (const i of idxs) if (i !== keep) dropped.add(i);
  }
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

/** Chuyển ResolvedItem (sau khi user review) → BaoGiaItem để nạp vào ket_qua.items. */
export function toBaoGiaItems(rows: ResolvedItem[]): BaoGiaItem[] {
  return rows.map((r) => ({
    loai: r.loai,
    mo_ta: r.mo_ta,
    don_gia: r.don_gia,
    ghi_chu: r.ghi_chu,
    ngay_so: r.ngay_so,
    ...(r.bua_an ? { bua_an: r.bua_an } : {}),
    ...(r.foc != null ? { foc: r.foc } : {}),
    ...(r.foc_khach != null ? { foc_khach: r.foc_khach, foc_mien: r.foc_mien ?? 0 } : {}),
    // Giữ tên gốc tiếng Trung để bảng costing hiển thị song ngữ.
    ...(r.ten_zh ? { ten_zh: r.ten_zh } : {}),
  }));
}
