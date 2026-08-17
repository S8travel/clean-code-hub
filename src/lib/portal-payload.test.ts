import { describe, it, expect } from "vitest";
import { assertNoCostLeak, buildPortalBaoGiaSnapshot, HIEU_LUC_MAC_DINH_NGAY } from "./portal-payload";
import type { BaoGiaCase, BaoGiaItem, BaoGiaKetQua, BaoGiaRow } from "@/hooks/use-bao-gia";

const kase = (guests: number, usd: number): BaoGiaCase => ({
  guests, pax: guests + 1, rooms: Math.ceil(guests / 2) + 1,
  hotel: 0, meal: 0, ticket: 0, transport: 0, insurance: 0, guide: 0, tips: 0,
  total_cost: 0, profit_vnd: 0,
  final_price_vnd: Math.round(usd * 26000), final_price_usd: usd,
});

const items: BaoGiaItem[] = [
  { loai: "hotel",  mo_ta: "Khách sạn A", don_gia: 2_000_000, ghi_chu: "", ngay_so: 1 },
  { loai: "ticket", mo_ta: "Vịnh Hạ Long",  don_gia: 900_000,   ghi_chu: "", ngay_so: 2, ten_zh: "下龍灣" },
  { loai: "meal",   mo_ta: "Nhà hàng A",  don_gia: 100_000,   ghi_chu: "", ngay_so: 2, bua_an: "trua" },
];

const ketQua: BaoGiaKetQua = {
  ten_chuong_trinh: "越南北部 5 天",
  so_ngay: 5,
  items,
  case_16: kase(16, 365),
  case_20: kase(20, 352),
  gia_trung_binh_vnd: 359 * 26000,
  gia_trung_binh_usd: 359,
};

const row = (over: Partial<BaoGiaRow> = {}): BaoGiaRow => ({
  id: 12,
  tieu_de: "Báo giá mẫu 5N4Đ",
  noi_dung_goc: null,
  ket_qua: ketQua,
  exchange_rate: 26000,
  profit_usd: 10,
  trang_thai: "sent",
  created_at: "2026-08-14T02:00:00Z",
  created_by: null,
  ngay_di: "2026-10-01",
  ngay_ve: "2026-10-05",
  ghi_chu: null,
  hieu_luc_ngay: null,
  ma_bg: "BG00012",
  lead_id: null,
  xe_ten: "Xe 29 chỗ",
  xe_gia: 10_000_000,
  phu_thu: 400_000,
  vcb_rate: 25_000,
  agent_id: 3,
  loai_tour: "inbound",
  loai_bao_gia: "tu_tinh",
  lich_trinh_files: [],
  portal_noi_dung: null,
  portal_enabled: false,
  portal_pushed_at: null,
  ...over,
});

describe("assertNoCostLeak — chốt chặn giá vốn rời CRM", () => {
  it("cho qua payload sạch", () => {
    expect(() => assertNoCostLeak({ ma_bg: "BG1", gia_ban_usd: 365, ngay: [{ ten: "A" }] })).not.toThrow();
  });

  it("chặn field giá vốn lồng sâu trong mảng", () => {
    expect(() => assertNoCostLeak({ ngay: [{ items: [{ don_gia: 100 }] }] }))
      .toThrow(/don_gia/);
  });

  it("chặn cả biến thể tên có tiền tố/hậu tố", () => {
    expect(() => assertNoCostLeak({ tong_chi_phi_vnd: 1 })).toThrow(/chi_phi/);
    expect(() => assertNoCostLeak({ NhaCungCapId: 5 })).toThrow(/nha_cung_cap|NhaCungCap/i);
    expect(() => assertNoCostLeak({ ks_dat_truoc_status: "da_gui" })).toThrow(/dat_truoc/);
  });

  it("chặn thông tin thanh toán của nhà cung cấp", () => {
    expect(() => assertNoCostLeak({ so_tai_khoan: "123", ngan_hang: "VCB" })).toThrow();
  });

  it("nêu rõ đường dẫn tới field vi phạm để sửa nhanh", () => {
    expect(() => assertNoCostLeak({ doan: { ngay: [{ tien_cong_ty: 1 }] } }))
      .toThrow(/\$\.doan\.ngay\[0\]\.tien_cong_ty/);
  });
});

describe("buildPortalBaoGiaSnapshot", () => {
  const now = new Date("2026-08-14T03:00:00Z");

  it("hiệu lực mặc định 90 ngày — khớp câu 報價效期：3 個月 in trên file Word", () => {
    const s = buildPortalBaoGiaSnapshot(row(), ketQua, now);
    expect(HIEU_LUC_MAC_DINH_NGAY).toBe(90);
    expect(s.chao_ngay).toBe("2026-08-14");
    expect(s.hieu_luc_den).toBe("2026-11-12");
  });

  it("tôn trọng hieu_luc_ngay nhập tay trên báo giá", () => {
    const s = buildPortalBaoGiaSnapshot(row({ hieu_luc_ngay: 30 }), ketQua, now);
    expect(s.hieu_luc_den).toBe("2026-09-13");
  });

  it("mã báo giá thiếu ma_bg → sinh từ id, không để trống", () => {
    const s = buildPortalBaoGiaSnapshot(row({ ma_bg: null }), ketQua, now);
    expect(s.ma_bg).toBe("BG00012");
  });

  it("mang đúng bảng giá bán USD theo bậc + 單房差", () => {
    const s = buildPortalBaoGiaSnapshot(row(), ketQua, now);
    expect(s.noi_dung.brackets.map((b) => b.price_usd)).toEqual([389, 365, 352, 345, 340]);
    expect(s.noi_dung.hotel_days).toEqual([{ ngay: 1, ten: "Khách sạn A" }]);
    expect(s.noi_dung.included).toContain("下龍灣");
  });

  it("KHÔNG mang theo bất kỳ con số giá vốn nào của đoàn", () => {
    const s = buildPortalBaoGiaSnapshot(row(), ketQua, now);
    const blob = JSON.stringify(s);
    // đơn giá KS/vé/ăn, giá xe, phụ thu, tỷ giá VCB, lợi nhuận/khách
    for (const gia of ["2000000", "900000", "100000", "10000000", "400000", "25000"]) {
      expect(blob).not.toContain(gia);
    }
  });

  it("ném lỗi thay vì đẩy đi nếu snapshot lỡ mang field giá vốn", () => {
    // Giả lập lập trình viên sau này nhét thêm field vào ket_qua và quên rằng
    // nó chảy thẳng ra cổng đối tác.
    const ban = { ...ketQua, export_config: { notes: "ok" } } as BaoGiaKetQua & { don_gia_goc: number };
    ban.don_gia_goc = 999;
    expect(() => buildPortalBaoGiaSnapshot(row(), ban, now)).not.toThrow(); // ket_qua không được copy nguyên khối
    const s = buildPortalBaoGiaSnapshot(row(), ban, now);
    expect(JSON.stringify(s)).not.toContain("999");
  });
});
