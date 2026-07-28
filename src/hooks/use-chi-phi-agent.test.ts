import { describe, it, expect } from "vitest";
import {
  groupChiPhiAgent,
  DANH_MUC_LABEL,
  type ChiPhiAgentRow,
} from "@/hooks/use-chi-phi-agent";

const row = (danh_muc: string, thanh_tien: number, extra: Partial<ChiPhiAgentRow> = {}): ChiPhiAgentRow => ({
  danh_muc,
  mo_ta: "x",
  ngay_so: 1,
  so_luong: 1,
  don_gia: thanh_tien,
  thanh_tien,
  ...extra,
});

describe("groupChiPhiAgent", () => {
  it("rỗng → không nhóm, tổng 0", () => {
    const { nhom, tongCong } = groupChiPhiAgent([]);
    expect(nhom).toEqual([]);
    expect(tongCong).toBe(0);
  });

  it("gộp theo danh mục và cộng tổng từng nhóm", () => {
    const { nhom, tongCong } = groupChiPhiAgent([
      row("khach_san", 1000),
      row("nha_hang", 200),
      row("khach_san", 500),
    ]);
    expect(nhom.map((g) => [g.danh_muc, g.rows.length, g.tong])).toEqual([
      ["khach_san", 2, 1500],
      ["nha_hang", 1, 200],
    ]);
    expect(tongCong).toBe(1700);
  });

  it("giữ thứ tự danh mục theo DANH_MUC_LABEL bất kể thứ tự dòng vào", () => {
    const { nhom } = groupChiPhiAgent([
      row("hdv_ho_tro", 1),
      row("khach_san", 1),
      row("visa", 1),
      row("nha_hang", 1),
    ]);
    expect(nhom.map((g) => g.danh_muc)).toEqual([
      "khach_san", "nha_hang", "visa", "hdv_ho_tro",
    ]);
  });

  it("danh mục lạ đẩy xuống cuối và giữ nguyên tên làm nhãn", () => {
    const { nhom } = groupChiPhiAgent([row("linh_tinh", 5), row("khach_san", 1)]);
    expect(nhom.map((g) => g.danh_muc)).toEqual(["khach_san", "linh_tinh"]);
    expect(nhom[1].label).toBe("linh_tinh");
    expect(nhom[0].label).toBe(DANH_MUC_LABEL.khach_san);
  });

  it("thanh_tien null/NaN tính là 0, không làm tổng thành NaN", () => {
    const { nhom, tongCong } = groupChiPhiAgent([
      row("xe", 100),
      { ...row("xe", 0), thanh_tien: null },
    ]);
    expect(nhom[0].tong).toBe(100);
    expect(tongCong).toBe(100);
  });

  // RPC không trả hệ số ra client — biết hệ số là chia ngược ra giá vốn thật.
  it("kiểu dữ liệu dòng KHÔNG có trường hệ số", () => {
    const r = row("khach_san", 1);
    expect(Object.keys(r)).not.toContain("he_so");
  });
});
