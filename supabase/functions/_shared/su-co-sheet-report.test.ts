import { describe, it, expect } from "vitest";
import {
  buildSuCoReport,
  aggregateAgents,
  joinHdv,
  sortSuCo,
  fmtDate,
  SU_CO_COL_COUNT,
  NAMED_AGENTS,
  type SuCoRow,
  type AgentStatRow,
} from "./su-co-sheet-report";

// Helper dựng SuCoRow đủ field; override phần cần test.
const suCoRow = (p: Partial<SuCoRow>): SuCoRow => ({
  log_id: 1,
  doan_id: 10,
  ten_doan: "VDA052005BR6B",
  op_ten: "Thương",
  hdv_1: "Thuận",
  hdv_2: null,
  so_khach: 34,
  tieu_de: "Khách đau bụng ở lại khách sạn",
  noi_dung: "OP sẽ cập nhật thêm thông tin sau",
  created_at: "2026-05-23T10:00:00Z",
  ...p,
});

// ─── fmtDate ─────────────────────────────────────────────────────────────────

describe("fmtDate", () => {
  it("ISO date-only → dd/mm/yyyy", () => {
    expect(fmtDate("2026-05-18")).toBe("18/05/2026");
  });
  it("ISO datetime → dd/mm/yyyy (không lệch ngày do timezone)", () => {
    expect(fmtDate("2026-05-24T23:30:00Z")).toBe("24/05/2026");
  });
  it("null / rỗng → chuỗi rỗng", () => {
    expect(fmtDate(null)).toBe("");
    expect(fmtDate("")).toBe("");
  });
});

// ─── joinHdv ─────────────────────────────────────────────────────────────────

describe("joinHdv", () => {
  it("1 HDV → giữ nguyên", () => {
    expect(joinHdv("Thuận", null)).toBe("Thuận");
  });
  it("2 HDV → ghép ' | '", () => {
    expect(joinHdv("Thuận", "Mạ.Cường")).toBe("Thuận | Mạ.Cường");
  });
  it("cả 2 rỗng → chuỗi rỗng", () => {
    expect(joinHdv(null, "  ")).toBe("");
    expect(joinHdv(null, null)).toBe("");
  });
});

// ─── sortSuCo ────────────────────────────────────────────────────────────────

describe("sortSuCo", () => {
  it("sắp theo tên đoàn, rồi thời điểm tạo", () => {
    const out = sortSuCo([
      suCoRow({ log_id: 3, ten_doan: "B", created_at: "2026-05-22T08:00:00Z" }),
      suCoRow({ log_id: 1, ten_doan: "A", created_at: "2026-05-21T08:00:00Z" }),
      suCoRow({ log_id: 2, ten_doan: "A", created_at: "2026-05-20T08:00:00Z" }),
    ]);
    expect(out.map((r) => r.log_id)).toEqual([2, 1, 3]); // A(20/5), A(21/5), B
  });
});

// ─── aggregateAgents ─────────────────────────────────────────────────────────

describe("aggregateAgents", () => {
  it("luôn 4 nhóm cố định theo thứ tự Xihong, Cola, Guo, Khác (kể cả 0)", () => {
    const { buckets } = aggregateAgents([]);
    expect(buckets.map((b) => b.agent)).toEqual(["Xihong", "Cola", "Guo", "Khác"]);
    expect(buckets.every((b) => b.soDoan === 0 && b.soKhach === 0)).toBe(true);
  });

  it("gom agent lạ + không có tên vào Khác; cộng dồn đúng", () => {
    const rows: AgentStatRow[] = [
      { agent_ten: "Xihong", so_doan: 5, so_khach: 100 },
      { agent_ten: "Cola", so_doan: 3, so_khach: 60 },
      { agent_ten: "Guo", so_doan: 2, so_khach: 40 },
      { agent_ten: "Other", so_doan: 4, so_khach: 50 },
      { agent_ten: "Alice", so_doan: 1, so_khach: 10 },
      { agent_ten: null, so_doan: 1, so_khach: 7 },
    ];
    const { buckets, total } = aggregateAgents(rows);
    const byName = Object.fromEntries(buckets.map((b) => [b.agent, b]));
    expect(byName["Xihong"]).toMatchObject({ soDoan: 5, soKhach: 100 });
    expect(byName["Cola"]).toMatchObject({ soDoan: 3, soKhach: 60 });
    expect(byName["Guo"]).toMatchObject({ soDoan: 2, soKhach: 40 });
    // Khác = Other(4/50) + Alice(1/10) + null(1/7) = 6 đoàn / 67 khách
    expect(byName["Khác"]).toMatchObject({ soDoan: 6, soKhach: 67 });
    // Tổng = 5+3+2+6 = 16 đoàn ; 100+60+40+67 = 267 khách
    expect(total).toMatchObject({ agent: "TỔNG", soDoan: 16, soKhach: 267 });
  });

  it("so_doan/so_khach dạng string (numeric Postgres) vẫn cộng đúng", () => {
    const { total } = aggregateAgents([
      { agent_ten: "Xihong", so_doan: "5", so_khach: "100" },
      { agent_ten: "Guo", so_doan: "2", so_khach: "40" },
    ]);
    expect(total).toMatchObject({ soDoan: 7, soKhach: 140 });
  });

  it("NAMED_AGENTS đúng danh sách", () => {
    expect(NAMED_AGENTS).toEqual(["Xihong", "Cola", "Guo"]);
  });
});

// ─── buildSuCoReport ─────────────────────────────────────────────────────────

const agentStats: AgentStatRow[] = [
  { agent_ten: "Xihong", so_doan: 5, so_khach: 100 },
  { agent_ten: "Cola", so_doan: 3, so_khach: 60 },
  { agent_ten: "Other", so_doan: 2, so_khach: 20 },
];

describe("buildSuCoReport", () => {
  it("dựng bảng agent trước (4 nhóm + tổng), kể cả khi không có sự cố", () => {
    const r = buildSuCoReport([], agentStats, {
      from: "2026-05-18", to: "2026-05-24",
      nguoiBaoCao: "Hồ hoài Thương", boPhan: "team nhà hàng – hành trình",
    });
    expect(r.suCoCount).toBe(0);
    expect(r.dataStart).toBe(-1);
    // Tiêu đề
    expect(r.values[0][0]).toBe("TUẦN: 18/05/2026 - 24/05/2026");
    expect(r.values[1][0]).toBe("Người báo cáo: Hồ hoài Thương");
    expect(r.values[2][0]).toBe("Bộ phận: team nhà hàng – hành trình");
    // Bảng agent: chỉ có 1 headerRows (agent), vì không có bảng sự cố
    expect(r.headerRows).toHaveLength(1);
    expect(r.values[r.headerRows[0].row]).toEqual(["Agent", "Số đoàn", "Số khách"]);
    expect(r.headerRows[0].colEnd).toBe(3);
    // 4 dòng agent + dòng tổng
    const agentStart = r.headerRows[0].row + 1;
    expect(r.values[agentStart]).toEqual(["Xihong", 5, 100]);
    expect(r.values[agentStart + 1]).toEqual(["Cola", 3, 60]);
    expect(r.values[agentStart + 2]).toEqual(["Guo", 0, 0]);
    expect(r.values[agentStart + 3]).toEqual(["Khác", 2, 20]); // Other → Khác
    // Dòng tổng
    expect(r.totalRows).toHaveLength(1);
    expect(r.values[r.totalRows[0].row]).toEqual(["TỔNG", 10, 180]);
    expect(r.doanCount).toBe(10);
    // Cuối cùng là dòng "không có sự cố"
    expect(r.values[r.values.length - 1][0]).toContain("Không có phát sinh sự cố");
  });

  it("có sự cố → 2 bảng: agent (headerRows[0]) rồi sự cố (headerRows[1])", () => {
    const r = buildSuCoReport(
      [
        suCoRow({
          log_id: 1, ten_doan: "HAN05BR260519GM", op_ten: "Hà",
          hdv_1: "Mạ.Cường", hdv_2: null, so_khach: 20,
          tieu_de: "Khách hút thuốc trong phòng lạnh",
          noi_dung: "Nhà hàng xông tinh dầu hạn chế mùi",
        }),
      ],
      agentStats,
      { from: "2026-05-18", to: "2026-05-24", nguoiBaoCao: "X", boPhan: "Y" },
    );
    expect(r.suCoCount).toBe(1);
    expect(r.headerRows).toHaveLength(2);
    expect(r.values[r.headerRows[0].row][0]).toBe("Agent");        // bảng 1
    const sucoHeader = r.values[r.headerRows[1].row];
    expect(sucoHeader[0]).toBe("Code");                            // bảng 2
    expect(sucoHeader[5]).toBe("Phương án xử lý");
    expect(r.headerRows[1].colEnd).toBe(SU_CO_COL_COUNT);
    expect(SU_CO_COL_COUNT).toBe(6);

    const row = r.values[r.dataStart];
    expect(row).toEqual([
      "HAN05BR260519GM",
      "Hà",
      "Mạ.Cường",
      20,
      "Khách hút thuốc trong phòng lạnh",
      "Nhà hàng xông tinh dầu hạn chế mùi",
    ]);
    expect(r.dataEnd - r.dataStart).toBe(1);
  });

  it("nguoiBaoCao/boPhan rỗng → hiện '—'; không agent stats → 4 nhóm vẫn 0", () => {
    const r = buildSuCoReport([], [], { from: "2026-05-18", to: "2026-05-24" });
    expect(r.values[1][0]).toBe("Người báo cáo: —");
    expect(r.values[2][0]).toBe("Bộ phận: —");
    const agentStart = r.headerRows[0].row + 1;
    expect(r.values[agentStart]).toEqual(["Xihong", 0, 0]);
    expect(r.values[r.totalRows[0].row]).toEqual(["TỔNG", 0, 0]);
  });
});
