import { describe, it, expect } from "vitest";
import { nguoiDungTenPhieu, type HdvDungTen } from "./hdv-dung-ten";

const HDV_A: HdvDungTen = { id: 101, ten: "HDV A", so_tai_khoan: "0000000001", ngan_hang: "Ngân hàng A" };
const HDV_B: HdvDungTen = { id: 102, ten: "HDV B", so_tai_khoan: "0000000002", ngan_hang: "Ngân hàng B" };
const HDV_DA_GO: HdvDungTen = { id: 103, ten: "HDV đã gỡ khỏi đoàn", so_tai_khoan: "0000000003", ngan_hang: "Ngân hàng C" };
const TAT_CA = [HDV_A, HDV_B, HDV_DA_GO];

describe("nguoiDungTenPhieu", () => {
  it("khớp đúng người theo ref_id đã lưu", () => {
    expect(nguoiDungTenPhieu(102, TAT_CA, HDV_A)).toEqual(HDV_B);
  });

  it("phiếu cũ chưa ghi ref_id → dùng HDV chính", () => {
    expect(nguoiDungTenPhieu(null, TAT_CA, HDV_A)).toEqual(HDV_A);
  });

  it("vẫn ra ĐÚNG người khi HDV đó đã bị gỡ khỏi đoàn", () => {
    // Bản in lấy số tài khoản từ đây — rơi về HDV chính là chuyển nhầm tiền.
    expect(nguoiDungTenPhieu(103, TAT_CA, HDV_A)).toEqual(HDV_DA_GO);
  });

  it("ref_id trỏ người không tra được → null, KHÔNG rơi về HDV chính", () => {
    expect(nguoiDungTenPhieu(999, TAT_CA, HDV_A)).toBeNull();
  });
});
