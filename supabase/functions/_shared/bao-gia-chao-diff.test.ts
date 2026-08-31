import { describe, it, expect } from "vitest";
import { soSanhBanChao, TOI_DA_THAY_DOI, type BanChao } from "./bao-gia-chao-diff";

const ban = (over: Partial<BanChao["noi_dung"]> = {}, hieuLuc = "2026-09-30"): BanChao => ({
  hieu_luc_den: hieuLuc,
  noi_dung: {
    ten_chuong_trinh: "河內－下龍 3天2夜",
    so_ngay: 3,
    brackets: [
      { label: "16-19 pax", price_usd: 365 },
      { label: "20+ pax", price_usd: 352 },
    ],
    single_supplement_usd: 60,
    hotel_days: [
      { ngay: 1, ten: "Somerset Hanoi" },
      { ngay: 2, ten: "Paradise Cruise" },
    ],
    included: ["Xe đưa đón", "Vé thắng cảnh"],
    excluded: ["Vé máy bay"],
    notes: [],
    ...over,
  },
});

describe("soSanhBanChao — bản này khác bản trước ở chỗ nào", () => {
  it("hai bản giống hệt → không báo gì", () => {
    expect(soSanhBanChao(ban(), ban())).toEqual([]);
  });

  it("bản chào đầu tiên (không có bản trước) → không có gì để so", () => {
    expect(soSanhBanChao(null, ban())).toEqual([]);
  });

  it("đổi giá một bậc khách", () => {
    const moi = ban({ brackets: [
      { label: "16-19 pax", price_usd: 365 },
      { label: "20+ pax", price_usd: 345 },
    ] });
    expect(soSanhBanChao(ban(), moi)).toEqual([
      { kieu: "gia", bac: "20+ pax", tu: "352", den: "345" },
    ]);
  });

  it("đổi cách chia bậc → bỏ bậc cũ + thêm bậc mới", () => {
    const moi = ban({ brackets: [{ label: "25+ pax", price_usd: 340 }] });
    const kq = soSanhBanChao(ban(), moi);
    expect(kq).toContainEqual({ kieu: "bo_bac", bac: "16-19 pax", tu: "365" });
    expect(kq).toContainEqual({ kieu: "bo_bac", bac: "20+ pax", tu: "352" });
    expect(kq).toContainEqual({ kieu: "them_bac", bac: "25+ pax", den: "340" });
  });

  it("đổi phụ thu phòng đơn", () => {
    expect(soSanhBanChao(ban(), ban({ single_supplement_usd: 75 }))).toEqual([
      { kieu: "don_phong", tu: "60", den: "75" },
    ]);
  });

  it("đổi khách sạn của một ngày, nói rõ ngày thứ mấy", () => {
    const moi = ban({ hotel_days: [
      { ngay: 1, ten: "Melia Hanoi" },
      { ngay: 2, ten: "Paradise Cruise" },
    ] });
    expect(soSanhBanChao(ban(), moi)).toEqual([
      { kieu: "khach_san", ngay: 1, tu: "Somerset Hanoi", den: "Melia Hanoi" },
    ]);
  });

  it("thêm và bỏ dòng trong phần bao gồm / không bao gồm", () => {
    const moi = ban({
      included: ["Xe đưa đón", "Vé thắng cảnh", "Bảo hiểm du lịch"],
      excluded: [],
    });
    const kq = soSanhBanChao(ban(), moi);
    expect(kq).toContainEqual({ kieu: "them_dong", muc: "bao_gom", den: "Bảo hiểm du lịch" });
    expect(kq).toContainEqual({ kieu: "bo_dong", muc: "khong_bao_gom", tu: "Vé máy bay" });
  });

  it("đảo thứ tự dòng KHÔNG tính là thay đổi", () => {
    const moi = ban({ included: ["Vé thắng cảnh", "Xe đưa đón"] });
    expect(soSanhBanChao(ban(), moi)).toEqual([]);
  });

  it("thừa khoảng trắng KHÔNG tính là thay đổi", () => {
    const moi = ban({ included: ["  Xe đưa đón ", "Vé thắng cảnh"] });
    expect(soSanhBanChao(ban(), moi)).toEqual([]);
  });

  it("đổi hạn hiệu lực và số ngày", () => {
    const kq = soSanhBanChao(ban(), ban({ so_ngay: 4 }, "2026-10-15"));
    expect(kq).toContainEqual({ kieu: "so_ngay", tu: "3", den: "4" });
    expect(kq).toContainEqual({ kieu: "hieu_luc", tu: "2026-09-30", den: "2026-10-15" });
  });

  it("tiền đứng trước chữ — đối tác đọc dòng đầu là thấy cái đáng quan tâm nhất", () => {
    const moi = ban({
      included: ["Xe đưa đón", "Vé thắng cảnh", "Nước uống"],
      brackets: [
        { label: "16-19 pax", price_usd: 360 },
        { label: "20+ pax", price_usd: 352 },
      ],
      hotel_days: [
        { ngay: 1, ten: "Melia Hanoi" },
        { ngay: 2, ten: "Paradise Cruise" },
      ],
    });
    const kq = soSanhBanChao(ban(), moi);
    expect(kq.map((x) => x.kieu)).toEqual(["gia", "khach_san", "them_dong"]);
  });

  it("bản viết lại toàn bộ vẫn bị cắt ở mức tối đa", () => {
    const nhieu = Array.from({ length: 120 }, (_, i) => `Dòng ${i}`);
    const kq = soSanhBanChao(ban(), ban({ included: nhieu }));
    expect(kq.length).toBe(TOI_DA_THAY_DOI);
  });

  it("nội dung hỏng một bên → không nổ, chỉ báo phần so được", () => {
    expect(() => soSanhBanChao({ noi_dung: null }, ban())).not.toThrow();
    expect(soSanhBanChao({ noi_dung: null }, { noi_dung: null })).toEqual([]);
  });
});
