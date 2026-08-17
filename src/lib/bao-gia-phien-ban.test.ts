import { describe, it, expect } from "vitest";
import { buildPhienBan, maPhienBan, soSanhPhienBan, type PhienBanDeSoSanh } from "./bao-gia-phien-ban";
import { assertNoCostLeak } from "./portal-payload";
import type { BaoGiaCase, BaoGiaItem, BaoGiaKetQua, BaoGiaRow } from "@/hooks/use-bao-gia";

const kase = (guests: number, usd: number): BaoGiaCase => ({
  guests, pax: guests + 1, rooms: Math.ceil(guests / 2) + 1,
  hotel: 0, meal: 0, ticket: 0, transport: 0, insurance: 0, guide: 0, tips: 0,
  total_cost: 0, profit_vnd: 0,
  final_price_vnd: Math.round(usd * 26000), final_price_usd: usd,
});

const items: BaoGiaItem[] = [
  { loai: "hotel",  mo_ta: "Khách sạn A", don_gia: 2_000_000, ghi_chu: "", ngay_so: 1 },
  { loai: "ticket", mo_ta: "Vịnh Hạ Long", don_gia: 900_000,  ghi_chu: "", ngay_so: 2, ten_zh: "下龍灣" },
  { loai: "meal",   mo_ta: "Nhà hàng A",  don_gia: 100_000,   ghi_chu: "", ngay_so: 2, bua_an: "trua" },
];

const ket = (over: Partial<BaoGiaKetQua> = {}): BaoGiaKetQua => ({
  ten_chuong_trinh: "越南北部 5 天",
  so_ngay: 5,
  items,
  case_16: kase(16, 365),
  case_20: kase(20, 352),
  gia_trung_binh_vnd: 359 * 26000,
  gia_trung_binh_usd: 359,
  ...over,
});

const row = (over: Partial<BaoGiaRow> = {}): BaoGiaRow => ({
  id: 25, tieu_de: "Báo giá mẫu", noi_dung_goc: null, ket_qua: ket(),
  exchange_rate: 26000, profit_usd: 10, trang_thai: "draft",
  created_at: "2026-08-13T02:00:00Z", created_by: null,
  ngay_di: "2027-02-27", ngay_ve: "2027-03-03", ghi_chu: null, hieu_luc_ngay: 30,
  ma_bg: "BG00025", lead_id: null, xe_ten: "Xe 29 chỗ", xe_gia: 10_000_000,
  phu_thu: 0, vcb_rate: null, agent_id: 2, loai_tour: "inbound",
  loai_bao_gia: "tu_tinh", lich_trinh_files: [],
  so_phien_ban_cuoi: 0, phien_ban_hien_hanh_id: null,
  portal_noi_dung: null, portal_enabled: false, portal_pushed_at: null,
  ...over,
});

describe("maPhienBan — đối tác biết mình đang cầm bản nào", () => {
  it("bản đầu giữ nguyên mã gốc", () => {
    expect(maPhienBan("BG00025", 1)).toBe("BG00025");
  });
  it("từ bản 2 thêm hậu tố", () => {
    expect(maPhienBan("BG00025", 2)).toBe("BG00025-v2");
    expect(maPhienBan("BG00025", 10)).toBe("BG00025-v10");
  });
});

describe("buildPhienBan — chụp hai lớp", () => {
  const now = new Date("2026-08-17T03:00:00Z");

  it("lớp chào mang bậc giá bán, lớp vốn mang đơn giá gốc", () => {
    const pb = buildPhienBan(row(), ket(), now);
    expect(pb.noi_dung_chao.noi_dung.brackets.map((b) => b.price_usd)).toEqual([389, 365, 352, 345, 340]);
    expect(pb.noi_dung_von.items).toHaveLength(3);
    expect(pb.noi_dung_von.items[0].don_gia).toBe(2_000_000);
    expect(pb.noi_dung_von.xe_gia).toBe(10_000_000);
  });

  it("lớp CHÀO tuyệt đối không mang giá vốn — chốt chặn vẫn chạy", () => {
    const pb = buildPhienBan(row(), ket(), now);
    expect(() => assertNoCostLeak(pb.noi_dung_chao)).not.toThrow();
    const blob = JSON.stringify(pb.noi_dung_chao);
    for (const gia of ["2000000", "900000", "100000", "10000000"]) {
      expect(blob).not.toContain(gia);
    }
  });

  it("lớp VỐN thì cố tình có giá vốn — nếu không sẽ vô dụng khi truy vì sao giá đổi", () => {
    const pb = buildPhienBan(row(), ket(), now);
    // Chính vì thế nó phải bị chặn nếu ai đó lỡ đem lớp này ra ngoài.
    expect(() => assertNoCostLeak(pb.noi_dung_von)).toThrow(/giá vốn không được rời CRM/);
    expect(pb.noi_dung_von.items[0].don_gia).toBe(2_000_000);
  });

  it("hạn hiệu lực lấy theo hieu_luc_ngay của báo giá", () => {
    const pb = buildPhienBan(row({ hieu_luc_ngay: 30 }), ket(), now);
    expect(pb.noi_dung_chao.chao_ngay).toBe("2026-08-17");
    expect(pb.noi_dung_chao.hieu_luc_den).toBe("2026-09-16");
  });
});

describe("soSanhPhienBan — vì sao bản mới khác bản cũ", () => {
  const now = new Date("2026-08-17T03:00:00Z");
  const banCu = (): PhienBanDeSoSanh => buildPhienBan(row(), ket(), now);

  it("hai bản y hệt → báo giống nhau, không kể lể", () => {
    const kq = soSanhPhienBan(banCu(), banCu());
    expect(kq.giong_nhau).toBe(true);
    expect(kq.bac_gia).toEqual([]);
    expect(kq.dich_vu).toEqual([]);
  });

  it("hạ giá bậc 20 pax → nêu đúng bậc và mức chênh", () => {
    const moi = buildPhienBan(row(), ket({ case_20: kase(20, 340) }), now);
    const kq = soSanhPhienBan(banCu(), moi);
    const b = kq.bac_gia.find((x) => x.label === "20-24 pax")!;
    expect(b).toMatchObject({ cu: 352, moi: 340, chenh: -12 });
    expect(kq.giong_nhau).toBe(false);
  });

  it("đổi khách sạn → hiện thành bỏ một dòng, thêm một dòng", () => {
    const moiItems: BaoGiaItem[] = [
      { loai: "hotel", mo_ta: "Khách sạn B", don_gia: 1_500_000, ghi_chu: "", ngay_so: 1 },
      ...items.slice(1),
    ];
    const kq = soSanhPhienBan(banCu(), buildPhienBan(row(), ket({ items: moiItems }), now));
    expect(kq.dich_vu.map((d) => d.kieu).sort()).toEqual(["bo", "them"]);
    expect(kq.dich_vu.find((d) => d.kieu === "bo")).toMatchObject({ mo_ta: "Khách sạn A", cu: 2_000_000 });
    expect(kq.dich_vu.find((d) => d.kieu === "them")).toMatchObject({ mo_ta: "Khách sạn B", moi: 1_500_000 });
  });

  it("giữ nguyên dịch vụ nhưng đổi đơn giá → báo doi_gia kèm số cũ và mới", () => {
    const moiItems = items.map((it) => it.loai === "ticket" ? { ...it, don_gia: 950_000 } : it);
    const kq = soSanhPhienBan(banCu(), buildPhienBan(row(), ket({ items: moiItems }), now));
    expect(kq.dich_vu).toHaveLength(1);
    expect(kq.dich_vu[0]).toMatchObject({ kieu: "doi_gia", mo_ta: "Vịnh Hạ Long", cu: 900_000, moi: 950_000 });
  });

  it("đổi tỷ giá / lãi / xe / phụ thu → nêu ở phần thông số chung", () => {
    const moi = buildPhienBan(row({ exchange_rate: 25_500, profit_usd: 8, phu_thu: 500_000 }), ket(), now);
    const kq = soSanhPhienBan(banCu(), moi);
    expect(kq.thong_so.map((t) => t.ten).sort()).toEqual(["Lợi nhuận (USD/khách)", "Phụ thu", "Tỷ giá"]);
  });

  it("bản backfill thiếu lớp vốn → vẫn so được bậc giá, chỉ bỏ phần dịch vụ", () => {
    const cuThieuVon: PhienBanDeSoSanh = { noi_dung_chao: banCu().noi_dung_chao, noi_dung_von: null };
    const moi = buildPhienBan(row(), ket({ case_20: kase(20, 340) }), now);
    const kq = soSanhPhienBan(cuThieuVon, moi);
    expect(kq.bac_gia.length).toBeGreaterThan(0);
    expect(kq.dich_vu).toEqual([]);   // không bịa ra thay đổi khi không có dữ liệu
    expect(kq.thong_so).toEqual([]);
  });

  it("đổi 單房差 được nêu riêng, không lẫn vào bậc giá", () => {
    const moi = buildPhienBan(row(), ket({ export_config: { single_supplement_usd: 99 } }), now);
    const kq = soSanhPhienBan(banCu(), moi);
    expect(kq.single_supplement).toMatchObject({ moi: 99 });
    expect(kq.bac_gia).toEqual([]);
  });
});
