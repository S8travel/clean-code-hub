import { describe, it, expect } from "vitest";
import {
  buildDinhKyDoanSummaries, sumDinhKyTotals, type DinhKyExportRow,
} from "./export-dinh-ky-excel";
import { sanitizeSheetName } from "./xlsx-simple";

const row = (o: Partial<DinhKyExportRow> = {}): DinhKyExportRow => ({
  doan_id: 1,
  ten_doan: "D1",
  ngay_kh_di: "2026-06-05",
  so_khach: 10,
  mo_ta: "Bảo hiểm - Bảo hiểm",
  danh_muc: "bao_hiem",
  // Mặc định không FOC: gross == net.
  thanh_tien: 1_000_000,
  tien_cong_ty: 1_000_000,
  thanh_tien_thuc_te: null,
  so_tien_da_tt: 0,
  so_tien_da_dntt: 0,
  ...o,
});

describe("buildDinhKyDoanSummaries — gom theo đoàn", () => {
  it("cộng nhiều chi phí của cùng 1 đoàn thành 1 dòng", () => {
    const out = buildDinhKyDoanSummaries([
      row({ tien_cong_ty: 1_000_000 }),
      row({ tien_cong_ty: 500_000, mo_ta: "Vé cáp" }),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].soTien).toBe(1_500_000);
    // Số khách là của ĐOÀN → không cộng dồn theo số dòng chi phí.
    expect(out[0].soKhach).toBe(10);
    expect(out[0].noiDung).toBe("Bảo hiểm - Bảo hiểm, Vé cáp");
  });

  it("dòng KS có FOC → trả NET (tien_cong_ty), KHÔNG dùng gross thanh_tien", () => {
    // TWIN 11 phòng × 1.45M, FOC 1 → gross 15.95M nhưng chỉ phải trả 14.5M.
    const out = buildDinhKyDoanSummaries([
      row({ danh_muc: "khach_san", mo_ta: "TWIN/DBL/SGL", thanh_tien: 15_950_000, tien_cong_ty: 14_500_000 }),
    ]);
    expect(out[0].soTien).toBe(14_500_000);
  });

  it("thanh_tien_thuc_te override tien_cong_ty (NET)", () => {
    const out = buildDinhKyDoanSummaries([row({ tien_cong_ty: 1_000_000, thanh_tien_thuc_te: 700_000 })]);
    expect(out[0].soTien).toBe(700_000);
  });

  it("thanh_tien_thuc_te = 0 (điều chỉnh về 0) KHÔNG được rơi về tien_cong_ty", () => {
    const out = buildDinhKyDoanSummaries([row({ tien_cong_ty: 1_000_000, thanh_tien_thuc_te: 0 })]);
    expect(out[0].soTien).toBe(0);
  });

  it("còn lại tính theo ĐÃ ĐỀ NGHỊ (so_tien_da_dntt), không phải đã trả", () => {
    // Đã đề nghị đủ 1tr nhưng mới trả 400k → không còn gì để đề nghị nữa.
    const out = buildDinhKyDoanSummaries([
      row({ tien_cong_ty: 1_000_000, so_tien_da_dntt: 1_000_000, so_tien_da_tt: 400_000 }),
    ]);
    expect(out[0].conLai).toBe(0);
    expect(out[0].daTT).toBe(400_000);
  });

  it("còn lại không âm khi đề nghị vượt NET", () => {
    const out = buildDinhKyDoanSummaries([row({ tien_cong_ty: 1_000_000, so_tien_da_dntt: 1_200_000 })]);
    expect(out[0].conLai).toBe(0);
  });

  it("tách đúng nhiều đoàn, sort theo ngày khởi hành rồi doan_id", () => {
    const out = buildDinhKyDoanSummaries([
      row({ doan_id: 3, ten_doan: "C", ngay_kh_di: "2026-06-20" }),
      row({ doan_id: 2, ten_doan: "B", ngay_kh_di: "2026-06-01" }),
      row({ doan_id: 1, ten_doan: "A", ngay_kh_di: "2026-06-01" }),
    ]);
    expect(out.map((s) => s.tenDoan)).toEqual(["A", "B", "C"]);
  });

  it("đoàn thiếu ngày khởi hành xuống cuối, thiếu tên thì fallback #id", () => {
    const out = buildDinhKyDoanSummaries([
      row({ doan_id: 9, ten_doan: null, ngay_kh_di: null }),
      row({ doan_id: 2, ten_doan: "B", ngay_kh_di: "2026-06-01" }),
    ]);
    expect(out.map((s) => s.tenDoan)).toEqual(["B", "Đoàn #9"]);
  });

  it("mô tả rỗng → rơi về danh_muc", () => {
    const out = buildDinhKyDoanSummaries([row({ mo_ta: "  ", danh_muc: "xe" })]);
    expect(out[0].noiDung).toBe("xe");
  });

  it("list rỗng → không nổ", () => {
    expect(buildDinhKyDoanSummaries([])).toEqual([]);
  });
});

describe("sumDinhKyTotals — tổng phải bằng tổng các dòng (khớp header card)", () => {
  it("cộng đúng mọi cột", () => {
    const items = buildDinhKyDoanSummaries([
      row({ doan_id: 1, so_khach: 10, tien_cong_ty: 1_000_000, so_tien_da_tt: 200_000, so_tien_da_dntt: 300_000 }),
      row({ doan_id: 2, so_khach: 5, tien_cong_ty: 500_000, so_tien_da_tt: 0, so_tien_da_dntt: 0 }),
    ]);
    const t = sumDinhKyTotals(items);
    expect(t).toEqual({
      soDoan: 2,
      soKhach: 15,
      soTien: 1_500_000,
      daTT: 200_000,
      conLai: 700_000 + 500_000, // (1tr − 300k) + (500k − 0)
    });
  });

  it("rỗng → tất cả 0", () => {
    expect(sumDinhKyTotals([])).toEqual({ soDoan: 0, soKhach: 0, soTien: 0, daTT: 0, conLai: 0 });
  });
});

describe("sanitizeSheetName", () => {
  it("bỏ ký tự Excel cấm + cắt 31 ký tự", () => {
    expect(sanitizeSheetName("Tháng 6/2026")).toBe("Tháng 6-2026");
    expect(sanitizeSheetName("a".repeat(40))).toHaveLength(31);
    expect(sanitizeSheetName("   ")).toBe("Sheet1");
  });
});
