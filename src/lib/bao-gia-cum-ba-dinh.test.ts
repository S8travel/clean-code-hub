import { describe, it, expect } from "vitest";
import { apVeCumBaDinh, phanLoaiCumBaDinh, veCumBaDinh, GHI_CHU_CHUNG_VE, GHI_CHU_KHONG_VAO } from "./bao-gia-cum-ba-dinh";
import type { ResolveMaps, ResolvedItem } from "./bao-gia-ai-resolve";

// Danh mục rút gọn theo đúng hình dạng thật: cụm Ba Đình nằm rải ở nhiều bản
// ghi, có cái ghi rõ "xem ngoài". Mức vé ở đây là giá NIÊM YẾT công khai, không
// phải giá vốn đàm phán với nhà cung cấp — repo công khai nên phân biệt rõ.
const maps: ResolveMaps = {
  canhDiem: new Map([
    [226, { ten: "Quảng Trường Ba Đình", gia: null }],
    [238, { ten: "Phủ chủ tịch (đi qua)", gia: null }],
    [239, { ten: "Phủ Chủ tịch + Nhà sàn (1 vé)", gia: 40_000 }],
    [517, { ten: "Phủ Chủ Tịch (xem ngoài)", gia: null }],
    [581, { ten: "Nhà sàn Bác Hồ", gia: 40_000 }],
  ]),
  nhaHang: new Map(),
  setMenu: new Map(),
  khachSan: new Map(),
  khachSanGia: new Map(),
  xe: new Map(),
};

const dong = (over: Partial<ResolvedItem>): ResolvedItem => ({
  ngay_so: 3, loai: "ticket", mo_ta: "", don_gia: 0, ten_zh: "", ten_vi: "",
  ghi_chu: "", confidence: 1, status: "matched", match_label: "", ...over,
});

describe("phanLoaiCumBaDinh — vào trong hay chỉ nhìn từ ngoài", () => {
  it("có Phủ Chủ tịch / nhà sàn, không ghi 外觀 → vào trong (mua vé)", () => {
    expect(phanLoaiCumBaDinh("巴亭廣場-胡志明陵寢-主席府-胡志明故居")).toBe("vao_trong");
    expect(phanLoaiCumBaDinh("主席府")).toBe("vao_trong");
    expect(phanLoaiCumBaDinh("總督府")).toBe("vao_trong");        // tên cũ của cùng một nơi
    expect(phanLoaiCumBaDinh("胡志明故居（高腳屋）")).toBe("vao_trong");
  });

  it("ghi rõ chỉ nhìn từ ngoài → không vé", () => {
    expect(phanLoaiCumBaDinh("一柱寺、主席府(外觀)")).toBe("ngoai_quan");
    expect(phanLoaiCumBaDinh("胡志明陵寢/總督府(外觀)")).toBe("ngoai_quan");
    expect(phanLoaiCumBaDinh("主席府（車遊）")).toBe("ngoai_quan");
  });

  it("chỉ quảng trường / lăng / chùa Một Cột → không vé", () => {
    expect(phanLoaiCumBaDinh("胡志明陵寢，領事館，巴庭廣場")).toBe("ngoai_quan");
    expect(phanLoaiCumBaDinh("胡志明陵寢(外觀)")).toBe("ngoai_quan");
    expect(phanLoaiCumBaDinh("一柱寺")).toBe("ngoai_quan");
  });

  it("外觀 chỉ thuộc về điểm đứng ngay trước nó, không phủ cả dòng", () => {
    // Lăng xem ngoài, nhưng vẫn VÀO phủ — gộp cả dòng mà xét là bỏ mất một vé thật.
    expect(phanLoaiCumBaDinh("胡志明陵寢(外觀)、主席府")).toBe("vao_trong");
    expect(phanLoaiCumBaDinh("巴亭廣場(外觀)-主席府-胡志明故居")).toBe("vao_trong");
  });

  it("dòng không liên quan tới cụm → không đụng tới", () => {
    expect(phanLoaiCumBaDinh("下龍灣遊船")).toBeNull();
    expect(phanLoaiCumBaDinh("", "Vịnh Hạ Long")).toBeNull();
    expect(phanLoaiCumBaDinh("文廟")).toBeNull();
  });

  it("CHỮ HÁN GỐC thắng nhãn tiếng Việt — nhãn có thể do khớp nhầm từ trước", () => {
    // Đúng ca đang có trong dữ liệu thật: dòng chỉ có lăng + quảng trường nhưng
    // bị gán nhãn "Phủ chủ tịch". Tin nhãn là thu tiền vé của chỗ khách không vào.
    expect(phanLoaiCumBaDinh("胡志明陵寢，領事館，巴庭廣場", "Phủ chủ tịch")).toBe("ngoai_quan");
  });

  it("không có chữ Hán (OP gõ tay) thì mới xét tiếng Việt", () => {
    expect(phanLoaiCumBaDinh("", "Phủ chủ tịch")).toBe("vao_trong");
    expect(phanLoaiCumBaDinh(null, "Nhà sàn Bác Hồ")).toBe("vao_trong");
    expect(phanLoaiCumBaDinh("", "Phủ Chủ Tịch (xem ngoài)")).toBe("ngoai_quan");
    expect(phanLoaiCumBaDinh("", "Quảng trường Ba Đình")).toBe("ngoai_quan");
  });
});

describe("veCumBaDinh — lấy giá vé từ danh mục, không chôn số trong code", () => {
  it("ưu tiên bản ghi Phủ Chủ tịch CÓ GIÁ, bỏ qua bản ghi 'xem ngoài'", () => {
    expect(veCumBaDinh(maps)).toEqual({ id: 239, ten: "Phủ Chủ tịch + Nhà sàn (1 vé)", gia: 40_000 });
  });

  it("danh mục chỉ có nhà sàn → vẫn ra vé đó (một vé chung cho cả hai nơi)", () => {
    const chiNhaSan: ResolveMaps = { ...maps, canhDiem: new Map([[581, { ten: "Nhà sàn Bác Hồ", gia: 40_000 }]]) };
    expect(veCumBaDinh(chiNhaSan)?.id).toBe(581);
  });

  it("danh mục không có bản ghi nào có giá → null, không bịa giá", () => {
    expect(veCumBaDinh({ ...maps, canhDiem: new Map() })).toBeNull();
  });
});

describe("apVeCumBaDinh — áp luật lên các dòng vé", () => {
  it("vào trong mà dòng chưa có giá → lấy giá vé cụm trong danh mục", () => {
    const ra = apVeCumBaDinh([dong({ ten_zh: "巴亭廣場-胡志明陵寢-主席府-胡志明故居" })], maps);
    expect(ra[0].don_gia).toBe(40_000);
    expect(ra[0].match_table).toBe("canh_diem");
    expect(ra[0].match_id).toBe(239);
    expect(ra[0].cum_ba_dinh).toBe("vao_trong");
  });

  it("vào trong mà dòng ĐÃ có giá → giữ giá đó (vé có thể đã lên giá)", () => {
    const ra = apVeCumBaDinh([dong({ ten_zh: "主席府", don_gia: 45_000, nguon_gia: "so_tay" })], maps);
    expect(ra[0].don_gia).toBe(45_000);
    expect(ra[0].cum_ba_dinh).toBe("vao_trong");
  });

  it("chỉ nhìn từ ngoài → 0 đồng, kể cả khi sổ tay đang nhớ có tiền", () => {
    const ra = apVeCumBaDinh([dong({ ten_zh: "胡志明陵寢/總督府(外觀)", don_gia: 40_000, nguon_gia: "so_tay" })], maps);
    expect(ra[0].don_gia).toBe(0);
    expect(ra[0].cum_ba_dinh).toBe("ngoai_quan");
    expect(ra[0].ghi_chu).toContain(GHI_CHU_KHONG_VAO);
    expect(ra[0].nguon_gia).toBeUndefined();
  });

  it("một vé vào cả hai nơi: dòng thứ hai trong CÙNG NGÀY về 0", () => {
    const ra = apVeCumBaDinh([
      dong({ ngay_so: 4, ten_zh: "主席府" }),
      dong({ ngay_so: 4, ten_zh: "胡志明故居" }),
    ], maps);
    expect(ra[0].don_gia).toBe(40_000);
    expect(ra[1].don_gia).toBe(0);
    expect(ra[1].cum_ba_dinh).toBe("da_gom");
    expect(ra[1].ghi_chu).toContain(GHI_CHU_CHUNG_VE);
  });

  it("hai ngày khác nhau thì mỗi ngày một vé", () => {
    const ra = apVeCumBaDinh([
      dong({ ngay_so: 2, ten_zh: "主席府" }),
      dong({ ngay_so: 5, ten_zh: "胡志明故居" }),
    ], maps);
    expect(ra.map((r) => r.don_gia)).toEqual([40_000, 40_000]);
  });

  it("OP vừa sửa tay → không đụng tới, người nhập luôn thắng", () => {
    const ra = apVeCumBaDinh([dong({ ten_zh: "主席府(外觀)", don_gia: 50_000, sua_tay: true })], maps);
    expect(ra[0].don_gia).toBe(50_000);
    expect(ra[0].cum_ba_dinh).toBeUndefined();
  });

  it("dòng ăn / khách sạn không bị luật vé đụng vào", () => {
    const ra = apVeCumBaDinh([dong({ loai: "meal", ten_zh: "主席府旁餐廳", don_gia: 200_000 })], maps);
    expect(ra[0].don_gia).toBe(200_000);
    expect(ra[0].cum_ba_dinh).toBeUndefined();
  });

  it("danh mục chưa có vé nào → vẫn nhận ra dòng, để người nhập gõ giá", () => {
    const ra = apVeCumBaDinh([dong({ ten_zh: "主席府" })], { ...maps, canhDiem: new Map() });
    expect(ra[0].don_gia).toBe(0);
    expect(ra[0].cum_ba_dinh).toBe("vao_trong");
  });

  it("không sửa mảng gốc — dòng đi thẳng vào state React", () => {
    const goc = [dong({ ten_zh: "主席府" })];
    const ra = apVeCumBaDinh(goc, maps);
    expect(goc[0].don_gia).toBe(0);
    expect(ra).not.toBe(goc);
  });
});
