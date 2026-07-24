import { describe, it, expect } from "vitest";
import {
  KY_KHONG_RO, kyHieuLuc, kyMacDinh, daDoiKy, kyKeTiep, kyTruocDo, coTheDoiKy, kyNhoNhat,
} from "./ky-thanh-toan";

describe("kyHieuLuc — kỳ đang hiệu lực", () => {
  it("không override → theo tháng ngày đi", () => {
    expect(kyHieuLuc({ ngay_kh_di: "2026-06-29", ky_thanh_toan: null })).toBe("2026-06");
  });

  it("có override → theo override, bỏ qua ngày đi", () => {
    // Case gốc: đoàn đi 29/6 nhưng kết thúc tháng 7 → hóa đơn về tháng 7.
    expect(kyHieuLuc({ ngay_kh_di: "2026-06-29", ky_thanh_toan: "2026-07" })).toBe("2026-07");
  });

  it("thiếu ngày đi và không override → kỳ không rõ", () => {
    expect(kyHieuLuc({ ngay_kh_di: null, ky_thanh_toan: null })).toBe(KY_KHONG_RO);
  });

  it("thiếu ngày đi nhưng có override → vẫn xếp được vào kỳ", () => {
    expect(kyHieuLuc({ ngay_kh_di: null, ky_thanh_toan: "2026-07" })).toBe("2026-07");
  });
});

describe("kyMacDinh / daDoiKy — nhận biết dòng bị đẩy", () => {
  it("kỳ mặc định luôn bám ngày đi, kể cả khi có override", () => {
    expect(kyMacDinh({ ngay_kh_di: "2026-06-29" })).toBe("2026-06");
  });

  it("override khác kỳ gốc → đánh dấu đã đổi kỳ", () => {
    expect(daDoiKy({ ngay_kh_di: "2026-06-29", ky_thanh_toan: "2026-07" })).toBe(true);
  });

  it("không override → chưa đổi kỳ", () => {
    expect(daDoiKy({ ngay_kh_di: "2026-06-29", ky_thanh_toan: null })).toBe(false);
  });

  it("override TRÙNG kỳ gốc → không coi là đã đổi (khỏi hiện badge thừa)", () => {
    expect(daDoiKy({ ngay_kh_di: "2026-06-29", ky_thanh_toan: "2026-06" })).toBe(false);
  });
});

describe("kyKeTiep / kyTruocDo — nhảy kỳ, phải qua được mốc năm", () => {
  it("tháng giữa năm", () => {
    expect(kyKeTiep("2026-06")).toBe("2026-07");
    expect(kyTruocDo("2026-06")).toBe("2026-05");
  });

  it("tháng 12 → sang năm sau", () => {
    expect(kyKeTiep("2026-12")).toBe("2027-01");
  });

  it("tháng 1 → lùi về năm trước", () => {
    expect(kyTruocDo("2026-01")).toBe("2025-12");
  });

  it("giữ 2 chữ số tháng (không ra '2026-7')", () => {
    expect(kyKeTiep("2026-08")).toBe("2026-09");
    expect(kyTruocDo("2026-10")).toBe("2026-09");
  });

  it("kỳ không hợp lệ → trả nguyên, không nổ", () => {
    expect(kyKeTiep(KY_KHONG_RO)).toBe(KY_KHONG_RO);
    expect(kyTruocDo("bậy")).toBe("bậy");
  });
});

describe("coTheDoiKy — guard cam kết ĐNTT", () => {
  it("chưa đề nghị đồng nào → đẩy được", () => {
    expect(coTheDoiKy({ so_tien_da_dntt: 0 })).toBe(true);
  });

  it("đã có ĐNTT cam kết → CHẶN, kẻo chi phí và phiếu nằm 2 kỳ khác nhau", () => {
    expect(coTheDoiKy({ so_tien_da_dntt: 1 })).toBe(false);
  });
});

describe("kyNhoNhat — xếp ĐNTT vào cụm tháng", () => {
  it("lấy kỳ sớm nhất", () => {
    expect(kyNhoNhat(["2026-07", "2026-06", "2026-08"])).toBe("2026-06");
  });

  it("bỏ qua kỳ không rõ khi còn kỳ hợp lệ", () => {
    expect(kyNhoNhat([KY_KHONG_RO, "2026-07"])).toBe("2026-07");
  });

  it("toàn kỳ không rõ → kỳ không rõ", () => {
    expect(kyNhoNhat([KY_KHONG_RO])).toBe(KY_KHONG_RO);
  });

  it("rỗng → null (ĐNTT chưa có allocation)", () => {
    expect(kyNhoNhat([])).toBeNull();
  });

  it("so sánh theo chuỗi vẫn đúng thứ tự qua mốc năm", () => {
    expect(kyNhoNhat(["2027-01", "2026-12"])).toBe("2026-12");
  });
});
