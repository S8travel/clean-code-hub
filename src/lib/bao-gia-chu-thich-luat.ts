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

function luatTauNguDem(r: ResolvedItem, them: Them) {
  const t = r.loai === "meal" ? r.tau_ngu_dem : undefined;
  if (!t) return;
  if (t.goi_them) {
    them("thong_tin", `Luật du thuyền ngủ đêm: bữa trên tàu đã gồm trong giá du thuyền ${t.ten} (đêm ngày ${t.dem}); dòng này chỉ tính món gọi thêm: ${t.goi_them}.`);
    if (r.don_gia <= 0) them("canh_bao", `Chưa có giá món gọi thêm (${t.goi_them}) — nhập giá.`);
    return;
  }
  them("thong_tin", `Luật du thuyền ngủ đêm: đoàn ngủ trên ${t.ten} (đêm ngày ${t.dem}) — bữa trên tàu (trưa + tối hôm lên tàu, brunch hôm sau) đã gồm trong giá du thuyền ở dòng khách sạn, chỉ nước uống và món gọi thêm tính riêng → để 0.`);
  if (r.don_gia > 0) them("canh_bao", `Dòng này đang có giá ${so(r.don_gia)} ₫ — giữ thì bữa ăn bị tính 2 lần (đã nằm trong giá du thuyền).`);
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

function luatComboFansipan(r: ResolvedItem, them: Them) {
  const c = r.combo_fansipan;
  if (!c) return;
  if (c.vai_tro === "cap_treo") {
    if (r.loai !== "ticket") return;
    if (!c.ten || c.gia == null) {
      them("canh_bao", "Luật combo Fansipan: có đi cáp treo Fansipan nhưng danh mục chưa có combo cáp treo + buffet trưa + tàu Mường Hoa có giá — chọn / nhập giá tay.");
      return;
    }
    them("thong_tin", `Luật combo Fansipan: có đi cáp treo Fansipan → tính combo "${c.ten}" ${so(c.gia)} ₫, đã gồm cáp treo + buffet trưa + tàu Mường Hoa; buffet và tàu Mường Hoa cùng ngày để 0.`);
    if (c.gia_cu != null) them("thong_tin", `Đã thay giá cũ ${so(c.gia_cu)} ₫ (${c.nguon_cu}).`);
    if (r.don_gia !== c.gia) them("canh_bao", `Giá đang ${so(r.don_gia)} ₫, khác giá combo ${so(c.gia)} ₫ — đã sửa tay.`);
    return;
  }
  // Người nhập đã đổi dòng sang loại khác → câu này không còn nói về dòng đó.
  if (r.loai !== (c.vai_tro === "buffet" ? "meal" : "ticket")) return;
  const ten = c.vai_tro === "buffet" ? "buffet trưa trên Fansipan" : "tàu Mường Hoa";
  them("thong_tin", `Luật combo Fansipan: ${ten} đã gồm trong combo${c.ten ? ` "${c.ten}"` : ""} cùng ngày → để 0.`);
  if (r.don_gia > 0) them("canh_bao", `Dòng này đang có giá ${so(r.don_gia)} ₫ — giữ thì bị tính 2 lần (đã nằm trong combo).`);
}

/** Dịch vụ tính riêng mà luật đã tách ra khỏi một dòng lịch trình. */
function luatTachDong(r: ResolvedItem, them: Them) {
  const t = r.tach_tu;
  if (t) {
    them("thong_tin", t.khoa === "tau_dinh_fansipan"
      ? `Luật combo Fansipan: tàu leo đỉnh không nằm trong combo cáp treo + buffet + tàu Mường Hoa — tách từ dòng "${t.dong_goc}" để tính riêng.`
      : `Luật cụm Ba Đình: Bảo tàng Hồ Chí Minh không nằm trong vé Phủ Chủ tịch + nhà sàn — tách từ dòng "${t.dong_goc}" để tính riêng.`);
    if (r.don_gia <= 0) {
      them("canh_bao", t.khoa === "bao_tang_hcm"
        ? "Danh mục cảnh điểm chưa có Bảo tàng Hồ Chí Minh có giá — nhập giá ở đây, và thêm vào danh mục để lần sau tự điền."
        : "Danh mục chưa có giá vé tàu leo đỉnh cho chiều này — nhập giá.");
    }
  }
  for (const k of r.da_tach ?? []) {
    them("thong_tin", k === "tau_dinh_fansipan"
      ? "Tàu leo đỉnh trong dòng này không nằm trong combo — đã tách ra tính riêng ở dòng khác cùng ngày."
      : "Bảo tàng Hồ Chí Minh trong dòng này không nằm trong vé cụm — đã tách ra tính riêng ở dòng khác cùng ngày.");
  }
}

function luatNhaHangChiDinh(r: ResolvedItem, them: Them) {
  const c = r.loai === "meal" ? r.nh_chi_dinh : undefined;
  if (!c) return;
  if (c.thieu_menu) {
    them("canh_bao", `Nhà hàng chỉ định ${c.nha_hang}: danh mục chưa có set menu có giá cho bữa này → đang tạm theo mức USD đối tác ghi. Thêm set menu cho nhà hàng này để lần sau lấy giá nhà hàng.`);
    return;
  }
  them("thong_tin", `Luật nhà hàng chỉ định: lịch trình nêu đích danh ${c.nha_hang} → giá theo menu trong danh mục, đứng trên công thức USD và số sổ tay.`);
  // Giá cũ là mức đối tác ghi thì câu "Luật giá" bên dưới đã nêu số đó rồi.
  if (c.gia_cu != null && c.gia_cu !== r.gia_dong_ghi) them("thong_tin", `Đã thay giá cũ ${so(c.gia_cu)} ₫ (${c.nguon_cu}).`);
  if (c.gia_menu != null && r.don_gia !== c.gia_menu) {
    them("canh_bao", `Giá đang ${so(r.don_gia)} ₫, khác giá menu ${so(c.gia_menu)} ₫ — đã sửa tay.`);
  }
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
  luatTauNguDem(r, them);
  luatVeGopVaoBua(r, them);
  luatCumBaDinh(r, them);
  luatComboFansipan(r, them);
  luatTachDong(r, them);
  luatMonVietHaNoi(r, them);
  luatNhaHangChiDinh(r, them);
  if (daTruCombo) luatCombo(r, them);
  luatChonSet(r, them);
  luatDinhMucUsd(r, them);
  luatGiaMinhThang(r, them);
  return ra;
}

/** Dòng LUẬT cố ý để 0: không vào cụm Ba Đình, vé đã tính ở dòng cùng ngày, vé tàu
 *  đã gộp vào bữa ăn, bữa trên du thuyền ngủ đêm, buffet / tàu Mường Hoa trong combo
 *  Fansipan. Màn review không được tô cam / đếm "cần điền giá" cho những dòng này —
 *  nhãn đó chỉ dụ người nhập gõ thêm tiền, tức tính 2 lần đúng thứ luật vừa chặn. */
export function dongDe0TheoLuat(r: ResolvedItem): boolean {
  const combo = r.combo_fansipan;
  return r.don_gia <= 0 && (
    r.cum_ba_dinh === "ngoai_quan" || r.cum_ba_dinh === "da_gom" || !!r.ve_vinh_da_gom
    || (r.loai === "meal" && !!r.tau_ngu_dem && !r.tau_ngu_dem.goi_them)
    || (combo?.vai_tro === "buffet" && r.loai === "meal")
    || (combo?.vai_tro === "tau_muong_hoa" && r.loai === "ticket")
  );
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
