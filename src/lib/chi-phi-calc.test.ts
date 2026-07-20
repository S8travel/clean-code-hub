import { describe, it, expect } from "vitest";
import { applyChietKhau, calcNHThanhTien, calcDnttPriorPaid, type DnttPaidLite } from "./chi-phi-calc";

// ─── calcDnttPriorPaid ───────────────────────────────────────────────────────
// Cột "Số tiền cọc" / "Đã thanh toán" bản in ĐNTT NH/DV = Σ paid_amount của các
// ĐNTT KHÁC đã trả (cọc HOẶC trả 1 phần qua ĐNTT non-cọc).

describe("calcDnttPriorPaid", () => {
  const d = (over: Partial<DnttPaidLite> = {}): DnttPaidLite => ({
    id: 1,
    trang_thai_duyet: "da_duyet",
    paid_amount: 0,
    ...over,
  });

  it("cộng paid_amount của ĐNTT non-cọc đã trả 1 phần (bug gốc) + loại ĐNTT đang in", () => {
    // Bug gốc: chỉ cộng phiếu có la_coc=true → bỏ sót phiếu non-cọc đã trả một phần,
    // bản in phiếu còn lại ghi "đã trả 0" và đòi NCC nguyên số tiền.
    const list = [d({ id: 1, paid_amount: 58_760_000 }), d({ id: 2, paid_amount: 0 })];
    expect(calcDnttPriorPaid(list, 2)).toBe(58_760_000);
  });

  it("loại ĐNTT đã hủy / từ chối", () => {
    const list = [
      d({ id: 1, paid_amount: 10_000_000, trang_thai_duyet: "da_huy" }),
      d({ id: 2, paid_amount: 20_000_000, trang_thai_duyet: "tu_choi" }),
      d({ id: 3, paid_amount: 30_000_000 }),
    ];
    expect(calcDnttPriorPaid(list, 999)).toBe(30_000_000);
  });

  it("gộp nhiều ĐNTT đã trả (cọc + bổ sung)", () => {
    const list = [d({ id: 1, paid_amount: 40_000_000 }), d({ id: 2, paid_amount: 10_000_000 })];
    expect(calcDnttPriorPaid(list, 999)).toBe(50_000_000);
  });

  it("paid_amount thiếu → coi như 0", () => {
    const list = [{ id: 1, trang_thai_duyet: "da_duyet" } as DnttPaidLite];
    expect(calcDnttPriorPaid(list, 999)).toBe(0);
  });
});

// ─── applyChietKhau ──────────────────────────────────────────────────────────

describe("applyChietKhau", () => {
  it("ck null → chỉ làm tròn truocCK", () => {
    expect(applyChietKhau(1_000_000, null)).toBe(1_000_000);
  });
  it("ck undefined → chỉ làm tròn truocCK", () => {
    expect(applyChietKhau(1_000_000, undefined)).toBe(1_000_000);
  });
  it("ck 0 → không giảm gì", () => {
    expect(applyChietKhau(1_000_000, 0)).toBe(1_000_000);
  });
  it("ck âm → coi như 0", () => {
    expect(applyChietKhau(1_000_000, -5)).toBe(1_000_000);
  });
  it("truocCK lẻ (FOC 0.5) → làm tròn về đồng nguyên", () => {
    expect(applyChietKhau(1_000_000.5, null)).toBe(1_000_001);
  });
  it("ck 10% trên 1.000.000 → 900.000", () => {
    expect(applyChietKhau(1_000_000, 10)).toBe(900_000);
  });
  it("ck 15% trên 2.850.000 → 2.422.500", () => {
    expect(applyChietKhau(2_850_000, 15)).toBe(2_422_500);
  });
  it("ck 100% → 0", () => {
    expect(applyChietKhau(1_000_000, 100)).toBe(0);
  });
  it("ck 7% trên 333 → round(309.69) = 310", () => {
    expect(applyChietKhau(333, 7)).toBe(310);
  });
  it("Mức A: ck 5% trên 10 → round(9.5) = 10 (cách 'trừ' cũ ra 9 — đã thống nhất)", () => {
    expect(applyChietKhau(10, 5)).toBe(10);
  });
  it("Mức A: 2 cách viết cho cùng kết quả (round 1 lần ở cuối)", () => {
    // Với mọi truocCK nguyên + ck nguyên: round(X×(1−ck/100)) phải khớp
    // cách tính dồn precision rồi round 1 lần. Kiểm vài giá trị 'lẻ'.
    for (const [x, ck] of [[10, 5], [333, 7], [12345, 13], [99999, 17]] as const) {
      expect(applyChietKhau(x, ck)).toBe(Math.round(x - (x * ck) / 100));
    }
  });
});

// ─── calcNHThanhTien ─────────────────────────────────────────────────────────

describe("calcNHThanhTien", () => {
  it("không FOC, không CK → soKhach × donGia", () => {
    expect(calcNHThanhTien(20, null, null, 150_000, null)).toBe(3_000_000);
  });
  it("có FOC, không CK: 20 khách 16免1 → 19 × 150.000", () => {
    expect(calcNHThanhTien(20, 16, 1, 150_000, null)).toBe(2_850_000);
  });
  it("không FOC, có CK 10%: 20 × 100.000 × 0.9", () => {
    expect(calcNHThanhTien(20, null, null, 100_000, 10)).toBe(1_800_000);
  });
  it("FOC + CK: 20 khách 16免1, đơn giá 100.000, CK 10% → 19×100k×0.9", () => {
    expect(calcNHThanhTien(20, 16, 1, 100_000, 10)).toBe(1_710_000);
  });
  it("CK 0 → bằng tiền trước CK", () => {
    expect(calcNHThanhTien(32, 16, 1, 200_000, 0)).toBe(calcNHThanhTien(32, 16, 1, 200_000, null));
  });
  it("số khách < focKhach → không trừ FOC", () => {
    expect(calcNHThanhTien(10, 16, 1, 100_000, null)).toBe(1_000_000);
  });
});

// ─── CK per-dòng cho extras NH ───────────────────────────────────────────────
// Mỗi dòng phát sinh có CK% RIÊNG, áp độc lập qua applyChietKhau. KHÔNG pool /
// chia trung bình giá toàn nhóm (bài học sai kế toán từ FOC khách sạn).

describe("CK per-dòng extras NH", () => {
  // 3 dòng phát sinh CK% khác nhau: suất trẻ em có CK, HDV phát sinh CK 0.
  const rows = [
    { base: 1_000_000, ck: 10 }, // suất trẻ em
    { base: 500_000, ck: 0 },    // HDV phát sinh — không CK
    { base: 333_333, ck: 7 },    // suất trẻ em khác giá
  ];
  const sumRows = (rs: typeof rows) =>
    rs.reduce((s, r) => s + applyChietKhau(r.base, r.ck), 0);

  it("mỗi dòng áp CK riêng → tổng = Σ từng dòng độc lập", () => {
    // 900.000 + 500.000 + round(333333×0.93)=310.000
    expect(sumRows(rows)).toBe(900_000 + 500_000 + 310_000);
  });

  it("xóa 1 dòng → các dòng còn lại GIỮ NGUYÊN giá trị", () => {
    const after = sumRows([rows[0], rows[2]]);
    expect(after).toBe(applyChietKhau(1_000_000, 10) + applyChietKhau(333_333, 7));
  });

  it("KHÔNG chia trung bình: per-dòng khác hẳn cách pool CK bình quân", () => {
    const totalBase = rows.reduce((s, r) => s + r.base, 0);
    const avgCk = rows.reduce((s, r) => s + r.ck, 0) / rows.length;
    expect(sumRows(rows)).not.toBe(applyChietKhau(totalBase, avgCk));
  });
});
