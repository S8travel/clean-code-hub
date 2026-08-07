import { describe, it, expect } from "vitest";
import {
  fitPageSize, pickProgramFile, sliceCount,
  MAX_PROGRAM_PAGES, PROGRAM_PAGE_RATIO,
} from "./itinerary-images";

describe("fitPageSize — co trang lịch trình vừa khung Word", () => {
  it("trang A4 dọc (1600×2263) → co theo chiều rộng, giữ tỷ lệ", () => {
    const r = fitPageSize(1600, 2263, 650, 940);
    expect(r.width).toBe(650);
    expect(r.height).toBe(Math.round(2263 * (650 / 1600))); // 919 — lọt maxH
    expect(r.height).toBeLessThanOrEqual(940);
  });

  it("ảnh cao hơn khung → chiều cao chạm trần, rộng co theo", () => {
    const r = fitPageSize(600, 4000, 650, 940);
    expect(r.height).toBe(940);
    expect(r.width).toBe(Math.round(600 * (940 / 4000))); // 141
  });

  it("ảnh ngang (2000×800) → co theo chiều rộng", () => {
    const r = fitPageSize(2000, 800, 650, 940);
    expect(r.width).toBe(650);
    expect(r.height).toBe(260);
  });

  it("ảnh nhỏ (400×300) → phóng to đầy chiều rộng cho đọc được", () => {
    const r = fitPageSize(400, 300, 650, 940);
    expect(r.width).toBe(650);
    expect(r.height).toBe(488);
  });

  it("kích thước không hợp lệ → trả nguyên khung (không chia 0)", () => {
    expect(fitPageSize(0, 100, 650, 940)).toEqual({ width: 650, height: 940 });
    expect(fitPageSize(100, 0, 650, 940)).toEqual({ width: 650, height: 940 });
  });
});

describe("sliceCount — cắt lát ảnh cao thành nhiều trang", () => {
  it("screenshot Zalo dài 750×8000 → cắt ~8 lát, mỗi lát fit chiều rộng trang", () => {
    const n = sliceCount(750, 8000);
    expect(n).toBe(Math.ceil(8000 / 750 / PROGRAM_PAGE_RATIO)); // 8
    // Mỗi lát 750×1000 → tỷ lệ ≤ tỷ lệ trang → nhúng full-width, chữ đọc được.
    expect(8000 / n / 750).toBeLessThanOrEqual(PROGRAM_PAGE_RATIO * 1.01);
  });

  it("ảnh A4 dọc bình thường (1600×2263) → 1 lát (tỷ lệ 1.41 < trần 1.81)", () => {
    expect(sliceCount(1600, 2263)).toBe(1);
  });

  it("hơi cao hơn tỷ lệ trang trong dung sai 25% → không cắt, chỉ co nhẹ", () => {
    // ratio 1.7 < 1.445 × 1.25 ≈ 1.81
    expect(sliceCount(1000, 1700)).toBe(1);
  });

  it("ảnh ngang / vuông → 1 lát", () => {
    expect(sliceCount(2000, 800)).toBe(1);
    expect(sliceCount(1000, 1000)).toBe(1);
  });

  it("ảnh dài cực đoan → chặn trần MAX_PROGRAM_PAGES", () => {
    expect(sliceCount(100, 1_000_000)).toBe(MAX_PROGRAM_PAGES);
  });

  it("kích thước không hợp lệ → 1", () => {
    expect(sliceCount(0, 500)).toBe(1);
    expect(sliceCount(500, 0)).toBe(1);
  });
});

describe("pickProgramFile — ưu tiên file giữ được format + fallback text", () => {
  it("PDF thắng docx dù docx đứng trước; docx thành fallback", () => {
    const r = pickProgramFile([{ ten: "chuong-trinh.docx" }, { ten: "lich-trinh.pdf" }]);
    expect(r?.kind).toBe("pdf");
    expect(r?.files.map((f) => f.ten)).toEqual(["lich-trinh.pdf"]);
    expect(r?.fallbackText?.file.ten).toBe("chuong-trinh.docx");
    expect(r?.fallbackText?.kind).toBe("docx");
  });

  it("nhiều file ảnh → gom TẤT CẢ theo thứ tự đính kèm (khách scan từng trang)", () => {
    const r = pickProgramFile([
      { ten: "trang1.jpg" }, { ten: "bang-gia.xlsx" }, { ten: "trang2.png" }, { ten: "trang3.jpeg" },
    ]);
    expect(r?.kind).toBe("image");
    expect(r?.files.map((f) => f.ten)).toEqual(["trang1.jpg", "trang2.png", "trang3.jpeg"]);
    expect(r?.fallbackText?.kind).toBe("xlsx");
  });

  it("PDF chỉ lấy 1 file (1 PDF = 1 tài liệu hoàn chỉnh)", () => {
    const r = pickProgramFile([{ ten: "a.pdf" }, { ten: "b.pdf" }]);
    expect(r?.files.map((f) => f.ten)).toEqual(["a.pdf"]);
  });

  it("chỉ có Word/Excel → dùng luôn làm nguồn text, không còn fallback", () => {
    const r = pickProgramFile([{ ten: "ghi-chu.txt" }, { ten: "chuong-trinh.docx" }]);
    expect(r?.kind).toBe("docx");
    expect(r?.files[0].ten).toBe("chuong-trinh.docx");
    expect(r?.fallbackText).toBeNull();
  });

  it("không có file đọc được → null", () => {
    expect(pickProgramFile([{ ten: "notes.txt" }])).toBeNull();
    expect(pickProgramFile([])).toBeNull();
  });
});

describe("MAX_PROGRAM_PAGES", () => {
  it("có trần số trang để docx không phình vô hạn", () => {
    expect(MAX_PROGRAM_PAGES).toBeGreaterThan(0);
    expect(MAX_PROGRAM_PAGES).toBeLessThanOrEqual(50);
  });
});
