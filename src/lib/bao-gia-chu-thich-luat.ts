// CHÚ THÍCH LUẬT — câu giải thích hiện NGAY DƯỚI dòng dịch vụ khi một luật tự
// đổi giá, tự để 0 hoặc tự chọn giúp.
//
// Trước đây luật chỉ để lại một nhãn chữ rất nhỏ, lời giải thích nằm trong
// tooltip (phải rê chuột mới thấy), và mất hẳn sau khi bấm Áp dụng. Người mở báo
// giá sau đó thấy vé vịnh 0 đồng, bữa trên tàu 1,4 triệu, vé Ba Đình 0 đồng mà
// không biết vì sao — dễ "sửa cho đúng" thành tính tiền hai lần.
//
// Câu chú thích được SUY RA từ cờ trên dòng ngay lúc hiển thị (không cất sẵn
// chữ), nên dòng người nhập sửa tay sau đó không bị một câu cũ nói sai: sửa giá
// khác mức luật thì chú thích tự nói "đã sửa tay".

import type { BaoGiaItem } from "@/hooks/use-bao-gia";
import {
  BUA_LABEL, USD_BUDGET_CONG_THEM_MEAL, USD_BUDGET_RATE,
  parseUsdAmount, toBaoGiaItems, usdBudgetPrice, type ResolvedItem,
} from "./bao-gia-ai-resolve";
import { TAU_THU_VE_VINH_RIENG, VE_VINH_HA_LONG } from "./bao-gia-tau-ha-long";

export interface ChuThichLuat {
  /** "canh_bao" = người nhập nên kiểm lại (tô cam); "thong_tin" = chỉ giải thích. */
  muc: "thong_tin" | "canh_bao";
  noi_dung: string;
}

const so = (n: number) => Math.round(n).toLocaleString("vi-VN");

type Them = (muc: ChuThichLuat["muc"], noi_dung: string) => void;

function luatTau(r: ResolvedItem, them: Them) {
  const t = r.loai === "meal" ? r.tau_ha_long : null;
  if (!t) return;

  if (t.giu_gia_cu) {
    them("canh_bao", t.ten && t.thu_ve_rieng
      ? `Luật tàu Hạ Long chưa áp: chương trình không nêu tên tàu nên đang giữ giá có sẵn. Máy đoán là tàu ${t.ten} — tàu này thu vé vịnh riêng, giá phải gồm vé vịnh ${so(VE_VINH_HA_LONG)} ₫.`
      : `Luật tàu Hạ Long chưa áp: chương trình không nêu tên tàu${t.ten ? ` (máy đoán là ${t.ten})` : ""} nên đang giữ giá có sẵn. Nếu đoàn đi tàu thu vé vịnh riêng (${TAU_THU_VE_VINH_RIENG}) thì giá phải gồm vé vịnh ${so(VE_VINH_HA_LONG)} ₫.`);
    return;
  }
  if (!t.ten) {
    them("canh_bao", "Luật tàu Hạ Long: cả ngày không dòng nào nêu tên tàu — chưa biết tính giá theo tàu nào, kiểm lại.");
    return;
  }
  if (t.thieu_gia) {
    them("canh_bao", `Luật tàu Hạ Long: đọc ra tàu ${t.ten} nhưng danh mục chưa có giá set cho bữa này — nhập giá tay${t.thu_ve_rieng ? `, nhớ cộng vé vịnh ${so(VE_VINH_HA_LONG)} ₫ (tàu này thu riêng)` : ""}.`);
    return;
  }

  if (t.gia_set != null) {
    const tong = t.gia_set + t.ve_vinh;
    const set = t.set_ten ? `set "${t.set_ten}" ` : "set ";
    them("thong_tin", t.ve_vinh > 0
      ? `Luật tàu Hạ Long: giá theo tàu ${t.ten} = ${set}${so(t.gia_set)} + vé vịnh ${so(t.ve_vinh)} = ${so(tong)} ₫ (tàu này thu vé vịnh riêng).`
      : `Luật tàu Hạ Long: giá theo tàu ${t.ten} = ${set}${so(t.gia_set)} ₫ (giá set của tàu này đã gồm vé vịnh).`);
    if (r.don_gia !== tong) {
      them("canh_bao", `Giá đang ${so(r.don_gia)} ₫, khác mức theo luật ${so(tong)} ₫ — đã sửa tay.`);
    }
  } else {
    // Dòng của bản nháp cũ, chưa ghi giá set → nói được tàu nào, không nói được phép cộng.
    them("thong_tin", `Luật tàu Hạ Long: giá theo tàu ${t.ten}${t.ve_vinh > 0 ? ` (đã cộng vé vịnh ${so(t.ve_vinh)} ₫)` : " (giá set đã gồm vé vịnh)"}.`);
  }
  if (t.doan) {
    them("canh_bao", `Chương trình không nêu tên tàu — tàu ${t.ten} là suy ra, kiểm lại đoàn đi tàu nào.`);
  }
}

function luatVeGopVaoBua(r: ResolvedItem, them: Them) {
  if (!r.ve_vinh_da_gom) return;
  them("thong_tin", `Luật tàu Hạ Long: vé tàu / vé vịnh đã tính trong giá bữa ăn trên tàu${r.ve_vinh_gop_tau ? ` ${r.ve_vinh_gop_tau}` : ""} cùng ngày — để 0 cho khỏi tính 2 lần.`);
  if (r.don_gia > 0) them("canh_bao", `Dòng này đang có giá ${so(r.don_gia)} ₫ — giữ thì vé bị tính 2 lần.`);
}

function luatCumBaDinh(r: ResolvedItem, them: Them) {
  if (!r.cum_ba_dinh) return;
  if (r.cum_ba_dinh === "vao_trong") {
    them("thong_tin", "Luật cụm Ba Đình: vào Phủ Chủ tịch / nhà sàn Bác Hồ — một vé chung cho cả hai nơi.");
    return;
  }
  them("thong_tin", r.cum_ba_dinh === "ngoai_quan"
    ? "Luật cụm Ba Đình: chỉ nhìn từ ngoài — quảng trường, lăng, chùa Một Cột không mất vé nên để 0."
    : "Luật cụm Ba Đình: một vé vào được cả Phủ Chủ tịch lẫn nhà sàn; vé đã tính ở dòng khác cùng ngày nên để 0.");
  if (r.don_gia > 0) them("canh_bao", `Dòng này đang có giá ${so(r.don_gia)} ₫ dù luật để 0 — kiểm lại.`);
}

function luatMonVietHaNoi(r: ResolvedItem, them: Them) {
  const m = r.loai === "meal" ? r.mon_viet_ha_noi : undefined;
  if (!m) return;
  const vi = m.can_cu === "chu"
    ? "lịch trình ghi Hà Nội"
    : `đêm ${m.dem_truoc ? "trước" : "đó"} đoàn ngủ ${m.khach_san} ở Hà Nội`;
  if (m.thieu_gia) {
    them("canh_bao", `Luật món Việt Hà Nội: món Việt ăn không giới hạn ở Hà Nội (${vi}) mặc định là MAMMOM, nhưng danh mục không còn set của luật hoặc set chưa có giá — chọn nhà hàng / set tay.`);
    return;
  }
  // Người nhập đã chọn nhà hàng khác → câu về MAMMOM không còn đúng.
  if (r.match_id !== m.nha_hang_id || m.gia_set == null) return;
  them("thong_tin", `Luật món Việt Hà Nội: món Việt ăn không giới hạn ở Hà Nội (${vi}) — mặc định ${m.nha_hang}, set "${m.set_ten}" ${so(m.gia_set)} ₫ (set này trước ở Home Hà Nội, nay đã chuyển sang ${m.nha_hang}).`);
  if (m.gia_cu != null) them("thong_tin", `Đã thay giá cũ ${so(m.gia_cu)} ₫ (${m.nguon_cu}).`);
  if (r.don_gia !== m.gia_set) {
    them("canh_bao", `Giá đang ${so(r.don_gia)} ₫, khác mức theo luật ${so(m.gia_set)} ₫ — đã sửa tay.`);
  }
}

function luatCombo(r: ResolvedItem, them: Them) {
  if (r.loai === "meal" || !r.bao_gom_bua_an) return;
  const bua = BUA_LABEL[r.bao_gom_bua_an];
  const ghi = r.bao_gom_ghi_chu?.trim();
  // Quy tắc đã dạy qua chat (KS giá kèm bữa) tự mang câu đầy đủ, dùng nguyên văn.
  if (ghi?.startsWith("Quy tắc")) {
    them("thong_tin", `${ghi} — dòng ${bua} cùng ngày không tính tiền.`);
    return;
  }
  const chu = r.loai === "hotel" ? "Giá phòng" : r.loai === "transport" ? "Giá xe" : "Vé combo";
  them("thong_tin", `${chu} đã gồm ${bua}${ghi ? ` (${ghi})` : ""} — dòng ${bua} cùng ngày không tính tiền.`);
}

function luatChonSet(r: ResolvedItem, them: Them) {
  const s = r.set_tu_chon;
  // Luật tàu đã nói set nào; giá / set đã đổi (sổ tay, người nhập) → câu này không còn đúng.
  if (!s || r.loai !== "meal" || r.tau_ha_long) return;
  if (r.match_set_menu_id !== s.id || r.don_gia !== s.gia) return;
  them("thong_tin", `Luật chọn set: nhà hàng có nhiều set, tự chọn "${s.ten}" (${s.ly_do}). Đoàn ăn set khác thì chọn lại.`);
}

function luatDinhMucUsd(r: ResolvedItem, them: Them) {
  if (r.sua_tay || r.don_gia <= 0) return;
  if (r.nguon_gia !== "dong_ghi" && !(r.match_label ?? "").startsWith("Định mức")) return;
  const usd = parseUsdAmount(`${r.ten_zh ?? ""} ${r.ten_vi ?? ""} ${r.ghi_chu ?? ""}`);
  if (usd == null || usdBudgetPrice(usd, r.loai) !== r.don_gia) return;
  const congThem = r.loai === "meal" ? ` + ${so(USD_BUDGET_CONG_THEM_MEAL)} (dòng ăn)` : "";
  them("thong_tin", `Luật định mức USD: chưa có giá trong sổ tay / danh mục nên lấy mức đối tác ghi — ${usd} USD × ${so(USD_BUDGET_RATE)}${congThem} = ${so(r.don_gia)} ₫.`);
}

function luatGiaMinhThang(r: ResolvedItem, them: Them) {
  if (r.gia_dong_ghi == null || r.don_gia <= 0 || r.gia_dong_ghi === r.don_gia) return;
  them("canh_bao", `Luật giá: đối tác ghi mức ${so(r.gia_dong_ghi)} ₫ trong lịch trình, bên mình tính ${so(r.don_gia)} ₫ theo giá của mình (sổ tay / danh mục). Muốn theo đối tác thì sửa ô đơn giá.`);
}

/**
 * Các câu giải thích luật cho MỘT dòng, theo thứ tự hiển thị.
 *
 * `daTruCombo` = dòng vé/KS này đã thực sự trừ được một bữa ăn cùng ngày. Chỉ
 * truyền lúc chụp để lưu (màn review đã có nút combo nói việc này). Không có nó
 * thì không ghi "không tính tiền" — viết thế lên dòng chưa trừ gì là nói dối.
 */
export function chuThichLuat(
  r: ResolvedItem,
  { daTruCombo = false }: { daTruCombo?: boolean } = {},
): ChuThichLuat[] {
  const ra: ChuThichLuat[] = [];
  const them: Them = (muc, noi_dung) => { ra.push({ muc, noi_dung }); };
  luatTau(r, them);
  luatVeGopVaoBua(r, them);
  luatCumBaDinh(r, them);
  luatMonVietHaNoi(r, them);
  if (daTruCombo) luatCombo(r, them);
  luatChonSet(r, them);
  luatDinhMucUsd(r, them);
  luatGiaMinhThang(r, them);
  return ra;
}

/** Như `toBaoGiaItems` nhưng chụp kèm chú thích luật + đơn giá lúc chụp, để bảng
 *  chi phí của báo giá đã lưu vẫn giải thích được từng con số. */
export function toBaoGiaItemsCoChuThich(
  rows: ResolvedItem[],
  daTru?: ReadonlySet<ResolvedItem>,
): BaoGiaItem[] {
  return toBaoGiaItems(rows, daTru).map((it, i) => {
    const ct = chuThichLuat(rows[i], { daTruCombo: daTru?.has(rows[i]) ?? false });
    return ct.length ? { ...it, chu_thich_luat: ct, gia_ap_luat: it.don_gia } : it;
  });
}

/** Chú thích để HIỂN THỊ ở báo giá đã lưu: thêm cảnh báo khi đơn giá đã bị sửa
 *  sau lúc chụp — câu cũ nói về mức cũ, không được để nó đứng một mình. */
export function chuThichHienThi(
  it: Pick<BaoGiaItem, "chu_thich_luat" | "gia_ap_luat" | "don_gia">,
): ChuThichLuat[] {
  const ds = [...(it.chu_thich_luat ?? [])];
  if (ds.length > 0 && it.gia_ap_luat != null && it.gia_ap_luat !== it.don_gia) {
    ds.push({
      muc: "canh_bao",
      noi_dung: `Giá đã sửa sau khi áp luật (${so(it.gia_ap_luat)} → ${so(it.don_gia)} ₫) — chú thích trên nói về mức cũ.`,
    });
  }
  return ds;
}
