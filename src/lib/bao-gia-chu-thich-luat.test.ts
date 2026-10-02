import { describe, it, expect } from "vitest";
import { chuThichLuat, chuThichHienThi, toBaoGiaItemsCoChuThich } from "./bao-gia-chu-thich-luat";
import { lyDoChonSet, type ResolvedItem } from "./bao-gia-ai-resolve";
import { TAU_THU_VE_VINH_RIENG, VE_VINH_HA_LONG } from "./bao-gia-tau-ha-long";

// Giá trong test là số BỊA — repo công khai.
const dong = (over: Partial<ResolvedItem>): ResolvedItem => ({
  ngay_so: 1, loai: "meal", mo_ta: "", don_gia: 0, ten_zh: "", ten_vi: "",
  ghi_chu: "", confidence: 1, status: "matched", match_label: "", ...over,
});

const so = (n: number) => n.toLocaleString("vi-VN");
const noiDung = (r: ResolvedItem, opts?: { daTruCombo?: boolean }) =>
  chuThichLuat(r, opts).map((c) => `${c.muc}: ${c.noi_dung}`);

const anTau = (over: Partial<ResolvedItem> = {}) => dong({
  loai: "meal", bua_an: "trua", don_gia: 1_000_000 + VE_VINH_HA_LONG,
  tau_ha_long: { ten: "Dolphin Cruise", ve_vinh: VE_VINH_HA_LONG, gia_set: 1_000_000, set_ten: "Buffet" },
  ...over,
});

describe("chuThichLuat — dòng không dính luật nào", () => {
  it("không có câu nào", () => {
    expect(chuThichLuat(dong({ loai: "ticket", don_gia: 120_000, nguon_gia: "so_tay" }))).toEqual([]);
  });
});

describe("chuThichLuat — luật tàu Hạ Long", () => {
  it("tàu thu vé vịnh riêng: ghi rõ phép cộng set + vé vịnh", () => {
    const ds = chuThichLuat(anTau());
    expect(ds).toHaveLength(1);
    expect(ds[0].muc).toBe("thong_tin");
    expect(ds[0].noi_dung).toContain("tàu Dolphin Cruise");
    expect(ds[0].noi_dung).toContain(`set "Buffet" ${so(1_000_000)} + vé vịnh ${so(VE_VINH_HA_LONG)} = ${so(1_000_000 + VE_VINH_HA_LONG)}`);
    expect(ds[0].noi_dung).toContain("thu vé vịnh riêng");
  });

  it("tàu có giá set đã gồm vé vịnh: nói rõ là đã gồm", () => {
    const ds = chuThichLuat(dong({
      loai: "meal", don_gia: 1_200_000,
      tau_ha_long: { ten: "Ambassador Day Cruise", ve_vinh: 0, gia_set: 1_200_000, set_ten: "Buffet" },
    }));
    expect(ds).toHaveLength(1);
    expect(ds[0].noi_dung).toContain("đã gồm vé vịnh");
  });

  it("giá bị sửa tay khác mức luật → thêm cảnh báo, không để câu cũ đứng một mình", () => {
    const ds = noiDung(anTau({ don_gia: 1_500_000, sua_tay: true }));
    expect(ds).toHaveLength(2);
    expect(ds[1]).toMatch(/^canh_bao: Giá đang 1\.500\.000 ₫, khác mức theo luật/);
    expect(ds[1]).toContain("đã sửa tay");
  });

  it("tàu là suy ra (chương trình không nêu tên) → cảnh báo kiểm lại", () => {
    const ds = noiDung(anTau({ tau_ha_long: { ten: "Sea Octopus", ve_vinh: VE_VINH_HA_LONG, gia_set: 1_000_000, doan: true } }));
    expect(ds.some((s) => s.startsWith("canh_bao:") && s.includes("tàu Sea Octopus là suy ra"))).toBe(true);
  });

  it("đọc ra tàu thu vé riêng nhưng thiếu giá set → nhắc nhập giá VÀ cộng vé vịnh", () => {
    const ds = chuThichLuat(dong({
      loai: "meal", tau_ha_long: { ten: "Dolphin Cruise", ve_vinh: 0, thieu_gia: true, thu_ve_rieng: true },
    }));
    expect(ds).toHaveLength(1);
    expect(ds[0].muc).toBe("canh_bao");
    expect(ds[0].noi_dung).toContain("nhập giá tay");
    expect(ds[0].noi_dung).toContain(`nhớ cộng vé vịnh ${so(VE_VINH_HA_LONG)}`);
  });

  it("giữ giá sổ tay vì không thấy tên tàu → cảnh báo, kể tên các tàu thu vé riêng", () => {
    const ds = chuThichLuat(dong({
      loai: "meal", don_gia: 1_000_000, nguon_gia: "so_tay",
      tau_ha_long: { ten: null, ve_vinh: 0, thieu_gia: false, giu_gia_cu: true },
    }));
    expect(ds).toHaveLength(1);
    expect(ds[0].muc).toBe("canh_bao");
    expect(ds[0].noi_dung).toContain("chưa áp");
    expect(ds[0].noi_dung).toContain(TAU_THU_VE_VINH_RIENG);
  });

  it("giữ giá cũ mà máy đoán ra đúng tàu thu vé riêng → nói thẳng giá phải gồm vé vịnh", () => {
    const [c] = chuThichLuat(dong({
      loai: "meal", don_gia: 1_000_000,
      tau_ha_long: { ten: "Dolphin Cruise", ve_vinh: 0, thieu_gia: false, giu_gia_cu: true, doan: true, thu_ve_rieng: true },
    }));
    expect(c.noi_dung).toContain("Máy đoán là tàu Dolphin Cruise");
    expect(c.noi_dung).toContain("giá phải gồm vé vịnh");
  });

  it("dòng vé đã gộp vào bữa ăn → giải thích vì sao 0; có ai gõ giá lại thì cảnh báo tính 2 lần", () => {
    const ve = dong({ loai: "ticket", don_gia: 0, ve_vinh_da_gom: true, ve_vinh_gop_tau: "Dolphin Cruise" });
    const [c] = chuThichLuat(ve);
    expect(c.noi_dung).toContain("bữa ăn trên tàu Dolphin Cruise");
    expect(c.noi_dung).toContain("để 0");
    const coGia = noiDung({ ...ve, don_gia: 330_000, sua_tay: true });
    expect(coGia[1]).toMatch(/^canh_bao: .*tính 2 lần/);
  });

  it("cờ tàu trên dòng KHÔNG phải dòng ăn (đã đổi loại) thì bỏ qua", () => {
    expect(chuThichLuat(anTau({ loai: "ticket" }))).toEqual([]);
  });
});

describe("chuThichLuat — luật cụm Ba Đình", () => {
  it("chỉ nhìn từ ngoài → nói rõ không mất vé", () => {
    const [c] = chuThichLuat(dong({ loai: "ticket", cum_ba_dinh: "ngoai_quan" }));
    expect(c.noi_dung).toContain("không mất vé nên để 0");
  });

  it("vé đã tính ở dòng khác cùng ngày → nói rõ một vé vào cả hai nơi", () => {
    const [c] = chuThichLuat(dong({ loai: "ticket", cum_ba_dinh: "da_gom" }));
    expect(c.noi_dung).toContain("một vé vào được cả Phủ Chủ tịch lẫn nhà sàn");
  });

  it("vào trong → vé chung; dòng để 0 cố ý mà có giá → cảnh báo", () => {
    expect(chuThichLuat(dong({ loai: "ticket", cum_ba_dinh: "vao_trong", don_gia: 40_000 }))[0].noi_dung)
      .toContain("một vé chung cho cả hai nơi");
    const ds = noiDung(dong({ loai: "ticket", cum_ba_dinh: "ngoai_quan", don_gia: 40_000 }));
    expect(ds[1]).toMatch(/^canh_bao: .*dù luật để 0/);
  });
});

describe("chuThichLuat — combo / KS đã gồm bữa ăn", () => {
  const veCombo = dong({
    loai: "ticket", don_gia: 900_000, bao_gom_bua_an: "trua", bao_gom_nguon: "master",
    bao_gom_ghi_chu: "buffet trưa trên đỉnh",
  });

  it("chỉ ghi khi dòng THỰC SỰ đã trừ được bữa ăn", () => {
    expect(chuThichLuat(veCombo)).toEqual([]);
    const [c] = chuThichLuat(veCombo, { daTruCombo: true });
    expect(c.noi_dung).toBe("Vé combo đã gồm ăn trưa (buffet trưa trên đỉnh) — dòng ăn trưa cùng ngày không tính tiền.");
  });

  it("quy tắc KS giá kèm bữa đã dạy → dùng nguyên văn câu quy tắc", () => {
    const [c] = chuThichLuat(dong({
      loai: "hotel", don_gia: 3_000_000, bao_gom_bua_an: "toi", bao_gom_nguon: "master",
      bao_gom_ghi_chu: "Quy tắc đã dạy: giá phòng 3.000.000 ₫ đã gồm ăn tối",
    }), { daTruCombo: true });
    expect(c.noi_dung).toBe("Quy tắc đã dạy: giá phòng 3.000.000 ₫ đã gồm ăn tối — dòng ăn tối cùng ngày không tính tiền.");
  });
});

describe("chuThichLuat — luật tự chọn set menu", () => {
  const anSet = (over: Partial<ResolvedItem> = {}) => dong({
    loai: "meal", bua_an: "trua", don_gia: 200_000, match_set_menu_id: 22,
    set_tu_chon: { id: 22, ten: "SET BF TRƯA (T7 - CN)", gia: 200_000, ly_do: "đúng bữa trưa, hôm đó thứ Bảy — cuối tuần" },
    ...over,
  });

  it("ghi set nào và vì sao", () => {
    const [c] = chuThichLuat(anSet());
    expect(c.noi_dung).toContain('tự chọn "SET BF TRƯA (T7 - CN)" (đúng bữa trưa, hôm đó thứ Bảy — cuối tuần)');
  });

  it("set hoặc giá đã đổi (người chọn lại / sổ tay) → không còn là luật chọn, bỏ câu", () => {
    expect(chuThichLuat(anSet({ match_set_menu_id: 21 }))).toEqual([]);
    expect(chuThichLuat(anSet({ don_gia: 250_000, nguon_gia: "so_tay" }))).toEqual([]);
  });

  it("lý do mặc định khi tên set không nói bữa / ngày", () => {
    expect(lyDoChonSet("Set 300k", { bua: "trua", ngayDate: null })).toBe("set duy nhất hợp bữa / ngày");
  });
});

describe("chuThichLuat — định mức USD và giá mình thắng mức đối tác", () => {
  it("lấy theo mức USD đối tác ghi → ghi rõ phép quy đổi", () => {
    const [c] = chuThichLuat(dong({
      loai: "meal", ten_zh: "晚餐：越式料理 10USD", don_gia: 220_000, nguon_gia: "dong_ghi", gia_dong_ghi: 220_000,
    }));
    expect(c.noi_dung).toContain(`10 USD × ${so(20_000)} + ${so(20_000)} (dòng ăn) = ${so(220_000)} ₫`);
  });

  it("người nhập đã sửa giá → không nói theo định mức nữa", () => {
    expect(chuThichLuat(dong({
      loai: "meal", ten_zh: "10USD", don_gia: 250_000, nguon_gia: "dong_ghi", sua_tay: true,
    }))).toEqual([]);
  });

  it("giá của mình khác mức đối tác ghi → cảnh báo lệch", () => {
    const [c] = chuThichLuat(dong({
      loai: "meal", don_gia: 390_000, nguon_gia: "so_tay", gia_dong_ghi: 220_000,
    }));
    expect(c.muc).toBe("canh_bao");
    expect(c.noi_dung).toContain(`đối tác ghi mức ${so(220_000)} ₫`);
    expect(c.noi_dung).toContain(`bên mình tính ${so(390_000)} ₫`);
  });
});

describe("toBaoGiaItemsCoChuThich — chụp chú thích để lưu vào báo giá", () => {
  it("dòng có luật mang theo chú thích + đơn giá lúc chụp; dòng không luật giữ nguyên", () => {
    const an = anTau();
    const thuong = dong({ loai: "ticket", don_gia: 120_000, mo_ta: "Vé thường" });
    const [a, b] = toBaoGiaItemsCoChuThich([an, thuong]);
    expect(a.chu_thich_luat).toHaveLength(1);
    expect(a.gia_ap_luat).toBe(an.don_gia);
    expect(b).not.toHaveProperty("chu_thich_luat");
    expect(b).not.toHaveProperty("gia_ap_luat");
  });

  it("câu combo chỉ có ở dòng nằm trong tập đã trừ", () => {
    const veCombo = dong({ loai: "ticket", don_gia: 900_000, bao_gom_bua_an: "trua", bao_gom_nguon: "master" });
    expect(toBaoGiaItemsCoChuThich([veCombo])[0].chu_thich_luat).toBeUndefined();
    expect(toBaoGiaItemsCoChuThich([veCombo], new Set([veCombo]))[0].chu_thich_luat?.[0].noi_dung)
      .toContain("không tính tiền");
  });
});

describe("chuThichHienThi — báo giá đã lưu", () => {
  const luu = toBaoGiaItemsCoChuThich([anTau()])[0];

  it("giá chưa đổi → hiện nguyên chú thích", () => {
    expect(chuThichHienThi(luu)).toEqual(luu.chu_thich_luat);
  });

  it("giá sửa sau khi áp luật → thêm cảnh báo câu trên nói về mức cũ", () => {
    const ds = chuThichHienThi({ ...luu, don_gia: 1_600_000 });
    expect(ds).toHaveLength(2);
    expect(ds[1].muc).toBe("canh_bao");
    expect(ds[1].noi_dung).toContain(`${so(luu.don_gia)} → ${so(1_600_000)} ₫`);
  });

  it("dòng không có chú thích thì không đẻ cảnh báo", () => {
    expect(chuThichHienThi({ don_gia: 100_000, gia_ap_luat: 90_000 })).toEqual([]);
  });
});
