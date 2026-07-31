import { describe, it, expect } from "vitest";
import {
  sumCompanyChiPhi,
  splitGroupCongNo,
  calcAggregateDelta,
  calcDnttMismatch,
} from "./aggregate-calc";

// ─── sumCompanyChiPhi ────────────────────────────────────────────────────────

describe("sumCompanyChiPhi", () => {
  it("rows rỗng → {0, 0}", () => {
    expect(sumCompanyChiPhi([])).toEqual({ sumActual: 0, sumPaid: 0 });
  });
  it("loại dòng HDV trả (tien_cong_ty = 0)", () => {
    const rows = [
      { tien_cong_ty: 0, tien_hdv: 500_000, so_tien_da_tt: 0 },
      { tien_cong_ty: 1_000_000, so_tien_da_tt: 1_000_000 },
    ];
    expect(sumCompanyChiPhi(rows)).toEqual({ sumActual: 1_000_000, sumPaid: 1_000_000 });
  });
  it("sumActual ưu tiên thanh_tien_thuc_te khi có", () => {
    const rows = [{ tien_cong_ty: 1_000_000, thanh_tien_thuc_te: 1_200_000, so_tien_da_tt: 0 }];
    expect(sumCompanyChiPhi(rows).sumActual).toBe(1_200_000);
  });
  it("thanh_tien_thuc_te = null → fallback tien_cong_ty", () => {
    const rows = [{ tien_cong_ty: 1_000_000, thanh_tien_thuc_te: null, so_tien_da_tt: 0 }];
    expect(sumCompanyChiPhi(rows).sumActual).toBe(1_000_000);
  });
  it("thanh_tien_thuc_te = 0 là giá trị hợp lệ → dùng 0, KHÔNG fallback", () => {
    const rows = [{ tien_cong_ty: 1_000_000, thanh_tien_thuc_te: 0, so_tien_da_tt: 0 }];
    expect(sumCompanyChiPhi(rows).sumActual).toBe(0);
  });
  it("sumPaid cộng dồn so_tien_da_tt; null → 0", () => {
    const rows = [
      { tien_cong_ty: 1_000_000, so_tien_da_tt: 600_000 },
      { tien_cong_ty: 2_000_000, so_tien_da_tt: null },
    ];
    expect(sumCompanyChiPhi(rows).sumPaid).toBe(600_000);
  });
  it("nhóm main + extras: cộng dồn đúng phần công ty", () => {
    const rows = [
      { tien_cong_ty: 3_000_000, so_tien_da_tt: 3_000_000 },           // main
      { tien_cong_ty: 500_000, so_tien_da_tt: 0 },                     // extra công ty
      { tien_cong_ty: 0, tien_hdv: 200_000, so_tien_da_tt: 0 },        // extra HDV → loại
    ];
    expect(sumCompanyChiPhi(rows)).toEqual({ sumActual: 3_500_000, sumPaid: 3_000_000 });
  });

  it("dòng sửa về 0đ SAU khi đã trả → sumPaid VẪN tính (chỉ loại khỏi sumActual)", () => {
    // Hủy dịch vụ đã thanh toán đủ: sửa SL về 0 (flow chuẩn, không xóa row).
    const rows = [{ tien_cong_ty: 0, so_tien_da_tt: 5_000_000 }];
    expect(sumCompanyChiPhi(rows)).toEqual({ sumActual: 0, sumPaid: 5_000_000 });
    // → delta = −5M → footer hiện "Ghi nhận công nợ" thay vì ẩn mất dấu tiền thừa.
  });

  it("main về 0đ nhưng nhóm còn extra có giá → không gợi ý trả trùng phần đã trả", () => {
    const rows = [
      { tien_cong_ty: 0, so_tien_da_tt: 12_000_000 },   // main đã trả cả nhóm, sau đó về 0
      { tien_cong_ty: 2_000_000, so_tien_da_tt: 0 },     // extra còn giá
    ];
    // sumActual = 2M, sumPaid = 12M → delta = −10M (thừa) — KHÔNG phải +2M (thiếu ảo)
    expect(sumCompanyChiPhi(rows)).toEqual({ sumActual: 2_000_000, sumPaid: 12_000_000 });
  });
});

// ─── splitGroupCongNo ────────────────────────────────────────────────────────

describe("splitGroupCongNo", () => {
  it("rỗng → tất cả 0", () => {
    expect(splitGroupCongNo([])).toEqual({ groupCongNoCN: 0, groupCongNoHT: 0, groupCongNoTotal: 0 });
  });
  it("con_du + da_can_tru → CN", () => {
    const rows = [
      { trang_thai: "con_du", so_tien_goc: 300_000 },
      { trang_thai: "da_can_tru", so_tien_goc: 200_000 },
    ];
    expect(splitGroupCongNo(rows)).toEqual({ groupCongNoCN: 500_000, groupCongNoHT: 0, groupCongNoTotal: 500_000 });
  });
  it("da_hoan_tien → HT", () => {
    const rows = [{ trang_thai: "da_hoan_tien", so_tien_goc: 400_000 }];
    expect(splitGroupCongNo(rows)).toEqual({ groupCongNoCN: 0, groupCongNoHT: 400_000, groupCongNoTotal: 400_000 });
  });
  it("trộn cả 3 trạng thái", () => {
    const rows = [
      { trang_thai: "con_du", so_tien_goc: 100_000 },
      { trang_thai: "da_can_tru", so_tien_goc: 50_000 },
      { trang_thai: "da_hoan_tien", so_tien_goc: 70_000 },
    ];
    expect(splitGroupCongNo(rows)).toEqual({ groupCongNoCN: 150_000, groupCongNoHT: 70_000, groupCongNoTotal: 220_000 });
  });
  it("so_tien_goc null → 0", () => {
    const rows = [{ trang_thai: "con_du", so_tien_goc: null }];
    expect(splitGroupCongNo(rows).groupCongNoTotal).toBe(0);
  });
});

// ─── calcAggregateDelta ──────────────────────────────────────────────────────

describe("calcAggregateDelta", () => {
  it("thực tế > đã trả → aggDelta > 0 (thiếu)", () => {
    const r = calcAggregateDelta({ sumActual: 1_200_000, sumPaid: 1_000_000, sumCommitted: 1_000_000, groupCongNoTotal: 0 });
    expect(r.aggDelta).toBe(200_000);
    expect(r.effectiveDelta).toBe(200_000);
  });
  it("thực tế < đã trả → aggDelta < 0 (thừa)", () => {
    const r = calcAggregateDelta({ sumActual: 800_000, sumPaid: 1_000_000, sumCommitted: 1_000_000, groupCongNoTotal: 0 });
    expect(r.aggDelta).toBe(-200_000);
    expect(r.effectiveDelta).toBe(-200_000);
  });
  it("đã ghi công nợ phần thừa → effectiveDelta về 0", () => {
    // thừa 300k, đã ghi cong_no 300k → coi như đã xử lý xong.
    const r = calcAggregateDelta({ sumActual: 700_000, sumPaid: 1_000_000, sumCommitted: 1_000_000, groupCongNoTotal: 300_000 });
    expect(r.aggDelta).toBe(-300_000);
    expect(r.effectiveDelta).toBe(0);
  });
  it("effectiveCommitted = sumCommitted − groupCongNoTotal", () => {
    const r = calcAggregateDelta({ sumActual: 1_000_000, sumPaid: 1_000_000, sumCommitted: 1_000_000, groupCongNoTotal: 300_000 });
    expect(r.effectiveCommitted).toBe(700_000);
  });
  it("không lệch → mọi giá trị 0", () => {
    const r = calcAggregateDelta({ sumActual: 1_000_000, sumPaid: 1_000_000, sumCommitted: 1_000_000, groupCongNoTotal: 0 });
    expect(r).toEqual({ aggDelta: 0, effectiveDelta: 0, effectiveCommitted: 1_000_000, deltaThieuThat: 0 });
  });

  it("voucherKhoRefund loại phần boat khỏi lệch", () => {
    // Nhóm đã trả một phần bằng voucher. Phần vé trả về kho (voucherKhoRefund) KHÔNG
    // phải tiền thừa → lệch chỉ được tính trên phần cash của extras, không dính boat.
    const r = calcAggregateDelta({
      sumActual: 35_667_600, sumPaid: 38_197_200, sumCommitted: 38_197_200,
      groupCongNoTotal: 0, voucherKhoRefund: 1_209_600,
    });
    expect(r.aggDelta).toBe(-1_320_000);     // thừa cash thật (KHÔNG còn −2.529.600)
    expect(r.effectiveDelta).toBe(-1_320_000);
    expect(r.effectiveCommitted).toBe(36_987_600); // badge = 35.667.600 − 36.987.600 = −1.320.000
  });

  it("voucherKhoRefund + đã ghi công nợ phần cash → effectiveDelta về 0 (sạch)", () => {
    const r = calcAggregateDelta({
      sumActual: 35_667_600, sumPaid: 38_197_200, sumCommitted: 38_197_200,
      groupCongNoTotal: 1_320_000, voucherKhoRefund: 1_209_600,
    });
    expect(r.effectiveDelta).toBe(0);
    expect(r.effectiveCommitted).toBe(35_667_600); // = sumActual → badge 0
  });

  it("voucherKhoRefund mặc định 0 (DV/KS không truyền) → hành vi cũ", () => {
    const r = calcAggregateDelta({ sumActual: 800_000, sumPaid: 1_000_000, sumCommitted: 1_000_000, groupCongNoTotal: 0 });
    expect(r.aggDelta).toBe(-200_000);
    expect(r.effectiveCommitted).toBe(1_000_000);
  });

  // ── deltaThieuThat: chặn "Thanh toán bổ sung" trùng với ĐNTT gộp cuối tháng ──
  // Phiếu định kỳ có doan_id = NULL nên section KHÔNG thấy nó trong dnttList →
  // sumPaid/daDeNghi đều mù. so_tien_da_dntt (RPC recalc, toàn cục) thì thấy.

  it("phát sinh đã nằm trong ĐNTT gộp chờ trả → KHÔNG còn thiếu", () => {
    // Bữa 500k đã trả qua phiếu định kỳ tháng trước; thêm phát sinh 2.764.800 và
    // kế toán đã gộp nó vào phiếu định kỳ tháng này (chưa trả).
    const r = calcAggregateDelta({
      sumActual: 3_264_800, sumPaid: 500_000, sumCommitted: 500_000,
      groupCongNoTotal: 0, sumDaDeNghi: 3_264_800,
    });
    expect(r.effectiveDelta).toBe(2_764_800);  // vế cũ vẫn thấy "thiếu"
    expect(r.deltaThieuThat).toBe(0);          // thực tế đã đề nghị đủ → không bổ sung
  });

  it("chỉ đề nghị được một phần → chỉ bổ sung phần chưa đề nghị", () => {
    const r = calcAggregateDelta({
      sumActual: 3_264_800, sumPaid: 500_000, sumCommitted: 500_000,
      groupCongNoTotal: 0, sumDaDeNghi: 2_000_000,
    });
    expect(r.deltaThieuThat).toBe(1_264_800);
  });

  it("chưa đề nghị gì thêm → giữ nguyên số thiếu (hành vi cũ)", () => {
    const r = calcAggregateDelta({
      sumActual: 3_264_800, sumPaid: 500_000, sumCommitted: 500_000,
      groupCongNoTotal: 0, sumDaDeNghi: 500_000,
    });
    expect(r.deltaThieuThat).toBe(2_764_800);
    expect(r.deltaThieuThat).toBe(r.effectiveDelta);
  });

  it("ĐNTT bị hủy sau khi đã trả (cam kết tụt về 0) → vẫn đo theo tiền đã trả", () => {
    const r = calcAggregateDelta({
      sumActual: 1_200_000, sumPaid: 1_000_000, sumCommitted: 0,
      groupCongNoTotal: 0, sumDaDeNghi: 0,
    });
    expect(r.deltaThieuThat).toBe(200_000);
  });

  it("không truyền sumDaDeNghi → deltaThieuThat = effectiveDelta (caller cũ không đổi)", () => {
    const r = calcAggregateDelta({
      sumActual: 1_200_000, sumPaid: 1_000_000, sumCommitted: 1_000_000, groupCongNoTotal: 0,
    });
    expect(r.deltaThieuThat).toBe(r.effectiveDelta);
  });

  it("đã ghi công nợ rồi mới đề nghị tiếp → công nợ vẫn được cộng vào vế thiếu", () => {
    const r = calcAggregateDelta({
      sumActual: 900_000, sumPaid: 1_000_000, sumCommitted: 1_000_000,
      groupCongNoTotal: 200_000, sumDaDeNghi: 1_000_000,
    });
    expect(r.effectiveDelta).toBe(100_000);
    expect(r.deltaThieuThat).toBe(100_000); // sumDaDeNghi = sumPaid → không đổi
  });
});

// ─── calcDnttMismatch ────────────────────────────────────────────────────────

describe("calcDnttMismatch", () => {
  const base = { sumActual: 1_200_000, effectiveCommitted: 1_000_000, hasCommittedDntt: true, showAggBtn: false };

  it("lệch → trả số tiền lệch (sumActual − effectiveCommitted)", () => {
    expect(calcDnttMismatch(base)).toBe(200_000);
  });
  it("không có ĐNTT đã cam kết → 0", () => {
    expect(calcDnttMismatch({ ...base, hasCommittedDntt: false })).toBe(0);
  });
  it("đang hiện nút aggregate footer → 0 (tránh trùng)", () => {
    expect(calcDnttMismatch({ ...base, showAggBtn: true })).toBe(0);
  });
  it("khớp (sumActual === effectiveCommitted) → 0", () => {
    expect(calcDnttMismatch({ ...base, sumActual: 1_000_000 })).toBe(0);
  });
  it("lệch âm (thực tế < cam kết) → trả số âm", () => {
    expect(calcDnttMismatch({ ...base, sumActual: 800_000 })).toBe(-200_000);
  });
});
