import { describe, it, expect } from "vitest";
import {
  buildSuCoReport,
  joinHdv,
  sortSuCo,
  fmtDate,
  SU_CO_COL_COUNT,
  type SuCoRow,
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

// ─── buildSuCoReport ─────────────────────────────────────────────────────────

describe("buildSuCoReport", () => {
  it("không có sự cố → chỉ tiêu đề + dòng thông báo, không bảng", () => {
    const r = buildSuCoReport([], {
      from: "2026-05-18", to: "2026-05-24",
      nguoiBaoCao: "Hồ hoài Thương", boPhan: "team nhà hàng – hành trình",
    });
    expect(r.suCoCount).toBe(0);
    expect(r.headerRows).toHaveLength(0);
    expect(r.dataStart).toBe(-1);
    expect(r.values[0][0]).toBe("TUẦN: 18/05/2026 - 24/05/2026");
    expect(r.values[1][0]).toBe("Người báo cáo: Hồ hoài Thương");
    expect(r.values[2][0]).toBe("Bộ phận: team nhà hàng – hành trình");
    expect(r.values[r.values.length - 1][0]).toContain("Không có phát sinh sự cố");
  });

  it("dựng đủ header + mỗi sự cố 1 dòng đúng cột", () => {
    const r = buildSuCoReport(
      [
        suCoRow({
          log_id: 1, ten_doan: "HAN05BR260519GM", op_ten: "Hà",
          hdv_1: "Mạ.Cường", hdv_2: null, so_khach: 20,
          tieu_de: "Khách hút thuốc trong phòng lạnh",
          noi_dung: "Nhà hàng xông tinh dầu hạn chế mùi",
          created_at: "2026-05-19T12:00:00Z",
        }),
      ],
      { from: "2026-05-18", to: "2026-05-24", nguoiBaoCao: "X", boPhan: "Y" },
    );
    expect(r.suCoCount).toBe(1);

    const header = r.values[r.headerRows[0].row];
    expect(header[0]).toBe("Code");
    expect(header[5]).toBe("Phương án xử lý");
    expect(r.headerRows[0].colEnd).toBe(SU_CO_COL_COUNT);
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

  it("ghép 2 HDV + so_khach null → 0; gom nhiều sự cố cùng đoàn", () => {
    const r = buildSuCoReport(
      [
        suCoRow({ log_id: 2, ten_doan: "Z", created_at: "2026-05-22T08:00:00Z", tieu_de: "Sự cố 2" }),
        suCoRow({ log_id: 1, ten_doan: "Z", created_at: "2026-05-21T08:00:00Z", tieu_de: "Sự cố 1", hdv_1: "Phú", hdv_2: "An", so_khach: null }),
      ],
      { from: "2026-05-18", to: "2026-05-24" },
    );
    expect(r.suCoCount).toBe(2);
    // Sắp theo created_at → "Sự cố 1" trước.
    expect(r.values[r.dataStart][4]).toBe("Sự cố 1");
    expect(r.values[r.dataStart][2]).toBe("Phú | An");
    expect(r.values[r.dataStart][3]).toBe(0); // so_khach null → 0
  });

  it("nguoiBaoCao/boPhan rỗng → hiện '—'", () => {
    const r = buildSuCoReport([], { from: "2026-05-18", to: "2026-05-24" });
    expect(r.values[1][0]).toBe("Người báo cáo: —");
    expect(r.values[2][0]).toBe("Bộ phận: —");
  });
});
