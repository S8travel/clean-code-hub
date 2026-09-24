import { describe, it, expect } from "vitest";
import {
  chonNccChoCongNo,
  moTaHuyDntt,
  canCanhBaoHuyDaDuyet,
  moTaThanhToan,
  moTaGoThanhToan,
} from "./nhat-ky-dntt";

describe("chonNccChoCongNo", () => {
  it("phiếu resolve được NCC → dùng nguyên cặp của phiếu", () => {
    expect(
      chonNccChoCongNo({ id: 143, ten: "CÔNG TY A" }, { id: 702, ten: "CÔNG TY B" }),
    ).toEqual({ id: 143, ten: "CÔNG TY A" });
  });

  it("dòng chưa gắn NCC, tên rơi về mô tả bữa ăn → lấy TRỌN CẶP của OP chọn", () => {
    // Hàm resolve trả id=null nhưng ten = mô tả dòng chi phí (fallback mo_ta).
    // Code cũ ghép rời → id đúng + tên bữa ăn. Phải lấy cả id lẫn tên của OP.
    expect(
      chonNccChoCongNo(
        { id: null, ten: "NHÀ HÀNG A (tối)" },
        { id: 376, ten: "CÔNG TY TNHH MỘT THÀNH VIÊN A" },
      ),
    ).toEqual({ id: 376, ten: "CÔNG TY TNHH MỘT THÀNH VIÊN A" });
  });

  it("không nguồn nào có id → giữ tên mô tả của phiếu làm dấu vết", () => {
    expect(chonNccChoCongNo({ id: null, ten: "NHÀ HÀNG B (tối)" }, { id: null, ten: null })).toEqual({
      id: null,
      ten: "NHÀ HÀNG B (tối)",
    });
  });

  it("phiếu không có cả id lẫn tên → rơi về tên OP chọn", () => {
    expect(chonNccChoCongNo({ id: null, ten: null }, { id: null, ten: "Tên gõ tay" })).toEqual({
      id: null,
      ten: "Tên gõ tay",
    });
  });
});

describe("moTaHuyDntt", () => {
  it("phiếu đã duyệt nhưng chưa chi đồng nào", () => {
    expect(
      moTaHuyDntt({ id: 101, soTien: 4_320_000, trangThaiDuyet: "da_duyet", daChiCash: 0 }),
    ).toBe("Hủy ĐNTT #101 — 4.320.000 VND (đã duyệt, chưa chi tiền)");
  });

  it("đã chi đủ rồi mới hủy để ghi công nợ", () => {
    expect(
      moTaHuyDntt({
        id: 102,
        soTien: 4_320_000,
        trangThaiDuyet: "da_duyet",
        daChiCash: 4_320_000,
        mode: "cong_no",
      }),
    ).toBe("Hủy ĐNTT #102 — 4.320.000 VND (đã chi 4.320.000 VND → ghi công nợ)");
  });

  it("mới chi một phần rồi hủy theo hướng nhà cung cấp hoàn tiền", () => {
    expect(
      moTaHuyDntt({
        id: 103,
        soTien: 1_000_000,
        trangThaiDuyet: "da_duyet",
        daChiCash: 600_000,
        mode: "hoan_tien",
      }),
    ).toBe("Hủy ĐNTT #103 — 1.000.000 VND (đã chi 600.000 VND → nhà cung cấp hoàn tiền)");
  });

  it("phiếu còn chờ duyệt", () => {
    expect(
      moTaHuyDntt({ id: 12, soTien: 500_000, trangThaiDuyet: "cho_duyet", daChiCash: 0 }),
    ).toBe("Hủy ĐNTT #12 — 500.000 VND (chờ duyệt, chưa chi tiền)");
  });

  it("trạng thái lạ vẫn in ra được, không vỡ", () => {
    expect(moTaHuyDntt({ id: 7, soTien: 1000, trangThaiDuyet: "abc", daChiCash: 0 })).toBe(
      "Hủy ĐNTT #7 — 1.000 VND (abc, chưa chi tiền)",
    );
    expect(moTaHuyDntt({ id: 7, soTien: 1000, trangThaiDuyet: null, daChiCash: 0 })).toBe(
      "Hủy ĐNTT #7 — 1.000 VND (không rõ trạng thái, chưa chi tiền)",
    );
  });
});

describe("canCanhBaoHuyDaDuyet", () => {
  it("đã duyệt + chưa chi → cảnh báo mất chữ ký duyệt", () => {
    expect(canCanhBaoHuyDaDuyet({ trangThaiDuyet: "da_duyet", daChiCash: 0 })).toBe(true);
  });

  it("chờ duyệt → không cảnh báo (hủy không mất gì)", () => {
    expect(canCanhBaoHuyDaDuyet({ trangThaiDuyet: "cho_duyet", daChiCash: 0 })).toBe(false);
  });

  it("đã chi tiền → không cảnh báo (ô hủy đã bắt chọn công nợ / hoàn tiền)", () => {
    expect(canCanhBaoHuyDaDuyet({ trangThaiDuyet: "da_duyet", daChiCash: 4_320_000 })).toBe(false);
  });

  it("trạng thái trống → không cảnh báo", () => {
    expect(canCanhBaoHuyDaDuyet({ trangThaiDuyet: null, daChiCash: 0 })).toBe(false);
  });
});

describe("moTaThanhToan / moTaGoThanhToan", () => {
  it("chi tiền mặt kèm nguồn tiền", () => {
    expect(
      moTaThanhToan({
        dnttId: 102,
        soTien: 4_320_000,
        method: "cash",
        nguon: "TK công ty",
      }),
    ).toBe("Ghi nhận thanh toán ĐNTT #102: 4.320.000 VND (tiền mặt / chuyển khoản) — TK công ty");
  });

  it("cấn trừ công nợ, không có nguồn tiền", () => {
    expect(moTaThanhToan({ dnttId: 100, soTien: 250_000, method: "can_tru" })).toBe(
      "Ghi nhận thanh toán ĐNTT #100: 250.000 VND (cấn trừ công nợ)",
    );
  });

  it("hình thức lạ vẫn in nguyên, không vỡ", () => {
    expect(moTaThanhToan({ dnttId: 1, soTien: 1, method: "abc" })).toBe(
      "Ghi nhận thanh toán ĐNTT #1: 1 VND (abc)",
    );
  });

  it("gỡ thanh toán", () => {
    expect(moTaGoThanhToan({ dnttId: 102, soTien: 4_320_000, method: "cash" })).toBe(
      "Gỡ thanh toán ĐNTT #102: 4.320.000 VND (tiền mặt / chuyển khoản)",
    );
  });
});
