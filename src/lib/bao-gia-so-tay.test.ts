import { describe, it, expect } from "vitest";
import {
  chuanHoaZh, khoaSoTay, banDoSoTay, traSoTay, usdTrongDong,
  locDongDeHoc, dongDeHocKhiLuuNhap, dongThieuGia, diemGiong, goiYSoTay, apSoTay,
  type DongSoTay, type LoaiSoTay, type DongApSoTay, type DongLuuNhap,
} from "./bao-gia-so-tay";

const dong = (over: Partial<DongSoTay> = {}): DongSoTay => ({
  id: 1, khoa_zh: chuanHoaZh("長安生態區遊船"), zh_goc: "長安生態區遊船",
  ten_vi: "Tràng An (du thuyền)", loai: "ticket", don_gia: 300_000,
  foc_khach: null, foc_mien: null, dia_diem: null, so_lan_dung: 12, ngung: false,
  ...over,
});

describe("chuanHoaZh", () => {
  it("gộp phồn thể và giản thể về một khoá", () => {
    expect(chuanHoaZh("下龍灣遊船")).toBe(chuanHoaZh("下龙湾游船"));
  });

  it("gộp số viết bằng chữ với chữ số — 36 phố phường có 6 cách viết trong DB", () => {
    expect(chuanHoaZh("三十六古街")).toBe(chuanHoaZh("36古街"));
    expect(chuanHoaZh("電瓶車遊 36 古街")).toBe(chuanHoaZh("电瓶车游36古街"));
  });

  it("bỏ dấu câu, khoảng trắng, hoa thường", () => {
    expect(chuanHoaZh("Paradise 餐廳 · 農家風味")).toBe(chuanHoaZh("paradise餐厅農家風味"));
  });

  it("bỏ mức tiền khỏi khoá — cùng món thì cùng từ vựng", () => {
    expect(chuanHoaZh("越式料理 7USD")).toBe(chuanHoaZh("越式料理 9USD"));
    expect(chuanHoaZh("海鮮餐合菜 8美金")).toBe(chuanHoaZh("海鲜餐合菜"));
  });

  it('bỏ "hoặc tương đương" — lời khách sáo, không đổi giá', () => {
    expect(chuanHoaZh("A飯店或同級")).toBe(chuanHoaZh("A飯店"));
    expect(chuanHoaZh("B酒店同等級")).toBe(chuanHoaZh("B酒店"));
  });

  it("GIỮ hạng sao — đổi hạng là đổi giá, gộp lại là tính sai tiền", () => {
    expect(chuanHoaZh("四星飯店")).not.toBe(chuanHoaZh("五星飯店"));
  });

  it('GIỮ "或" đứng một mình — "A或B" là HAI khách sạn khác giá', () => {
    const hai = chuanHoaZh("溫德姆酒店或溫佩假期飯店");
    expect(hai).not.toBe(chuanHoaZh("溫德姆酒店"));
    expect(hai).toContain(chuanHoaZh("或"));
  });

  it("GIỮ 含… — có tôm hùm và không tôm hùm là hai giá", () => {
    expect(chuanHoaZh("合菜含龍蝦")).not.toBe(chuanHoaZh("合菜"));
  });

  it("idempotent — bắt buộc, vì khoá được ghi xuống DB", () => {
    for (const s of ["下龍灣遊船", "三十六古街", "越式料理 7USD", "A飯店或同級", ""]) {
      expect(chuanHoaZh(chuanHoaZh(s))).toBe(chuanHoaZh(s));
    }
  });

  it("chuỗi rỗng / rác không nổ", () => {
    expect(chuanHoaZh("")).toBe("");
    expect(chuanHoaZh("   ···   ")).toBe("");
  });
});

describe("khoaSoTay — cùng chữ khác loại là hai mục", () => {
  it("tách theo loại", () => {
    expect(khoaSoTay("船上自助餐", "meal")).not.toBe(khoaSoTay("船上自助餐", "ticket"));
  });
});

describe("usdTrongDong", () => {
  it("bắt các cách ghi tiền thường gặp", () => {
    expect(usdTrongDong("越式料理 7USD")).toBe(7);
    expect(usdTrongDong("海鮮餐合菜 8美金")).toBe(8);
    expect(usdTrongDong("按摩 $700")).toBe(700);
    expect(usdTrongDong("套餐 usd 12.5")).toBe(12.5);
  });

  it("không có tiền thì trả null, không đoán bừa", () => {
    expect(usdTrongDong("下龍灣遊船4小時")).toBeNull();
    expect(usdTrongDong("三十六古街")).toBeNull();
    expect(usdTrongDong("")).toBeNull();
  });
});

describe("traSoTay", () => {
  const quyDoi = (usd: number, loai: LoaiSoTay) =>
    Math.round(usd * 20_000) + (loai === "meal" ? 20_000 : 0);

  it("trúng sổ tay thì lấy giá đã học", () => {
    const bd = banDoSoTay([dong()]);
    const kq = traSoTay(bd, "长安生态区游船", "ticket", quyDoi);
    expect(kq.nguon).toBe("so_tay");
    expect(kq.don_gia).toBe(300_000);
    expect(kq.ten_vi).toBe("Tràng An (du thuyền)");
  });

  it("khớp được dù đối tác viết phồn thể còn sổ tay lưu giản thể", () => {
    const bd = banDoSoTay([dong({ khoa_zh: chuanHoaZh("下龙湾游船") })]);
    expect(traSoTay(bd, "下龍灣遊船", "ticket", quyDoi).nguon).toBe("so_tay");
  });

  it("GIÁ MÌNH ĐÃ CHỐT thắng mức USD đối tác ghi — đây là chỗ 'sửa rồi vẫn không nhớ'", () => {
    const bd = banDoSoTay([dong({
      // khoá GIỮ cả tiền tố 中餐/晚餐 → cùng một nhà hàng có thể nằm ở nhiều dòng
      khoa_zh: chuanHoaZh("中餐：海鮮自助餐"), loai: "meal", don_gia: 250_000,
    })]);
    const kq = traSoTay(bd, "中餐：海鮮自助餐 18USD", "meal", quyDoi);
    expect(kq.nguon).toBe("so_tay");
    expect(kq.don_gia).toBe(250_000);
    // mức đối tác ghi vẫn giữ lại để màn review nói ra chỗ lệch
    expect(kq.gia_dong_ghi).toBe(18 * 20_000 + 20_000);
  });

  it("sổ tay chưa có giá → mới dùng mức USD trong dòng", () => {
    const bd = banDoSoTay([dong({ khoa_zh: chuanHoaZh("越式料理"), loai: "meal", don_gia: null })]);
    const kq = traSoTay(bd, "越式料理 9USD", "meal", quyDoi);
    expect(kq.nguon).toBe("dong_ghi");
    expect(kq.don_gia).toBe(9 * 20_000 + 20_000);
  });

  it("giá 0 trong sổ tay là MIỄN PHÍ THẬT, không phải chưa điền", () => {
    const bd = banDoSoTay([dong({ khoa_zh: chuanHoaZh("漫步三十六古街"), loai: "ticket", don_gia: 0 })]);
    const kq = traSoTay(bd, "漫步三十六古街", "ticket", quyDoi);
    expect(kq.nguon).toBe("so_tay");
    expect(kq.don_gia).toBe(0);
  });

  it("dòng sổ tay chưa có giá thì cho TÊN nhưng KHÔNG cho giá", () => {
    const bd = banDoSoTay([dong({ don_gia: null, ten_vi: "Tràng An" })]);
    const kq = traSoTay(bd, "長安生態區遊船", "ticket", quyDoi);
    expect(kq.nguon).toBe("chua_co");
    expect(kq.don_gia).toBeNull();
    expect(kq.ten_vi).toBe("Tràng An");
  });

  it("dòng đã ngưng thì coi như không có", () => {
    const bd = banDoSoTay([dong({ ngung: true })]);
    expect(traSoTay(bd, "長安生態區遊船", "ticket", quyDoi).nguon).toBe("chua_co");
  });

  it("không trúng gì thì trả chua_co, giá null — KHÔNG phải 0", () => {
    const kq = traSoTay(banDoSoTay([]), "會安古鎮", "ticket", quyDoi);
    expect(kq.nguon).toBe("chua_co");
    expect(kq.don_gia).toBeNull();
  });
});

describe("locDongDeHoc", () => {
  it("học dòng có chữ Trung + giá người nhập gõ", () => {
    const ds = locDongDeHoc([
      { ten_zh: "水上木偶戲", mo_ta: "Múa rối nước", loai: "ticket", don_gia: 100_000 },
    ]);
    expect(ds).toHaveLength(1);
    expect(ds[0].khoa_zh).toBe(chuanHoaZh("水上木偶戲"));
    expect(ds[0].zh_goc).toBe("水上木偶戲");
    expect(ds[0].don_gia).toBe(100_000);
  });

  it("vẫn học dòng chỉ có tên mà chưa có giá — dạy được bản dịch đã đỡ", () => {
    const ds = locDongDeHoc([
      { ten_zh: "會安古鎮", mo_ta: "Phố cổ Hội An", loai: "ticket", don_gia: 0 },
    ]);
    expect(ds).toHaveLength(1);
    expect(ds[0].ten_vi).toBe("Phố cổ Hội An");
    expect(ds[0].don_gia).toBeNull();
  });

  it("bỏ dòng không có chữ Trung — không có khoá thì tra kiểu gì", () => {
    expect(locDongDeHoc([{ ten_zh: "", mo_ta: "Vé gì đó", loai: "ticket", don_gia: 5000 }])).toEqual([]);
  });

  it("bỏ dòng rỗng hẳn — không giá, không tên", () => {
    expect(locDongDeHoc([{ ten_zh: "會安古鎮", mo_ta: "", loai: "ticket", don_gia: 0 }])).toEqual([]);
  });

  it("bỏ khoá quá ngắn", () => {
    expect(locDongDeHoc([{ ten_zh: "餐", mo_ta: "Ăn", loai: "meal", don_gia: 1000 }])).toEqual([]);
  });

  it("trùng khoá trong một lượt thì bản SAU thắng — lần gõ cuối là ý định thật", () => {
    const ds = locDongDeHoc([
      { ten_zh: "水上木偶戲", mo_ta: "Múa rối", loai: "ticket", don_gia: 100_000 },
      { ten_zh: "水上木偶戏", mo_ta: "Múa rối nước Hạ Long", loai: "ticket", don_gia: 120_000 },
    ]);
    expect(ds).toHaveLength(1);
    expect(ds[0].don_gia).toBe(120_000);
    expect(ds[0].ten_vi).toBe("Múa rối nước Hạ Long");
  });

  it("cùng chữ khác loại thì KHÔNG gộp", () => {
    expect(locDongDeHoc([
      { ten_zh: "船上自助餐", mo_ta: "Buffet trên tàu", loai: "meal", don_gia: 1_320_000 },
      { ten_zh: "船上自助餐", mo_ta: "Vé tàu kèm buffet", loai: "ticket", don_gia: 900_000 },
    ])).toHaveLength(2);
  });
});

describe("dongThieuGia", () => {
  it("gom đúng dòng cần người nhập điền", () => {
    const ds = dongThieuGia([
      { don_gia: 100_000 }, { don_gia: 0 }, { don_gia: null }, { don_gia: undefined },
    ]);
    expect(ds).toHaveLength(3);
  });
});

describe("diemGiong / goiYSoTay", () => {
  it("giống hệt là 1, khác hẳn là 0", () => {
    expect(diemGiong("下龙湾游船", "下龙湾游船")).toBe(1);
    expect(diemGiong("会安古镇", "岘港巴拿山")).toBe(0);
  });

  it("gợi ý được cách viết dài hơn của cùng một chỗ", () => {
    const ds = [dong({ id: 1, khoa_zh: chuanHoaZh("长安生态保护区游船"), ten_vi: "Tràng An" })];
    const g = goiYSoTay(ds, "長安生態保護區 含遊船四人一艘", "ticket");
    expect(g).toHaveLength(1);
    expect(g[0].dong.ten_vi).toBe("Tràng An");
  });

  it("không gợi ý dòng khác loại, dòng đã ngưng, hay chính nó", () => {
    const khoa = chuanHoaZh("水上木偶戏");
    expect(goiYSoTay([dong({ khoa_zh: khoa, loai: "meal" })], "水上木偶戲", "ticket")).toEqual([]);
    expect(goiYSoTay([dong({ khoa_zh: khoa, ngung: true })], "水上木偶戲", "ticket")).toEqual([]);
    expect(goiYSoTay([dong({ khoa_zh: khoa })], "水上木偶戲", "ticket")).toEqual([]);
  });

  it("dòng dùng nhiều lần được xếp trước khi điểm bằng nhau", () => {
    const a = dong({ id: 1, khoa_zh: chuanHoaZh("下龙湾游船a"), so_lan_dung: 1 });
    const b = dong({ id: 2, khoa_zh: chuanHoaZh("下龙湾游船b"), so_lan_dung: 9 });
    const g = goiYSoTay([a, b], "下龍灣遊船", "ticket");
    expect(g[0].dong.id).toBe(2);
  });
});

describe("apSoTay — áp sổ tay lên kết quả AI vừa đọc", () => {
  const quyDoi = (usd: number, loai: LoaiSoTay) =>
    Math.round(usd * 20_000) + (loai === "meal" ? 20_000 : 0);
  const bd = banDoSoTay([
    dong({ id: 1, khoa_zh: chuanHoaZh("水上木偶戏"), ten_vi: "Múa rối nước", don_gia: 100_000, so_lan_dung: 7 }),
    dong({ id: 2, khoa_zh: chuanHoaZh("越式料理"), loai: "meal", ten_vi: "Cơm Việt", don_gia: 160_000 }),
    dong({ id: 3, khoa_zh: chuanHoaZh("会安古镇"), ten_vi: "Phố cổ Hội An", don_gia: null }),
  ]);

  it("điền giá + tên từ sổ tay, kể cả khi đối tác viết phồn thể", () => {
    const [r] = apSoTay<DongApSoTay>([{ ten_zh: "水上木偶戲", mo_ta: "", loai: "ticket", don_gia: 0 }], bd, quyDoi);
    expect(r.don_gia).toBe(100_000);
    expect(r.mo_ta).toBe("Múa rối nước");
    expect(r.nguon_gia).toBe("so_tay");
    expect(r.so_lan_dung).toBe(7);
  });

  it("giá đã học thắng mức USD trong dòng, và ghi lại mức kia để cảnh báo lệch", () => {
    const [r] = apSoTay<DongApSoTay>([{ ten_zh: "越式料理 9USD", mo_ta: "", loai: "meal", don_gia: 0 }], bd, quyDoi);
    expect(r.nguon_gia).toBe("so_tay");
    expect(r.don_gia).toBe(160_000);
    expect(r.gia_dong_ghi).toBe(200_000);
  });

  it("dòng đã khớp danh mục + đối tác ghi USD → GIỮ giá danh mục, chỉ ghi mức lệch", () => {
    // 250k = set menu danh mục; sổ tay không biết chuỗi này; đối tác ghi 18USD.
    const [r] = apSoTay<DongApSoTay>(
      [{ ten_zh: "河內某餐廳自助餐 18USD", mo_ta: "NH buffet", loai: "meal", don_gia: 250_000 }],
      bd, quyDoi,
    );
    expect(r.don_gia).toBe(250_000);
    expect(r.gia_dong_ghi).toBe(18 * 20_000 + 20_000);
  });

  it("chưa có giá nào + đối tác ghi USD → mới lấy mức USD", () => {
    const [r] = apSoTay<DongApSoTay>(
      [{ ten_zh: "海鮮合菜 8USD", mo_ta: "", loai: "meal", don_gia: 0 }], bd, quyDoi,
    );
    expect(r.nguon_gia).toBe("dong_ghi");
    expect(r.don_gia).toBe(8 * 20_000 + 20_000);
  });

  it("sổ tay ghi 0 (miễn phí thật) đè cả giá đang có — 36 phố phường đi bộ", () => {
    const bdDiBo = banDoSoTay([
      dong({ id: 9, khoa_zh: chuanHoaZh("漫步三十六古街"), loai: "ticket",
        ten_vi: "36 phố phường (đi bộ)", don_gia: 0 }),
    ]);
    const [r] = apSoTay<DongApSoTay>(
      [{ ten_zh: "漫步三十六古街", mo_ta: "Xe điện 36 phố phường", loai: "ticket", don_gia: 50_000 }],
      bdDiBo, quyDoi,
    );
    expect(r.don_gia).toBe(0);
    expect(r.mo_ta).toBe("36 phố phường (đi bộ)");
  });

  it("sổ tay có tên nhưng chưa có giá → cho tên, để giá cho người nhập", () => {
    const [r] = apSoTay<DongApSoTay>([{ ten_zh: "會安古鎮", mo_ta: "", loai: "ticket", don_gia: 0 }], bd, quyDoi);
    expect(r.mo_ta).toBe("Phố cổ Hội An");
    expect(r.don_gia).toBe(0);
    expect(r.nguon_gia).toBe("chua_co");
  });

  it("KHÔNG xoá giá đang đúng khi sổ tay không biết gì hơn", () => {
    const [r] = apSoTay<DongApSoTay>([{ ten_zh: "岘港巴拿山", mo_ta: "Bà Nà", loai: "ticket", don_gia: 850_000 }], bd, quyDoi);
    expect(r.don_gia).toBe(850_000);
    expect(r.mo_ta).toBe("Bà Nà");
  });

  it("KHÔNG đè lên dòng người nhập vừa tự sửa", () => {
    const rows: (DongApSoTay & { sua_tay?: boolean })[] = [{ ten_zh: "水上木偶戲", mo_ta: "Tên tôi tự gõ", loai: "ticket", don_gia: 55_000, sua_tay: true }];
    const [r] = apSoTay(rows, bd, quyDoi, (x) => !!x.sua_tay);
    expect(r.don_gia).toBe(55_000);
    expect(r.mo_ta).toBe("Tên tôi tự gõ");
  });

  it("mở lại bản nháp: giá cũ sai của lần trước được sổ tay tra lại", () => {
    // Đúng ca đã gặp: danh mục ghi nhầm set 300k thành 30.000 → bản nháp cất
    // con số sai; sau đó người nhập dạy sổ tay 320.000 ở báo giá khác. Mở nháp
    // ra phải ăn giá đã dạy, chứ không phải bày lại số sai.
    const bdLaoCai = banDoSoTay([
      dong({ id: 5, khoa_zh: chuanHoaZh("老街風味餐15 usd含酒水"), loai: "meal",
        ten_vi: "Cơm phong vị Lào Cai", don_gia: 320_000 }),
    ]);
    const [r] = apSoTay<DongApSoTay>(
      [{ ten_zh: "老街風味餐15 usd含酒水", mo_ta: "Cơm phong vị Lào Cai", loai: "meal", don_gia: 30_000 }],
      bdLaoCai, quyDoi,
    );
    expect(r.don_gia).toBe(320_000);
    expect(r.nguon_gia).toBe("so_tay");
  });

  it("trả mảng MỚI, không sửa tại chỗ", () => {
    const goc: DongApSoTay[] = [{ ten_zh: "水上木偶戲", mo_ta: "", loai: "ticket", don_gia: 0 }];
    const ra = apSoTay(goc, bd, quyDoi);
    expect(ra).not.toBe(goc);
    expect(goc[0].don_gia).toBe(0);
  });

  it("dòng không có chữ Trung thì đánh dấu chưa có giá, không nổ", () => {
    const [r] = apSoTay<DongApSoTay>([{ ten_zh: null, mo_ta: "Gì đó", loai: "ticket", don_gia: 0 }], bd, quyDoi);
    expect(r.nguon_gia).toBe("chua_co");
  });
});

describe("dongDeHocKhiLuuNhap — lưu nháp cũng phải nhớ giá vừa gõ", () => {
  const r = (over: Partial<DongLuuNhap>): DongLuuNhap => ({
    ten_zh: "老街風味餐15 usd含酒水", mo_ta: "Cơm phong vị Lào Cai",
    loai: "meal", don_gia: 320_000, ...over,
  });

  it("học dòng người nhập tự tay sửa", () => {
    const ra = dongDeHocKhiLuuNhap([r({ sua_tay: true })]);
    expect(ra).toHaveLength(1);
    expect(ra[0].don_gia).toBe(320_000);
    expect(ra[0].khoa_zh).toBe(chuanHoaZh("老街風味餐15 usd含酒水"));
  });

  it("KHÔNG học số máy đoán — lưu nháp là còn làm dở, chưa ai gật", () => {
    expect(dongDeHocKhiLuuNhap([r({ don_gia: 30_000 })])).toHaveLength(0);
  });

  it("bỏ loại sổ tay không nhận (xe) dù người nhập có sửa tay", () => {
    expect(dongDeHocKhiLuuNhap([r({ loai: "transport", sua_tay: true })])).toHaveLength(0);
  });

  it("dòng sửa tay mà không có chữ Trung thì không có khoá để nhớ", () => {
    expect(dongDeHocKhiLuuNhap([r({ ten_zh: null, sua_tay: true })])).toHaveLength(0);
  });
});
