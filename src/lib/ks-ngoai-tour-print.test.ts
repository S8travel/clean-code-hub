import { describe, it, expect } from "vitest";
import {
  buildNgoaiTourEdgeData, buildNgoaiTourSelectedData, getNgoaiTourPrintableKsIds,
  ngoaiTourLiveDntts, selectPrintableNgoaiTourDntts, type HotelLite,
} from "./ks-ngoai-tour-print";
import { calcTotalThanhTien } from "./export-dntt-ks-word";
import type { ChiPhiRow, DNTTRow } from "@/hooks/use-chi-phi";

const row = (p: Partial<ChiPhiRow>): ChiPhiRow => ({
  danh_muc: "khach_san", ngoai_tour: true, khach_san_id: 1,
  mo_ta: "19 twn 8 dbl", so_luong: 27, foc_count: 3, don_gia: 800_000,
  tien_cong_ty: 19_200_000, ngoai_tour_ci: "2026-07-24", ngoai_tour_co: "2026-07-25",
  ...p,
} as unknown as ChiPhiRow);

const dntt = (p: Partial<DNTTRow>): DNTTRow => ({
  id: 1, ref_loai: "ngoai_tour_ks", ref_id: 1, so_tien: 19_200_000,
  trang_thai_duyet: "cho_duyet", payment_status: "unpaid", paid_amount: 0, la_coc: false, ghi_chu: null,
  ...p,
} as unknown as DNTTRow);

const hotels: HotelLite[] = [{ id: 1, ten: "Dusit", tai_khoan_thanh_toan: "NCC X\n123\nVCB" }];

describe("ngoaiTourLiveDntts", () => {
  it("lọc theo ref_loai='ngoai_tour_ks' + ref_id, bỏ da_huy/tu_choi", () => {
    const list = [
      dntt({ id: 1, ref_id: 1 }),
      dntt({ id: 2, ref_id: 1, trang_thai_duyet: "da_huy" }),
      dntt({ id: 3, ref_id: 1, trang_thai_duyet: "tu_choi" }),
      dntt({ id: 4, ref_id: 2 }),
      dntt({ id: 5, ref_id: 1, ref_loai: "khach_san" }), // KS trong tour → bỏ
    ];
    expect(ngoaiTourLiveDntts(list, 1).map((d) => d.id)).toEqual([1]);
  });
});

describe("getNgoaiTourPrintableKsIds", () => {
  it("chỉ KS ngoài tour có ĐNTT sống", () => {
    const rows = [row({ khach_san_id: 1 }), row({ khach_san_id: 2 })];
    const list = [dntt({ id: 1, ref_id: 1 })]; // chỉ ks 1 có ĐNTT
    expect(getNgoaiTourPrintableKsIds(rows, list)).toEqual([1]);
  });
});

describe("buildNgoaiTourEdgeData", () => {
  it("Tổng tiền của roomEntries = NET (khớp ảnh: (27−3)×800k×1 = 19.2tr)", () => {
    const d = dntt({ id: 1 });
    const e = buildNgoaiTourEdgeData([row({})], hotels[0], d, [d], "ĐOÀN A", "Nguyễn A");
    expect(calcTotalThanhTien(e.roomEntries)).toBe(19_200_000);
    expect(e.soTien).toBe(19_200_000);
    expect(e.ks.ten).toBe("Dusit");
    expect(e.ncc?.so_tai_khoan).toBe("NCC X\n123\nVCB");
    expect(e.nguoiDeNghi).toBe("Nguyễn A");
    expect(e.checkIn).toBe("24/07/2026");
    expect(e.checkOut).toBe("25/07/2026");
  });

  it("cocTotal = paid của ĐNTT KHÁC (cùng KS)", () => {
    const dCoc = dntt({ id: 1, so_tien: 5_000_000, la_coc: true, payment_status: "paid", paid_amount: 5_000_000 });
    const dConLai = dntt({ id: 2, so_tien: 14_200_000 });
    const live = [dCoc, dConLai];
    const e = buildNgoaiTourEdgeData([row({})], hotels[0], dConLai, live, "A", "x");
    expect(e.cocTotal).toBe(5_000_000);   // cọc đã trả của ĐNTT #1
    expect(e.soTien).toBe(14_200_000);    // phần còn lại của ĐNTT #2
  });

  it("cấn trừ CỦA CHÍNH ĐNTT đang in → canTruTotal + canTruNote (bản in trừ đúng)", () => {
    const d = dntt({ id: 7, so_tien: 12_100_000 });
    const pays = [
      { dntt_id: 7, method: "can_tru", so_tien: 550_000, ghi_chu: "Cấn trừ từ đoàn: VHB121909BR5" },
      { dntt_id: 9, method: "can_tru", so_tien: 999, ghi_chu: "Cấn trừ từ đoàn: KHÁC" }, // ĐNTT khác → bỏ
      { dntt_id: 7, method: "cash", so_tien: 100, ghi_chu: null },                        // cash → không phải cấn trừ
    ];
    const e = buildNgoaiTourEdgeData([row({})], hotels[0], d, [d], "A", "x", pays);
    expect(e.canTruTotal).toBe(550_000);
    expect(e.canTruNote).toBe("Cấn trừ từ đoàn: VHB121909BR5");
    // Template Word: "Thanh toán" = soTien − canTruTotal = 12.1tr − 550k = 11.55tr
    expect(e.soTien).toBe(12_100_000);
  });

  it("không có cấn trừ → canTruTotal/canTruNote undefined", () => {
    const d = dntt({ id: 1 });
    const e = buildNgoaiTourEdgeData([row({})], hotels[0], d, [d], "A", "x");
    expect(e.canTruTotal).toBeUndefined();
    expect(e.canTruNote).toBeUndefined();
  });
});

describe("selectPrintableNgoaiTourDntts", () => {
  it("bỏ ĐNTT đã trả đủ khi còn phiếu chưa trả (không in double)", () => {
    const daTra = dntt({ id: 1, so_tien: 3_150_000, payment_status: "paid", paid_amount: 3_150_000 });
    const conLai = dntt({ id: 2, so_tien: 1_050_000 });
    expect(selectPrintableNgoaiTourDntts([daTra, conLai]).map((d) => d.id)).toEqual([2]);
  });

  it("giữ phiếu trả một phần", () => {
    const partial = dntt({ id: 3, so_tien: 5_000_000, payment_status: "partial", paid_amount: 2_000_000 });
    expect(selectPrintableNgoaiTourDntts([partial]).map((d) => d.id)).toEqual([3]);
  });

  it("nhiều phiếu chưa trả → in hết, cọc xếp trước", () => {
    const conLai = dntt({ id: 2, so_tien: 10_000_000 });
    const coc = dntt({ id: 5, so_tien: 3_000_000, la_coc: true });
    expect(selectPrintableNgoaiTourDntts([conLai, coc]).map((d) => d.id)).toEqual([5, 2]);
  });

  it("tất cả đã trả đủ → in phiếu mới nhất (theo tao_luc)", () => {
    const cu = dntt({ id: 1, payment_status: "paid", paid_amount: 1, tao_luc: "2026-07-13T04:21:06Z" });
    const moi = dntt({ id: 2, payment_status: "paid", paid_amount: 1, tao_luc: "2026-07-21T02:23:52Z" });
    expect(selectPrintableNgoaiTourDntts([cu, moi]).map((d) => d.id)).toEqual([2]);
    expect(selectPrintableNgoaiTourDntts([moi, cu]).map((d) => d.id)).toEqual([2]);
  });

  it("tất cả đã trả đủ + thiếu tao_luc → fallback id lớn nhất", () => {
    const a = dntt({ id: 4, payment_status: "paid", paid_amount: 1, tao_luc: null });
    const b = dntt({ id: 9, payment_status: "paid", paid_amount: 1, tao_luc: null });
    expect(selectPrintableNgoaiTourDntts([a, b]).map((d) => d.id)).toEqual([9]);
  });

  it("không có ĐNTT nào → mảng rỗng", () => {
    expect(selectPrintableNgoaiTourDntts([])).toEqual([]);
  });
});

describe("buildNgoaiTourSelectedData", () => {
  it("thẻ có phiếu đã trả + phiếu còn lại → CHỈ 1 khối in (bug in double)", () => {
    const rows = [row({ khach_san_id: 1 })];
    const list = [
      dntt({ id: 1, ref_id: 1, so_tien: 3_150_000, payment_status: "paid", paid_amount: 3_150_000 }),
      dntt({ id: 2, ref_id: 1, so_tien: 1_050_000 }),
    ];
    const data = buildNgoaiTourSelectedData([1], rows, list, hotels, "A", "x");
    expect(data).toHaveLength(1);
    expect(data[0].soTien).toBe(1_050_000);
    expect(data[0].cocTotal).toBe(3_150_000);  // phần đã trả vẫn trừ đúng trên bản in
  });

  it("gộp nhiều KS, mỗi ĐNTT sống = 1 biên bản", () => {
    const rows = [row({ khach_san_id: 1 }), row({ khach_san_id: 2, mo_ta: "Twin", tien_cong_ty: 5_000_000 })];
    const list = [
      dntt({ id: 1, ref_id: 1 }),
      dntt({ id: 2, ref_id: 2, so_tien: 5_000_000 }),
      dntt({ id: 3, ref_id: 2, trang_thai_duyet: "da_huy" }), // bỏ
    ];
    const hs: HotelLite[] = [
      { id: 1, ten: "Dusit", tai_khoan_thanh_toan: null },
      { id: 2, ten: "Sea Octopus", tai_khoan_thanh_toan: null },
    ];
    const data = buildNgoaiTourSelectedData([1, 2], rows, list, hs, "A", "x");
    expect(data).toHaveLength(2);   // ks1: 1 ĐNTT, ks2: 1 ĐNTT sống
    expect(data.map((d) => d.ks.ten)).toEqual(["Dusit", "Sea Octopus"]);
  });

  it("KS không có ĐNTT sống → bỏ", () => {
    const rows = [row({ khach_san_id: 1 })];
    expect(buildNgoaiTourSelectedData([1], rows, [], hotels, "A", "x")).toEqual([]);
  });

  it("truyền payments → mỗi ĐNTT nhặt cấn trừ theo dntt_id", () => {
    const rows = [row({ khach_san_id: 1 })];
    const list = [dntt({ id: 5, ref_id: 1, so_tien: 12_100_000 })];
    const pays = [{ dntt_id: 5, method: "can_tru", so_tien: 550_000, ghi_chu: "Cấn trừ từ đoàn: X" }];
    const data = buildNgoaiTourSelectedData([1], rows, list, hotels, "A", "x", pays);
    expect(data).toHaveLength(1);
    expect(data[0].canTruTotal).toBe(550_000);
    expect(data[0].canTruNote).toBe("Cấn trừ từ đoàn: X");
  });
});
