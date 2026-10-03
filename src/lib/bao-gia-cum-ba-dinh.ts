// CỤM BA ĐÌNH — một vé vào được cả Phủ Chủ tịch lẫn nhà sàn, đi ngoài thì không vé.
//
// Lịch trình đối tác gộp cả cụm vào MỘT dòng: "巴亭廣場-胡志明陵寢-主席府-
// 胡志明故居". Quảng trường, lăng, chùa Một Cột nhìn từ ngoài không mất vé; vào
// khuôn viên Phủ Chủ tịch (主席府 / 總督府) và nhà sàn (胡志明故居) thì mua MỘT
// vé chung cho cả hai nơi. Ghi rõ 外觀 (xem ngoài) thì lại thành không vé.
//
// Vì sao phải là LUẬT chứ không phải sổ tay: sổ tay học theo cả chuỗi chữ, mà
// cụm này mỗi đối tác viết một kiểu (dấu phẩy, gạch nối, thêm bớt điểm) nên mỗi
// biến thể là một khoá mới. Đúng hai khoá từng học được đều ghi 40.000 cho dòng
// CHỈ ĐI NGOÀI — vừa thu oan chỗ không có vé, vừa không ai tra trúng cụm có nhà
// sàn, nên cụm có vé thật thì báo giá để trống.
//
// Bảo tàng Hồ Chí Minh (胡志明博物館) nằm sát lăng nhưng KHÔNG nằm trong vé cụm —
// tính tiền riêng (OP chốt 03/10/2026). Đối tác viết chung dòng cụm thì tách ra một
// dòng riêng (xem lib/bao-gia-tach-dong.ts), dòng cụm giữ nguyên cách tính.

import { boDau } from "./bang-gia-sua-tay";
import { gianHoa } from "./han-gian-hoa";
import type { ResolveMaps, ResolvedItem } from "./bao-gia-ai-resolve";
import { daTach, dongTach, ghiDaTach, timVe, type VeDanhMuc } from "./bao-gia-tach-dong";

/** Có vào bên trong (mua vé) hay chỉ nhìn từ ngoài (không vé). */
export type VeCumBaDinh = "vao_trong" | "ngoai_quan";

/** Nơi PHẢI mua vé mới vào được. Chữ đã giản hoá: 總督府→总督府, 故居 giữ nguyên.
 *  總督府 (phủ Toàn quyền) là tên cũ của chính Phủ Chủ tịch — cùng một nơi. */
const NOI_BAN_VE_ZH = ["主席府", "总督府", "故居", "高脚屋"];

/** Điểm trong cụm KHÔNG bán vé: quảng trường Ba Đình, lăng, chùa Một Cột.
 *  Nhận cả "巴庭" (đối tác hay viết nhầm 亭 thành 庭) và "1柱寺" (số đã bị nắn). */
const DIEM_MIEN_PHI_ZH = ["巴亭", "巴庭", "陵寝", "胡志明陵", "柱寺", "柱庙"];

/** Dấu hiệu chỉ nhìn từ ngoài. */
const NGOAI_QUAN_ZH = ["外观", "远观", "路过", "经过", "车游", "车观", "拍照"];

/** Bản tiếng Việt — chỉ dùng khi dòng KHÔNG có chữ Hán (OP tự gõ tay). */
const NOI_BAN_VE_VI = ["phu chu tich", "phu toan quyen", "nha san"];
const DIEM_MIEN_PHI_VI = ["quang truong ba dinh", "ba dinh", "lang bac", "lang chu tich", "lang ho chi minh", "chua mot cot"];
const NGOAI_QUAN_VI = ["xem ngoai", "ben ngoai", "nhin tu ngoai", "di qua", "ngoai quan", "chup anh"];

/** Dấu ngăn giữa các điểm trong một dòng. Cần tách vì chữ 外觀 chỉ thuộc về điểm
 *  đứng ngay trước nó: "胡志明陵寢(外觀)、主席府" là VÀO phủ, không phải đi ngoài
 *  cả cụm — gộp chung cả dòng mà xét là bỏ mất một vé thật. */
const RE_NGAN = /[、,，;；/／|｜+＋\-—–~～]+/;

const chuaMot = (s: string, ds: readonly string[]) => ds.some((t) => s.includes(t));

/**
 * Dòng lịch trình này thuộc cụm Ba Đình hay không, và có mua vé hay không.
 * `null` = không liên quan tới cụm → hệ thống cứ tính như mọi dòng khác.
 *
 * Ưu tiên tuyệt đối chữ Hán gốc của đối tác: tên tiếng Việt trên dòng có thể là
 * nhãn cũ do khớp nhầm ("Phủ chủ tịch" gán cho dòng chỉ có lăng và quảng
 * trường), tin vào nó là tính tiền cho một chỗ khách không hề vào.
 */
export function phanLoaiCumBaDinh(
  tenZh: string | null | undefined,
  tenVi?: string | null,
): VeCumBaDinh | null {
  const zh = gianHoa((tenZh ?? "").normalize("NFKC")).toLowerCase();
  const coHan = /[\u4e00-\u9fff]/.test(zh);

  if (coHan) {
    if (!chuaMot(zh, NOI_BAN_VE_ZH) && !chuaMot(zh, DIEM_MIEN_PHI_ZH)) return null;
    // Vào trong = có ít nhất MỘT mảnh nêu nơi bán vé mà không kèm chữ "đi ngoài".
    const vao = zh.split(RE_NGAN).some((m) => chuaMot(m, NOI_BAN_VE_ZH) && !chuaMot(m, NGOAI_QUAN_ZH));
    return vao ? "vao_trong" : "ngoai_quan";
  }

  const vi = boDau(tenVi ?? "").toLowerCase();
  if (!vi) return null;
  if (!chuaMot(vi, NOI_BAN_VE_VI) && !chuaMot(vi, DIEM_MIEN_PHI_VI)) return null;
  const vao = vi.split(RE_NGAN).some((m) => chuaMot(m, NOI_BAN_VE_VI) && !chuaMot(m, NGOAI_QUAN_VI));
  return vao ? "vao_trong" : "ngoai_quan";
}

export const GHI_CHU_KHONG_VAO = "Chỉ nhìn từ ngoài — không mua vé";
export const GHI_CHU_CHUNG_VE = "Đã gồm trong vé Phủ Chủ tịch + nhà sàn";

/** Vé cụm trong danh mục cảnh điểm — nguồn GIÁ, để vé lên giá thì sửa ở danh
 *  mục chứ không phải sửa code. Ưu tiên bản ghi "Phủ Chủ tịch" có giá; không có
 *  thì tới bản ghi nhà sàn (cùng một vé). Bỏ qua bản ghi ghi rõ "xem ngoài". */
export function veCumBaDinh(maps: ResolveMaps): { id: number; ten: string; gia: number } | null {
  let nhaSan: { id: number; ten: string; gia: number } | null = null;
  for (const [id, c] of maps.canhDiem) {
    if (!c.gia || c.gia <= 0) continue;
    const ten = boDau(c.ten ?? "").toLowerCase();
    if (chuaMot(ten, NGOAI_QUAN_VI)) continue;
    if (ten.includes("phu chu tich") || ten.includes("phu toan quyen")) return { id, ten: c.ten, gia: c.gia };
    if (ten.includes("nha san") && !nhaSan) nhaSan = { id, ten: c.ten, gia: c.gia };
  }
  return nhaSan;
}

const themGhiChu = (cu: string | undefined, them: string) =>
  (cu ?? "").includes(them) ? (cu ?? "") : [cu?.trim(), them].filter(Boolean).join(" · ");

const coHanChu = (s: string) => /[一-鿿]/.test(s);
const BAO_TANG_HCM_VI = ["bao tang ho chi minh", "bao tang bac ho", "bao tang hcm"];

/** Một mảnh có phải Bảo tàng Hồ Chí Minh (mà không chỉ đi ngoài) không. Mảnh chữ Hán
 *  phải có chữ 胡 hoặc đúng "博物館" trơn: quanh Ba Đình còn bảo tàng khác
 *  (軍事博物館 — Quân sự), không được nhận nhầm. */
function laManhBaoTangHcm(m: string): boolean {
  const zh = gianHoa(m.normalize("NFKC")).toLowerCase();
  if (coHanChu(zh)) {
    if (!zh.includes("博物馆") || chuaMot(zh, NGOAI_QUAN_ZH)) return false;
    return zh.includes("胡") || zh.replace(/[()（）\s]/g, "") === "博物馆";
  }
  const vi = boDau(m).toLowerCase();
  return chuaMot(vi, BAO_TANG_HCM_VI) && !chuaMot(vi, NGOAI_QUAN_VI);
}

/** Mảnh nêu Bảo tàng Hồ Chí Minh trong dòng, nguyên văn đối tác; null = không có.
 *  Có chữ Hán thì chỉ đọc chữ Hán — như phanLoaiCumBaDinh. */
export function manhBaoTangHcm(tenZh: string | null | undefined, tenVi?: string | null): string | null {
  const goc = coHanChu(tenZh ?? "") ? tenZh : tenVi;
  for (const m of (goc ?? "").split(RE_NGAN)) if (laManhBaoTangHcm(m)) return m.trim();
  return null;
}

/** Vé Bảo tàng Hồ Chí Minh trong danh mục cảnh điểm (nguồn giá); null = chưa có. */
export function veBaoTangHcm(maps: ResolveMaps): VeDanhMuc | null {
  return timVe(maps, (ten) => BAO_TANG_HCM_VI.some((k) => ten.includes(` ${k} `)));
}

/**
 * Áp luật cụm Ba Đình lên các dòng vé. Trả MẢNG MỚI (không sửa tại chỗ).
 *
 *  · chỉ nhìn từ ngoài            → 0 đồng
 *  · vào trong, dòng chưa có giá  → giá vé cụm trong danh mục
 *  · vào trong, dòng đã có giá    → GIỮ giá đó (người mình từng gõ đáng tin hơn
 *    một con số mặc định; danh mục có thể chưa kịp lên giá)
 *  · vào trong lần thứ hai trong cùng ngày → 0, vì một vé vào được cả hai nơi
 *  · dòng cụm có Bảo tàng Hồ Chí Minh → tách bảo tàng ra một dòng riêng nối vào
 *    CUỐI mảng (mỗi ngày một lần; ngày đã có dòng bảo tàng riêng thì thôi)
 *
 * `sua_tay` (OP vừa gõ trong màn review) thắng tất cả, không đụng tới.
 */
export function apVeCumBaDinh(
  rows: readonly ResolvedItem[],
  maps: ResolveMaps,
): ResolvedItem[] {
  const ve = veCumBaDinh(maps);
  const ra = [...rows];
  const daTinhTrongNgay = new Set<number>();
  // Ngày đã có dòng bảo tàng riêng: đối tác tự viết riêng, hoặc luật đã tách ở lần trước.
  const coBaoTangRieng = new Set(rows.filter(laDongBaoTangRieng).map((r) => r.ngay_so));
  const veBaoTang = veBaoTangHcm(maps);
  const them: ResolvedItem[] = [];

  for (let i = 0; i < ra.length; i++) {
    const r = ra[i];
    if (r.loai !== "ticket" || r.sua_tay) continue;
    const loai = phanLoaiCumBaDinh(r.ten_zh, r.mo_ta || r.match_label);
    if (!loai) continue;

    let moi: ResolvedItem;
    if (loai === "ngoai_quan") {
      moi = {
        ...r, don_gia: 0, nguon_gia: undefined,
        ghi_chu: themGhiChu(r.ghi_chu, GHI_CHU_KHONG_VAO),
        cum_ba_dinh: "ngoai_quan",
      };
    } else if (daTinhTrongNgay.has(r.ngay_so)) {
      moi = {
        ...r, don_gia: 0, nguon_gia: undefined,
        ghi_chu: themGhiChu(r.ghi_chu, GHI_CHU_CHUNG_VE),
        cum_ba_dinh: "da_gom",
      };
    } else {
      daTinhTrongNgay.add(r.ngay_so);
      const giuGiaCu = r.don_gia > 0;
      moi = giuGiaCu || !ve
        ? { ...r, cum_ba_dinh: "vao_trong" }
        : {
          ...r, don_gia: ve.gia, nguon_gia: undefined, status: "matched",
          match_table: "canh_diem", match_id: ve.id, match_label: ve.ten,
          cum_ba_dinh: "vao_trong",
        };
    }

    const manh = manhBaoTangHcm(r.ten_zh, r.mo_ta);
    if (manh && !daTach(r, "bao_tang_hcm")) {
      if (!coBaoTangRieng.has(r.ngay_so)) {
        them.push(dongTach(moi, "bao_tang_hcm", {
          ten_zh: coHanChu(r.ten_zh) ? manh : "", mo_ta: "Bảo tàng Hồ Chí Minh",
        }, veBaoTang));
        coBaoTangRieng.add(r.ngay_so);
      }
      moi = ghiDaTach(moi, "bao_tang_hcm");
    }
    ra[i] = moi;
  }
  return them.length ? [...ra, ...them] : ra;
}

/** Dòng vé CHỈ là Bảo tàng Hồ Chí Minh (không phải dòng cụm có kèm bảo tàng). */
function laDongBaoTangRieng(r: ResolvedItem): boolean {
  if (r.loai !== "ticket") return false;
  if (r.tach_tu?.khoa === "bao_tang_hcm") return true;
  return manhBaoTangHcm(r.ten_zh, r.mo_ta) != null && !phanLoaiCumBaDinh(r.ten_zh, r.mo_ta || r.match_label);
}
