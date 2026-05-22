import { describe, it, expect } from "vitest";
import {
  buildChiPhiReport,
  aggregateByAgent,
  isUnderfunded,
  fmtDate,
  DEFAULT_WARN_FACTOR,
  type ChiPhiDoanRow,
} from "./chi-phi-sheet-report";

// Helper dựng ChiPhiDoanRow đủ field; override phần cần test.
const doanRow = (p: Partial<ChiPhiDoanRow>): ChiPhiDoanRow => ({
  doan_id: 1,
  ten_doan: "Đoàn test",
  agent_ten: "Cola",
  loai_tour: "inbound",
  ngay_di: "2026-05-21",
  ngay_ve: "2026-05-25",
  so_khach: 20,
  tong_chi_phi: 100_000_000,
  so_dong_chi_phi: 20,
  so_dem: 4,
  ...p,
});

// ─── fmtDate ─────────────────────────────────────────────────────────────────

describe("fmtDate", () => {
  it("ISO date-only → dd/mm/yyyy", () => {
    expect(fmtDate("2026-05-21")).toBe("21/05/2026");
  });
  it("ISO datetime → dd/mm/yyyy (không lệch ngày do timezone)", () => {
    expect(fmtDate("2026-05-21T23:30:00Z")).toBe("21/05/2026");
  });
  it("null / rỗng → chuỗi rỗng", () => {
    expect(fmtDate(null)).toBe("");
    expect(fmtDate("")).toBe("");
  });
  it("chuỗi không parse được → trả nguyên", () => {
    expect(fmtDate("khong-phai-ngay")).toBe("khong-phai-ngay");
  });
});

// ─── isUnderfunded ───────────────────────────────────────────────────────────

describe("isUnderfunded", () => {
  it("số dòng < số đêm × hệ số → true", () => {
    expect(isUnderfunded(doanRow({ so_dem: 4, so_dong_chi_phi: 11 }), 3)).toBe(true);
  });
  it("số dòng = ngưỡng → false (không gắn cờ)", () => {
    expect(isUnderfunded(doanRow({ so_dem: 4, so_dong_chi_phi: 12 }), 3)).toBe(false);
  });
  it("số dòng > ngưỡng → false", () => {
    expect(isUnderfunded(doanRow({ so_dem: 4, so_dong_chi_phi: 20 }), 3)).toBe(false);
  });
  it("số đêm = 0 → false dù số dòng = 0 (ngưỡng 0)", () => {
    expect(isUnderfunded(doanRow({ so_dem: 0, so_dong_chi_phi: 0 }), 3)).toBe(false);
  });
  it("số đêm null → false", () => {
    expect(isUnderfunded(doanRow({ so_dem: null, so_dong_chi_phi: 0 }), 3)).toBe(false);
  });
});

// ─── aggregateByAgent ────────────────────────────────────────────────────────

describe("aggregateByAgent", () => {
  it("gom nhóm + cộng dồn đúng theo agent", () => {
    const out = aggregateByAgent([
      doanRow({ doan_id: 1, agent_ten: "Cola", so_khach: 10, tong_chi_phi: 100 }),
      doanRow({ doan_id: 2, agent_ten: "Cola", so_khach: 5, tong_chi_phi: 50 }),
      doanRow({ doan_id: 3, agent_ten: "Guo", so_khach: 20, tong_chi_phi: 300 }),
    ]);
    expect(out).toHaveLength(2);
    // Sắp xếp tổng chi phí giảm dần → Guo (300) trước Cola (150).
    expect(out[0]).toEqual({ agent: "Guo", soDoan: 1, tongSoKhach: 20, tongChiPhi: 300 });
    expect(out[1]).toEqual({ agent: "Cola", soDoan: 2, tongSoKhach: 15, tongChiPhi: 150 });
  });

  it("agent_ten null → gom vào 'Other'", () => {
    const out = aggregateByAgent([doanRow({ agent_ten: null })]);
    expect(out[0].agent).toBe("Other");
  });

  it("tong_chi_phi dạng string (numeric Postgres) vẫn cộng đúng", () => {
    const out = aggregateByAgent([
      doanRow({ doan_id: 1, agent_ten: "Cola", tong_chi_phi: "120000000" }),
      doanRow({ doan_id: 2, agent_ten: "Cola", tong_chi_phi: "30000000" }),
    ]);
    expect(out[0].tongChiPhi).toBe(150_000_000);
  });
});

// ─── buildChiPhiReport ───────────────────────────────────────────────────────

describe("buildChiPhiReport", () => {
  const rows: ChiPhiDoanRow[] = [
    doanRow({
      doan_id: 1, ten_doan: "Đoàn 1", agent_ten: "Cola", loai_tour: "inbound",
      ngay_di: "2026-05-21", ngay_ve: "2026-05-25",
      so_khach: 20, tong_chi_phi: 100_000_000, so_dong_chi_phi: 20, so_dem: 4,
    }),
    doanRow({
      doan_id: 2, ten_doan: "Đoàn 2", agent_ten: "Cola", loai_tour: "outbound",
      ngay_di: "2026-05-22", ngay_ve: "2026-05-27",
      so_khach: 10, tong_chi_phi: 50_000_000, so_dong_chi_phi: 5, so_dem: 5,
    }),
    doanRow({
      doan_id: 3, ten_doan: "Đoàn 3", agent_ten: "Guo", loai_tour: "noi_dia",
      ngay_di: "2026-05-23", ngay_ve: "2026-05-28",
      so_khach: 30, tong_chi_phi: 300_000_000, so_dong_chi_phi: 30, so_dem: 5,
    }),
  ];

  it("không có đoàn → chỉ tiêu đề + dòng thông báo, không bảng", () => {
    const r = buildChiPhiReport([], { from: "2026-05-21", to: "2026-05-28" });
    expect(r.doanCount).toBe(0);
    expect(r.warnCount).toBe(0);
    expect(r.headerRows).toHaveLength(0);
    expect(r.totalRows).toHaveLength(0);
    expect(r.values[0][0]).toContain("CHI PHI CAC DOAN KHOI HANH 21/05/2026 - 28/05/2026");
  });

  it("dựng đủ 2 bảng + dòng tổng đúng số liệu", () => {
    const r = buildChiPhiReport(rows, { from: "2026-05-21", to: "2026-05-28" });
    expect(r.doanCount).toBe(3);

    // Header bảng chi tiết.
    const detailHeader = r.values[r.headerRows[0].row];
    expect(detailHeader[0]).toBe("STT");
    expect(detailHeader[8]).toBe("Ghi chú");
    expect(r.headerRows[0].colEnd).toBe(9); // bảng chi tiết 9 cột

    // Dòng tổng chi tiết: tổng số khách 60, tổng chi phí 450tr.
    const detailTotal = r.values[r.totalRows[0].row];
    expect(detailTotal[0]).toBe("TONG CONG 3 doan");
    expect(detailTotal[6]).toBe(60);
    expect(detailTotal[7]).toBe(450_000_000);

    // Dòng tổng Agent: 3 đoàn, 60 khách, 450tr.
    const agentTotal = r.values[r.totalRows[1].row];
    expect(agentTotal).toEqual(["TONG CONG", 3, 60, 450_000_000]);
    expect(r.totalRows[1].colEnd).toBe(4); // bảng agent 4 cột
  });

  it("sắp xếp đoàn theo ngày đi tăng dần + nhãn loại tour", () => {
    const shuffled = [rows[2], rows[0], rows[1]];
    const r = buildChiPhiReport(shuffled, { from: "2026-05-21", to: "2026-05-28" });
    const firstData = r.values[r.headerRows[0].row + 1];
    expect(firstData[2]).toBe("Đoàn 1"); // ngay_di sớm nhất
    expect(firstData[3]).toBe("Inbound");
    // Đoàn 3 noi_dia → nhãn "Nội địa".
    const thirdData = r.values[r.headerRows[0].row + 3];
    expect(thirdData[3]).toBe("Nội địa");
  });

  it("gắn cờ cảnh báo đúng đoàn nghi thiếu chi phí", () => {
    const r = buildChiPhiReport(rows, { from: "2026-05-21", to: "2026-05-28" });
    // Mặc định hệ số 3: chỉ Đoàn 2 (5 dòng < 5 đêm × 3 = 15) bị gắn cờ.
    expect(r.warnCount).toBe(1);
    const dataStart = r.headerRows[0].row + 1;
    expect(r.values[dataStart][8]).toBe("");          // Đoàn 1 ok
    expect(String(r.values[dataStart + 1][8])).toContain("thiếu"); // Đoàn 2 cảnh báo
    expect(r.values[dataStart + 2][8]).toBe("");      // Đoàn 3 ok
  });

  it("warnFactor tùy biến đổi số đoàn bị gắn cờ", () => {
    const r = buildChiPhiReport(rows, { from: "2026-05-21", to: "2026-05-28", warnFactor: 6 });
    // Hệ số 6: Đoàn 1 (20 < 4×6=24) và Đoàn 2 (5 < 5×6=30) bị gắn cờ.
    expect(r.warnCount).toBe(2);
  });

  it("DEFAULT_WARN_FACTOR được dùng khi không truyền warnFactor", () => {
    const withDefault = buildChiPhiReport(rows, { from: "2026-05-21", to: "2026-05-28" });
    const explicit = buildChiPhiReport(rows, {
      from: "2026-05-21", to: "2026-05-28", warnFactor: DEFAULT_WARN_FACTOR,
    });
    expect(withDefault.warnCount).toBe(explicit.warnCount);
  });

  it("moneyRanges trỏ đúng cột tiền của 2 bảng", () => {
    const r = buildChiPhiReport(rows, { from: "2026-05-21", to: "2026-05-28" });
    expect(r.moneyRanges).toHaveLength(2);
    expect(r.moneyRanges[0].colStart).toBe(7); // cột "Chi phí (VND)" bảng chi tiết
    expect(r.moneyRanges[1].colStart).toBe(3); // cột "Tổng chi phí" bảng agent
  });
});
