import { describe, it, expect } from "vitest";
import {
  doanStatusLabel,
  doanNightsLabel,
  buildDoanListRows,
  DOAN_LIST_HEADERS,
  type ExportDoanItem,
} from "./export-doan-list-excel";

// Hôm nay cố định để test không phụ thuộc ngày chạy
const TODAY = new Date("2026-06-10T12:00:00");

const g = (p: Partial<ExportDoanItem>): ExportDoanItem => ({ id: 1, ...p });

describe("doanStatusLabel — mirror richStatus của DoanTable", () => {
  it("huy → Đã huỷ (ưu tiên cao nhất, kể cả đang trong hành trình)", () => {
    expect(doanStatusLabel(g({ trang_thai: "huy", ngay_di: "2026-06-09", ngay_ve: "2026-06-12" }), null, TODAY))
      .toBe("Đã huỷ");
  });

  it("có DNTT QT HDV paid → Đã quyết toán", () => {
    expect(doanStatusLabel(g({ id: 7, ngay_ve: "2026-06-01" }), new Set([7]), TODAY)).toBe("Đã quyết toán");
  });

  it("ngay_ve < hôm nay → Hoàn thành", () => {
    expect(doanStatusLabel(g({ ngay_ve: "2026-06-09" }), null, TODAY)).toBe("Hoàn thành");
  });

  it("di <= hôm nay <= ve → Đang diễn ra", () => {
    expect(doanStatusLabel(g({ ngay_di: "2026-06-08", ngay_ve: "2026-06-12" }), null, TODAY)).toBe("Đang diễn ra");
  });

  it("khởi hành trong 3 ngày tới → Sắp khởi hành (biên: đúng 3 ngày)", () => {
    expect(doanStatusLabel(g({ ngay_di: "2026-06-13", ngay_ve: "2026-06-17" }), null, TODAY)).toBe("Sắp khởi hành");
  });

  it("khởi hành sau 4+ ngày → Chờ xác nhận", () => {
    expect(doanStatusLabel(g({ ngay_di: "2026-06-14", ngay_ve: "2026-06-18" }), null, TODAY)).toBe("Chờ xác nhận");
  });
});

describe("doanNightsLabel", () => {
  it("13/07 → 17/07 = 5N4Đ", () => {
    expect(doanNightsLabel({ ngay_di: "2026-07-13", ngay_ve: "2026-07-17" })).toBe("5N4Đ");
  });

  it("thiếu ngày hoặc về trước đi → rỗng", () => {
    expect(doanNightsLabel({ ngay_di: "2026-07-13", ngay_ve: null })).toBe("");
    expect(doanNightsLabel({ ngay_di: "2026-07-13", ngay_ve: "2026-07-13" })).toBe("");
  });
});

describe("buildDoanListRows", () => {
  it("đủ cột khớp header, tổng khách = lớn+50%+free+TL, OP lấy từ map", () => {
    const rows = buildDoanListRows(
      [g({
        id: 243, ten_doan: "S8DAD5D260713-SP",
        ngay_di: "2026-07-13", ngay_ve: "2026-07-17",
        loai_tour: "inbound",
        so_khach_lon: 19, so_khach_em1: 0, so_khach_em2: 0, so_khach_tl: 1,
        chuyen_bay_don: "BR383 TPE/DAD 09:45 ~ 11:35",
        agents: { ten: "Guo" },
        dia_diem: { ten: "Đà Nẵng" },
        xe: { ten_xe: "35c", so_cho: 35, nha_xe: { ten: "NTS" } },
      })],
      new Map([[243, "Đào Ngọc Quý"]]),
      null,
      TODAY,
    );
    expect(rows).toHaveLength(1);
    const row = rows[0];
    expect(row).toHaveLength(DOAN_LIST_HEADERS.length);
    expect(row[0]).toBe("S8DAD5D260713-SP");
    expect(row[1]).toBe("Chờ xác nhận");
    expect(row[2]).toBe("Đà Nẵng");
    expect(row[3]).toBe("5N4Đ");
    expect(row[4]).toBe("Inbound");
    expect(row[6]).toBe("Đào Ngọc Quý");
    expect(row[12]).toBe(20); // tổng khách
    expect(row[13]).toBe("13/07/2026");
    expect(row[19]).toBe("NTS · 35c · 35 chỗ");
  });

  it("đoàn thiếu OP/HDV/xe → cell rỗng, không crash", () => {
    const rows = buildDoanListRows([g({ id: 9, ten_doan: "X" })], new Map(), null, TODAY);
    expect(rows[0][6]).toBe("");
    expect(rows[0][12]).toBe(0);
    expect(rows[0][19]).toBe("");
  });
});
