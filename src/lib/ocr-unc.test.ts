import { describe, it, expect } from "vitest";
import { normCode, parseAmountInWords, parseAmountFromDongWord } from "./ocr-unc";

describe("normCode — chuẩn hoá mã đoàn để so khớp với OCR text", () => {
  it("giữ A-Z và 0-9, bỏ ký tự khác", () => {
    expect(normCode("VDA070706JX6")).toBe("VDA070706JX6");
  });

  it("upper-case toàn bộ", () => {
    expect(normCode("ding-mb8d-260608")).toBe("DINGMB8D260608");
  });

  it("ten_doan có mô tả phụ → strip dấu / khoảng trắng / dấu phụ", () => {
    // "S8HAN6D0503B-FY Test" → bỏ space + dấu gạch → "S8HAN6D0503BFYTEST"
    expect(normCode("S8HAN6D0503B-FY Test")).toBe("S8HAN6D0503BFYTEST");
  });

  it("dấu tiếng Việt bị loại (không nằm trong A-Z)", () => {
    // "ngày" → "NGÀY" → chỉ giữ "NGY"
    expect(normCode("4 ngày ở Việt Nam")).toBe("4NGYVITNAM");
  });

  it("null / rỗng → ''", () => {
    expect(normCode("")).toBe("");
    expect(normCode(null as unknown as string)).toBe("");
  });
});

describe("parseAmountInWords — đọc 'Số tiền bằng chữ: <…> đồng'", () => {
  it("7 triệu 8 trăm 28 nghìn (VietinBank Debit Advice)", () => {
    const text = "Số tiền bằng chữ: bảy triệu tám trăm hai mươi tám nghìn đồng";
    expect(parseAmountInWords(text)).toBe(7_828_000);
  });

  it("5 triệu 688 nghìn", () => {
    const text = "Bằng chữ: năm triệu sáu trăm tám mươi tám nghìn đồng chẵn";
    expect(parseAmountInWords(text)).toBe(5_688_000);
  });

  it("không có nhãn 'bằng chữ' → null", () => {
    expect(parseAmountInWords("Mười triệu đồng")).toBeNull();
  });

  it("OCR sai chính tả nhẹ (Levenshtein ≤ 1) vẫn parse được", () => {
    // "sáu" OCR ra "sóu" — fuzzy phải map về "sau"
    const text = "Số tiền bằng chữ: một trăm sóu mươi nghìn đồng";
    expect(parseAmountInWords(text)).toBe(160_000);
  });

  it("'không trăm' = 0 trăm (KHÔNG phải 1 trăm)", () => {
    // Ba triệu KHÔNG TRĂM hai mươi bốn nghìn = 3.024.000 (không phải 3.124.000)
    const text = "Số tiền bằng chữ: ba triệu không trăm hai mươi bốn nghìn đồng";
    expect(parseAmountInWords(text)).toBe(3_024_000);
  });
});

describe("parseAmountFromDongWord — fallback không cần nhãn 'bằng chữ'", () => {
  it("eFAST: chuỗi nội dung dài → walk back từ 'đồng' lấy đúng cụm", () => {
    const text =
      "S8 tt CTCPDVCT BA NA-CNKDL VA BTND LANG PHAP- coc ks Mercure Danang " +
      "French Village Bana Hills 10/7-11/7 code 291726 doan VDA070706JX6 " +
      "Mười triệu đồng";
    expect(parseAmountFromDongWord(text)).toBe(10_000_000);
  });

  it("năm triệu sáu trăm tám mươi tám nghìn đồng", () => {
    expect(parseAmountFromDongWord("Tổng: Năm triệu sáu trăm tám mươi tám nghìn đồng"))
      .toBe(5_688_000);
  });

  it("không có 'đồng' → null", () => {
    expect(parseAmountFromDongWord("Cong ty TNHH du lich Aurora")).toBeNull();
  });

  it("có 'đồng' nhưng không có số-bằng-chữ phía trước → null", () => {
    expect(parseAmountFromDongWord("xxx yyy đồng")).toBeNull();
  });

  it("KHÔNG nhầm 'CÔNG TY' thành 'đồng' (fuzzy match có guard)", () => {
    // "cong" cách "dong" 1 ký tự — rawToks dùng lastIndexOf("dong") không fuzzy
    expect(parseAmountFromDongWord("CONG TY TNHH ABC")).toBeNull();
  });

  it("'không trăm' qua đường 'đồng' (UNC eFAST không nhãn) = 3.024.000", () => {
    // Ca thực tế: OCR đọc chữ số nhầm 3→5 (5.024.000), nhưng đọc CHỮ đúng.
    // "hơi" OCR sai của "hai" → fuzzy map về "hai".
    const text =
      "S8 tt CTCP du lich ABC code 291726 doan AGENT-ELU-HAN5D-0623 " +
      "Ba triệu không trăm hơi mươi bốn nghìn đồng";
    expect(parseAmountFromDongWord(text)).toBe(3_024_000);
  });
});
