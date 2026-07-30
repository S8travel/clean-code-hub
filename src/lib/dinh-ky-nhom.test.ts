import { describe, it, expect } from "vitest";
import { tienDeNghiTrung, idsCanDoiCoDinhKy, nhanChiPhi } from "./dinh-ky-nhom";

describe("tienDeNghiTrung", () => {
  it("chưa có ĐNTT nào → an toàn", () => {
    const main = { id: 1, tien_cong_ty: 5_386_500, so_tien_da_dntt: 0 };
    const extras = [{ id: 2, tien_cong_ty: 2_764_800, so_tien_da_dntt: 0 }];
    expect(tienDeNghiTrung(main, extras)).toBe(0);
  });

  it("ĐNTT chỉ vừa đủ phần dòng chính → an toàn", () => {
    const main = { id: 1, tien_cong_ty: 5_386_500, so_tien_da_dntt: 5_386_500 };
    const extras = [{ id: 2, tien_cong_ty: 2_764_800, so_tien_da_dntt: 0 }];
    expect(tienDeNghiTrung(main, extras)).toBe(0);
  });

  it("ĐNTT per-bữa gánh cả tiền phát sinh → cảnh báo đúng phần phát sinh", () => {
    // Phiếu cũ đề nghị 8.151.300 = 5.386.500 (chính) + 2.764.800 (Tôm hùm),
    // allocation dồn hết vào dòng chính.
    const main = { id: 1, tien_cong_ty: 5_386_500, so_tien_da_dntt: 8_151_300 };
    const extras = [{ id: 2, tien_cong_ty: 2_764_800, so_tien_da_dntt: 0 }];
    expect(tienDeNghiTrung(main, extras)).toBe(2_764_800);
  });

  it("phần gánh hộ nhỏ hơn tiền phát sinh (mới thêm sau khi tạo phiếu) → chỉ cảnh báo phần gánh hộ", () => {
    const main = { id: 1, tien_cong_ty: 5_000_000, so_tien_da_dntt: 6_000_000 };
    const extras = [{ id: 2, tien_cong_ty: 2_000_000, so_tien_da_dntt: 0 }];
    expect(tienDeNghiTrung(main, extras)).toBe(1_000_000);
  });

  it("phát sinh đã có cam kết riêng → trừ ra, không tính trùng", () => {
    const main = { id: 1, tien_cong_ty: 5_000_000, so_tien_da_dntt: 7_000_000 };
    const extras = [{ id: 2, tien_cong_ty: 2_000_000, so_tien_da_dntt: 2_000_000 }];
    expect(tienDeNghiTrung(main, extras)).toBe(0);
  });

  it("dùng thanh_tien_thuc_te khi có điều chỉnh", () => {
    const main = { id: 1, tien_cong_ty: 5_000_000, thanh_tien_thuc_te: 6_000_000, so_tien_da_dntt: 6_000_000 };
    const extras = [{ id: 2, tien_cong_ty: 1_000_000, so_tien_da_dntt: 0 }];
    expect(tienDeNghiTrung(main, extras)).toBe(0);
  });

  it("chưa lưu dòng chính (null) → an toàn", () => {
    expect(tienDeNghiTrung(null, [{ id: 2, tien_cong_ty: 1_000, so_tien_da_dntt: 0 }])).toBe(0);
  });
});

describe("idsCanDoiCoDinhKy", () => {
  it("chỉ trả dòng đang lệch cờ", () => {
    const rows = [
      { id: 1, thanh_toan_dinh_ky: true },
      { id: 2, thanh_toan_dinh_ky: false },
      { id: 3, thanh_toan_dinh_ky: null },
    ];
    expect(idsCanDoiCoDinhKy(rows, true)).toEqual([2, 3]);
    expect(idsCanDoiCoDinhKy(rows, false)).toEqual([1]);
  });
});

describe("nhanChiPhi", () => {
  it("bỏ prefix nhóm nhà hàng", () => {
    expect(nhanChiPhi("[trua] Tôm hùm")).toEqual({ nhan: "Tôm hùm", laPhatSinh: true });
    expect(nhanChiPhi("[toi] Bia")).toEqual({ nhan: "Bia", laPhatSinh: true });
  });

  it("bỏ prefix nhóm dịch vụ", () => {
    expect(nhanChiPhi("[dvps_1234] Vé thuyền thúng")).toEqual({
      nhan: "Vé thuyền thúng",
      laPhatSinh: true,
    });
  });

  it("dòng chính giữ nguyên", () => {
    expect(nhanChiPhi("NHÀ HÀNG A (trưa)")).toEqual({
      nhan: "NHÀ HÀNG A (trưa)",
      laPhatSinh: false,
    });
  });

  it("null / rỗng", () => {
    expect(nhanChiPhi(null)).toEqual({ nhan: "", laPhatSinh: false });
  });
});
