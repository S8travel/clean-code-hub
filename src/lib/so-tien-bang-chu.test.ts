import { describe, it, expect } from "vitest";
import { docSoThanhChu, docTienBangChu } from "./so-tien-bang-chu";

describe("docSoThanhChu", () => {
  it("số 0", () => {
    expect(docSoThanhChu(0)).toBe("không");
  });
  it("hàng đơn vị / chục đặc biệt (mốt, lăm, mười)", () => {
    expect(docSoThanhChu(1)).toBe("một");
    expect(docSoThanhChu(5)).toBe("năm");
    expect(docSoThanhChu(10)).toBe("mười");
    expect(docSoThanhChu(11)).toBe("mười một");
    expect(docSoThanhChu(15)).toBe("mười lăm");
    expect(docSoThanhChu(21)).toBe("hai mươi mốt");
    expect(docSoThanhChu(25)).toBe("hai mươi lăm");
  });
  it("hàng trăm + lẻ", () => {
    expect(docSoThanhChu(105)).toBe("một trăm lẻ năm");
    expect(docSoThanhChu(100)).toBe("một trăm");
    expect(docSoThanhChu(999)).toBe("chín trăm chín mươi chín");
  });
  it("nghìn / triệu", () => {
    expect(docSoThanhChu(1_000)).toBe("một nghìn");
    expect(docSoThanhChu(13_000_000)).toBe("mười ba triệu");
    expect(docSoThanhChu(13_500_000)).toBe("mười ba triệu năm trăm nghìn");
  });
  it("nhóm giữa bằng 0 → 'không trăm lẻ'", () => {
    expect(docSoThanhChu(1_000_005)).toBe("một triệu không trăm lẻ năm");
    expect(docSoThanhChu(2_001_000)).toBe("hai triệu không trăm lẻ một nghìn");
  });
  it("hàng tỷ", () => {
    expect(docSoThanhChu(1_000_000_000)).toBe("một tỷ");
    expect(docSoThanhChu(1_234_567_000)).toBe(
      "một tỷ hai trăm ba mươi bốn triệu năm trăm sáu mươi bảy nghìn",
    );
  });
  it("bỏ qua phần thập phân / giá trị âm lấy trị tuyệt đối", () => {
    expect(docSoThanhChu(13_000_000.9)).toBe("mười ba triệu");
    expect(docSoThanhChu(-13_000_000)).toBe("mười ba triệu");
  });
});

describe("docTienBangChu", () => {
  it("viết hoa chữ đầu + hậu tố đồng", () => {
    expect(docTienBangChu(13_000_000)).toBe("Mười ba triệu đồng");
    expect(docTienBangChu(0)).toBe("Không đồng");
    expect(docTienBangChu(1_500_000)).toBe("Một triệu năm trăm nghìn đồng");
  });

  it("số âm → tiền tố 'Âm' (vd quyết toán còn phải thu)", () => {
    expect(docTienBangChu(-14_142_000)).toBe(
      "Âm mười bốn triệu một trăm bốn mươi hai nghìn đồng",
    );
    expect(docTienBangChu(-1_500_000)).toBe("Âm một triệu năm trăm nghìn đồng");
  });
});
